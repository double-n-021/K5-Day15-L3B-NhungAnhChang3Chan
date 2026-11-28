import { create } from 'zustand';
import { DEMO_SEQUENCE } from '@/data/presets';
import { HANOI_PLACES, HANOI_STATIONS } from '@/data/stations';
import { HANOI_WEATHER_STATES } from '@/data/weather';
import {
  buildWeatherConditionFromApi,
  checkApiHealth,
  confirmGreenScore,
  fetchGreenLeaderboard,
  fetchLiveWeather,
  formatLocalTimeHHMM,
  generateSessionId,
  getApiWeekday,
  getDefaultApiBaseUrl,
  mapApiResponseToProposedOptions,
  mapApiStationsToChargingStations,
  mergeApiStationsIntoList,
  normalizeBaseUrl,
  resetChatSession,
  sendConverseMessage,
} from '@/services/chargePilotApi';
import { fetchLiveOsrmRoute } from '@/services/routeService';
import {
  applyScenariosToState,
  evaluateChargingDecision,
  generateItineraryOptionsForRequest,
  minutesToTime,
  parseAndValidateNaturalRequest,
  parseVietnameseJourneyPrompt,
  timeToMinutes,
} from '@/services/decisionEngine';
import { fetchCurrentUserLocation } from '@/services/locationService';
import type {
  ApiChatResponse,
  ApiConnectionStatus,
  ApiIntentState,
  ApiLeaderboardEntry,
  ChargingPreference,
  ChargingStation,
  ItineraryDecisionStatus,
  JourneyInput,
  ParsedNaturalRequest,
  PlacePoint,
  ProposedItineraryOption,
  RecommendationResult,
  VehicleId,
  WeatherCondition,
  WhatIfScenarioId,
} from '@/types';

interface ChargePilotState {
  vehicleId: VehicleId;
  journeyInput: JourneyInput;
  weather: WeatherCondition;
  activeScenarios: WhatIfScenarioId[];
  selectedStationId: string;
  mapStyleMode: 'dark' | 'light';
  is3DBuildings: boolean;

  // Derived computed slices
  effectiveStations: ChargingStation[];
  effectiveWeather: WeatherCondition;
  effectiveInput: JourneyInput;
  trafficMultiplier: number;
  baselineRecommendation: RecommendationResult;
  recommendation: RecommendationResult;

  // Natural-language AI Trip Planner state (user-driven, no forced default)
  parsedRequest: ParsedNaturalRequest | null;
  proposedOptions: ProposedItineraryOption[];
  activeOptionIndex: number;
  itineraryStatus: ItineraryDecisionStatus;

  // Live API v1.0.0 integration state
  apiBaseUrl: string;
  apiStatus: ApiConnectionStatus;
  apiModelName: string | null;
  apiSessionId: string;
  apiLoading: boolean;
  apiError: string | null;
  apiSourceMode: 'live' | 'offline_fallback';
  lastApiResponse: ApiChatResponse | null;
  leaderboard: ApiLeaderboardEntry[];
  driverName: string;
  confirmedTokens: string[];

  // Green Off-Peak Points (Trưa nắng / Thấp điểm)
  greenPoints: number;
  creditedOptionIds: string[];
  rewardHistory: { id: string; title: string; points: number; time: string }[];
  voiceDrawerTrigger: number;

  // Battery % the driver explicitly reported (quick chips on Home or a % in a message).
  // null = never reported: the 18% default is demo data and must never be sent to the AI.
  batteryConfirmedAt: number | null;
  // Prompt queued from Home, submitted by the Journey screen so it reuses its thinking/fallback UI.
  pendingPrompt: string | null;

  // Live GPS Origin state
  gpsStatus: 'idle' | 'loading' | 'ready' | 'denied' | 'error';
  locationLabel: string;

  // Demo Hackathon Mode
  isDemoActive: boolean;
  isDemoPlaying: boolean;
  demoStepIndex: number; // 0 .. DEMO_SEQUENCE.length - 1

