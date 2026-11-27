"""CTDE MAPPO + Action Masking Inference Engine for CHARGEPILOT Prototype.

Design goals:
  1. Actor-only lightweight inference (<500 KB weights, <2 ms on CPU, no Critic needed at runtime).
  2. Optional PyTorch dependency: loads `models/best_mappo_car.pt` / `models/best_mappo_moto.pt`
     when PyTorch & checkpoints exist, and gracefully falls back to the exact same
     Action-Masked Fleet-Aware Policy when running in stdlib-only Docker/CI environments.
  3. Thread-safe `FleetReservationBoard` tracks live virtual `in_flight` arrivals with TTL expiry
     so concurrent mobile users do not herd onto the same station.
  4. Hard Layer-2 Safety Action Masking guarantees 0% maintenance, 0% out-of-range, 0% wrong-vehicle.
"""

from __future__ import annotations

import json
import math
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import guardrails
import tools

try:
    import numpy as np
    import torch
    import torch.nn as nn

    TORCH_AVAILABLE = True
except Exception:
    np = None  # type: ignore
    torch = None  # type: ignore
    nn = None  # type: ignore
    TORCH_AVAILABLE = False

ROOT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT_DIR / "models"
TOPUP_CAP_SOC = 0.55
FULL_TARGET_SOC = 0.80
RESCUE_SOC = 0.15
TOP_K_DEFAULT = 12
STRATEGY_VI = {
    "SKIP": "ĐI THẲNG (chưa cần sạc giữa đường)",
    "TOPUP": "SẠC MỒI NHANH (+25% / ~15 phút)",
    "FULL": "SẠC ĐẦY 80%",
}


class FleetReservationBoard:
    """Thread-safe virtual in-flight arrival counter per station (prevents multi-EV herding)."""

    def __init__(self, ttl_seconds: float = 1500.0):
        self.ttl = ttl_seconds
        self._lock = threading.Lock()
        self._entries: Dict[str, List[float]] = {}

    def _prune(self, now: float) -> None:
        cutoff = now - self.ttl
        for sid in list(self._entries.keys()):
            alive = [t for t in self._entries[sid] if t >= cutoff]
            if alive:
                self._entries[sid] = alive
            else:
                del self._entries[sid]

    def reserve(self, station_id: str) -> int:
        now = time.time()
        with self._lock:
            self._prune(now)
            self._entries.setdefault(station_id, []).append(now)
            return len(self._entries[station_id])

    def count(self, station_id: str) -> int:
        now = time.time()
        with self._lock:
            self._prune(now)
            return len(self._entries.get(station_id, []))

    def snapshot(self) -> Dict[str, int]:
        now = time.time()
        with self._lock:
            self._prune(now)
            return {sid: len(ts) for sid, ts in self._entries.items()}

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


FLEET_BOARD = FleetReservationBoard()


def _build_actor_net(local_obs_dim: int, action_dim: int, hidden_dim: int = 256):
    return nn.Sequential(
        nn.Linear(local_obs_dim, hidden_dim),
        nn.LayerNorm(hidden_dim),
        nn.Tanh(),
        nn.Linear(hidden_dim, hidden_dim),
        nn.LayerNorm(hidden_dim),
        nn.Tanh(),
        nn.Linear(hidden_dim, action_dim),
    )


