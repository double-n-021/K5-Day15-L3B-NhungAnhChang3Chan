"""Hanoi EV Charging Dispatch RL Environment.

Grounded in the real Hanoi EV dataset from:
  K5-Day15-L3B-NhungAnhChang3Chan/data/
    - hanoi_stations.json (32 car charging stations)
    - hanoi_landmarks.json (16 Hanoi landmarks)
    - ev_models.json (VinFast VF e34 specs)
    - weather_fallback.json (168h Hanoi weather)

Episode:
  A multi-trip shift (default 6 trips) for an EV driver in Hanoi.
  At each step, the agent decides whether to:
    - action 0..N-1: detour to station `i`, wait in queue, charge to target SoC, then go to destination
    - action N (SKIP_CHARGE): drive directly to destination without charging
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

ROAD_FACTOR = 1.3
SAFETY_MARGIN = 0.8
RESCUE_SOC = 0.15
DEFAULT_TARGET_SOC = 0.80
MAX_ROAD_KM = 15.0
AVG_SPEED_KMH = 26.0  # Hanoi urban average speed
PEAK_START, PEAK_END = 17.5, 22.5  # Mon-Sat peak window


def _default_data_dir() -> Path:
    here = Path(__file__).resolve().parent
    for candidate in (
        here / "data",
        here.parent / "K5-Day15-L3B-NhungAnhChang3Chan" / "data",
    ):
        if (candidate / "hanoi_stations.json").exists():
            return candidate
    raise FileNotFoundError(
        f"Could not find Hanoi EV data directory (checked {here / 'data'}). "
        "Pass data_dir explicitly to HanoiEVChargingEnv."
    )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.radians
    a = (
        math.sin(r(lat2 - lat1) / 2.0) ** 2
        + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2.0) ** 2
    )
    return 2.0 * 6371.0 * math.asin(math.sqrt(min(1.0, a)))


def road_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversine_km(lat1, lon1, lat2, lon2) * ROAD_FACTOR


def is_peak_hour(hour: float, weekday: int) -> bool:
    return weekday != 6 and (PEAK_START <= (hour % 24.0) < PEAK_END)


def station_price_vnd(station: dict, hour: float, weekday: int) -> float:
    if station.get("pricing_model") == "flat_vgreen":
        return float(station.get("flat_price_vnd", 3858))
    h = hour % 24.0
    if is_peak_hour(h, weekday) or (weekday != 6 and 9.5 <= h < 11.5):
        return float(station.get("peak_vnd", 4212))
    if h >= 22.0 or h < 4.0:
        return float(station.get("off_peak_vnd", 1620))
    return float(station.get("normal_vnd", 2700))


@dataclass
class EnvConfig:
    max_trips: int = 6
    target_soc: float = DEFAULT_TARGET_SOC
    use_action_mask: bool = True
    seed: int = 42


class HanoiEVChargingEnv:
    """Single-agent Gymnasium-style environment for Hanoi EV charging dispatch."""

    def __init__(self, data_dir: Optional[str | Path] = None, config: Optional[EnvConfig] = None):
        self.data_dir = Path(data_dir) if data_dir is not None else _default_data_dir()
        self.cfg = config or EnvConfig()
        self.rng = np.random.default_rng(self.cfg.seed)

        with open(self.data_dir / "hanoi_stations.json", encoding="utf-8") as f:
            self.stations: List[dict] = json.load(f)
        with open(self.data_dir / "hanoi_landmarks.json", encoding="utf-8") as f:
            self.landmarks: List[dict] = json.load(f)
        with open(self.data_dir / "ev_models.json", encoding="utf-8") as f:
            models = json.load(f)
            self.ev = next(m for m in models if m.get("vehicle_type") == "o_to")
        with open(self.data_dir / "weather_fallback.json", encoding="utf-8") as f:
            w = json.load(f).get("hourly", {})
            self.weather_temps = w.get("temperature_2m", [22.0] * 168)
            self.weather_rains = w.get("precipitation_probability", [0.0] * 168)

        self.num_stations = len(self.stations)
        self.skip_action = self.num_stations
        self.action_dim = self.num_stations + 1

        # Precompute station coordinates for fast vectorized distance computation
        self._st_lats = np.array([s["lat"] for s in self.stations], dtype=np.float32)
        self._st_lons = np.array([s["lon"] for s in self.stations], dtype=np.float32)
        self._st_maint = np.array([s.get("base_status") == "maintenance" for s in self.stations], dtype=bool)
        self._st_crowded = np.array([s.get("base_status") == "crowded" for s in self.stations], dtype=bool)
        self._st_base_q = np.array([s.get("base_queue", 0) for s in self.stations], dtype=np.float32)
        self._st_power = np.array([s.get("power_kw", 60) for s in self.stations], dtype=np.float32)
        self._st_ports = np.array([s.get("ports_total", 4) for s in self.stations], dtype=np.float32)
        self._st_roof = np.array([1.0 if s.get("has_roof", False) else 0.0 for s in self.stations], dtype=np.float32)

        # Observation: 15 global features + num_stations * 9 station features
        self.global_dim = 15
        self.station_feat_dim = 9
        self.obs_dim = self.global_dim + self.num_stations * self.station_feat_dim

        # Episode state
        self.step_idx = 0
        self.soc = 0.5
        self.hour = 9.0
        self.weekday = 0
        self.weather_day_offset = 0
        self.cur_lm_idx = 0
        self.dest_lm_idx = 1
        self._cur_queues = np.zeros(self.num_stations, dtype=np.float32)

    def seed(self, seed: int) -> None:
        self.rng = np.random.default_rng(seed)

    def _get_weather(self) -> Tuple[float, float, float]:
        idx = (self.weather_day_offset * 24 + int(self.hour) % 24) % len(self.weather_temps)
        temp_c = float(self.weather_temps[idx])
        rain_pct = float(self.weather_rains[idx]) if idx < len(self.weather_rains) else 0.0
        drain = 1.0
        if temp_c <= 15.0:
            drain += 0.15
        elif temp_c >= 36.0:
            drain += 0.10
        if rain_pct >= 70.0:
            drain += 0.05
        return temp_c, rain_pct, drain

    def _sample_queues(self) -> np.ndarray:
        peak = is_peak_hour(self.hour, self.weekday)
        mult = 1.8 if peak else 1.0
        mean_q = np.where(self._st_maint, 0.0, self._st_base_q * mult + (0.6 if peak else 0.2))
        noise = self.rng.poisson(np.maximum(mean_q, 0.05)).astype(np.float32)
        return np.where(self._st_maint, 0.0, noise)

    def _safe_range_km(self, drain_factor: float) -> float:
        return (self.soc * float(self.ev["range_km"]) / drain_factor) * SAFETY_MARGIN

    def _max_range_km(self, drain_factor: float) -> float:
        return self.soc * float(self.ev["range_km"]) / drain_factor

    def _sample_next_dest(self, cur_idx: int) -> int:
        candidates = [i for i in range(len(self.landmarks)) if i != cur_idx]
        return int(self.rng.choice(candidates))

    def get_action_mask(self) -> np.ndarray:
        """Return boolean mask of shape (action_dim,) where True = safe/valid action."""
        mask = np.zeros(self.action_dim, dtype=bool)
        _, _, drain = self._get_weather()
        safe_km = self._safe_range_km(drain)
        cur = self.landmarks[self.cur_lm_idx]
        dest = self.landmarks[self.dest_lm_idx]
        trip_km = road_km(cur["lat"], cur["lon"], dest["lat"], dest["lon"])

        rescue = self.soc < RESCUE_SOC
        cap = safe_km if rescue else min(safe_km, MAX_ROAD_KM)

        dists = np.array(
            [road_km(cur["lat"], cur["lon"], float(self._st_lats[i]), float(self._st_lons[i])) for i in range(self.num_stations)],
            dtype=np.float32,
        )

        for i in range(self.num_stations):
            if not self._st_maint[i] and dists[i] <= cap + 1e-6:
                mask[i] = True

        # Skip charge is valid if remaining SoC after direct trip >= 10%
        soc_needed = trip_km * drain / float(self.ev["range_km"])
        if self.soc - soc_needed >= 0.10:
            mask[self.skip_action] = True

        # Fallback: always ensure at least one valid action (nearest non-maintenance station)
        if not mask.any():
            non_maint = np.where(~self._st_maint)[0]
            nearest = non_maint[int(np.argmin(dists[non_maint]))]
            mask[nearest] = True

        return mask

    def _get_obs(self) -> np.ndarray:
        temp_c, rain_pct, drain = self._get_weather()
        safe_km = self._safe_range_km(drain)
        cur = self.landmarks[self.cur_lm_idx]
        dest = self.landmarks[self.dest_lm_idx]
        trip_km = road_km(cur["lat"], cur["lon"], dest["lat"], dest["lon"])
        peak = 1.0 if is_peak_hour(self.hour, self.weekday) else 0.0
        angle = 2.0 * math.pi * (self.hour % 24.0) / 24.0

        # Normalize Hanoi lat/lon around city center (21.0285, 105.8542)
        cur_lat_n = (cur["lat"] - 21.0285) / 0.15
        cur_lon_n = (cur["lon"] - 105.8542) / 0.15

        global_feats = np.array(
            [
                self.soc,
                self.cfg.target_soc,
                1.0 if self.soc < RESCUE_SOC else 0.0,
                min(safe_km / 300.0, 1.5),
                min(trip_km / 30.0, 2.0),
                math.sin(angle),
                math.cos(angle),
                1.0 if self.weekday == 6 else 0.0,
                peak,
                temp_c / 40.0,
                rain_pct / 100.0,
                drain - 1.0,
                cur_lat_n,
                cur_lon_n,
                self.step_idx / max(1, self.cfg.max_trips),
            ],
            dtype=np.float32,
        )

        st_feats = np.zeros((self.num_stations, self.station_feat_dim), dtype=np.float32)
        max_dc = float(self.ev.get("max_dc_kw", 60.0))
        for i, st in enumerate(self.stations):
            d_to = road_km(cur["lat"], cur["lon"], st["lat"], st["lon"])
            d_from = road_km(st["lat"], st["lon"], dest["lat"], dest["lon"])
            detour = max(0.0, d_to + d_from - trip_km)
            reachable = 1.0 if (not self._st_maint[i] and d_to <= safe_km) else 0.0
            eff_kw = min(float(self._st_power[i]), max_dc) * 0.85
            price = station_price_vnd(st, self.hour, self.weekday)
            st_feats[i] = [
                min(d_to / 20.0, 2.0),
                min(detour / 20.0, 2.0),
                reachable,
                1.0 if self._st_maint[i] else 0.0,
                eff_kw / 60.0,
                min(float(self._cur_queues[i]) / 8.0, 1.5),
                price / 5000.0,
                float(self._st_roof[i]),
                float(self._st_ports[i]) / 12.0,
            ]

        return np.concatenate([global_feats, st_feats.reshape(-1)], axis=0)

    def reset(self, seed: Optional[int] = None) -> Tuple[np.ndarray, Dict]:
        if seed is not None:
            self.seed(seed)
        self.step_idx = 0
        self.soc = float(self.rng.uniform(0.12, 0.70))
        self.hour = float(self.rng.uniform(6.5, 20.5))
        self.weekday = int(self.rng.integers(0, 7))
        self.weather_day_offset = int(self.rng.integers(0, 7))
        self.cur_lm_idx = int(self.rng.integers(0, len(self.landmarks)))
        self.dest_lm_idx = self._sample_next_dest(self.cur_lm_idx)
        self._cur_queues = self._sample_queues()

        obs = self._get_obs()
        info = {
            "action_mask": self.get_action_mask(),
            "soc": self.soc,
            "hour": self.hour,
            "origin": self.landmarks[self.cur_lm_idx]["name"],
            "destination": self.landmarks[self.dest_lm_idx]["name"],
        }
        return obs, info

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        temp_c, rain_pct, drain = self._get_weather()
        cur = self.landmarks[self.cur_lm_idx]
        dest = self.landmarks[self.dest_lm_idx]
        trip_km = road_km(cur["lat"], cur["lon"], dest["lat"], dest["lon"])
        range_km = float(self.ev["range_km"])
        batt_kwh = float(self.ev["battery_kwh"])
        max_dc = float(self.ev.get("max_dc_kw", 60.0))

        cost_vnd = 0.0
        wait_min = 0.0
        charge_min = 0.0
        detour_km = 0.0
        stranded = False
        picked_maint = False
        peak_charge_penalty = 0.0
        roof_penalty = 0.0
        station_id = "SKIP"
        station_name = "Không sạc (đi thẳng)"

        if action == self.skip_action:
            drive_hours = trip_km / AVG_SPEED_KMH
            soc_used = trip_km * drain / range_km
            self.soc -= soc_used
            self.hour = (self.hour + drive_hours + 0.25) % 24.0
            if self.soc <= 0.0:
                stranded = True
                self.soc = 0.0
                reward = -10.0
            else:
                reward = 1.5 - 0.8 * drive_hours
                if self.soc < 0.08:
                    reward -= 1.0  # dangerously low arrival SoC
        else:
            st = self.stations[action]
            station_id = st["id"]
            station_name = st["name"]
            d_to = road_km(cur["lat"], cur["lon"], st["lat"], st["lon"])
            d_from = road_km(st["lat"], st["lon"], dest["lat"], dest["lon"])
            detour_km = max(0.0, d_to + d_from - trip_km)

            soc_to_station = d_to * drain / range_km
            if self._st_maint[action]:
                picked_maint = True
                reward = -10.0
                stranded = True
            elif self.soc - soc_to_station <= 0.0:
                stranded = True
                self.soc = 0.0
                reward = -10.0
            else:
                soc_at_station = self.soc - soc_to_station
                rescue_mode = self.soc < RESCUE_SOC
                drive_to_h = d_to / AVG_SPEED_KMH
                eta_hour = (self.hour + drive_to_h) % 24.0

                # Queue waiting time at ETA
                q = float(self._cur_queues[action])
                ports = max(1.0, float(self._st_ports[action]))
                wait_h = (q * 0.28) / max(1.0, ports * 0.5)
                wait_min = wait_h * 60.0

                # Charging time & electricity cost
                target = max(self.cfg.target_soc, soc_at_station + 0.05)
                target = min(target, 0.95)
                gain_soc = max(0.0, target - soc_at_station)
                kwh_added = gain_soc * batt_kwh
                eff_kw = min(float(self._st_power[action]), max_dc) * 0.85
                charge_h = (kwh_added / max(eff_kw, 5.0)) + (5.0 / 60.0)
                charge_min = charge_h * 60.0

                unit_price = station_price_vnd(st, eta_hour, self.weekday)
                cost_vnd = kwh_added * unit_price

                if is_peak_hour(eta_hour, self.weekday) and not rescue_mode:
                    peak_charge_penalty = 0.6
                if rain_pct >= 50.0 and not st.get("has_roof", False):
                    roof_penalty = 0.15

                # Drive from station to destination
                drive_from_h = d_from / AVG_SPEED_KMH
                soc_to_dest = d_from * drain / range_km
                self.soc = target - soc_to_dest
                total_h = drive_to_h + wait_h + charge_h + drive_from_h
                self.hour = (self.hour + total_h + 0.25) % 24.0

                if self.soc <= 0.0:
                    stranded = True
                    self.soc = 0.0
                    reward = -10.0
                else:
                    reward = (
                        1.5
                        - 0.12 * detour_km
                        - 1.2 * total_h
                        - 0.008 * (cost_vnd / 1000.0)
                        - peak_charge_penalty
                        - roof_penalty
                    )

        self.step_idx += 1
        terminated = stranded or picked_maint
        truncated = (not terminated) and (self.step_idx >= self.cfg.max_trips)

        if not (terminated or truncated):
            self.cur_lm_idx = self.dest_lm_idx
            self.dest_lm_idx = self._sample_next_dest(self.cur_lm_idx)
            self._cur_queues = self._sample_queues()

        obs = self._get_obs()
        info = {
            "action_mask": self.get_action_mask(),
            "station_id": station_id,
            "station_name": station_name,
            "soc": round(self.soc, 3),
            "hour": round(self.hour, 2),
            "cost_vnd": round(cost_vnd, 0),
            "wait_min": round(wait_min, 1),
            "charge_min": round(charge_min, 1),
            "detour_km": round(detour_km, 2),
            "stranded": stranded,
            "picked_maint": picked_maint,
            "completed_shift": truncated and not stranded,
            "origin": cur["name"],
            "destination": dest["name"],
        }
        return obs, float(reward), terminated, truncated, info


class VectorizedHanoiEVEnv:
    """Synchronous vectorized wrapper for parallel rollout collection (PPO / A2C / A3C-style)."""

    def __init__(self, num_envs: int, data_dir: Optional[str | Path] = None, base_seed: int = 42, max_trips: int = 6):
        self.num_envs = num_envs
        self.envs = [
            HanoiEVChargingEnv(
                data_dir=data_dir,
                config=EnvConfig(max_trips=max_trips, seed=base_seed + i * 1000),
            )
            for i in range(num_envs)
        ]
        self.obs_dim = self.envs[0].obs_dim
        self.action_dim = self.envs[0].action_dim

    def reset(self) -> Tuple[np.ndarray, np.ndarray]:
        obs_list, mask_list = [], []
        for env in self.envs:
            o, info = env.reset()
            obs_list.append(o)
            mask_list.append(info["action_mask"])
        return np.stack(obs_list, axis=0), np.stack(mask_list, axis=0)

    def step(self, actions: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, List[Dict]]:
        obs_list, rewards, dones, masks, infos = [], [], [], [], []
        for i, env in enumerate(self.envs):
            o, r, term, trunc, info = env.step(int(actions[i]))
            done = term or trunc
            if done:
                info["terminal_soc"] = info["soc"]
                o, reset_info = env.reset()
                mask = reset_info["action_mask"]
            else:
                mask = info["action_mask"]
            obs_list.append(o)
            rewards.append(r)
            dones.append(done)
            masks.append(mask)
            infos.append(info)
        return (
            np.stack(obs_list, axis=0),
            np.array(rewards, dtype=np.float32),
            np.array(dones, dtype=np.float32),
            np.stack(masks, axis=0),
            infos,
        )


def heuristic_policy(env: HanoiEVChargingEnv, mask: np.ndarray) -> int:
    """Rule-based baseline matching codebase/tools.py station ranking."""
    # If safe to skip charge and SoC > 30%, skip charging
    if mask[env.skip_action] and env.soc >= 0.30:
        return env.skip_action

    cur = env.landmarks[env.cur_lm_idx]
    rescue = env.soc < RESCUE_SOC
    best_act = None
    best_score = float("inf")
    for i in range(env.num_stations):
        if not mask[i]:
            continue
        st = env.stations[i]
        d = road_km(cur["lat"], cur["lon"], st["lat"], st["lon"])
        crowded = 1.0 if st.get("base_status") == "crowded" else 0.0
        q = float(env._cur_queues[i])
        score = d + (2.0 if rescue else 3.0) * crowded + (0.0 if rescue else 0.5 * q)
        if score < best_score:
            best_score = score
            best_act = i
    if best_act is not None:
        return best_act
    valid = np.where(mask)[0]
    return int(valid[0])
