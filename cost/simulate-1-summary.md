# Tóm tắt mô phỏng simulate-1@20261127-222529

Do `python run.py simulate` sinh ra — không sửa tay. Chép bảng sang `cost/cost-estimate.md`.

| Persona | Số phiên mô phỏng | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| dung_it | 31 | 1 | 1317 | 585 | 1.0 | 5.6 |
| dung_vua | 14 | 2 | 2799 | 1348 | 2.0 | 12.4 |
| dung_nhieu | 5 | 3 | 4116 | 2100 | 3.0 | 18.6 |

Tỉ lệ đạt dùng để tính: 29/29 (100%) — lượt run-2@20261127-221406

- Tỉ lệ đạt lấy từ lượt nhóm chọn: eval/run-2.csv (--rate-from).

| Model (giá) | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp (1.000 người) | Chi phí / tháng — cơ sở (3.800 người) | Chi phí / tháng — cao (10.000 người) | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| claude-haiku-5-5 (vào 0.1 · ra 0.5 $/1M) | $0.00068 (≈ 17 ₫) | $0.00068 (≈ 17 ₫) | $0.00046 (≈ 12 ₫) | $5.70 (≈ 144.661 ₫) | $21.64 (≈ 549.711 ₫) | $56.95 (≈ 1.446.607 ₫) | $0.0057 (≈ 145 ₫) |
| claude-sonnet-5-5 (vào 2.0 · ra 10.0 $/1M) | $0.0135 (≈ 344 ₫) | $0.0135 (≈ 344 ₫) | $0.0091 (≈ 232 ₫) | $113.91 (≈ 2.893.214 ₫) | $432.84 (≈ 10.994.215 ₫) | $1,139.06 (≈ 28.932.145 ₫) | $0.1139 (≈ 2.893 ₫) |

- Chi phí / task thành công = chi phí / phiên ÷ tỉ lệ đạt. Chi phí / câu hỏi đạt = chi phí / phiên ÷ số lượt hỏi trung bình mỗi phiên (1.5) ÷ tỉ lệ đạt — tỉ lệ đạt đo theo từng câu thử.
- Token đo trên model: claude-haiku-5-5. Giá tính theo từng model trong bảng — model khác bộ tách token thì số token thật có thể lệch; ghi rõ "đo trên model X, tính giá model Y" trong cost/cost-estimate.md.
- Phiên lỗi (không tính vào trung bình): 0/50.
- Tỷ giá: 1 USD = 25.400 ₫ (Tỷ giá tham khảo USD/VND ~25.400 đ (tự ước tính để quy đổi)).
