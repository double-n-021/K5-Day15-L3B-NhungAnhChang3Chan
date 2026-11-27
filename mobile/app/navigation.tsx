import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  AlertTriangle,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Flag,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react-native';
import { HanoiMapView, type MapRouteLayerItem } from '@/components/map/HanoiMapView';
import { getBatteryColor } from '@/components/shared/AnimatedBatteryBar';
import { VEHICLES } from '@/data/vehicles';
import { minutesToTime, timeToMinutes } from '@/services/decisionEngine';
import {
  buildDirectRoute,
  fetchLiveOsrmRoute,
  getCachedRoute,
  interpolateAlongRoute,
} from '@/services/routeService';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { RouteGeometry } from '@/types';

export default function ActiveNavigationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    effectiveStations,
    effectiveInput,
    selectedStationId,
    recommendation,
    mapStyleMode,
    toggleScenario,
    activeScenarios,
  } = useChargePilotStore();

  const targetStation =
    effectiveStations.find((s) => s.id === selectedStationId) ??
    effectiveStations.find((s) => s.id === recommendation.recommended?.station.id) ??
    recommendation.recommended?.station ??
    effectiveStations[0];

  const cachedRoute = useMemo(() => {
    if (!targetStation) return null;
    return (
      getCachedRoute(effectiveInput.origin.id, targetStation.id) ??
      recommendation.recommended?.routeToStation ??
      null
    );
  }, [effectiveInput.origin.id, targetStation?.id, recommendation.recommended]);

  const [liveRoute, setLiveRoute] = useState<RouteGeometry | null>(null);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);

  const fallbackDirectRoute = useMemo(() => {
    if (!targetStation) return null;
    return buildDirectRoute(
      effectiveInput.origin.id,
      targetStation.id,
      effectiveInput.origin.coordinates,
      targetStation.coordinates,
      targetStation.shortName
    );
  }, [
    effectiveInput.origin.id,
    effectiveInput.origin.coordinates,
    targetStation?.id,
    targetStation?.coordinates,
    targetStation?.shortName,
  ]);

  const activeRoute =
    cachedRoute ??
    (liveRoute &&
    targetStation &&
    liveRoute.fromId === effectiveInput.origin.id &&
    liveRoute.toId === targetStation.id
      ? liveRoute
      : null) ??
    fallbackDirectRoute;

  useEffect(() => {
    if (!targetStation || cachedRoute) {
      setIsFetchingRoute(false);
      return;
    }
    let cancelled = false;
    setIsFetchingRoute(true);
    fetchLiveOsrmRoute({
      fromId: effectiveInput.origin.id,
      toId: targetStation.id,
      originCoord: effectiveInput.origin.coordinates,
      destCoord: targetStation.coordinates,
      destinationName: targetStation.shortName,
    })
      .then((route) => {
        if (!cancelled) {
          setLiveRoute(route);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetchingRoute(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    cachedRoute,
    effectiveInput.origin.id,
    effectiveInput.origin.coordinates,
    targetStation?.id,
    targetStation?.coordinates,
    targetStation?.shortName,
  ]);

  const [isRunning, setIsRunning] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 5>(2);
  const [progress, setProgress] = useState(0); // 0 .. 1

  useEffect(() => {
    setProgress(0);
    setIsRunning(true);
  }, [activeRoute?.id]);

  useEffect(() => {
    if (!isRunning || !activeRoute) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const delta = 0.01 * speedMultiplier;
        const next = prev + delta;
        if (next >= 1) {
          setIsRunning(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          return 1;
        }
        return next;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [isRunning, speedMultiplier, activeRoute]);

  const navState = useMemo(() => {
    if (!activeRoute) {
      return {
        coordinate: effectiveInput.origin.coordinates,
        bearing: 0,
        remainingMeters: 0,
        currentStepIndex: 0,
      };
    }
    return interpolateAlongRoute(activeRoute, progress);
  }, [activeRoute, progress, effectiveInput.origin.coordinates]);

  const currentStep = activeRoute?.steps[navState.currentStepIndex];
  const nextStep =
    activeRoute?.steps[
      Math.min((activeRoute?.steps.length ?? 1) - 1, navState.currentStepIndex + 1)
    ];

  const remainingKm = (navState.remainingMeters / 1000).toFixed(1);
  const totalDriveMin = Math.max(
    4,
    Math.round(((activeRoute?.durationSeconds ?? 300) / 60) * 1.45)
  );
  const remainingMin = Math.max(0, Math.round(totalDriveMin * (1 - progress)));
  const etaTime = minutesToTime(
    timeToMinutes(effectiveInput.departureTime) +
      Math.round(totalDriveMin * progress) +
      remainingMin
  );

  const predictedArrivalBattery = Math.max(
    4,
    Math.round(
      effectiveInput.batteryPct - ((activeRoute?.distanceMeters ?? 2700) / 1000) * 0.8
    )
  );
  const liveBatteryPct = Math.round(
    effectiveInput.batteryPct -
      (effectiveInput.batteryPct - predictedArrivalBattery) * progress
  );

  const routesForMap = useMemo<MapRouteLayerItem[]>(() => {
    if (!activeRoute) return [];
    return [
      {
        id: `active-nav-${activeRoute.id}`,
        route: activeRoute,
        variant: 'recommended',
      },
    ];
  }, [activeRoute]);

  const handleTriggerFault = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (!activeScenarios.includes('station_maintenance')) {
      toggleScenario('station_maintenance');
    }
    router.push('/simulation');
  };

  const modifier = nextStep?.modifier ?? '';
  const ManeuverIcon =
    progress >= 1
      ? Flag
      : modifier.includes('left')
        ? CornerUpLeft
        : modifier.includes('right')
          ? CornerUpRight
          : modifier === 'uturn'
            ? RotateCcw
            : ArrowUp;

  if (!targetStation) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }]}>
        <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary, textAlign: 'center', marginBottom: 12 }]}>
          Chưa có trạm sạc mục tiêu để dẫn đường
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.gmapsBtn, { paddingHorizontal: 16, paddingVertical: 10 }]}
        >
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen }]}>Quay lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Full-Screen Hanoi Map */}
      <HanoiMapView
        stations={effectiveStations}
        selectedStationId={targetStation.id}
        recommendedStationId={targetStation.id}
        routes={routesForMap}
        vehicleCoordinate={navState.coordinate}
        vehicleBearing={navState.bearing}
        vehicleCategory={VEHICLES[effectiveInput.vehicleId].category}
        mapStyleMode={mapStyleMode}
        is3D={true}
        followVehicle={true}
        initialCenter={navState.coordinate}
        initialZoom={15.2}
      />

      {/* Top Maneuver + Simulation Label */}
      <View style={[styles.topOverlay, { top: insets.top + 8 }]}>
        <View style={styles.simBanner}>
          <Text
            style={[TYPOGRAPHY.micro, { color: COLORS.warningAmber, flex: 1, flexShrink: 1 }]}
            numberOfLines={1}
          >
            {isFetchingRoute
              ? 'ĐANG TẢI TUYẾN OSRM THỰC TẾ...'
              : 'DẪN ĐƯỜNG MÔ PHỎNG (OSRM) · KHÔNG DÙNG LÁI XE'}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={styles.closeBtn}
            accessibilityLabel="Thoát dẫn đường"
          >
            <X size={18} color={COLORS.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.maneuverCard}>
          <View style={styles.maneuverIcon}>
            <ManeuverIcon size={24} color="#0B1017" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]}>
              {progress >= 1
                ? 'Đã đến điểm sạc!'
                : nextStep?.distanceMeters
                  ? `Còn ${nextStep.distanceMeters} m`
                  : 'Đang theo lộ trình'}
            </Text>
            <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]} numberOfLines={2}>
              {progress >= 1
                ? targetStation.shortName
                : (nextStep?.instruction ?? currentStep?.instruction ?? 'Đi thẳng theo tuyến đường')}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom Driving HUD */}
      <View style={[styles.bottomHud, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.hudDestRow}>
          <View style={{ flex: 1 }}>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              ĐIỂM ĐẾN SẠC PIN
            </Text>
            <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
              {targetStation.shortName}
            </Text>
          </View>
          <View style={styles.hudActionsRow}>
            <Pressable
              onPress={() => {
                const [lon, lat] = targetStation.coordinates;
                const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
                Linking.openURL(url).catch(() => {});
              }}
              style={styles.gmapsBtn}
              accessibilityLabel="Mở Google Maps"
            >
              <ExternalLink size={14} color={COLORS.energyGreen} />
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>
                Google Maps
              </Text>
            </Pressable>
            <Pressable onPress={handleTriggerFault} style={styles.faultBtn}>
              <AlertTriangle size={14} color={COLORS.criticalRed} />
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.criticalRed }]}>
                Sự cố trạm!
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hudMetrics}>
          <View style={styles.hudMetricItem}>
            <Text style={[TYPOGRAPHY.metricLarge, { color: COLORS.textPrimary }]}>
              {remainingKm} km
            </Text>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Còn lại
            </Text>
          </View>
          <View style={styles.hudMetricItem}>
            <Text style={[TYPOGRAPHY.metricLarge, { color: COLORS.energyGreen }]}>
              {etaTime}
            </Text>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Dự kiến ({remainingMin}p)
            </Text>
          </View>
          <View style={styles.hudMetricItem}>
            <Text
              style={[
                TYPOGRAPHY.metricLarge,
                { color: getBatteryColor(liveBatteryPct) },
              ]}
            >
              {liveBatteryPct}% → {predictedArrivalBattery}%
            </Text>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Hiện tại / Tới trạm
            </Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsBar}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              if (progress >= 1) {
                setProgress(0);
                setIsRunning(true);
              } else {
                setIsRunning((v) => !v);
              }
            }}
            style={styles.playBtn}
          >
            {isRunning ? (
              <Pause size={16} color="#0B1017" />
            ) : (
              <Play size={16} color="#0B1017" />
            )}
            <Text style={[TYPOGRAPHY.caption, { color: '#0B1017' }]}>
              {progress >= 1 ? 'Chạy lại' : isRunning ? 'Tạm dừng' : 'Tiếp tục'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setProgress(0);
              setIsRunning(false);
            }}
            style={styles.resetBtn}
            accessibilityLabel="Đặt lại mô phỏng"
          >
            <RotateCcw size={16} color={COLORS.textPrimary} />
          </Pressable>

          <View style={styles.speedGroup}>
            {([1, 2, 5] as const).map((spd) => {
              const active = speedMultiplier === spd;
              return (
                <Pressable
                  key={spd}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSpeedMultiplier(spd);
                  }}
                  style={[styles.speedChip, active && styles.speedChipActive]}
                >
                  <Text
                    style={[
                      TYPOGRAPHY.metricSmall,
                      { color: active ? '#0B1017' : COLORS.textPrimary },
                    ]}
                  >
                    {spd}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topOverlay: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    gap: 8,
    zIndex: 20,
  },
  simBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: 'rgba(11, 16, 23, 0.92)',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.warningAmberBorder,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maneuverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(21, 30, 41, 0.96)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    padding: SPACING.md,
    ...SHADOWS.floating,
  },
  maneuverIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.energyGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomHud: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 34, 0.96)',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  hudDestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hudActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gmapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.energyGreenDim,
    borderColor: COLORS.energyGreenBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  faultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.criticalRedDim,
    borderColor: COLORS.criticalRedBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  hudMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  hudMetricItem: {
    alignItems: 'center',
    gap: 2,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
  },
  resetBtn: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedGroup: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
    gap: 3,
  },
  speedChip: {
    minWidth: 38,
    minHeight: 38,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedChipActive: {
    backgroundColor: COLORS.energyGreen,
  },
});
