"""HTTP JSON API bọc quanh lõi CHARGEPILOT (agent.py, tools.py, ai.py, tracing.py) cho Android APK, Web & CI/CD.

Contract version: 1.0.0 (docs/API_CONTRACT.md).
Chỉ dùng thư viện chuẩn Python (http.server.ThreadingHTTPServer). Không tự ý thay đổi logic an toàn hay
thực hiện tác động ra ngoài; điểm Green Score chỉ được ghi nhận khi người dùng xác nhận qua endpoint confirm.

Chạy server:
    python codebase/api_server.py --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import sys
import tempfile
import threading
import time
from urllib.parse import urlparse
import uuid

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CONTRACT_VERSION = "1.0.0"

CODEBASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CODEBASE_DIR)
RELEASES_DIR = os.path.join(ROOT_DIR, "releases")
APK_FILENAME = "ChargePilot-AI.apk"

if CODEBASE_DIR not in sys.path:
    sys.path.insert(0, CODEBASE_DIR)

import agent  # noqa: E402
import ai  # noqa: E402
import guardrails  # noqa: E402
import mappo_policy  # noqa: E402
import tools  # noqa: E402
import tracing  # noqa: E402

STATE_LOCK = threading.Lock()
TRACE_LOCK = threading.Lock()

SESSIONS: dict[str, dict] = {}
PENDING_TOKENS: dict[str, dict] = {}
LEADERBOARD: dict[str, dict] = {}

VN_TZ = timezone(timedelta(hours=7))
SERVER_STARTED_AT = time.time()
MAX_MEMORY_LOGS = 500
REQUEST_LOGS: list[dict] = []
APK_DOWNLOAD_COUNT = 0
_RESOLVED_LOG_PATH: str | None = None

HTML_PAGE = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CHARGEPILOT — API v1.0.0, Web Test &amp; Tải APK</title>
<style>
  :root { --bg:#f5f7f6; --card:#fff; --ink:#0f172a; --muted:#475569; --jade:#0f766e; --line:#dbe4e1; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,Segoe UI,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width:780px; margin:0 auto; padding:24px 16px 48px; }
  .hero { background:#042f2e; color:#f0fdfa; border-radius:18px; padding:24px; margin-bottom:18px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
  .hero h1 { margin:0 0 8px; font-size:24px; }
  .hero p { margin:0; color:#ccfbf1; font-size:14.5px; line-height:1.5; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px; }
  .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; }
  .btn { display:inline-block; background:var(--jade); color:#fff; text-decoration:none; border:none; border-radius:10px; padding:11px 18px; font-weight:700; font-size:14px; cursor:pointer; }
  .btn-ghost { background:#0f172a; color:#36e6a3; border:1px solid #1e293b; }
  textarea { width:100%; min-height:84px; padding:12px; border:1px solid var(--line); border-radius:10px; font:inherit; margin:10px 0; }
  pre { background:#0f172a; color:#e2e8f0; padding:14px; border-radius:10px; overflow:auto; white-space:pre-wrap; font-size:13px; }
  .muted { color:var(--muted); font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div>
      <h1>CHARGEPILOT API (v1.0.0)</h1>
      <p>Trợ lý gợi ý Top 3 trạm sạc EV &amp; khung giờ sạc tại Hà Nội cho Android APK và Web.</p>
    </div>
    <a class="btn btn-ghost" href="/dashboard">Dashboard Giám sát Log</a>
  </div>
  <div class="card row">
    <div>
      <strong>Android APK</strong>
      <div class="muted" id="apkStatus">Đang kiểm tra bản phát hành...</div>
    </div>
    <a class="btn" href="/download/ChargePilot-AI.apk">Tải ChargePilot-AI.apk</a>
  </div>
  <div class="card">
    <strong>Dùng thử nhanh (POST /api/v1/chat)</strong>
    <textarea id="q">Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.</textarea>
    <button class="btn" onclick="ask()">Gửi trợ lý</button>
    <pre id="out">Chưa gửi yêu cầu.</pre>
  </div>
</div>
<script>
fetch('/api/release').then(r => r.json()).then(m => {
  document.getElementById('apkStatus').textContent = m.available
    ? (m.filename + ' (' + m.version + ', ' + m.size_mb + ' MB)')
    : 'Chưa có file APK phát hành trong releases/';
}).catch(() => {});
async function ask() {
  const out = document.getElementById('out');
  out.textContent = 'Đang xử lý...';
  const r = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message: document.getElementById('q').value})
  });
  const data = await r.json();
  out.textContent = JSON.stringify(data, null, 2);
}
</script>
</body>
</html>
"""


def _apk_path() -> str:
    return os.path.join(RELEASES_DIR, APK_FILENAME)


def _release_meta() -> dict:
    """Đọc metadata bản phát hành APK từ releases/latest.json (nếu có)."""
    meta_path = os.path.join(RELEASES_DIR, "latest.json")
    apk_exists = os.path.isfile(_apk_path())
    meta: dict = {}
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                meta = loaded
        except Exception:
            meta = {}
    if apk_exists:
        size_bytes = os.path.getsize(_apk_path())
        meta.setdefault("filename", APK_FILENAME)
        meta.setdefault("version", "latest")
        meta["size_bytes"] = size_bytes
        meta["size_mb"] = round(size_bytes / (1024 * 1024), 2)
        meta["download_url"] = f"/download/{APK_FILENAME}"
        meta["available"] = True
    else:
        meta["available"] = False
    return meta


