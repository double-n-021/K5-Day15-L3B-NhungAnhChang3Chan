"""Demo-only conversational front-door layer in front of CHARGEPILOT (agent.py).

Design invariants:
- Placed strictly in front of `agent.answer()` for `POST /api/v1/converse` (demo-only).
- Never modifies or sits inside the scored eval path (`agent.py`, `tools.py`, `run.py eval`).
- Routing & slot merging are 100% deterministic in code first (`parse_request` + `guardrails.pre_check_input`).
- Refusals (booking/payment, OTP, prompt injection, out-of-scope) ALWAYS delegate raw input to `agent.py`.
- On handoffs, `claude-haiku-5-5` may add at most one short intro line validated by `check_answer` / L3 guardrails;
  `agent.answer()` output stays verbatim.
"""
from __future__ import annotations

import os
import re
import threading

import agent
import ai
import guardrails
import tools

PARTIAL_OFFER_TEXT = "Bạn có muốn mình tìm trạm sạc không?"
MAX_HISTORY_MESSAGES = 10
MAX_INTRO_CHARS = 180

VAGUE_BATTERY_RE = re.compile(
    r"hết pin|sắp hết pin|cạn pin|pin yếu|pin tụt|tụt pin|yếu pin|"
    r"cần sạc|muốn sạc|tìm trạm sạc|trạm sạc gần|sạc ở đâu",
    re.I,
)
YES_RE = re.compile(
    r"^\s*(?:có|co|ừ|u|uh|uhm|ok|okay|được|duoc|vâng|vang|dạ|da|"
    r"nhờ bạn|tìm đi|tìm giúp|tìm cho mình|tìm luôn|chốt|yes|yep)\b",
    re.I,
)
NO_RE = re.compile(
    r"^\s*(?:không|khong|ko|k|thôi|thoi|chưa cần|chua can|để sau|de sau|"
    r"khỏi|khoi|không cần|khong can|no|nope)\b",
    re.I,
)

EXPLICIT_TARGET_RE = re.compile(r"(?:lên|cần|tới|đến|đạt).{0,14}\d{1,3}\s*%", re.I)
FULL_CHARGE_RE = re.compile(r"sạc đầy|đầy pin", re.I)
DEPART_TIME_RE = re.compile(
    r"(?:đi lúc|khởi hành|hẹn lúc|hẹn|đi tiếp lúc)\s*\d{1,2}|"
    r"\d{1,2}(?::\d{2}|\s*(?:h|giờ)\d{0,2})\s*(?:đi|khởi hành|tới|đến|qua|sang|về)",
    re.I,
)
NOW_TIME_RE = re.compile(r"bây giờ|hiện tại|lúc này|giờ là", re.I)
DEST_ONLY_RE = re.compile(r"(?:^|[\s,])(?:đi|tới|đến|sang|qua|về)\s+", re.I)
ORIGIN_CUE_RE = re.compile(r"(?:đang ở|từ\s+|(?:^|[\s,])ở\s+)", re.I)
FILLER_PLACE_PHRASES = frozenset({
    "đâu", "đây", "nào", "chỗ nào", "đâu nhỉ", "đâu vậy", "đâu thế", "gần đây", "gần nhất",
})
OSM_CODE_RE = re.compile(r"\b(?:ST_OSM_\d+|MOTO_OSM_\d+)\b")

