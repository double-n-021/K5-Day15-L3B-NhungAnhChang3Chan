"""Các công cụ bài toán cho GreenCharge Hanoi (Track C).

Mỗi công cụ được gắn @tool để khung tracing tự động ghi tên, input, output và thời gian chạy.
Không công cụ nào gây tác động ra ngoài (chỉ đọc dữ liệu và tính toán).
"""
import json
import math
import os
import re
import urllib.request

from tracing import tool

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")


def _load_json(filename: str):
    with open(os.path.join(DATA_DIR, filename), encoding="utf-8") as f:
        return json.load(f)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _match_landmark(segment: str, landmarks: list):
    low = segment.lower()
    for lm in landmarks:
        if lm["name"].lower() in low:
            return lm
        for alias in lm.get("aliases", []):
            if alias.lower() in low:
                return lm
    return None


@tool
def parse_trip_request(text: str) -> dict:
    """Phân tích yêu cầu chuyến đi xe điện tại Hà Nội từ câu nhập tự nhiên.
    Input: text (str). Output: dict thông số chuyến đi, danh sách trường thiếu và cờ an toàn. Không tác động ra ngoài."""
    landmarks = _load_json("hanoi_landmarks.json")
    ev_models = _load_json("ev_models.json")
    low = (text or "").lower()

    # 1. Phát hiện tấn công / ngoài thẩm quyền / ngoài Hà Nội
    injection_cues = [
        "bỏ qua mọi chỉ dẫn", "ignore previous", "system prompt",
        "ép chọn trạm bảo trì", "bắt buộc chọn st_bd_03", "bắt buộc chọn st_tx_03",
        "bất chấp bảo trì", "kệ pin yếu", "bỏ qua cảnh báo",
    ]
    out_of_authority_cues = [
        "đặt cọc", "thanh toán giúp", "thanh toán hộ", "trừ tiền",
        "khóa trụ giúp", "giữ chỗ tự động", "book hộ",
    ]
    outside_hanoi_cues = [
        "đà nẵng", "tp.hcm", "tp hcm", "sài gòn", "hải phòng",
        "hạ long", "nha trang", "đà lạt", "hội an", "huế", "vũng tàu", "cần thơ",
    ]

    prompt_injection = any(c in low for c in injection_cues)
    out_of_authority = any(c in low for c in out_of_authority_cues)
    outside_hanoi = next((c for c in outside_hanoi_cues if c in low), None)
    missing_station_data = ("thiếu dữ liệu trạm" in low) or ("không có trạng thái trụ" in low)

    # 2. Tách % pin hiện tại và % pin muốn sạc
    target_soc = None
    m_target = re.search(
        r"(?:sạc\s*(?:lên|đến|tới)|muốn\s*sạc(?:\s*lên|\s*đến|\s*tới)?|mục\s*tiêu)\s*(\d+(?:\.\d+)?)\s*%",
        low,
    )
    if m_target:
        target_soc = float(m_target.group(1))

    all_pcts = [float(m.group(1)) for m in re.finditer(r"(-?\d+(?:\.\d+)?)\s*%", low)]
    current_soc = None
    m_cur = re.search(r"(?:pin(?:\s*hiện\s*tại|\s*đang|\s*còn)?|còn)\s*(-?\d+(?:\.\d+)?)\s*%", low)
    if m_cur:
        current_soc = float(m_cur.group(1))
    elif all_pcts:
        # tránh lấy nhầm target_soc làm current_soc nếu chỉ nói muốn sạc lên X%
        if target_soc is not None and len(all_pcts) == 1 and all_pcts[0] == target_soc:
            current_soc = None
        else:
            current_soc = all_pcts[0]

    # 3. Nhận diện loại xe
    matched_model = None
    for ev in ev_models:
        if ev["model"].lower() in low or any(a in low for a in ev["aliases"]):
            matched_model = ev["model"]
            break

    # 4. Nhận diện điểm đi & điểm đến tại Hà Nội
    origin = None
    destination = None
    m_route = re.search(r"(?:từ|ở|đang\s*ở)\s+([^,.;]+?)\s+(?:đi|đến|tới|sang|ra|lên|về)\s+([^,.;]+)", low)
    if m_route:
        o_lm = _match_landmark(m_route.group(1), landmarks)
        d_lm = _match_landmark(m_route.group(2), landmarks)
        if o_lm:
            origin = o_lm["name"]
        if d_lm:
            destination = d_lm["name"]

    if not destination or not origin:
        found = []
        for lm in landmarks:
            pos = low.find(lm["name"].lower())
            if pos == -1:
                for a in lm.get("aliases", []):
                    pos = low.find(a.lower())
                    if pos != -1:
                        break
            if pos != -1:
                found.append((pos, lm["name"]))
        found.sort(key=lambda x: x[0])
        ordered_names = []
        for _, name in found:
            if name not in ordered_names:
                ordered_names.append(name)
        if not origin and not destination:
            if len(ordered_names) >= 2:
                origin, destination = ordered_names[0], ordered_names[1]
            elif len(ordered_names) == 1:
                destination = ordered_names[0]
        elif not destination and len(ordered_names) >= 1:
            for nm in ordered_names:
                if nm != origin:
                    destination = nm
                    break

    # 5. Giờ đi & Thứ trong tuần
    dep_hour = 17
    dep_min = 30
    m_time = re.search(r"\b(\d{1,2})\s*(?:h|:)\s*(\d{0,2})\b", low)
    if m_time:
        dep_hour = int(m_time.group(1)) % 24
        dep_min = int(m_time.group(2)) if m_time.group(2) else 0
        if "tối" in low and dep_hour < 12:
            dep_hour += 12

    day_of_week = "Thứ Sáu"
    if "chủ nhật" in low or "cn" in low:
        day_of_week = "Chủ Nhật"
    elif "thứ bảy" in low or "thứ 7" in low or "t7" in low:
        day_of_week = "Thứ Bảy"
    elif "thứ sáu" in low or "thứ 6" in low or "t6" in low:
        day_of_week = "Thứ Sáu"

    # 6. Tín hiệu thời tiết tường minh (nếu người dùng nhập trực tiếp)
    weather_override = None
    m_temp = re.search(r"(-?\d+)\s*(?:°c|độ\s*c|độ)", low)
    if m_temp or "mưa to" in low or "mưa lớn" in low or "rét" in low:
        temp_val = float(m_temp.group(1)) if m_temp else (13.0 if "rét" in low else 24.0)
        rain_val = 85 if ("mưa to" in low or "mưa lớn" in low) else 20
        weather_override = {
            "temp_c": temp_val,
            "ghi_wm2": 120.0 if rain_val >= 70 else 350.0,
            "rain_prob_pct": rain_val,
        }

    missing_fields = []
    if current_soc is None:
        missing_fields.append("pin hiện tại (%)")
    if not destination and not outside_hanoi:
        missing_fields.append("địa điểm muốn tới tại Hà Nội")

    invalid_reason = None
    if current_soc is not None and (current_soc < 0 or current_soc > 100):
        invalid_reason = f"Phần trăm pin hiện tại không hợp lệ ({current_soc}%)."
    elif target_soc is not None and (target_soc <= 0 or target_soc > 100):
        invalid_reason = f"Phần trăm pin muốn sạc không hợp lệ ({target_soc}%)."
    elif current_soc is not None and target_soc is not None and target_soc <= current_soc:
        invalid_reason = f"Pin muốn sạc ({target_soc:.0f}%) không lớn hơn pin hiện tại ({current_soc:.0f}%) — không cần dừng sạc."

    return {
        "current_soc_pct": current_soc,
        "target_soc_pct": target_soc if target_soc is not None else 80.0,
        "target_was_default": target_soc is None,
        "ev_model": matched_model or "VinFast VF5",
        "ev_was_default": matched_model is None,
        "origin": origin or "Hồ Hoàn Kiếm",
        "origin_was_default": origin is None,
        "destination": destination,
        "departure_hour": dep_hour,
        "departure_min": dep_min,
        "day_of_week": day_of_week,
        "weather_override": weather_override,
        "missing_fields": missing_fields,
        "invalid_reason": invalid_reason,
        "outside_hanoi": outside_hanoi,
        "prompt_injection": prompt_injection,
        "out_of_authority": out_of_authority,
        "missing_station_data": missing_station_data,
    }


