"""HTTP JSON API bọc quanh lõi CHARGEPILOT (agent.py, tools.py, ai.py, tracing.py) cho ứng dụng Android APK.

Chỉ dùng thư viện chuẩn Python (http.server.ThreadingHTTPServer). Không tự ý thay đổi logic an toàn hay
thực hiện tác động ra ngoài; điểm Green Score chỉ được ghi nhận khi người dùng xác nhận qua endpoint confirm.

Chạy server:
    python codebase/api_server.py --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import sys
import threading
import time
import uuid

CODEBASE_DIR = os.path.dirname(os.path.abspath(__file__))
if CODEBASE_DIR not in sys.path:
    sys.path.insert(0, CODEBASE_DIR)

import agent  # noqa: E402
import ai  # noqa: E402
import tools  # noqa: E402
import tracing  # noqa: E402

STATE_LOCK = threading.Lock()
TRACE_LOCK = threading.Lock()

SESSIONS: dict[str, dict] = {}
PENDING_TOKENS: dict[str, dict] = {}
LEADERBOARD: dict[str, dict] = {}


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
    if req["origin"] is None and not is_real_place_phrase:
        lat, lon = ctx.get("lat"), ctx.get("lon")
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            landmarks = tools._load("hanoi_landmarks.json") or []
            nearest = None
            best_d = 9999.0
            for lm in landmarks:
                d = tools.road_km(float(lat), float(lon), lm["lat"], lm["lon"])
                if d < best_d:
                    best_d = d
                    nearest = lm
            if nearest is not None and best_d <= 5.0:
                additions.append(f"Đang ở {nearest['name']}")

    if not additions:
        return text
    return f"{text.rstrip('. ')}. {'. '.join(additions)}."


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
    fallback_used = any("không qua check_answer" in n or "chữ rỗng" in n for n in notes)

    tts_summary = _build_tts_summary(intent_state, stations_out, charge_window, green_reward, questions, reply_text)

    if f["otp"]:
        otps = agent.OTP_RE.findall(effective_text)
        reply_text = _scrub_otp(reply_text, otps)
        tts_summary = _scrub_otp(tts_summary, otps)

    return {
        "session_id": session_id,
        "intent_state": intent_state,
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
        "green_reward": green_reward,
        "follow_up_questions": questions,
        "guardrails": {
            "passed": not bool(summary.get("errors")),
            "fallback_used": fallback_used,
            "excluded_note": excluded_note,
            "model": ", ".join(summary.get("models") or []) or ai.MODEL_PROVIDER,
            "model_calls": summary.get("model_calls", 0),
            "tool_calls": summary.get("tool_calls", 0),
            "tokens_in": summary.get("tokens_in", 0),
            "tokens_out": summary.get("tokens_out", 0),
            "latency_s": round(latency_s, 3),
        },
    }


def handle_chat(payload: dict) -> tuple[int, dict]:
    """Xử lý POST /api/v1/chat và trả (http_status, response_dict)."""
    message = str(payload.get("message") or "").strip()
    if not message:
        return 400, {"error": "Thiếu trường 'message' không rỗng."}

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
            return 502, {"error": f"{type(exc).__name__}: {exc}"}
        summary, events = tracing.end()
    latency_s = time.perf_counter() - t0

    reply_text = result.get("output", "") if isinstance(result, dict) else str(result)
    response = _compute_structured_metadata(effective_text, reply_text, session_id, summary, events, latency_s)

    otps = agent.OTP_RE.findall(effective_text) if tools.parse_request(effective_text)["flags"]["otp"] else []
    safe_saved_msg = _scrub_otp(effective_text, otps)
    with STATE_LOCK:
        SESSIONS[session_id] = {
            "last_message": safe_saved_msg,
            "last_state": response["intent_state"],
            "turns": (prev.get("turns", 0) + 1) if prev else 1,
        }

    return 200, response


def handle_green_confirm(payload: dict) -> tuple[int, dict]:
    """Xử lý POST /api/v1/green-score/confirm (chỉ cộng điểm khi người dùng xác nhận)."""
    token = str(payload.get("confirm_token") or "").strip()
    user_name = str(payload.get("user_name") or "Driver").strip() or "Driver"
    if not token:
        return 400, {"error": "Thiếu 'confirm_token'."}

    with STATE_LOCK:
        entry = PENDING_TOKENS.get(token)
        if not entry:
            return 404, {"error": "confirm_token không tồn tại hoặc đã hết hạn."}
        if entry["claimed"]:
            return 409, {"error": "confirm_token đã được xác nhận trước đó."}
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


class ChargePilotHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler cho CHARGEPILOT API."""

    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write("[API] %s - %s\n" % (self.address_string(), format % args))

    def _send_json(self, status: int, body: dict | list) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(raw)

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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/health":
            self._send_json(200, {
                "status": "ok",
                "service": "CHARGEPILOT API",
                "model_provider": ai.MODEL_PROVIDER,
                "model": ai.MODEL_NAME or "fake",
            })
            return
        if path == "/api/v1/green-score/leaderboard":
            self._send_json(200, {"leaderboard": get_leaderboard()})
            return
        self._send_json(404, {"error": f"Không tìm thấy đường dẫn {path}"})

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        payload = self._read_json()
        if payload is None:
            self._send_json(400, {"error": "Body phải là JSON object hợp lệ."})
            return
        if path == "/api/v1/chat":
            status, resp = handle_chat(payload)
            self._send_json(status, resp)
            return
        if path == "/api/v1/green-score/confirm":
            status, resp = handle_green_confirm(payload)
            self._send_json(status, resp)
            return
        self._send_json(404, {"error": f"Không tìm thấy đường dẫn {path}"})


def create_server(host: str = "0.0.0.0", port: int = 8000) -> ThreadingHTTPServer:
    """Tạo instance ThreadingHTTPServer cho CHARGEPILOT."""
    return ThreadingHTTPServer((host, port), ChargePilotHandler)


def main() -> int:
    parser = argparse.ArgumentParser(description="CHARGEPILOT HTTP JSON API cho Android APK")
    parser.add_argument("--host", default="0.0.0.0", help="Host lắng nghe (mặc định 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Cổng lắng nghe (mặc định 8000)")
    args = parser.parse_args()

    server = create_server(args.host, args.port)
    print(f"CHARGEPILOT API đang chạy tại http://127.0.0.1:{args.port} "
          f"(Android emulator: http://10.0.2.2:{args.port}) · provider={ai.MODEL_PROVIDER}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang dừng CHARGEPILOT API...")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