FRONT_DOOR_CHAT_SYSTEM = """Bạn là trợ lý mở đầu của CHARGEPILOT — trợ lý tìm trạm sạc xe điện tại Hà Nội.
Xưng "mình", gọi người dùng là "bạn". Trả lời tự nhiên, thân thiện, ngắn gọn (2–4 câu tiếng Việt).

Chủ đề ĐƯỢC PHÉP trả lời:
1. Chào hỏi, mở đầu cuộc trò chuyện.
2. CHARGEPILOT làm được gì: gợi ý Top 3 trạm sạc ô tô (mã [ST_...]) hoặc điểm sạc xe máy điện (mã [MOTO_HN_...]) tại Hà Nội; tính tầm chạy an toàn theo % pin & thời tiết (có trừ biên an toàn 20%); chọn khung giờ tránh cao điểm 17:30–22:30 (T2–T7); chế độ cứu pin khi < 15% (sạc ngay); gợi ý sạc xanh & ước tính Green Score.
3. Green Score & Bảng xếp hạng (Leaderboard): điểm thưởng dự kiến khi sạc ngoài cao điểm (+20), trùng giờ nắng cao (+15), khung đêm 22:30–06:00 (+10), trạm biểu giá bậc giờ QĐ 2892 hoặc sạc tại nhà ngoài cao điểm (+10). Điểm CHỈ được cộng vào Leaderboard khi tài xế tự xác nhận, không tự cộng.
4. Cách đọc kết quả của CHARGEPILOT: mã trạm [ST_...] / [MOTO_HN_...], trạng thái trụ (trống / đông / bảo trì đã bị lọc; xe máy ghi "chưa xác minh"), nhãn "chưa kiểm tầm" khi thiếu thông số xe, khung giờ HH:MM–HH:MM, và dòng chiến lược điều phối (MAPPO).

Luật BẮT BUỘC:
- KHÔNG tự bịa tên trạm, mã trạm, số km, tầm chạy, hay khung giờ sạc.
- KHÔNG tự từ chối hay đồng ý đặt chỗ, đặt cọc, thanh toán, xử lý OTP, hay hỗ trợ ngoài Hà Nội (hệ thống backend sẽ xử lý riêng nếu người dùng hỏi).
- Nếu người dùng hỏi ngoài các chủ đề trên (tin tức, thời tiết chung chung, code, chuyện phiếm...), hãy khéo léo nhắc mình chỉ hỗ trợ về CHARGEPILOT & sạc xe điện tại Hà Nội, và mời bạn cho biết % pin hoặc vị trí nếu cần tìm trạm."""

FRONT_DOOR_INTRO_SYSTEM = """Bạn là lớp dẫn nhập ngắn cho CHARGEPILOT.
Hãy viết ĐÚNG 1 câu dẫn ngắn bằng tiếng Việt (tối đa 15 từ) để mở đầu trước kết quả trạm sạc bên dưới.
Luật BẮT BUỘC:
- Xưng "mình", gọi người dùng là "bạn".
- KHÔNG chứa mã trạm ([ST_...], [MOTO_HN_...]), tên trạm, số km, % pin, khung giờ, hay lời hứa đặt chỗ/thanh toán/cộng điểm.
- Chỉ trả về đúng 1 câu ngắn, không xuống dòng."""

SESSION_LOCK = threading.Lock()
CONVERSE_SESSIONS: dict[str, dict] = {}


def _front_door_model() -> str:
    return (os.environ.get("FRONT_DOOR_MODEL") or "claude-haiku-5-5").strip()


def _empty_slots() -> dict:
    return {
        "vehicle": None,
        "current_pct": None,
        "target_pct": None,
        "origin": None,
        "place_phrase": None,
        "destination": None,
        "now_h": None,
        "next_h": None,
        "next_day": False,
        "weekday": None,
        "user_temp_c": None,
        "time_is_departure": False,
    }


def _clone_slots(slots: dict) -> dict:
    cloned = dict(slots)
    if slots.get("vehicle") is not None:
        cloned["vehicle"] = dict(slots["vehicle"])
    if slots.get("origin") is not None:
        cloned["origin"] = dict(slots["origin"])
    if slots.get("destination") is not None:
        cloned["destination"] = dict(slots["destination"])
    return cloned


def _serialize_slots(slots: dict) -> dict:
    return {
        "vehicle": dict(slots["vehicle"]) if slots.get("vehicle") else None,
        "current_pct": slots.get("current_pct"),
        "target_pct": slots.get("target_pct"),
        "origin": slots["origin"]["name"] if slots.get("origin") else None,
        "place_phrase": slots.get("place_phrase"),
        "destination": slots["destination"]["name"] if slots.get("destination") else None,
        "now_h": tools.fmt_h(slots["now_h"]) if slots.get("now_h") is not None else None,
        "next_h": tools.fmt_h(slots["next_h"]) if slots.get("next_h") is not None else None,
        "next_day": bool(slots.get("next_day", False)),
        "weekday": tools.DAY_NAMES[slots["weekday"]] if slots.get("weekday") is not None else None,
        "user_temp_c": slots.get("user_temp_c"),
    }


