# Báo cáo đánh giá — lượt 1 → một cải tiến → lượt 2

> Điền ở guide bước 4.1. Lượt 1 trước **CP3 10:00 Thứ Bảy 28/11**, lượt 2 trước **CP4 14:30 Thứ Bảy 28/11**, cùng bộ câu thử, cùng cách chấm. Chấm ở rubric R5.
> Số lấy từ `python run.py score eval/run-1.csv` (và `run-2.csv`) sau khi điền cột `pass`. **Kết quả thấp ghi thật vẫn đủ điểm.**
> Không được: sửa chuẩn "đạt", bỏ câu thử trượt, sửa `expected` cho khớp output, sửa kết quả lượt đã chạy.

## 1. Kết quả

| Lượt | Run ID | Đạt / tổng | % | thuong | kho | tu_choi | So với chuẩn "đạt" |
|---|---|---|---|---|---|---|---|
| 1 | `run-1@20261127-193233` | 28/29 | 96,6% | 9/9 | 16/17 | 3/3 | đạt chuẩn tổng (≥80%, an_toan_tram 100%, ma_tram_co_that 100%), nhưng nhóm hỏi lại 3/4 (75%) chưa đạt 80% do lỗi mạng B13 |
| 2 | | __/__ | | __/__ | __/__ | __/__ | đạt / chưa |

Kết quả từng câu: `eval/run-1.csv`, `eval/run-2.csv`. Trace: `traces/run-1.jsonl`, `traces/run-2.jsonl`.

## 2. Lỗi lượt 1 — gom thành nhóm có tên

| Nhóm lỗi | Số câu | Câu |
|---|---|---|
| Lỗi kết nối API không có retry (`WinError 10054`) | 1 | B13 |
| Lưu ý nhỏ văn phong/nhãn thừa do LLM viết lại (chưa làm trượt `pass`) | 2 | B20 (tự thêm `'chưa kiểm tầm'`), B25 (xưng nhầm `'Mình đang ở'`) |

**≥3 lỗi cụ thể:**

| Câu | Input | Output | Vì sao sai |
|---|---|---|---|
| B13 (trượt `pass=0`) | "Pin 30%, VF e34, đang ở Phố Cổ. Tối nay đi chơi tiếp." | *(rỗng — lỗi `URLError: [WinError 10054]`)* | Mất kết nối API khi gọi Claude và `call_claude` chưa có retry/fallback → không có câu trả lời cho người dùng |
| B20 (lưu ý nhỏ, `pass=1`) | "Evo200 còn 35%, đang ở Thanh Xuân 18:00 thứ Sáu, 19:30 đi chơi Hồ Tây..." | "...đây là 3 trạm gần bạn nhất (trạng thái chưa xác minh, chưa kiểm tầm)..." | Đã tính tầm an toàn 40,6 km cho Evo200 nhưng LLM tự thêm cụm `"chưa kiểm tầm"` từ system prompt |
| B25 (lưu ý nhỏ, `pass=1`) | "Evo200 còn 15%, mình đang ở Vincom Bà Triệu. Sạc ở trụ V-Green tại đây..." | "Mình đang ở Vincom Bà Triệu, xe Evo200 còn 15% pin..." | Đạt tiêu chí nhưng LLM đổi đại từ khiến câu đọc như trợ lý đang đứng tại Vincom Bà Triệu thay vì người dùng |

## 3. Một lần cải tiến

- Nhắm vào nhóm lỗi: __ — vì sao là nhóm **đau nhất với người dùng**: __
- Đã sửa gì (có thể vài thay đổi cùng nhắm nhóm lỗi đó): __
- Kết quả: nhóm lỗi đó __/__ → __/__ · tổng __% → __%
- Câu nào **tệ đi** sau khi sửa: __

## 4. Còn lại

- Lỗi chưa sửa + nguy hiểm thế nào: __
- Nếu có thêm 1 tuần: __
