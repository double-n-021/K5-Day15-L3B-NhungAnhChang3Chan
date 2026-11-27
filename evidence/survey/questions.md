# Khảo sát người dùng xe điện tại Hà Nội — Bộ câu hỏi & Log thu thập

> Thời gian mở & thu thập: **27/11/2026, 18:36 – 21:23** (167 phút)
> Kênh gửi: Google Form chia sẻ qua nhóm cộng đồng/người quen đi xe điện tại Hà Nội ([Google Sheets](https://docs.google.com/spreadsheets/d/1snnt7ZLwUSfAMaQSgS3vNXEuUuPBQWm-cn7rXv51xls/edit?gid=914628555#gid=914628555))
> Quy mô: **N = 44** phiếu trả lời (`R01`–`R44`), bỏ **3** người chọn `"Chưa từng đi xe điện"` → **`n = 41` người đúng đối tượng**.
> Ẩn danh: Không thu tên, email hay số điện thoại; bản công khai `evidence/survey/results.csv` đã thay cột `Dấu thời gian` bằng mã ẩn danh `R01`..`R44`.

## Bộ câu hỏi Google Form (8 câu)

| # | Câu hỏi | Vai trò trong phân tích |
|---|---|---|
| 1 | Bạn thuộc nhóm nào khi di chuyển bằng xe điện? | Lọc đúng đối tượng (loại 3 phiếu chưa từng đi xe điện) & phân loại người dùng cá nhân/dịch vụ/thuê xe |
| 2 | Dòng xe điện bạn thường sử dụng gần đây nhất là gì? | Xác định độ phủ dòng xe (ô tô điện vs xe máy điện pin cố định/đổi pin) |
| 3 | Lần gần nhất bạn phải tự tìm trạm sạc công cộng khi đang di chuyển trong chuyến đi là khi nào? | Kiểm chứng hành vi đã xảy ra gần đây |
| 4 | Trung bình mỗi tháng bạn sạc tại trạm công cộng khoảng bao nhiêu lần? | Phân nhóm tần suất cho mô phỏng chi phí `cost/personas.yaml` (`dung_it` / `dung_vua` / `dung_nhieu`) |
| 5 | Ở lần tìm trạm sạc gần nhất, bạn đã dùng cách nào? (Có thể chọn nhiều) | Xác định giải pháp thay thế hiện tại (app hãng, Google Maps, app bên thứ 3…) |
| 6 | Trong 1 tháng qua, bạn từng gặp tình huống nào khi đi tìm hoặc đến trạm sạc? | Đo tỷ lệ các nhóm pain (đông cao điểm, tụt pin do thời tiết/tắc đường, app báo sai, trụ hỏng, thiếu ước tính thời gian/giá) |
| 7 | Lần gặp sự cố hoặc phải chờ sạc khó chịu gần nhất, bạn mất thêm khoảng bao nhiêu thời gian (chờ xếp hàng + chạy vòng sang trạm khác)? | Đầu vào định lượng `spec.md` §2 (`16/41` mất `≥ 20 phút`) |
| 8 | Nếu tiện, bạn kể ngắn 1–2 câu về lần tìm/chờ sạc khó chịu nhất gần đây nhé (VD: ở quận nào, khoảng mấy giờ, đi ô tô hay xe máy điện, ảnh hưởng gì tới chuyến đi của bạn)? | Thu trích dẫn nguyên văn và dựng tình huống thực tế cho `eval/benchmark.csv` (`B19`–`B29`) |
