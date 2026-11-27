#!/usr/bin/env bash
# Script cài đặt một lần trên VPS Ubuntu / Debian (Docker + Docker Compose + Cloudflare Tunnel).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/greencharge}"
REPO_URL="${REPO_URL:-https://github.com/double-n-021/K5-Day15-L3B-NhungAnhChang3Chan.git}"
BRANCH="${BRANCH:-main}"

echo "=== [1/5] Kiểm tra git, curl, python3 & Docker ==="
export DEBIAN_FRONTEND=noninteractive
NEED_APT=0
for cmd in git curl python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    NEED_APT=1
  fi
done
if [ "$NEED_APT" -eq 1 ]; then
  apt-get update -y
  apt-get install -y git curl python3 ca-certificates
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y docker-compose-plugin
fi

echo "=== [2/5] Clone / Cập nhật repo tại $APP_DIR (nhánh: $BRANCH) ==="
if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$APP_DIR"
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch --all
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$APP_DIR"
mkdir -p releases

echo "=== [3/5] Khởi tạo .env nếu chưa có ==="
if [ ! -f .env ]; then
  cp .env.example .env
  echo ">>> Đã tạo $APP_DIR/.env từ .env.example (hiện đang chạy chế độ fake cho tới khi điền key thật)."
fi

echo "=== [4/5] Build & Chạy API + Cloudflare Tunnel ==="
if grep -qE '^CLOUDFLARE_TUNNEL_TOKEN=.+' .env 2>/dev/null; then
  docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.named-tunnel.yml up -d --build
else
  docker compose -f deploy/docker-compose.yml up -d --build
fi

echo "=== [5/5] Kiểm tra /health & lấy URL HTTPS ==="
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8000/health; then
    echo ""
    break
  fi
  sleep 2
done
sleep 3
echo ""
echo "Link HTTPS công khai (Cloudflare Quick Tunnel):"
docker compose -f deploy/docker-compose.yml logs tunnel 2>&1 | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -n 1 || true
echo ""
echo "Hoàn tất! Để nạp API key thật, chạy:"
echo "  cd $APP_DIR && nano .env"
echo "Sau đó khởi động lại API (giữ nguyên link tunnel):"
echo "  cd $APP_DIR && docker compose -f deploy/docker-compose.yml up -d api"