def _payload_to_query(payload: dict) -> str:
    """Chấp nhận cả text tự do (message/text/query/prompt) lẫn form có cấu trúc."""
    for key in ("message", "text", "query", "prompt"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    parts = []
    ev = payload.get("ev_model") or payload.get("vehicle") or payload.get("model")
    if ev:
        parts.append(f"Xe {ev}")
    soc = payload.get("current_soc") if payload.get("current_soc") is not None else payload.get("battery_pct")
    if soc is not None:
        parts.append(f"pin còn {soc}%")
    target = payload.get("target_soc") if payload.get("target_soc") is not None else payload.get("target_pct")
    if target is not None:
        parts.append(f"muốn sạc lên {target}%")
    origin = payload.get("origin") or payload.get("location")
    if origin:
        parts.append(f"đang ở {origin}")
    time_str = payload.get("time") or payload.get("departure_time")
    if time_str:
        parts.append(f"lúc {time_str}")
    dest = payload.get("destination") or payload.get("next_trip")
    if dest:
        parts.append(f"đi {dest}")
    extra = payload.get("note") or payload.get("weather")
    if extra:
        parts.append(str(extra))
    return ", ".join(parts).strip()


def _scrub_otp(text: str, otp_tokens: list[str]) -> str:
    """Loại bỏ chuỗi nghi là mã OTP khỏi text trước khi lưu hoặc trả về."""
    out = text
    for tok in otp_tokens:
        if tok:
            out = out.replace(tok, "[REDACTED_OTP]")
    return out


def _apply_device_context(text: str, ctx: dict | None) -> str:
    """Bổ sung ngữ cảnh thiết bị (xe mặc định, GPS gần nhất, giờ, thứ) cho các trường câu hỏi còn thiếu."""
    if not ctx or not isinstance(ctx, dict):
        return text
    req = tools.parse_request(text)
    flags = req["flags"]
    if flags["booking_or_payment"] or flags["otp"] or flags["injection"] or req["out_of_scope_place"]:
        return text

    additions: list[str] = []
    default_vehicle = str(ctx.get("default_vehicle") or "").strip()
    if req["vehicle"]["model"] is None and default_vehicle:
        additions.append(f"Xe {default_vehicle}")

    if req["now_h"] is None and ctx.get("local_time"):
        lt = str(ctx["local_time"]).strip()
        if re.fullmatch(r"\d{1,2}:\d{2}", lt):
            additions.append(f"Lúc {lt}")

    if req["weekday"] is None and isinstance(ctx.get("weekday"), int) and not isinstance(ctx.get("weekday"), bool):
        wd = ctx["weekday"]
        if 0 <= wd <= 6:
            additions.append(tools.DAY_NAMES[wd])

    place_phrase_low = (req["place_phrase"] or "").lower().strip()
    is_real_place_phrase = bool(place_phrase_low) and place_phrase_low not in (
        "đâu", "đây", "nào", "chỗ nào", "đâu nhỉ", "đâu vậy", "đâu thế", "gần đây", "gần nhất",
    )
    lat, lon = ctx.get("lat"), ctx.get("lon")
    has_hanoi_gps = (
        isinstance(lat, (int, float))
        and isinstance(lon, (int, float))
        and 20.8 <= float(lat) <= 21.3
        and 105.6 <= float(lon) <= 106.1
    )
    wants_dest_only = (
        req["origin"] is not None
        and req["destination"] is None
        and not is_real_place_phrase
        and bool(re.search(r"\b(?:muốn đi|đi tới|đi đến|tới|đến|về)\b", text.lower()))
        and not bool(re.search(r"\b(?:đang ở|từ)\s+(?!đây\b)", text.lower()))
    )
    prepend_origin = None
    if has_hanoi_gps and ((req["origin"] is None and not is_real_place_phrase) or wants_dest_only):
        landmarks = tools._load("hanoi_landmarks.json") or []
        nearest = None
        best_d = 9999.0
        for lm in landmarks:
            d = tools.road_km(float(lat), float(lon), lm["lat"], lm["lon"])
            if d < best_d:
                best_d = d
                nearest = lm
        if nearest is not None and best_d <= (15.0 if wants_dest_only else 5.0):
            if wants_dest_only and req["origin"] and nearest["name"] != req["origin"]["name"]:
                prepend_origin = f"Đang ở {nearest['name']}."
            elif req["origin"] is None:
                additions.append(f"Đang ở {nearest['name']}")

    out_text = f"{prepend_origin} {text}" if prepend_origin else text
    if not additions:
        return out_text
    return f"{out_text.rstrip('. ')}. {'. '.join(additions)}."


def _extract_questions(reply_text: str) -> list[str]:
    """Tách các câu hỏi kết thúc bằng '?' từ phản hồi."""
    questions = []
    for line in reply_text.splitlines():
        for part in re.split(r"(?<=[.?!])\s+", line.strip()):
            part = part.strip("-• ").strip()
            if part.endswith("?") and part not in questions:
                questions.append(part)
    return questions


def _build_tts_summary(intent_state: str, stations: list[dict], charge_window: dict | None,
                       green_reward: dict, questions: list[str], reply_text: str) -> str:
    """Tạo bản tóm tắt 1–2 câu ngắn gọn cho Text-to-Speech khi tài xế đang lái xe."""
    if intent_state == "rescue":
        if stations:
            s1 = stations[0]
            win = f" Hãy sạc ngay từ {charge_window['window']}." if charge_window else " Hãy sạc ngay."
            return f"Pin yếu dưới 15%. Trạm gần nhất là {s1['name']}, cách {tools.fmt_km(s1['road_km'])} ki-lô-mét.{win}"
        return "Pin yếu dưới 15%, không có trạm trong tầm an toàn. Vui lòng giảm tốc và gọi cứu hộ hãng xe."

    if intent_state == "home_charging":
        win = f" Khung giờ gợi ý {charge_window['window']}." if charge_window else ""
        pts = f" Bạn có thể nhận {green_reward['points']} điểm xanh." if green_reward["eligible"] else ""
        return f"Không cần ra trạm công cộng, bạn có thể sạc tại nhà.{win}{pts}"

    if intent_state == "ask_back":
        return questions[0] if questions else "Bạn cho mình biết thêm phần trăm pin và vị trí hiện tại nhé."

    if intent_state == "refusal":
        first_line = (reply_text.splitlines() or ["Yêu cầu này nằm ngoài phạm vi hỗ trợ của trợ lý."])[0].strip()
        return first_line

    if stations:
        s1 = stations[0]
        win = f" Khung giờ sạc {charge_window['window']}." if charge_window else ""
        pts = f" Chọn sạc theo gợi ý này sẽ nhận {green_reward['points']} điểm xanh." if green_reward["eligible"] else ""
        return f"Gợi ý số 1 là {s1['name']}, cách {tools.fmt_km(s1['road_km'])} ki-lô-mét, {s1['status_label']}.{win}{pts}"

    first_line = (reply_text.splitlines() or ["Đã kiểm tra thông tin cho bạn."])[0].strip()
    return first_line


def _compute_structured_metadata(effective_text: str, reply_text: str, session_id: str,
                                 summary: dict, events: list[dict], latency_s: float) -> dict:
    """Tính toàn bộ payload JSON có cấu trúc từ tools.py khớp với lượt chạy agent.answer."""
    req = tools.parse_request(effective_text)
    v, f = req["vehicle"], req["flags"]
    pct, origin = req["current_pct"], req["origin"]
    now_h = req["now_h"]

    weather = tools.get_weather(now_h if now_h is not None else 12, req["weekday"], req["user_temp_c"])
    rng = tools.safe_range(v["model"], pct, weather["drain_factor"]) if v["known"] else {"known": False, "safe_km": None}
    rescue = pct is not None and pct < tools.RESCUE_PCT

    named_unknown = v["model"] is not None and not v["known"]
    can_list = (
        not f["booking_or_payment"]
        and not req["out_of_scope_place"]
        and origin is not None
        and pct is not None
        and not f["home_charging"]
        and not (named_unknown and (v["vehicle_type"] == "o_to" or "vinfast" not in v["model"].lower()))
    )

    cars, moto = tools._all_stations()
    station_lookup = {s["id"]: s for s in cars + moto}

    top = []
    excluded_note = None
    if can_list:
        res = tools.find_stations(origin["lat"], origin["lon"], v["vehicle_type"], rng.get("safe_km"), rescue)
        top = res["top"]
        near_x = [x for x in res["excluded"] if "tầm" not in x[1]]
        if top and near_x:
            cand = []
            for sid, why in near_x:
                st = station_lookup.get(sid)
                if st and st.get("lat") is not None:
                    cand.append((tools.road_km(origin["lat"], origin["lon"], st["lat"], st["lon"]), st, why))
            cand.sort(key=lambda x: x[0])
            if cand and cand[0][0] < top[0]["road_km"]:
                excluded_note = f"Đã bỏ qua {cand[0][1]['name']} (gần hơn, ~{tools.fmt_km(cand[0][0])} km) vì {cand[0][2]}"

    stations_out = []
    for idx, item in enumerate(top, start=1):
        raw = station_lookup.get(item["id"], {})
        if item["kind"] == "xe_may":
            status_val = "unverified"
            status_label = "trạng thái chưa xác minh"
        else:
            status_val = item.get("status")
            status_label = tools.STATUS_VI.get(status_val, status_val or "chưa rõ")
            if status_val == "crowded" and item.get("queue"):
                status_label += f" (hàng chờ ~{item['queue']} xe)"
        stations_out.append({
            "rank": idx,
            "id": item["id"],
            "name": item["name"],
            "lat": raw.get("lat"),
            "lon": raw.get("lon"),
            "address": raw.get("address") or raw.get("nearby_poi"),
            "road_km": item["road_km"],
            "power_kw": item.get("power_kw"),
            "status": status_val,
            "status_label": status_label,
            "pricing_model": item.get("pricing_model") or raw.get("pricing_model"),
            "has_roof": bool(item.get("has_roof") if "has_roof" in item else raw.get("has_roof", False)),
            "range_verified": rng.get("safe_km") is not None,
        })

    dest = req["destination"]
    trip_ok = None
    if dest and origin and rng.get("safe_km") is not None:
        trip_ok = tools.road_km(origin["lat"], origin["lon"], dest["lat"], dest["lon"]) <= rng["safe_km"]

    pw = None
    charge_window = None
    home_ok = f["home_charging"] and pct is not None and v["known"]
    if home_ok:
        pw = tools.plan_charge_window(now_h, req["weekday"], pct, req["target_pct"], v["model"],
                                      req["next_h"], req["next_day"], None, True)
    elif top and pct is not None and now_h is not None:
        pw = tools.plan_charge_window(now_h, req["weekday"], pct, req["target_pct"], v["model"],
                                      req["next_h"], req["next_day"], top[0].get("power_kw"), trip_ok)

    if pw and pw.get("window"):
        dur_h = pw["end"] - pw["start"]
        charge_window = {
            "window": pw["window"],
            "duration_min": max(1, int(round(dur_h * 60))),
            "reason": pw["reason"],
        }

    green_reward = {
        "eligible": False,
        "points": 0,
        "reasons": [],
        "requires_user_confirmation": False,
        "confirm_token": None,
    }
    if not rescue and pw and pw.get("window") and now_h is not None:
        w_charge = (tools.get_weather(pw["start"], req["weekday"], req["user_temp_c"])
                    if abs(pw["start"] - now_h) >= 1.0 else weather)
        green = tools.estimate_green_reward(
            pw["start"], pw["end"], req["weekday"],
            w_charge.get("solar_wm2"), top, rescue, home_ok,
        )
        if green["eligible"]:
            token = "green_" + uuid.uuid4().hex[:12]
            with STATE_LOCK:
                PENDING_TOKENS[token] = {
                    "points": green["points"],
                    "reasons": green["reasons"],
                    "session_id": session_id,
                    "claimed": False,
                }
            green_reward = {
                "eligible": True,
                "points": green["points"],
                "reasons": green["reasons"],
                "requires_user_confirmation": True,
                "confirm_token": token,
            }

    questions = _extract_questions(reply_text)
    if f["booking_or_payment"] or f["otp"] or f["injection"] or req["out_of_scope_place"]:
        intent_state = "refusal"
    elif rescue:
        intent_state = "rescue"
    elif home_ok:
        intent_state = "home_charging"
    elif not top and questions:
        intent_state = "ask_back"
    elif not top and (pct is None or origin is None or v["model"] is None):
        intent_state = "ask_back"
    else:
        intent_state = "recommendation"

    notes = [e.get("text", "") for e in events if e.get("kind") == "note"]
    fallback_used = any(
        "không qua check_answer" in n or "không qua L3 guardrail" in n or "chữ rỗng" in n
        for n in notes
    )

    l1_check = guardrails.pre_check_input(effective_text, req)
    mappo_strategy = None
    if origin is not None and pct is not None and v["known"] and intent_state in ("recommendation", "rescue"):
        try:
            mrec = mappo_policy.ENGINE.recommend(
                origin_lat=float(origin["lat"]),
                origin_lon=float(origin["lon"]),
                soc_pct=float(pct),
                vehicle_type=v["vehicle_type"],
                ev_model=v["model"],
                dest_lat=float(dest["lat"]) if dest else None,
                dest_lon=float(dest["lon"]) if dest else None,
                hour=float(now_h if now_h is not None else 12.0),
                weekday=int(req["weekday"] if req["weekday"] is not None else 0),
                urgent=bool(req["next_h"] is not None),
                temp_c=float(weather.get("temp_used_c") or 24.0),
                rain_pct=float(weather.get("rain_pct") or 0.0),
                drain_factor=float(weather.get("drain_factor") or 1.0),
            )
            mappo_strategy = {
                "engine": mrec["engine"],
                "strategy": "TOPUP" if (rescue and mrec["strategy"] == "SKIP") else mrec["strategy"],
                "strategy_vi": "SẠC NGAY (ưu tiên cứu pin <15%)" if (rescue and mrec["strategy"] == "SKIP") else mrec["strategy_vi"],
                "recommended_station_id": mrec["recommended_station"]["id"] if mrec["recommended_station"] else None,
                "confidence": mrec["confidence"],
                "guardrail_l2_ok": mrec["guardrail_l2"]["ok"],
            }
        except Exception:
            mappo_strategy = None

    tts_summary = _build_tts_summary(intent_state, stations_out, charge_window, green_reward, questions, reply_text)

    safe_query = effective_text
    if f["otp"]:
        otps = agent.OTP_RE.findall(effective_text)
        reply_text = _scrub_otp(reply_text, otps)
        tts_summary = _scrub_otp(tts_summary, otps)
        safe_query = _scrub_otp(effective_text, otps)

    models_used = summary.get("models") or []
    model_calls = summary.get("model_calls", 0)
    tool_calls = summary.get("tool_calls", 0)
    tokens_in = summary.get("tokens_in", 0)
    tokens_out = summary.get("tokens_out", 0)

    return {
        "ok": True,
        "contract_version": CONTRACT_VERSION,
        "session_id": session_id,
        "query": safe_query,
        "intent_state": intent_state,
        "output": reply_text,
        "reply": reply_text,
        "reply_text": reply_text,
        "tts_summary": tts_summary,
        "vehicle": v,
        "battery": {
            "current_pct": pct,
            "target_pct": req["target_pct"],
            "safe_range_km": rng.get("safe_km"),
            "rescue_mode": rescue,
        },
        "weather": {
            "temp_used_c": weather.get("temp_used_c"),
            "drain_factor": weather.get("drain_factor"),
            "solar_wm2": weather.get("solar_wm2"),
            "solar_best_window": weather.get("solar_best_window"),
        },
        "stations": stations_out,
        "charge_window": charge_window,
        "mappo_strategy": mappo_strategy,
        "green_reward": green_reward,
        "follow_up_questions": questions,
        "guardrails": {
            "passed": not bool(summary.get("errors")),
            "fallback_used": fallback_used,
            "layers": ["L1_input", "L2_policy_mask", "L3_output"],
            "l1_violations": l1_check["violations"],
            "excluded_note": excluded_note,
            "model": ", ".join(models_used) or ai.MODEL_PROVIDER,
            "model_calls": model_calls,
            "tool_calls": tool_calls,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "latency_s": round(latency_s, 3),
        },
        "meta": {
            "models": models_used,
            "model_calls": model_calls,
            "tool_calls": tool_calls,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "latency_ms": int(round(latency_s * 1000)),
        },
    }


def handle_chat(payload: dict) -> tuple[int, dict]:
    """Xử lý POST /api/v1/chat (và /api/ask, /api/chat, /api/optimize)."""
    message = _payload_to_query(payload)
    if not message:
        return 400, {
            "ok": False,
            "error": "Thiếu nội dung câu hỏi (trường 'message' / 'text' hoặc thông số chuyến đi).",
        }

    session_id = str(payload.get("session_id") or "").strip() or ("sess_" + uuid.uuid4().hex[:12])
    device_context = payload.get("device_context")

    with STATE_LOCK:
        prev = SESSIONS.get(session_id)

    if prev and prev.get("last_state") == "ask_back" and len(message) < 100:
        combined = f"{prev['last_message'].rstrip('. ')}. {message}"
    else:
        combined = message

    effective_text = _apply_device_context(combined, device_context)

    t0 = time.perf_counter()
    with TRACE_LOCK:
        tracing.begin("api-" + session_id[:8])
        try:
            result = agent.answer(effective_text)
        except Exception as exc:
            tracing.end()
            return 502, {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        summary, events = tracing.end()
    latency_s = time.perf_counter() - t0

    reply_text = result.get("output", "") if isinstance(result, dict) else str(result)
    response = _compute_structured_metadata(effective_text, reply_text, session_id, summary, events, latency_s)

    with STATE_LOCK:
        SESSIONS[session_id] = {
            "last_message": response["query"],
            "last_state": response["intent_state"],
            "turns": (prev.get("turns", 0) + 1) if prev else 1,
        }

    return 200, response


def handle_session_reset(payload: dict) -> tuple[int, dict]:
    """Xử lý POST /api/v1/session/reset để xoá ngữ cảnh hội thoại của session_id."""
    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        return 400, {"ok": False, "error": "Thiếu 'session_id'."}
    with STATE_LOCK:
        cleared = SESSIONS.pop(session_id, None) is not None
    return 200, {"ok": True, "session_id": session_id, "cleared": cleared}


def handle_green_confirm(payload: dict) -> tuple[int, dict]:
    """Xử lý POST /api/v1/green-score/confirm (chỉ cộng điểm khi người dùng xác nhận)."""
    token = str(payload.get("confirm_token") or "").strip()
    user_name = str(payload.get("user_name") or "Driver").strip() or "Driver"
    if not token:
        return 400, {"ok": False, "error": "Thiếu 'confirm_token'."}

    with STATE_LOCK:
        entry = PENDING_TOKENS.get(token)
        if not entry:
            return 404, {"ok": False, "error": "confirm_token không tồn tại hoặc đã hết hạn."}
        if entry["claimed"]:
            return 409, {"ok": False, "error": "confirm_token đã được xác nhận trước đó."}
        entry["claimed"] = True
        pts = entry["points"]
        user = LEADERBOARD.setdefault(user_name, {"user_name": user_name, "total_points": 0, "green_sessions": 0})
        user["total_points"] += pts
        user["green_sessions"] += 1
        snapshot = dict(user)

    return 200, {
        "ok": True,
        "points_added": pts,
        "total_points": snapshot["total_points"],
        "green_sessions": snapshot["green_sessions"],
        "user_name": snapshot["user_name"],
    }


def get_leaderboard() -> list[dict]:
    """Trả bảng xếp hạng Green Score Leaderboard đã sắp xếp giảm dần theo điểm."""
    with STATE_LOCK:
        rows = sorted(LEADERBOARD.values(), key=lambda x: (-x["total_points"], -x["green_sessions"], x["user_name"]))
        return [{"rank": idx, **row} for idx, row in enumerate(rows, start=1)]


def _log_file_path() -> str:
    """Chọn đường dẫn file log JSONL có thể ghi (ưu tiên releases/, fallback tmp)."""
    global _RESOLVED_LOG_PATH
    if _RESOLVED_LOG_PATH:
        return _RESOLVED_LOG_PATH
    candidates = [
        os.path.join(RELEASES_DIR, "api_logs.jsonl"),
        os.path.join(tempfile.gettempdir(), "chargepilot_api_logs.jsonl"),
    ]
    for cand in candidates:
        try:
            os.makedirs(os.path.dirname(cand), exist_ok=True)
            with open(cand, "a", encoding="utf-8"):
                pass
            _RESOLVED_LOG_PATH = cand
            return cand
        except Exception:
            continue
    _RESOLVED_LOG_PATH = candidates[-1]
    return _RESOLVED_LOG_PATH


def _load_recent_logs() -> None:
    """Nạp lại tối đa MAX_MEMORY_LOGS dòng log gần nhất khi server khởi động."""
    path = _log_file_path()
    if not os.path.isfile(path):
        return
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()[-MAX_MEMORY_LOGS:]
        loaded = []
        for ln in lines:
            ln = ln.strip()
            if not ln:
                continue
            try:
                obj = json.loads(ln)
                if isinstance(obj, dict):
                    loaded.append(obj)
            except Exception:
                continue
        if loaded:
            with STATE_LOCK:
                REQUEST_LOGS.extend(loaded[-MAX_MEMORY_LOGS:])
    except Exception:
        pass


def _mask_ip(ip: str) -> str:
    """Ẩn phần cuối địa chỉ IP để tránh lưu nguyên IP người dùng trong log."""
    raw = (ip or "").strip()
    if not raw:
        return "-"
    if "." in raw:
        parts = raw.split(".")
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.*"
    if ":" in raw:
        return raw.rsplit(":", 1)[0] + ":*"
    return raw


def _record_request_log(
    method: str,
    path: str,
    status: int,
    latency_ms: int,
    client_ip: str = "",
    resp: dict | None = None,
    query_text: str = "",
) -> None:
    """Ghi log hoạt động vào RAM + file JSONL (tự động ẩn OTP nếu có)."""
    safe_query = (query_text or "").strip()
    if safe_query:
        otps = agent.OTP_RE.findall(safe_query)
        if otps:
            safe_query = _scrub_otp(safe_query, otps)
    if len(safe_query) > 120:
        safe_query = safe_query[:117] + "..."

    meta = resp.get("meta") if isinstance(resp, dict) and isinstance(resp.get("meta"), dict) else {}
    guard = resp.get("guardrails") if isinstance(resp, dict) and isinstance(resp.get("guardrails"), dict) else {}
    stations = resp.get("stations") if isinstance(resp, dict) and isinstance(resp.get("stations"), list) else []

    now_dt = datetime.now(VN_TZ)
    entry = {
        "id": uuid.uuid4().hex[:10],
        "ts_epoch": round(time.time(), 3),
        "ts": now_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "hour_key": now_dt.strftime("%H:00"),
        "method": method,
        "path": path,
        "status": int(status),
        "latency_ms": int(max(0, latency_ms)),
        "intent_state": (resp.get("intent_state") if isinstance(resp, dict) else None) or "-",
        "model": guard.get("model") or (ai.MODEL_NAME or ai.MODEL_PROVIDER or "-"),
        "model_calls": int(meta.get("model_calls") or 0),
        "tool_calls": int(meta.get("tool_calls") or 0),
        "tokens_in": int(meta.get("tokens_in") or 0),
        "tokens_out": int(meta.get("tokens_out") or 0),
        "fallback_used": bool(guard.get("fallback_used", False)),
        "stations_count": len(stations),
        "session_id": (resp.get("session_id") if isinstance(resp, dict) else None) or "",
        "query_preview": safe_query,
        "error": (resp.get("error") if isinstance(resp, dict) else None) or "",
        "client_ip": _mask_ip(client_ip),
    }

    with STATE_LOCK:
        REQUEST_LOGS.append(entry)
        if len(REQUEST_LOGS) > MAX_MEMORY_LOGS:
            del REQUEST_LOGS[:-MAX_MEMORY_LOGS]

    try:
        with open(_log_file_path(), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _format_uptime(seconds: float) -> str:
    sec = max(0, int(seconds))
    days, rem = divmod(sec, 86400)
    hours, rem = divmod(rem, 3600)
    mins, secs = divmod(rem, 60)
    if days > 0:
        return f"{days}d {hours:02d}h {mins:02d}m"
    return f"{hours:02d}h {mins:02d}m {secs:02d}s"


def build_dashboard_stats() -> dict:
    """Tổng hợp số liệu vận hành và danh sách log gần nhất cho Operations Dashboard."""
    now_epoch = time.time()
    uptime_s = now_epoch - SERVER_STARTED_AT
    with STATE_LOCK:
        logs = list(REQUEST_LOGS)
        active_sessions = len(SESSIONS)
        apk_downloads = APK_DOWNLOAD_COUNT

    total = len(logs)
    chat_paths = ("/api/v1/chat", "/api/chat", "/api/ask", "/api/optimize")
    chat_logs = [x for x in logs if x.get("path") in chat_paths]
    ok_2xx = sum(1 for x in logs if 200 <= int(x.get("status", 0)) < 300)
    err_4xx = sum(1 for x in logs if 400 <= int(x.get("status", 0)) < 500)
    err_5xx = sum(1 for x in logs if int(x.get("status", 0)) >= 500)

    recent_slice = logs[-20:]
    recent_5xx_rate = (
        sum(1 for x in recent_slice if int(x.get("status", 0)) >= 500) / len(recent_slice)
        if recent_slice else 0.0
    )
    health_status = "degraded" if recent_5xx_rate > 0.1 else "healthy"

    latencies = sorted(int(x.get("latency_ms", 0)) for x in chat_logs) if chat_logs else sorted(
        int(x.get("latency_ms", 0)) for x in logs
    )
    avg_latency = int(round(sum(latencies) / len(latencies))) if latencies else 0
    p95_idx = min(len(latencies) - 1, max(0, int(len(latencies) * 0.95) - 1)) if latencies else 0
    p95_latency = latencies[p95_idx] if latencies else 0

    tokens_in = sum(int(x.get("tokens_in", 0)) for x in logs)
    tokens_out = sum(int(x.get("tokens_out", 0)) for x in logs)
    # Bảng giá tham chiếu spec.md §8: claude-haiku-5-5 ($0.10 in / $0.50 out per 1M tokens)
    est_cost_usd = (tokens_in / 1_000_000.0) * 0.10 + (tokens_out / 1_000_000.0) * 0.50
    est_cost_vnd = int(round(est_cost_usd * 25400))

    fallback_count = sum(1 for x in chat_logs if x.get("fallback_used"))
    intents = {"recommendation": 0, "ask_back": 0, "rescue": 0, "home_charging": 0, "refusal": 0, "other": 0}
    for x in chat_logs:
        st = x.get("intent_state") or "other"
        intents[st if st in intents else "other"] += 1

    now_dt = datetime.now(VN_TZ)
    hour_labels = [(now_dt - timedelta(hours=i)).strftime("%H:00") for i in range(11, -1, -1)]
    cutoff = now_epoch - 12 * 3600
    hour_map = {h: {"hour": h, "ok": 0, "err": 0} for h in hour_labels}
    for x in logs:
        if float(x.get("ts_epoch", 0)) >= cutoff:
            hk = x.get("hour_key")
            if hk in hour_map:
                if int(x.get("status", 0)) >= 400:
                    hour_map[hk]["err"] += 1
                else:
                    hour_map[hk]["ok"] += 1

    model_val = ai.MODEL_NAME or ("fake" if ai.MODEL_PROVIDER == "fake" else "unknown")
    return {
        "ok": True,
        "generated_at": now_dt.strftime("%Y-%m-%d %H:%M:%S +07"),
        "service": "CHARGEPILOT API",
        "contract_version": CONTRACT_VERSION,
        "model_provider": ai.MODEL_PROVIDER,
        "model_name": model_val,
        "uptime_s": int(uptime_s),
        "uptime_human": _format_uptime(uptime_s),
        "health_status": health_status,
        "summary": {
            "total_requests": total,
            "chat_requests": len(chat_logs),
            "ok_2xx": ok_2xx,
            "err_4xx": err_4xx,
            "err_5xx": err_5xx,
            "success_rate_pct": round((ok_2xx / total) * 100, 1) if total else 100.0,
            "avg_latency_ms": avg_latency,
            "p95_latency_ms": p95_latency,
            "total_tokens_in": tokens_in,
            "total_tokens_out": tokens_out,
            "est_cost_usd": round(est_cost_usd, 5),
            "est_cost_vnd": est_cost_vnd,
            "fallback_count": fallback_count,
            "active_sessions": active_sessions,
            "apk_downloads": apk_downloads,
        },
        "intents": intents,
        "hourly": [hour_map[h] for h in hour_labels],
        "apk_meta": _release_meta(),
        "leaderboard": get_leaderboard()[:5],
        "logs": list(reversed(logs[-100:])),
    }


DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CHARGEPILOT — Operations &amp; Log Dashboard</title>
<style>
  :root {
    --bg:#0B1017; --surface:#121A24; --elev:#182330; --line:#233142;
    --ink:#F4F7FB; --muted:#94A3B8; --green:#36E6A3; --blue:#60A5FA;
    --amber:#FBBF24; --red:#F87171;
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,Segoe UI,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width:1240px; margin:0 auto; padding:20px 16px 48px; }
  .topbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:16px 20px; margin-bottom:16px; }
  .brand { display:flex; align-items:center; gap:12px; }
  .pulse { width:12px; height:12px; border-radius:50%; background:var(--green); box-shadow:0 0 12px var(--green); }
  .pulse.degraded { background:var(--red); box-shadow:0 0 12px var(--red); }
  .brand h1 { margin:0; font-size:20px; }
  .brand small { color:var(--muted); font-size:12.5px; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .btn { background:var(--elev); color:var(--ink); border:1px solid var(--line); border-radius:10px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; }
  .btn-primary { background:var(--green); color:#0B1017; border-color:var(--green); }
  .grid-kpi { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-bottom:16px; }
  .kpi { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .kpi .lbl { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:0.4px; }
  .kpi .val { font-size:24px; font-weight:700; margin:6px 0 4px; }
  .kpi .sub { color:var(--muted); font-size:12px; }
  .grid-2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; margin-bottom:16px; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px; }
  .card h2 { margin:0 0 12px; font-size:15px; display:flex; justify-content:space-between; align-items:center; }
  .bar-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:13px; }
  .bar-name { width:130px; color:var(--muted); }
  .bar-track { flex:1; height:10px; background:var(--elev); border-radius:999px; overflow:hidden; }
  .bar-fill { height:100%; background:var(--green); border-radius:999px; }
  .bar-cnt { width:44px; text-align:right; font-weight:600; }
  .chart { display:flex; align-items:flex-end; gap:6px; height:110px; padding-top:12px; }
  .col-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end; }
  .col-bar { width:100%; max-width:28px; background:var(--blue); border-radius:4px 4px 0 0; min-height:2px; }
  .col-err { width:100%; max-width:28px; background:var(--red); border-radius:4px 4px 0 0; }
  .col-lbl { font-size:10px; color:var(--muted); }
  .filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
  .chip { background:var(--elev); color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:6px 12px; font-size:12.5px; cursor:pointer; }
  .chip.active { background:var(--green); color:#0B1017; border-color:var(--green); font-weight:700; }
  .tbl-wrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th, td { padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  th { color:var(--muted); font-weight:600; white-space:nowrap; }
  .tag { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }
  .t-ok { background:rgba(54,230,163,0.16); color:var(--green); }
  .t-warn { background:rgba(251,191,36,0.16); color:var(--amber); }
  .t-err { background:rgba(248,113,113,0.16); color:var(--red); }
  .t-info { background:rgba(96,165,250,0.16); color:var(--blue); }
  .mono { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand">
      <div id="pulseDot" class="pulse"></div>
      <div>
        <h1>CHARGEPILOT — Operations Dashboard</h1>
        <small id="metaLine">Đang tải trạng thái hệ thống...</small>
      </div>
    </div>
    <div class="actions">
      <button class="btn" id="autoBtn" onclick="toggleAuto()">Tự làm mới: 5s</button>
      <button class="btn" onclick="loadStats()">Làm mới ngay</button>
      <button class="btn btn-primary" onclick="runPingTest()">Test Live AI Ping</button>
      <a class="btn" href="/">Trang Test &amp; APK</a>
    </div>
  </div>

  <div class="grid-kpi">
    <div class="kpi"><div class="lbl">Trạng thái &amp; Uptime</div><div class="val" id="kHealth">-</div><div class="sub" id="kUptime">-</div></div>
    <div class="kpi"><div class="lbl">Tổng Request / Thành công</div><div class="val" id="kTotal">-</div><div class="sub" id="kBreakdown">-</div></div>
    <div class="kpi"><div class="lbl">Độ trễ AI (TB / P95)</div><div class="val" id="kLat">-</div><div class="sub" id="kFallback">-</div></div>
    <div class="kpi"><div class="lbl">Token &amp; Chi phí ước tính</div><div class="val" id="kCost">-</div><div class="sub" id="kTokens">-</div></div>
    <div class="kpi"><div class="lbl">APK &amp; Phiên đang giữ</div><div class="val" id="kApk">-</div><div class="sub" id="kSessions">-</div></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>Phân bố Intent AI <span class="mono" id="intentTotal" style="color:var(--muted);font-size:12px">0 chat</span></h2>
      <div id="intentBars"></div>
    </div>
    <div class="card">
      <h2>Lưu lượng 12 giờ gần nhất <span style="color:var(--muted);font-size:12px">Xanh: OK · Đỏ: Lỗi</span></h2>
      <div class="chart" id="hourlyChart"></div>
    </div>
  </div>

  <div class="card">
    <h2>Nhật ký Request / Log gần nhất <span id="logCount" style="color:var(--muted);font-size:12px">0 dòng</span></h2>
    <div class="filters">
      <button class="chip active" onclick="setFilter('all', this)">Tất cả</button>
      <button class="chip" onclick="setFilter('chat', this)">Chỉ Chat AI</button>
      <button class="chip" onclick="setFilter('err', this)">Lỗi (4xx/5xx)</button>
      <button class="chip" onclick="setFilter('slow', this)">Chậm (&gt;3000ms)</button>
      <button class="chip" onclick="setFilter('safety', this)">Rescue &amp; Refusal</button>
      <button class="chip" onclick="setFilter('apk', this)">Tải APK</button>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Thời gian (+07)</th>
            <th>Endpoint</th>
            <th>HTTP</th>
            <th>Intent</th>
            <th>Latency</th>
            <th>Model / Tools</th>
            <th>Tokens</th>
            <th>Nội dung / Ghi chú</th>
          </tr>
        </thead>
        <tbody id="logBody"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
let currentFilter = 'all';
let autoRefresh = true;
let timerId = null;
let latestStats = null;

function setFilter(name, btn) {
  currentFilter = name;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLogs();
}

function toggleAuto() {
  autoRefresh = !autoRefresh;
  document.getElementById('autoBtn').textContent = autoRefresh ? 'Tự làm mới: 5s' : 'Đã tạm dừng';
  scheduleNext();
}

function scheduleNext() {
  if (timerId) clearTimeout(timerId);
  if (autoRefresh) timerId = setTimeout(loadStats, 5000);
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function intentBadge(intent) {
  if (intent === 'rescue') return ['t-warn', 'rescue'];
  if (intent === 'refusal') return ['t-err', 'refusal'];
  if (intent === 'ask_back') return ['t-info', 'ask_back'];
  if (intent === 'recommendation' || intent === 'home_charging') return ['t-ok', intent];
  return ['t-info', intent || '-'];
}

function renderLogs() {
  const tbody = document.getElementById('logBody');
  tbody.innerHTML = '';
  const logs = (latestStats && latestStats.logs) ? latestStats.logs : [];
  const filtered = logs.filter(x => {
    if (currentFilter === 'chat') return ['/api/v1/chat','/api/chat','/api/ask','/api/optimize'].includes(x.path);
    if (currentFilter === 'err') return x.status >= 400;
    if (currentFilter === 'slow') return x.latency_ms >= 3000;
    if (currentFilter === 'safety') return x.intent_state === 'rescue' || x.intent_state === 'refusal';
    if (currentFilter === 'apk') return String(x.path || '').startsWith('/download/');
    return true;
  });
  document.getElementById('logCount').textContent = filtered.length + ' dòng hiển thị / ' + logs.length + ' log';
  filtered.slice(0, 60).forEach(x => {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', 'mono', x.ts));
    tr.appendChild(el('td', 'mono', x.method + ' ' + x.path));
    const tdSt = document.createElement('td');
    tdSt.appendChild(el('span', 'tag ' + (x.status >= 500 ? 't-err' : x.status >= 400 ? 't-warn' : 't-ok'), x.status));
    tr.appendChild(tdSt);
    const tdIn = document.createElement('td');
    const [icls, itxt] = intentBadge(x.intent_state);
    tdIn.appendChild(el('span', 'tag ' + icls, itxt));
    tr.appendChild(tdIn);
    tr.appendChild(el('td', 'mono', x.latency_ms + ' ms'));
    tr.appendChild(el('td', 'mono', (x.model || '-') + ' (' + (x.tool_calls || 0) + 't)'));
    tr.appendChild(el('td', 'mono', (x.tokens_in || 0) + ' / ' + (x.tokens_out || 0)));
    const note = x.error ? ('ERR: ' + x.error) : (x.query_preview || (x.stations_count ? (x.stations_count + ' trạm') : '-'));
    tr.appendChild(el('td', '', note));
    tbody.appendChild(tr);
  });
}

function renderDashboard(d) {
  latestStats = d;
  const s = d.summary || {};
  const dot = document.getElementById('pulseDot');
  dot.className = 'pulse' + (d.health_status === 'degraded' ? ' degraded' : '');
  document.getElementById('metaLine').textContent =
    'Provider: ' + d.model_provider + ' (' + d.model_name + ') · Contract v' + d.contract_version + ' · Cập nhật: ' + d.generated_at;

  document.getElementById('kHealth').textContent = d.health_status === 'healthy' ? 'ỔN ĐỊNH' : 'CẢNH BÁO';
  document.getElementById('kHealth').style.color = d.health_status === 'healthy' ? 'var(--green)' : 'var(--red)';
  document.getElementById('kUptime').textContent = 'Uptime: ' + d.uptime_human;

  document.getElementById('kTotal').textContent = s.total_requests + ' (' + s.success_rate_pct + '%)';
  document.getElementById('kBreakdown').textContent = 'Chat: ' + s.chat_requests + ' · 4xx: ' + s.err_4xx + ' · 5xx: ' + s.err_5xx;

  document.getElementById('kLat').textContent = s.avg_latency_ms + ' / ' + s.p95_latency_ms + ' ms';
  document.getElementById('kFallback').textContent = 'Fallback guardrail: ' + s.fallback_count + ' lần';

  document.getElementById('kCost').textContent = s.est_cost_vnd.toLocaleString('vi-VN') + ' ₫';
  document.getElementById('kTokens').textContent = 'In: ' + s.total_tokens_in + ' · Out: ' + s.total_tokens_out + ' ($' + s.est_cost_usd + ')';

  const apk = d.apk_meta || {};
  document.getElementById('kApk').textContent = (s.apk_downloads || 0) + ' lượt tải';
  document.getElementById('kSessions').textContent =
    (apk.available ? (apk.version + ' · ' + apk.size_mb + ' MB') : 'Chưa có APK') + ' · Session: ' + s.active_sessions;

  const intents = d.intents || {};
  const chatTotal = Math.max(1, s.chat_requests || 0);
  document.getElementById('intentTotal').textContent = (s.chat_requests || 0) + ' chat';
  const iBox = document.getElementById('intentBars');
  iBox.innerHTML = '';
  const order = [
    ['recommendation', 'Đề xuất trạm', 'var(--green)'],
    ['ask_back', 'Hỏi lại thiếu tin', 'var(--blue)'],
    ['rescue', 'Cứu pin <15%', 'var(--amber)'],
    ['home_charging', 'Sạc tại nhà', '#A78BFA'],
    ['refusal', 'Từ chối an toàn', 'var(--red)'],
  ];
  order.forEach(([key, label, col]) => {
    const cnt = intents[key] || 0;
    const pct = Math.round((cnt / chatTotal) * 100);
    const row = el('div', 'bar-row');
    row.appendChild(el('div', 'bar-name', label));
    const trk = el('div', 'bar-track');
    const fill = el('div', 'bar-fill');
    fill.style.width = pct + '%';
    fill.style.background = col;
    trk.appendChild(fill);
    row.appendChild(trk);
    row.appendChild(el('div', 'bar-cnt', cnt));
    iBox.appendChild(row);
  });

  const chart = document.getElementById('hourlyChart');
  chart.innerHTML = '';
  const hourly = d.hourly || [];
  const maxVal = Math.max(1, ...hourly.map(h => (h.ok || 0) + (h.err || 0)));
  hourly.forEach(h => {
    const col = el('div', 'col-wrap');
    const okH = Math.round(((h.ok || 0) / maxVal) * 76);
    const errH = Math.round(((h.err || 0) / maxVal) * 76);
    if (errH > 0) {
      const eb = el('div', 'col-err');
      eb.style.height = errH + 'px';
      eb.title = h.hour + ': ' + h.err + ' lỗi';
      col.appendChild(eb);
    }
    const ob = el('div', 'col-bar');
    ob.style.height = Math.max(2, okH) + 'px';
    ob.title = h.hour + ': ' + h.ok + ' thành công';
    col.appendChild(ob);
    col.appendChild(el('div', 'col-lbl', h.hour.slice(0, 2)));
    chart.appendChild(col);
  });

  renderLogs();
}

async function loadStats() {
  try {
    const r = await fetch('/api/dashboard/stats');
    const d = await r.json();
    renderDashboard(d);
  } catch (e) {
    document.getElementById('kHealth').textContent = 'MẤT KẾT NỐI';
    document.getElementById('kHealth').style.color = 'var(--red)';
  } finally {
    scheduleNext();
  }
}

async function runPingTest() {
  try {
    await fetch('/api/v1/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        message: 'Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy.',
        session_id: 'dashboard_ping'
      })
    });
    await loadStats();
  } catch (e) {}
}

loadStats();
</script>
</body>
</html>
"""

_load_recent_logs()


class ChargePilotHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler cho CHARGEPILOT API."""

    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write("[API] %s - %s\n" % (self.address_string(), format % args))

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send_json(self, status: int, body: dict | list) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(raw)

    def _send_html(self, status: int, html: str) -> None:
        raw = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(raw)

    def _serve_apk(self, head_only: bool = False) -> None:
        path = _apk_path()
        if not os.path.isfile(path):
            if head_only:
                self.send_response(404)
                self._send_cors_headers()
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self._send_json(404, {"ok": False, "error": "Chưa có file APK nào được phát hành trên VPS."})
            return
        size = os.path.getsize(path)
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/vnd.android.package-archive")
        self.send_header("Content-Disposition", f'attachment; filename="{APK_FILENAME}"')
        self.send_header("Content-Length", str(size))
        self.end_headers()
        if head_only:
            return
        with open(path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            return None
        if length <= 0 or length > 1_000_000:
            return None
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            return None
        return data if isinstance(data, dict) else None

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self) -> None:
        path = urlparse(self.path).path
        if path in (f"/download/{APK_FILENAME}", "/download/latest.apk"):
            self._serve_apk(head_only=True)
            return
        ok_paths = ("/", "/health", "/dashboard", "/api/dashboard/stats", "/api/release", "/api/v1/green-score/leaderboard")
        self.send_response(200 if path in ok_paths else 404)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        global APK_DOWNLOAD_COUNT
        path = urlparse(self.path).path
        client_ip = self.client_address[0] if self.client_address else ""
        if path == "/":
            self._send_html(200, HTML_PAGE)
            return
        if path == "/dashboard":
            self._send_html(200, DASHBOARD_HTML)
            return
        if path == "/api/dashboard/stats":
            self._send_json(200, build_dashboard_stats())
            return
        if path == "/health":
            meta = _release_meta()
            model_val = ai.MODEL_NAME or ("fake" if ai.MODEL_PROVIDER == "fake" else "")
            self._send_json(200, {
                "ok": True,
                "status": "ok",
                "service": "CHARGEPILOT API",
                "contract_version": CONTRACT_VERSION,
                "model_provider": ai.MODEL_PROVIDER,
                "model": model_val,
                "model_name": model_val,
                "apk_available": meta.get("available", False),
                "apk_meta": meta,
                "mappo_status": mappo_policy.ENGINE.status(),
                "osrm_live_routing": tools.USE_LIVE_OSRM,
                "weather_live": tools.USE_LIVE_WEATHER,
            })
            return
        if path == "/api/release":
            self._send_json(200, _release_meta())
            return
        if path in (f"/download/{APK_FILENAME}", "/download/latest.apk"):
            t0 = time.perf_counter()
            apk_exists = os.path.isfile(_apk_path())
            self._serve_apk(head_only=False)
            latency_ms = int(round((time.perf_counter() - t0) * 1000))
            if apk_exists:
                with STATE_LOCK:
                    APK_DOWNLOAD_COUNT += 1
            _record_request_log(
                "GET",
                path,
                200 if apk_exists else 404,
                latency_ms,
                client_ip,
                {"ok": apk_exists},
                f"Tải APK ({APK_FILENAME})" if apk_exists else "APK chưa phát hành",
            )
            return
        if path == "/api/v1/green-score/leaderboard":
            self._send_json(200, {"ok": True, "leaderboard": get_leaderboard()})
            return
        if path == "/api/v1/weather":
            now = time.localtime()
            now_h = now.tm_hour + now.tm_min / 60.0
            wd = now.tm_wday
            w = tools.get_weather(now_h, wd)
            self._send_json(200, {
                "ok": True,
                "city": "Hà Nội",
                "hour": round(now_h, 2),
                "weekday": wd,
                "temp_c": w.get("temp_used_c"),
                "forecast_temp_c": w.get("forecast_temp_c"),
                "rain_pct": w.get("rain_pct"),
                "solar_wm2": w.get("solar_wm2"),
                "solar_best_window": w.get("solar_best_window"),
                "drain_factor": w.get("drain_factor", 1.0),
                "notes": w.get("notes", []),
                "source": w.get("source"),
            })
            return
        self._send_json(404, {"ok": False, "error": f"Không tìm thấy đường dẫn {path}"})

    def do_POST(self) -> None:
        t0 = time.perf_counter()
        path = urlparse(self.path).path
        client_ip = self.client_address[0] if self.client_address else ""
        payload = self._read_json()
        if payload is None:
            err_body = {"ok": False, "error": "Body phải là JSON object hợp lệ."}
            self._send_json(400, err_body)
            _record_request_log("POST", path, 400, int(round((time.perf_counter() - t0) * 1000)), client_ip, err_body)
            return
        if path in ("/api/v1/chat", "/api/chat", "/api/ask", "/api/optimize"):
            status, resp = handle_chat(payload)
            self._send_json(status, resp)
            _record_request_log(
                "POST",
                path,
                status,
                int(round((time.perf_counter() - t0) * 1000)),
                client_ip,
                resp,
                _payload_to_query(payload),
            )
            return
        if path == "/api/v1/session/reset":
            status, resp = handle_session_reset(payload)
            self._send_json(status, resp)
            _record_request_log("POST", path, status, int(round((time.perf_counter() - t0) * 1000)), client_ip, resp)
            return
        if path == "/api/v1/green-score/confirm":
            status, resp = handle_green_confirm(payload)
            self._send_json(status, resp)
            _record_request_log("POST", path, status, int(round((time.perf_counter() - t0) * 1000)), client_ip, resp)
            return
        if path == "/api/v1/mappo/recommend":
            status, resp = handle_mappo_recommend(payload)
            self._send_json(status, resp)
            _record_request_log(
                "POST",
                path,
                status,
                int(round((time.perf_counter() - t0) * 1000)),
                client_ip,
                resp,
                _payload_to_query(payload),
            )
            return
        err_404 = {"ok": False, "error": f"Không tìm thấy đường dẫn {path}"}
        self._send_json(404, err_404)
        _record_request_log("POST", path, 404, int(round((time.perf_counter() - t0) * 1000)), client_ip, err_404)


def handle_mappo_recommend(payload: dict) -> tuple[int, dict]:
    """Endpoint điều phối đội xe CTDE MAPPO + 3 lớp Guardrail (POST /api/v1/mappo/recommend)."""
    t0 = time.perf_counter()
    raw_text = _payload_to_query(payload)
    if raw_text:
        l1 = guardrails.pre_check_input(raw_text)
        if l1["out_of_scope_place"] or l1["booking_or_payment"] or l1["otp"] or l1["injection"]:
            return 200, {
                "ok": True,
                "blocked_by_guardrail": True,
                "guardrail_l1": l1,
                "latency_ms": round((time.perf_counter() - t0) * 1000.0, 2),
            }

    lat = payload.get("lat")
    lon = payload.get("lon")
    if lat is None or lon is None:
        origin_name = str(payload.get("origin") or "Hồ Hoàn Kiếm")
        lms = tools._load("hanoi_landmarks.json") or []
        hits = tools._find_place(origin_name, lms)
        if not hits:
            return 400, {"ok": False, "error": f"Không định vị được vị trí '{origin_name}' tại Hà Nội."}
        lat, lon = float(hits[0]["lat"]), float(hits[0]["lon"])

    dest_lat, dest_lon = payload.get("dest_lat"), payload.get("dest_lon")
    if (dest_lat is None or dest_lon is None) and payload.get("destination"):
        lms = tools._load("hanoi_landmarks.json") or []
        dhits = tools._find_place(str(payload["destination"]), lms)
        if dhits:
            dest_lat, dest_lon = float(dhits[0]["lat"]), float(dhits[0]["lon"])

    soc_pct = payload.get("current_soc", payload.get("soc_pct", 35.0))
    vehicle_type = str(payload.get("vehicle_type") or "o_to")
    if vehicle_type not in ("o_to", "xe_may"):
        return 400, {"ok": False, "error": "vehicle_type phải là 'o_to' hoặc 'xe_may'."}

    hour = float(payload.get("hour", 14.0))
    weekday = int(payload.get("weekday", 0))
    weather = tools.get_weather(hour, weekday, payload.get("user_temp_c"))

    rec = mappo_policy.ENGINE.recommend(
        origin_lat=float(lat),
        origin_lon=float(lon),
        soc_pct=float(soc_pct),
        vehicle_type=vehicle_type,
        ev_model=payload.get("ev_model"),
        dest_lat=float(dest_lat) if dest_lat is not None else None,
        dest_lon=float(dest_lon) if dest_lon is not None else None,
        next_trip_km=float(payload.get("next_trip_km", 0.0)),
        hour=hour,
        weekday=weekday,
        urgent=bool(payload.get("urgent", False)),
        temp_c=float(weather.get("temp_used_c") or 24.0),
        rain_pct=float(weather.get("rain_pct") or 0.0),
        drain_factor=float(weather.get("drain_factor") or 1.0),
        record_reservation=bool(payload.get("record_reservation", False)),
    )
    return 200, {
        "ok": True,
        "blocked_by_guardrail": False,
        "recommendation": rec,
        "weather": weather,
        "latency_ms": round((time.perf_counter() - t0) * 1000.0, 2),
    }


def create_server(host: str = "0.0.0.0", port: int = 8000) -> ThreadingHTTPServer:
    """Tạo instance ThreadingHTTPServer cho CHARGEPILOT."""
    return ThreadingHTTPServer((host, port), ChargePilotHandler)


def main() -> int:
    default_host = os.environ.get("API_HOST", "0.0.0.0")
    default_port = int(os.environ.get("PORT", os.environ.get("API_PORT", "8000")))
    parser = argparse.ArgumentParser(description="CHARGEPILOT HTTP JSON API cho Android APK, Web & CI/CD")
    parser.add_argument("--host", default=default_host, help=f"Host lắng nghe (mặc định {default_host})")
    parser.add_argument("--port", type=int, default=default_port, help=f"Cổng lắng nghe (mặc định {default_port})")
    args = parser.parse_args()

    tools.USE_LIVE_OSRM = os.environ.get("USE_LIVE_OSRM", "1").strip().lower() not in ("0", "false", "no")
    tools.USE_LIVE_WEATHER = os.environ.get("USE_LIVE_WEATHER", "1").strip().lower() not in ("0", "false", "no")
    server = create_server(args.host, args.port)
    print(f"CHARGEPILOT API v{CONTRACT_VERSION} đang chạy tại http://{args.host}:{args.port} "
          f"(Android emulator: http://10.0.2.2:{args.port}) · provider={ai.MODEL_PROVIDER} "
          f"· osrm_live={tools.USE_LIVE_OSRM} · weather_live={tools.USE_LIVE_WEATHER}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang dừng CHARGEPILOT API...")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