  // Actions
  setVehicleId: (id: VehicleId) => void;
  setUserOrigin: (place: PlacePoint, displayLabel?: string) => void;
  refreshUserLocation: () => Promise<void>;
  setBatteryPct: (pct: number) => void;
  confirmBatteryPct: (pct: number) => void;
  queuePrompt: (prompt: string) => void;
  consumePendingPrompt: () => string | null;
  setArrivalDeadline: (hhmm: string) => void;
  shiftArrivalDeadline: (deltaMin: number) => void;
  setPreference: (pref: ChargingPreference) => void;
  setHasNextDestination: (enabled: boolean) => void;
  applyNaturalLanguagePrompt: (prompt: string) => void;
  analyzeNaturalPrompt: (prompt: string) => ParsedNaturalRequest;
  setApiBaseUrl: (url: string) => void;
  setDriverName: (name: string) => void;
  checkServerHealth: () => Promise<boolean>;
  refreshLiveWeather: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;
  sendPromptToApi: (prompt: string) => Promise<void>;
  confirmGreenToken: (token: string, label?: string) => Promise<boolean>;
  resetApiSession: () => Promise<void>;
  acceptProposedItinerary: (confirmReward?: boolean) => void;
  confirmAcceptedItineraryReward: () => Promise<boolean>;
  declineProposedItinerary: () => void;
  requestAlternativeOption: (index?: number) => void;
  triggerVoiceAssistant: () => void;
  selectStation: (stationId: string) => void;
  toggleScenario: (scenarioId: WhatIfScenarioId) => void;
  clearScenarios: () => void;
  setScenarios: (scenarios: WhatIfScenarioId[]) => void;
  toggleMapStyle: () => void;
  toggle3DBuildings: () => void;
  setWeatherCondition: (weatherId: WeatherCondition['id']) => void;

  // Demo controls
  startDemo: () => void;
  stopDemo: () => void;
  toggleDemoPlay: () => void;
  setDemoStep: (index: number) => void;
  nextDemoStep: () => void;
  restartDemo: () => void;
}

const DEFAULT_INPUT: JourneyInput = {
  rawPrompt: 'Tôi còn 18% pin, 14h30 phải có mặt tại Hồ Gươm và sau đó đi sân bay Nội Bài.',
  vehicleId: 'vfe34',
  batteryPct: 18,
  origin: HANOI_PLACES.langHa,
  primaryDestination: HANOI_PLACES.hoGuom,
  arrivalDeadline: '14:30',
  nextDestination: HANOI_PLACES.noiBai,
  nextDepartureTime: '16:15',
  departureTime: '13:40',
  preference: 'balanced',
};

const DEFAULT_WEATHER = HANOI_WEATHER_STATES.overcast_cool;

function recompute(
  input: JourneyInput,
  weather: WeatherCondition,
  scenarios: WhatIfScenarioId[],
  selectedStationId: string
) {
  const baselineRecommendation = evaluateChargingDecision({
    input,
    weather,
    stations: HANOI_STATIONS,
    trafficMultiplier: 1.0,
  });

  const {
    stations: effectiveStations,
    weather: effectiveWeather,
    input: effectiveInput,
    trafficMultiplier,
  } = applyScenariosToState(
    HANOI_STATIONS,
    weather,
    input,
    scenarios,
    baselineRecommendation.recommended?.station.id ?? selectedStationId
  );

  const recommendation = evaluateChargingDecision({
    input: effectiveInput,
    weather: effectiveWeather,
    stations: effectiveStations,
    trafficMultiplier,
  });

  return {
    effectiveStations,
    effectiveWeather,
    effectiveInput,
    trafficMultiplier,
    baselineRecommendation,
    recommendation,
  };
}

const initialComputed = recompute(DEFAULT_INPUT, DEFAULT_WEATHER, [], 'metropolis');