def reset_session(session_id: str) -> bool:
    """Clear front-door state for a single session_id."""
    sid = (session_id or "").strip()
    if not sid:
        return False
    with SESSION_LOCK:
        return CONVERSE_SESSIONS.pop(sid, None) is not None


def clear_all_sessions() -> None:
    """Clear all in-memory front-door sessions (used in tests)."""
    with SESSION_LOCK:
        CONVERSE_SESSIONS.clear()


def _explicit_target_pct(message: str, req: dict) -> int | None:
    norm_msg = tools._norm(message)
    if EXPLICIT_TARGET_RE.search(norm_msg):
        return int(req["target_pct"])
    if ("100%" in norm_msg and req.get("current_pct") != 100) or FULL_CHARGE_RE.search(norm_msg):
        return 100
    return None


def _explicit_vehicle(message: str, req: dict, existing_vehicle: dict | None) -> dict | None:
    v = req.get("vehicle") or {}
    if v.get("model") is not None:
        return dict(v)
    norm_msg = tools._norm(message)
    if v.get("vehicle_type") == "xe_may" and "xe máy" in norm_msg:
        if not existing_vehicle or existing_vehicle.get("vehicle_type") != "xe_may":
            return dict(v)
    return None


def extract_explicit_slots(message: str, req: dict, existing_slots: dict) -> dict:
    """Extract only slots explicitly present in `message` (never overwrite with parse_request defaults)."""
    delta: dict = {}
    norm_msg = tools._norm(message)

    if req.get("current_pct") is not None:
        delta["current_pct"] = int(req["current_pct"])

    explicit_target = _explicit_target_pct(message, req)
    if explicit_target is not None:
        delta["target_pct"] = explicit_target

    explicit_veh = _explicit_vehicle(message, req, existing_slots.get("vehicle"))
    if explicit_veh is not None:
        delta["vehicle"] = explicit_veh

    # Time fields: parse_request leaves now_h=None when omitted; handle single departure time carefully.
    now_h = req.get("now_h")
    next_h = req.get("next_h")
    if now_h is not None and next_h is not None:
        delta["now_h"] = float(now_h)
        delta["next_h"] = float(next_h)
        delta["next_day"] = bool(req.get("next_day", False))
        delta["time_is_departure"] = False
    elif now_h is not None:
        is_depart = bool(DEPART_TIME_RE.search(message) and not NOW_TIME_RE.search(message))
        is_now = bool(NOW_TIME_RE.search(message))
        prev_now = existing_slots.get("now_h")
        if prev_now is not None and is_depart:
            delta["next_h"] = float(now_h)
            delta["next_day"] = ("mai" in norm_msg) or (float(now_h) < float(prev_now))
        elif prev_now is not None and existing_slots.get("next_h") is None and existing_slots.get("time_is_departure") and is_now:
            delta["next_h"] = float(prev_now)
            delta["next_day"] = float(prev_now) < float(now_h)
            delta["now_h"] = float(now_h)
            delta["time_is_departure"] = False
        else:
            delta["now_h"] = float(now_h)
            delta["time_is_departure"] = is_depart

    if req.get("weekday") is not None:
        delta["weekday"] = int(req["weekday"])

    if req.get("user_temp_c") is not None:
        delta["user_temp_c"] = float(req["user_temp_c"])

    # Location fields: distinguish single-landmark destination phrasing from origin when origin already exists.
    origin = req.get("origin")
    dest = req.get("destination")
    if origin and dest:
        delta["origin"] = dict(origin)
        delta["destination"] = dict(dest)
        delta["place_phrase"] = None
    elif origin:
        if (
            existing_slots.get("origin") is not None
            and DEST_ONLY_RE.search(norm_msg)
            and not ORIGIN_CUE_RE.search(norm_msg)
        ):
            delta["destination"] = {
                "name": origin["name"],
                "lat": origin["lat"],
                "lon": origin["lon"],
            }
        else:
            delta["origin"] = dict(origin)
            delta["place_phrase"] = None
    else:
        phrase = (req.get("place_phrase") or "").strip()
        if phrase and phrase.lower() not in FILLER_PLACE_PHRASES and existing_slots.get("origin") is None:
            delta["place_phrase"] = phrase

    return delta