class MAPPOInferenceEngine:
    """Loads trained CTDE MAPPO Actor weights for o_to and xe_may (with safe fallback)."""

    def __init__(self, models_dir: Optional[Path] = None):
        self.models_dir = Path(models_dir) if models_dir else MODELS_DIR
        self._actors: Dict[str, Any] = {}
        self._meta: Dict[str, dict] = {}
        self._load_available()

    def _checkpoint_candidates(self, vehicle_type: str) -> List[Path]:
        if vehicle_type == "o_to":
            names = ["best_mappo_car.pt", "best_mappo_auto.pt", "best_mappo.pt", "final_mappo_car.pt"]
        else:
            names = ["best_mappo_moto.pt", "best_mappo_motor.pt", "final_mappo_moto.pt"]
        return [self.models_dir / n for n in names]

    def _load_available(self) -> None:
        if not TORCH_AVAILABLE:
            return
        for vt in ("o_to", "xe_may"):
            for path in self._checkpoint_candidates(vt):
                if path.is_file():
                    self.load_checkpoint(vt, path)
                    break

    def load_checkpoint(self, vehicle_type: str, path: str | Path) -> bool:
        if not TORCH_AVAILABLE:
            return False
        p = Path(path)
        if not p.is_file():
            return False
        ckpt = torch.load(str(p), map_location="cpu", weights_only=False)
        sd = ckpt.get("model_state_dict", {})
        actor_sd = {k[len("actor."):]: v for k, v in sd.items() if k.startswith("actor.")}
        if not actor_sd:
            return False
        obs_dim = int(actor_sd["0.weight"].shape[1])
        hidden_dim = int(actor_sd["0.weight"].shape[0])
        act_dim = int(actor_sd["6.weight"].shape[0])
        actor = _build_actor_net(obs_dim, act_dim, hidden_dim=hidden_dim)
        actor.load_state_dict(actor_sd)
        actor.eval()
        self._actors[vehicle_type] = actor
        self._meta[vehicle_type] = {
            "checkpoint": p.name,
            "obs_dim": obs_dim,
            "action_dim": act_dim,
            "top_k": (act_dim - 1) // 2,
            "best_return": ckpt.get("best_return"),
        }
        return True

    def status(self) -> Dict[str, Any]:
        return {
            "torch_available": TORCH_AVAILABLE,
            "models_dir": str(self.models_dir),
            "loaded_models": self._meta,
            "active_inflight_stations": len(FLEET_BOARD.snapshot()),
        }

    def _station_price(self, st: dict, hour: float, weekday: int) -> float:
        if st.get("pricing_model") == "flat_vgreen":
            return float(st.get("flat_price_vnd", 3858))
        if st.get("pricing_model") == "tou_2892":
            h = hour % 24.0
            if tools.in_peak(h, weekday) or (weekday != 6 and 9.5 <= h < 11.5):
                return float(st.get("peak_vnd", 4212))
            if h >= 22.0 or h < 4.0:
                return float(st.get("off_peak_vnd", 1620))
            return float(st.get("normal_vnd", 2700))
        return 3858.0

    def recommend(
        self,
        origin_lat: float,
        origin_lon: float,
        soc_pct: float,
        vehicle_type: str = "o_to",
        ev_model: Optional[str] = None,
        dest_lat: Optional[float] = None,
        dest_lon: Optional[float] = None,
        next_trip_km: float = 0.0,
        hour: float = 12.0,
        weekday: int = 0,
        urgent: bool = False,
        temp_c: float = 24.0,
        rain_pct: float = 0.0,
        drain_factor: float = 1.0,
        record_reservation: bool = False,
    ) -> Dict[str, Any]:
        """Run CTDE MAPPO Actor (or Fleet-Aware Fallback) + Hard Action Masking."""
        cars, motos = tools._all_stations()
        if vehicle_type == "o_to":
            pool = [s for s in cars if s.get("lat") is not None and s.get("lon") is not None]
            default_range, default_batt, default_dc = 318.0, 41.9, 60.0
            max_cap = tools.MAX_ROAD_KM
        else:
            pool = [
                s for s in motos
                if s.get("lat") is not None and s.get("lon") is not None
                and s.get("station_type") == "charging"
                and s.get("operator") not in tools.MOTO_EXCLUDED_OPERATORS
            ]
            default_range, default_batt, default_dc = 145.0, 3.5, 1.2
            max_cap = 10.0

        models = tools._load("ev_models.json") or []
        spec = next((m for m in models if ev_model and m["model"].lower() == ev_model.lower()), None)
        if spec is None:
            spec = next((m for m in models if m.get("vehicle_type") == vehicle_type), None)
        range_km = float(spec["range_km"]) if spec else default_range
        batt_kwh = float(spec["battery_kwh"]) if spec else default_batt
        max_dc = float(spec.get("max_dc_kw", default_dc)) if vehicle_type == "o_to" else 1.2

        soc = max(0.0, min(1.0, float(soc_pct) / 100.0))
        safe_km = (soc * range_km / max(drain_factor, 0.5)) * tools.SAFETY_MARGIN
        rescue = soc < RESCUE_SOC
        cap = safe_km if rescue else min(safe_km, max_cap)

        d_lat = dest_lat if dest_lat is not None else origin_lat
        d_lon = dest_lon if dest_lon is not None else origin_lon
        trip_km = tools.road_km(origin_lat, origin_lon, d_lat, d_lon)

        # Rank Top-K nearest operational stations
        top_k = self._meta.get(vehicle_type, {}).get("top_k", TOP_K_DEFAULT)
        top_k = min(top_k, len(pool))
        scored_pool = []
        for s in pool:
            d = tools.road_km(origin_lat, origin_lon, float(s["lat"]), float(s["lon"]))
            is_maint = (vehicle_type == "o_to" and s.get("base_status") == "maintenance")
            scored_pool.append((d + (1000.0 if is_maint else 0.0), d, is_maint, s))
        scored_pool.sort(key=lambda x: x[0])
        cands = scored_pool[:top_k]

        # Build Hard Action Mask (2*K + 1)
        action_dim = 2 * top_k + 1
        skip_action = 2 * top_k
        mask = [False] * action_dim
        allow_topup = soc < TOPUP_CAP_SOC

        for k, (_, d_to, is_maint, _) in enumerate(cands):
            if not is_maint and d_to <= cap + 1e-6:
                if allow_topup:
                    mask[k] = True
                mask[top_k + k] = True

        if soc - (trip_km * drain_factor / range_km) >= 0.10:
            mask[skip_action] = True

        if not any(mask) and cands:
            for k, (_, _, is_maint, _) in enumerate(cands):
                if not is_maint:
                    mask[k] = True
                    mask[top_k + k] = True
                    break

        # Inference via CTDE MAPPO Actor if loaded, else Fleet-Aware Safe Heuristic
        engine_used = "fleet_masked_heuristic"
        chosen_action = skip_action
        action_probs: Optional[List[float]] = None

        if vehicle_type in self._actors and TORCH_AVAILABLE and cands:
            actor = self._actors[vehicle_type]
            expected_obs = self._meta[vehicle_type]["obs_dim"]
            peak = 1.0 if tools.in_peak(hour, weekday) else 0.0
            angle = 2.0 * math.pi * (hour % 24.0) / 24.0
            soc_after_both = soc - ((trip_km + next_trip_km) * drain_factor / range_km)

            # Nearest station to destination
            dest_dist, dest_price = 20.0, 4212.0
            for _, _, is_m, s in scored_pool:
                if is_m:
                    continue
                dd = tools.road_km(d_lat, d_lon, float(s["lat"]), float(s["lon"]))
                if dd < dest_dist:
                    dest_dist = dd
                    dest_price = self._station_price(s, hour, weekday)

            g_feats = [
                soc, FULL_TARGET_SOC, 1.0 if rescue else 0.0, min(safe_km / 300.0, 1.5),
                min(trip_km / 30.0, 2.0), math.sin(angle), math.cos(angle),
                1.0 if weekday == 6 else 0.0, peak, temp_c / 40.0, rain_pct / 100.0,
                drain_factor - 1.0, (origin_lat - 21.0285) / 0.15, (origin_lon - 105.8542) / 0.15,
                0.5, batt_kwh / 50.0, range_km / 400.0, 22.0 / 30.0,
                min(next_trip_km / 30.0, 2.0), 1.0 if next_trip_km > 0 else 0.0,
                max(-0.5, min(1.0, soc_after_both)), min(dest_dist / 20.0, 1.5),
                dest_price / 5000.0, 1.0 if urgent else 0.0,
            ]
            st_feats: List[float] = []
            for _, d_to, is_maint, s in cands:
                d_from = tools.road_km(float(s["lat"]), float(s["lon"]), d_lat, d_lon)
                detour = max(0.0, d_to + d_from - trip_km)
                eff_kw = min(float(s.get("power_kw") or max_dc), max_dc) * (0.85 if vehicle_type == "o_to" else 1.0)
                base_q = float(s.get("base_queue", 0))
                inflight = float(FLEET_BOARD.count(s["id"]))
                ports = max(1.0, float(s.get("ports_total", 4 if vehicle_type == "o_to" else 6)))
                price = self._station_price(s, hour, weekday)
                st_feats.extend([
                    min(d_to / 20.0, 2.0), min(detour / 20.0, 2.0),
                    1.0 if (not is_maint and d_to <= safe_km) else 0.0, 1.0 if is_maint else 0.0,
                    eff_kw / (60.0 if vehicle_type == "o_to" else 2.0), min(base_q / 8.0, 1.5),
                    price / 5000.0, 1.0 if s.get("has_roof") else 0.0, ports / 12.0,
                    1.0 if s.get("pricing_model") == "tou_2892" else 0.0,
                    min((base_q + inflight) / ports, 3.0),
                ])

            obs_vec = g_feats + st_feats
            if len(obs_vec) == expected_obs:
                with torch.no_grad():
                    obs_t = torch.tensor([obs_vec], dtype=torch.float32)
                    mask_t = torch.tensor([mask], dtype=torch.bool)
                    logits = actor(obs_t).masked_fill(~mask_t, -1e9)
                    probs = torch.softmax(logits, dim=-1)[0].tolist()
                    chosen_action = int(torch.argmax(logits, dim=-1).item())
                    action_probs = probs
                    engine_used = "mappo_ctde"

        if engine_used != "mappo_ctde":
            # Deterministic Fleet-Aware Masked Fallback (identical safety guarantees)
            if mask[skip_action] and soc >= 0.30 and (soc - (trip_km + next_trip_km) * drain_factor / range_km) >= 0.15:
                chosen_action = skip_action
            else:
                best_k, best_score = None, float("inf")
                for k, (_, d_to, _, s) in enumerate(cands):
                    if not (mask[k] or mask[top_k + k]):
                        continue
                    q_eff = float(s.get("base_queue", 0)) + float(FLEET_BOARD.count(s["id"]))
                    crowded = 1.0 if s.get("base_status") == "crowded" else 0.0
                    score = d_to + (2.0 if rescue else 3.0) * crowded + (0.0 if rescue else 1.2 * q_eff)
                    if score < best_score:
                        best_score, best_k = score, k
                if best_k is not None:
                    prefer_topup = urgent or tools.in_peak(hour, weekday)
                    if prefer_topup and mask[best_k]:
                        chosen_action = best_k
                    elif mask[top_k + best_k]:
                        chosen_action = top_k + best_k
                    else:
                        chosen_action = best_k

        # Decode chosen action
        if chosen_action == skip_action or not cands:
            strategy = "SKIP"
            chosen_station = None
        elif chosen_action < top_k:
            strategy = "TOPUP"
            chosen_station = cands[chosen_action][3]
        else:
            strategy = "FULL"
            chosen_station = cands[chosen_action - top_k][3]

        # Build verified Top-3 candidate list through Layer-2 Guardrail
        ranked_items = []
        if chosen_station is not None:
            ordered_cands = [chosen_station] + [s for _, _, _, s in cands if s["id"] != chosen_station["id"]]
        else:
            ordered_cands = [s for _, _, _, s in cands]

        for s in ordered_cands[:6]:
            d_to = tools.road_km(origin_lat, origin_lon, float(s["lat"]), float(s["lon"]))
            ranked_items.append({
                "id": s["id"],
                "name": s["name"],
                "road_km": round(d_to, 2),
                "status": s.get("base_status") if vehicle_type == "o_to" else None,
                "queue": int(s.get("base_queue", 0)),
                "inflight": FLEET_BOARD.count(s["id"]),
                "ports_total": int(s.get("ports_total", 4 if vehicle_type == "o_to" else 6)),
                "power_kw": s.get("power_kw"),
                "pricing_model": s.get("pricing_model", "flat_vgreen"),
                "has_roof": bool(s.get("has_roof", False)),
                "kind": vehicle_type,
            })

        l2 = guardrails.verify_station_candidates(
            ranked_items, origin_lat, origin_lon, vehicle_type, safe_km, rescue=rescue
        )
        approved = l2["approved"][:3]

        # Ensure chosen_station passed Layer-2 guardrail
        if chosen_station is not None and not any(a["id"] == chosen_station["id"] for a in approved):
            chosen_station = approved[0] if approved else None
            if chosen_station is None:
                strategy = "SKIP"

        reserved_count = 0
        if record_reservation and chosen_station is not None:
            reserved_count = FLEET_BOARD.reserve(chosen_station["id"])

        return {
            "engine": engine_used,
            "vehicle_type": vehicle_type,
            "ev_model": spec["model"] if spec else ev_model,
            "strategy": strategy,
            "strategy_vi": STRATEGY_VI[strategy],
            "recommended_station": approved[0] if (strategy != "SKIP" and approved) else None,
            "top_stations": approved,
            "safe_range_km": round(safe_km, 1),
            "rescue_mode": rescue,
            "inflight_after_reserve": reserved_count,
            "confidence": round(max(action_probs), 4) if action_probs else None,
            "guardrail_l2": {
                "ok": l2["ok"],
                "approved_count": len(approved),
                "rejected_count": len(l2["rejected"]),
            },
        }


ENGINE = MAPPOInferenceEngine()