@tool
def get_hanoi_weather(hour: int, weather_override: dict = None) -> dict:
    """Lấy dự báo thời tiết & bức xạ mặt trời tại Hà Nội theo giờ (Open-Meteo + cache dự phòng).
    Input: hour (0-23), weather_override (dict hoặc None). Output: temp_c, ghi_wm2, rain_prob_pct, drain_factor, source. Không tác động ra ngoài."""
    h = int(hour) % 24
    if weather_override:
        temp_c = float(weather_override.get("temp_c", 24.0))
        ghi = float(weather_override.get("ghi_wm2", 200.0))
        rain = int(weather_override.get("rain_prob_pct", 20))
        source = "user-context"
    else:
        payload = None
        source = "open-meteo-fallback-cache"
        url = (
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=21.0285&longitude=105.8542"
            "&hourly=temperature_2m,shortwave_radiation,precipitation_probability"
            "&timezone=Asia%2FBangkok"
        )
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                source = "open-meteo-live"
        except Exception:
            payload = _load_json("weather_fallback.json")

        hourly = payload.get("hourly", {})
        temps = hourly.get("temperature_2m", [24.0] * 24)
        ghis = hourly.get("shortwave_radiation", [0.0] * 24)
        rains = hourly.get("precipitation_probability", [10] * 24)
        idx = min(h, len(temps) - 1)
        temp_c = float(temps[idx])
        ghi = float(ghis[idx]) if idx < len(ghis) else 0.0
        rain = int(rains[idx]) if idx < len(rains) else 10

    drain_factor = 1.0
    notes = []
    if temp_c <= 15.0:
        drain_factor += 0.15
        notes.append(f"Trời rét {temp_c:.1f}°C (ước tính hao pin thêm ~15%)")
    elif temp_c >= 36.0:
        drain_factor += 0.10
        notes.append(f"Trời nắng nóng {temp_c:.1f}°C (điều hòa làm hao pin ~10%)")
    if rain >= 70:
        drain_factor += 0.05
        notes.append(f"Khả năng mưa cao {rain}% (ưu tiên trạm có mái che, đường chậm hơn)")
    if ghi >= 450:
        notes.append(f"Bức xạ nắng tốt {ghi:.0f} W/m² (thuận lợi điện mặt trời)")

    return {
        "hour": h,
        "temp_c": round(temp_c, 1),
        "ghi_wm2": round(ghi, 1),
        "rain_prob_pct": rain,
        "drain_factor": round(drain_factor, 2),
        "weather_note": "; ".join(notes) if notes else f"Thời tiết ổn định {temp_c:.1f}°C",
        "source": source,
    }


