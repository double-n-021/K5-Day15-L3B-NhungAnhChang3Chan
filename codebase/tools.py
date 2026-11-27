"""Công cụ của GreenCharge Hanoi — NHÓM VIẾT (guide bước 2.2, 3.2).

Mọi quyết định an toàn nằm ở đây, bằng code, không để model tự quyết:
lọc trạm bảo trì, kiểm tầm chạy, đúng loại xe, khung giờ sạc, từ chối. Model (agent.py) chỉ viết lại lời.
Không công cụ nào có tác động ra ngoài: không đặt chỗ, không thanh toán, không gửi tin, không sửa dữ liệu.

Quy ước tính (khớp eval/metric_spec.yaml):
  tầm an toàn (km)  = %pin × range_km ÷ hệ số thời tiết × 0,8
  quãng đường (km)  = khoảng cách chim bay × 1,3
  cao điểm          = 17:30–22:30, thứ Hai–thứ Bảy (Chủ nhật không có)
  cứu pin           = %pin < 15
"""
import datetime
import json
import math
import os
import re
import unicodedata

from tracing import tool, TOOLS  # noqa: F401

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

ROAD_FACTOR = 1.3
SAFETY_MARGIN = 0.8
RESCUE_PCT = 15
DEFAULT_TARGET_PCT = 80
PEAK_START, PEAK_END = 17.5, 22.5           # giờ thập phân
MAX_ROAD_KM = 15.0                          # không gợi ý trạm xa hơn mức này trong nội thành
UNKNOWN_RANGE_MAX_KM = 3.0                  # xe chưa có thông số: chỉ nêu trạm rất gần, ghi "chưa kiểm tầm"
MOTO_EXCLUDED_OPERATORS = ("Selex Motors", "Dat Bike")   # trạm riêng của hãng đó (giả định — DATA_CARD)

DAYS = [("thứ hai", 0), ("thứ 2", 0), ("thứ ba", 1), ("thứ 3", 1), ("thứ tư", 2), ("thứ 4", 2),
        ("thứ năm", 3), ("thứ 5", 3), ("thứ sáu", 4), ("thứ 6", 4), ("thứ bảy", 5), ("thứ 7", 5),
        ("chủ nhật", 6)]
DAY_NAMES = ["thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy", "Chủ nhật"]

# Dòng xe người dùng hay nhắc nhưng CHƯA có thông số trong data/ev_models.json
UNKNOWN_MODELS = [
    (r"feliz", "VinFast Feliz S", "xe_may"), (r"klara", "VinFast Klara", "xe_may"),
    (r"vento", "VinFast Vento", "xe_may"), (r"theon", "VinFast Theon", "xe_may"),
    (r"dat ?bike", "Dat Bike", "xe_may"), (r"yadea", "Yadea", "xe_may"), (r"pega", "Pega", "xe_may"),
    (r"selex", "Selex", "xe_may"),
    (r"byd|atto", "BYD Atto 3", "o_to"), (r"wuling", "Wuling", "o_to"),
    (r"\bvf ?[3-9]\b", None, "o_to"),
]

# Điểm đến ngoài Hà Nội → ngoài phạm vi (lớp 3)
OUT_OF_SCOPE_PLACES = ["hạ long", "quảng ninh", "hải phòng", "hải dương", "bắc ninh", "hưng yên", "ninh bình",
                       "thanh hóa", "nghệ an", "đà nẵng", "huế", "hội an", "nha trang", "đà lạt", "sài gòn",
                       "hồ chí minh", "sapa", "sa pa", "lào cai", "tam đảo", "vĩnh phúc", "mộc châu", "hà giang",
                       "thái nguyên", "phú thọ", "hòa bình"]

STATUS_VI = {"available": "trống", "crowded": "đông", "maintenance": "bảo trì"}


# ------------------------------------------------------------------ tiện ích (không phải công cụ)

