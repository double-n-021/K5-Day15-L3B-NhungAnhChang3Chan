# CHARGEPILOT API Contract — `v1.0.0 — FROZEN`

> **Trạng thái:** `FROZEN` trước Demo/CP4. Mọi thay đổi breaking trên request/response JSON hoặc URL đều bị cấm sau khi khoá.
> Server nguồn: [`codebase/api_server.py`](../codebase/api_server.py) · Test tự động: [`codebase/test_api_contract.py`](../codebase/test_api_contract.py)

---

## 1. Base URLs

| Môi trường | Base URL | Ghi chú |
|---|---|---|
| Local / Docker container | `http://127.0.0.1:8000` | Chạy `python codebase/api_server.py` |
| Android Emulator | `http://10.0.2.2:8000` | Trỏ về localhost máy dev |
| VPS Production (Cloudflare Tunnel) | `https://<tunnel>.trycloudflare.com` | HTTPS mặc định, tránh lỗi Cleartext HTTP trên Android 9+ |

Server hỗ trợ CORS (`Access-Control-Allow-Origin: *`, `GET, POST, HEAD, OPTIONS`) và đọc biến môi trường `API_HOST` (mặc định `0.0.0.0`), `PORT` / `API_PORT` (mặc định `8000`).

---

## 2. Bảng Endpoint tổng hợp

| Method | Path | Aliases | Mục đích |
|---|---|---|---|
| `GET` | `/` | — | Trang Web Test AI & nút tải APK |
| `GET`, `HEAD` | `/health` | — | Healthcheck server, `contract_version`, model provider, APK meta |
| `GET`, `HEAD` | `/api/release` | — | Metadata bản APK mới nhất từ `releases/latest.json` |
| `GET`, `HEAD` | `/download/ChargePilot-AI.apk` | `/download/latest.apk` | Tải file APK (stream 64KB, trả `404` nếu chưa có APK) |
| `POST` | `/api/v1/chat` | `/api/chat`, `/api/ask`, `/api/optimize` | Hỏi trợ lý tìm trạm sạc & khung giờ sạc (trả full v1.0.0 JSON) |
| `POST` | `/api/v1/session/reset` | — | Xoá trạng thái hội thoại nhiều lượt của `session_id` |
| `POST` | `/api/v1/green-score/confirm` | — | Ghi nhận điểm Green Score sau khi người dùng xác nhận trên UI |
| `GET`, `HEAD` | `/api/v1/green-score/leaderboard` | — | Lấy bảng xếp hạng Green Score Leaderboard |

---

## 3. Chi tiết Request / Response

### 3.1 `GET /health`
Trả về `200 OK`:
```json
{
  "ok": true,
  "status": "ok",
  "service": "CHARGEPILOT API",
  "contract_version": "1.0.0",
  "model_provider": "anthropic",
  "model": "claude-haiku-4-5-20251001",
  "model_name": "claude-haiku-4-5-20251001",
  "apk_available": false,
  "apk_meta": { "available": false }
}
```

### 3.2 `POST /api/v1/chat` (aliases: `/api/chat`, `/api/ask`, `/api/optimize`)

#### Request JSON
Hỗ trợ **cả 2 dạng** (trò chuyện tự nhiên hoặc form có cấu trúc):

**Dạng A — Chat tự nhiên (khuyên dùng cho Android UI):**
```json
{
  "message": "Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.",
  "session_id": "sess_driver_01",
  "device_context": {
    "lat": 21.0285,
    "lon": 105.8542,
    "default_vehicle": "VF e34",
    "local_time": "14:00",
    "weekday": 5
  }
}
```
- `message` (`string`, hoặc alias `text` / `query` / `prompt`): Nội dung người dùng gửi.
- `session_id` (`string`, tuỳ chọn): Nếu bỏ trống, server sinh `"sess_<12-hex>"`. Dùng lại cùng `session_id` ở lượt tiếp theo khi `intent_state == "ask_back"` để server nối ngữ cảnh.
- `device_context` (`object | null`, tuỳ chọn): Chỉ tự điền các trường còn thiếu (`default_vehicle`, `local_time` dạng `HH:MM`, `weekday` `0..6` với `0=Thứ Hai .. 6=Chủ nhật`, `lat`/`lon` landmark Hà Nội trong bán kính `5 km`).

**Dạng B — Form có cấu trúc:**
```json
{
  "ev_model": "VinFast VF e34",
  "current_soc": 35,
  "target_soc": 80,
  "origin": "Hồ Hoàn Kiếm",
  "time": "14:00 thứ Bảy",
  "destination": "Văn Miếu",
  "note": "trời nắng"
}
```

