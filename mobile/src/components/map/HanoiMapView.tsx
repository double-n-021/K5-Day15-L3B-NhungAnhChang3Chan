import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  type MapRef,
  Marker,
} from '@maplibre/maplibre-react-native';
import { Zap } from 'lucide-react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { CHARGEPILOT_DARK_MAP_STYLE } from '@/theme/mapDarkStyle';
import { COLORS, RADIUS, SHADOWS } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { ChargingStation, RouteGeometry, StationStatus, VehicleCategory } from '@/types';

const MAP_STYLES = {
  dark: CHARGEPILOT_DARK_MAP_STYLE,
  light: 'https://tiles.openfreemap.org/styles/liberty',
};

const HANOI_DEFAULT_CENTER: [number, number] = [105.8542, 21.0285];

function getStatusColor(status: StationStatus): string {
  switch (status) {
    case 'available':
      return COLORS.energyGreen;
    case 'busy':
      return COLORS.warningAmber;
    case 'maintenance':
      return COLORS.criticalRed;
    default:
      return COLORS.unknownGray;
  }
}

export interface MapRouteLayerItem {
  id: string;
  route: RouteGeometry;
  variant: 'recommended' | 'candidate' | 'failed' | 'nextLeg';
}

interface HanoiMapViewProps {
  stations: ChargingStation[];
  selectedStationId?: string;
  recommendedStationId?: string;
  onSelectStation?: (stationId: string) => void;
  routes?: MapRouteLayerItem[];
  vehicleCoordinate?: [number, number];
  vehicleBearing?: number;
  vehicleCategory?: VehicleCategory;
  mapStyleMode?: 'dark' | 'light';
  is3D?: boolean;
  initialCenter?: [number, number];
  initialZoom?: number;
  focusCoordinate?: [number, number];
  focusZoom?: number;
  followVehicle?: boolean;
  destinationPin?: { coordinate: [number, number]; label: string } | null;
  cameraRefExternal?: React.RefObject<CameraRef | null>;
}

