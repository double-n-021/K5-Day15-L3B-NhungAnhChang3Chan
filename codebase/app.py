"""Khung chạy bản chạy thử tối thiểu (dòng lệnh): gõ đầu vào → answer() trong agent.py → in kết quả.

Chạy bằng: python run.py   (macOS/Linux có thể là python3, Windows có thể là py)
Nhóm thay bằng giao diện của mình (web, bot…) nhưng giữ `python run.py` là lệnh duy nhất
để chạy bản chạy thử (sửa hàm run_app() trong run.py nếu cần).
"""
import os
import re
import sys

for _stream in (sys.stdout, sys.stderr, sys.stdin):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _where(e):
    """File (trong codebase/) gây lỗi khi nạp: SyntaxError có e.filename, lỗi khác lấy khung cuối của traceback."""
    import traceback
    path = getattr(e, "filename", None) or (traceback.extract_tb(e.__traceback__)[-1].filename if e.__traceback__ else "")
    if not path:
        return "codebase/"
    p = os.path.abspath(path)
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.relpath(p, base).replace(os.sep, "/") if p.startswith(base) else path

def main() -> int:
    try:
        import tracing
        from agent import answer
    except Exception as e:  # lỗi cú pháp, thiếu thư viện… trong codebase/
        print("Không nạp được codebase/ — lỗi ở %s: %s: %s" % (_where(e), type(e).__name__, e))
        print("Sửa lỗi rồi chạy lại. Cách nối model: docs/connect-model.md")
        return 1
    print("Bản chạy thử — gõ đầu vào rồi Enter. Thoát: Ctrl+C (hoặc Enter 2 lần với dòng trống).")
    blank = 0
    session_green_points = 0
    while True:
        try:
            text = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not text:
            blank += 1
            if blank >= 2:
                return 0
            continue
        blank = 0
        tracing.begin("app")
        try:
            result = answer(text)
        except NotImplementedError as e:
            tracing.end()
            print("Chưa nối model: %s" % e)
            return 1
        except Exception as e:  # lỗi gọi model: báo rồi cho hỏi tiếp
            tracing.end()
            print("[lỗi] %s: %s" % (type(e).__name__, e))
            continue
        s, _ = tracing.end()
        output = result.get("output", "") if isinstance(result, dict) else result
        print(output)
        print("   (model: %s · gọi model %d lần · công cụ %d lần · token vào %d / ra %d)"
              % (", ".join(s["models"]) or "—", s["model_calls"], s["tool_calls"], s["tokens_in"], s["tokens_out"]))
        m_pts = re.search(r"\+(\d+)\s*điểm", output)
        if m_pts and sys.stdin.isatty():
            pts = int(m_pts.group(1))
            try:
                ans = input("Xác nhận chọn sạc theo gợi ý xanh để ghi nhận +%d điểm Green Score phiên này? (y/N): " % pts).strip().lower()
            except (EOFError, KeyboardInterrupt):
                print()
                return 0
            if ans in ("y", "yes", "c", "co", "có"):
                session_green_points += pts
                print("   -> Đã ghi nhận +%d điểm (Tổng Green Score phiên này: %d điểm)." % (pts, session_green_points))


if __name__ == "__main__":
    sys.exit(main())