#### Response JSON (`200 OK`)
```json
{
  "ok": true,
  "contract_version": "1.0.0",
  "session_id": "sess_driver_01",
  "query": "Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.",
  "intent_state": "recommendation",
  "output": "...",
  "reply": "...",
  "reply_text": "...",
  "tts_summary": "Gợi ý số 1 là ..., cách ... ki-lô-mét, trống. Khung giờ sạc 14:00–14:25.",
  "vehicle": {
    "model": "VF e34",
    "vehicle_type": "o_to",
    "known": true
  },
  "battery": {
    "current_pct": 35,
    "target_pct": 80,
    "safe_range_km": 84.0,
    "rescue_mode": false
  },
  "weather": {
    "temp_used_c": 24.5,
    "drain_factor": 1.0,
    "solar_wm2": 450.0,
    "solar_best_window": "10h–15h"
  },
  "stations": [
    {
      "rank": 1,
      "id": "ST_HK_02",
      "name": "Trụ sạc ...",
      "lat": 21.0285,
      "lon": 105.8542,
      "address": "...",
      "road_km": 1.2,
      "power_kw": 60,
      "status": "available",
      "status_label": "trống",
      "pricing_model": "flat_vgreen",
      "has_roof": true,
      "range_verified": true
    }
  ],
  "charge_window": {
    "window": "14:00–14:25",
    "duration_min": 25,
    "reason": "sạc ngay"
  },
  "green_reward": {
    "eligible": true,
    "points": 20,
    "reasons": ["..."],
    "requires_user_confirmation": true,
    "confirm_token": "green_a1b2c3d4e5f6"
  },
  "follow_up_questions": [],
  "guardrails": {
    "passed": true,
    "fallback_used": false,
    "excluded_note": null,
    "model": "fake",
    "model_calls": 1,
    "tool_calls": 5,
    "tokens_in": 0,
    "tokens_out": 0,
    "latency_s": 0.012
  },
  "meta": {
    "models": ["fake"],
    "model_calls": 1,
    "tool_calls": 5,
    "tokens_in": 0,
    "tokens_out": 0,
    "latency_ms": 12
  }
}
```

#### Enums & Quy ước kiểu dữ liệu
- `intent_state`: `"recommendation" | "rescue" | "home_charging" | "ask_back" | "refusal"`
- `vehicle.vehicle_type`: `"o_to" | "xe_may"`
- `stations[].status`: `"available" | "crowded" | "maintenance" | "unverified" | null` (`maintenance` luôn bị lọc khỏi Top 3)
- `output`, `reply`, `reply_text`: Luôn có giá trị giống hệt nhau (đã scrub OTP thành `[REDACTED_OTP]` nếu phát hiện OTP).
- `charge_window`: `object | null`
- `battery.safe_range_km`, `battery.current_pct`, `battery.target_pct`: `number | null`

### 3.3 `POST /api/v1/session/reset`
- Request: `{"session_id": "sess_driver_01"}`
- `200 OK`: `{"ok": true, "session_id": "sess_driver_01", "cleared": true}` (`cleared: false` nếu session chưa tồn tại)
- `400 Bad Request`: thiếu `session_id`

### 3.4 `POST /api/v1/green-score/confirm`
- Request: `{"confirm_token": "green_...", "user_name": "Nguyễn Văn A"}`
- `200 OK`: `{"ok": true, "points_added": 20, "total_points": 20, "green_sessions": 1, "user_name": "Nguyễn Văn A"}`
- `400`: thiếu `confirm_token` · `404`: token không tồn tại · `409`: token đã xác nhận trước đó.

### 3.5 `GET /api/v1/green-score/leaderboard`
- `200 OK`: `{"ok": true, "leaderboard": [{"rank": 1, "user_name": "...", "total_points": 20, "green_sessions": 1}]}`

### 3.6 Mã lỗi chuẩn
Mọi lỗi trả JSON theo mẫu `{"ok": false, "error": "<thông báo tiếng Việt>"}`:
- `400`: JSON không hợp lệ, thiếu `message`/`text`, thiếu `session_id` hoặc `confirm_token`.
- `404`: Sai đường dẫn, không có APK trong `releases/`, hoặc `confirm_token` không tồn tại.
- `409`: `confirm_token` đã được claim trước đó.
- `502`: Lỗi runtime bên trong `agent.answer()`.

---

## 4. Phân công & Luật cho từng thành viên

1. **App UI Dev (Android APK):**
   - Gọi `POST /api/v1/chat`, gửi `session_id` cố định mỗi phiên và `device_context` (GPS/giờ/xe mặc định).
   - Render thẻ trạm từ `stations[]` kèm nút mở Google Maps bằng `lat`, `lon`; đọc `tts_summary` qua TTS khi lái xe.
   - Chỉ gọi `POST /api/v1/green-score/confirm` sau khi tài xế bấm nút xác nhận (`green_reward.requires_user_confirmation == true`).
   - Nút "Cuộc trò chuyện mới" gọi `POST /api/v1/session/reset`.
2. **VPS / CI-CD Dev:**
   - Giữ nguyên `/health`, `/api/release`, `/download/ChargePilot-AI.apk`, `/download/latest.apk` và CI smoke test `POST /api/ask`.
   - Cấu hình `.env` trên VPS (`MODEL_PROVIDER`, `MODEL_NAME`, `API_KEY`, `PORT=8000`); không commit `.env` hay `.apk` lên Git.
3. **Core Agent Dev:**
   - Giữ nguyên chữ ký `agent.answer(text) -> {"output": str}` và các công cụ trong `codebase/tools.py` (`parse_request`, `get_weather`, `safe_range`, `find_stations`, `plan_charge_window`, `estimate_green_reward`, `check_answer`).
   - Không sửa các file đã khoá sau CP2 (`spec.md` §7 threshold, `eval/metric_spec.yaml`, `eval/benchmark.csv`, `eval/run-1.csv`, `eval/run-2.csv`, `cost/simulate-1.csv`).

---

## 5. Lệnh kiểm tra nhanh (`curl`)

```bash
# 1. Healthcheck
curl -sf http://127.0.0.1:8000/health

# 2. CI / Legacy smoke test
curl -sf -X POST http://127.0.0.1:8000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"text":"Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu."}'

# 3. Full v1.0.0 Android UI flow
curl -sf -X POST http://127.0.0.1:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Pin 35%, VF e34, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.","session_id":"demo_01"}'

# 4. Reset session
curl -sf -X POST http://127.0.0.1:8000/api/v1/session/reset \
  -H "Content-Type: application/json" \
  -d '{"session_id":"demo_01"}'
```