def build_handoff_request(slots: dict, current_message: str = "", current_req: dict | None = None) -> str:
    """Serialize merged session slots into one clean Vietnamese request for `agent.answer()`."""
    parts: list[str] = []

    v = slots.get("vehicle")
    if v and v.get("model"):
        parts.append(f"Xe {v['model']}")
    elif v and v.get("vehicle_type") == "xe_may":
        parts.append("Xe máy điện")

    if slots.get("current_pct") is not None:
        parts.append(f"pin còn {int(slots['current_pct'])}%")

    if slots.get("target_pct") is not None:
        parts.append(f"muốn sạc lên {int(slots['target_pct'])}%")

    if slots.get("origin"):
        parts.append(f"đang ở {slots['origin']['name']}")
    elif slots.get("place_phrase"):
        parts.append(f"đang ở {slots['place_phrase']}")

    wd_str = f" {tools.DAY_NAMES[slots['weekday']]}" if slots.get("weekday") is not None else ""
    if slots.get("now_h") is not None:
        parts.append(f"lúc {tools.fmt_h(slots['now_h'])}{wd_str}")
    elif wd_str:
        parts.append(wd_str.strip())

    dest = slots.get("destination")
    if slots.get("next_h") is not None:
        tomorrow = " sáng mai" if slots.get("next_day") else ""
        dest_name = dest["name"] if dest else "tiếp"
        parts.append(f"{tools.fmt_h(slots['next_h'])}{tomorrow} đi {dest_name}")
    elif dest:
        parts.append(f"đi {dest['name']}")

    if slots.get("user_temp_c") is not None:
        temp_val = float(slots["user_temp_c"])
        temp_txt = str(int(temp_val)) if temp_val.is_integer() else str(temp_val)
        parts.append(f"nhiệt độ {temp_txt}°C")

    base = ", ".join(parts).strip()
    if base:
        base += "."

    flags = (current_req or {}).get("flags") or {}
    has_situational = any(
        flags.get(k) for k in ("home_charging", "no_charger", "mentions_swap", "asks_charge_time", "user_says_free")
    ) or bool((current_req or {}).get("mentioned_station"))

    clean_msg = (current_message or "").strip()
    if has_situational and clean_msg:
        return f"{base} {clean_msg}".strip() if base else clean_msg
    return base or clean_msg


def _fake_chat_reply(message: str, declined: bool = False) -> str:
    if declined:
        return (
            "Ok bạn, mình chưa tìm trạm vội. Khi nào cần kiểm tra trạm sạc hay pin xuống thấp, "
            "bạn cứ nhắn % pin hoặc vị trí ở Hà Nội cho mình nhé!"
        )
    low = tools._norm(message)
    if re.search(r"green score|điểm xanh|leaderboard|bảng xếp hạng|tính điểm|cộng điểm", low):
        return (
            "Green Score là điểm thưởng dự kiến khi bạn chọn sạc tiết kiệm năng lượng: "
            "+20 điểm nếu tránh cao điểm 17:30–22:30, +15 điểm khi trùng giờ nắng cao, "
            "+10 điểm khung đêm 22:30–06:00 và +10 điểm tại trạm biểu giá QĐ 2892 hoặc sạc tại nhà ngoài cao điểm. "
            "Điểm chỉ được ghi nhận vào Green Score Leaderboard khi bạn bấm xác nhận."
        )
    if re.search(r"đọc kết quả|mã trạm|chưa xác minh|chưa kiểm tầm|mappo|ký hiệu", low):
        return (
            "Trong kết quả CHARGEPILOT, mã [ST_...] là trụ ô tô và [MOTO_HN_...] là điểm sạc xe máy; "
            "\"chưa xác minh\" nghĩa là điểm xe máy chưa có trạng thái thời gian thực, còn \"chưa kiểm tầm\" "
            "xuất hiện khi xe chưa có thông số pin/tầm chạy trong dữ liệu. Khung giờ HH:MM–HH:MM là giờ sạc gợi ý an toàn."
        )
    if re.search(r"làm được gì|tính năng|giúp gì|hỗ trợ gì|chargepilot là gì|giới thiệu", low):
        return (
            "Mình là trợ lý mở đầu của CHARGEPILOT tại Hà Nội. Mình có thể chuyển yêu cầu sang hệ thống "
            "gợi ý Top 3 trạm sạc phù hợp loại xe, tính tầm chạy an toàn theo thời tiết, chọn khung giờ tránh cao điểm "
            "(hoặc sạc ngay nếu pin dưới 15%), và ước tính điểm Green Score."
        )
    if re.search(r"^(?:chào|xin chào|hello|hi|hey|alo|chào bạn)\b", low):
        return (
            "Chào bạn! Mình là trợ lý mở đầu của CHARGEPILOT. Bạn có thể hỏi mình về cách hoạt động, "
            "Green Score, cách đọc kết quả, hoặc nhắn dòng xe, % pin và vị trí ở Hà Nội để mình tìm trạm sạc nhé."
        )
    return (
        "Mình chỉ hỗ trợ trao đổi về CHARGEPILOT, Green Score, cách đọc kết quả và tìm trạm sạc xe điện tại Hà Nội. "
        "Nếu bạn đang cần tìm điểm sạc, hãy cho mình biết % pin và vị trí hiện tại ở Hà Nội nhé!"
    )


