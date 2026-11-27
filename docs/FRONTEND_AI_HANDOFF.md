# Hướng Dẫn Nối AI Agent (Backend VPS) Vào App Mobile (`mobile/`)

> **Cập nhật:** 28/11/2026 · **Nhánh chuẩn:** `main`
> **Đối tượng nhận:** Thành viên phát triển Frontend (`mobile/` — Expo / React Native) & thành viên vận hành VPS.
> **Tài liệu gốc bắt buộc đọc kèm:** [`docs/API_CONTRACT.md`](./API_CONTRACT.md) (`v1.0.0 — FROZEN`).

---

## 1. Tình hình hiện tại của hệ thống (Đã xong gì vs Còn thiếu gì)

Toàn bộ phần **AI Agent**, **Backend API**, **CI/CD VPS** và **khung giao diện Mobile** đều đã được gộp đầy đủ lên nhánh `main`:

| Thành phần | Trạng thái | Vị trí trong repo | Ghi chú thực tế |
|---|---|---|---|
| **AI Agent & 6 Tools** | **Đã xong (29/29 Eval PASS)** | `codebase/agent.py`, `codebase/tools.py`, `data/hanoi_stations.json` (191 trạm) | Dùng Claude + 191 trạm sạc Hà Nội crawl thật + thời tiết 168h + guardrails từ chối ngoài phạm vi/OTP. |
| **HTTP API Server (`v1.0.0`)** | **Đã xong (7/7 Contract Tests PASS)** | `codebase/api_server.py`, `codebase/test_api_contract.py` | Đã khoá hợp đồng JSON `v1.0.0`, hỗ trợ CORS `*`, multi-turn `session_id`, `ask_back`, `rescue`, `refusal`, Green Score. |
| **Hồ sơ CP3 & Đánh giá** | **Đã xong** | `spec.md`, `eval/`, `cost/`, `evidence/` | Không được chỉnh sửa phần threshold/metric/eval đã khoá (`spec.md §7`). |
| **VPS Production & CI/CD** | **Đang chạy** | `deploy/`, `.github/workflows/ci-cd-vps.yml` | Container Docker `api` + Cloudflare Quick Tunnel đang chạy tại URL bên dưới (cần `git pull` lên `main` mới nhất trước khi test). |
| **App Mobile UI (`mobile/`)** | **Đã xong UI (0 lỗi `tsc`)** | `mobile/app/`, `mobile/src/` | Giao diện 3D MapLibre, Voice, Chat, Recommendation đã chạy đẹp nhưng **hiện 100% offline/giả lập**. |

### Điểm thiếu duy nhất hiện tại ("Sợi dây nối")
Trong app `mobile/`, khi người dùng gõ hoặc nói câu hỏi, [`mobile/src/stores/useChargePilotStore.ts`](../mobile/src/stores/useChargePilotStore.ts) đang gọi trực tiếp bộ tính toán quy tắc offline [`mobile/src/services/decisionEngine.ts`](../mobile/src/services/decisionEngine.ts) và danh sách vài trạm cứng trong [`mobile/src/data/stations.ts`](../mobile/src/data/stations.ts), **hoàn toàn chưa có lời gọi mạng (`fetch`) nào tới AI Backend trên VPS**.

Nhiệm vụ của bạn làm Frontend là nối `useChargePilotStore.ts` + UI `journey.tsx` / `map.tsx` vào API `POST /api/v1/chat` của Backend.

---

## 2. Nguyên tắc bảo mật bắt buộc (Quy chế Hackathon K5)

> **Cảnh báo:** Vi phạm lộ API key hoặc dữ liệu nhạy cảm bị trừ **-10 điểm** theo quy chế K5.

1. **TUYỆT ĐỐI KHÔNG** đưa Anthropic/Claude API Key, nội dung `.env`, hay mật khẩu/SSH key của VPS vào code `mobile/` hoặc đóng gói vào file `.apk`.
2. **TUYỆT ĐỐI KHÔNG** commit `.env`, `*.apk`, hoặc `mobile/node_modules/` lên Git.
3. **Luồng gọi chuẩn & an toàn (App không cần giữ API Key):**

