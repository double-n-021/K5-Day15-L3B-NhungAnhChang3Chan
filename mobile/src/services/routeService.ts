import routesArchive from '../../assets/routes/hanoi-routes.json';
import type { RouteGeometry } from '@/types';

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
