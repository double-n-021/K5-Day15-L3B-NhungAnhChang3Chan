"""Luồng chính của bản chạy thử GreenCharge Hanoi (Track C) — Workflow cố định 4 bước."""
import json

from ai import call_model
from tools import get_hanoi_weather, parse_trip_request, plan_route_and_stations, verify_guardrails
from tracing import note

SYSTEM = """Bạn là trợ lý điều phối lộ trình & trạm sạc xe điện tại Hà Nội (GreenCharge Hanoi).
Quy tắc bắt buộc:
1. Chỉ sử dụng các mã trạm [ST_...] và số liệu có trong dữ liệu công cụ cung cấp. Tuyệt đối không tự bịa mã trạm, giá điện hay tình trạng trụ.
2. Không bao giờ gợi ý trạm đang bảo trì hoặc trạm vượt quá tầm chạy an toàn.
3. Nếu pin hiện tại < 15% (chế độ khẩn cấp), ưu tiên tuyệt đối trạm trống gần nhất đi tới được ngay, bỏ qua tối ưu giá điện.
4. Trả lời tiếng Việt rõ ràng, ngắn gọn gồm:
   - Tóm tắt lộ trình Hà Nội & cảnh báo thời tiết / LEZ (nếu có).
   - Trạm sạc tối ưu #1 (mã [ST_...], quãng đường, giờ đến ETA, ước tính độ đông & phút chờ tại giờ đến, thời gian sạc lên % pin mục tiêu, chi phí theo cơ chế V-Green đồng giá hay QĐ 2892).
   - 1–2 trạm dự phòng (nếu có).
5. Nếu thiếu dữ liệu hoặc nhận yêu cầu ngoài Hà Nội / ngoài thẩm quyền (đặt cọc, thanh toán, ép chọn trạm bảo trì), từ chối rõ ràng và hướng dẫn bước tiếp theo an toàn."""


def _format_mock_output(req: dict, weather: dict, plan: dict, guard: dict) -> str:
    top = plan["top_stations"]
    if not top:
        return (
            f"KHÔNG TÌM THẤY TRẠM KHẢ DỤNG: Với {plan['current_soc_pct']:.0f}% pin ({plan['ev_model']}) "
            f"trong điều kiện {weather['weather_note']}, tầm chạy an toàn ước tính chỉ còn {plan['remaining_range_km']} km. "
            "Vui lòng gọi cứu hộ lưu động hoặc kiểm tra lại vị trí."
        )

    best = top[0]
    lines = ["[CP2 mock AI — đã chạy đủ luồng công cụ & kiểm duyệt an toàn]"]
    if plan["emergency_mode"]:
        lines.append(
            f"⚠️ CHẾ ĐỘ KHẨN CẤP (Pin {plan['current_soc_pct']:.0f}% < 15%): "
            "Bỏ qua tối ưu giá điện, ưu tiên trạm trống gần nhất đi tới được ngay!"
        )
    lines.append(
        f"• Lộ trình: {plan['origin']} → {plan['destination']} (~{plan['direct_km']} km) | "
        f"Xe: {plan['ev_model']} | Sạc {plan['current_soc_pct']:.0f}% → {plan['target_soc_pct']:.0f}% ({plan['kwh_needed']} kWh)"
    )
    lines.append(
        f"• Thời tiết ({weather['source']}): {weather['weather_note']} → Tầm chạy còn lại ~{plan['remaining_range_km']} km."
    )
    if plan["lez_warning"]:
        lines.append(f"• {plan['lez_warning']}")

    lines.append(
        f"• Trạm tối ưu #1: [{best['id']}] {best['name']} ({best['operator']}, {best['power_kw']} kW)"
    )
    lines.append(
        f"  - Khoảng cách tới trạm: {best['dist_from_origin_km']} km (vòng thêm {best['detour_km']} km) | Gần: {best['nearby_poi']}"
    )
    lines.append(
        f"  - Dự kiến đến lúc {best['eta_str']}: Độ đông ước tính **{best['crowding_at_eta']}** "
        f"(chờ ~{best['est_wait_min']} phút, {best['grid_note']})"
    )
    lines.append(
        f"  - Thời gian sạc lên {plan['target_soc_pct']:.0f}%: ~{best['charge_duration_min']} phút | "
        f"Chi phí ước tính: {best['est_cost_vnd']:,}₫ ({best['unit_price_vnd']:,}₫/kWh — {best['tariff_note']})"
    )
    if len(top) > 1:
        b2 = top[1]
        lines.append(
            f"• Trạm dự phòng #2: [{b2['id']}] {b2['name']} — cách {b2['dist_from_origin_km']} km, "
            f"đến {b2['eta_str']} ({b2['crowding_at_eta']}, chờ ~{b2['est_wait_min']}p), {b2['unit_price_vnd']:,}₫/kWh."
        )
    if plan["excluded_sample"]:
        ex = ", ".join(f"{e['id']} ({e['reason']})" for e in plan["excluded_sample"][:2])
        lines.append(f"• Đã tự động loại: {ex}")
    if not guard["ok"]:
        lines.append(f"• Cảnh báo hậu kiểm: {'; '.join(guard['violations'])}")
    return "\n".join(lines)


