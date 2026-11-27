"""Evaluate a trained PPO checkpoint against Heuristic and Random baselines,
and print a sample shift trajectory in Hanoi.

Usage:
    python eval_ppo.py --checkpoint checkpoints/best_ppo.pt --episodes 100
"""

from __future__ import annotations

import argparse
import numpy as np
import torch

from env import EnvConfig, HanoiEVChargingEnv, heuristic_policy
from ppo import PPOAgent, PPOConfig
from train_ppo import evaluate_policy


def main() -> None:
    p = argparse.ArgumentParser(description="Evaluate trained PPO model on Hanoi EV Charging Dispatch")
    p.add_argument("--checkpoint", type=str, default="checkpoints/best_ppo.pt")
    p.add_argument("--episodes", type=int, default=100)
    p.add_argument("--max-trips", type=int, default=6)
    p.add_argument("--data-dir", type=str, default=None, help="Path to data/ folder")
    p.add_argument("--seed", type=int, default=20000)
    args = p.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    env = HanoiEVChargingEnv(data_dir=args.data_dir, config=EnvConfig(max_trips=args.max_trips, seed=args.seed))

    ckpt = torch.load(args.checkpoint, map_location=device, weights_only=False)
    cfg_dict = ckpt.get("config", {})
    cfg = PPOConfig(**{k: v for k, v in cfg_dict.items() if k in PPOConfig.__dataclass_fields__})
    agent = PPOAgent(env.obs_dim, env.action_dim, cfg, device)
    agent.load(args.checkpoint)
    agent.net.eval()

    rng = np.random.default_rng(args.seed + 1)
    rand_stats = evaluate_policy(
        lambda e, o, m: int(rng.choice(np.where(m)[0])),
        num_episodes=args.episodes,
        seed=args.seed,
        max_trips=args.max_trips,
        data_dir=args.data_dir,
    )
    heur_stats = evaluate_policy(
        lambda e, o, m: heuristic_policy(e, m),
        num_episodes=args.episodes,
        seed=args.seed,
        max_trips=args.max_trips,
        data_dir=args.data_dir,
    )
    ppo_stats = evaluate_policy(
        lambda e, o, m: int(agent.act(o[None, :], m[None, :], deterministic=True)[0][0]),
        num_episodes=args.episodes,
        seed=args.seed,
        max_trips=args.max_trips,
        data_dir=args.data_dir,
    )

    print(f"Evaluation over {args.episodes} shifts (max {args.max_trips} trips/shift):")
    print(f"{'Policy':<14} | {'Return':>8} | {'Complete':>8} | {'Cost (VND)':>11} | {'Wait (m)':>8} | {'Detour (km)':>11}")
    print("-" * 74)
    for name, s in [("Random", rand_stats), ("Heuristic", heur_stats), ("PPO (trained)", ppo_stats)]:
        print(
            f"{name:<14} | {s['mean_return']:8.2f} | {s['completion_rate']:7.1f}% | "
            f"{s['mean_cost_vnd']:11.0f} | {s['mean_wait_min']:8.1f} | {s['mean_detour_km']:11.2f}"
        )

    # Print one sample trajectory
    print("\n--- Sample PPO Shift Trajectory ---")
    obs, info = env.reset(seed=args.seed)
    print(f"Start: {info['origin']} | SoC: {info['soc']*100:.0f}% | Hour: {info['hour']:.1f}h")
    done = False
    step_i = 1
    while not done:
        mask = info["action_mask"]
        action = int(agent.act(obs[None, :], mask[None, :], deterministic=True)[0][0])
        obs, r, term, trunc, info = env.step(action)
        done = term or trunc
        print(
            f"  Trip {step_i}: {info['origin']} -> {info['destination']} | "
            f"Action: [{info['station_id']}] {info['station_name']} | "
            f"SoC after: {info['soc']*100:.0f}% | Wait: {info['wait_min']:.0f}m | "
            f"Cost: {info['cost_vnd']:.0f} VND | R: {r:+.2f}"
        )
        step_i += 1


if __name__ == "__main__":
    main()
