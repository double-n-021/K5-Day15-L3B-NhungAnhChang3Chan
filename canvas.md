# Canvas — NhungAnhChang3Chan · Track C

> Điền ở guide bước 1.4. CP1 17:00 Thứ Sáu 27/11: nộp bản đầu, đủ 7 dòng (dòng 4 được ghi giả thuyết + nguồn sẽ kiểm).
> CP2 19:30 Thứ Sáu 27/11: cập nhật (số bằng chứng đầu, lát cắt đã chốt) và điền dòng "Đã đổi gì so với CP1".
> Track F: chép thêm thẻ đề của nhóm (khung trong file track F) xuống dưới bảng này.

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track C (Du lịch & Di chuyển) · Trợ lý gợi ý Top 3 trạm sạc công cộng và khung giờ sạc cho tài xế xe điện đi du lịch/di chuyển tại Hà Nội (CHARGEPILOT). |
| 2 | Người dùng chính (một vai cụ thể — không phải "học viên nói chung") | Tài xế xe điện đi du lịch tự lái hoặc tài xế xe điện chở khách du lịch/di chuyển theo lịch trình tại TP. Hà Nội. |
| 3 | Pain một câu: ai — đang làm gì — vướng đâu — hậu quả | Tài xế xe điện đi du lịch hoặc chạy theo lịch trình tại Hà Nội khi tìm trạm sạc công cộng chỉ thấy khoảng cách trên bản đồ mà không biết trước trụ đang kẹt/bảo trì, thời tiết rét làm hao pin nhanh hay khung giờ cao điểm lưới điện, dẫn đến mất thời gian xếp hàng hoặc phải đổi trạm, dễ lỡ lịch trình và có nguy cơ cạn pin giữa đường. |
| 4 | Bằng chứng đầu — CP1: giả thuyết + nguồn sẽ kiểm · CP2: số đầu tiên + 1 trích dẫn | Khảo sát Google Form 27/11 (`N = 44`, bỏ 3 chưa đi xe điện → `n = 41`): `18/41` gặp trạm đông giờ cao điểm, `18/41` bị rét/nóng/tắc đường tụt pin, `15/41` app báo trống nhưng tới nơi kín chỗ, `15/41` gặp trụ hỏng/bảo trì, `16/41` mất thêm `≥ 20 phút`. Trích dẫn (phiếu dòng 6, `evidence/survey/results.csv`): *"Đi cả chục cái tủ đổi pin, tủ nào cũng 2, 3 ông tài xế nằm chờ pin"*. |
| 5 | **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả) | Tài xế xe điện đi du lịch hoặc di chuyển theo lịch trình tại Hà Nội → tìm trạm sạc công cộng và khung giờ sạc hợp lý trước khi cạn pin → AI kết hợp % pin, lịch trình tiếp theo, thời tiết Hà Nội (Open-Meteo), trạng thái trụ (trống/đông/bảo trì) và khung giờ lưới/giá điện để xếp hạng Top 3 trạm + khung giờ sạc kèm chốt chặn an toàn (loại trụ bảo trì, ưu tiên cứu pin <15%, từ chối khi thiếu dữ liệu) → giảm thời gian chờ trụ hỏng/kẹt, tránh lỡ lịch du lịch và đảm bảo đủ pin an toàn. |
| 6 | AI tự làm đến đâu + 1 dòng lý do: sai thì ai chịu gì | AI gợi ý Top 3 phương án và giải thích, tài xế tự chọn và điều hướng — vì nếu gợi ý nhầm trụ hỏng hoặc khuyên chờ sai lúc pin yếu (<15%), tài xế chịu rủi ro cạn pin giữa đường và lỡ lịch trình. |
| 7 | Phân công có tên | Bùi Đặng Nhật Nguyên (Đội trưởng: kiến trúc & lõi AI run.py) · Nguyễn Hoàng Gia An (pain & dữ liệu trạm/thời tiết) · Trần Gia Bảo (bộ câu thử 20–30 ca & metric eval/) · Từ Huy Bảo (mô phỏng chi phí cost/, slide & video dự phòng). |
| — | *(CP2)* Đã đổi gì so với CP1 | Chốt dùng khảo sát Google Form (`N = 44`, `n = 41`) làm nguồn bằng chứng đạt ngưỡng; bổ sung `data/hanoi_moto_stations.json` (53 điểm sạc/đổi pin xe máy điện) cho người dùng phụ Evo200 với nhãn `"trạng thái chưa xác minh"` và giữ nguyên lát cắt chính cho ô tô điện Hà Nội (`VF e34`). |
