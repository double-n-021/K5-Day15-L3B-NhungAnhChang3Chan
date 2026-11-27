import { HANOI_PLACES, HANOI_STATIONS } from '@/data/stations';
import { VEHICLES } from '@/data/vehicles';
import { getCachedRoute } from '@/services/routeService';
import type {
  ChargingStation,
  JourneyInput,
  JourneyStage,
  MissingInfoField,
  OffPeakReward,
  ParsedNaturalRequest,
  ProposedItineraryOption,
  RecommendationResult,
  RejectedStation,
  StationEvaluation,
  VehicleId,
  WeatherCondition,
  WhatIfScenarioId,
} from '@/types';

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 14 * 60 + 30;
  return h * 60 + m;
}

export function minutesToTime(totalMin: number): string {
  const normalized = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')}\u00A0đ`;
}

export function parseVietnameseJourneyPrompt(
  prompt: string,
  current: JourneyInput
): Partial<JourneyInput> {
  const text = prompt.toLowerCase();
  const patch: Partial<JourneyInput> = { rawPrompt: prompt };

  // Extract battery percentage e.g. "18%", "11 %", "còn 22%"
  const pctMatch = text.match(/(\d{1,2})\s*%/);
  if (pctMatch) {
    const val = Math.max(5, Math.min(95, parseInt(pctMatch[1], 10)));
    patch.batteryPct = val;
  }

  // Extract time e.g. "14h30", "14:30", "15h00", "15h"
  const timeMatch = text.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/);
  if (timeMatch) {
    const h = Math.min(23, parseInt(timeMatch[1], 10));
    const m = timeMatch[2] ? Math.min(59, parseInt(timeMatch[2], 10)) : 0;
    patch.arrivalDeadline = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Extract destination cues
  if (text.includes('hồ gươm') || text.includes('hoàn kiếm')) {
    patch.primaryDestination = HANOI_PLACES.hoGuom;
  }
  if (text.includes('nội bài') || text.includes('sân bay')) {
    patch.nextDestination = HANOI_PLACES.noiBai;
  } else if (text.includes('chỉ đến hồ gươm') || text.includes('không đi nội bài')) {
    patch.nextDestination = null;
  } else {
    patch.nextDestination = current.nextDestination;
  }

  if (text.includes('vf e34') || text.includes('vfe34') || text.includes('e34') || text.includes('ô tô')) {
    patch.vehicleId = 'vfe34';
  } else if (text.includes('evo') || text.includes('xe máy')) {
    patch.vehicleId = 'vinfast_evo200';
  }

  if (text.includes('không phải chờ') || text.includes('ít chờ') || text.includes('trống')) {
    patch.preference = 'lowest_wait';
  } else if (text.includes('tiết kiệm') || text.includes('rẻ')) {
    patch.preference = 'lowest_cost';
  }

  return patch;
}

export function applyScenariosToState(
  baseStations: ChargingStation[],
  baseWeather: WeatherCondition,
  baseInput: JourneyInput,
  scenarios: WhatIfScenarioId[],
  activeStationId: string
): {
  stations: ChargingStation[];
  weather: WeatherCondition;
  input: JourneyInput;
  trafficMultiplier: number;
} {
  let stations: ChargingStation[] = baseStations.map((s) => ({
    ...s,
    bays: s.bays.map((b) => ({ ...b })),
  }));
  let weather = { ...baseWeather };
  let input = { ...baseInput };
  let trafficMultiplier = 1.0;

  if (scenarios.includes('station_maintenance')) {
    stations = stations.map((s) =>
      s.id === activeStationId || s.id === 'metropolis'
        ? {
            ...s,
            status: 'maintenance',
            availableBays: 0,
            queueCount: 0,
            estimatedWaitMin: 0,
            statusNote: 'Sự cố bất ngờ: Ngắt cầu dao tủ DC bảo trì khẩn cấp',
            bays: s.bays.map((b) => ({ ...b, status: 'maintenance' as const })),
          }
        : s
    );
  }

  if (scenarios.includes('queue_surge')) {
    stations = stations.map((s) => {
      const isTarget = s.id === activeStationId || s.id === 'metropolis';
      if (!isTarget || s.status === 'maintenance') return s;
      return {
        ...s,
        status: 'busy',
        availableBays: 0,
        queueCount: s.queueCount + 4,
        estimatedWaitMin: s.estimatedWaitMin + 22,
        statusNote: 'Đột biến 4 xe dịch vụ vừa vào xếp hàng chờ sạc',
        bays: s.bays.map((b) =>
          b.status === 'available' ? { ...b, status: 'occupied' as const, estimatedFreeInMin: 22 } : b
        ),
      };
    });
  }

  if (scenarios.includes('cold_weather')) {
    weather = {
      ...weather,
      id: 'cold_rain',
      temperatureC: 12,
      conditionLabel: 'Mưa rét · Gió mùa 12°C',
      iconKey: 'rain',
      consumptionImpactPct: 24,
      impactExplanation: 'Nhiệt độ giảm sâu 12°C kèm mưa rét làm tiêu hao pin tăng +24%.',
    };
  }

  if (scenarios.includes('critical_battery')) {
    input = {
      ...input,
      batteryPct: 7,
    };
  }

  if (scenarios.includes('heavy_traffic')) {
    trafficMultiplier = 1.45;
  }

  if (scenarios.includes('schedule_shifted')) {
    const currentDeadline = timeToMinutes(input.arrivalDeadline);
    input = {
      ...input,
      arrivalDeadline: minutesToTime(currentDeadline - 20),
    };
  }

  return { stations, weather, input, trafficMultiplier };
}