def _fake_intro(handoff_reason: str) -> str:
    if handoff_reason == "rescue":
        return "Pin dưới 15%, mình chuyển ngay sang chế độ cứu pin cho bạn:"
    return "Mình đã tổng hợp thông tin và kiểm tra trạm sạc phù hợp cho bạn:"


def _call_front_door_llm(system: str, messages: list[dict], kind: str, context: dict | None = None) -> dict:
    """Call claude-haiku-5-5 (or deterministic fake mode when MODEL_PROVIDER=fake)."""
    ctx = context or {}
    if ai.MODEL_PROVIDER == "anthropic" and ai.API_KEY:
        model_name = _front_door_model()
        data = ai.post_json(
            ai.URL_CLAUDE,
            {"x-api-key": ai.API_KEY, "anthropic-version": "2023-06-01"},
            {
                "model": model_name,
                "max_tokens": 2048,
                "system": system,
                "output_config": {"effort": "low"},
                "messages": messages,
            },
        )
        u = data["usage"]
        tokens_in = (
            u["input_tokens"]
            + u.get("cache_creation_input_tokens", 0)
            + u.get("cache_read_input_tokens", 0)
        )
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        if data.get("stop_reason") in ("refusal", "max_tokens"):
            text = ""
        return {
            "text": text.strip(),
            "model": model_name,
            "tokens_in": int(tokens_in),
            "tokens_out": int(u["output_tokens"]),
        }

    if kind == "intro":
        text = _fake_intro(ctx.get("handoff_reason", ""))
    else:
        last_user = ctx.get("user_message") or (messages[-1]["content"] if messages else "")
        text = _fake_chat_reply(last_user, declined=bool(ctx.get("declined")))
    return {"text": text, "model": "fake", "tokens_in": 0, "tokens_out": 0}


def _validate_handoff_intro(intro: str, agent_output: str, forbid_tokens: list[str]) -> str | None:
    """Allow a short 1-line intro ONLY if agent_output stays verbatim and guardrails pass."""
    clean = (intro or "").strip()
    if not clean or "\n" in clean or "\r" in clean or len(clean) > MAX_INTRO_CHARS:
        return None
    if tools.CODE_RE.search(clean) or OSM_CODE_RE.search(clean):
        return None
    if guardrails.FORBIDDEN_ACTION_CLAIMS_RE.search(clean):
        return None

    combined = f"{clean}\n\n{agent_output}"
    top_codes = tools.CODE_RE.findall(agent_output)
    verdict = guardrails.post_check_output(combined, agent_output, top_codes, [], forbid_tokens)
    if not verdict["ok"]:
        return None
    return clean


def _append_history(session: dict, user_text: str, assistant_text: str) -> None:
    session["history"].append({"role": "user", "content": user_text})
    session["history"].append({"role": "assistant", "content": assistant_text})
    if len(session["history"]) > MAX_HISTORY_MESSAGES:
        del session["history"][:-MAX_HISTORY_MESSAGES]


