"""Fetch real Hanoi EV charging stations & live weather from official open APIs
(no scraping, no private API bypassing) and save in rl_ppo_ev/data/ format.

Supported sources:
  1. OpenStreetMap Overpass API (--source osm)       -> FREE, NO API KEY needed
  2. OpenChargeMap REST API     (--source ocm)       -> FREE API key from openchargemap.org
  3. Open-Meteo Weather API     (--update-weather)   -> FREE, NO API KEY needed (live 168h Hanoi weather)
  4. Merge with existing base   (--merge-existing)   -> Keep existing curated 32 Hanoi stations + add new ones

Usage:
  python fetch_open_data.py --source osm --update-weather --merge-existing
  python fetch_open_data.py --source ocm --ocm-key YOUR_KEY --update-weather --merge-existing
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

HANOI_CENTER = (21.0285, 105.8542)
# Bounding box covering Greater Hanoi: south, west, north, east
HANOI_BBOX = (20.85, 105.65, 21.25, 106.00)

OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
)
OCM_URL = "https://api.openchargemap.io/v3/poi/"
OPEN_METEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=21.0285&longitude=105.8542"
    "&hourly=temperature_2m,shortwave_radiation,precipitation_probability"
    "&timezone=Asia%2FBangkok&forecast_days=7"
)


def _http_get_json(url: str, data: Optional[bytes] = None, headers: Optional[Dict[str, str]] = None, timeout: int = 30):
    req_headers = {"User-Agent": "HanoiEV-PPO-Research/1.0"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.radians
    a = (
        math.sin(r(lat2 - lat1) / 2.0) ** 2
        + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2.0) ** 2
    )
    return 2.0 * 6371.0 * math.asin(math.sqrt(min(1.0, a)))


def _parse_power_kw(raw: Optional[str], default: float = 60.0) -> float:
    if not raw:
        return default
    digits = "".join(ch if (ch.isdigit() or ch == ".") else " " for ch in str(raw)).split()
    if not digits:
        return default
    try:
        val = float(digits[0])
        return val if 3.0 <= val <= 350.0 else default
    except ValueError:
        return default


def _infer_pricing(operator: str) -> dict:
    op_low = (operator or "").lower()
    if "v-green" in op_low or "vinfast" in op_low or "vgreen" in op_low:
        return {"pricing_model": "flat_vgreen", "flat_price_vnd": 3858}
    return {
        "pricing_model": "tou_2892",
        "off_peak_vnd": 1620,
        "normal_vnd": 2700,
        "peak_vnd": 4212,
    }


MOTO_ONLY_KEYWORDS = ("xe máy", "xe may", "scooter", "moped", "selex", "dat bike", "đổi pin", "doi pin", "swap")


def _is_moto_station(tags: dict, name: str, operator: str) -> bool:
    if tags.get("motorcar") == "no" or tags.get("car") == "no":
        return True
    if tags.get("motorcycle") == "yes" or tags.get("scooter") == "yes":
        return True
    combined = f"{name} {operator} {tags.get('description', '')}".lower()
    return any(kw in combined for kw in MOTO_ONLY_KEYWORDS)


def _is_swap_station(tags: dict, name: str, operator: str) -> bool:
    combined = f"{name} {operator} {tags.get('description', '')}".lower()
    return any(kw in combined for kw in ("selex", "đổi pin", "doi pin", "swap"))


def fetch_osm_hanoi_stations(drop_unknown: bool = True, include_moto: bool = True):
    """Query OpenStreetMap Overpass API for real EV charging stations in Hanoi.

    Returns:
      - if include_moto=False: List[dict] (car stations only)
      - if include_moto=True:  Tuple[List[dict], List[dict]] -> (car_stations, moto_stations)
    """
    s, w, n, e = HANOI_BBOX
    query = f"""
    [out:json][timeout:20];
    (
      node["amenity"="charging_station"]({s},{w},{n},{e});
      way["amenity"="charging_station"]({s},{w},{n},{e});
    );
    out center;
    """
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    raw = None
    last_err = None
    for url in OVERPASS_URLS:
        try:
            print(f"  Trying {url} ...", flush=True)
            raw = _http_get_json(url, data=payload, timeout=25)
            break
        except Exception as exc:
            print(f"  -> failed ({exc}), trying next mirror...", flush=True)
            last_err = exc
    if raw is None:
        raise RuntimeError(f"All Overpass mirrors failed: {last_err}")

    car_stations: List[dict] = []
    moto_stations: List[dict] = []

    for idx, el in enumerate(raw.get("elements", []), start=1):
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = el.get("tags") or {}
        operator = (tags.get("operator") or tags.get("brand") or tags.get("network") or "").strip()
        name = (tags.get("name") or tags.get("addr:street") or "").strip()

        if drop_unknown and not operator and not name:
            continue
        if not operator:
            operator = "VinFast" if "vinfast" in name.lower() or "v-green" in name.lower() else "Unknown"
        if not name:
            name = f"Trạm sạc {operator}"

        is_moto = _is_moto_station(tags, name, operator)
        is_car = not (tags.get("motorcar") == "no" or tags.get("car") == "no") and (
            not is_moto or tags.get("motorcar") == "yes"
        )

        if is_moto and include_moto:
            station_type = "battery_swap" if _is_swap_station(tags, name, operator) else "charging"
            moto_stations.append(
                {
                    "id": f"MOTO_OSM_{el.get('id', idx)}",
                    "name": name,
                    "operator": operator,
                    "station_type": station_type,
                    "address": tags.get("addr:full") or tags.get("addr:street") or "Hà Nội",
                    "district": tags.get("addr:district") or tags.get("addr:suburb") or "Hà Nội",
                    "lat": round(float(lat), 5),
                    "lon": round(float(lon), 5),
                    "coords_source": "osm_overpass",
                    "power_kw": _parse_power_kw(tags.get("output"), default=1.2),
                    "connectors": ["tru_sac_xe_may_V-Green", "o_cam_220V"],
                    "opening_hours": tags.get("opening_hours"),
                    "pricing_note": "3,858 VND/kWh (V-Green)" if "vinfast" in operator.lower() or "v-green" in operator.lower() else None,
                    "note": None,
                    "source": "OpenStreetMap Overpass API",
                    "osm_id": el.get("id"),
                }
            )

        if is_car:
            power_kw = _parse_power_kw(
                tags.get("socket:type2_combo:output")
                or tags.get("socket:chademo:output")
                or tags.get("socket:type2:output")
                or tags.get("output"),
                default=60.0 if "vinfast" in operator.lower() or "v-green" in operator.lower() else 30.0,
            )
            try:
                ports = int(tags.get("capacity") or 4)
            except ValueError:
                ports = 4
            has_roof = tags.get("covered") in ("yes", "true") or tags.get("parking") == "underground"
            st = {
                "id": f"ST_OSM_{el.get('id', idx)}",
                "name": name,
                "district": tags.get("addr:district") or tags.get("addr:suburb") or "Hà Nội",
                "lat": round(float(lat), 5),
                "lon": round(float(lon), 5),
                "operator": operator,
                "vehicle_type": "o_to",
                "power_kw": power_kw,
                "ports_total": max(1, ports),
                "has_roof": has_roof,
                "base_status": "available",
                "base_queue": 1 if ports <= 4 else 0,
                "source": "OpenStreetMap Overpass API",
            }
            st.update(_infer_pricing(operator))
            car_stations.append(st)

    car_clean = deduplicate_stations([], car_stations, min_dist_km=0.15)
    if not include_moto:
        return car_clean
    moto_clean = deduplicate_moto_stations([], moto_stations, min_dist_km=0.12)
    return car_clean, moto_clean


def deduplicate_moto_stations(base: List[dict], added: List[dict], min_dist_km: float = 0.12) -> List[dict]:
    merged = [dict(x) for x in base]
    for cand in added:
        if cand.get("lat") is None or cand.get("lon") is None:
            continue
        too_close = any(
            ex.get("lat") is not None
            and ex.get("lon") is not None
            and _haversine_km(cand["lat"], cand["lon"], ex["lat"], ex["lon"]) < min_dist_km
            for ex in merged
        )
        if not too_close:
            merged.append(dict(cand))
    return merged


def fetch_ocm_hanoi_stations(api_key: str, max_results: int = 100) -> List[dict]:
    """Query OpenChargeMap REST API for EV charging stations around Hanoi."""
    params = urllib.parse.urlencode(
        {
            "output": "json",
            "latitude": HANOI_CENTER[0],
            "longitude": HANOI_CENTER[1],
            "distance": 25,
            "distanceunit": "KM",
            "maxresults": max_results,
            "compact": "true",
            "verbose": "false",
            "key": api_key,
        }
    )
    raw = _http_get_json(f"{OCM_URL}?{params}")
    stations: List[dict] = []
    for item in raw:
        addr = item.get("AddressInfo") or {}
        lat, lon = addr.get("Latitude"), addr.get("Longitude")
        if lat is None or lon is None:
            continue
        conns = item.get("Connections") or []
        max_kw = max((float(c.get("PowerKW") or 0) for c in conns), default=60.0) or 60.0
        ports = sum(int(c.get("Quantity") or 1) for c in conns) or 4
        operator = str(item.get("OperatorID") or "OCM")
        name = addr.get("Title") or f"OCM Station {item.get('ID')}"
        st = {
            "id": f"ST_OCM_{item.get('ID')}",
            "name": name,
            "district": addr.get("Town") or "Hà Nội",
            "lat": round(float(lat), 5),
            "lon": round(float(lon), 5),
            "operator": operator,
            "power_kw": max_kw,
            "ports_total": max(1, ports),
            "has_roof": False,
            "base_status": "available",
            "base_queue": 0,
            "source": "OpenChargeMap API",
        }
        st.update(_infer_pricing(name))
        stations.append(st)
    return stations


def fetch_live_hanoi_weather() -> dict:
    """Fetch live 7-day (168h) Hanoi hourly weather from Open-Meteo (free, no key)."""
    return _http_get_json(OPEN_METEO_URL)


def deduplicate_stations(base: List[dict], added: List[dict], min_dist_km: float = 0.15) -> List[dict]:
    """Merge station lists, collapsing nearby poles (< min_dist_km) into one station."""
    merged = [dict(x) for x in base]
    for cand in added:
        match = next(
            (ex for ex in merged if _haversine_km(cand["lat"], cand["lon"], ex["lat"], ex["lon"]) < min_dist_km),
            None,
        )
        if match is None:
            merged.append(dict(cand))
        else:
            match["ports_total"] = min(16, int(match.get("ports_total", 4)) + int(cand.get("ports_total", 1)))
            match["power_kw"] = max(float(match.get("power_kw", 30.0)), float(cand.get("power_kw", 30.0)))
    return merged


def main() -> None:
    p = argparse.ArgumentParser(description="Fetch Hanoi EV stations & live weather from official open APIs")
    p.add_argument("--source", choices=["osm", "ocm", "none"], default="osm")
    p.add_argument("--ocm-key", type=str, default=None, help="Free OpenChargeMap API key (required for --source ocm)")
    p.add_argument("--update-weather", action="store_true", help="Also refresh live 168h Hanoi weather via Open-Meteo")
    p.add_argument("--merge-existing", action="store_true", help="Merge fetched stations with existing data/hanoi_stations.json")
    p.add_argument("--keep-unknown", action="store_true", help="Keep OSM stations with missing name and operator")
    p.add_argument("--data-dir", type=str, default=str(Path(__file__).resolve().parent / "data"))
    args = p.parse_args()

    data_dir = Path(args.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    stations_path = data_dir / "hanoi_stations.json"
    moto_path = data_dir / "hanoi_moto_stations.json"

    if args.source != "none":
        fetched_moto: List[dict] = []
        if args.source == "osm":
            print("Fetching Hanoi EV car + motorbike charging stations from OpenStreetMap Overpass API...")
            fetched, fetched_moto = fetch_osm_hanoi_stations(drop_unknown=not args.keep_unknown, include_moto=True)
        else:
            if not args.ocm_key:
                raise SystemExit("Error: --ocm-key is required when --source ocm (get a free key at openchargemap.org)")
            print("Fetching Hanoi EV charging stations from OpenChargeMap API...")
            fetched = fetch_ocm_hanoi_stations(args.ocm_key)

        print(f"Fetched {len(fetched)} car stations & {len(fetched_moto)} motorbike stations from {args.source.upper()}.")
        if args.merge_existing and stations_path.exists():
            with open(stations_path, encoding="utf-8") as f:
                existing = json.load(f)
            final_stations = deduplicate_stations(existing, fetched)
            print(f"Merged cars: {len(existing)} existing + {len(fetched)} fetched -> {len(final_stations)} unique.")
        else:
            final_stations = fetched

        with open(stations_path, "w", encoding="utf-8") as f:
            json.dump(final_stations, f, ensure_ascii=False, indent=2)
        print(f"Saved car stations to {stations_path}")

        if fetched_moto:
            existing_moto_meta = {"city": "Hà Nội", "vehicle_type": "xe_may_dien"}
            existing_moto_list: List[dict] = []
            if args.merge_existing and moto_path.exists():
                with open(moto_path, encoding="utf-8") as f:
                    moto_payload = json.load(f)
                existing_moto_meta = moto_payload.get("metadata", existing_moto_meta)
                existing_moto_list = moto_payload.get("stations", [])
            final_moto = deduplicate_moto_stations(existing_moto_list, fetched_moto)
            existing_moto_meta["total_stations"] = len(final_moto)
            existing_moto_meta["stations_with_coordinates"] = sum(
                1 for s in final_moto if s.get("lat") is not None and s.get("lon") is not None
            )
            with open(moto_path, "w", encoding="utf-8") as f:
                json.dump({"metadata": existing_moto_meta, "stations": final_moto}, f, ensure_ascii=False, indent=2)
            print(f"Saved {len(final_moto)} motorbike stations to {moto_path}")

    if args.update_weather:
        print("Fetching live 168h Hanoi weather from Open-Meteo API (no API key required)...")
        weather = fetch_live_hanoi_weather()
        weather_path = data_dir / "weather_fallback.json"
        with open(weather_path, "w", encoding="utf-8") as f:
            json.dump(weather, f, ensure_ascii=False)
        print(f"Saved live weather to {weather_path}")


if __name__ == "__main__":
    main()