export function HanoiMapView({
  stations,
  selectedStationId,
  recommendedStationId,
  onSelectStation,
  routes = [],
  vehicleCoordinate = [105.8143, 21.0169],
  vehicleBearing = 0,
  vehicleCategory = 'car',
  mapStyleMode = 'dark',
  is3D = true,
  initialCenter,
  initialZoom,
  focusCoordinate,
  focusZoom = 13.0,
  followVehicle = false,
  destinationPin = null,
  cameraRefExternal,
}: HanoiMapViewProps) {
  const internalCameraRef = useRef<CameraRef | null>(null);
  const cameraRef = cameraRefExternal ?? internalCameraRef;
  const mapRef = useRef<MapRef | null>(null);
  const lastMarkerTapRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const lastFocusedKeyRef = useRef<string | null>(null);
  const lastFollowCameraAtRef = useRef<number>(0);

  const handleStationTap = (stationId: string) => {
    const now = Date.now();
    if (lastMarkerTapRef.current.id === stationId && now - lastMarkerTapRef.current.at < 260) {
      return;
    }
    lastMarkerTapRef.current = { id: stationId, at: now };
    onSelectStation?.(stationId);
  };

  useEffect(() => {
    if (!followVehicle || !vehicleCoordinate) return;
    const now = Date.now();
    if (now - lastFollowCameraAtRef.current < 450) return;
    lastFollowCameraAtRef.current = now;
    try {
      cameraRef.current?.easeTo({
        center: vehicleCoordinate,
        zoom: 15.2,
        pitch: is3D ? 52 : 0,
        bearing: vehicleBearing,
        duration: 420,
      });
    } catch {
      // Ignore camera easing error when native map view is unmounting
    }
  }, [followVehicle, vehicleCoordinate, vehicleBearing, is3D, cameraRef]);

  useEffect(() => {
    if (!followVehicle && focusCoordinate) {
      const nextKey = `${focusCoordinate[0].toFixed(5)},${focusCoordinate[1].toFixed(5)},${focusZoom}`;
      if (lastFocusedKeyRef.current === nextKey) return;
      lastFocusedKeyRef.current = nextKey;
      cameraRef.current?.flyTo({
        center: focusCoordinate,
        zoom: focusZoom,
        pitch: is3D ? 50 : 0,
        bearing: 0,
        duration: 750,
      });
    }
  }, [focusCoordinate, focusZoom, followVehicle, cameraRef, is3D]);

  const routeFeatures = useMemo(() => {
    return routes
      .filter((item) => Array.isArray(item.route?.coordinates) && item.route.coordinates.length >= 2)
      .map((item) => ({
        id: item.id,
        variant: item.variant,
        geojson: {
          type: 'Feature' as const,
          properties: { id: item.id, variant: item.variant },
          geometry: {
            type: 'LineString' as const,
            coordinates: item.route.coordinates,
          },
        },
      }));
  }, [routes]);

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLES[mapStyleMode]}
        attribution={true}
        attributionPosition={{ bottom: 8, left: 8 }}
        logo={false}
        compass={false}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: initialCenter ?? focusCoordinate ?? HANOI_DEFAULT_CENTER,
            zoom: initialZoom ?? focusZoom,
            pitch: is3D ? 50 : 0,
            bearing: 0,
          }}
          minZoom={10}
          maxZoom={18}
        />

        {/* Render non-recommended routes first (below primary line) */}
        {routeFeatures
          .filter((r) => r.variant !== 'recommended')
          .map((item) => {
            const color =
              item.variant === 'failed'
                ? COLORS.criticalRed
                : item.variant === 'nextLeg'
                  ? COLORS.navBlue
                  : COLORS.warningAmber;
            const dash =
              item.variant === 'failed'
                ? [2, 2]
                : item.variant === 'nextLeg'
                  ? [1.5, 1.5]
                  : [2, 1.5];
            return (
              <GeoJSONSource
                key={`src-${item.id}`}
                id={`src-${item.id}`}
                data={item.geojson}
              >
                <Layer
                  id={`layer-${item.id}`}
                  type="line"
                  paint={{
                    'line-color': color,
                    'line-width': item.variant === 'failed' ? 4 : 3.5,
                    'line-opacity': item.variant === 'failed' ? 0.65 : 0.72,
                    'line-dasharray': dash,
                  }}
                  layout={{
                    'line-cap': 'round',
                    'line-join': 'round',
                  }}
                />
              </GeoJSONSource>
            );
          })}

        {/* Render primary recommended route with subtle outer glow */}
        {routeFeatures
          .filter((r) => r.variant === 'recommended')
          .map((item) => (
            <GeoJSONSource
              key={`src-${item.id}`}
              id={`src-${item.id}`}
              data={item.geojson}
            >
              <Layer
                id={`layer-glow-${item.id}`}
                type="line"
                paint={{
                  'line-color': COLORS.energyGreen,
                  'line-width': 10,
                  'line-opacity': 0.24,
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
              <Layer
                id={`layer-${item.id}`}
                type="line"
                paint={{
                  'line-color': COLORS.energyGreen,
                  'line-width': 5,
                  'line-opacity': 0.96,
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
            </GeoJSONSource>
          ))}

        {/* Destination pin (e.g. Hồ Gươm / Nội Bài) */}
        {destinationPin && (
          <Marker lngLat={destinationPin.coordinate} anchor="bottom">
            <View style={styles.destPinWrap}>
              <View style={styles.destPinBubble}>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.textPrimary }]}>
                  {destinationPin.label}
                </Text>
              </View>
              <View style={styles.destPinDot} />
            </View>
          </Marker>
        )}

        {/* Charging Station Markers */}
        {stations.map((station) => {
          const isSelected = station.id === selectedStationId;
          const isRecommended = station.id === recommendedStationId;
          const statusColor = getStatusColor(station.status);
          const countLabel =
            station.status === 'maintenance'
              ? 'BT'
              : station.status === 'unknown'
                ? '?'
                : `${station.availableBays}/${station.totalBays}`;

          return (
            <Marker
              key={station.id}
              id={`marker-${station.id}`}
              lngLat={station.coordinates}
              anchor="center"
              onPress={() => handleStationTap(station.id)}
            >
              <Pressable
                onPress={() => handleStationTap(station.id)}
                hitSlop={10}
                style={[
                  styles.stationMarker,
                  isSelected && styles.stationMarkerSelected,
                  isRecommended && { borderColor: COLORS.energyGreen },
                  { backgroundColor: COLORS.surface },
                ]}
              >
                <View style={[styles.markerIconBox, { backgroundColor: statusColor }]}>
                  <Zap size={11} color="#0B1017" strokeWidth={2.6} />
                </View>
                <Text style={[TYPOGRAPHY.micro, styles.markerCount]}>
                  {countLabel}
                </Text>
                {isRecommended && (
                  <View style={styles.recTag}>
                    <Text style={styles.recTagText}>AI</Text>
                  </View>
                )}
              </Pressable>
            </Marker>
          );
        })}

        {/* Compact Top-Down Mini 3D-Shaded Vehicle Marker */}
        <Marker
          id="vehicle-marker"
          lngLat={vehicleCoordinate}
          anchor="center"
        >
          <View style={styles.vehiclePulse}>
            <View
              style={{
                transform: [
                  { rotate: followVehicle ? '0deg' : `${Math.round(vehicleBearing)}deg` },
                ],
              }}
            >
              {vehicleCategory === 'motorbike' ? (
                <Svg width={18} height={30} viewBox="0 0 22 36">
                  {/* Subtle headlight beam */}
                  <Path d="M6 7 L11 0 L16 7 Z" fill="#36E6A3" opacity={0.45} />
                  {/* Evo200 metallic teal chassis */}
                  <Rect x={6} y={6} width={10} height={24} rx={5} fill="#14B8A6" stroke="#FFFFFF" strokeWidth={1.2} />
                  {/* Handlebars */}
                  <Rect x={2} y={11} width={18} height={2.8} rx={1.4} fill="#E2E8F0" />
                  {/* Dark contoured seat */}
                  <Rect x={7.5} y={16} width={7} height={11} rx={3.5} fill="#0F172A" />
                  {/* Round headlamp & rear taillight */}
                  <Circle cx={11} cy={7.5} r={2} fill="#E0F2FE" />
                  <Rect x={8.5} y={28.5} width={5} height={1.8} rx={0.9} fill="#EF4444" />
                </Svg>
              ) : (
                <Svg width={22} height={34} viewBox="0 0 28 42">
                  {/* Subtle EV headlight beam */}
                  <Path d="M6 6 L14 0 L22 6 Z" fill="#36E6A3" opacity={0.35} />
                  {/* VF e34 pearl-white SUV body */}
                  <Rect x={4} y={5} width={20} height={33} rx={6} fill="#F1F5F9" stroke="#36E6A3" strokeWidth={1.3} />
                  {/* Tinted dark windshield + panoramic roof */}
                  <Rect x={6.5} y={13} width={15} height={17} rx={3.5} fill="#0F172A" />
                  {/* Front V-shaped light accents & rear taillight */}
                  <Path d="M6 8 L14 11 L22 8" stroke="#38BDF8" strokeWidth={1.6} fill="none" />
                  <Rect x={7} y={35.2} width={14} height={2} rx={1} fill="#EF4444" />
                </Svg>
              )}
            </View>
          </View>
        </Marker>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  stationMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  stationMarkerSelected: {
    transform: [{ scale: 1.12 }],
    borderColor: COLORS.textPrimary,
  },
  markerIconBox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCount: {
    color: COLORS.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  recTag: {
    backgroundColor: COLORS.energyGreenDim,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.energyGreen,
  },
  vehiclePulse: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(54, 230, 163, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(54, 230, 163, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destPinWrap: {
    alignItems: 'center',
  },
  destPinBubble: {
    backgroundColor: COLORS.navBlue,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#93C5FD',
    marginBottom: 3,
  },
  destPinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.navBlue,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