export function evaluateChargingDecision(params: {
  input: JourneyInput;
  weather: WeatherCondition;
  stations?: ChargingStation[];
  trafficMultiplier?: number;
}): RecommendationResult {
  const {
    input,
    weather,
    stations = HANOI_STATIONS,
    trafficMultiplier = 1.0,
  } = params;

  const vehicle = VEHICLES[input.vehicleId];
  const trafficPenaltyPct = trafficMultiplier > 1 ? 10 : 0;
  const consumptionFactor = 1 + (weather.consumptionImpactPct + trafficPenaltyPct) / 100;
  const effectiveConsumption = Number(
    (vehicle.baseConsumptionKwhPer100Km * consumptionFactor).toFixed(1)
  );
  const currentEnergyKwh = (input.batteryPct / 100) * vehicle.usableBatteryKwh;
  const estimatedRangeKm = Math.round((currentEnergyKwh / effectiveConsumption) * 100);

  const startMin = timeToMinutes(input.departureTime);
  const deadlineMin = timeToMinutes(input.arrivalDeadline);

  const leg2Route = getCachedRoute(
    input.primaryDestination.id,
    input.nextDestination?.id ?? 'noi-bai-airport'
  );
  const nextLegDistKm = input.nextDestination
    ? (leg2Route?.distanceMeters ?? 29110) / 1000
    : 0;
  const nextLegDriveMin = input.nextDestination
    ? Math.round(((leg2Route?.durationSeconds ?? 2100) / 60) * trafficMultiplier)
    : 0;

  const validEvaluations: StationEvaluation[] = [];
  const rejected: RejectedStation[] = [];

  for (const station of stations) {
    // Skip Noi Bai station as an initial detour if user needs to charge BEFORE Ho Guom
    if (station.id === 'noi-bai') continue;

    if (station.status === 'maintenance') {
      rejected.push({
        station,
        reasonTitle: 'Đang bảo trì',
        reasonDetail: station.statusNote || 'Trạm đang ngắt điện bảo trì, bị loại theo quy tắc an toàn.',
        category: 'maintenance',
      });
      continue;
    }

    if (station.status === 'unknown' && input.batteryPct < 30) {
      rejected.push({
        station,
        reasonTitle: 'Không xác minh được trụ trống',
        reasonDetail: 'Mất tín hiệu telemetry; rủi ro cao khi pin đang ở mức thấp (' + input.batteryPct + '%).',
        category: 'unknown_risk',
      });
      continue;
    }

    const routeToStation = getCachedRoute(input.origin.id, station.id);
    const routeToPrimary = getCachedRoute(station.id, input.primaryDestination.id);

    const distToStationKm = (routeToStation?.distanceMeters ?? 3500) / 1000;
    const distToPrimaryKm = (routeToPrimary?.distanceMeters ?? 5200) / 1000;

    // Realistic urban Hanoi driving speed scaling
    const baseDriveToStationMin = routeToStation
      ? Math.max(4, Math.round((routeToStation.durationSeconds / 60) * 1.45 * trafficMultiplier))
      : Math.round(distToStationKm * 3.5 * trafficMultiplier);
    const baseDriveToPrimaryMin = routeToPrimary
      ? Math.max(5, Math.round((routeToPrimary.durationSeconds / 60) * 1.55 * trafficMultiplier))
      : Math.round(distToPrimaryKm * 3.5 * trafficMultiplier);

    const energyToStationKwh = (distToStationKm / 100) * effectiveConsumption;
    const arrivalBatteryPct = Math.round(
      ((currentEnergyKwh - energyToStationKwh) / vehicle.usableBatteryKwh) * 100
    );

    if (arrivalBatteryPct < 4) {
      rejected.push({
        station,
        reasonTitle: 'Không đủ pin tới trạm an toàn',
        reasonDetail: `Quãng đường ${distToStationKm.toFixed(1)} km khiến pin khi tới trạm chỉ còn ${Math.max(0, arrivalBatteryPct)}% (dưới ngưỡng an toàn 4%).`,
        category: 'unreachable',
      });
      continue;
    }

    const isSwapSession = Boolean(vehicle.supportsBatterySwap && station.supportsBatterySwap);

    // Energy required from station -> Ho Guom -> Noi Bai + 20% safety buffer
    const energyPostChargeKm = distToPrimaryKm + nextLegDistKm;
    const requiredPostChargeKwh =
      (energyPostChargeKm / 100) * effectiveConsumption + vehicle.usableBatteryKwh * 0.22;
    const targetDeparturePct = isSwapSession
      ? 100
      : Math.min(
          88,
          Math.max(
            arrivalBatteryPct + 25,
            Math.ceil((requiredPostChargeKwh / vehicle.usableBatteryKwh) * 100)
          )
        );

    const kwhToAdd = Math.max(
      1.2,
      ((targetDeparturePct - arrivalBatteryPct) / 100) * vehicle.usableBatteryKwh
    );
    const effectivePowerKw =
      vehicle.category === 'motorbike'
        ? Math.max(0.8, vehicle.maxDcPowerKw * 0.9)
        : Math.min(vehicle.maxDcPowerKw, station.maxPowerKw) * 0.85;
    const chargeMin = isSwapSession
      ? 2
      : vehicle.category === 'motorbike'
        ? Math.max(12, Math.min(38, Math.round((kwhToAdd / effectivePowerKw) * 60)))
        : Math.max(10, Math.round((kwhToAdd / effectivePowerKw) * 60));

    const totalArrivePrimaryMin =
      startMin + baseDriveToStationMin + station.estimatedWaitMin + chargeMin + baseDriveToPrimaryMin;
    const scheduleSlackMin = deadlineMin - totalArrivePrimaryMin;

    const primaryArrivalBatteryPct = Math.max(
      10,
      Math.round(
        targetDeparturePct - (((distToPrimaryKm / 100) * effectiveConsumption) / vehicle.usableBatteryKwh) * 100
      )
    );
    const nextArrivalBatteryPct = input.nextDestination
      ? Math.max(
          5,
          Math.round(
            primaryArrivalBatteryPct -
              (((nextLegDistKm / 100) * effectiveConsumption) / vehicle.usableBatteryKwh) * 100
          )
        )
      : primaryArrivalBatteryPct;

    const estimatedCostVnd = isSwapSession ? 14000 : kwhToAdd * station.pricePerKwhVnd;

    // Score formula: prioritizes low wait, meeting deadline, power, and safe arrival buffer
    let score = 100;
    score -= station.estimatedWaitMin * 2.2;
    score -= baseDriveToStationMin * 1.1;
    score -= baseDriveToPrimaryMin * 0.9;
    score -= chargeMin * 0.6;
    if (isSwapSession) score += 10;
    if (scheduleSlackMin < 0) {
      score -= Math.abs(scheduleSlackMin) * 4.0;
    } else {
      score += Math.min(12, scheduleSlackMin * 0.8);
    }
    if (station.status === 'busy') score -= 18;
    if (input.preference === 'lowest_wait') score -= station.estimatedWaitMin * 1.8;
    if (input.preference === 'fastest_time') score -= (baseDriveToStationMin + chargeMin) * 0.8;
    if (input.preference === 'lowest_cost') score -= estimatedCostVnd / 15000;

    // Give a small natural tie-breaker favoring central reliable DC hubs on corridor
    if (station.id === 'metropolis') score += 4;
    if (station.id === 'ba-trieu') score += 2;

    const highlightReason = isSwapSession
      ? `Có tủ đổi pin xe máy điện sẵn sàng — đổi đầy 100% pin chỉ mất 2 phút.`
      : station.estimatedWaitMin === 0
        ? `Trống ${station.availableBays}/${station.totalBays} trụ ${vehicle.category === 'motorbike' ? `${vehicle.maxDcPowerKw}kW / 220V` : `${station.maxPowerKw}kW`}, vào nạp ngay không phải chờ.`
        : `Cần chờ khoảng ${station.estimatedWaitMin} phút (${station.queueCount} xe đang đợi).`;

    validEvaluations.push({
      station,
      routeToStation,
      routeToPrimary,
      distanceToStationKm: Number(distToStationKm.toFixed(1)),
      distanceToPrimaryKm: Number(distToPrimaryKm.toFixed(1)),
      driveToStationMin: baseDriveToStationMin,
      waitMin: station.estimatedWaitMin,
      chargeMin,
      driveToPrimaryMin: baseDriveToPrimaryMin,
      arrivalBatteryPct,
      targetDepartureBatteryPct: targetDeparturePct,
      primaryArrivalBatteryPct,
      nextArrivalBatteryPct,
      estimatedCostVnd: Math.round(estimatedCostVnd),
      estimatedArrivalTime: minutesToTime(totalArrivePrimaryMin),
      scheduleSlackMin,
      score: Math.round(score),
      safetyChecks: {
        reachableWithBuffer: arrivalBatteryPct >= 6,
        stationOperational: true,
        enoughForNextLeg: nextArrivalBatteryPct >= 15,
        meetsDeadline: scheduleSlackMin >= 0,
      },
      highlightReason,
    });
  }

  validEvaluations.sort((a, b) => b.score - a.score);

  const recommended = validEvaluations[0] ?? null;
  const alternatives = validEvaluations.slice(1, 3);

  // Build explanation comparing recommended vs nearest station
  const sortedByDist = [...validEvaluations].sort(
    (a, b) => a.distanceToStationKm - b.distanceToStationKm
  );
  const nearest = sortedByDist[0];
  let whyBetterThanNearest =
    'Phương án này đạt cân bằng tốt nhất giữa quãng đường, thời gian chờ và độ an toàn pin cho cả hai chặng.';

  if (recommended && nearest && recommended.station.id !== nearest.station.id) {
    const diffDist = (recommended.distanceToStationKm - nearest.distanceToStationKm).toFixed(1);
    const savedMin =
      nearest.waitMin +
      nearest.driveToStationMin +
      nearest.driveToPrimaryMin -
      (recommended.waitMin + recommended.driveToStationMin + recommended.driveToPrimaryMin);
    whyBetterThanNearest = `${recommended.station.shortName} xa hơn ${nearest.station.shortName} ${diffDist} km, nhưng trống ${recommended.station.availableBays}/${recommended.station.totalBays} trụ và không phải chờ ${nearest.waitMin} phút (${nearest.station.queueCount} xe xếp hàng). Nhờ đó bạn tiết kiệm ~${Math.max(8, savedMin)} phút và đến ${input.primaryDestination.shortName} ${recommended.scheduleSlackMin >= 0 ? `sớm ${recommended.scheduleSlackMin} phút` : `chỉ trễ ${Math.abs(recommended.scheduleSlackMin)} phút`}.`;
  } else if (recommended && nearest) {
    whyBetterThanNearest = `${recommended.station.shortName} vừa nằm gần vị trí hiện tại (${recommended.distanceToStationKm} km), vừa có ${recommended.station.availableBays}/${recommended.station.totalBays} trụ sẵn sàng nên tối ưu nhất về cả thời gian lẫn lượng pin dự phòng.`;
  }

  // Build vertical timeline
  const timeline: JourneyStage[] = [];
  if (recommended) {
    const arriveStationMin = startMin + recommended.driveToStationMin;
    const startChargeMin = arriveStationMin + recommended.waitMin;
    const finishChargeMin = startChargeMin + recommended.chargeMin;
    const arrivePrimaryMin = finishChargeMin + recommended.driveToPrimaryMin;
    const nextDepartMin = Math.max(arrivePrimaryMin + 60, timeToMinutes(input.nextDepartureTime));
    const arriveNextMin = nextDepartMin + nextLegDriveMin;

    timeline.push({
      id: 'stage-depart',
      time: minutesToTime(startMin),
      title: `Xuất phát từ ${input.origin.shortName}`,
      subtitle: `${vehicle.name} · ${weather.temperatureC}°C · Tiêu hao ước tính ${effectiveConsumption} kWh/100km`,
      type: 'departure',
      batteryPct: input.batteryPct,
      status: input.batteryPct <= 12 ? 'warning' : 'safe',
    });

    timeline.push({
      id: 'stage-drive-station',
      time: minutesToTime(arriveStationMin),
      title: `Đến ${recommended.station.shortName}`,
      subtitle: `Di chuyển ${recommended.distanceToStationKm} km (${recommended.driveToStationMin} phút) · ${recommended.station.bayLocationNote}`,
      type: 'driving',
      batteryPct: recommended.arrivalBatteryPct,
      durationMin: recommended.driveToStationMin,
      status: recommended.arrivalBatteryPct < 8 ? 'warning' : 'safe',
    });

    if (recommended.waitMin > 0) {
      timeline.push({
        id: 'stage-wait',
        time: minutesToTime(startChargeMin),
        title: `Chờ trụ sạc trống (${recommended.waitMin} phút)`,
        subtitle: `Ước tính ${recommended.station.queueCount} xe đang hoàn tất phiên sạc`,
        type: 'waiting',
        batteryPct: recommended.arrivalBatteryPct,
        durationMin: recommended.waitMin,
        status: 'warning',
      });
    }

    timeline.push({
      id: 'stage-charge',
      time: minutesToTime(finishChargeMin),
      title: `Hoàn tất sạc nhanh DC (${recommended.chargeMin} phút)`,
      subtitle: `Nạp ${recommended.arrivalBatteryPct}% -> ${recommended.targetDepartureBatteryPct}% · Chi phí mô phỏng ${formatVnd(recommended.estimatedCostVnd)}`,
      type: 'charging',
      batteryPct: recommended.targetDepartureBatteryPct,
      durationMin: recommended.chargeMin,
      status: 'safe',
    });

    timeline.push({
      id: 'stage-primary',
      time: minutesToTime(arrivePrimaryMin),
      title: `Đến ${input.primaryDestination.shortName}`,
      subtitle:
        recommended.scheduleSlackMin >= 0
          ? `Sớm hơn lịch hẹn ${input.arrivalDeadline} là ${recommended.scheduleSlackMin} phút`
          : `Cảnh báo: Trễ ${Math.abs(recommended.scheduleSlackMin)} phút so với mốc ${input.arrivalDeadline}`,
      type: 'appointment',
      batteryPct: recommended.primaryArrivalBatteryPct,
      durationMin: recommended.driveToPrimaryMin,
      status: recommended.scheduleSlackMin >= 0 ? 'safe' : 'warning',
    });

    if (input.nextDestination) {
      timeline.push({
        id: 'stage-next-depart',
        time: minutesToTime(nextDepartMin),
        title: `Khởi hành đi ${input.nextDestination.shortName}`,
        subtitle: `Chặng ${nextLegDistKm.toFixed(1)} km qua cầu Nhật Tân — Võ Nguyên Giáp`,
        type: 'driving',
        batteryPct: recommended.primaryArrivalBatteryPct,
        status: 'safe',
      });

      timeline.push({
        id: 'stage-next-arrive',
        time: minutesToTime(arriveNextMin),
        title: `Đến ${input.nextDestination.shortName}`,
        subtitle: `Còn dư ${recommended.nextArrivalBatteryPct}% pin dự phòng an toàn`,
        type: 'destination',
        batteryPct: recommended.nextArrivalBatteryPct,
        durationMin: nextLegDriveMin,
        status: recommended.nextArrivalBatteryPct >= 15 ? 'safe' : 'warning',
      });
    }

    return {
      hasSafeRoute: true,
      recommended,
      alternatives,
      rejected,
      whyBetterThanNearest,
      timeline,
      summary: {
        totalTripDistanceKm: Number(
          (recommended.distanceToStationKm + recommended.distanceToPrimaryKm + nextLegDistKm).toFixed(1)
        ),
        effectiveConsumptionKwhPer100Km: effectiveConsumption,
        estimatedRangeKm,
        targetArrivePrimaryTime: minutesToTime(arrivePrimaryMin),
        targetArriveNextTime: input.nextDestination ? minutesToTime(arriveNextMin) : '--:--',
      },
    };
  }

  return {
    hasSafeRoute: false,
    recommended: null,
    alternatives: [],
    rejected,
    whyBetterThanNearest:
      'Không có trạm sạc nào đáp ứng đồng thời ngưỡng pin an toàn và trạng thái hoạt động.',
    criticalAlertTitle: 'Cảnh báo an toàn: Không tìm thấy tuyến tới trạm khả dụng',
    criticalAlertMessage: `Với ${input.batteryPct}% pin (${estimatedRangeKm} km ước tính) trong điều kiện hiện tại, xe không đủ pin dự phòng an toàn để vươn tới trạm sạc đang hoạt động. Khuyến nghị dừng xe an toàn và gọi cứu hộ pin lưu động Xanh SM / VinFast.`,
    timeline: [
      {
        id: 'stage-critical',
        time: minutesToTime(startMin),
        title: 'Pin dưới ngưỡng an toàn di chuyển',
        subtitle: `Còn ${input.batteryPct}% (~${estimatedRangeKm} km) · Không đủ vươn tới trạm trống gần nhất`,
        type: 'departure',
        batteryPct: input.batteryPct,
        status: 'critical',
      },
    ],
    summary: {
      totalTripDistanceKm: Number(nextLegDistKm.toFixed(1)),
      effectiveConsumptionKwhPer100Km: effectiveConsumption,
      estimatedRangeKm,
      targetArrivePrimaryTime: '--:--',
      targetArriveNextTime: '--:--',
    },
  };
}