```text
[App Mobile (Expo/RN)]
   │  HTTPS JSON (KHÔNG cần API key / Authorization header)
   ▼
[VPS Backend: codebase/api_server.py]  <── Đọc API_KEY bí mật từ /opt/greencharge/.env trên VPS
   │
   ▼
[Claude AI + 191 trạm Hà Nội + Thời tiết + Guardrails]
   │  Trả JSON chuẩn v1.0.0
   ▼
[App Mobile hiển thị lời khuyên, Top 3 trạm lên Map & nhận Green Score]
```

---

## 3. Thông tin kết nối Backend cho Frontend

### 3.1 Bước chuẩn bị 1 lần trên VPS (Người giữ VPS làm trước)
VPS cần chuyển về nhánh `main` mới nhất để container `api` có đủ các route `/api/v1/...` (lệnh dưới giữ nguyên `.env` và **giữ nguyên link `trycloudflare.com`**, không restart container `tunnel`):

```bash
cd /opt/greencharge && git fetch origin main && git checkout main && git pull --ff-only origin main && docker compose -f deploy/docker-compose.yml up -d --build api
```

Kiểm tra nhanh sau khi build xong:
```bash
curl -s http://127.0.0.1:8000/health
# Phải thấy "contract_version": "1.0.0" và "model_provider": "anthropic"
```

### 3.2 Base URL đưa cho Frontend
- **VPS HTTPS hiện tại:** `https://maintaining-podcast-down-coding.trycloudflare.com`
- **Local dev (nếu tự chạy `python codebase/api_server.py` trên máy):**
  - Web / iOS Simulator: `http://127.0.0.1:8000`
  - Android Emulator: `http://10.0.2.2:8000`
- **Cách cấu hình khuyến nghị trong `mobile/`:** dùng biến môi trường Expo `EXPO_PUBLIC_API_BASE_URL` với giá trị fallback mặc định:

```ts
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'https://maintaining-podcast-down-coding.trycloudflare.com';
```

> Lưu ý: vì Cloudflare Quick Tunnel có thể đổi URL nếu container `tunnel` trên VPS bị tạo lại, việc tách vào `EXPO_PUBLIC_API_BASE_URL` giúp đổi URL bằng 1 dòng duy nhất trước khi build `.apk`.

### 3.3 5 Endpoint chính cần dùng (Chi tiết xem `docs/API_CONTRACT.md`)

| Method & Path | Mục đích | Request chính | Response chính cần lấy |
|---|---|---|---|
| `GET /health` | Kiểm tra server sống & model đang chạy | *(không)* | `ok`, `contract_version`, `model_provider`, `apk_available` |
| `POST /api/v1/chat` | Hỏi AI Agent tìm trạm & khung giờ sạc | `message`, `session_id?`, `device_context?` | `session_id`, `intent_state`, `reply_text`, `tts_summary`, `stations[]` (Top 3), `charge_window`, `green_reward`, `follow_up_questions[]`, `guardrails` |
| `POST /api/v1/session/reset` | Xoá ngữ cảnh hội thoại cũ khi bấm "Cuộc trò chuyện mới" | `{ "session_id": "..." }` | `{ "ok": true, "cleared": true }` |
| `POST /api/v1/green-score/confirm` | Cộng điểm Green Score thật sau khi user xác nhận | `{ "confirm_token": "green_...", "user_name": "..." }` | `{ "ok": true, "points_added", "total_points", "green_sessions" }` |
| `GET /api/v1/green-score/leaderboard` | Lấy bảng xếp hạng Green Score | *(không)* | `{ "ok": true, "leaderboard": [...] }` |

---

## 4. Hướng dẫn tích hợp chi tiết từng file trong `mobile/`

### Bước 1: Tạo `mobile/src/services/apiClient.ts`
Tạo service HTTP gọi trực tiếp API `v1.0.0` với timeout `20000 ms` (vì AI thật gọi Claude + tools mất khoảng 2–5 giây, không nên để timeout quá ngắn):

