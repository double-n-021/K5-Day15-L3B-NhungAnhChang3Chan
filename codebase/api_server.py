"""HTTP API + Trang tải APK & dùng thử Web cho GreenCharge Hanoi (Python thuần, 0 dependency ngoài).

Chạy cục bộ hoặc trong Docker trên VPS:
    python codebase/api_server.py

Endpoints:
    GET  /                          Trang web dùng thử AI (hỗ trợ iOS/laptop) & nút tải ChargePilot-AI.apk
    GET  /health                    Kiểm tra trạng thái server cho Docker & CI/CD
    GET  /api/release               Metadata bản APK mới nhất trên VPS (releases/latest.json)
    GET  /download/ChargePilot-AI.apk  (alias: /download/latest.apk) Tải file APK dạng stream 64KB
    POST /api/ask                   (alias: /api/chat, /api/optimize) Gọi answer() từ codebase/agent.py
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CODEBASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(CODEBASE_DIR)
RELEASES_DIR = os.path.join(ROOT_DIR, "releases")
APK_FILENAME = "ChargePilot-AI.apk"

if CODEBASE_DIR not in sys.path:
    sys.path.insert(0, CODEBASE_DIR)

import ai  # noqa: E402
import tracing  # noqa: E402
from agent import answer  # noqa: E402

# tracing._case là biến toàn cục theo tiến trình → khóa tuần tự khi chạy HTTP đa luồng
_INFER_LOCK = threading.Lock()


def _apk_path() -> str:
    return os.path.join(RELEASES_DIR, APK_FILENAME)


def _release_meta() -> dict:
    meta_path = os.path.join(RELEASES_DIR, "latest.json")
    apk_exists = os.path.isfile(_apk_path())
    meta = {}
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            meta = {}
    if apk_exists:
        size_bytes = os.path.getsize(_apk_path())
        meta.setdefault("filename", APK_FILENAME)
        meta.setdefault("version", "latest")
        meta["size_bytes"] = size_bytes
        meta["size_mb"] = round(size_bytes / (1024 * 1024), 2)
        meta["download_url"] = f"/download/{APK_FILENAME}"
        meta["available"] = True
    else:
        meta["available"] = False
    return meta


def _payload_to_query(payload: dict) -> str:
    """Chấp nhận cả text tự do ({text/message/query}) lẫn form có cấu trúc từ app Android."""
    for key in ("text", "message", "query", "prompt"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    parts = []
    ev = payload.get("ev_model") or payload.get("vehicle") or payload.get("model")
    if ev:
        parts.append(f"Xe {ev}")
    soc = payload.get("current_soc") if payload.get("current_soc") is not None else payload.get("battery_pct")
    if soc is not None:
        parts.append(f"pin còn {soc}%")
    target = payload.get("target_soc") or payload.get("target_pct")
    if target is not None:
        parts.append(f"muốn sạc lên {target}%")
    origin = payload.get("origin") or payload.get("location")
    if origin:
        parts.append(f"đang ở {origin}")
    time_str = payload.get("time") or payload.get("departure_time")
    if time_str:
        parts.append(f"lúc {time_str}")
    dest = payload.get("destination") or payload.get("next_trip")
    if dest:
        parts.append(f"đi {dest}")
    extra = payload.get("note") or payload.get("weather")
    if extra:
        parts.append(str(extra))
    return ", ".join(parts).strip()


HTML_PAGE = """<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GreenCharge Hanoi — API, Web Test &amp; Tải APK</title>
<style>
  :root { --bg:#f5f7f6; --card:#fff; --ink:#0f172a; --muted:#475569; --jade:#0f766e; --line:#dbe4e1; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,Segoe UI,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width:780px; margin:0 auto; padding:24px 16px 48px; }
  .hero { background:#042f2e; color:#f0fdfa; border-radius:18px; padding:24px; margin-bottom:18px; }
  .hero h1 { margin:0 0 8px; font-size:24px; }
  .hero p { margin:0; color:#ccfbf1; font-size:14.5px; line-height:1.5; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px; }
  .row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; }
  .btn { display:inline-block; background:var(--jade); color:#fff; text-decoration:none; border:none; border-radius:10px; padding:11px 18px; font-weight:700; font-size:14px; cursor:pointer; }
  .btn:disabled { opacity:.55; cursor:default; }
  .pill { display:inline-block; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; background:#ccfbf1; color:#115e59; }
  textarea { width:100%; min-height:92px; padding:12px; border:1px solid #cbd5e1; border-radius:10px; font:inherit; font-size:14.5px; resize:vertical; }
  pre { white-space:pre-wrap; word-break:break-word; background:#0f172a; color:#e2e8f0; padding:14px; border-radius:12px; font-size:13.5px; line-height:1.55; margin:12px 0 0; }
  .muted { color:var(--muted); font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>⚡ GreenCharge Hanoi — Trợ lý Trạm sạc Xe điện</h1>
    <p>Backend API đang chạy trên VPS cho ứng dụng Android <b>ChargePilot-AI</b> và cho phép dùng thử trực tiếp trên trình duyệt (iPhone / Laptop / BGK).</p>
  </div>

  <div class="card">
    <div class="row">
      <div>
        <span class="pill" id="statusPill">Đang kiểm tra server...</span>
        <h3 style="margin:8px 0 4px;">Cài đặt App Android (.apk)</h3>
        <div class="muted" id="apkInfo">Đang tải thông tin bản phát hành mới nhất...</div>
      </div>
      <a class="btn" id="apkBtn" href="/download/ChargePilot-AI.apk" style="display:none;">⬇ Tải ChargePilot-AI.apk</a>
    </div>
  </div>

  <div class="card">
    <h3 style="margin:0 0 8px;">Dùng thử trực tiếp (POST /api/ask)</h3>
    <textarea id="q">Mình đang ở Hồ Hoàn Kiếm, xe VF e34 còn 35%. Bây giờ 14:00 thứ Bảy, 16:30 phải đón đoàn khách ở Văn Miếu. Sạc ở đâu, lúc nào?</textarea>
    <div class="row" style="margin-top:10px;">
      <button class="btn" id="sendBtn" onclick="sendAsk()">Gửi câu hỏi tới AI</button>
      <span class="muted" id="metaLine"></span>
    </div>
    <pre id="out">Bấm "Gửi câu hỏi tới AI" để xem phản hồi trực tiếp từ server...</pre>
  </div>
</div>
<script>
async function loadStatus() {
  try {
    const r = await fetch('/health');
    const d = await r.json();
    document.getElementById('statusPill').textContent = `Online · model: ${d.model_provider}/${d.model_name || 'fake'}`;
    const rel = d.apk_meta || {};
    if (rel.available) {
      document.getElementById('apkInfo').textContent = `Phiên bản: ${rel.version || 'latest'} · Dung lượng: ${rel.size_mb} MB` + (rel.updated_at ? ` · Cập nhật: ${rel.updated_at}` : '');
      document.getElementById('apkBtn').style.display = 'inline-block';
    } else {
      document.getElementById('apkInfo').textContent = 'Chưa có file ChargePilot-AI.apk trong releases/ trên VPS. Tạo GitHub Release hoặc chạy deploy-apk.sh để tự động phát hành.';
    }
  } catch (e) {
    document.getElementById('statusPill').textContent = 'Lỗi kết nối /health';
  }
}
async function sendAsk() {
  const btn = document.getElementById('sendBtn');
  const out = document.getElementById('out');
  const meta = document.getElementById('metaLine');
  btn.disabled = true; out.textContent = 'Đang xử lý...'; meta.textContent = '';
  try {
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text: document.getElementById('q').value})
    });
    const d = await r.json();
    out.textContent = d.output || d.error || JSON.stringify(d, null, 2);
    if (d.meta) {
      meta.textContent = `model: ${(d.meta.models||[]).join(',')||'—'} · tools: ${d.meta.tool_calls} · ${d.meta.latency_ms}ms · tokens: ${d.meta.tokens_in}/${d.meta.tokens_out}`;
    }
  } catch (e) {
    out.textContent = 'Lỗi gọi API: ' + e;
  } finally {
    btn.disabled = false;
  }
}
loadStatus();
</script>
</body>
</html>
"""


class GreenChargeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stdout.write("[api] %s - %s\n" % (self.address_string(), fmt % args))
        sys.stdout.flush()

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, status: int, html: str):
        body = html.encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_apk(self, head_only: bool = False):
        path = _apk_path()
        if not os.path.isfile(path):
            self._send_json(404, {"ok": False, "error": "Chưa có file APK nào được phát hành trên VPS."})
            return
        size = os.path.getsize(path)
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/vnd.android.package-archive")
        self.send_header("Content-Disposition", f'attachment; filename="{APK_FILENAME}"')
        self.send_header("Content-Length", str(size))
        self.end_headers()
        if head_only:
            return
        with open(path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path in (f"/download/{APK_FILENAME}", "/download/latest.apk"):
            self._serve_apk(head_only=True)
            return
        self.send_response(200 if path in ("/", "/health", "/api/release") else 404)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            self._send_html(200, HTML_PAGE)
            return
        if path == "/health":
            meta = _release_meta()
            self._send_json(200, {
                "status": "ok",
                "service": "greencharge-hanoi-api",
                "model_provider": ai.MODEL_PROVIDER,
                "model_name": ai.MODEL_NAME or ("fake" if ai.MODEL_PROVIDER == "fake" else ""),
                "apk_available": meta.get("available", False),
                "apk_meta": meta,
            })
            return
        if path == "/api/release":
            self._send_json(200, _release_meta())
            return
        if path in (f"/download/{APK_FILENAME}", "/download/latest.apk"):
            self._serve_apk(head_only=False)
            return
        self._send_json(404, {"ok": False, "error": f"Endpoint không tồn tại: {path}"})

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/api/ask", "/api/chat", "/api/optimize"):
            self._send_json(404, {"ok": False, "error": f"Endpoint không tồn tại: {path}"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(min(length, 262144)).decode("utf-8") if length > 0 else "{}"
            payload = json.loads(raw) if raw.strip() else {}
            if not isinstance(payload, dict):
                self._send_json(400, {"ok": False, "error": "Body phải là JSON object."})
                return
        except Exception as e:
            self._send_json(400, {"ok": False, "error": f"JSON không hợp lệ: {e}"})
            return

        query = _payload_to_query(payload)
        if not query:
            self._send_json(400, {"ok": False, "error": "Thiếu nội dung câu hỏi (trường 'text' / 'message' hoặc thông số chuyến đi)."})
            return

        t0 = time.perf_counter()
        try:
            with _INFER_LOCK:
                tracing.begin("api")
                try:
                    res = answer(query)
                finally:
                    summary, _ = tracing.end()
        except Exception as e:
            self._send_json(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})
            return

        output_text = res.get("output", "") if isinstance(res, dict) else str(res)
        self._send_json(200, {
            "ok": True,
            "query": query,
            "output": output_text,
            "reply": output_text,
            "meta": {
                "models": summary.get("models", []),
                "model_calls": summary.get("model_calls", 0),
                "tool_calls": summary.get("tool_calls", 0),
                "tokens_in": summary.get("tokens_in", 0),
                "tokens_out": summary.get("tokens_out", 0),
                "latency_ms": int(round((time.perf_counter() - t0) * 1000)),
            },
        })


def main():
    host = os.environ.get("API_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", os.environ.get("API_PORT", "8000")))
    server = ThreadingHTTPServer((host, port), GreenChargeHandler)
    print(f"GreenCharge Hanoi API listening on http://{host}:{port} (MODEL_PROVIDER={ai.MODEL_PROVIDER})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐang dừng server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
