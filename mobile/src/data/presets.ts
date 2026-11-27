import type { DemoStep, WhatIfScenarioMeta } from '@/types';

export const JOURNEY_PRESETS = [
  {
    id: 'preset-hackathon',
    label: 'Lịch chuẩn Hackathon (18% · Hồ Gươm -> Nội Bài)',
    prompt: 'Tôi còn 18% pin, 14h30 phải có mặt tại Hồ Gươm và sau đó đi sân bay Nội Bài.',
    batteryPct: 18,
    arrivalDeadline: '14:30',
    hasNextLeg: true,
    preference: 'balanced' as const,
  },
  {
    id: 'preset-critical',
    label: 'Pin nguy cấp 11% · Cần cứu pin gấp',
    prompt: 'Xe chỉ còn 11% pin ở Láng Hạ, 14h45 có hẹn ở Hồ Gươm và tối ra Nội Bài.',
    batteryPct: 11,
    arrivalDeadline: '14:45',
    hasNextLeg: true,
    preference: 'lowest_wait' as const,
  },
  {
    id: 'preset-city',
    label: 'Di chuyển nội đô 26% · Chỉ đến Hồ Gươm',
    prompt: 'Tôi còn 26% pin, cần đến Hồ Gươm trước 15h00, ưu tiên trạm trống không phải chờ.',
    batteryPct: 26,
    arrivalDeadline: '15:00',
    hasNextLeg: false,
    preference: 'lowest_wait' as const,
  },
];

export const AI_ANALYSIS_STEPS = [
  { id: 'parse', label: 'Phân tích lịch trình', detail: 'Trích xuất mốc 14:30 Hồ Gươm và chặng nối tiếp Nội Bài' },
  { id: 'battery', label: 'Kiểm tra lượng pin', detail: 'Đánh giá SoC hiện tại, quãng đường thực tế và mức hao hụt thời tiết' },
  { id: 'stations', label: 'Kiểm tra trạm sạc', detail: 'Đối chiếu 9 trạm V-Green Hà Nội, loại bỏ trụ đang bảo trì' },
  { id: 'timing', label: 'Đánh giá thời gian', detail: 'Cộng thời gian di chuyển OSRM + thời gian chờ hàng + thời gian sạc DC' },
  { id: 'safety', label: 'Kiểm tra an toàn', detail: 'Đảm bảo pin dự phòng tối thiểu >= 15% khi đến sân bay Nội Bài' },
  { id: 'done', label: 'Hoàn tất đề xuất', detail: 'Xếp hạng phương án tối ưu và 2 phương án dự phòng an toàn' },
];

export const WHAT_IF_SCENARIOS: WhatIfScenarioMeta[] = [
  {
    id: 'station_maintenance',
    title: 'Trạm sạc bất ngờ bảo trì',
    subtitle: 'Trạm đề xuất hiện tại đột ngột ngắt nguồn bảo trì khẩn cấp',
    severity: 'critical',
    impactTag: 'Đổi trạm ngay',
  },
  {
    id: 'queue_surge',
    title: 'Hàng chờ tăng đột biến',
    subtitle: '4 xe Xanh SM vào sạc đồng loạt tại trạm đang chọn (+22 phút chờ)',
    severity: 'warning',
    impactTag: '+22 phút chờ',
  },
  {
    id: 'cold_weather',
    title: 'Nhiệt độ giảm xuống 12°C',
    subtitle: 'Gió mùa đông bắc kèm mưa rét làm tiêu hao pin tăng lên +24%',
    severity: 'warning',
    impactTag: '+24% hao pin',
  },
  {
    id: 'critical_battery',
    title: 'Pin xuống mức nguy cấp (7%)',
    subtitle: 'Pin giảm đột ngột về 7% — kiểm tra khả năng vươn tới trạm an toàn',
    severity: 'critical',
    impactTag: 'Báo động đỏ',
  },
  {
    id: 'heavy_traffic',
    title: 'Giao thông nội đô ùn tắc',
    subtitle: 'Giờ cao điểm các trục Láng Hạ — Kim Mã — Giảng Võ di chuyển chậm +45%',
    severity: 'warning',
    impactTag: '+45% thời gian chạy',
  },
  {
    id: 'schedule_shifted',
    title: 'Lịch hẹn đẩy sớm (-20 phút)',
    subtitle: 'Đối tác tại Hồ Gươm dời lịch họp từ 14:30 lên 14:10',
    severity: 'critical',
    impactTag: 'Deadline 14:10',
  },
];