```ts
import { API_BASE_URL } from '@/config/api'; // hoặc khai báo hằng số ngay trong file này

export type ApiIntentState =
  | 'recommendation'
  | 'rescue'
  | 'home_charging'
  | 'ask_back'
  | 'refusal';

export interface ApiStationItem {
  rank: number;
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
  road_km: number;
  power_kw: number;
  status: 'available' | 'crowded' | 'maintenance' | 'unverified' | null;
  status_label: string;
  pricing_model: string | null;
  has_roof: boolean | null;
  range_verified: boolean;
}

export interface ChatV1Request {
  message: string;
  session_id?: string;
  device_context?: {
    lat?: number;
    lon?: number;
    default_vehicle?: string;
    local_time?: string; // "HH:MM"
    weekday?: number;    // 0 = Thứ Hai .. 6 = Chủ nhật
  } | null;
}

export interface ChatV1Response {
  ok: boolean;
  contract_version: string;
  session_id: string;
  query: string;
  intent_state: ApiIntentState;
  output: string;
  reply: string;
  reply_text: string;
  tts_summary: string;
  vehicle: {
    model: string | null;
    vehicle_type: 'o_to' | 'xe_may' | null;
    known: boolean;
  };
  battery: {
    current_pct: number | null;
    target_pct: number | null;
    safe_range_km: number | null;
    rescue_mode: boolean;
  };
  weather: {
    temp_used_c: number | null;
    drain_factor: number | null;
    solar_wm2: number | null;
    solar_best_window: string | null;
  };
  stations: ApiStationItem[];
  charge_window: {
    window: string;
    duration_min: number | null;
    reason: string;
  } | null;
  green_reward: {
    eligible: boolean;
    points: number;
    reasons: string[];
    requires_user_confirmation: boolean;
    confirm_token: string | null;
  };
  follow_up_questions: string[];
  guardrails: {
    passed: boolean;
    fallback_used: boolean;
    excluded_note: string | null;
    model: string;
    model_calls: number;
    tool_calls: number;
    latency_s: number;
  };
  meta: {
    models: string[];
    model_calls: number;
    tool_calls: number;
    tokens_in: number;
    tokens_out: number;
    latency_ms: number;
  };
}

async function requestJson<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 20000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const data = await res.json();
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export function chatWithAgent(payload: ChatV1Request) {
  return requestJson<ChatV1Response>('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetAgentSession(sessionId: string) {
  return requestJson<{ ok: boolean; session_id: string; cleared: boolean }>(
    '/api/v1/session/reset',
    {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
      timeoutMs: 8000,
    }
  );
}

export function confirmGreenScore(confirmToken: string, userName: string) {
  return requestJson<{
    ok: boolean;
    points_added: number;
    total_points: number;
    green_sessions: number;
    user_name: string;
  }>('/api/v1/green-score/confirm', {
    method: 'POST',
    body: JSON.stringify({ confirm_token: confirmToken, user_name: userName }),
    timeoutMs: 8000,
  });
}

export function fetchLeaderboard() {
  return requestJson<{
    ok: boolean;
    leaderboard: {
      rank: number;
      user_name: string;
      total_points: number;
      green_sessions: number;
    }[];
  }>('/api/v1/green-score/leaderboard', { method: 'GET', timeoutMs: 8000 });
}
```

---

### Bước 2: Viết bộ chuyển đổi (Adapter / Mapper) sang kiểu dữ liệu của UI

Backend `v1.0.0` và `mobile/src/types/index.ts` có vài khác biệt nhỏ về tên trường — **bắt buộc map đúng** để Map và các màn hình không lỗi:

1. **Toạ độ bản đồ (CỰC KỲ QUAN TRỌNG):**
   - Backend trả về 2 trường rời: `lat` (vĩ độ ~`21.02`) và `lon` (kinh độ ~`105.85`).
   - MapLibre trong `mobile/` (`ChargingStation.coordinates`) dùng tuple **`[lon, lat]`** (kinh độ trước, vĩ độ sau!).
   - Nếu map nhầm `[lat, lon]` thì pin trạm sạc trên bản đồ sẽ bay ra ngoài biển hoặc châu Phi.
2. **Trạng thái trạm (`status`):**
   - Backend: `'available' | 'crowded' | 'maintenance' | 'unverified' | null`
   - UI (`StationStatus` trong `mobile/src/types/index.ts`): `'available' | 'busy' | 'maintenance' | 'unknown'`
   - Quy tắc chuyển:
     - `'available'` → `'available'`
     - `'crowded'` → `'busy'`
     - `'maintenance'` → `'maintenance'`
     - `'unverified'` hoặc `null` → `'unknown'`