def _tariff_for_station(station: dict, eta_hour: float, day_of_week: str) -> tuple:
    if station["pricing_model"] == "flat_vgreen":
        return station["flat_price_vnd"], "Đồng giá V-Green mọi khung giờ"
    h = eta_hour % 24
    if 0 <= h < 6:
        return station["off_peak_vnd"], "Thấp điểm QĐ 2892 (00:00–06:00)"
    if day_of_week != "Chủ Nhật" and 17.5 <= h < 22.5:
        return station["peak_vnd"], "Cao điểm QĐ 2892 (17:30–22:30 T2–T7)"
    return station["normal_vnd"], (
        "Bình thường QĐ 2892 (Chủ nhật không tính cao điểm)"
        if day_of_week == "Chủ Nhật"
        else "Bình thường QĐ 2892"
    )


def _crowding_at_eta(station: dict, eta_hour: float, rain_prob: int) -> tuple:
    h = eta_hour % 24
    if 17.5 <= h < 21.5:
        mult, grid_note = 1.8, "giờ cao điểm tối EVNHANOI"
    elif 11.0 <= h < 13.5:
        mult, grid_note = 1.2, "khung giờ trưa"
    elif 0.0 <= h < 6.0:
        mult, grid_note = 0.3, "khung rạng sáng thấp tải"
    else:
        mult, grid_note = 0.8, "khung bình thường"

    rain_mult = 1.15 if rain_prob >= 70 else 1.0
    est_queue = round(station["base_queue"] * mult * rain_mult, 1)
    if station["base_status"] == "crowded" and 17.5 <= h < 22.0 and est_queue < 2.0:
        est_queue = 2.5

    if est_queue >= 2.5:
        label = "Đông"
        wait_min = int(round(est_queue * 8))
    elif est_queue >= 1.0:
        label = "Trung bình"
        wait_min = int(round(est_queue * 6))
    else:
        label = "Vắng"
        wait_min = 0
    return label, wait_min, est_queue, grid_note


