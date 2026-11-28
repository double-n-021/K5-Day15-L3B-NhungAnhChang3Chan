import type { ImageSource } from 'expo-image';

export type VehicleId = 'vfe34' | 'vinfast_evo200';

export type VehicleCategory = 'car' | 'motorbike';

export interface VehicleAngleAsset {
  id: 'front34' | 'rear34';
  label: string;
  source: ImageSource | number;
}

export interface Vehicle {
  id: VehicleId;
  category: VehicleCategory;
  name: string;
  brand: string;
  segment: string;
  paintName: string;
  usableBatteryKwh: number;
  wltpRangeKm: number;
  baseConsumptionKwhPer100Km: number;
  maxDcPowerKw: number;
  supportsBatterySwap?: boolean;
  connectorType: 'CCS2' | 'Pin LFP / AC 220V';
  fastChargeNote: string;
  angles: VehicleAngleAsset[];
}

export type StationStatus = 'available' | 'busy' | 'maintenance' | 'unknown';
export type BayStatus = 'available' | 'occupied' | 'maintenance' | 'unknown';

export interface ChargingBay {
  id: string;
  code: string;
  connector: 'CCS2 DC' | 'Type 2 AC';
  powerKw: number;
  status: BayStatus;
  occupiedSinceMin?: number;
  estimatedFreeInMin?: number;
}

export interface ChargingStation {
  id: string;
  name: string;
  shortName: string;
  operator: 'V-Green / VinFast';
  address: string;
  district: string;
  coordinates: [number, number]; // [lng, lat]
  coordinateSource: string;
  isTelemetrySimulated: true;
  status: StationStatus;
  statusNote: string;
  availableBays: number;
  totalBays: number;
  queueCount: number;
  estimatedWaitMin: number;
  maxPowerKw: number;
  pricePerKwhVnd: number;
  parkingNote: string;
  bayLocationNote: string;
  supportsMotorbike?: boolean;
  supportsBatterySwap?: boolean;
  bays: ChargingBay[];
}

export interface ManeuverStep {
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  location: [number, number];
  maneuverType: string;
  modifier: string;
}

export interface RouteGeometry {
  id: string;
  fromId: string;
  toId: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
  steps: ManeuverStep[];
}

export type WeatherConditionId = 'overcast_cool' | 'cold_rain' | 'mild_sun' | 'heavy_rain';

export interface WeatherCondition {
  id: WeatherConditionId;
  city: string;
  temperatureC: number;
  conditionLabel: string;
  windLabel: string;
  humidityPct: number;
  iconKey: 'partly-cloudy-day' | 'rain' | 'overcast' | 'clear-day' | 'thermometer-colder' | 'drizzle';
  consumptionImpactPct: number;
  impactExplanation: string;
}

export type ChargingPreference = 'balanced' | 'fastest_time' | 'lowest_wait' | 'lowest_cost';

export interface PlacePoint {
  id: string;
  name: string;
  shortName: string;
  address: string;
  coordinates: [number, number];
}

export interface JourneyInput {
  rawPrompt: string;
  vehicleId: VehicleId;
  batteryPct: number;
  origin: PlacePoint;
  primaryDestination: PlacePoint;
  arrivalDeadline: string; // "HH:MM"
  nextDestination: PlacePoint | null;
  nextDepartureTime: string; // "HH:MM"
  departureTime: string; // "HH:MM"
  preference: ChargingPreference;
}

export interface StationEvaluation {
  station: ChargingStation;
  routeToStation: RouteGeometry | null;
  routeToPrimary: RouteGeometry | null;
  distanceToStationKm: number;
  distanceToPrimaryKm: number;
  driveToStationMin: number;
  waitMin: number;
  chargeMin: number;
  driveToPrimaryMin: number;
  arrivalBatteryPct: number;
  targetDepartureBatteryPct: number;
  primaryArrivalBatteryPct: number;
  nextArrivalBatteryPct: number;
  estimatedCostVnd: number;
  estimatedArrivalTime: string;
  scheduleSlackMin: number; // positive = early, negative = late
  score: number;
  safetyChecks: {
    reachableWithBuffer: boolean;
    stationOperational: boolean;
    enoughForNextLeg: boolean;
    meetsDeadline: boolean;
  };
  highlightReason: string;
}

