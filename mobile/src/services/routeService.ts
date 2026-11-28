import routesArchive from '../../assets/routes/hanoi-routes.json';
import type { ManeuverStep, RouteGeometry } from '@/types';

interface RouteArchiveShape {
  generatedAt: string;
  source: string;
  routes: Record<string, RouteGeometry>;
}

const ARCHIVE = routesArchive as unknown as RouteArchiveShape;

export function getCachedRoute(fromId: string, toId: string): RouteGeometry | null {
  return ARCHIVE.routes[`${fromId}__${toId}`] ?? null;
}

export function getAllCachedRoutes(): Record<string, RouteGeometry> {
  return ARCHIVE.routes;
}

export function haversineDistanceMeters(
  a: [number, number],
  b: [number, number]
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function computeBearingDegrees(
  from: [number, number],
  to: [number, number]
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from[1]);
  const lat2 = toRad(to[1]);
  const dLng = toRad(to[0] - from[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface RouteInterpolation {
  coordinate: [number, number];
  bearing: number;
  coveredMeters: number;
  remainingMeters: number;
  currentStepIndex: number;
}

export function interpolateAlongRoute(
  route: RouteGeometry,
  progress: number
): RouteInterpolation {
  const coords = route.coordinates;
  if (!coords.length) {
    return {
      coordinate: [105.8143, 21.0169],
      bearing: 0,
      coveredMeters: 0,
      remainingMeters: route.distanceMeters,
      currentStepIndex: 0,
    };
  }
  if (coords.length === 1 || progress <= 0) {
    const nextPt = coords[1] ?? coords[0];
    return {
      coordinate: coords[0],
      bearing: computeBearingDegrees(coords[0], nextPt),
      coveredMeters: 0,
      remainingMeters: route.distanceMeters,
      currentStepIndex: 0,
    };
  }
  if (progress >= 1) {
    const prevPt = coords[coords.length - 2];
    const lastPt = coords[coords.length - 1];
    return {
      coordinate: lastPt,
      bearing: computeBearingDegrees(prevPt, lastPt),
      coveredMeters: route.distanceMeters,
      remainingMeters: 0,
      currentStepIndex: Math.max(0, route.steps.length - 1),
    };
  }

  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversineDistanceMeters(coords[i], coords[i + 1]);
    segLengths.push(d);
    totalLen += d;
  }

  const targetDist = totalLen * progress;
  let accum = 0;
  let coord: [number, number] = coords[0];
  let bearing = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (accum + len >= targetDist || i === segLengths.length - 1) {
      const localRatio = len > 0 ? Math.max(0, Math.min(1, (targetDist - accum) / len)) : 0;
      const a = coords[i];
      const b = coords[i + 1];
      coord = [a[0] + (b[0] - a[0]) * localRatio, a[1] + (b[1] - a[1]) * localRatio];
      bearing = computeBearingDegrees(a, b);
      break;
    }
    accum += len;
  }

  const coveredMeters = Math.round(route.distanceMeters * progress);
  const remainingMeters = Math.max(0, route.distanceMeters - coveredMeters);

  // Match maneuver step based on cumulative step distance
  let stepAccum = 0;
  let currentStepIndex = 0;
  for (let i = 0; i < route.steps.length; i++) {
    stepAccum += route.steps[i].distanceMeters;
    if (coveredMeters <= stepAccum) {
      currentStepIndex = i;
      break;
    }
    currentStepIndex = i;
  }

  return {
    coordinate: coord,
    bearing,
    coveredMeters,
    remainingMeters,
    currentStepIndex,
  };
}

const LIVE_ROUTE_CACHE = new Map<string, RouteGeometry>();

function translateOsrmManeuver(step: any, index: number): ManeuverStep {
  const type = String(step?.maneuver?.type ?? 'continue');
  const modifier = step?.maneuver?.modifier ? String(step.maneuver.modifier) : '';
  const streetName = typeof step?.name === 'string' && step.name.trim() ? step.name.trim() : 'đường phía trước';
  const loc = Array.isArray(step?.maneuver?.location) && step.maneuver.location.length >= 2
    ? ([Number(step.maneuver.location[0]), Number(step.maneuver.location[1])] as [number, number])
    : ([105.82, 21.02] as [number, number]);

  const dirMap: Record<string, string> = {
    left: 'Rẽ trái',
    right: 'Rẽ phải',
    'slight left': 'Chếch sang trái',
    'slight right': 'Chếch sang phải',
    'sharp left': 'Rẽ ngoặt trái',
    'sharp right': 'Rẽ ngoặt phải',
    uturn: 'Quay đầu',
    straight: 'Đi thẳng',
  };

  let instruction = `Tiếp tục theo ${streetName}`;
  if (type === 'depart' || index === 0) {
    instruction = `Xuất phát theo ${streetName}`;
  } else if (type === 'arrive') {
    instruction = 'Đã đến trạm sạc mục tiêu';
  } else if (type === 'roundabout' || type === 'rotary') {
    instruction = `Vào vòng xuyến, đi tiếp ra ${streetName}`;
  } else if (modifier && dirMap[modifier]) {
    instruction = `${dirMap[modifier]} vào ${streetName}`;
  } else if (type === 'fork' || type === 'merge') {
    instruction = `Nhập làn theo hướng ${streetName}`;
  }

  return {
    instruction,
    streetName,
    distanceMeters: Math.max(0, Math.round(Number(step?.distance ?? 0))),
    durationSeconds: Math.max(0, Math.round(Number(step?.duration ?? 0))),
    location: loc,
    maneuverType: type,
    modifier,
  };
}

/** Builds a smooth multi-point fallback route immediately without waiting on network. */
export function buildDirectRoute(
  fromId: string,
  toId: string,
  originCoord: [number, number],
  destCoord: [number, number],
  destinationName?: string,
): RouteGeometry {
  const segments = 24;
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    coordinates.push([
      originCoord[0] + (destCoord[0] - originCoord[0]) * t,
      originCoord[1] + (destCoord[1] - originCoord[1]) * t,
    ]);
  }
  const straightMeters = haversineDistanceMeters(originCoord, destCoord);
  // Apply Hanoi urban road-winding factor (1.35x) so offline fallback matches real roads much closer than straight-line distance
  const distanceMeters = Math.max(50, Math.round(straightMeters * 1.35));
  const durationSeconds = Math.max(60, Math.round(distanceMeters / 7.2));
  const label = destinationName?.trim() || 'trạm sạc mục tiêu';

  return {
    id: `direct__${fromId}__${toId}`,
    fromId,
    toId,
    distanceMeters,
    durationSeconds,
    coordinates,
    steps: [
      {
        instruction: `Đi thẳng hướng về ${label}`,
        streetName: label,
        distanceMeters,
        durationSeconds,
        location: originCoord,
        maneuverType: 'depart',
        modifier: 'straight',
      },
      {
        instruction: `Đến ${label}`,
        streetName: label,
        distanceMeters: 0,
        durationSeconds: 0,
        location: destCoord,
        maneuverType: 'arrive',
        modifier: '',
      },
    ],
  };
}