@tool
def plan_route_and_stations(
    origin: str,
    destination: str,
    ev_model: str,
    current_soc: float,
    target_soc: float,
    departure_hour: int,
    departure_min: int,
    day_of_week: str,
    weather: dict,
) -> dict:
    """Tính lộ trình di chuyển tại Hà Nội và xếp hạng Top 3 trạm sạc tối ưu theo thời tiết, độ đông tại giờ đến (ETA) và giá điện.
    Input: thông số chuyến đi & thời tiết. Output: dict lộ trình, Top 3 trạm đạt chuẩn và danh sách trạm bị loại. Không tác động ra ngoài."""
    landmarks = _load_json("hanoi_landmarks.json")
    stations = _load_json("hanoi_stations.json")
    ev_models = _load_json("ev_models.json")

    o_lm = next((x for x in landmarks if x["name"] == origin), landmarks[0])
    d_lm = next((x for x in landmarks if x["name"] == destination), landmarks[0])
    ev = next((x for x in ev_models if x["model"] == ev_model), ev_models[1])

    direct_km = round(_haversine_km(o_lm["lat"], o_lm["lon"], d_lm["lat"], d_lm["lon"]) * 1.35, 1)
    remaining_range_km = round((current_soc / 100.0) * ev["range_km"] / weather["drain_factor"], 1)
    emergency_mode = current_soc < 15.0

    lez_warning = None
    if (d_lm.get("lez_zone") or o_lm.get("lez_zone")) and day_of_week in ("Thứ Sáu", "Thứ Bảy", "Chủ Nhật") and 19 <= departure_hour <= 23:
        lez_warning = (
            f"Cảnh báo LEZ Vành đai 1 ({day_of_week} {departure_hour:02d}:{departure_min:02d}): "
            "Khu vực lõi Hoàn Kiếm/Phố Cổ thí điểm hạn chế phương tiện đường bộ 19:00–24:00 cuối tuần; "
            "nên ưu tiên trạm rìa Hoàn Kiếm (như Trần Quang Khải / Trần Hưng Đạo) rồi đi bộ vào."
        )

    kwh_needed = round(max(0.0, (target_soc - current_soc) / 100.0 * ev["battery_kwh"]), 2)
    speed_kmh = 20.0 if weather["rain_prob_pct"] >= 70 else 25.0

    candidates = []
    excluded = []
    for st in stations:
        if st["base_status"] == "maintenance":
            excluded.append({"id": st["id"], "name": st["name"], "reason": "Đang bảo trì (Guardrail loại)"})
            continue

        dist_to_st = round(_haversine_km(o_lm["lat"], o_lm["lon"], st["lat"], st["lon"]) * 1.35, 1)
        st_to_dest = round(_haversine_km(st["lat"], st["lon"], d_lm["lat"], d_lm["lon"]) * 1.35, 1)
        detour_km = round(max(0.0, dist_to_st + st_to_dest - direct_km), 1)

        if dist_to_st > remaining_range_km * 0.9:
            excluded.append({"id": st["id"], "name": st["name"], "reason": f"Vượt tầm chạy an toàn ({dist_to_st}km > {round(remaining_range_km*0.9,1)}km)"})
            continue

        eta_decimal = (departure_hour + departure_min / 60.0 + dist_to_st / speed_kmh) % 24
        eta_h = int(eta_decimal)
        eta_m = int(round((eta_decimal - eta_h) * 60)) % 60
        crowd_label, wait_min, est_queue, grid_note = _crowding_at_eta(st, eta_decimal, weather["rain_prob_pct"])
        unit_price, tariff_note = _tariff_for_station(st, eta_decimal, day_of_week)

        eff_kw = min(st["power_kw"], ev["max_dc_kw"])
        charge_min = int(round((kwh_needed / max(1.0, eff_kw)) * 60)) + 5
        est_cost = int(round(kwh_needed * unit_price))

        if emergency_mode:
            score = dist_to_st * 4.0 + wait_min * 0.5 - (3.0 if st["has_roof"] and weather["rain_prob_pct"] >= 70 else 0.0)
        else:
            roof_bonus = -1.5 if (weather["rain_prob_pct"] >= 70 and st["has_roof"]) else 0.0
            cost_penalty = (unit_price / 1000.0) * 1.2
            score = detour_km * 2.2 + dist_to_st * 0.6 + wait_min * 0.45 + charge_min * 0.15 + cost_penalty + roof_bonus

        candidates.append({
            "id": st["id"],
            "name": st["name"],
            "district": st["district"],
            "operator": st["operator"],
            "power_kw": st["power_kw"],
            "has_roof": st["has_roof"],
            "nearby_poi": st["nearby_poi"],
            "dist_from_origin_km": dist_to_st,
            "st_to_dest_km": st_to_dest,
            "detour_km": detour_km,
            "eta_str": f"{eta_h:02d}:{eta_m:02d}",
            "crowding_at_eta": crowd_label,
            "est_queue": est_queue,
            "est_wait_min": wait_min,
            "grid_note": grid_note,
            "pricing_model": st["pricing_model"],
            "unit_price_vnd": unit_price,
            "tariff_note": tariff_note,
            "kwh_needed": kwh_needed,
            "charge_duration_min": charge_min,
            "est_cost_vnd": est_cost,
            "score": round(score, 2),
        })

    candidates.sort(key=lambda x: x["score"])
    return {
        "origin": o_lm["name"],
        "destination": d_lm["name"],
        "direct_km": direct_km,
        "ev_model": ev["model"],
        "battery_kwh": ev["battery_kwh"],
        "current_soc_pct": current_soc,
        "target_soc_pct": target_soc,
        "kwh_needed": kwh_needed,
        "remaining_range_km": remaining_range_km,
        "emergency_mode": emergency_mode,
        "lez_warning": lez_warning,
        "top_stations": candidates[:3],
        "excluded_count": len(excluded),
        "excluded_sample": excluded[:4],
    }