interface IntercityProfile {
  name: string;
  keywords: string[];
  distanceKm: number;
  driveTotalMin: number;
  corridorStations: {
    strategyLabel: string;
    stationName: string;
    stationAddress: string;
    kmToStation: number;
    waitMin: number;
    powerKw: number;
    why: string;
  }[];
}

const INTERCITY_PROFILES: IntercityProfile[] = [
  {
    name: 'Vũng Tàu',
    keywords: ['vũng tàu', 'vung tau', 'bà rịa'],
    distanceKm: 106,
    driveTotalMin: 115,
    corridorStations: [
      {
        strategyLabel: 'Tối ưu thời gian · Sạc giữa cao tốc',
        stationName: 'Trạm sạc V-Green Trạm dừng nghỉ Km41 (Cao tốc LT-DG)',
        stationAddress: 'Km41 Cao tốc TP.HCM — Long Thành — Dầu Giây, Đồng Nai (mô phỏng)',
        kmToStation: 41,
        waitMin: 0,
        powerKw: 150,
        why: 'Nằm ngay trên trục cao tốc đi Vũng Tàu, trụ 150kW trống giúp nạp đủ tới biển mà không phải rẽ vào nội đô.',
      },
      {
        strategyLabel: 'An toàn pin cao · Sạc sớm trước khi lên cao tốc',
        stationName: 'Trạm sạc Vincom Plaza Biên Hòa / Ngã tư Vũng Tàu',
        stationAddress: '1096 Phạm Văn Thuận, Tân Mai, Biên Hòa, Đồng Nai (mô phỏng)',
        kmToStation: 24,
        waitMin: 5,
        powerKw: 120,
        why: 'Phù hợp nếu bạn muốn nạp đầy pin sớm trước khi chạy xa, tránh rủi ro kẹt trạm cao tốc.',
      },
      {
        strategyLabel: 'Dự phòng 2 chặng · Thoải mái nghỉ ngơi',
        stationName: 'Trạm sạc V-Green Long Thành + Bà Rịa City',
        stationAddress: 'QL51, Long Thành -> Trung tâm Hành chính Bà Rịa (mô phỏng)',
        kmToStation: 36,
        waitMin: 0,
        powerKw: 60,
        why: 'Chia 2 chặng ngắn kết hợp nghỉ uống nước, giữ mức pin luôn trên 25% suốt tuyến.',
      },
    ],
  },
  {
    name: 'Hải Phòng',
    keywords: ['hải phòng', 'hai phong', 'đồ sơn', 'do son', 'cát bà'],
    distanceKm: 118,
    driveTotalMin: 105,
    corridorStations: [
      {
        strategyLabel: 'Tối ưu thời gian · Trạm dừng nghỉ V52',
        stationName: 'Trạm sạc V-Green Trạm dừng nghỉ V52 Hải Dương',
        stationAddress: 'Km52 Cao tốc Hà Nội — Hải Phòng (5B), Gia Lộc, Hải Dương (mô phỏng)',
        kmToStation: 55,
        waitMin: 0,
        powerKw: 150,
        why: 'Trạm công suất lớn ngay giữa cao tốc 5B, nạp 1 lần đủ vào trung tâm Hải Phòng với dư >25% pin.',
      },
      {
        strategyLabel: 'An toàn sớm · Vinhomes Ocean Park',
        stationName: 'Trạm sạc V-Green Vinhomes Ocean Park Gia Lâm',
        stationAddress: 'Đa Tốn, Gia Lâm, Hà Nội',
        kmToStation: 16,
        waitMin: 0,
        powerKw: 120,
        why: 'Sạc ngay cửa ngõ phía Đông Hà Nội trước khi nhập cao tốc 5B nếu pin hiện tại thấp.',
      },
      {
        strategyLabel: 'Tiết kiệm chi phí · Vincom Imperia',
        stationName: 'Trạm sạc V-Green Trạm V23 Hưng Yên -> Hải Phòng',
        stationAddress: 'Km23 Cao tốc 5B, Yên Mỹ, Hưng Yên (mô phỏng)',
        kmToStation: 28,
        waitMin: 4,
        powerKw: 120,
        why: 'Tối ưu lượng kWh sạc theo đúng quãng đường cần thiết khi tới Hải Phòng.',
      },
    ],
  },
  {
    name: 'Hạ Long',
    keywords: ['hạ long', 'ha long', 'quảng ninh', 'quang ninh', 'bãi cháy'],
    distanceKm: 154,
    driveTotalMin: 135,
    corridorStations: [
      {
        strategyLabel: 'Tối ưu thời gian · Cao tốc 5B - Hạ Long',
        stationName: 'Trạm sạc V-Green Trạm dừng nghỉ V52 Hải Dương',
        stationAddress: 'Km52 Cao tốc Hà Nội — Hải Phòng, Hải Dương (mô phỏng)',
        kmToStation: 55,
        waitMin: 0,
        powerKw: 150,
        why: 'Đủ tầm pin từ Hà Nội tới trạm V52 và sạc lên 85% để chạy thẳng cầu Bạch Đằng tới Hạ Long.',
      },
      {
        strategyLabel: 'An toàn 2 điểm · Ocean Park + Bãi Cháy',
        stationName: 'Vinhomes Ocean Park Gia Lâm -> Vincom Plaza Hạ Long',
        stationAddress: 'Gia Lâm, Hà Nội -> Khu Cột Đồng Hồ, Hạ Long (mô phỏng)',
        kmToStation: 16,
        waitMin: 0,
        powerKw: 120,
        why: 'Nạp ngay đầu cao tốc để đảm bảo không bao giờ xuống dưới 20% pin trên cao tốc.',
      },
      {
        strategyLabel: 'Ít chờ nhất · Nút giao Uông Bí',
        stationName: 'Trạm sạc V-Green Nút giao Yên Hưng / Uông Bí',
        stationAddress: 'TX Quảng Yên, Quảng Ninh (mô phỏng)',
        kmToStation: 112,
        waitMin: 0,
        powerKw: 120,
        why: 'Dành cho xe có sẵn đủ pin chạy thẳng tới gần Quảng Ninh rồi mới nạp nhanh trước khi vào thành phố.',
      },
    ],
  },
  {
    name: 'Ninh Bình',
    keywords: ['ninh bình', 'ninh binh', 'tràng an', 'trang an', 'tam cốc'],
    distanceKm: 94,
    driveTotalMin: 90,
    corridorStations: [
      {
        strategyLabel: 'Tối ưu thời gian · Cao tốc Pháp Vân - Cầu Giẽ',
        stationName: 'Trạm sạc V-Green Trạm dừng nghỉ Cao Bồ / Liêm Tuyền',
        stationAddress: 'Nút giao Liêm Tuyền, Phủ Lý, Hà Nam (mô phỏng)',
        kmToStation: 56,
        waitMin: 0,
        powerKw: 120,
        why: 'Nạp nhanh 15 phút ngay trạm dừng nghỉ cao tốc để vào Tràng An với >50% pin.',
      },
      {
        strategyLabel: 'An toàn sớm · Cửa ngõ Pháp Vân',
        stationName: 'Trạm sạc V-Green Gamuda / Bến xe Nước Ngầm',
        stationAddress: 'Hoàng Mai, Hà Nội',
        kmToStation: 9,
        waitMin: 4,
        powerKw: 120,
        why: 'Sạc ngay cửa ngõ phía Nam Hà Nội trước khi ra cao tốc.',
      },
      {
        strategyLabel: 'Nhanh tới đích · Vincom Plaza Ninh Bình',
        stationName: 'Trạm sạc Vincom Plaza Ninh Bình',
        stationAddress: 'Trần Hưng Đạo, TP. Ninh Bình (mô phỏng)',
        kmToStation: 92,
        waitMin: 0,
        powerKw: 60,
        why: 'Nếu pin đủ tới thẳng Ninh Bình, sạc ngay tại trung tâm trong lúc nghỉ ăn trưa.',
      },
    ],
  },
];

