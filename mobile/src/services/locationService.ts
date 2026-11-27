import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { PlacePoint } from '@/types';

interface NativeLocationResult {
  lat: number;
  lon: number;
  accuracy?: number;
  subLocality?: string;
  subAdminArea?: string;
  locality?: string;
  adminArea?: string;
  thoroughfare?: string;
  addressLine?: string;
}

interface ChargePilotLocationNativeModule {
  getCurrentPosition(timeoutMs: number): Promise<NativeLocationResult>;
}

const LocationModule = NativeModules.ChargePilotLocation as
  | ChargePilotLocationNativeModule
  | undefined;

export interface UserLocationOutcome {
  status: 'ready' | 'denied' | 'unavailable' | 'error';
  place?: PlacePoint;
  displayLabel?: string;
  error?: string;
}

const HANOI_AREA_CENTERS: {
  id: string;
  shortName: string;
  name: string;
  lat: number;
  lon: number;
}[] = [
  { id: 'gps-hoan-kiem', shortName: 'Hoàn Kiếm', name: 'Hoàn Kiếm, Hà Nội', lat: 21.0285, lon: 105.8542 },
  { id: 'gps-ba-dinh', shortName: 'Ba Đình', name: 'Ba Đình, Hà Nội', lat: 21.0338, lon: 105.8141 },
  { id: 'gps-dong-da', shortName: 'Đống Đa', name: 'Đống Đa, Hà Nội', lat: 21.0181, lon: 105.8299 },
  { id: 'gps-hai-ba-trung', shortName: 'Hai Bà Trưng', name: 'Hai Bà Trưng, Hà Nội', lat: 21.0068, lon: 105.8558 },
  { id: 'gps-cau-giay', shortName: 'Cầu Giấy', name: 'Cầu Giấy, Hà Nội', lat: 21.0362, lon: 105.7906 },
  { id: 'gps-thanh-xuan', shortName: 'Thanh Xuân', name: 'Thanh Xuân, Hà Nội', lat: 20.9939, lon: 105.8135 },
  { id: 'gps-tay-ho', shortName: 'Tây Hồ', name: 'Tây Hồ, Hà Nội', lat: 21.0695, lon: 105.8235 },
  { id: 'gps-hoang-mai', shortName: 'Hoàng Mai', name: 'Hoàng Mai, Hà Nội', lat: 20.9749, lon: 105.8506 },
  { id: 'gps-long-bien', shortName: 'Long Biên', name: 'Long Biên, Hà Nội', lat: 21.0453, lon: 105.8936 },
  { id: 'gps-nam-tu-liem', shortName: 'Nam Từ Liêm', name: 'Nam Từ Liêm, Hà Nội', lat: 21.0124, lon: 105.7595 },
  { id: 'gps-bac-tu-liem', shortName: 'Bắc Từ Liêm', name: 'Bắc Từ Liêm, Hà Nội', lat: 21.0709, lon: 105.7641 },
  { id: 'gps-ha-dong', shortName: 'Hà Đông', name: 'Hà Đông, Hà Nội', lat: 20.9718, lon: 105.7788 },
  { id: 'gps-gia-lam', shortName: 'Gia Lâm', name: 'Gia Lâm, Hà Nội', lat: 21.0138, lon: 105.9395 },
  { id: 'gps-noi-bai', shortName: 'Sóc Sơn · Nội Bài', name: 'Sóc Sơn, Hà Nội', lat: 21.2212, lon: 105.8070 },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, a)));
}

function cleanAdminSegment(val?: string): string {
  if (!val) return '';
  return val
    .replace(/^(Thành phố|Tỉnh|Quận|Huyện|Thị xã|Phường|Xã)\s+/i, '')
    .trim();
}

function buildPlaceFromCoords(nativeLoc: NativeLocationResult): {
  place: PlacePoint;
  displayLabel: string;
} {
  const { lat, lon } = nativeLoc;
  const sub = cleanAdminSegment(nativeLoc.subLocality || nativeLoc.thoroughfare);
  const district = cleanAdminSegment(nativeLoc.subAdminArea || nativeLoc.locality);
  const city = cleanAdminSegment(nativeLoc.adminArea);

  let shortName = district || sub || '';
  let displayLabel = '';

  if (shortName && city && shortName.toLowerCase() !== city.toLowerCase()) {
    displayLabel = `${shortName} · ${city}`;
  } else if (city) {
    shortName = shortName || city;
    displayLabel = city;
  }

  // Fallback to nearest Hanoi district if offline / Geocoder empty
  if (!displayLabel) {
    let nearest = HANOI_AREA_CENTERS[0];
    let bestKm = Infinity;
    for (const item of HANOI_AREA_CENTERS) {
      const d = haversineKm(lat, lon, item.lat, item.lon);
      if (d < bestKm) {
        bestKm = d;
        nearest = item;
      }
    }
    if (bestKm <= 25) {
      shortName = nearest.shortName;
      displayLabel = `${nearest.shortName} · Hà Nội`;
    } else {
      shortName = 'Vị trí hiện tại';
      displayLabel = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  }

  const address =
    nativeLoc.addressLine?.trim() ||
    [nativeLoc.thoroughfare, nativeLoc.subLocality, nativeLoc.subAdminArea, nativeLoc.adminArea]
      .filter(Boolean)
      .join(', ') ||
    displayLabel;

  return {
    displayLabel,
    place: {
      id: 'gps-current',
      name: address,
      shortName,
      address,
      coordinates: [lon, lat],
    },
  };
}

export async function ensureLocationPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }
  const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  if ((await PermissionsAndroid.check(fine)) || (await PermissionsAndroid.check(coarse))) {
    return 'granted';
  }

  const res = await PermissionsAndroid.request(fine, {
    title: 'Cho phép ChargePilot AI dùng Vị trí (GPS)',
    message:
      'ChargePilot AI cần vị trí hiện tại để gợi ý đúng trạm sạc gần bạn nhất và dẫn đường chính xác.',
    buttonPositive: 'Cho phép',
    buttonNegative: 'Để sau',
  });

  return res === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
}

export async function fetchCurrentUserLocation(): Promise<UserLocationOutcome> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const built = buildPlaceFromCoords({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
          resolve({ status: 'ready', ...built });
        },
        (err) => {
          resolve({
            status: err.code === 1 ? 'denied' : 'error',
            error: err.message || 'Không lấy được vị trí trình duyệt.',
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  if (Platform.OS !== 'android' || !LocationModule) {
    return {
      status: 'unavailable',
      error: 'Thiết bị chưa hỗ trợ mô-đun GPS gốc.',
    };
  }

  const perm = await ensureLocationPermission();
  if (perm !== 'granted') {
    return {
      status: 'denied',
      error: 'Chưa cấp quyền vị trí GPS.',
    };
  }

  try {
    const raw = await LocationModule.getCurrentPosition(10000);
    if (!Number.isFinite(raw?.lat) || !Number.isFinite(raw?.lon)) {
      return { status: 'error', error: 'Toạ độ GPS không hợp lệ.' };
    }
    const built = buildPlaceFromCoords(raw);
    return { status: 'ready', ...built };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Không thể lấy vị trí hiện tại.',
    };
  }
}