3. **Tên xe trong `device_context.default_vehicle`:**
   - Store `mobile/` dùng `vehicleId: 'vfe34' | 'vinfast_evo200'`.
   - Khi gửi lên API, map thành `'VF e34'` hoặc `'VinFast Evo200'` để khớp danh sách xe trong `data/ev_models.json`.
4. **Quy đổi `weekday` cho `device_context`:**
   - JS `new Date().getDay()` trả `0 = Chủ nhật .. 6 = Thứ Bảy`.
   - API `device_context.weekday` quy ước **`0 = Thứ Hai .. 6 = Chủ nhật`** (`(new Date().getDay() + 6) % 7`).

---

### Bước 3: Nối vào `mobile/src/stores/useChargePilotStore.ts`

1. **Thêm state quản lý AI Agent & phiên hội thoại:**
   - `sessionId: string` (khởi tạo 1 lần khi mở app hoặc dùng `response.session_id` trả về)
   - `isLoadingAi: boolean`
   - `aiError: string | null`
   - `aiReplyText: string`
   - `aiTtsSummary: string`
   - `aiIntentState: ApiIntentState | null`
   - `aiFollowUpQuestions: string[]`
   - `pendingConfirmToken: string | null`
   - `isOfflineFallback: boolean`
2. **Đổi luồng gửi câu hỏi thành `async submitNaturalPromptToAI(prompt: string)`:**
   - Set `isLoadingAi: true`, `aiError: null`.
   - Gọi `chatWithAgent({ message: prompt, session_id: get().sessionId, device_context: ... })`.
   - Lưu `session_id`, `reply_text`, `tts_summary`, `intent_state`, `follow_up_questions`.
   - Rẽ nhánh theo `intent_state`:
     - **`recommendation` / `rescue` / `home_charging`:** map `stations[]` (Top 3 trạm thật từ 191 trạm Hà Nội) sang `ProposedItineraryOption[]` + merge vào `effectiveStations` để chọn trạm top 1 (`selectedStationId = stations[0].id`); lưu `pendingConfirmToken = resp.green_reward.confirm_token`.
     - **`ask_back`:** giữ nguyên `session_id`, hiển thị `follow_up_questions` thành chip gợi ý để user trả lời nối tiếp ngữ cảnh.
     - **`refusal`:** xoá danh sách option đề xuất, hiển thị nguyên văn `reply_text` (ví dụ đi ngoài Hà Nội hoặc đã redact OTP thành `[REDACTED_OTP]`).
   - **Mạng lỗi / Timeout Fallback:** trong `catch (err)`, fallback về `analyzeNaturalPrompt(prompt)` offline cũ và bật cờ `isOfflineFallback: true` để app không bị treo khi test lúc mất mạng.
3. **Nối nút Xác nhận điểm Green Score (`acceptProposedItinerary` ở dòng 304–334):**
   - Nếu `pendingConfirmToken` khác `null`, gọi `await confirmGreenScore(pendingConfirmToken, driverName)` để server cộng điểm thật (lưu ý `409 Conflict` nếu token đã confirm rồi thì không cộng đúp).
4. **Thêm nút "Cuộc trò chuyện mới":**
   - Gọi `resetAgentSession(sessionId)` và reset state chat để bắt đầu lượt mới sạch sẽ.

---

### Bước 4: Chỉnh nhẹ UI (`journey.tsx` & `map.tsx`)

1. **[`mobile/app/(tabs)/journey.tsx`](../mobile/app/(tabs)/journey.tsx):**
   - Nối `isLoadingAi` của store vào prop `isThinking` của `MascotAssistant` (để mascot quay hoạt ảnh suy nghĩ khi đang đợi Claude trả lời).
   - Hiển thị bong bóng trả lời đầy đủ `aiReplyText` và các nút chip từ `aiFollowUpQuestions` khi `intent_state === 'ask_back'`.
   - **Lưu ý dữ liệu mẫu (`VOICE_SAMPLES` & `QUICK_FILL_CHIPS` ở dòng 46–94):** hiện có 2 câu mẫu nhắc **"đi Vũng Tàu"** — vì Backend AI khoá phạm vi **Hà Nội**, bấm "Vũng Tàu" AI sẽ trả về `refusal` (từ chối đúng quy chế). Nên đổi câu mẫu chính sang địa điểm Hà Nội (`Hồ Gươm`, `Văn Miếu`, `Cầu Giấy`, `Nội Bài`) và chỉ giữ 1 nút riêng gắn nhãn `"Test ngoài phạm vi (Vũng Tàu)"` để demo guardrail!