export interface RejectedStation {
  station: ChargingStation;
  reasonTitle: string;
  reasonDetail: string;
  category: 'maintenance' | 'unreachable' | 'unknown_risk' | 'severe_delay';
}

export type JourneyStageType = 'departure' | 'driving' | 'waiting' | 'charging' | 'appointment' | 'destination';

export interface JourneyStage {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  type: JourneyStageType;
  batteryPct: number;
  durationMin?: number;
  status: 'safe' | 'warning' | 'critical';
}

export interface RecommendationResult {
  hasSafeRoute: boolean;
  recommended: StationEvaluation | null;
  alternatives: StationEvaluation[];
  rejected: RejectedStation[];
  whyBetterThanNearest: string;
  criticalAlertTitle?: string;
  criticalAlertMessage?: string;
  timeline: JourneyStage[];
  summary: {
    totalTripDistanceKm: number;
    effectiveConsumptionKwhPer100Km: number;
    estimatedRangeKm: number;
    targetArrivePrimaryTime: string;
    targetArriveNextTime: string;
  };
}

export type WhatIfScenarioId =
  | 'station_maintenance'
  | 'queue_surge'
  | 'cold_weather'
  | 'critical_battery'
  | 'heavy_traffic'
  | 'schedule_shifted';

export interface WhatIfScenarioMeta {
  id: WhatIfScenarioId;
  title: string;
  subtitle: string;
  severity: 'warning' | 'critical';
  impactTag: string;
}

export interface DemoStep {
  stepNumber: number;
  title: string;
  narrative: string;
  targetRoute: string;
  actionTag: string;
}

export type MissingInfoField = 'destination' | 'battery' | 'time';

export interface ParsedNaturalRequest {
  rawText: string;
  destinationName: string | null;
  destinationScope: 'hanoi' | 'intercity' | null;
  hanoiPlaceId?: string;
  nextDestinationName?: string | null;
  batteryPct: number | null;
  timeText: string | null;
  missingFields: MissingInfoField[];
  isComplete: boolean;
}

export type ItineraryDecisionStatus = 'none' | 'pending' | 'accepted' | 'declined';

export type MascotMood = 'idle' | 'listening' | 'thinking' | 'happy' | 'warning';

export interface OffPeakReward {
  points: number;
  label: string;
  reason: string;
  isSolarNoon: boolean;
  discountVnd: number;
}

export interface ProposedItineraryOption {
  id: string;
  optionIndex: number;
  totalOptions: number;
  strategyLabel: string;
  destinationName: string;
  stationName: string;
  stationAddress: string;
  distanceKm: number;
  driveMin: number;
  waitMin: number;
  chargeMin: number;
  arrivalBatteryPct: number;
  departureBatteryPct: number;
  estimatedCostVnd: number;
  etaText: string;
  scheduleNote: string;
  whyThisOption: string;
  mascotSpeech: string;
  reward: OffPeakReward;
  isIntercitySimulated: boolean;
  hanoiStationId?: string;
  apiStationId?: string;
  stationLat?: number | null;
  stationLon?: number | null;
  statusLabel?: string;
  chargeWindowText?: string;
  confirmToken?: string | null;
  isLiveApi?: boolean;
  fullReplyText?: string;
  timeline: JourneyStage[];
}

export type ApiIntentState =
  | 'recommendation'
  | 'rescue'
  | 'home_charging'
  | 'ask_back'
  | 'refusal'
  | 'chat'
  | 'partial_prompt';

export type ApiConverseAction = 'chat' | 'partial_prompt' | 'handoff';

