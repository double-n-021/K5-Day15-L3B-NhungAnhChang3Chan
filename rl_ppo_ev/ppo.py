"""Pure PyTorch PPO (Proximal Policy Optimization) with Action Masking & GAE-lambda.

Clean Actor-Critic architecture that can also be easily extended to A3C/A2C
(same ActorCritic network, multi-worker gradient sync) or compared against TD3.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.distributions import Categorical


def _ortho_init(layer: nn.Linear, std: float = np.sqrt(2.0), bias_const: float = 0.0) -> nn.Linear:
    nn.init.orthogonal_(layer.weight, std)
    nn.init.constant_(layer.bias, bias_const)
    return layer


class ActorCritic(nn.Module):
    """Separate-trunk MLP Actor-Critic with action masking support."""

    def __init__(self, obs_dim: int, action_dim: int, hidden_dim: int = 256):
        super().__init__()
        self.actor = nn.Sequential(
            _ortho_init(nn.Linear(obs_dim, hidden_dim)),
            nn.LayerNorm(hidden_dim),
            nn.Tanh(),
            _ortho_init(nn.Linear(hidden_dim, hidden_dim)),
            nn.LayerNorm(hidden_dim),
            nn.Tanh(),
            _ortho_init(nn.Linear(hidden_dim, action_dim), std=0.01),
        )
        self.critic = nn.Sequential(
            _ortho_init(nn.Linear(obs_dim, hidden_dim)),
            nn.LayerNorm(hidden_dim),
            nn.Tanh(),
            _ortho_init(nn.Linear(hidden_dim, hidden_dim)),
            nn.LayerNorm(hidden_dim),
            nn.Tanh(),
            _ortho_init(nn.Linear(hidden_dim, 1), std=1.0),
        )

    def get_value(self, obs: torch.Tensor) -> torch.Tensor:
        return self.critic(obs).squeeze(-1)

    def get_action_and_value(
        self,
        obs: torch.Tensor,
        action_mask: Optional[torch.Tensor] = None,
        action: Optional[torch.Tensor] = None,
        deterministic: bool = False,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        logits = self.actor(obs)
        if action_mask is not None:
            logits = logits.masked_fill(~action_mask, -1e9)
        dist = Categorical(logits=logits)
        if action is None:
            action = torch.argmax(logits, dim=-1) if deterministic else dist.sample()
        log_prob = dist.log_prob(action)
        entropy = dist.entropy()
        value = self.critic(obs).squeeze(-1)
        return action, log_prob, entropy, value


@dataclass
class PPOConfig:
    hidden_dim: int = 256
    lr: float = 3e-4
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_eps: float = 0.2
    vf_coef: float = 0.5
    ent_coef: float = 0.015
    max_grad_norm: float = 0.5
    update_epochs: int = 4
    minibatch_size: int = 128
    clip_vloss: bool = True
    target_kl: Optional[float] = 0.03


class RolloutBuffer:
    """Stores parallel trajectories of shape (num_steps, num_envs, ...) and computes GAE."""

    def __init__(self, num_steps: int, num_envs: int, obs_dim: int, action_dim: int, device: torch.device):
        self.num_steps = num_steps
        self.num_envs = num_envs
        self.device = device

        self.obs = torch.zeros((num_steps, num_envs, obs_dim), dtype=torch.float32, device=device)
        self.masks = torch.ones((num_steps, num_envs, action_dim), dtype=torch.bool, device=device)
        self.actions = torch.zeros((num_steps, num_envs), dtype=torch.long, device=device)
        self.log_probs = torch.zeros((num_steps, num_envs), dtype=torch.float32, device=device)
        self.rewards = torch.zeros((num_steps, num_envs), dtype=torch.float32, device=device)
        self.dones = torch.zeros((num_steps, num_envs), dtype=torch.float32, device=device)
        self.values = torch.zeros((num_steps, num_envs), dtype=torch.float32, device=device)

        self.advantages = torch.zeros((num_steps, num_envs), dtype=torch.float32, device=device)
        self.returns = torch.zeros((num_steps, num_envs), dtype=torch.float32, device=device)

    def store(
        self,
        step: int,
        obs: torch.Tensor,
        mask: torch.Tensor,
        action: torch.Tensor,
        log_prob: torch.Tensor,
        reward: np.ndarray,
        done: np.ndarray,
        value: torch.Tensor,
    ) -> None:
        self.obs[step] = obs
        self.masks[step] = mask
        self.actions[step] = action
        self.log_probs[step] = log_prob
        self.rewards[step] = torch.as_tensor(reward, dtype=torch.float32, device=self.device)
        self.dones[step] = torch.as_tensor(done, dtype=torch.float32, device=self.device)
        self.values[step] = value

    def compute_gae(self, next_value: torch.Tensor, gamma: float, gae_lambda: float) -> None:
        last_gae = torch.zeros(self.num_envs, dtype=torch.float32, device=self.device)
        for t in reversed(range(self.num_steps)):
            if t == self.num_steps - 1:
                next_nonterminal = 1.0 - self.dones[t]
                next_val = next_value
            else:
                next_nonterminal = 1.0 - self.dones[t]
                next_val = self.values[t + 1]
            delta = self.rewards[t] + gamma * next_val * next_nonterminal - self.values[t]
            last_gae = delta + gamma * gae_lambda * next_nonterminal * last_gae
            self.advantages[t] = last_gae
        self.returns = self.advantages + self.values


class PPOAgent:
    """PPO trainer wrapping ActorCritic + Adam optimizer + clipped surrogate updates."""

    def __init__(self, obs_dim: int, action_dim: int, config: PPOConfig, device: torch.device):
        self.cfg = config
        self.device = device
        self.net = ActorCritic(obs_dim, action_dim, hidden_dim=config.hidden_dim).to(device)
        self.optimizer = torch.optim.Adam(self.net.parameters(), lr=config.lr, eps=1e-5)

    @torch.no_grad()
    def act(
        self, obs: np.ndarray, action_mask: Optional[np.ndarray] = None, deterministic: bool = False
    ) -> Tuple[np.ndarray, torch.Tensor, torch.Tensor]:
        obs_t = torch.as_tensor(obs, dtype=torch.float32, device=self.device)
        mask_t = torch.as_tensor(action_mask, dtype=torch.bool, device=self.device) if action_mask is not None else None
        action, log_prob, _, value = self.net.get_action_and_value(obs_t, action_mask=mask_t, deterministic=deterministic)
        return action.cpu().numpy(), log_prob, value

    def update(self, buffer: RolloutBuffer, use_action_mask: bool = True) -> Dict[str, float]:
        b_obs = buffer.obs.reshape(-1, buffer.obs.shape[-1])
        b_masks = buffer.masks.reshape(-1, buffer.masks.shape[-1])
        b_actions = buffer.actions.reshape(-1)
        b_log_probs = buffer.log_probs.reshape(-1)
        b_advantages = buffer.advantages.reshape(-1)
        b_returns = buffer.returns.reshape(-1)
        b_values = buffer.values.reshape(-1)

        batch_size = b_obs.shape[0]
        minibatch_size = min(self.cfg.minibatch_size, batch_size)
        indices = np.arange(batch_size)

        pg_losses, v_losses, entropies, kls, clip_fracs = [], [], [], [], []

        for _ in range(self.cfg.update_epochs):
            np.random.shuffle(indices)
            for start in range(0, batch_size, minibatch_size):
                mb_idx = indices[start : start + minibatch_size]
                mb_mask = b_masks[mb_idx] if use_action_mask else None
                _, new_log_prob, entropy, new_value = self.net.get_action_and_value(
                    b_obs[mb_idx], action_mask=mb_mask, action=b_actions[mb_idx]
                )
                log_ratio = new_log_prob - b_log_probs[mb_idx]
                ratio = log_ratio.exp()

                with torch.no_grad():
                    approx_kl = ((ratio - 1.0) - log_ratio).mean().item()
                    clip_frac = ((ratio - 1.0).abs() > self.cfg.clip_eps).float().mean().item()

                mb_adv = b_advantages[mb_idx]
                if mb_adv.numel() > 1:
                    mb_adv = (mb_adv - mb_adv.mean()) / (mb_adv.std() + 1e-8)

                pg_loss1 = -mb_adv * ratio
                pg_loss2 = -mb_adv * torch.clamp(ratio, 1.0 - self.cfg.clip_eps, 1.0 + self.cfg.clip_eps)
                pg_loss = torch.max(pg_loss1, pg_loss2).mean()

                if self.cfg.clip_vloss:
                    v_loss_unclipped = (new_value - b_returns[mb_idx]) ** 2
                    v_clipped = b_values[mb_idx] + torch.clamp(
                        new_value - b_values[mb_idx], -self.cfg.clip_eps, self.cfg.clip_eps
                    )
                    v_loss_clipped = (v_clipped - b_returns[mb_idx]) ** 2
                    v_loss = 0.5 * torch.max(v_loss_unclipped, v_loss_clipped).mean()
                else:
                    v_loss = 0.5 * ((new_value - b_returns[mb_idx]) ** 2).mean()

                ent_loss = entropy.mean()
                loss = pg_loss + self.cfg.vf_coef * v_loss - self.cfg.ent_coef * ent_loss

                self.optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.net.parameters(), self.cfg.max_grad_norm)
                self.optimizer.step()

                pg_losses.append(pg_loss.item())
                v_losses.append(v_loss.item())
                entropies.append(ent_loss.item())
                kls.append(approx_kl)
                clip_fracs.append(clip_frac)

            if self.cfg.target_kl is not None and np.mean(kls[-max(1, batch_size // minibatch_size) :]) > self.cfg.target_kl:
                break

        return {
            "pg_loss": float(np.mean(pg_losses)),
            "v_loss": float(np.mean(v_losses)),
            "entropy": float(np.mean(entropies)),
            "approx_kl": float(np.mean(kls)),
            "clip_frac": float(np.mean(clip_fracs)),
        }

    def save(self, path: str, extra: Optional[dict] = None) -> None:
        payload = {
            "model_state_dict": self.net.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "config": self.cfg.__dict__,
        }
        if extra:
            payload.update(extra)
        torch.save(payload, path)

    def load(self, path: str) -> dict:
        ckpt = torch.load(path, map_location=self.device, weights_only=False)
        self.net.load_state_dict(ckpt["model_state_dict"])
        if "optimizer_state_dict" in ckpt:
            self.optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        return ckpt