def _load(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _norm(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def _strip(s):
    s = _norm(s).replace("đ", "d")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _haversine(lat1, lon1, lat2, lon2):
    p = math.radians
    a = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def road_km(lat1, lon1, lat2, lon2):
    return _haversine(lat1, lon1, lat2, lon2) * ROAD_FACTOR


def fmt_h(h):
    """giờ thập phân → 'HH:MM' (24h)."""
    h = h % 24
    m = int(round(h * 60))
    return "%02d:%02d" % ((m // 60) % 24, m % 60)


def fmt_km(x):
    return ("%.1f" % x).replace(".", ",")


def in_peak(h, weekday):
    return weekday != 6 and PEAK_START <= (h % 24) < PEAK_END


def _all_stations():
    cars = _load("hanoi_stations.json") or []
    moto = (_load("hanoi_moto_stations.json") or {}).get("stations", [])
    return cars, moto


# ------------------------------------------------------------------ công cụ 1: đọc yêu cầu

def _find_place(text, landmarks):
    """Mọi địa danh (landmark) xuất hiện trong câu, theo thứ tự vị trí."""
    t, ts = _norm(text), _strip(text)
    hits = []
    for lm in landmarks:
        best = None
        for alias in [lm["name"]] + lm.get("aliases", []):
            a = _norm(alias)
            src = t if a != _strip(a) else ts
            m = re.search(r"(?<!\w)" + re.escape(a) + r"(?!\w)", src)
            if m and (best is None or m.start() < best):
                best = m.start()
        if best is not None:
            hits.append((best, lm))
    hits.sort(key=lambda x: x[0])
    return [lm for _, lm in hits]


def _place_phrase(text):
    """Cụm chỉ nơi người dùng đứng: sau 'đang ở' / 'ở', dừng ở dấu câu hoặc trước thông tin xe / pin."""
    m = re.search(r"(?<!\w)(?:đang ở|ở)\s+(.+)", text, flags=re.I)
    if not m:
        return ""
    s = m.group(1)
    s = re.split(r"[.?!]|,\s*(?=(?:xe|vf|pin|còn|evo|mình|lúc|\d))", s, flags=re.I)[0]
    s = re.split(r"\s+(?=(?:lúc|còn|pin|\d{1,2}[:h]\d{2}))", s, flags=re.I)[0]
    return s.strip(" ,")[:60]


def _station_by_phrase(phrase, stations):
    """Trạm có tên chứa đủ mọi từ của cụm (vd 'vincom bà triệu' → 'Vincom Center Bà Triệu')."""
    words = [w for w in _norm(phrase).split() if w not in ("nhà", "ở", "tại", "khu", "gần")]
    if len(words) < 2:
        return None
    hits = [s for s in stations if s.get("lat") is not None and all(w in _norm(s["name"]).split() for w in words)]
    if not hits:
        return None
    # nhiều trạm cùng tên (vd trụ ô tô + trụ xe máy cùng một TTTM) nằm sát nhau → coi là một nơi
    if all(_haversine(hits[0]["lat"], hits[0]["lon"], h["lat"], h["lon"]) <= 1.0 for h in hits):
        return hits[0]
    return None


def _mentioned_station(text, cars):
    """Trạm ô tô người dùng nhắc tên (mã ST_... hoặc 'trạm <tên>'), để so lời người dùng với dữ liệu."""
    m = re.search(r"\b(ST_[A-Z]+_\d+)\b", text)
    if m:
        return next((s for s in cars if s["id"] == m.group(1)), None)
    m = re.search(r"trạm\s+(.+)", _norm(text))
    if not m:
        return None
    words = re.split(r"[\s,.]+", m.group(1))
    for n in range(min(6, len(words)), 1, -1):
        phrase = " ".join(words[:n])
        hits = [s for s in cars if phrase in _norm(s["name"])]
        if len(hits) == 1:
            return hits[0]
    return None


def _times(text):
    out = []
    for m in re.finditer(r"(?<![\d.,])(\d{1,2})(?::(\d{2})|\s*(?:h|giờ)(\d{2})?)(?![\d%°])", text):
        h = int(m.group(1))
        mi = int(m.group(2) or m.group(3) or 0)
        if h > 23 or mi > 59:
            continue
        after = text[m.end():m.end() + 8].lower()
        if ("tối" in after or "chiều" in after) and h < 12:
            h += 12
        out.append((m.start(), h + mi / 60.0))
    return out


@tool
def parse_request(text: str) -> dict:
    """Đọc yêu cầu của tài xế.
    Input: câu người dùng (str).
    Output: dict — xe (model, vehicle_type, known), pin hiện tại / mục tiêu (%), giờ hiện tại, giờ hẹn kế tiếp,
            thứ, nơi đứng (lat/lon hoặc không định vị được), điểm đến, nhiệt độ người dùng nói, các cờ
            (đặt chỗ / thanh toán / OTP, lệnh chèn, ngoài phạm vi, sạc ở nhà, hỏi thời gian sạc, quên bộ sạc…).
    Tác động ra ngoài: không."""
    t = _norm(text)
    models = _load("ev_models.json") or []
    landmarks = _load("hanoi_landmarks.json") or []
    cars, moto = _all_stations()

    # xe: dòng xe có thông số trước (câu có thể nhắc hãng khác, vd "trạm đổi pin Selex"), rồi tới dòng chưa có
    vehicle = None
    for ev in models:
        for alias in ev.get("aliases", []):
            if alias == "xanh sm" and "bike" in t:
                continue
            if re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", t):
                vehicle = {"model": ev["model"], "vehicle_type": ev.get("vehicle_type", "o_to"), "known": True}
                break
        if vehicle:
            break
    if vehicle is None:
        for pat, name, vtype in UNKNOWN_MODELS:
            m = re.search(pat, t)
            if m:
                vehicle = {"model": name or m.group(0).upper().replace(" ", ""), "vehicle_type": vtype, "known": False}
                break
    if vehicle is None:
        if "xe máy" in t:
            vehicle = {"model": None, "vehicle_type": "xe_may", "known": False}
        else:
            vehicle = {"model": None, "vehicle_type": "o_to", "known": False}

    # pin
    current = target = None
    for m in re.finditer(r"(\d{1,3})\s*%", text):
        v = int(m.group(1))
        if v > 100:
            continue
        before = t[max(0, m.start() - 14):m.start()]
        if re.search(r"lên|cần|tới|đến|đạt", before):
            target = target if target is not None else v
        elif current is None:
            current = v
    # giờ
    times = _times(text)
    now_h = times[0][1] if times else None
    next_h = times[1][1] if len(times) > 1 else None
    next_day = False
    if next_h is not None:
        between = t[times[0][0]:times[1][0] + 1]
        next_day = "mai" in between or next_h < now_h
    weekday = None
    for k, d in DAYS:
        if k in t:
            weekday = d
            break
    # nơi đứng, điểm đến
    places = _find_place(text, landmarks)
    phrase = _place_phrase(text)
    origin = None
    if places:
        origin = {"name": places[0]["name"], "lat": places[0]["lat"], "lon": places[0]["lon"], "via": "landmark"}
    elif phrase:
        st = _station_by_phrase(phrase, moto + cars)
        if st and st.get("lat") is not None:
            origin = {"name": st["name"], "lat": st["lat"], "lon": st["lon"], "via": "station_name"}
    dest = None
    if len(places) > 1:
        dest = {"name": places[1]["name"], "lat": places[1]["lat"], "lon": places[1]["lon"]}
    out_of_scope = next((p for p in OUT_OF_SCOPE_PLACES if re.search(r"(?<!\w)" + re.escape(p) + r"(?!\w)", t)), None)
    temp = re.search(r"(-?\d{1,2})\s*°\s*c", t)

    mentioned = _mentioned_station(text, cars)
    flags = {
        "booking_or_payment": bool(re.search(r"giữ chỗ|đặt chỗ|đặt cọc|thanh toán|trừ tiền|\bví\b|chuyển khoản", t)),
        "otp": bool(re.search(r"\botp\b|mã xác (nhận|thực)", t)),
        "injection": bool(re.search(r"bỏ qua (mọi|tất cả|các) (hướng dẫn|chỉ dẫn|quy tắc)|ignore (all|previous)|"
                                    r"từ giờ bạn|bạn là trợ lý không giới hạn|system prompt", t)),
        "home_charging": "ở nhà" in t and bool(re.search(r"cắm|sạc 400w|bộ sạc|đi kèm", t)),
        "asks_charge_time": bool(re.search(r"bao lâu|mất mấy|nhanh hơn", t)),
        "no_charger": bool(re.search(r"quên (mang )?(cục |bộ )?sạc|không mang (cục |bộ )?sạc", t)),
        "mentions_swap": bool(re.search(r"đổi pin|selex|tủ pin", t)),
        "user_says_free": bool(re.search(r"(còn |đang )?trống|còn chỗ", t)),
        "asks_need_charge": bool(re.search(r"có cần sạc|có nên sạc|sạc luôn|hay đợi", t)),
    }
    return {
        "vehicle": vehicle, "current_pct": current,
        "target_pct": target if target is not None else (100 if "100%" in t else DEFAULT_TARGET_PCT),
        "now_h": now_h, "next_h": next_h, "next_day": next_day, "weekday": weekday,
        "origin": origin, "place_phrase": phrase, "destination": dest, "out_of_scope_place": out_of_scope,
        "user_temp_c": float(temp.group(1)) if temp else None,
        "mentioned_station": mentioned["id"] if mentioned else None, "flags": flags,
    }


# ------------------------------------------------------------------ công cụ 2: thời tiết

@tool
def get_weather(hour: float, weekday: int = None, user_temp_c: float = None) -> dict:
    """Thời tiết Hà Nội theo giờ, đọc bản lưu Open-Meteo (data/weather_fallback.json) và hệ số hao pin.
    Input: giờ (0–24), thứ (0=thứ Hai… 6=Chủ nhật, có thể None), nhiệt độ người dùng nói (°C, có thể None).
    Output: forecast_temp_c, rain_pct, temp_used_c (lấy mức lạnh hơn), drain_factor, notes, source.
    Tác động ra ngoài: không (không gọi mạng khi chạy eval — dùng bản lưu)."""
    payload = _load("weather_fallback.json") or {}
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    rains = hourly.get("precipitation_probability", [])
    forecast = rain = None
    src = "không có dữ liệu thời tiết"
    if times:
        today = datetime.date.today()
        days = sorted({x[:10] for x in times})
        want = today.isoformat()
        if weekday is not None:
            cands = [d for d in days if datetime.date.fromisoformat(d).weekday() == weekday and d >= want]
            want = cands[0] if cands else want
        if want not in days:
            want = days[0]
        key = "%sT%02d:00" % (want, int(hour) % 24)
        if key in times:
            i = times.index(key)
            forecast, rain = temps[i], (rains[i] if i < len(rains) else None)
            src = "Open-Meteo (bản lưu 27/11/2026), %s %s" % (want, key[11:])
    used = forecast
    if user_temp_c is not None and (used is None or user_temp_c < used):
        used = user_temp_c
    factor, notes = 1.0, []
    if used is not None and used <= 15:
        factor += 0.15
        notes.append("trời rét %s°C: hao pin thêm ~15%%" % fmt_km(used))
    elif used is not None and used >= 36:
        factor += 0.10
        notes.append("trời nóng %s°C: hao pin thêm ~10%%" % fmt_km(used))
    if rain is not None and rain >= 70:
        factor += 0.05
        notes.append("khả năng mưa %d%%: hao pin thêm ~5%%" % rain)
    if user_temp_c is not None and forecast is not None and abs(user_temp_c - forecast) >= 3:
        notes.append("Open-Meteo dự báo ~%s°C nhưng xe đo %s°C: tính theo mức lạnh hơn"
                     % (fmt_km(forecast), fmt_km(user_temp_c)))
    return {"forecast_temp_c": forecast, "rain_pct": rain, "temp_used_c": used,
            "drain_factor": round(factor, 2), "notes": notes, "source": src}


# ------------------------------------------------------------------ công cụ 3: tầm chạy

@tool
def safe_range(model: str, current_pct: float, drain_factor: float = 1.0) -> dict:
    """Tầm chạy an toàn của xe.
    Input: tên model (khớp data/ev_models.json), %pin hiện tại, hệ số thời tiết.
    Output: {known, range_km (lý thuyết sau thời tiết), safe_km (×0,8), spec} — known=False nếu xe chưa có thông số.
    Tác động ra ngoài: không."""
    spec = next((m for m in (_load("ev_models.json") or []) if m["model"] == model), None)
    if not spec or current_pct is None:
        return {"known": False, "range_km": None, "safe_km": None, "spec": spec}
    rng = current_pct / 100.0 * spec["range_km"] / (drain_factor or 1.0)
    return {"known": True, "range_km": round(rng, 1), "safe_km": round(rng * SAFETY_MARGIN, 1), "spec": spec}


# ------------------------------------------------------------------ công cụ 4: tìm & xếp hạng trạm

@tool
def find_stations(lat: float, lon: float, vehicle_type: str, safe_km: float = None, rescue: bool = False,
                  limit: int = 3) -> dict:
    """Tìm và xếp hạng trạm sạc quanh vị trí.
    Input: toạ độ, loại xe ('o_to' | 'xe_may'), tầm an toàn km (None = chưa kiểm được), cứu pin (bool), số trạm.
    Output: {top: [...], excluded: [...lý do...]} — ô tô chỉ lấy data/hanoi_stations.json (ST_...),
            xe máy chỉ lấy data/hanoi_moto_stations.json (MOTO_HN_..., trạm sạc, không phải trạm riêng Selex / Dat Bike,
            có toạ độ). Luôn loại trạm bảo trì và trạm vượt tầm an toàn.
    Tác động ra ngoài: không."""
    cars, moto = _all_stations()
    pool = cars if vehicle_type == "o_to" else moto
    cap = min(safe_km, MAX_ROAD_KM) if safe_km is not None else UNKNOWN_RANGE_MAX_KM
    top, excluded = [], []
    for s in pool:
        if s.get("lat") is None:
            excluded.append((s["id"], "không có toạ độ"))
            continue
        d = road_km(lat, lon, s["lat"], s["lon"])
        if d > max(cap, 0) + 1e-9:
            if d <= MAX_ROAD_KM:
                excluded.append((s["id"], "ngoài tầm an toàn (%s km đường)" % fmt_km(d)))
            continue
        if vehicle_type == "o_to":
            if s.get("base_status") == "maintenance":
                excluded.append((s["id"], "đang bảo trì"))
                continue
            crowded = s.get("base_status") == "crowded"
            score = d + (2.0 if rescue else 3.0) * crowded + (0 if rescue else 0.5 * s.get("base_queue", 0))
            item = {"id": s["id"], "name": s["name"], "road_km": round(d, 2), "status": s.get("base_status"),
                    "queue": s.get("base_queue", 0), "power_kw": s.get("power_kw"), "kind": "o_to"}
        else:
            if s.get("station_type") != "charging" or s.get("operator") in MOTO_EXCLUDED_OPERATORS:
                excluded.append((s["id"], "trạm riêng của %s / trạm đổi pin" % s.get("operator")))
                continue
            score = d
            item = {"id": s["id"], "name": s["name"], "road_km": round(d, 2), "status": None,
                    "operator": s.get("operator"), "power_kw": s.get("power_kw"), "kind": "xe_may"}
        item["score"] = round(score, 2)
        top.append(item)
    top.sort(key=lambda x: x["score"])
    return {"top": top[:limit], "excluded": excluded}


# ------------------------------------------------------------------ công cụ 5: khung giờ sạc

def _charge_hours(spec, current, target, station_kw=None):
    if not spec or current is None:
        return None
    gain = max(0, (target or DEFAULT_TARGET_PCT) - current)
    if spec.get("vehicle_type") == "xe_may":
        return gain / 100.0 * spec.get("charge_hours_0_100", 10)
    kw = min(station_kw or spec.get("max_dc_kw", 50), spec.get("max_dc_kw", 50)) * 0.85
    return gain / 100.0 * spec["battery_kwh"] / kw + 5 / 60.0


@tool
def plan_charge_window(now_h: float, weekday: int, current_pct: float, target_pct: float, model: str,
                       next_h: float = None, next_day: bool = False, station_kw: float = None,
                       trip_ok: bool = None) -> dict:
    """Chọn khung giờ sạc.
    Input: giờ hiện tại, thứ, %pin hiện tại / mục tiêu, model xe, giờ hẹn kế tiếp (và có phải sáng mai không),
           công suất trạm hạng 1, pin hiện tại có đủ cho chuyến kế tiếp không.
    Output: {window: 'HH:MM–HH:MM' | None, start, end, rescue, hours, reason}.
    Luật: cứu pin → sạc ngay; không cứu pin → không chồng cao điểm 17:30–22:30 (T2–T7) nếu lịch cho phép;
          luôn kết thúc trước giờ hẹn 15 phút. Tác động ra ngoài: không."""
    spec = next((m for m in (_load("ev_models.json") or []) if m["model"] == model), None)
    hours = _charge_hours(spec, current_pct, target_pct, station_kw)
    if now_h is None or current_pct is None:
        return {"window": None, "rescue": False, "hours": hours, "reason": "thiếu giờ hiện tại hoặc % pin"}
    wd = weekday if weekday is not None else 0   # không rõ thứ → coi là ngày thường (có cao điểm), an toàn hơn
    dur = hours if hours is not None else 1.0
    deadline = None
    if next_h is not None:
        deadline = (next_h + (24 if next_day else 0)) - 0.25
    if current_pct < RESCUE_PCT:
        end = now_h + dur if deadline is None else min(now_h + dur, deadline)
        return {"window": "%s–%s" % (fmt_h(now_h), fmt_h(end)), "start": now_h, "end": end, "rescue": True,
                "hours": hours, "reason": "cứu pin (<%d%%): sạc ngay, không chờ hết cao điểm" % RESCUE_PCT}
    start, reason = now_h, "sạc ngay"
    if in_peak(now_h, wd):
        later = PEAK_END if now_h >= PEAK_START else now_h
        if deadline is None or deadline >= later + 0.25 or (trip_ok and deadline is not None):
            start, reason = later, "đang giờ cao điểm 17:30–22:30: lùi sang sau 22:30"
            if trip_ok and deadline is not None and deadline < later:
                deadline = None
                reason = "pin hiện tại đủ cho chuyến kế tiếp: không cần sạc trong cao điểm, sạc sau 22:30"
        else:
            reason = "lịch kế tiếp không cho chờ hết cao điểm: sạc ngay"
    end = start + dur
    if deadline is not None and end > deadline:
        end = deadline
    if wd != 6 and start < PEAK_START < end and not in_peak(start, wd) and (deadline is None or deadline > PEAK_START):
        if reason == "sạc ngay":
            end = PEAK_START
            reason = "dừng trước cao điểm 17:30"
    if wd == 6:
        reason += " (Chủ nhật không có cao điểm)"
    if end <= start:
        return {"window": None, "rescue": False, "hours": hours, "reason": "không đủ thời gian trước giờ hẹn"}
    return {"window": "%s–%s" % (fmt_h(start), fmt_h(end)), "start": start, "end": end, "rescue": False,
            "hours": hours, "reason": reason}


# ------------------------------------------------------------------ công cụ 6: kiểm câu trả lời

CODE_RE = re.compile(r"\b(ST_[A-Z]+_\d+|MOTO_HN_\d+)\b")


@tool
def check_answer(text: str, draft: str, top_codes: list, must_have: list, forbid: list) -> dict:
    """Chốt chặn cuối: câu model viết có giữ đúng dữ liệu của bản nháp do code tạo không.
    Input: câu model viết, bản nháp, mã Top 3 (theo thứ tự), các cụm bắt buộc giữ, các chuỗi bị cấm.
    Output: {ok: bool, problems: [...]} — sai thì agent trả bản nháp thay cho câu model.
    Tác động ra ngoài: không."""
    problems = []
    allowed = set(CODE_RE.findall(draft))
    extra = sorted(set(CODE_RE.findall(text)) - allowed)
    if extra:
        problems.append("mã trạm không có trong bản nháp: %s" % ", ".join(extra))
    pos = [text.find(c) for c in top_codes]
    if any(p < 0 for p in pos):
        problems.append("thiếu mã Top 3")
    elif pos != sorted(pos):
        problems.append("đổi thứ tự Top 3")
    low = text.lower()
    for s in must_have:
        if s.lower() not in low:
            problems.append("thiếu: %s" % s)
    for s in forbid:
        if s and s.lower() in low:
            problems.append("có chuỗi bị cấm: %s" % s)
    return {"ok": not problems, "problems": problems}