export function calculateOffPeakReward(
  chargeStartTime: string,
  stationOccupancyRatio: number
): OffPeakReward {
  const mins = timeToMinutes(chargeStartTime);
  if (mins >= 11 * 60 && mins <= 14 * 60) {
    return {
      points: 80,
      label: '+80 điểm Sạc Xanh Trưa Nắng',
      reason:
        'Khung giờ trưa nắng (11:00–14:00) rất ít người ra trạm — bạn giúp giãn tải lưới điện và nhận x2 điểm thưởng.',
      isSolarNoon: true,
      discountVnd: 8000,
    };
  }
  if (mins >= 22 * 60 || mins < 6 * 60) {
    return {
      points: 50,
      label: '+50 điểm Đêm Thấp Điểm',
      reason: 'Sạc khung giờ đêm thấp điểm (22:00–06:00) giúp cân bằng phụ tải lưới điện.',
      isSolarNoon: false,
      discountVnd: 5000,
    };
  }
  if (stationOccupancyRatio <= 0.45) {
    return {
      points: 30,
      label: '+30 điểm Trạm Vắng',
      reason: 'Trạm đang rất thoáng xe — sạc ngay giúp phân bổ lưu lượng đều hơn.',
      isSolarNoon: false,
      discountVnd: 3000,
    };
  }
  return {
    points: 0,
    label: 'Khung giờ cao điểm',
    reason:
      'Khung giờ đông xe — nếu tiện bạn có thể dời sang giờ trưa nắng 11:00–14:00 để nhận +80 điểm.',
    isSolarNoon: false,
    discountVnd: 0,
  };
}

