# Data card — dữ liệu bản chạy thử dùng

> Bản đầu cho mốc **CP2 (27/11/2026)** · Sẽ cập nhật bổ sung đối chiếu bằng chứng thật cho **CP3 (28/11/2026)**.

## Dataset 1 · Thời tiết & bức xạ mặt trời Hà Nội (`data/weather_fallback.json` + API sống)

| | |
|---|---|
| Dùng để làm gì | Nguồn cho công cụ `get_hanoi_weather` để điều chỉnh tầm chạy xe theo nhiệt độ (rét <15°C / nắng nóng >36°C), cảnh báo mưa và ước lượng khung giờ nắng có điện mặt trời |
| Từ đâu | **Open-Meteo Weather Forecast API** (`https://api.open-meteo.com/v1/forecast?latitude=21.0285&longitude=105.8542&hourly=temperature_2m,shortwave_radiation,precipitation_probability&timezone=Asia%2FBangkok`) |
| Xử lý những bước gì | Gọi trực tiếp qua HTTP GET; lưu 1 snapshot JSON dự phòng tại `data/weather_fallback.json` để dùng khi chạy kiểm thử offline/mất mạng |
| Số dòng / số đoạn | 168 giờ dự báo liên tục (7 ngày × 24h) |
| Phiên bản / ngày lấy | 27/11/2026 |
| Nhãn | **thật** |
| Giới hạn | Dữ liệu dự báo điểm trung tâm Hà Nội (21.0285, 105.8542), chưa chi tiết hóa nhiệt độ vi khí hậu từng quận |

## Dataset 2 · Danh mục trạm sạc & địa điểm du lịch Hà Nội (`data/hanoi_stations.json`, `data/hanoi_landmarks.json`)

| | |
|---|---|
| Dùng để làm gì | Nguồn cho công cụ `plan_route_and_stations` định vị điểm đi/đến du lịch Hà Nội, lọc trạm trên lộ trình và kiểm chứng mã trạm không bịa |
| Từ đâu | Tham chiếu địa điểm công khai tại Hà Nội (OpenStreetMap / hệ thống trạm công cộng V-Green, EV ONE, EBOOST, Esky Charge, Charge+) kết hợp dữ liệu trạng thái mô phỏng có seed |
| Xử lý những bước gì | Chuẩn hóa tọa độ (`lat, lon`), công suất (`power_kw`), cơ chế giá (`flat_vgreen` 3.858₫ vs `tou_2892` theo QĐ 2892/QĐ-BCT & QĐ 963/QĐ-BCT), gắn trạng thái nền & hàng đợi mô phỏng với `seed=42`, gắn cờ vùng phát thải thấp `lez_zone` cho Hoàn Kiếm/Phố Cổ |
| Số dòng / số đoạn | 32 trạm sạc tại 12 quận/huyện Hà Nội + 16 địa điểm du lịch/cửa ngõ Hà Nội |
| Phiên bản / ngày lấy | v1.0 — 27/11/2026 |
| Nhãn | **hỗn hợp**: vị trí/địa danh & khung giá quy định là **thật**; trạng thái trụ (`available/crowded/maintenance`) và hệ số độ đông theo giờ đến (ETA) là **`synthetic` (`seed=42`)** |
| Giới hạn | **Không có API thời gian thực từ V-Green/CPO**, nên trạng thái trống/bận/bảo trì và độ đông ước tính tại thời điểm đến được mô phỏng theo hồ sơ tải giờ EVNHANOI (đỉnh 17:30–22:30) + `base_queue` có `seed=42` |

## Dataset 3 · Thông số xe điện phổ biến tại Việt Nam (`data/ev_models.json`)

| | |
|---|---|
| Dùng để làm gì | Nguồn tính toán dung lượng pin (kWh), tầm chạy lý thuyết (km), công suất sạc tối đa của xe và thời gian sạc từ `% pin hiện tại → % pin muốn sạc` |
| Từ đâu | Thông số kỹ thuật công bố của nhà sản xuất (VinFast VF3/VF5/VFe34/VF6/VF8, BYD Atto 3) |
| Xử lý những bước gì | Chuẩn hóa về JSON thống nhất, thêm hệ số hao pin thời tiết (`cold_drain_pct=15%`, `heat_drain_pct=10%`) |
| Số dòng / số đoạn | 6 mẫu xe điện phổ biến tại Việt Nam |
| Phiên bản / ngày lấy | v1.0 — 27/11/2026 |
| Nhãn | **thật** (thông số xe); hệ số hao pin 15%/10% là tham số ước lượng kỹ thuật |
| Giới hạn | Chưa bao phủ mọi dòng xe nhập khẩu và chưa tính độ chai pin (SoH) theo tuổi xe |

**Lưu ý tuân thủ (Guide 1.2 & 2.4):** Các phần trạng thái trụ `synthetic (seed=42)` chỉ dùng để kiểm thử logic ra quyết định và chốt chặn an toàn của AI — **tuyệt đối không tính là bằng chứng pain**. Bằng chứng pain thu thập từ người dùng thật/review công khai được lưu riêng trong `evidence/`.
