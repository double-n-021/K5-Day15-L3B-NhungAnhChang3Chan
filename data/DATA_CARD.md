# Data card — dữ liệu bản chạy thử dùng

> Bản đầu CP2 (27/11/2026). Bổ sung đối chiếu nguồn thật trước CP3 (28/11/2026).
> 4 file JSON lấy lại từ commit `266b2a5` (đã bị revert lúc 18:04 27/11, khôi phục riêng phần `data/`).
> Không file nào chứa dữ liệu cá nhân. Không dùng data BTC cấp.

## Dataset 1 · Thời tiết Hà Nội (`data/weather_fallback.json` + API Open-Meteo)

| | |
|---|---|
| Dùng để làm gì | Nguồn cho công cụ thời tiết: hệ số hao pin (rét ≤15°C, nóng ≥36°C, mưa ≥70%) trong công thức tầm an toàn (`eval/metric_spec.yaml`) |
| Từ đâu | Open-Meteo Forecast API, biến `temperature_2m`, `shortwave_radiation`, `precipitation_probability`, `timezone=Asia/Bangkok` |
| Xử lý những bước gì | Gọi HTTP GET, lưu nguyên 1 bản JSON để chạy khi không có mạng. Không lọc, không sửa số |
| Số dòng / số đoạn | 168 giờ (7 ngày × 24 giờ, 27/11 → 03/12/2026) |
| Phiên bản / ngày lấy | Bản lưu ngày 27/11/2026 |
| Nhãn | thật |
| Giới hạn | Một điểm lưới (21.054, 105.898, Open-Meteo tự làm tròn điểm hỏi 21.0285, 105.8542), không theo quận. Trong 7 ngày nhiệt độ 15,5–28,1°C và mưa ≤56%, **không giờ nào chạm ngưỡng rét ≤15°C**, nên ca rét (B12) phải dùng nhiệt độ người dùng nói. Đây là dự báo, không phải số đo |

## Dataset 2 · Trạm sạc Hà Nội (`data/hanoi_stations.json`)

| | |
|---|---|
| Dùng để làm gì | Nguồn cho công cụ tìm trạm: lọc trạm bảo trì, xếp hạng Top 3, đối chiếu metric `an_toan_tram` và `ma_tram_co_that` |
| Từ đâu | Nhóm tự dựng. Tên, vị trí và đơn vị vận hành phỏng theo trạm công khai (V-Green, EV ONE, EBOOST, Esky Charge, Charge+) |
| Xử lý những bước gì | Chuẩn hoá `lat/lon`, `power_kw`, `ports_total`, `pricing_model`, `has_roof`. Gắn `base_status` (available/crowded/maintenance) và `base_queue` cố định, ghi `seed=42` |
| Số dòng / số đoạn | 32 trạm · 14 quận/huyện · 22 trống · 7 đông · 3 bảo trì (ST_BD_03, ST_TX_03, ST_HM_02) |
| Phiên bản / ngày lấy | v1.0 — 27/11/2026 |
| Nhãn | `synthetic`. **Chưa đối chiếu từng trạm** với app hãng, nên tên/toạ độ chưa được coi là thật |
| Giới hạn | Không có API thời gian thực của đơn vị vận hành, trạng thái là cố định chứ không đổi theo giờ. Thiếu vùng ngoại thành (Ba Vì, Sơn Tây, Thạch Thất…). Chưa ghi trạm nào chỉ nhận xe VinFast |

**Cách sinh (synthetic):** người dựng Nhật Nguyên · cách sinh: tự gán bằng tay theo `seed=42` (ghi trong từng dòng) · người kiểm: __ · số dòng đã kiểm tay với app hãng: __/32 *(điền trước CP3)*.

## Dataset 3 · Địa điểm du lịch / điểm xuất phát (`data/hanoi_landmarks.json`)