// A reported battery % is reused for this long, then the driver is asked again (pin tụt khi xe chạy).
export const BATTERY_CONFIRM_TTL_MS = 30 * 60 * 1000;
const PCT_IN_TEXT_RE = /\d{1,3}\s*%/;

function shouldAttachBatteryToPrompt(trimmed: string, lastIntentState?: ApiIntentState | null): boolean {
  if (PCT_IN_TEXT_RE.test(trimmed)) return false;

  const isDecline = /^(không|khong|ko|k|thôi|chưa cần|để sau|khỏi|no|nope)(?![\p{L}\p{M}\p{N}_])/iu.test(trimmed);
  const isGuardrailProbe = /(đặt cọc|giữ trụ|thanh toán|chuyển khoản|otp|đà nẵng|hải phòng|sài gòn|tp\.?\s*hcm)/i.test(trimmed);
  if (isDecline || isGuardrailProbe) return false;

  const hasTripIntent =
    /(trạm|sạc|gần nhất|còn trống|hết pin|pin yếu)/i.test(trimmed) ||
    /(?:^|[^\p{L}\p{M}\p{N}_])(?:đi|tới|đến|sang|qua)\s+|(?:^|[^\p{L}\p{M}\p{N}_])lúc\s+\d/iu.test(trimmed);
  const isGreetingOrFaq = /(?:^|[^\p{L}\p{M}\p{N}_])(chào|xin chào|hello|hi|hey|alo|tính sao|làm được gì|giới thiệu|bảng xếp hạng|đọc kết quả|hướng dẫn|green score là gì)(?![\p{L}\p{M}\p{N}_])/iu.test(trimmed);
  if (isGreetingOrFaq && !hasTripIntent) return false;

  return hasTripIntent || lastIntentState === 'ask_back' || lastIntentState === 'partial_prompt';
}

export function isBatteryFresh(confirmedAt: number | null): boolean {
  return confirmedAt !== null && Date.now() - confirmedAt <= BATTERY_CONFIRM_TTL_MS;
}