export interface ApiFrontDoorSlots {
  vehicle: {
    model: string | null;
    vehicle_type: 'o_to' | 'xe_may';
    known: boolean;
  } | null;
  current_pct: number | null;
  target_pct: number | null;
  origin: string | null;
  place_phrase: string | null;
  destination: string | null;
  now_h: string | null;
  next_h: string | null;
  next_day: boolean;
  weekday: string | null;
  user_temp_c: number | null;
}

export type ApiConnectionStatus = 'idle' | 'checking' | 'online' | 'offline';

export interface ApiStationItem {
  rank: number;
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  address: string | null;
  road_km: number;
  power_kw: number | null;
  status: 'available' | 'crowded' | 'maintenance' | 'unverified' | null;
  status_label: string;
  pricing_model: string | null;
  has_roof: boolean;
  range_verified: boolean;
}

export interface ApiChargeWindow {
  window: string;
  duration_min: number;
  reason: string;
}

export interface ApiGreenReward {
  eligible: boolean;
  points: number;
  reasons: string[];
  requires_user_confirmation: boolean;
  confirm_token: string | null;
}

export interface ApiGuardrails {
  passed: boolean;
  fallback_used: boolean;
  excluded_note: string | null;
  model: string;
  model_calls: number;
  tool_calls: number;
  tokens_in: number;
  tokens_out: number;
  latency_s: number;
}

export interface ApiMeta {
  models: string[];
  model_calls: number;
  tool_calls: number;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
}

export interface ApiHealthResponse {
  ok: boolean;
  status: string;
  service: string;
  contract_version: string;
  model_provider: string;
  model: string;
  model_name: string;
  apk_available: boolean;
  apk_meta: Record<string, unknown>;
}

export interface ApiDeviceContext {
  lat?: number;
  lon?: number;
  default_vehicle?: string;
  local_time?: string;
  weekday?: number;
}

export interface ApiChatRequest {
  message?: string;
  text?: string;
  session_id?: string;
  device_context?: ApiDeviceContext;
}

export interface ApiMappoStrategy {
  engine: string;
  strategy: 'SKIP' | 'TOPUP' | 'FULL';
  strategy_vi: string;
  recommended_station_id: string | null;
  confidence: number | null;
  guardrail_l2_ok: boolean;
}

export interface ApiChatResponse {
  ok: boolean;
  contract_version: string;
  session_id: string;
  action?: ApiConverseAction;
  handoff_reason?: string | null;
  intro?: string | null;
  agent_output?: string | null;
  handoff_query?: string | null;
  slots?: ApiFrontDoorSlots | null;
  query: string;
  intent_state: ApiIntentState;
  output: string;
  reply: string;
  reply_text: string;
  tts_summary: string;
  vehicle: {
    model: string | null;
    vehicle_type: 'o_to' | 'xe_may';
    known: boolean;
  };
  origin?: {
    name: string;
    lat: number;
    lon: number;
    via?: string;
  } | null;
  battery: {
    current_pct: number | null;
    target_pct: number | null;
    safe_range_km: number | null;
    rescue_mode: boolean;
  };
  weather: {
    temp_used_c: number | null;
    drain_factor: number;
    solar_wm2: number | null;
    solar_best_window: string | null;
  };
  stations: ApiStationItem[];
  charge_window: ApiChargeWindow | null;
  mappo_strategy?: ApiMappoStrategy | null;
  green_reward: ApiGreenReward;
  follow_up_questions: string[];
  guardrails: ApiGuardrails;
  meta: ApiMeta;
}

export interface ApiSessionResetResponse {
  ok: boolean;
  session_id: string;
  cleared: boolean;
}

export interface ApiGreenConfirmRequest {
  confirm_token: string;
  user_name?: string;
}

export interface ApiGreenConfirmResponse {
  ok: boolean;
  points_added: number;
  total_points: number;
  green_sessions: number;
  user_name: string;
}

export interface ApiLeaderboardEntry {
  rank: number;
  user_name: string;
  total_points: number;
  green_sessions: number;
}

export interface ApiLeaderboardResponse {
  ok: boolean;
  leaderboard: ApiLeaderboardEntry[];
}