export function parseAndValidateNaturalRequest(prompt: string): ParsedNaturalRequest {
  const rawText = prompt.trim();
  const text = rawText.toLowerCase();

  let destinationName: string | null = null;
  let destinationScope: 'hanoi' | 'intercity' | null = null;
  let hanoiPlaceId: string | undefined;
  let nextDestinationName: string | null = null;

  // 1. Check Hanoi destinations
  if (text.includes('hồ gươm') || text.includes('hoàn kiếm') || text.includes('ho guom')) {
    destinationName = 'Hồ Hoàn Kiếm (Hồ Gươm)';
    destinationScope = 'hanoi';
    hanoiPlaceId = 'ho-guom';
  } else if (text.includes('nội bài') || text.includes('noi bai') || text.includes('sân bay')) {
    destinationName = 'Cảng HKQT Nội Bài';
    destinationScope = 'hanoi';
    hanoiPlaceId = 'noi-bai-airport';
  } else if (text.includes('hồ tây') || text.includes('tây hồ') || text.includes('lotte')) {
    destinationName = 'Hồ Tây / Lotte Tây Hồ';
    destinationScope = 'hanoi';
    hanoiPlaceId = 'ho-guom';
  } else if (text.includes('bà triệu') || text.includes('royal') || text.includes('mỹ đình') || text.includes('cầu giấy')) {
    destinationName = 'Trung tâm Hà Nội';
    destinationScope = 'hanoi';
    hanoiPlaceId = 'ho-guom';
  }

  if ((text.includes('nội bài') || text.includes('sân bay')) && hanoiPlaceId === 'ho-guom') {
    nextDestinationName = 'Sân bay Nội Bài';
  }

  // 2. Check Intercity destinations (e.g. Vũng Tàu, Hải Phòng, Hạ Long, Ninh Bình)
  if (!destinationName) {
    for (const city of INTERCITY_PROFILES) {
      if (city.keywords.some((kw) => text.includes(kw))) {
        destinationName = city.name;
        destinationScope = 'intercity';
        break;
      }
    }
  }

  // 2b. Reward / open charging inquiry ("sạc ở đâu", "đổi pin", "điểm thưởng", "trạm nào")
  if (
    !destinationName &&
    (text.includes('sạc ở đâu') ||
      text.includes('đổi pin') ||
      text.includes('trạm nào') ||
      text.includes('điểm thưởng') ||
      text.includes('tích điểm') ||
      text.includes('xe máy điện') ||
      text.includes('sạc pin'))
  ) {
    destinationName = 'Khu vực trung tâm Hà Nội';
    destinationScope = 'hanoi';
    hanoiPlaceId = 'ho-guom';
  }

  // 3. Check Battery percentage
  let batteryPct: number | null = null;
  const pctMatch =
    text.match(/(\d{1,3})\s*(?:%|phần trăm)/) ??
    text.match(/(?:còn|pin)\s*(\d{1,3})\b/);
  if (pctMatch) {
    const num = parseInt(pctMatch[1], 10);
    if (num >= 1 && num <= 100) {
      batteryPct = num;
    }
  }

  // 4. Check Time / Schedule (including sunny midday / off-peak phrases)
  let timeText: string | null = null;
  const explicitTimeMatch = text.match(/(\d{1,2})\s*(?:h|:|giờ)\s*(\d{0,2})/);
  if (explicitTimeMatch) {
    const h = Math.min(23, parseInt(explicitTimeMatch[1], 10));
    const m = explicitTimeMatch[2] ? Math.min(59, parseInt(explicitTimeMatch[2], 10)) : 0;
    timeText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else if (
    text.includes('trưa nắng') ||
    text.includes('giữa trưa') ||
    text.includes('buổi trưa') ||
    text.includes('trưa nay') ||
    text.includes('nắng trưa')
  ) {
    timeText = '12:00';
  } else if (
    text.includes('ngay bây giờ') ||
    text.includes('bây giờ') ||
    text.includes('đi ngay') ||
    text.includes('xuất phát ngay') ||
    text.includes('lúc này')
  ) {
    timeText = '13:40';
  } else if (text.includes('sáng mai')) {
    timeText = '08:00';
  } else if (text.includes('chiều nay')) {
    timeText = '14:30';
  }

  const missingFields: MissingInfoField[] = [];
  if (!destinationName) missingFields.push('destination');
  if (batteryPct === null) missingFields.push('battery');
  if (!timeText) missingFields.push('time');

  return {
    rawText,
    destinationName,
    destinationScope,
    hanoiPlaceId,
    nextDestinationName,
    batteryPct,
    timeText,
    missingFields,
    isComplete: missingFields.length === 0,
  };
}

export function generateItineraryOptionsForRequest(params: {
  parsed: ParsedNaturalRequest;
  hanoiResult: RecommendationResult;
  vehicleId: VehicleId;
  weather: WeatherCondition;
}): ProposedItineraryOption[] {
  const { parsed, hanoiResult, vehicleId, weather } = params;
  if (!parsed.isComplete || parsed.batteryPct === null || !parsed.timeText || !parsed.destinationName) {
    return [];
  }

  // Case A: Real Hanoi OSRM + 9 Stations
  const startBatteryPct = parsed.batteryPct;
  const parsedStartMin = timeToMinutes(parsed.timeText);
  const isNoonPrompt = parsedStartMin >= 11 * 60 && parsedStartMin <= 14 * 60;
  const baseDepartureMin = isNoonPrompt ? parsedStartMin : timeToMinutes('13:40');

  if (parsed.destinationScope === 'hanoi') {
    const candidates = [hanoiResult.recommended, ...hanoiResult.alternatives].filter(
      (x): x is StationEvaluation => Boolean(x)
    );
    const total = candidates.length;
    const labels = [
      'Đề xuất tối ưu nhất',
      'Phương án thay thế · Ít rủi ro',
      'Phương án dự phòng · Linh hoạt',
    ];

    return candidates.map((ev, idx) => {
      const startMin = baseDepartureMin;
      const arriveStationMin = startMin + ev.driveToStationMin;
      const finishChargeMin = arriveStationMin + ev.waitMin + ev.chargeMin;
      const arrivePrimaryMin = finishChargeMin + ev.driveToPrimaryMin;
      const chargeStartTimeStr = minutesToTime(arriveStationMin + ev.waitMin);
      const occupancyRatio =
        ev.station.totalBays > 0
          ? (ev.station.totalBays - ev.station.availableBays) / ev.station.totalBays
          : 0.8;
      const reward = calculateOffPeakReward(chargeStartTimeStr, occupancyRatio);

      const selectedVehicle = VEHICLES[vehicleId];
      const isSwapOption = Boolean(selectedVehicle.supportsBatterySwap && ev.station.supportsBatterySwap);
      const chargeTitle = isSwapOption
        ? `Đổi đầy 100% pin tại tủ đổi pin (${ev.chargeMin}p)`
        : selectedVehicle.category === 'motorbike'
          ? `Sạc xe máy điện ${selectedVehicle.maxDcPowerKw}kW (${ev.chargeMin}p)`
          : `Hoàn tất sạc DC ${ev.station.maxPowerKw}kW (${ev.chargeMin}p)`;

      const timeline: JourneyStage[] = [
        {
          id: `opt-${idx}-depart`,
          time: minutesToTime(startMin),
          title: 'Xuất phát từ Láng Hạ',
          subtitle: `${selectedVehicle.name} · Pin ${startBatteryPct}%`,
          type: 'departure',
          batteryPct: startBatteryPct,
          status: startBatteryPct <= 15 ? 'warning' : 'safe',
        },
        {
          id: `opt-${idx}-station`,
          time: minutesToTime(arriveStationMin),
          title: `Đến ${ev.station.shortName}`,
          subtitle: `${ev.distanceToStationKm} km (${ev.driveToStationMin}p)${ev.waitMin > 0 ? ` · Chờ ${ev.waitMin}p` : ' · Vào ngay'}`,
          type: 'driving',
          batteryPct: ev.arrivalBatteryPct,
          status: ev.arrivalBatteryPct <= 8 ? 'warning' : 'safe',
        },
        {
          id: `opt-${idx}-charge`,
          time: minutesToTime(finishChargeMin),
          title: chargeTitle,
          subtitle: `${isSwapOption ? 'Đổi pin' : 'Nạp'} ${ev.arrivalBatteryPct}% -> ${ev.targetDepartureBatteryPct}% · ~${formatVnd(ev.estimatedCostVnd)}`,
          type: 'charging',
          batteryPct: ev.targetDepartureBatteryPct,
          status: 'safe',
        },
        {
          id: `opt-${idx}-dest`,
          time: minutesToTime(arrivePrimaryMin),
          title: `Đến ${parsed.destinationName}`,
          subtitle: isNoonPrompt
            ? `Sạc khung trưa nắng nhận +${reward.points} điểm Sạc Xanh`
            : ev.scheduleSlackMin >= 0
              ? `Sớm hơn mốc ${parsed.timeText} là ${ev.scheduleSlackMin} phút`
              : `Trễ ${Math.abs(ev.scheduleSlackMin)} phút so với mốc ${parsed.timeText}`,
          type: 'appointment',
          batteryPct: ev.primaryArrivalBatteryPct,
          status: isNoonPrompt || ev.scheduleSlackMin >= 0 ? 'safe' : 'warning',
        },
      ];

      const actionDesc = isSwapOption
        ? `đổi pin siêu tốc ${ev.chargeMin} phút đầy 100%`
        : `nạp ${ev.chargeMin} phút`;
      const mascotSpeech = reward.isSolarNoon
        ? `Tuyệt vời! Bạn đi lúc ${chargeStartTimeStr} trưa nắng vắng xe tại ${ev.station.shortName} (${ev.distanceToStationKm} km), ${actionDesc} và nhận ngay +${reward.points} điểm Sạc Xanh nhé!`
        : `Mình gợi ý bạn ghé ${ev.station.shortName} cách ${ev.distanceToStationKm} km (${selectedVehicle.name}). Chỉ mất ${actionDesc} là kịp đến ${parsed.destinationName} lúc ${minutesToTime(arrivePrimaryMin)}.`;

      return {
        id: `hanoi-${ev.station.id}-${chargeStartTimeStr}`,
        optionIndex: idx,
        totalOptions: total,
        strategyLabel: labels[idx] ?? 'Phương án khả thi',
        destinationName: parsed.nextDestinationName
          ? `${parsed.destinationName} -> ${parsed.nextDestinationName}`
          : parsed.destinationName!,
        stationName: ev.station.shortName,
        stationAddress: ev.station.address,
        distanceKm: ev.distanceToStationKm,
        driveMin: ev.driveToStationMin,
        waitMin: ev.waitMin,
        chargeMin: ev.chargeMin,
        arrivalBatteryPct: ev.arrivalBatteryPct,
        departureBatteryPct: ev.targetDepartureBatteryPct,
        estimatedCostVnd: ev.estimatedCostVnd,
        etaText: minutesToTime(arrivePrimaryMin),
        scheduleNote: reward.isSolarNoon
          ? `Khung trưa nắng · +${reward.points} điểm thưởng`
          : ev.scheduleSlackMin >= 0
            ? `Sớm ${ev.scheduleSlackMin} phút (mốc ${parsed.timeText})`
            : `Trễ ${Math.abs(ev.scheduleSlackMin)} phút`,
        whyThisOption: ev.highlightReason,
        mascotSpeech,
        reward,
        isIntercitySimulated: false,
        hanoiStationId: ev.station.id,
        timeline,
      };
    });
  }

  // Case B: Intercity simulated itinerary (e.g. Vũng Tàu, Hải Phòng, Hạ Long, Ninh Bình)
  const profile =
    INTERCITY_PROFILES.find((c) => c.name === parsed.destinationName) ?? INTERCITY_PROFILES[0];
  const vehicle = VEHICLES[vehicleId];
  const consumption = Number(
    (vehicle.baseConsumptionKwhPer100Km * (1 + weather.consumptionImpactPct / 100)).toFixed(1)
  );
  const startMin = timeToMinutes(parsed.timeText);

  return profile.corridorStations.map((st, idx) => {
    const startEnergyKwh = (parsed.batteryPct! / 100) * vehicle.usableBatteryKwh;
    const usedLeg1Kwh = (st.kmToStation / 100) * consumption;
    const rawArrivalPct = Math.round(((startEnergyKwh - usedLeg1Kwh) / vehicle.usableBatteryKwh) * 100);
    const arrivalPct = Math.max(6, rawArrivalPct);
    const targetPct = idx === 1 ? 85 : idx === 2 ? 78 : 80;
    const kwhAdded = Math.max(4, ((targetPct - arrivalPct) / 100) * vehicle.usableBatteryKwh);
    const effPower = Math.min(vehicle.maxDcPowerKw, st.powerKw) * 0.85;
    const chargeMin = Math.max(14, Math.round((kwhAdded / effPower) * 60));
    const leg1Min = Math.max(12, Math.round(st.kmToStation * 1.1));
    const leg2Km = Math.max(15, profile.distanceKm - st.kmToStation);
    const leg2Min = Math.max(18, Math.round(leg2Km * 1.05));
    const destBatteryPct = Math.max(
      18,
      Math.round(targetPct - (((leg2Km / 100) * consumption) / vehicle.usableBatteryKwh) * 100)
    );

    const arriveStMin = startMin + leg1Min;
    const finishChargeMin = arriveStMin + st.waitMin + chargeMin;
    const arriveDestMin = finishChargeMin + leg2Min;
    const estCost = Math.round(kwhAdded * 3858);
    const chargeStartStr = minutesToTime(arriveStMin + st.waitMin);
    const reward = calculateOffPeakReward(chargeStartStr, st.waitMin === 0 ? 0.25 : 0.7);

    const timeline: JourneyStage[] = [
      {
        id: `ic-${idx}-depart`,
        time: minutesToTime(startMin),
        title: `Khởi hành đi ${profile.name}`,
        subtitle: `${vehicle.name} · Pin xuất phát ${parsed.batteryPct}%`,
        type: 'departure',
        batteryPct: parsed.batteryPct!,
        status: parsed.batteryPct! <= 20 ? 'warning' : 'safe',
      },
      {
        id: `ic-${idx}-st`,
        time: minutesToTime(arriveStMin),
        title: `Dừng sạc tại ${st.stationName}`,
        subtitle: `Chạy ${st.kmToStation} km (${leg1Min}p)${rawArrivalPct < 6 ? ' · Cảnh báo pin sát ngưỡng nếu chạy thẳng' : ''}`,
        type: 'driving',
        batteryPct: arrivalPct,
        status: arrivalPct <= 10 ? 'warning' : 'safe',
      },
      {
        id: `ic-${idx}-charge`,
        time: minutesToTime(finishChargeMin),
        title: `Hoàn tất sạc nhanh (${chargeMin}p)`,
        subtitle: `Nạp ${arrivalPct}% -> ${targetPct}% · Chi phí mô phỏng ~${formatVnd(estCost)}`,
        type: 'charging',
        batteryPct: targetPct,
        status: 'safe',
      },
      {
        id: `ic-${idx}-dest`,
        time: minutesToTime(arriveDestMin),
        title: `Đến ${profile.name}`,
        subtitle: `Tổng quãng đường ${profile.distanceKm} km · Còn dư ${destBatteryPct}% pin`,
        type: 'destination',
        batteryPct: destBatteryPct,
        status: 'safe',
      },
    ];

    const mascotSpeech = reward.isSolarNoon
      ? `Đi ${profile.name} từ ${parsed.timeText} với ${parsed.batteryPct}% pin, mình xếp bạn dừng sạc lúc ${chargeStartStr} trưa nắng tại ${st.stationName}. Vừa vắng xe lại nhận thêm +${reward.points} điểm thưởng!`
      : `Với ${parsed.batteryPct}% pin đi ${profile.name}, bạn dừng sạc ${chargeMin} phút tại ${st.stationName} là tới nơi lúc ${minutesToTime(arriveDestMin)} với ${destBatteryPct}% pin dự phòng.`;

    return {
      id: `ic-${profile.name}-${idx}-${chargeStartStr}`,
      optionIndex: idx,
      totalOptions: profile.corridorStations.length,
      strategyLabel: st.strategyLabel,
      destinationName: profile.name,
      stationName: st.stationName,
      stationAddress: st.stationAddress,
      distanceKm: st.kmToStation,
      driveMin: leg1Min,
      waitMin: st.waitMin,
      chargeMin,
      arrivalBatteryPct: arrivalPct,
      departureBatteryPct: targetPct,
      estimatedCostVnd: estCost,
      etaText: minutesToTime(arriveDestMin),
      scheduleNote: `Tổng hành trình ${leg1Min + st.waitMin + chargeMin + leg2Min} phút (mô phỏng liên tỉnh)`,
      whyThisOption: st.why,
      mascotSpeech,
      reward,
      isIntercitySimulated: true,
      timeline,
    };
  });
}