export const useChargePilotStore = create<ChargePilotState>((set, get) => ({
  vehicleId: DEFAULT_INPUT.vehicleId,
  journeyInput: DEFAULT_INPUT,
  weather: DEFAULT_WEATHER,
  activeScenarios: [],
  selectedStationId: initialComputed.recommendation.recommended?.station.id ?? 'metropolis',
  mapStyleMode: 'dark',
  is3DBuildings: true,

  ...initialComputed,

  parsedRequest: null,
  proposedOptions: [],
  activeOptionIndex: 0,
  itineraryStatus: 'none',

  apiBaseUrl: getDefaultApiBaseUrl(),
  apiStatus: 'idle',
  apiModelName: null,
  apiSessionId: generateSessionId(),
  apiLoading: false,
  apiError: null,
  apiSourceMode: 'offline_fallback',
  lastApiResponse: null,
  leaderboard: [],
  driverName: 'Tài xế ChargePilot',
  confirmedTokens: [],

  greenPoints: 65,
  creditedOptionIds: [],
  rewardHistory: [
    {
      id: 'init-noon',
      title: 'Sạc khung trưa nắng 12:15 tại Metropolis',
      points: 45,
      time: 'Hôm qua',
    },
    {
      id: 'init-offpeak',
      title: 'Sạc trạm vắng tại Vincom Bà Triệu',
      points: 20,
      time: '3 ngày trước',
    },
  ],
  voiceDrawerTrigger: 0,
  batteryConfirmedAt: null,
  pendingPrompt: null,

  gpsStatus: 'idle',
  locationLabel: 'Đang định vị...',

  isDemoActive: false,
  isDemoPlaying: false,
  demoStepIndex: 0,

  setUserOrigin: (place, displayLabel) => {
    const nextInput = { ...get().journeyInput, origin: place };
    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    set({
      journeyInput: nextInput,
      ...computed,
      locationLabel: displayLabel || `${place.shortName} · Hà Nội`,
      gpsStatus: 'ready',
    });
  },

  refreshUserLocation: async () => {
    if (get().gpsStatus === 'loading') return;
    set({ gpsStatus: 'loading', locationLabel: 'Đang lấy GPS...' });
    const outcome = await fetchCurrentUserLocation();
    if (outcome.status === 'ready' && outcome.place) {
      get().setUserOrigin(outcome.place, outcome.displayLabel);
      return;
    }
    set({
      gpsStatus: outcome.status === 'denied' ? 'denied' : 'error',
      locationLabel:
        outcome.status === 'denied' ? 'Hà Nội (chưa bật GPS)' : 'Hà Nội (Vị trí mặc định)',
    });
  },

  setVehicleId: (id) => {
    const nextInput = { ...get().journeyInput, vehicleId: id };
    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    set({
      vehicleId: id,
      journeyInput: nextInput,
      ...computed,
      selectedStationId: computed.recommendation.recommended?.station.id ?? get().selectedStationId,
    });
  },

  setBatteryPct: (pct) => {
    const clamped = Math.max(5, Math.min(100, Math.round(pct)));
    const nextInput = { ...get().journeyInput, batteryPct: clamped };
    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    set({
      journeyInput: nextInput,
      ...computed,
    });
  },

  confirmBatteryPct: (pct) => {
    get().setBatteryPct(pct);
    set({ batteryConfirmedAt: Date.now() });
  },

  queuePrompt: (prompt) => {
    const trimmed = prompt.trim();
    if (trimmed) set({ pendingPrompt: trimmed });
  },

  consumePendingPrompt: () => {
    const p = get().pendingPrompt;
    if (p !== null) set({ pendingPrompt: null });
    return p;
  },

  setArrivalDeadline: (hhmm) => {
    const nextInput = { ...get().journeyInput, arrivalDeadline: hhmm };
    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    set({
      journeyInput: nextInput,
      ...computed,
    });
  },

  shiftArrivalDeadline: (deltaMin) => {
    const currentMin = timeToMinutes(get().journeyInput.arrivalDeadline);
    const updated = minutesToTime(currentMin + deltaMin);
    get().setArrivalDeadline(updated);
  },

  setPreference: (pref) => {
    const nextInput = { ...get().journeyInput, preference: pref };
    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    set({
      journeyInput: nextInput,
      ...computed,
      selectedStationId: computed.recommendation.recommended?.station.id ?? get().selectedStationId,
    });
  },

  setHasNextDestination: (enabled) => {
    const nextInput = {
      ...get().journeyInput,
      nextDestination: enabled ? HANOI_PLACES.noiBai : null,
    };
    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    set({
      journeyInput: nextInput,
      ...computed,
    });
  },

  applyNaturalLanguagePrompt: (prompt) => {
    const patch = parseVietnameseJourneyPrompt(prompt, get().journeyInput);
    const nextInput = { ...get().journeyInput, ...patch };
    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    set({
      vehicleId: nextInput.vehicleId,
      journeyInput: nextInput,
      ...computed,
      selectedStationId: computed.recommendation.recommended?.station.id ?? get().selectedStationId,
    });
  },

  analyzeNaturalPrompt: (prompt) => {
    const parsed = parseAndValidateNaturalRequest(prompt);
    if (!parsed.isComplete) {
      set({
        parsedRequest: parsed,
        proposedOptions: [],
        activeOptionIndex: 0,
        itineraryStatus: 'none',
      });
      return parsed;
    }

    const nextBattery = parsed.batteryPct ?? get().journeyInput.batteryPct;
    const nextInput: JourneyInput = {
      ...get().journeyInput,
      rawPrompt: prompt,
      batteryPct: nextBattery,
      arrivalDeadline: parsed.timeText ?? get().journeyInput.arrivalDeadline,
      nextDestination: parsed.nextDestinationName ? HANOI_PLACES.noiBai : null,
    };

    const computed = recompute(nextInput, get().weather, get().activeScenarios, get().selectedStationId);
    const options = generateItineraryOptionsForRequest({
      parsed,
      hanoiResult: computed.recommendation,
      vehicleId: get().vehicleId,
      weather: computed.effectiveWeather,
      originShortName: nextInput.origin.shortName,
    });

    set({
      journeyInput: nextInput,
      ...computed,
      parsedRequest: parsed,
      proposedOptions: options,
      activeOptionIndex: 0,
      itineraryStatus: options.length > 0 ? 'pending' : 'none',
      selectedStationId:
        options[0]?.hanoiStationId ??
        computed.recommendation.recommended?.station.id ??
        get().selectedStationId,
    });

    return parsed;
  },

  setApiBaseUrl: (url) =>
    set({
      apiBaseUrl: normalizeBaseUrl(url),
      apiStatus: 'idle',
      apiError: null,
    }),

  setDriverName: (name) =>
    set({
      driverName: name.trim() || 'Tài xế ChargePilot',
    }),

  checkServerHealth: async () => {
    const baseUrl = normalizeBaseUrl(get().apiBaseUrl);
    if (!baseUrl) {
      set({ apiStatus: 'offline', apiError: 'Chưa nhập địa chỉ máy chủ VPS.' });
      return false;
    }
    set({ apiStatus: 'checking', apiError: null });
    try {
      const health = await checkApiHealth(baseUrl);
      set({
        apiBaseUrl: baseUrl,
        apiStatus: 'online',
        apiModelName: health.model_name || health.model || health.model_provider,
        apiError: null,
      });
      void get().refreshLeaderboard();
      void get().refreshLiveWeather();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không kết nối được máy chủ.';
      set({ apiStatus: 'offline', apiError: msg });
      return false;
    }
  },

  refreshLiveWeather: async () => {
    try {
      const w = await fetchLiveWeather(get().apiBaseUrl);
      if (w.ok && w.temp_c !== null) {
        const nextWeather = buildWeatherConditionFromApi({
          tempC: w.temp_c,
          rainPct: w.rain_pct,
          drainFactor: w.drain_factor,
          solarWm2: w.solar_wm2,
        });
        const computed = recompute(
          get().journeyInput,
          nextWeather,
          get().activeScenarios,
          get().selectedStationId
        );
        set({ weather: nextWeather, ...computed });
      }
    } catch {
      // Keep current weather when server is offline
    }
  },

  refreshLeaderboard: async () => {
    try {
      const res = await fetchGreenLeaderboard(get().apiBaseUrl);
      set({ leaderboard: res.leaderboard || [] });
    } catch {
      // Keep existing leaderboard cache when server is temporarily unreachable
    }
  },

  sendPromptToApi: async (prompt) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const {
      apiBaseUrl,
      apiSessionId,
      vehicleId,
      effectiveInput,
      weather,
      activeScenarios,
      selectedStationId,
    } = get();

    set({ apiLoading: true, apiError: null });

    const [originLon, originLat] = effectiveInput.origin.coordinates;
    const defaultVehicle = vehicleId === 'vinfast_evo200' ? 'VinFast Evo200' : 'VF e34';

    // Reuse a recent battery report for charging and trip requests or related follow-ups.
    const mentionsPct = PCT_IN_TEXT_RE.test(trimmed);
    const messageToSend =
      isBatteryFresh(get().batteryConfirmedAt) &&
      shouldAttachBatteryToPrompt(trimmed, get().lastApiResponse?.intent_state)
        ? `${trimmed.replace(/[.\s]+$/, '')}. Pin còn ${get().journeyInput.batteryPct}%.`
        : trimmed;

    try {
      const resp = await sendConverseMessage(apiBaseUrl, {
        message: messageToSend,
        session_id: apiSessionId,
        device_context: {
          lat: originLat,
          lon: originLon,
          default_vehicle: defaultVehicle,
          local_time: formatLocalTimeHHMM(),
          weekday: getApiWeekday(),
        },
      });

      const nextVehicleId: VehicleId =
        resp.vehicle?.vehicle_type === 'xe_may'
          ? 'vinfast_evo200'
          : resp.vehicle?.model
            ? 'vfe34'
            : vehicleId;
      const nextBattery =
        resp.battery?.current_pct !== null && resp.battery?.current_pct !== undefined
          ? Math.max(5, Math.min(100, Math.round(resp.battery.current_pct)))
          : get().journeyInput.batteryPct;

      const nextOrigin: PlacePoint =
        resp.origin &&
        typeof resp.origin.lat === 'number' &&
        typeof resp.origin.lon === 'number'
          ? {
              id: `api_origin_${resp.origin.lat.toFixed(4)}_${resp.origin.lon.toFixed(4)}`,
              name: resp.origin.name,
              shortName: resp.origin.name,
              coordinates: [resp.origin.lon, resp.origin.lat],
            }
          : get().journeyInput.origin;

      const nextInput: JourneyInput = {
        ...get().journeyInput,
        rawPrompt: trimmed,
        origin: nextOrigin,
        vehicleId: nextVehicleId,
        batteryPct: nextBattery,
      };
      const nextWeather =
        resp.weather && resp.weather.temp_used_c !== null
          ? buildWeatherConditionFromApi({
              tempC: resp.weather.temp_used_c,
              drainFactor: resp.weather.drain_factor,
              solarWm2: resp.weather.solar_wm2,
            })
          : weather;
      const computed = recompute(nextInput, nextWeather, activeScenarios, selectedStationId);
      const apiChargingStations = mapApiStationsToChargingStations(resp);
      const mergedStations = mergeApiStationsIntoList(
        computed.effectiveStations,
        apiChargingStations
      );
      const options = mapApiResponseToProposedOptions(
        resp,
        nextVehicleId,
        effectiveInput.origin.shortName
      );

      set({
        vehicleId: nextVehicleId,
        journeyInput: nextInput,
        weather: nextWeather,
        ...computed,
        effectiveStations: mergedStations,
        apiStatus: 'online',
        apiSourceMode: 'live',
        apiModelName: resp.guardrails?.model || get().apiModelName,
        lastApiResponse: resp,
        // The driver typed a % themselves: treat it as a fresh report.
        ...(mentionsPct && resp.battery?.current_pct !== null && resp.battery?.current_pct !== undefined
          ? { batteryConfirmedAt: Date.now() }
          : {}),
        apiSessionId: resp.session_id || apiSessionId,
        apiLoading: false,
        apiError: null,
        parsedRequest: null,
        proposedOptions: options,
        activeOptionIndex: 0,
        itineraryStatus: options.length > 0 ? 'pending' : 'none',
        selectedStationId:
          options[0]?.hanoiStationId ??
          apiChargingStations[0]?.id ??
          computed.recommendation.recommended?.station.id ??
          selectedStationId,
      });

      // Refine proposed option distances & drive times using real live OSRM road routing (matches Google Maps)
      if (options.length > 0) {
        const originCoord = nextOrigin.coordinates;
        const reqSession = resp.session_id || apiSessionId;
        void Promise.all(
          options.map(async (opt) => {
            if (opt.stationLat == null || opt.stationLon == null) return opt;
            try {
              const route = await fetchLiveOsrmRoute({
                fromId: nextOrigin.id || 'gps_origin',
                toId: opt.apiStationId || opt.hanoiStationId || opt.id,
                originCoord,
                destCoord: [opt.stationLon, opt.stationLat],
                destinationName: opt.stationName,
              });
              const realKm = Number((route.distanceMeters / 1000).toFixed(1));
              const realMin = Math.max(2, Math.round(route.durationSeconds / 60));
              return {
                ...opt,
                distanceKm: realKm,
                driveMin: realMin,
                timeline: opt.timeline.map((st) =>
                  st.type === 'driving'
                    ? { ...st, time: `+${realMin}p`, durationMin: realMin }
                    : st
                ),
              };
            } catch {
              return opt;
            }
          })
        ).then((refined) => {
          const cur = get();
          if (cur.apiSessionId === reqSession && cur.lastApiResponse === resp) {
            set({ proposedOptions: refined });
          }
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể kết nối máy chủ CHARGEPILOT.';
      set({
        apiStatus: 'offline',
        apiSourceMode: 'offline_fallback',
        apiError: msg,
        apiLoading: false,
        lastApiResponse: null,
      });
      get().analyzeNaturalPrompt(trimmed);
    }
  },

  confirmGreenToken: async (token, label) => {
    const trimmedToken = token.trim();
    if (!trimmedToken) return false;
    if (get().confirmedTokens.includes(trimmedToken)) {
      return true;
    }

    try {
      const res = await confirmGreenScore(get().apiBaseUrl, {
        confirm_token: trimmedToken,
        user_name: get().driverName,
      });
      set((s) => ({
        greenPoints: s.greenPoints + res.points_added,
        confirmedTokens: [...s.confirmedTokens, trimmedToken],
        rewardHistory: [
          {
            id: trimmedToken,
            title: label ? `Green Score · ${label}` : 'Xác nhận sạc xanh (Server)',
            points: res.points_added,
            time: 'Vừa xác nhận',
          },
          ...s.rewardHistory,
        ],
      }));
      void get().refreshLeaderboard();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không xác nhận được điểm Green Score.';
      set({ apiError: msg });
      return false;
    }
  },

  resetApiSession: async () => {
    const { apiBaseUrl, apiSessionId } = get();
    try {
      await resetChatSession(apiBaseUrl, apiSessionId);
    } catch {
      // Clear local session cleanly even if server is offline
    }
    set({
      apiSessionId: generateSessionId(),
      lastApiResponse: null,
      parsedRequest: null,
      proposedOptions: [],
      activeOptionIndex: 0,
      itineraryStatus: 'none',
      apiError: null,
    });
  },

  acceptProposedItinerary: (confirmReward = true) => {
    const { proposedOptions, activeOptionIndex, selectedStationId } = get();
    const active = proposedOptions[activeOptionIndex];
    if (!active) return;
    set({
      itineraryStatus: 'accepted',
      selectedStationId: active.hanoiStationId ?? active.apiStationId ?? selectedStationId,
    });
    if (confirmReward) void get().confirmAcceptedItineraryReward();
  },

  confirmAcceptedItineraryReward: async () => {
    const {
      proposedOptions, activeOptionIndex, itineraryStatus, greenPoints, creditedOptionIds, rewardHistory,
    } = get();
    const active = proposedOptions[activeOptionIndex];
    if (itineraryStatus !== 'accepted' || !active || active.reward.points <= 0) return false;
    if (active.isLiveApi) {
      return active.confirmToken ? get().confirmGreenToken(active.confirmToken, active.stationName) : false;
    }
    if (creditedOptionIds.includes(active.id)) return true;
    set({
      greenPoints: greenPoints + active.reward.points,
      creditedOptionIds: [...creditedOptionIds, active.id],
      rewardHistory: [
        {
          id: active.id,
          title: `${active.reward.label} · ${active.stationName}`,
          points: active.reward.points,
          time: 'Vừa nhận',
        },
        ...rewardHistory,
      ],
    });
    return true;
  },

  declineProposedItinerary: () => {
    set({
      itineraryStatus: 'declined',
    });
  },

  requestAlternativeOption: (index) => {
    const { proposedOptions, activeOptionIndex, selectedStationId } = get();
    if (proposedOptions.length === 0) return;
    const nextIdx = index ?? (activeOptionIndex + 1) % proposedOptions.length;
    const nextOpt = proposedOptions[nextIdx];
    if (!nextOpt || nextIdx === activeOptionIndex) return;
    set({
      activeOptionIndex: nextIdx,
      itineraryStatus: 'pending',
      selectedStationId: nextOpt.hanoiStationId ?? nextOpt.apiStationId ?? selectedStationId,
    });
  },

  triggerVoiceAssistant: () =>
    set((s) => ({ voiceDrawerTrigger: s.voiceDrawerTrigger + 1 })),

  selectStation: (stationId) => set({ selectedStationId: stationId }),

  toggleScenario: (scenarioId) => {
    const prev = get().activeScenarios;
    const next = prev.includes(scenarioId)
      ? prev.filter((id) => id !== scenarioId)
      : [...prev, scenarioId];
    const computed = recompute(get().journeyInput, get().weather, next, get().selectedStationId);
    set({
      activeScenarios: next,
      ...computed,
      selectedStationId: computed.recommendation.recommended?.station.id ?? get().selectedStationId,
    });
  },

  clearScenarios: () => {
    const computed = recompute(get().journeyInput, get().weather, [], get().selectedStationId);
    set({
      activeScenarios: [],
      ...computed,
      selectedStationId: computed.recommendation.recommended?.station.id ?? 'metropolis',
    });
  },

  setScenarios: (scenarios) => {
    const computed = recompute(get().journeyInput, get().weather, scenarios, get().selectedStationId);
    set({
      activeScenarios: scenarios,
      ...computed,
      selectedStationId: computed.recommendation.recommended?.station.id ?? get().selectedStationId,
    });
  },

  toggleMapStyle: () =>
    set((s) => ({ mapStyleMode: s.mapStyleMode === 'dark' ? 'light' : 'dark' })),

  toggle3DBuildings: () => set((s) => ({ is3DBuildings: !s.is3DBuildings })),

  setWeatherCondition: (weatherId) => {
    const nextWeather = HANOI_WEATHER_STATES[weatherId];
    const computed = recompute(
      get().journeyInput,
      nextWeather,
      get().activeScenarios,
      get().selectedStationId
    );
    set({
      weather: nextWeather,
      ...computed,
    });
  },

  startDemo: () => {
    const computed = recompute(DEFAULT_INPUT, DEFAULT_WEATHER, [], 'metropolis');
    set({
      vehicleId: DEFAULT_INPUT.vehicleId,
      journeyInput: DEFAULT_INPUT,
      weather: DEFAULT_WEATHER,
      activeScenarios: [],
      ...computed,
      selectedStationId: 'metropolis',
      isDemoActive: true,
      isDemoPlaying: true,
      demoStepIndex: 0,
    });
  },

  stopDemo: () => set({ isDemoActive: false, isDemoPlaying: false }),

  toggleDemoPlay: () => set((s) => ({ isDemoPlaying: !s.isDemoPlaying })),

  setDemoStep: (index) => {
    const clamped = Math.max(0, Math.min(DEMO_SEQUENCE.length - 1, index));
    const step = DEMO_SEQUENCE[clamped];
    let scenarios: WhatIfScenarioId[] = [];
    if (step.stepNumber >= 10) {
      scenarios = ['station_maintenance'];
    }
    const computed = recompute(DEFAULT_INPUT, DEFAULT_WEATHER, scenarios, 'metropolis');
    set({
      vehicleId: DEFAULT_INPUT.vehicleId,
      journeyInput: DEFAULT_INPUT,
      weather: DEFAULT_WEATHER,
      activeScenarios: scenarios,
      ...computed,
      selectedStationId: computed.recommendation.recommended?.station.id ?? 'ba-trieu',
      demoStepIndex: clamped,
    });
  },

  nextDemoStep: () => {
    const { demoStepIndex } = get();
    if (demoStepIndex < DEMO_SEQUENCE.length - 1) {
      get().setDemoStep(demoStepIndex + 1);
    } else {
      set({ isDemoPlaying: false });
    }
  },

  restartDemo: () => get().startDemo(),
}));