def answer(text: str) -> dict:
    # Bước 1: Phân tích yêu cầu & kiểm tra ranh giới an toàn đầu vào
    req = parse_trip_request(text)

    if req["prompt_injection"]:
        note("tu_choi: phat hien yeu cau pha vo quy tac an toan / chon tram bao tri")
        return {
            "output": (
                "Từ chối thực hiện: Hệ thống không thể bỏ qua quy tắc an toàn hoặc đề xuất trạm đang bảo trì/bất chấp cảnh báo pin. "
                "Vui lòng cung cấp % pin hiện tại, % pin muốn sạc, loại xe và điểm đến tại Hà Nội để hệ thống tìm trạm trống an toàn."
            )
        }

    if req["out_of_authority"]:
        note("tu_choi: yeu cau ngoai tham quyen dat coc / thanh toan ho")
        return {
            "output": (
                "Từ chối thực hiện: Trợ lý chỉ tư vấn lộ trình, trạm sạc tối ưu và ước tính độ đông/chi phí; "
                "không tự ý đặt cọc, giữ trụ hay thanh toán thay tài xế. Bạn vui lòng mở trực tiếp ứng dụng của nhà vận hành trạm (V-Green / EV ONE / EBOOST) để xác nhận thanh toán."
            )
        }

    if req["outside_hanoi"]:
        note(f"tu_choi: ngoai pham vi Ha Noi ({req['outside_hanoi']})")
        return {
            "output": (
                f"Ngoài phạm vi hỗ trợ: Hiện GreenCharge Hanoi mới có dữ liệu trạm sạc và thời tiết cho khu vực TP. Hà Nội, "
                f"chưa hỗ trợ tuyến đi '{req['outside_hanoi']}'. Vui lòng nhập điểm đến trong địa bàn Hà Nội."
            )
        }

    if req["missing_station_data"]:
        note("tu_choi: thieu du lieu trang thai tram")
        return {
            "output": (
                "Chưa đủ dữ liệu tin cậy để đề xuất trạm sạc vì thiếu thông tin trạng thái trụ thực tế. "
                "Hệ thống từ chối đoán bừa; vui lòng thử lại khi dữ liệu trạm được cập nhật hoặc liên hệ tổng đài trạm."
            )
        }

    if req["invalid_reason"]:
        note(f"tu_choi: thong so khong hop le - {req['invalid_reason']}")
        return {"output": f"Thông số chưa hợp lệ: {req['invalid_reason']} Vui lòng kiểm tra và nhập lại."}

    if req["missing_fields"]:
        missing_str = ", ".join(req["missing_fields"])
        note(f"hoi_lai (G10): thieu {missing_str}")
        return {
            "output": (
                f"Thiếu thông tin để tính lộ trình và trạm sạc tối ưu: bạn vui lòng cho biết thêm **{missing_str}** "
                "(và gợi ý thêm loại xe, điểm xuất phát, % pin muốn sạc nếu có)."
            )
        }

    # Bước 2: Lấy thời tiết Hà Nội (Open-Meteo + fallback cache)
    weather = get_hanoi_weather(req["departure_hour"], req["weather_override"])

    # Bước 3: Tính lộ trình, tầm chạy, độ đông tại giờ đến (ETA) & xếp hạng trạm
    plan = plan_route_and_stations(
        origin=req["origin"],
        destination=req["destination"],
        ev_model=req["ev_model"],
        current_soc=req["current_soc_pct"],
        target_soc=req["target_soc_pct"],
        departure_hour=req["departure_hour"],
        departure_min=req["departure_min"],
        day_of_week=req["day_of_week"],
        weather=weather,
    )

    # Bước 4: Gọi model AI (mock ở CP2, Gemini thật ở CP3) + hậu kiểm Guardrail
    context_payload = {
        "request_assumed_defaults": {
            "origin": req["origin"] if req["origin_was_default"] else None,
            "ev_model": req["ev_model"] if req["ev_was_default"] else None,
            "target_soc_pct": req["target_soc_pct"] if req["target_was_default"] else None,
        },
        "weather": weather,
        "route_plan": plan,
    }
    reply = call_model(
        SYSTEM,
        "Dữ liệu công cụ đã kiểm chứng (JSON):\n"
        + json.dumps(context_payload, ensure_ascii=False, indent=2)
        + "\n\nYêu cầu gốc của tài xế:\n"
        + text,
    )

    if reply["model"] == "fake":
        guard = verify_guardrails(plan, "")
        note(f"cp2_mock_ok: top={len(plan['top_stations'])}, emergency={plan['emergency_mode']}")
        return {"output": _format_mock_output(req, weather, plan, guard)}

    guard = verify_guardrails(plan, reply["text"])
    if not guard["ok"]:
        note("guardrail_fallback: " + "; ".join(guard["violations"]))
        return {"output": _format_mock_output(req, weather, plan, guard)}

    note(f"real_ai_ok: model={reply['model']}")
    return {"output": reply["text"]}