| | |
|---|---|
| Dùng để làm gì | Định vị nơi người dùng đứng (tên quận, địa danh) → tính khoảng cách tới trạm |
| Từ đâu | Nhóm tự viết. Toạ độ trung tâm địa danh công khai, có alias không dấu |
| Xử lý những bước gì | Gắn alias, gắn cờ `lez_zone` cho Hoàn Kiếm/Phố Cổ (lát cắt hiện chưa dùng cờ này) |
| Số dòng / số đoạn | 16 địa điểm |
| Phiên bản / ngày lấy | v1.0 — 27/11/2026 |
| Nhãn | `synthetic` (toạ độ chưa kiểm từng điểm) |
| Giới hạn | Một toạ độ cho cả quận, sai số 1–3 km. Địa danh ngoài danh sách thì không định vị được (B10) |

## Dataset 4 · Thông số xe + bảng khung giờ (`data/ev_models.json` + hằng số trong `metric_spec.yaml`)

| | |
|---|---|
| Dùng để làm gì | `range_km` cho công thức tầm an toàn · `max_dc_kw` giới hạn tốc độ sạc · bảng cao điểm 17:30–22:30 T2–T7 cho metric `khung_gio_hop_ly` |
| Từ đâu | Thông số công bố của hãng cho 2 mẫu: VinFast VF e34 (ô tô) và VinFast Evo200 2023 (xe máy điện; pin LFP 3,5 kWh; 145 km điều kiện hỗn hợp, 203 km ở 30 km/h; sạc 400W ~10 giờ, 1000W ~4 giờ. Nguồn: trang sản phẩm và bài đánh giá pin trên vinfastauto.com, xem 27/11/2026). Trụ sạc xe máy V-Green: 220V, ≥1,2 kW/cổng, đầy ~4 giờ, 3.858 đ/kWh từ 19/03/2024 (vgreen.net/vi/tram-sac-xe-may-dien). Bảng giờ lấy theo biểu giá điện bậc giờ của Bộ Công Thương *(chưa kiểm: số hiệu quyết định và khung giờ cần đối chiếu văn bản gốc trước CP3)* |
| Xử lý những bước gì | Gom về một JSON, thêm trường `vehicle_type` (o_to / xe_may) và hệ số hao pin rét +15% / nóng +10%. Đã bỏ VF3/VF5/VF6/VF8/BYD Atto 3 khỏi bản 27/11 18:30 |
| Số dòng / số đoạn | 2 mẫu xe · 1 bảng giờ (thấp điểm 00:00–06:00, cao điểm 17:30–22:30 T2–T7, Chủ nhật không cao điểm) |
| Phiên bản / ngày lấy | v1.0 — 27/11/2026 |
| Nhãn | Thông số xe: thật, chưa ghi link nguồn. Hệ số hao pin 15%/10% và hệ số đường ×1,3, biên an toàn ×0,8: **tự ước tính** |
| Giới hạn | Chỉ 2 mẫu xe: mọi dòng xe khác (VF5, VF8, BYD…) AI không tính được tầm. Data trạm chỉ có trụ ô tô, nên Evo200 không có trạm nào để gợi ý (B18). `range_km` là số công bố (thường cao hơn thực tế, nhất là xe máy). Không tính độ chai pin. Giá điện ở trạm V-Green (đồng giá) không theo bảng giờ, nên khung giờ ở đây là để né đông và né cao điểm lưới, không phải để tiết kiệm tiền |

## Dataset 5 · Điểm sạc / đổi pin xe máy điện Hà Nội (`data/hanoi_moto_stations.json`)