def _run_handoff(
    session: dict,
    session_id: str,
    raw_message: str,
    handoff_query: str,
    handoff_reason: str,
    l1: dict,
    answer_fn,
) -> dict:
    fn = answer_fn or agent.answer
    result = fn(handoff_query)
    agent_output = result.get("output", "") if isinstance(result, dict) else str(result)

    otp_tokens = list(l1.get("otp_tokens") or [])
    safe_handoff_query = handoff_query
    safe_user_msg = raw_message
    if l1.get("otp") and otp_tokens:
        for tok in otp_tokens:
            agent_output = agent_output.replace(tok, "[REDACTED_OTP]")
            safe_handoff_query = safe_handoff_query.replace(tok, "[REDACTED_OTP]")
            safe_user_msg = safe_user_msg.replace(tok, "[REDACTED_OTP]")

    intro_text: str | None = None
    fd_model = "none"
    fd_tokens_in = 0
    fd_tokens_out = 0

    # Refusal turns never get a front-door intro: return agent.py's refusal verbatim.
    if handoff_reason != "refusal":
        try:
            intro_prompt = (
                f"Loại chuyển luồng: {handoff_reason}\n"
                f"Tin nhắn người dùng: {safe_user_msg}"
            )
            llm_res = _call_front_door_llm(
                FRONT_DOOR_INTRO_SYSTEM,
                [{"role": "user", "content": intro_prompt}],
                kind="intro",
                context={"handoff_reason": handoff_reason},
            )
            fd_model = llm_res["model"]
            fd_tokens_in = llm_res["tokens_in"]
            fd_tokens_out = llm_res["tokens_out"]
            intro_text = _validate_handoff_intro(llm_res["text"], agent_output, otp_tokens)
        except Exception:
            intro_text = None

    reply = f"{intro_text}\n\n{agent_output}" if intro_text else agent_output

    with SESSION_LOCK:
        cur = CONVERSE_SESSIONS.setdefault(
            session_id,
            {"slots": _empty_slots(), "pending_offer": False, "history": [], "turns": 0},
        )
        cur["slots"] = _clone_slots(session["slots"])
        cur["pending_offer"] = False
        cur["turns"] += 1
        _append_history(cur, safe_user_msg, reply)
        slots_snapshot = _serialize_slots(cur["slots"])

    return {
        "session_id": session_id,
        "action": "handoff",
        "handoff_reason": handoff_reason,
        "reply": reply,
        "output": reply,
        "intro": intro_text,
        "agent_output": agent_output,
        "handoff_query": safe_handoff_query,
        "slots": slots_snapshot,
        "front_door_model": fd_model,
        "tokens_in": fd_tokens_in,
        "tokens_out": fd_tokens_out,
    }