export const DEMO_SEQUENCE: DemoStep[] = [
  {
    stepNumber: 1,
    title: 'Nhận diện xe VinFast thực tế',
    narrative: 'Khởi động trên VinFast VF e34 tại Láng Hạ, Hà Nội với 18% pin trong thời tiết 16°C.',
    targetRoute: '/(tabs)',
    actionTag: 'SCREEN_HOME',
  },
  {
    stepNumber: 2,
    title: 'Mở bản đồ Hà Nội thật (OpenFreeMap)',
    narrative: 'Hiển thị bản đồ vector đường phố Hà Nội thực tế chuẩn bị định vị xe.',
    targetRoute: '/(tabs)/map',
    actionTag: 'OPEN_MAP',
  },
  {
    stepNumber: 3,
    title: 'Camera bay tới vị trí xe',
    narrative: 'Camera bản đồ khóa mục tiêu vào vị trí VinFast VF e34 đang đỗ tại Đống Đa.',
    targetRoute: '/(tabs)/map',
    actionTag: 'FOCUS_VEHICLE',
  },
  {
    stepNumber: 4,
    title: 'Hiển thị hệ thống trạm sạc V-Green',
    narrative: 'Trực quan hóa 9 trạm sạc tại Hà Nội theo trạng thái: Trống (xanh), Đông (vàng), Bảo trì (đỏ).',
    targetRoute: '/(tabs)/map',
    actionTag: 'SHOW_STATIONS',
  },
  {
    stepNumber: 5,
    title: 'Mô phỏng AI phân tích hành trình',
    narrative: 'Nạp yêu cầu: 18% pin, 14h30 có mặt ở Hồ Gươm rồi đi Nội Bài — chạy 6 bước kiểm tra an toàn.',
    targetRoute: '/(tabs)/journey',
    actionTag: 'RUN_AI_ANALYSIS',
  },
  {
    stepNumber: 6,
    title: 'Vẽ các tuyến đường ứng viên từ OSRM',
    narrative: 'Tính toán các tuyến đường thực tế qua Nguyễn Chí Thanh, Metropolis và Bà Triệu.',
    targetRoute: '/recommendation',
    actionTag: 'SHOW_RECOMMENDATION',
  },
  {
    stepNumber: 7,
    title: 'Loại bỏ trạm bảo trì & giải thích',
    narrative: 'Loại Vincom Phạm Ngọc Thạch (đang bảo trì) và trạm Nguyễn Chí Thanh (kẹt 3 xe, lỡ giờ).',
    targetRoute: '/recommendation',
    actionTag: 'HIGHLIGHT_REJECTED',
  },
  {
    stepNumber: 8,
    title: 'Chốt tuyến đề xuất Metropolis Liễu Giai',
    narrative: 'Metropolis trống 5/6 trụ 120kW, đến Hồ Gươm sớm hơn lịch hẹn 9 phút và đủ pin ra Nội Bài.',
    targetRoute: '/recommendation',
    actionTag: 'HIGHLIGHT_BEST',
  },
  {
    stepNumber: 9,
    title: 'Bắt đầu mô phỏng dẫn đường thực tế',
    narrative: 'Xe VinFast di chuyển mượt theo geometry đường phố thật từ Láng Hạ hướng về Liễu Giai.',
    targetRoute: '/navigation',
    actionTag: 'START_DRIVE_SIM',
  },
  {
    stepNumber: 10,
    title: 'Kích hoạt sự cố: Metropolis bảo trì!',
    narrative: 'Giữa đường nhận tín hiệu tủ nguồn DC tại Metropolis bất ngờ gặp sự cố bảo trì.',
    targetRoute: '/simulation',
    actionTag: 'TRIGGER_FAILURE',
  },
  {
    stepNumber: 11,
    title: 'AI phát cảnh báo chuyển hướng tức thì',
    narrative: 'Cảnh báo tuyến cũ không còn an toàn và khóa tuyến hỏng bằng nét đứt đỏ.',
    targetRoute: '/simulation',
    actionTag: 'SHOW_WARNING',
  },
  {
    stepNumber: 12,
    title: 'Vẽ phương án thay thế: Vincom Bà Triệu',
    narrative: 'Chuyển hướng sang Vincom Bà Triệu (4/6 trụ trống, ngay sát Hồ Gươm) theo đường OSRM mới.',
    targetRoute: '/simulation',
    actionTag: 'SHOW_ALTERNATIVE',
  },
  {
    stepNumber: 13,
    title: 'Cập nhật toàn bộ lộ trình thời gian',
    narrative: 'Timeline cập nhật tự động mốc sạc, giờ đến Hồ Gươm và % pin dự phòng ra sân bay Nội Bài.',
    targetRoute: '/(tabs)/journey',
    actionTag: 'SHOW_UPDATED_TIMELINE',
  },
];
