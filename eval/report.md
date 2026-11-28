# Báo cáo đánh giá — lượt 1 → một cải tiến → lượt 2

> Điền ở guide bước 4.1. Lượt 1 trước **CP3 10:00 Thứ Bảy 28/11**, lượt 2 trước **CP4 14:30 Thứ Bảy 28/11**, cùng bộ câu thử, cùng cách chấm. Chấm ở rubric R5.
> Số lấy từ `python run.py score eval/run-1.csv` (và `run-2.csv`) sau khi điền cột `pass`. **Kết quả thấp ghi thật vẫn đủ điểm.**
> Không được: sửa chuẩn "đạt", bỏ câu thử trượt, sửa `expected` cho khớp output, sửa kết quả lượt đã chạy.

## 1. Kết quả

| Lượt | Run ID | Đạt / tổng | % | thuong | kho | tu_choi | So với chuẩn "đạt" |
|---|---|---|---|---|---|---|---|
| 1 | `run-1@20261127-193233` | 28/29 | 96,6% | 9/9 | 16/17 | 3/3 | đạt chuẩn tổng (≥80%, an_toan_tram 100%, ma_tram_co_that 100%), nhưng nhóm hỏi lại 3/4 (75%) chưa đạt 80% do lỗi mạng B13 |
| 2 | `run-2@20261127-221406` | 29/29 | 100% | 9/9 | 17/17 | 3/3 | đạt (vượt ≥80%, an_toan_tram 100%, ma_tram_co_that 100%, hỏi lại 4/4 = 100%) |
| 3 (sau CP4) | `run-3@20261128-134206` | 27/29 | 93,1% | 9/9 | 15/17 | 3/3 | đạt chuẩn tổng (≥80%, an_toan_tram 100%, ma_tram_co_that 100%, khung_gio_hop_ly 100% câu áp dụng, hỏi lại 100%); B07, B09 trượt tiêu chí hạng 1 (ST_TX_0x / ST_HM_01) vì trạm OSM gần hơn từ lần đồng bộ data `4971eec` |

Kết quả từng câu: `eval/run-1.csv`, `eval/run-2.csv`, `eval/run-3.csv`. Trace: `traces/run-1.jsonl`, `traces/run-2.jsonl`, `traces/run-3.jsonl`.

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

- Nhắm vào nhóm lỗi: lỗi kết nối API không có retry (`B13` mất câu trả lời) và 2 lỗi nhỏ về văn phong/nhãn thừa do LLM viết lại (`B20`, `B25`) — vì sao là nhóm **đau nhất với người dùng**: mất kết nối khi đang cần tìm trạm làm tài xế không nhận được phương án nào, còn nhãn `"chưa kiểm tầm"` thừa hoặc nhầm ngôi xưng gây hiểu nhầm độ tin cậy khi đang lái xe.
- Đã sửa gì (có thể vài thay đổi cùng nhắm nhóm lỗi đó): thêm retry lỗi mạng tạm thời trong `codebase/ai.py`; siết `SYSTEM` prompt (`codebase/agent.py`) và hậu kiểm `check_answer` (`codebase/tools.py`); đồng thời bổ sung gợi ý khung/trạm sạc xanh theo bức xạ mặt trời Open-Meteo (`shortwave_radiation`) + điểm thưởng `Green Score` dự kiến có xác nhận người dùng.
- Kết quả: lỗi kết nối mạng `1/29 → 0/29` · nhóm `kho` loại hỏi lại `3/4 (75%) → 4/4 (100%)` · tổng `28/29 (96,6%) → 29/29 (100%)` · `B20` hết nhãn thừa `"chưa kiểm tầm"`, `B25` hết lỗi `"Mình đang ở"`.
- Câu nào **tệ đi** sau khi sửa: không có câu nào trượt thêm (0/29 hồi quy); lưu ý nhỏ về văn phong ở `B20` model viết 1 cụm `"mình không cần sạc ngay"` thay vì `"bạn không cần sạc ngay"`, và token tăng ~500–650 token/câu ở các ca có thêm gợi ý sạc xanh / `Green Score`.

## 4. Còn lại

- Lỗi chưa sửa + nguy hiểm thế nào: trạng thái trạm ô tô (`data/hanoi_stations.json`) là dữ liệu `synthetic` cố định, điểm sạc xe máy (`data/hanoi_moto_stations.json`) chưa có trạng thái trống/đông/bảo trì theo thời gian thực, và dữ liệu chưa có thông tin điện mặt trời áp mái riêng từng trạm nên người dùng vẫn cần kiểm tra lại trên app V-Green trước khi di chuyển.
- Nếu có thêm 1 tuần: đối chiếu tay toàn bộ trạm trên app V-Green/hãng xe, tích hợp API trạng thái trụ thời gian thực, mở rộng thêm các dòng xe ngoài `VF e34` / `Evo200` (như `VF5`, `VF8`, `Feliz S`, `BYD Atto 3`) và thu thập thêm dữ liệu điện mặt trời áp mái tại trạm.
