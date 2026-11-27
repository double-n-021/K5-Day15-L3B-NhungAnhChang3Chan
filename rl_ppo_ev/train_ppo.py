"""Train PPO on the Hanoi EV Charging Dispatch environment.

Usage:
    python train_ppo.py --total-timesteps 100000 --num-envs 8 --save-dir checkpoints
"""

from __future__ import annotations

import argparse
import csv
import os
import time
from pathlib import Path
from typing import Dict

import numpy as np
import torch

from env import EnvConfig, HanoiEVChargingEnv, VectorizedHanoiEVEnv, heuristic_policy
from ppo import PPOAgent, PPOConfig, RolloutBuffer


def set_seed(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def evaluate_policy(
    policy_fn,
    num_episodes: int = 40,
    seed: int = 10000,
    max_trips: int = 6,
    data_dir: str | None = None,
) -> Dict[str, float]:
    env = HanoiEVChargingEnv(data_dir=data_dir, config=EnvConfig(max_trips=max_trips, seed=seed))
    returns, completions, costs, waits, detours = [], [], [], [], []
    for ep in range(num_episodes):
        obs, info = env.reset(seed=seed + ep)
        done = False
        ep_ret = 0.0
        ep_cost = 0.0
        ep_wait = 0.0
        ep_detour = 0.0
        completed = False
        while not done:
            mask = info["action_mask"]
            action = policy_fn(env, obs, mask)
            obs, r, term, trunc, info = env.step(action)
            done = term or trunc
            ep_ret += r
            ep_cost += info["cost_vnd"]
            ep_wait += info["wait_min"]
            ep_detour += info["detour_km"]
            if done:
                completed = bool(info["completed_shift"])
        returns.append(ep_ret)
        completions.append(1.0 if completed else 0.0)
        costs.append(ep_cost)
        waits.append(ep_wait)
        detours.append(ep_detour)
    return {
        "mean_return": float(np.mean(returns)),
        "std_return": float(np.std(returns)),
        "completion_rate": float(np.mean(completions) * 100.0),
        "mean_cost_vnd": float(np.mean(costs)),
        "mean_wait_min": float(np.mean(waits)),
        "mean_detour_km": float(np.mean(detours)),
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train PyTorch PPO on Hanoi EV Charging Dispatch")
    p.add_argument("--total-timesteps", type=int, default=80_000)
    p.add_argument("--num-envs", type=int, default=8)
    p.add_argument("--num-steps", type=int, default=128)
    p.add_argument("--max-trips", type=int, default=6)
    p.add_argument("--hidden-dim", type=int, default=256)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--gae-lambda", type=float, default=0.95)
    p.add_argument("--clip-eps", type=float, default=0.2)
    p.add_argument("--ent-coef", type=float, default=0.015)
    p.add_argument("--update-epochs", type=int, default=4)
    p.add_argument("--minibatch-size", type=int, default=128)
    p.add_argument("--no-action-mask", action="store_true", help="Disable safety action masking during training")
    p.add_argument("--eval-every", type=int, default=10, help="Evaluate every N PPO updates")
    p.add_argument("--eval-episodes", type=int, default=40)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--data-dir", type=str, default=None, help="Path to data/ folder (e.g. /kaggle/input/hanoi-ev-data)")
    p.add_argument("--save-dir", type=str, default="checkpoints")
    p.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "cuda"])
    return p.parse_args()


