#!/usr/bin/env bash
# Phát hành file APK mới lên VPS (cập nhật nguyên tử releases/ChargePilot-AI.apk & releases/latest.json).
# Cách dùng:
#   bash deploy/scripts/deploy-apk.sh <URL_TAI_APK_HOAC_DUONG_DAN_FILE> [VERSION]
set -euo pipefail

SOURCE="${1:-}"
VERSION="${2:-latest}"

if [ -z "$SOURCE" ]; then
  echo "Thiếu tham số! Dùng: bash deploy/scripts/deploy-apk.sh <URL hoặc path file .apk> [version]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELEASES_DIR="$APP_DIR/releases"
TMP_APK="$RELEASES_DIR/ChargePilot-AI.apk.tmp"
FINAL_APK="$RELEASES_DIR/ChargePilot-AI.apk"

mkdir -p "$RELEASES_DIR"

if [[ "$SOURCE" =~ ^https?:// ]]; then
  echo ">>> Đang tải APK từ: $SOURCE"
  curl -fL --retry 3 --connect-timeout 15 -o "$TMP_APK" "$SOURCE"
else
  if [ ! -f "$SOURCE" ]; then
    echo "Không tìm thấy file APK: $SOURCE"
    exit 1
  fi
  echo ">>> Đang sao chép APK từ: $SOURCE"
  cp -f "$SOURCE" "$TMP_APK"
fi

echo ">>> Kiểm tra tính toàn vẹn file APK (định dạng ZIP)..."
python3 -m zipfile -t "$TMP_APK" >/dev/null

SIZE_BYTES="$(wc -c < "$TMP_APK" | tr -d ' ')"
if [ "$SIZE_BYTES" -lt 100000 ]; then
  echo "Cảnh báo: file tải về quá nhỏ (${SIZE_BYTES} bytes) — có thể là trang HTML lỗi thay vì APK!"
  rm -f "$TMP_APK"
  exit 1
fi

SHA256="$(sha256sum "$TMP_APK" | awk '{print $1}')"
mv -f "$TMP_APK" "$FINAL_APK"
chmod 644 "$FINAL_APK"

python3 - "$RELEASES_DIR/latest.json" "$VERSION" "$SIZE_BYTES" "$SHA256" "$SOURCE" <<'PY'
import datetime, json, sys
out_path, version, size_bytes, sha256, src = sys.argv[1:6]
size_bytes = int(size_bytes)
data = {
    "version": version,
    "filename": "ChargePilot-AI.apk",
    "size_bytes": size_bytes,
    "size_mb": round(size_bytes / (1024 * 1024), 2),
    "sha256": sha256,
    "updated_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime("%Y-%m-%d %H:%M:%S +07"),
    "source": src if src.startswith("http") else "local-scp",
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(json.dumps(data, ensure_ascii=False))
PY

echo ">>> Phát hành APK thành công tại $FINAL_APK"
