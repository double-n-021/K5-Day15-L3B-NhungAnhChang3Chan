# Hồ sơ đánh giá — một trang

> Điền ở guide bước 2.4 (mục 1–4, trước CP2) và 4.1 (mục 5–6, trước CP4). Ôn lại: ngày 9, ngày 14 · lab ngày 9. Chấm ở rubric R4, R5.
> Người ngoài nhóm đọc trang này phải hiểu được: nhóm đo cái gì, bằng gì, ra số nào. Trang slide "Đánh giá thế nào" lấy từ đây.

## 1. Dataset → xử lý

Dữ liệu từ `data/DATA_CARD.md`: (1) `data/weather_fallback.json` — dự báo 168h Open-Meteo Hà Nội; (2) `data/hanoi_stations.json` — `32` trạm ô tô `synthetic` (`seed=42`, 22 trống / 7 đông / 3 bảo trì); (3) `data/hanoi_landmarks.json` — `16` địa danh nội thành; (4) `data/ev_models.json` — `2` mẫu xe (`VF e34`, `Evo200`); (5) `data/hanoi_moto_stations.json` — `53` điểm sạc/đổi pin xe máy tổng hợp từ 17 trang công khai + geocode Nominatim (`38` điểm Evo200 dùng được).

## 2. Bộ câu thử dựng ra sao

- `eval/benchmark.csv`: `29` câu (`thuong 9` · `kho 17` · `tu_choi 3`, trong đó `2` câu tấn công `B15`, `B16`)
- Nguồn (`python run.py check` in sẵn): `nguoi_dung 11` · `data_that 0` · `tu_viet 18` · `sinh_seed 0` → từ người dùng / data thật `11/29` (`37,9%`, đạt ngưỡng `≥ 1/3`)
- Độ phủ — lưới input 4 chiều (guide 2.4 bước 5): dòng xe (`VF e34`, `Evo200`, xe lạ `BYD Atto 3`/`Feliz S`/thiếu dòng xe) × mức `%` pin (`<15%` cứu pin, `15–60%`, thiếu `%` pin) × khung thời gian/thời tiết (`17:30–22:30` T2–T7 cao điểm, Chủ nhật, `12°C` rét) × địa điểm/ý định (`16` địa danh HN, ngoài vùng Ba Vì, ngoài HN Hạ Long, đặt chỗ/OTP, `prompt injection`)
- Câu `kho` / `tu_choi` trỏ về 4 lớp chỗ khó (`spec.md` §5): lớp 1 (`B09`, `B10`, `B12`, `B19`, `B21`, `B24`) · lớp 2 (`B08`, `B13`, `B27`, `B28`) · lớp 3 (`B15`, `B16`, `B17`) · lớp 4 (`B07`, `B11`, `B14`, `B18`, `B23`, `B26`, `B29`)

## 3. Metric và cách chấm

| Metric (`eval/metric_spec.yaml`) | Cách chấm | Ngưỡng |
|---|---|---|
| `an_toan_tram` | `code` | `100%` câu (`0` câu gợi ý trụ bảo trì / vượt tầm / sai loại xe) |
| `ma_tram_co_that` | `code` | `100%` câu (`0` mã trạm bịa, trạng thái trạm ST khớp data, trạm MOTO không bịa trạng thái) |
| `khung_gio_hop_ly` | `code` | `≥ 85%` câu áp dụng (đúng cứu pin `<15%`, né cao điểm `17:30–22:30` T2–T7 khi lịch cho phép, xong trước hẹn 15') |
| `tu_choi_va_hoi_lai` | `nguoi` | `100%` câu `tu_choi` và `≥ 80%` câu `kho` loại hỏi lại |

- **Người thứ hai chấm thử:** chưa thực hiện chéo kiểm 5 output độc lập — cần 1 thành viên ngoài người viết spec chấm đối chiếu trước CP4 *(cần ≥ 4/5; lệch thì rà lại định nghĩa)*.
- LLM chấm (nếu có): Không dùng LLM chấm (`0` câu; chấm bằng code + người theo `eval/metric_spec.yaml`).
- **Chuẩn "đạt"** (chép nguyên từ `spec.md` §7, chốt trước 19:30 Thứ Sáu 27/11): `"Đạt khi ≥ 80% câu qua, và an_toan_tram = 100% (0 câu gợi ý trạm bảo trì / vượt tầm / sai loại xe), ma_tram_co_that = 100% (0 mã trạm bịa)"`

## 4. Lệnh

`python run.py eval` → `eval/run-N.csv` + `traces/run-N.jsonl` · điền cột `pass` · `python run.py score eval/run-N.csv`

## 5. Đã chạy gì

| Lượt | Run ID | Model | Cấu hình (prompt / công cụ / thay đổi) | Đạt / tổng | % | Đạt chuẩn? |
|---|---|---|---|---|---|---|
| 1 | `run-1@20261127-193233` | `claude-haiku-5-5` | Workflow cố định 6 tool (`codebase/agent.py`, `tools.py`) + Claude viết lại bản nháp (`effort=low`) + `check_answer` fallback | 28/29 | 96,6% | Đạt chuẩn tổng (trượt 1 câu lỗi mạng B13) |
| 2 | `run-2@20261127-221406` | `claude-haiku-5-5` | Thêm retry mạng (`ai.py`), siết `SYSTEM` + `check_answer` (`agent.py`, `tools.py`), thêm gợi ý sạc xanh Open-Meteo + `estimate_green_reward` (`Green Score`) | 29/29 | 100% | Đạt chuẩn |

Lượt chạy lại vì lỗi kỹ thuật, lượt sau CP4: ghi thêm dòng, không sửa dòng cũ.

## 6. Lỗi chính

- Nhóm lỗi lớn nhất ở lượt 1 là mất kết nối API không có retry (`WinError 10054` ở `B13`, khiến `pass=0`, `28/29`) kèm 2 lưu ý nhỏ về văn phong/nhãn thừa do LLM viết lại (`B20` tự thêm `"chưa kiểm tầm"`, `B25` nhầm ngôi `"Mình đang ở"`).
- Đã sửa cho lượt 2 bằng retry mạng tạm thời trong `codebase/ai.py`, siết `SYSTEM` prompt (`codebase/agent.py`) và hậu kiểm `check_answer` (`codebase/tools.py`), nâng tỷ lệ đạt lên `29/29 (100%)` và `0` hồi quy.
- Còn lại: dữ liệu trạm ô tô `data/hanoi_stations.json` là `synthetic`, điểm sạc xe máy chưa có trạng thái thời gian thực và dữ liệu chưa có thông tin điện mặt trời áp mái riêng từng trạm.