| | |
|---|---|
| Dùng để làm gì | Nguồn cho công cụ tìm điểm sạc khi xe có `vehicle_type = xe_may` (Evo200). Đối chiếu metric `an_toan_tram`, `ma_tram_co_that` (mã `MOTO_HN_...`) |
| Từ đâu | Nhóm tổng hợp từ 17 trang công khai (evcs.vn 15 điểm, selex.vn 9, đại lý VinFast, greensm.com, dat.bike, vgreen.net…; mỗi dòng có cột `source`) + toạ độ từ OpenStreetMap Nominatim |
| Xử lý những bước gì | 1 dòng / 1 điểm, geocode địa chỉ bằng Nominatim (`coords_source`). Điểm không geocode được giữ `lat/lon = null` |
| Số dòng / số đoạn | 53 điểm · 16 quận/huyện · 44 sạc + 9 đổi pin (Selex) · 48 có toạ độ, 5 không · **38 điểm Evo200 dùng được** (loại 9 Selex, 3 Dat Bike, 3 thiếu toạ độ) |
| Phiên bản / ngày lấy | 27/11/2026 (`metadata.generated_at`) |
| Nhãn | thật (nguồn công khai từng dòng), **chưa kiểm từng điểm tại chỗ hay trên app V-Green** |
| Giới hạn | **Không có trạng thái trụ** (trống/đông/bảo trì) nên AI phải ghi "chưa xác minh". Toạ độ Nominatim là theo địa chỉ, có thể lệch vài trăm mét; MOTO_HN_013 và MOTO_HN_014 cùng toạ độ vì cùng địa chỉ 458 Minh Khai. `power_kw = 1.2` của 31 điểm V-Green là thông số chung của trụ xe máy V-Green (vgreen.net), không đo từng điểm; 22 điểm khác để trống. Hoàn Kiếm chỉ có 1 điểm. Luật "Selex / Dat Bike chỉ phục vụ xe của hãng đó" là **giả định của nhóm, cần kiểm**. So với >22.000 cổng V-Green báo tại Hà Nội ([VnEconomy 29/08/2025](https://vneconomy.vn/automotive/v-green-dua-vao-van-hanh-tram-sac-xe-dien-lon-nhat-ca-nuoc.htm)), đây là một mẫu rất nhỏ |

Người kiểm: __ · số điểm đã đối chiếu trên app V-Green: __/53

## Dataset 6 · Khảo sát người đi xe điện (`evidence/survey/survey.txt`)

| | |
|---|---|
| Dùng để làm gì | Nguồn tình huống cho 11 câu thử `nguoi_dung` (B19–B29, cột `source` ghi số dòng). Bằng chứng pain chi tiết để ở `evidence/summary.md` |
| Từ đâu | Google Form của nhóm, xuất TSV. Không thu tên, email, số điện thoại. **File gốc không commit** (`.gitignore`); bảng kết quả: [Google Sheets](https://docs.google.com/spreadsheets/d/1snnt7ZLwUSfAMaQSgS3vNXEuUuPBQWm-cn7rXv51xls/edit?gid=914628555#gid=914628555); số tổng hợp ở `spec.md` §1 và `evidence/summary.md` |
| Xử lý những bước gì | Không sửa câu trả lời. Câu thử dựng lại tình huống từ lựa chọn của người trả lời; chỉ B29 trích nguyên văn (dòng 6) |
| Số dòng / số đoạn | 39 câu trả lời (27/11/2026 18:36–19:17) · 3 người chọn "chưa từng đi xe điện" → còn 36 đúng đối tượng |
| Phiên bản / ngày lấy | 27/11/2026 |
| Nhãn | thật |
| Giới hạn | Mẫu nhỏ, thu trong 41 phút, có thể lệch về người quen của nhóm. 31/39 người dùng xe máy điện, chỉ 8/39 chỉ đi ô tô: **lệch xa so với người dùng chính "tài xế ô tô điện đi du lịch" ghi ở canvas**. 17/39 người "chưa bao giờ tự tìm trạm công cộng (chỉ sạc ở nhà)" (trong đó 11 người vẫn chọn sự cố gặp phải), nên câu hỏi sự cố cần đọc thận trọng |
---

**Data `synthetic` không phải bằng chứng pain.** Dataset 2–3 chỉ để kiểm logic xếp hạng và chốt chặn. Bằng chứng pain (review app, phỏng vấn tài xế) để riêng ở `evidence/`.
