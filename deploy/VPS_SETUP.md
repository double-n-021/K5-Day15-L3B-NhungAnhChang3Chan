# Hướng dẫn CI/CD & Triển khai GreenCharge Hanoi lên VPS Ubuntu/Debian

Kiến trúc triển khai gồm 2 container chạy bằng **Docker Compose** (không cài thư viện Python thừa, bỏ qua `rl_ppo_ev/` nên build rất nhẹ):
1. **`api` (`codebase/api_server.py`)**: Cung cấp HTTP API cho app Android (`POST /api/ask`, `/api/chat`, `/api/optimize`), trang web dùng thử cho iPhone/Laptop (`GET /`), và link tải trực tiếp `ChargePilot-AI.apk` (`GET /download/ChargePilot-AI.apk`).
2. **`tunnel` (`cloudflare/cloudflared`)**: Mở đường truyền **HTTPS miễn phí** (`https://*.trycloudflare.com`) trỏ vào `api:8000` mà **không cần mua tên miền**, giúp Android 9+ gọi API không bị lỗi *Cleartext HTTP*.

---

## Bước 1 · Cài đặt VPS một lần duy nhất (3 phút)

SSH vào VPS Ubuntu/Debian của bạn và chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/double-n-021/K5-Day15-L3B-NhungAnhChang3Chan/main/deploy/scripts/vps-bootstrap.sh -o vps-bootstrap.sh
bash vps-bootstrap.sh
```

Sau đó điền API key thật vào file `.env` trên VPS (tuyệt đối không đưa `.env` lên GitHub):

```bash
cd /opt/greencharge
nano .env
# Ví dụ với Claude:
# MODEL_PROVIDER=anthropic
# MODEL_NAME=claude-haiku-4-5-20251001
# API_KEY=sk-ant-...

# Khởi động lại container api để nạp .env mới (không làm mất link tunnel):
docker compose -f deploy/docker-compose.yml up -d api

# Lấy link HTTPS công khai:
docker compose -f deploy/docker-compose.yml logs tunnel | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -n 1
```

> **Mẹo giữ link HTTPS cố định (tùy chọn):** Nếu bạn đã có tài khoản Cloudflare miễn phí + tên miền, tạo Tunnel lấy `CLOUDFLARE_TUNNEL_TOKEN` thêm vào `.env` rồi chạy thêm `-f deploy/docker-compose.named-tunnel.yml`.

---

## Bước 2 · Bật GitHub Actions tự động Deploy (CI/CD)

Vào GitHub Repo → **Settings → Secrets and variables → Actions → New repository secret**, thêm:

| Secret | Bắt buộc | Giá trị |
|---|---|---|
| `VPS_HOST` | Có | IP công khai của VPS (VD: `103.xx.xx.xx`) |
| `VPS_USER` | Có | Tài khoản SSH (VD: `root` hoặc `ubuntu`) |
| `VPS_SSH_KEY` | Có | Nội dung private key SSH (`~/.ssh/id_ed25519`) |
| `VPS_PORT` | Không | Cổng SSH (mặc định `22`) |
| `VPS_APP_DIR` | Không | Thư mục code trên VPS (mặc định `/opt/greencharge`) |

Từ đây:
- Mỗi lần push code mới lên `main` → GitHub Actions tự chạy `run.py check` + quét key + smoke test API → SSH vào VPS rebuild `api` tự động.

---

## Bước 3 · Đưa file `.apk` của Gia Bảo lên VPS (2 cách)

> **Lưu ý quan trọng:** File `.apk` KHÔNG commit vào nhánh Git (đã chặn ở `.gitignore`).

### Cách 1 · Tự động qua GitHub Release (Chuẩn CI/CD)
1. Vào tab **Releases** trên GitHub → **Draft a new release** → đặt tag `v1.0.0`.
2. Kéo thả file `ChargePilot-AI-release.apk` vào mục **Attach binaries** → bấm **Publish release**.
3. Workflow `deploy-apk` tự chạy, tải APK lên `/opt/greencharge/releases/ChargePilot-AI.apk`, kiểm tra toàn vẹn ZIP và bật ngay nút tải tại:
   - Trang tải & dùng thử web: `https://<tunnel-url>/`
   - Link tải trực tiếp: `https://<tunnel-url>/download/ChargePilot-AI.apk`

### Cách 2 · Đẩy thẳng từ máy tính bằng `scp` (nhanh 10 giây)
```powershell
scp ChargePilot-AI-release.apk root@<IP-VPS>:/tmp/ChargePilot-AI-release.apk
ssh root@<IP-VPS> "cd /opt/greencharge && bash deploy/scripts/deploy-apk.sh /tmp/ChargePilot-AI-release.apk v1.0.0 && rm -f /tmp/ChargePilot-AI-release.apk"
```

---

## Bước 4 · Thông số API gửi cho dev Android (Gia Bảo)

- **Base URL:** `https://<link-trycloudflare-cua-ban>` *(hoặc nhập trực tiếp trong màn hình Settings của app nếu có)*.
- **Endpoint hỏi AI:** `POST /api/ask` *(cũng nhận `/api/chat` hoặc `/api/optimize`)*
  - Gửi dạng text tự nhiên:
    ```json
    { "text": "Mình đang ở Hồ Hoàn Kiếm, xe VF e34 còn 35%, 14:00 thứ Bảy đi Văn Miếu. Sạc ở đâu?" }
    ```
  - Hoặc gửi dạng trường có cấu trúc:
    ```json
    { "ev_model": "VinFast VF e34", "current_soc": 35, "target_soc": 80, "origin": "Hồ Hoàn Kiếm", "destination": "Văn Miếu", "time": "14:00 thứ Bảy" }
    ```
- **JSON trả về (`200 OK`):**
  ```json
  {
    "ok": true,
    "output": "...",
    "reply": "...",
    "meta": { "models": ["..."], "model_calls": 1, "tool_calls": 5, "tokens_in": 420, "tokens_out": 180, "latency_ms": 950 }
  }
  ```
