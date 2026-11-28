import { HANOI_STATIONS } from '@/data/stations';
import { VEHICLES } from '@/data/vehicles';
import type {
  ApiChatRequest,
  ApiChatResponse,
  ApiGreenConfirmRequest,
  ApiGreenConfirmResponse,
  ApiHealthResponse,
  ApiLeaderboardResponse,
  ApiSessionResetResponse,
  ApiStationItem,
  ChargingBay,
  ChargingStation,
  JourneyStage,
  ProposedItineraryOption,
  StationStatus,
  VehicleId,
} from '@/types';

export const DEFAULT_VPS_BASE_URL = 'https://maintaining-podcast-down-coding.trycloudflare.com';

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function getDefaultApiBaseUrl(): string {
  const envUrl =
    typeof process !== 'undefined'
      ? (process as { env?: Record<string, string | undefined> }).env?.EXPO_PUBLIC_API_BASE_URL
      : undefined;
  if (envUrl && envUrl.trim()) {
    return normalizeBaseUrl(envUrl);
  }
  return DEFAULT_VPS_BASE_URL;
}

export function generateSessionId(): string {
  return `sess_${Math.random().toString(16).slice(2, 14)}`;
}

/**
 * Convert JavaScript Date.getDay() (0=Sun..6=Sat) to API contract weekday (0=Mon..6=Sun).
 */
export function getApiWeekday(date: Date = new Date()): number {
  return (date.getDay() + 6) % 7;
}

export function formatLocalTimeHHMM(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

class ApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 12000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    const rawText = await resp.text();
    let parsed: unknown = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!resp.ok) {
      const apiErr =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error?: unknown }).error || '')
          : '';
      throw new ApiHttpError(resp.status, apiErr || `Máy chủ trả mã lỗi HTTP ${resp.status}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Phản hồi từ máy chủ không phải JSON hợp lệ.');
    }

    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Quá thời gian chờ phản hồi (${Math.round(timeoutMs / 1000)}s).`);
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Không thể kết nối tới máy chủ CHARGEPILOT.');
  } finally {
    clearTimeout(timer);
  }
}

export async function checkApiHealth(baseUrl: string): Promise<ApiHealthResponse> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error('Chưa nhập địa chỉ máy chủ VPS.');
  }
  return fetchJson<ApiHealthResponse>(`${base}/health`, { method: 'GET' }, 8000);
}

export async function sendChatMessage(
  baseUrl: string,
  payload: ApiChatRequest
): Promise<ApiChatResponse> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error('Chưa nhập địa chỉ máy chủ VPS.');
  }
  return fetchJson<ApiChatResponse>(
    `${base}/api/v1/chat`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    25000
  );
}

/**
 * Call demo front-door endpoint POST /api/v1/converse, falling back cleanly to
 * /api/v1/chat if the remote VPS has not deployed /api/v1/converse yet (HTTP 404).
 */
export async function sendConverseMessage(
  baseUrl: string,
  payload: ApiChatRequest
): Promise<ApiChatResponse> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error('Chưa nhập địa chỉ máy chủ VPS.');
  }
  const message = (payload.message ?? payload.text ?? '').trim();
  try {
    return await fetchJson<ApiChatResponse>(
      `${base}/api/v1/converse`,
      {
        method: 'POST',
        body: JSON.stringify({
          session_id: payload.session_id,
          message,
        }),
      },
      25000
    );
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 404) {
      return sendChatMessage(baseUrl, payload);
    }
    throw err;
  }
}

export async function resetChatSession(
  baseUrl: string,
  sessionId: string
): Promise<ApiSessionResetResponse> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error('Chưa nhập địa chỉ máy chủ VPS.');
  }
  return fetchJson<ApiSessionResetResponse>(
    `${base}/api/v1/session/reset`,
    {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    },
    8000
  );
}

export async function confirmGreenScore(
  baseUrl: string,
  payload: ApiGreenConfirmRequest
): Promise<ApiGreenConfirmResponse> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error('Chưa nhập địa chỉ máy chủ VPS.');
  }
  return fetchJson<ApiGreenConfirmResponse>(
    `${base}/api/v1/green-score/confirm`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    10000
  );
}

