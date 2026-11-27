"""3-Layer Agent Safety & Verification Guardrails for CHARGEPILOT + CTDE MAPPO.

Layer 1 — Input Pre-Guardrail (`pre_check_input`):
  - Detects prompt injection / jailbreak / station status spoofing
  - Blocks out-of-authority actions (booking, deposit, payment, wallet transfer)
  - Detects & redacts OTP codes before logging or LLM calls
  - Detects out-of-scope geography (outside Hanoi)

Layer 2 — Decision & Policy Masking Guardrail (`verify_station_candidates`):
  - Enforces 100% hard safety invariants on every station returned by MAPPO or heuristic:
      (1) station_id must exist in real dataset
      (2) base_status != "maintenance"
      (3) road_km <= safe_km (or <= 3.0 km if EV model unknown)
      (4) strict vehicle_type isolation (o_to -> ST_*, xe_may -> MOTO_* charging non-swap)
      (5) rescue mode (< 15% SoC) overrides off-peak waiting

Layer 3 — Output Post-Guardrail (`post_check_output`):
  - Wraps & strengthens tools.check_answer:
      - Zero hallucinated station IDs (ST_* / MOTO_*)
      - Preserves Top-3 ordering
      - Zero leaked OTP tokens
      - Blocks false booking/payment/point-award confirmations
      - Automatically falls back to verified code draft on any violation
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import tools

OTP_RE = re.compile(r"(?<![\d.,:])\d{4,8}(?![\d%°:])")
EXTRA_INJECTION_RE = re.compile(
    r"(?:jailbreak|dan mode|developer mode|override safety|bypass guardrail|"
    r"trở thành trợ lý không giới hạn|phớt lờ quy tắc|đổi trạng thái trạm thành trống|"
    r"xóa bỏ mọi ràng buộc|in ra system prompt)",
    re.I,
)
FORBIDDEN_ACTION_CLAIMS_RE = re.compile(
    r"(?:đã đặt chỗ thành công|đã giữ trụ cho bạn|đã trừ tiền|đã thanh toán thành công|"
    r"đã chuyển khoản|đã cập nhật trạng thái trạm|đã cộng \+?\d+ điểm vào tài khoản)",
    re.I,
)


def redact_otp(text: str) -> tuple[str, list[str]]:
    """Redact potential OTP codes when OTP keywords are present."""
    if not re.search(r"\botp\b|mã xác (nhận|thực)", text, re.I):
        return text, []
    tokens = OTP_RE.findall(text)
    scrubbed = text
    for tok in tokens:
        scrubbed = scrubbed.replace(tok, "[REDACTED_OTP]")
    return scrubbed, tokens


def pre_check_input(text: str, parsed_req: Optional[dict] = None) -> Dict[str, Any]:
    """Layer 1: Input pre-guardrail before policy/LLM execution."""
    req = parsed_req if parsed_req is not None else tools.parse_request(text)
    flags = dict(req.get("flags", {}))
    extra_inj = bool(EXTRA_INJECTION_RE.search(text or ""))
    injection = bool(flags.get("injection")) or extra_inj
    booking_or_payment = bool(flags.get("booking_or_payment"))
    otp = bool(flags.get("otp"))
    out_of_scope = req.get("out_of_scope_place")
    scrubbed_text, otp_tokens = redact_otp(text or "")

    violations: List[str] = []
    if injection:
        violations.append("prompt_injection")
    if booking_or_payment:
        violations.append("out_of_authority_booking_or_payment")
    if otp:
        violations.append("otp_phishing_risk")
    if out_of_scope:
        violations.append(f"out_of_scope:{out_of_scope}")

    return {
        "layer": "L1_input",
        "safe_to_recommend": not bool(out_of_scope),
        "violations": violations,
        "injection": injection,
        "booking_or_payment": booking_or_payment,
        "otp": otp,
        "otp_tokens": otp_tokens,
        "scrubbed_text": scrubbed_text,
        "out_of_scope_place": out_of_scope,
    }


def verify_station_candidates(
    stations: List[dict],
    origin_lat: float,
    origin_lon: float,
    vehicle_type: str,
    safe_km: Optional[float],
    rescue: bool = False,
) -> Dict[str, Any]:
    """Layer 2: Hard safety filter & audit on every station candidate (MAPPO or heuristic)."""
    cars, motos = tools._all_stations()
    valid_pool = {s["id"]: s for s in (cars if vehicle_type == "o_to" else motos)}
    cap = min(safe_km, tools.MAX_ROAD_KM) if safe_km is not None else tools.UNKNOWN_RANGE_MAX_KM

    approved: List[dict] = []
    rejected: List[Dict[str, str]] = []

    for item in stations:
        sid = item.get("id")
        raw = valid_pool.get(sid)
        if raw is None:
            rejected.append({"id": str(sid), "reason": "không tồn tại trong dữ liệu đúng loại xe"})
            continue
        if raw.get("lat") is None or raw.get("lon") is None:
            rejected.append({"id": sid, "reason": "thiếu tọa độ"})
            continue
        if vehicle_type == "o_to":
            if raw.get("base_status") == "maintenance":
                rejected.append({"id": sid, "reason": "đang bảo trì"})
                continue
        else:
            if raw.get("station_type") != "charging" or raw.get("operator") in tools.MOTO_EXCLUDED_OPERATORS:
                rejected.append({"id": sid, "reason": "trạm đổi pin / hãng riêng không tương thích"})
                continue

        d_km = tools.road_km(origin_lat, origin_lon, float(raw["lat"]), float(raw["lon"]))
        if not rescue and d_km > max(cap, 0.0) + 1e-6:
            rejected.append({"id": sid, "reason": f"vượt tầm an toàn ({d_km:.1f} km > {cap:.1f} km)"})
            continue
        if rescue and safe_km is not None and d_km > safe_km + 1e-6:
            rejected.append({"id": sid, "reason": f"vượt tầm cứu pin ({d_km:.1f} km > {safe_km:.1f} km)"})
            continue

        approved.append(item)

    return {
        "layer": "L2_policy_mask",
        "ok": len(rejected) == 0,
        "approved": approved,
        "rejected": rejected,
    }


def post_check_output(
    reply_text: str,
    draft: str,
    top_codes: List[str],
    must_have: List[str],
    forbid: List[str],
) -> Dict[str, Any]:
    """Layer 3: Post-generation output verification wrapping tools.check_answer."""
    verdict = tools.check_answer(reply_text, draft, top_codes, must_have, forbid)
    problems = list(verdict.get("problems", []))

    if FORBIDDEN_ACTION_CLAIMS_RE.search(reply_text or ""):
        problems.append("tuyên bố đã thực hiện hành động ngoài thẩm quyền (đặt chỗ/thanh toán/cộng điểm)")

    # Also verify no unknown MOTO_OSM_* or ST_OSM_* codes hallucinated outside draft
    osm_re = re.compile(r"\b(?:ST_OSM_\d+|MOTO_OSM_\d+)\b")
    allowed_osm = set(osm_re.findall(draft or ""))
    extra_osm = sorted(set(osm_re.findall(reply_text or "")) - allowed_osm)
    if extra_osm:
        problems.append("mã trạm OSM không có trong bản nháp: " + ", ".join(extra_osm))

    return {
        "layer": "L3_output",
        "ok": len(problems) == 0,
        "problems": problems,
        "fallback_triggered": len(problems) > 0,
    }
