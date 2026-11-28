# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Code bản chạy thử & Mobile/API | Claude / Antigravity / Codex | Gợi ý khung hàm `codebase/` (`agent.py`, `tools.py`, `api_server.py`), Docker/CI VPS (`deploy/`) và ứng dụng `mobile/` | Kiểm tra toàn bộ công thức tầm an toàn, bộ lọc bảo trì/loại xe, hợp đồng API `v1.0.0` (`test_api_contract.py` 7/7) và nối live VPS | Bùi Đặng Nhật Nguyên, Từ Huy Bảo |
| Prompt / thiết kế lời gọi mô hình | Claude / Antigravity | Gợi ý cấu trúc `SYSTEM` prompt siết quy tắc G10 và phân biệt ngôi xưng | Chạy thử trực tiếp với `claude-haiku-5-5`, siết hậu kiểm `check_answer` sau lỗi lượt 1 (`B20`, `B25`) | Bùi Đặng Nhật Nguyên |
| Đào data (viết script đếm, gợi ý nhãn) | *(Chưa thực hiện)* | Không dùng cho nguồn bằng chứng đào data trong CP3 | Nhóm dùng khảo sát Google Form `N = 44` (`n = 41`) làm nguồn bằng chứng chính | Nguyễn Hoàng Gia An |
| Rà câu hỏi phỏng vấn / khảo sát | ChatGPT / Claude | Chỉ rà câu dẫn dắt khảo sát để hỏi sự cố đã xảy ra trong 1 tháng qua và ẩn danh hoá CSV | Xuất trực tiếp từ Google Sheets (`N = 44`), rà 0 email / 0 SĐT trong `results.csv` | Nguyễn Hoàng Gia An |
| Viết câu thử (benchmark) | Claude / Antigravity | Gợi ý cấu trúc lưới 4 chiều và kiểm tra tính nhất quán `pass_criterion` | Tự viết 18 ca khó/tấn công (`B01`–`B18`) và dựng tay 11 ca `nguoi_dung` (`B19`–`B29`) từ khảo sát, kiểm bằng `run.py check` | Trần Gia Bảo |
| Sinh data `synthetic` (nếu có) | Claude / Python script | Gợi ý format JSON chuẩn và crawl Overpass API OpenStreetMap | Seed `42` · kiểm tay công thức tính `safe_range`, `3` mã bảo trì cố định và đối chiếu `0/191` trên app hãng (giữ nhãn trạng thái `synthetic`) | Bùi Đặng Nhật Nguyên, Nguyễn Hoàng Gia An |
| Chấm cột `pass` bằng LLM (nếu có) | Lượt 1–2: không dùng. Lượt 3: Claude (coding agent) | Lượt 1–2 không dùng LLM chấm. Lượt 3 (`eval/run-3.csv`): Claude viết script kiểm 3 metric `code` theo `eval/metric_spec.yaml` dựa trên `data/` và `traces/run-3.jsonl`, đọc output các câu từ chối / hỏi lại, rồi điền cột `pass` + `ghi_chu` (không đổi cột khác) | Lượt 1–2: tự chấm thủ công `29/29` câu, đối chiếu bằng `run.py score`. Lượt 3: Trần Gia Bảo chấm độc lập 5 câu (`B08`, `B13`, `B15`, `B16`, `B17`, gồm cả 3 câu từ chối), khớp 5/5 với cột `pass` | Trần Gia Bảo |
| Slide, văn bản (`spec.md`, báo cáo) | Claude / Antigravity | Hỗ trợ tổng hợp bảng biểu Markdown, sơ đồ Mermaid và rà lỗi chéo tài liệu | Đối chiếu lại toàn bộ số liệu `run-1` (28/29), `run-2` (29/29), `simulate-1` (50 phiên) và bảng giá Anthropic | Từ Huy Bảo, Bùi Đặng Nhật Nguyên |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).