export async function fetchGreenLeaderboard(
  baseUrl: string
): Promise<ApiLeaderboardResponse> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error('Chưa nhập địa chỉ máy chủ VPS.');
  }
  return fetchJson<ApiLeaderboardResponse>(
    `${base}/api/v1/green-score/leaderboard`,
    { method: 'GET' },
    8000
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function matchLocalHanoiStationId(lat: number | null, lon: number | null): string | undefined {
  if (lat == null || lon == null) return undefined;
  let bestId: string | undefined;
  let bestDist = 0.6;
  for (const st of HANOI_STATIONS) {
    const [stLon, stLat] = st.coordinates;
    const d = haversineKm(lat, lon, stLat, stLon);
    if (d < bestDist) {
      bestDist = d;
      bestId = st.id;
    }
  }
  return bestId;
}

export function mapApiStatusToStationStatus(status: ApiStationItem['status']): StationStatus {
  if (status === 'available') return 'available';
  if (status === 'crowded') return 'busy';
  if (status === 'maintenance') return 'maintenance';
  return 'unknown';
}

export function mapApiStationsToChargingStations(resp: ApiChatResponse): ChargingStation[] {
  const isMoto = resp.vehicle.vehicle_type === 'xe_may';
  return (resp.stations || [])
    .filter((st): st is ApiStationItem & { lat: number; lon: number } =>
      st.lat !== null && st.lon !== null && Number.isFinite(st.lat) && Number.isFinite(st.lon)
    )
    .map((st) => {
      const mappedStatus = mapApiStatusToStationStatus(st.status);
      const powerKw = st.power_kw ?? (isMoto ? 1.2 : 60);
      const bayStatus: ChargingBay['status'] =
        mappedStatus === 'available'
          ? 'available'
          : mappedStatus === 'busy'
            ? 'occupied'
            : mappedStatus === 'maintenance'
              ? 'maintenance'
              : 'unknown';
      const short = st.name.replace(/^Trạm sạc\s*/i, '').trim();

      return {
        id: st.id,
        name: st.name,
        shortName: short.length > 32 ? `${short.slice(0, 30)}…` : short || st.name,
        operator: 'V-Green / VinFast',
        address: st.address || `Hà Nội (cách ${st.road_km.toFixed(1)} km)`,
        district: 'Hà Nội',
        coordinates: [st.lon, st.lat],
        coordinateSource: 'CHARGEPILOT Live API v1.0.0',
        isTelemetrySimulated: true,
        status: mappedStatus,
        statusNote: st.status_label,
        availableBays: mappedStatus === 'available' ? 3 : mappedStatus === 'busy' ? 1 : 0,
        totalBays: 4,
        queueCount: mappedStatus === 'busy' ? 2 : 0,
        estimatedWaitMin: mappedStatus === 'busy' ? 12 : 0,
        maxPowerKw: powerKw,
        pricePerKwhVnd: st.pricing_model === 'tou_2892' ? 2700 : 3858,
        parkingNote: st.has_roof ? 'Có mái che' : 'Điểm sạc công cộng Hà Nội',
        bayLocationNote: st.address || st.status_label,
        supportsMotorbike: isMoto,
        supportsBatterySwap: false,
        bays: [
          {
            id: `${st.id}-bay-1`,
            code: 'TRỤ-01',
            connector: isMoto ? 'Type 2 AC' : 'CCS2 DC',
            powerKw,
            status: bayStatus,
          },
        ],
      };
    });
}

export function mergeApiStationsIntoList(
  base: ChargingStation[],
  apiStations: ChargingStation[]
): ChargingStation[] {
  if (!apiStations.length) return base;
  const filteredBase = base.filter((existing) => {
    const [exLon, exLat] = existing.coordinates;
    return !apiStations.some(
      (apiSt) =>
        apiSt.id === existing.id ||
        haversineKm(apiSt.coordinates[1], apiSt.coordinates[0], exLat, exLon) < 0.15
    );
  });
  return [...apiStations, ...filteredBase];
}

export function mapApiResponseToProposedOptions(
  resp: ApiChatResponse,
  vehicleId: VehicleId,
  originShortName: string
): ProposedItineraryOption[] {
  if (!resp.stations || resp.stations.length === 0) {
    return [];
  }

  const effectiveVehicleId: VehicleId =
    resp.vehicle.vehicle_type === 'xe_may' ? 'vinfast_evo200' : vehicleId;
  const vehicle = VEHICLES[effectiveVehicleId] ?? VEHICLES.vfe34;

  const startPct = resp.battery.current_pct ?? 35;
  const targetPct = resp.battery.target_pct ?? 80;
  const kwhAdded = Math.max(2, ((Math.max(targetPct, startPct) - startPct) / 100) * vehicle.usableBatteryKwh);
  const unitPrice = resp.stations[0]?.pricing_model === 'tou_2892' ? 2700 : 3858;
  const chargeMin = resp.charge_window?.duration_min ?? 25;
  const windowParts = resp.charge_window?.window?.split(/[–-]/) ?? [];
  const startClock = windowParts[0] || formatLocalTimeHHMM();
  const endClock = windowParts[1] || resp.charge_window?.window || 'Sạc ngay';

  const reasonsText = resp.green_reward.reasons.join('; ');
  const isSolar =
    (resp.weather.solar_wm2 !== null && resp.weather.solar_wm2 >= 300) ||
    /mặt trời|nắng|solar/i.test(reasonsText);

  const rewardLabel = resp.green_reward.eligible
    ? `Green Score (+${resp.green_reward.points} điểm dự kiến)`
    : resp.battery.rescue_mode
      ? 'Chế độ Cứu Pin Khẩn Cấp (<15%)'
      : 'Gợi ý từ CHARGEPILOT AI';

  const rewardReason =
    reasonsText ||
    resp.charge_window?.reason ||
    (resp.battery.rescue_mode
      ? 'Pin dưới 15%: ưu tiên sạc ngay tại trạm gần nhất trong tầm an toàn.'
      : 'Đã kiểm tra trạng thái trụ và tầm an toàn theo thời tiết Hà Nội.');

  const totalOptions = Math.min(3, resp.stations.length);

  return resp.stations.slice(0, 3).map((st, idx) => {
    const driveMin = Math.max(3, Math.round(st.road_km * 3));
    const waitMin = st.status === 'crowded' ? 12 : 0;
    const drainRatio = resp.battery.safe_range_km && resp.battery.safe_range_km > 0
      ? Math.min(0.6, (st.road_km / resp.battery.safe_range_km) * 0.8)
      : 0.04;
    const arrivalPct = Math.max(4, Math.round(startPct - startPct * drainRatio));
    const departurePct = Math.max(arrivalPct, targetPct);
    const estCost = Math.round(kwhAdded * unitPrice);
    const localStationId = matchLocalHanoiStationId(st.lat, st.lon);

    const timeline: JourneyStage[] = [
      {
        id: `api-${st.id}-depart`,
        time: startClock,
        title: `Xuất phát từ ${originShortName}`,
        subtitle: `${resp.vehicle.model || vehicle.name} · Pin ${startPct}%${resp.battery.safe_range_km ? ` · Tầm an toàn ~${resp.battery.safe_range_km} km` : ''}`,
        type: 'departure',
        batteryPct: startPct,
        status: resp.battery.rescue_mode ? 'critical' : 'safe',
      },
      {
        id: `api-${st.id}-arrive`,
        time: `+${driveMin}p`,
        title: `Tới [${st.id}] ${st.name}`,
        subtitle: `${st.road_km.toFixed(1)} km · ${st.status_label}${st.power_kw ? ` · ${st.power_kw} kW` : ''}`,
        type: 'driving',
        batteryPct: arrivalPct,
        durationMin: driveMin,
        status: st.status === 'crowded' ? 'warning' : 'safe',
      },
      {
        id: `api-${st.id}-charge`,
        time: endClock,
        title: resp.charge_window?.window
          ? `Khung sạc ${resp.charge_window.window}`
          : `Sạc dự kiến ~${chargeMin} phút`,
        subtitle: `${arrivalPct}% → ${departurePct}% · ${resp.charge_window?.reason || st.status_label}`,
        type: 'charging',
        batteryPct: departurePct,
        durationMin: chargeMin,
        status: 'safe',
      },
    ];

    return {
      id: `api-${resp.session_id}-${st.id}`,
      optionIndex: idx,
      totalOptions,
      strategyLabel: `Hạng #${st.rank} · ${st.status_label}`,
      destinationName: 'Hà Nội',
      stationName: `[${st.id}] ${st.name}`,
      stationAddress: st.address || `Cách ${st.road_km.toFixed(1)} km`,
      distanceKm: Number(st.road_km.toFixed(1)),
      driveMin,
      waitMin,
      chargeMin,
      arrivalBatteryPct: arrivalPct,
      departureBatteryPct: departurePct,
      estimatedCostVnd: estCost,
      etaText: resp.charge_window?.window || 'Sạc ngay',
      scheduleNote: resp.charge_window?.reason || st.status_label,
      whyThisOption: resp.guardrails.excluded_note || resp.tts_summary || resp.reply_text,
      mascotSpeech: resp.tts_summary || resp.reply_text,
      reward: {
        points: idx === 0 && resp.green_reward.eligible ? resp.green_reward.points : 0,
        label: rewardLabel,
        reason: rewardReason,
        isSolarNoon: isSolar,
        discountVnd: 0,
      },
      isIntercitySimulated: false,
      hanoiStationId: localStationId,
      apiStationId: st.id,
      stationLat: st.lat,
      stationLon: st.lon,
      statusLabel: st.status_label,
      chargeWindowText: resp.charge_window?.window,
      confirmToken: idx === 0 ? resp.green_reward.confirm_token : null,
      isLiveApi: true,
      fullReplyText: resp.reply_text,
      timeline,
    };
  });
}