@tool
def verify_guardrails(plan: dict, output_text: str = "") -> dict:
    """Hậu kiểm an toàn: kiểm tra không gợi ý trạm bảo trì, không vượt tầm chạy và mọi mã trạm trích dẫn đều có thật.
    Input: plan (dict), output_text (str). Output: dict {ok, violations}. Không tác động ra ngoài."""
    stations = _load_json("hanoi_stations.json")
    valid_map = {s["id"]: s for s in stations}
    violations = []

    for st in plan.get("top_stations", []):
        raw = valid_map.get(st["id"])
        if not raw:
            violations.append(f"Mã trạm không tồn tại: {st['id']}")
        elif raw["base_status"] == "maintenance":
            violations.append(f"Vi phạm: gợi ý trạm đang bảo trì {st['id']}")
        if st["dist_from_origin_km"] > plan.get("remaining_range_km", 0):
            violations.append(f"Vi phạm: trạm {st['id']} vượt tầm chạy còn lại")

    for found_id in re.findall(r"\bST_[A-Z]+_\d+\b", output_text or ""):
        if found_id not in valid_map:
            violations.append(f"Output bịa mã trạm không có trong dữ liệu: {found_id}")
        elif valid_map[found_id]["base_status"] == "maintenance" and "tránh" not in output_text.lower() and "loại" not in output_text.lower():
            violations.append(f"Output nhắc trạm bảo trì {found_id} không rõ ràng")

    return {"ok": len(violations) == 0, "violations": violations}