def main() -> None:
    args = parse_args()
    set_seed(args.seed)

    if args.device == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(args.device)

    save_dir = Path(args.save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)
    use_mask = not args.no_action_mask

    vec_env = VectorizedHanoiEVEnv(
        num_envs=args.num_envs,
        data_dir=args.data_dir,
        base_seed=args.seed,
        max_trips=args.max_trips,
    )
    ppo_cfg = PPOConfig(
        hidden_dim=args.hidden_dim,
        lr=args.lr,
        gamma=args.gamma,
        gae_lambda=args.gae_lambda,
        clip_eps=args.clip_eps,
        ent_coef=args.ent_coef,
        update_epochs=args.update_epochs,
        minibatch_size=args.minibatch_size,
    )
    agent = PPOAgent(vec_env.obs_dim, vec_env.action_dim, ppo_cfg, device)
    buffer = RolloutBuffer(args.num_steps, args.num_envs, vec_env.obs_dim, vec_env.action_dim, device)

    # Benchmark baselines first
    rng_eval = np.random.default_rng(args.seed + 999)
    rand_stats = evaluate_policy(
        lambda env, obs, mask: int(rng_eval.choice(np.where(mask)[0])),
        num_episodes=args.eval_episodes,
        max_trips=args.max_trips,
        data_dir=args.data_dir,
    )
    heur_stats = evaluate_policy(
        lambda env, obs, mask: heuristic_policy(env, mask),
        num_episodes=args.eval_episodes,
        max_trips=args.max_trips,
        data_dir=args.data_dir,
    )

    print(f"Device: {device} | Obs dim: {vec_env.obs_dim} | Act dim: {vec_env.action_dim} | ActionMask: {use_mask}")
    print(
        f"[Baseline Random   ] Return: {rand_stats['mean_return']:6.2f} | "
        f"Complete: {rand_stats['completion_rate']:5.1f}% | "
        f"Cost: {rand_stats['mean_cost_vnd']:8.0f} VND | Wait: {rand_stats['mean_wait_min']:5.1f}m"
    )
    print(
        f"[Baseline Heuristic] Return: {heur_stats['mean_return']:6.2f} | "
        f"Complete: {heur_stats['completion_rate']:5.1f}% | "
        f"Cost: {heur_stats['mean_cost_vnd']:8.0f} VND | Wait: {heur_stats['mean_wait_min']:5.1f}m"
    )
    print("-" * 105)

    batch_size = args.num_envs * args.num_steps
    num_updates = max(1, args.total_timesteps // batch_size)

    obs, mask = vec_env.reset()
    best_eval_return = -float("inf")
    start_time = time.time()

    metrics_path = save_dir / "metrics.csv"
    with open(metrics_path, "w", newline="", encoding="utf-8") as csv_f:
        writer = csv.writer(csv_f)
        writer.writerow(
            [
                "update",
                "global_step",
                "eval_return",
                "completion_rate",
                "mean_cost_vnd",
                "mean_wait_min",
                "mean_detour_km",
                "pg_loss",
                "v_loss",
                "entropy",
                "approx_kl",
            ]
        )

        for update in range(1, num_updates + 1):
            # Linear LR annealing
            frac = 1.0 - (update - 1.0) / num_updates
            for pg in agent.optimizer.param_groups:
                pg["lr"] = max(1e-5, frac * args.lr)

            for step in range(args.num_steps):
                obs_t = torch.as_tensor(obs, dtype=torch.float32, device=device)
                mask_t = torch.as_tensor(mask, dtype=torch.bool, device=device)
                actions, log_probs, values = agent.act(obs, mask if use_mask else None, deterministic=False)
                next_obs, rewards, dones, next_mask, _ = vec_env.step(actions)
                buffer.store(
                    step,
                    obs_t,
                    mask_t,
                    torch.as_tensor(actions, dtype=torch.long, device=device),
                    log_probs,
                    rewards,
                    dones,
                    values,
                )
                obs, mask = next_obs, next_mask

            with torch.no_grad():
                next_value = agent.net.get_value(torch.as_tensor(obs, dtype=torch.float32, device=device))
            buffer.compute_gae(next_value, ppo_cfg.gamma, ppo_cfg.gae_lambda)
            train_info = agent.update(buffer, use_action_mask=use_mask)

            global_step = update * batch_size
            if update == 1 or update % args.eval_every == 0 or update == num_updates:
                def ppo_eval_fn(env, o, m):
                    a, _, _ = agent.act(o[None, :], m[None, :] if use_mask else None, deterministic=True)
                    return int(a[0])

                ev = evaluate_policy(
                    ppo_eval_fn,
                    num_episodes=args.eval_episodes,
                    max_trips=args.max_trips,
                    data_dir=args.data_dir,
                )
                sps = int(global_step / max(1e-6, time.time() - start_time))
                print(
                    f"Upd {update:4d}/{num_updates} | Step {global_step:7d} ({sps:5d} sps) | "
                    f"Ret {ev['mean_return']:6.2f} | Comp {ev['completion_rate']:5.1f}% | "
                    f"Cost {ev['mean_cost_vnd']:7.0f} | Wait {ev['mean_wait_min']:4.1f}m | "
                    f"Ent {train_info['entropy']:.3f} | KL {train_info['approx_kl']:.4f}"
                )
                writer.writerow(
                    [
                        update,
                        global_step,
                        round(ev["mean_return"], 4),
                        round(ev["completion_rate"], 2),
                        round(ev["mean_cost_vnd"], 1),
                        round(ev["mean_wait_min"], 2),
                        round(ev["mean_detour_km"], 2),
                        round(train_info["pg_loss"], 5),
                        round(train_info["v_loss"], 5),
                        round(train_info["entropy"], 4),
                        round(train_info["approx_kl"], 5),
                    ]
                )
                csv_f.flush()

                if ev["mean_return"] > best_eval_return:
                    best_eval_return = ev["mean_return"]
                    agent.save(
                        str(save_dir / "best_ppo.pt"),
                        extra={"obs_dim": vec_env.obs_dim, "action_dim": vec_env.action_dim, "best_return": best_eval_return},
                    )

    agent.save(
        str(save_dir / "final_ppo.pt"),
        extra={"obs_dim": vec_env.obs_dim, "action_dim": vec_env.action_dim, "best_return": best_eval_return},
    )
    print("-" * 105)
    print(f"Done! Best PPO eval return: {best_eval_return:.2f} (Heuristic: {heur_stats['mean_return']:.2f})")
    print(f"Saved checkpoints and metrics to: {save_dir.resolve()}")


if __name__ == "__main__":
    main()