/** Calibrate free-flow OSRM duration to real Hanoi urban driving time (accounting for traffic lights & congestion). */
export function calibrateHanoiDurationSeconds(distanceMeters: number, rawOsrmSeconds: number): number {
  const now = new Date();
  const wd = now.getDay(); // 0 = Sun
  const h = now.getHours() + now.getMinutes() / 60;
  const isRush = wd !== 0 && ((h >= 7.5 && h < 9.25) || (h >= 17.0 && h < 19.75));
  const avgSpeedMps = isRush ? 17.5 / 3.6 : 24.5 / 3.6;
  const urbanSec = distanceMeters / avgSpeedMps;
  const scaledOsrm = rawOsrmSeconds * (isRush ? 2.3 : 1.95);
  return Math.max(120, Math.round(Math.max(urbanSec, scaledOsrm)));
}

/** Fetches a live turn-by-turn OSRM route, falling back gracefully to buildDirectRoute on timeout/error. */
export async function fetchLiveOsrmRoute(params: {
  fromId: string;
  toId: string;
  originCoord: [number, number];
  destCoord: [number, number];
  destinationName?: string;
}): Promise<RouteGeometry> {
  const { fromId, toId, originCoord, destCoord, destinationName } = params;
  const cached = getCachedRoute(fromId, toId);
  if (cached) return cached;

  const cacheKey = `${fromId}__${toId}__${originCoord[0].toFixed(4)},${originCoord[1].toFixed(4)}__${destCoord[0].toFixed(4)},${destCoord[1].toFixed(4)}`;
  const liveCached = LIVE_ROUTE_CACHE.get(cacheKey);
  if (liveCached) return liveCached;

  const fallback = buildDirectRoute(fromId, toId, originCoord, destCoord, destinationName);
  if (haversineDistanceMeters(originCoord, destCoord) < 25) {
    LIVE_ROUTE_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originCoord[0]},${originCoord[1]};${destCoord[0]},${destCoord[1]}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return fallback;

    const data = await res.json();
    const firstRoute = data?.routes?.[0];
    const coords = firstRoute?.geometry?.coordinates;
    if (data?.code !== 'Ok' || !Array.isArray(coords) || coords.length < 2) {
      return fallback;
    }

    const rawSteps: any[] = Array.isArray(firstRoute?.legs)
      ? firstRoute.legs.flatMap((leg: any) => (Array.isArray(leg?.steps) ? leg.steps : []))
      : [];
    const steps: ManeuverStep[] =
      rawSteps.length > 0
        ? rawSteps.map((st, idx) => translateOsrmManeuver(st, idx))
        : fallback.steps;

    const realDistMeters = Math.max(50, Math.round(Number(firstRoute.distance ?? fallback.distanceMeters)));
    const rawDurSec = Math.max(60, Math.round(Number(firstRoute.duration ?? fallback.durationSeconds)));
    const route: RouteGeometry = {
      id: `osrm__${fromId}__${toId}`,
      fromId,
      toId,
      distanceMeters: realDistMeters,
      durationSeconds: calibrateHanoiDurationSeconds(realDistMeters, rawDurSec),
      coordinates: coords.map((pt: any) => [Number(pt[0]), Number(pt[1])] as [number, number]),
      steps,
    };
    LIVE_ROUTE_CACHE.set(cacheKey, route);
    return route;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}
