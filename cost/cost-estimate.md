# Chi phí khi dùng thật

> Điền ở guide bước 4.2, nộp ở CP4 14:30 Thứ Bảy 28/11. Ôn lại: ngày 13, ngày 1, ngày 14 · lab ngày 13, lab ngày 14. Chấm ở rubric R6.
> Số **không điền tay**: điền `cost/personas.yaml` → `python run.py simulate` → chép bảng trong `cost/simulate-N-summary.md` vào đây.
> Lúc build dùng gói miễn phí vẫn tính theo **giá gói trả phí** — đây là chi phí cho lúc đưa vào dùng thật.

## 1. Đầu vào

- **Persona** (`cost/personas.yaml`): 3 kiểu dựa trên khảo sát `n=36` (27/11/2026, câu 4 về tần suất sạc công cộng/tháng) — `dung_it` (64%, 2 phiên/tháng, 1 lượt hỏi), `dung_vua` (22%, 7 phiên/tháng, 2 lượt hỏi), `dung_nhieu` (14%, 18 phiên/tháng, 3 lượt hỏi). Nguồn tỷ lệ: khảo sát Google Form; số lượt hỏi/phiên: *(tự ước tính)*.
- **Số người dùng thật** 3 kịch bản: thấp `1.000` · cơ sở `3.800` · cao `10.000`. Nguồn: Hà Nội ghi nhận hơn 38.400 ô tô con điện cuối năm 2025 (`solenvn.com`, xem 27/11/2026); lấy ~2,6% / ~10% / mở rộng cả xe máy điện là *(tự ước tính)*.
- **Giá** 2 mức model (`https://www.anthropic.com/pricing`, xem 27/11/2026): `claude-haiku-5-5` (vào $0.10 · ra $0.50 / 1M token) · `claude-sonnet-5-5` (vào $2.00 · ra $10.00 / 1M token); quy đổi 1 USD = 25.400 ₫ *(tự ước tính)*.
- **Tỉ lệ đạt** dùng để tính: `29/29 (100%)` — lượt `run-2@20261127-221406` (`eval/run-2.csv`)
- Đo token trên model `claude-haiku-5-5`, tính giá model `claude-haiku-5-5` và `claude-sonnet-5-5`.

## 2. Kết quả mô phỏng

Lượt mô phỏng: `cost/simulate-1.csv` · run ID `simulate-1@20261127-222529` · `50` phiên (`0/50` lỗi) · seed `42`

*(chép từ `cost/simulate-1-summary.md`)*

| Model (giá) | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp (1.000 người) | Chi phí / tháng — cơ sở (3.800 người) | Chi phí / tháng — cao (10.000 người) | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| claude-haiku-5-5 (vào 0.1 · ra 0.5 $/1M) | $0.00068 (≈ 17 ₫) | $0.00068 (≈ 17 ₫) | $0.00046 (≈ 12 ₫) | $5.70 (≈ 144.661 ₫) | $21.64 (≈ 549.711 ₫) | $56.95 (≈ 1.446.607 ₫) | $0.0057 (≈ 145 ₫) |
| claude-sonnet-5-5 (vào 2.0 · ra 10.0 $/1M) | $0.0135 (≈ 344 ₫) | $0.0135 (≈ 344 ₫) | $0.0091 (≈ 232 ₫) | $113.91 (≈ 2.893.214 ₫) | $432.84 (≈ 10.994.215 ₫) | $1,139.06 (≈ 28.932.145 ₫) | $0.1139 (≈ 2.893 ₫) |

Chi phí / task thành công = chi phí trung bình mỗi phiên ÷ tỉ lệ đạt — **không coi như đạt 100%**.

## 3. So với impact

- Impact / người / tháng (`spec.md` §2): ~136.344 phút/tháng (~2.272 giờ/tháng) cho 3.800 người dùng cơ sở (`spec.md` §2); theo khảo sát `n=41`, `16/41` người mất thêm **≥ 20 phút** cho một lần gặp sự cố/chờ sạc gần nhất, với nhóm dùng vừa/nhiều (`4–18` phiên/tháng) tương ứng hàng chục đến vài trăm phút tiết kiệm nếu tránh được trụ hỏng/kẹt.
- Chi phí / người / tháng (cơ sở, model `claude-haiku-5-5`): **`$0.0057` (≈ 145 ₫/người/tháng)**; ngay cả nếu chạy toàn bộ bằng `claude-sonnet-5-5` cũng chỉ `$0.1139` (≈ 2.893 ₫/người/tháng).
- **Kết luận một dòng — đáng làm không:** **Rất đáng làm** trên `claude-haiku-5-5` (chi phí ~17 ₫/phiên, tổng ~550 nghìn ₫/tháng cho 3.800 người dùng cơ sở nhờ thiết kế workflow cố định chỉ gọi LLM 1 lần/lượt và code tự tính toán/hậu kiểm).

## 4. *(Muốn sâu hơn, không bắt buộc)*

- Bảng độ nhạy: model rẻ hơn · cache · cắt ngữ cảnh · giới hạn bước — mỗi cần gạt đổi chi phí bao nhiêu
- Chi phí ngoài model: hosting, lưu trữ, giờ công người duyệt
- Quy mô nào thì bài toán còn đáng làm
