import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Navigation,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react-native';
import { HanoiMapView, type MapRouteLayerItem } from '@/components/map/HanoiMapView';
import { WHAT_IF_SCENARIOS } from '@/data/presets';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';

export default function WhatIfSimulationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    effectiveStations,
    effectiveInput,
    activeScenarios,
    toggleScenario,
    clearScenarios,
    baselineRecommendation,
    recommendation,
    mapStyleMode,
    selectStation,
  } = useChargePilotStore();

  const baseRec = baselineRecommendation.recommended;
  const currRec = recommendation.recommended;
  const hasChangedStation =
    baseRec && currRec && baseRec.station.id !== currRec.station.id;

  const mapRoutes = useMemo<MapRouteLayerItem[]>(() => {
    const items: MapRouteLayerItem[] = [];

    // Show old baseline route as faded dashed red if scenarios altered the route or failed it
    if (
      activeScenarios.length > 0 &&
      baseRec?.routeToStation &&
      (!currRec || baseRec.station.id !== currRec.station.id)
    ) {
      items.push({
        id: `failed-base-${baseRec.station.id}`,
        route: baseRec.routeToStation,
        variant: 'failed',
      });
    }

    // Show new active safe route in glowing green
    if (currRec?.routeToStation) {
      items.push({
        id: `sim-rec-${currRec.station.id}`,
        route: currRec.routeToStation,
        variant: 'recommended',
      });
      if (currRec.routeToPrimary) {
        items.push({
          id: `sim-leg2-${currRec.station.id}`,
          route: currRec.routeToPrimary,
          variant: 'nextLeg',
        });
      }
    }

    return items;
  }, [activeScenarios, baseRec, currRec]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]}>
            Mô phỏng tình huống bất ngờ (What-If)
          </Text>
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
            Chạm kịch bản để xem AI tự động đổi tuyến & bảo toàn lịch trình
          </Text>
        </View>
        {activeScenarios.length > 0 && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              clearScenarios();
            }}
            style={styles.resetBtn}
          >
            <RotateCcw size={15} color={COLORS.textPrimary} />
          </Pressable>
        )}
      </View>

      {/* Top Live Map */}
      <View style={styles.mapContainer}>
        <HanoiMapView
          stations={effectiveStations}
          selectedStationId={currRec?.station.id}
          recommendedStationId={currRec?.station.id}
          routes={mapRoutes}
          vehicleCoordinate={effectiveInput.origin.coordinates}
          mapStyleMode={mapStyleMode}
          is3D={false}
          focusCoordinate={currRec?.station.coordinates ?? [105.832, 21.021]}
          focusZoom={12.6}
          destinationPin={{
            coordinate: effectiveInput.primaryDestination.coordinates,
            label: effectiveInput.primaryDestination.shortName,
          }}
        />
      </View>

      {/* Bottom Interactive Simulator Panel */}
      <ScrollView
        style={styles.panel}
        contentContainerStyle={styles.panelContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Contextual Alert / Warning */}
        {!recommendation.hasSafeRoute ? (
          <View style={styles.criticalAlert}>
            <ShieldAlert size={20} color={COLORS.criticalRed} />
            <View style={{ flex: 1 }}>
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.criticalRed }]}>
                {recommendation.criticalAlertTitle}
              </Text>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, marginTop: 4 }]}>
                {recommendation.criticalAlertMessage}
              </Text>
            </View>
          </View>
        ) : activeScenarios.length > 0 ? (
          <View style={styles.warningAlert}>
            <AlertTriangle size={18} color={COLORS.warningAmber} />
            <View style={{ flex: 1 }}>
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.warningAmber }]}>
                {hasChangedStation
                  ? `AI chuyển hướng: ${baseRec?.station.shortName} -> ${currRec?.station.shortName}`
                  : `Đã cập nhật phương án tại ${currRec?.station.shortName}`}
              </Text>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginTop: 2 }]}>
                {currRec
                  ? `Tuyến cũ bị hủy/giảm ưu tiên. Đến ${effectiveInput.primaryDestination.shortName} lúc ${currRec.estimatedArrivalTime} (Pin trạm ${currRec.arrivalBatteryPct}% -> ${currRec.targetDepartureBatteryPct}%).`
                  : ''}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Before vs After Comparison */}
        {activeScenarios.length > 0 && baseRec && (
          <View style={styles.diffCard}>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
              So sánh Trước / Sau khi xảy ra sự cố
            </Text>
            <View style={styles.diffRow}>
              <View style={styles.diffCol}>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.textMuted }]}>TRƯỚC</Text>
                <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.textSecondary }]} numberOfLines={1}>
                  {baseRec.station.shortName}
                </Text>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                  Đến {baseRec.estimatedArrivalTime} · Pin {baseRec.arrivalBatteryPct}%
                </Text>
              </View>

              <ArrowRight size={18} color={COLORS.energyGreen} />

              <View style={styles.diffCol}>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>SAU</Text>
                <Text
                  style={[
                    TYPOGRAPHY.bodyMedium,
                    { color: currRec ? COLORS.energyGreen : COLORS.criticalRed },
                  ]}
                  numberOfLines={1}
                >
                  {currRec ? currRec.station.shortName : 'Không an toàn'}
                </Text>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary }]}>
                  {currRec
                    ? `Đến ${currRec.estimatedArrivalTime} · Pin ${currRec.arrivalBatteryPct}%`
                    : 'Cần cứu hộ pin'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 6 Scenario Toggle Cards */}
        <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
          Chọn tình huống mô phỏng ({activeScenarios.length} đang bật)
        </Text>

        <View style={styles.scenariosGrid}>
          {WHAT_IF_SCENARIOS.map((sc) => {
            const active = activeScenarios.includes(sc.id);
            const isCrit = sc.severity === 'critical';
            return (
              <Pressable
                key={sc.id}
                onPress={() => {
                  Haptics.impactAsync(
                    active
                      ? Haptics.ImpactFeedbackStyle.Light
                      : Haptics.ImpactFeedbackStyle.Medium
                  ).catch(() => {});
                  toggleScenario(sc.id);
                }}
                style={[
                  styles.scenarioCard,
                  active &&
                    (isCrit ? styles.scenarioActiveCrit : styles.scenarioActiveWarn),
                ]}
              >
                <View style={styles.scenarioTop}>
                  <Text
                    style={[
                      TYPOGRAPHY.micro,
                      {
                        color: active
                          ? isCrit
                            ? COLORS.criticalRed
                            : COLORS.warningAmber
                          : COLORS.textSecondary,
                      },
                    ]}
                  >
                    {sc.impactTag}
                  </Text>
                </View>
                <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
                  {sc.title}
                </Text>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={2}>
                  {sc.subtitle}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {currRec && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              selectStation(currRec.station.id);
              router.push('/navigation');
            }}
            style={styles.applyBtn}
          >
            <Navigation size={18} color="#0B1017" />
            <Text style={[TYPOGRAPHY.sectionTitle, { color: '#0B1017' }]}>
              Áp dụng & Dẫn đường mô phỏng
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: {
    height: 230,
    width: '100%',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  panel: {
    flex: 1,
  },
  panelContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  warningAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.warningAmberDim,
    borderColor: COLORS.warningAmberBorder,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  criticalAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.criticalRedDim,
    borderColor: COLORS.criticalRedBorder,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  diffCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 8,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  diffCol: {
    flex: 1,
    gap: 2,
  },
  scenariosGrid: {
    gap: 10,
  },
  scenarioCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 4,
  },
  scenarioActiveWarn: {
    borderColor: COLORS.warningAmber,
    backgroundColor: COLORS.warningAmberDim,
  },
  scenarioActiveCrit: {
    borderColor: COLORS.criticalRed,
    backgroundColor: COLORS.criticalRedDim,
  },
  scenarioTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
  },
});