def converse(session_id: str, message: str, answer_fn=None) -> dict:
    """Process one conversational turn via code-first routing before `agent.answer()`."""
    clean_msg = (message or "").strip()
    req = tools.parse_request(clean_msg)
    l1 = guardrails.pre_check_input(clean_msg, req)

    with SESSION_LOCK:
        existing = CONVERSE_SESSIONS.setdefault(
            session_id,
            {"slots": _empty_slots(), "pending_offer": False, "history": [], "turns": 0},
        )
        session = {
            "slots": _clone_slots(existing["slots"]),
            "pending_offer": bool(existing["pending_offer"]),
            "history": list(existing["history"]),
            "turns": int(existing["turns"]),
        }

    # Rule 1: Refusal flags always go straight to agent.py with raw message (no slot merge, no intro).
    if l1["booking_or_payment"] or l1["otp"] or l1["injection"] or l1["out_of_scope_place"]:
        return _run_handoff(
            session=session,
            session_id=session_id,
            raw_message=clean_msg,
            handoff_query=clean_msg,
            handoff_reason="refusal",
            l1=l1,
            answer_fn=answer_fn,
        )

    delta = extract_explicit_slots(clean_msg, req, session["slots"])
    vague_hit = bool(VAGUE_BATTERY_RE.search(clean_msg))
    flags = req.get("flags") or {}
    has_charging_flag = any(
        flags.get(k) for k in ("home_charging", "no_charger", "mentions_swap", "asks_charge_time", "asks_need_charge")
    ) or bool(req.get("mentioned_station"))
    has_current_signal = bool(delta) or vague_hit or has_charging_flag

    # Trap #1 protection: only merge slots explicitly found in this turn.
    session["slots"].update(delta)

    # Rule 2: < 15% battery in this turn triggers rescue handoff immediately (even after prior "no" — Trap #2).
    if req.get("current_pct") is not None and int(req["current_pct"]) < tools.RESCUE_PCT:
        handoff_query = build_handoff_request(session["slots"], clean_msg, req)
        return _run_handoff(
            session=session,
            session_id=session_id,
            raw_message=clean_msg,
            handoff_query=handoff_query,
            handoff_reason="rescue",
            l1=l1,
            answer_fn=answer_fn,
        )

    # Rule 3: Current charging signal + merged battery % & location -> hand off immediately.
    if has_current_signal and session["slots"].get("current_pct") is not None and session["slots"].get("origin") is not None:
        handoff_query = build_handoff_request(session["slots"], clean_msg, req)
        return _run_handoff(
            session=session,
            session_id=session_id,
            raw_message=clean_msg,
            handoff_query=handoff_query,
            handoff_reason="battery_and_location",
            l1=l1,
            answer_fn=answer_fn,
        )

    # Rule 4: Pending offer confirmation / decline (when no new slot signal arrived).
    declined = False
    if session["pending_offer"] and not has_current_signal:
        if YES_RE.search(clean_msg):
            handoff_query = build_handoff_request(session["slots"], clean_msg, req)
            return _run_handoff(
                session=session,
                session_id=session_id,
                raw_message=clean_msg,
                handoff_query=handoff_query,
                handoff_reason="user_confirmed",
                l1=l1,
                answer_fn=answer_fn,
            )
        if NO_RE.search(clean_msg):
            declined = True
            session["pending_offer"] = False

    # Rule 5: Partial charging signal -> ask before handing off.
    if has_current_signal:
        with SESSION_LOCK:
            cur = CONVERSE_SESSIONS.setdefault(
                session_id,
                {"slots": _empty_slots(), "pending_offer": False, "history": [], "turns": 0},
            )
            cur["slots"] = _clone_slots(session["slots"])
            cur["pending_offer"] = True
            cur["turns"] += 1
            _append_history(cur, clean_msg, PARTIAL_OFFER_TEXT)
            slots_snapshot = _serialize_slots(cur["slots"])
        return {
            "session_id": session_id,
            "action": "partial_prompt",
            "handoff_reason": None,
            "reply": PARTIAL_OFFER_TEXT,
            "output": PARTIAL_OFFER_TEXT,
            "intro": None,
            "agent_output": None,
            "handoff_query": None,
            "slots": slots_snapshot,
            "front_door_model": "code",
            "tokens_in": 0,
            "tokens_out": 0,
        }

    # Rule 6: Nothing detected (or user declined partial offer) -> front-door chat (claude-haiku-5-5).
    messages = list(session["history"][-6:])
    user_turn = (
        f"(Người dùng vừa từ chối tìm trạm ở lượt này, hãy xác nhận nhẹ nhàng bằng tiếng Việt.)\n{clean_msg}"
        if declined else clean_msg
    )
    messages.append({"role": "user", "content": user_turn})
    llm_res = _call_front_door_llm(
        FRONT_DOOR_CHAT_SYSTEM,
        messages,
        kind="chat",
        context={"user_message": clean_msg, "declined": declined},
    )
    chat_reply = llm_res["text"] or _fake_chat_reply(clean_msg, declined=declined)

    with SESSION_LOCK:
        cur = CONVERSE_SESSIONS.setdefault(
            session_id,
            {"slots": _empty_slots(), "pending_offer": False, "history": [], "turns": 0},
        )
        cur["slots"] = _clone_slots(session["slots"])
        cur["pending_offer"] = False
        cur["turns"] += 1
        _append_history(cur, clean_msg, chat_reply)
        slots_snapshot = _serialize_slots(cur["slots"])

    return {
        "session_id": session_id,
        "action": "chat",
        "handoff_reason": None,
        "reply": chat_reply,
        "output": chat_reply,
        "intro": None,
        "agent_output": None,
        "handoff_query": None,
        "slots": slots_snapshot,
        "front_door_model": llm_res["model"],
        "tokens_in": llm_res["tokens_in"],
        "tokens_out": llm_res["tokens_out"],
    }