2. **[`mobile/app/(tabs)/map.tsx`](../mobile/app/(tabs)/map.tsx):**
   - Hợp nhất các trạm trả về từ API (`stations[]`) vào `effectiveStations` để bản đồ ghim đúng vị trí trạm trong 191 trạm Hà Nội (vì `HANOI_STATIONS` cứng cũ chỉ có vài trạm mẫu).
   - Nếu có nút chỉ đường ngoài Google Maps, truyền đúng `lat, lon`.

---

## 5. Quy trình Git & Lưu ý QA môi trường cho nhóm

1. **Luôn tách nhánh từ `main` mới nhất:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/mobile-api-integration
   ```
2. **Lỗi lệch `package-lock.json` đã phát hiện sẵn:**
   - Hiện chạy `npm ci` trong `mobile/` báo `mobile/package-lock.json` chưa đồng bộ một số gói (`react-dom`, `@react-native/metro-config`, `@babel/plugin-transform-react-jsx-*`, `flow-parser`, `flow-estree`...) so với `mobile/package.json`.
   - Khi cài đặt trên máy dev để nối code, bạn Frontend chạy:
     ```bash
     cd mobile
     npm install
     npx tsc --noEmit
     ```
   - Có thể commit lại `mobile/package-lock.json` đã đồng bộ sạch trong PR nối API mới.
3. **Nhắc lại trước khi push PR:** không commit `mobile/.env*`, `mobile/node_modules/`, hay file `*.apk`.

---

## 6. Checklist 5 kịch bản Test End-to-End trước khi build `.apk` mới

| # | Kịch bản test trên App (đã nối VPS) | Kết quả mong đợi từ Backend thật |
|---|---|---|
| 1 | Gửi thiếu thông tin: `"Tìm trạm sạc giúp mình"` → rồi trả lời tiếp: `"VF e34 pin 35% đang ở Cầu Giấy lúc 10:00 thứ Ba"` | Lượt 1 trả `intent_state: "ask_back"` + `follow_up_questions`; lượt 2 giữ cùng `session_id` và trả `recommendation` với Top 3 trạm Hà Nội thật. |
| 2 | Gửi pin nguy cấp: `"Pin còn 10%, VF e34, đang ở Phố Cổ lúc 18:00 thứ Tư"` | Trả `intent_state: "rescue"`, `battery.rescue_mode: true`, ưu tiên trạm gần trong tầm an toàn và ghim đúng toạ độ `[lon, lat]` trên Map. |
| 3 | Chọn đề xuất sạc có khung giờ xanh → bấm nút xác nhận nhận điểm | Gọi `POST /api/v1/green-score/confirm` thành công (`200 OK`), bấm lại lần 2 không cộng trùng (`409`), `GET /leaderboard` thấy điểm tăng. |
| 4 | Gửi câu ngoài Hà Nội (`"Pin 40% đi Đà Nẵng sạc ở đâu?"`) hoặc chứa OTP (`"Mã OTP 123456..."`) | Trả `intent_state: "refusal"`, chuỗi OTP bị che thành `[REDACTED_OTP]` trong `reply_text` và `tts_summary`. |
| 5 | Tắt Wi-Fi / 4G hoặc đổi sai URL rồi gửi câu hỏi | App không crash; sau timeout/lỗi mạng tự fallback sang offline `decisionEngine.ts` và báo nhẹ trạng thái ngoại tuyến. |

Sau khi test pass đủ 5 kịch bản trên, build lại bản `.apk` mới và phát hành lên VPS bằng `deploy/scripts/deploy-apk.sh` để thay thế bản `.apk` offline cũ.
