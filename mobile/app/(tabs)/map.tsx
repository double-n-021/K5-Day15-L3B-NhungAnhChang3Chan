import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import * as Haptics from 'expo-haptics';
import {
  BatteryCharging,
  Compass,
  Moon,
  Navigation,
  Sun,
  X,
} from 'lucide-react-native';
import { HanoiMapView, type MapRouteLayerItem } from '@/components/map/HanoiMapView';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { getBatteryColor } from '@/components/shared/AnimatedBatteryBar';
import { ASSETS_3D } from '@/data/assets3d';
import { CUSTOM_ICONS } from '@/data/customIcons';
import { VEHICLES } from '@/data/vehicles';
import { formatVnd } from '@/services/decisionEngine';
import { getCachedRoute } from '@/services/routeService';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';

type StationFilter = 'all' | 'available' | 'noon_bonus';

const HANOI_INITIAL_CENTER: [number, number] = [105.829, 21.017];

export default function SmartMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cameraRef = useRef<CameraRef | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const {
    effectiveStations,
    effectiveInput,
    recommendation,
    selectedStationId,
    selectStation,
    mapStyleMode,
    toggleMapStyle,
    is3DBuildings,
    toggle3DBuildings,
    triggerVoiceAssistant,
  } = useChargePilotStore();

  const [filter, setFilter] = useState<StationFilter>('all');
  const [stationPopupVisible, setStationPopupVisible] = useState(false);

  const vehicle = VEHICLES[effectiveInput.vehicleId];

  const filteredStations = useMemo(() => {
    return effectiveStations.filter((st) => {
      if (filter === 'available') return st.status === 'available';
      if (filter === 'noon_bonus') return st.status === 'available' && st.maxPowerKw >= 120;
      return true;
    });
  }, [effectiveStations, filter]);

  const selectedStation =
    effectiveStations.find((s) => s.id === selectedStationId) ??
    recommendation.recommended?.station ??
    effectiveStations[0];

  const selectedEval = useMemo(() => {
    if (!selectedStation) return null;
    if (recommendation.recommended?.station.id === selectedStation.id) {
      return recommendation.recommended;
    }
    return (
      recommendation.alternatives.find((a) => a.station.id === selectedStation.id) ??
      null
    );
  }, [selectedStation, recommendation]);

  const mapRoutes = useMemo<MapRouteLayerItem[]>(() => {
    const items: MapRouteLayerItem[] = [];
    const recId = recommendation.recommended?.station.id;

    for (const alt of recommendation.alternatives) {
      if (alt.routeToStation) {
        items.push({
          id: `cand-${alt.station.id}`,
          route: alt.routeToStation,
          variant: 'candidate',
        });
      }
    }

    if (selectedStation && selectedStation.id !== recId) {
      const rSel = getCachedRoute(effectiveInput.origin.id, selectedStation.id);
      if (rSel) {
        items.push({
          id: `sel-${selectedStation.id}`,
          route: rSel,
          variant: selectedStation.status === 'maintenance' ? 'failed' : 'candidate',
        });
      }
    }

    if (recommendation.recommended?.routeToStation) {
      items.push({
        id: `rec-${recommendation.recommended.station.id}`,
        route: recommendation.recommended.routeToStation,
        variant: 'recommended',
      });
      if (recommendation.recommended.routeToPrimary) {
        items.push({
          id: `rec-leg2-${recommendation.recommended.station.id}`,
          route: recommendation.recommended.routeToPrimary,
          variant: 'nextLeg',
        });
      }
    }
    return items;
  }, [recommendation, selectedStation, effectiveInput.origin.id]);

  const snapPoints = useMemo(() => ['18%', '44%', '82%'], []);

  const handleSelectStation = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    selectStation(id);
    setStationPopupVisible(true);
    const target = effectiveStations.find((s) => s.id === id);
    if (target) {
      cameraRef.current?.easeTo({
        center: target.coordinates,
        zoom: 14.2,
        pitch: is3DBuildings ? 50 : 0,
        duration: 420,
      });
    }
  };

  const handleRecenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    cameraRef.current?.flyTo({
      center: effectiveInput.origin.coordinates,
      zoom: 13.8,
      pitch: is3DBuildings ? 50 : 0,
      bearing: 0,
      duration: 600,
    });
  };

  const handleToggle3D = () => {
    Haptics.selectionAsync().catch(() => {});
    const next3D = !is3DBuildings;
    toggle3DBuildings();
    cameraRef.current?.easeTo({
      center: selectedStation?.coordinates ?? effectiveInput.origin.coordinates,
      pitch: next3D ? 50 : 0,
      duration: 450,
    });
  };

  const batteryColor = getBatteryColor(effectiveInput.batteryPct);

  return (
    <View style={styles.screen}>
      <HanoiMapView
        stations={filteredStations}
        selectedStationId={selectedStation?.id}
        recommendedStationId={recommendation.recommended?.station.id}
        onSelectStation={handleSelectStation}
        routes={mapRoutes}
        vehicleCoordinate={effectiveInput.origin.coordinates}
        vehicleCategory={vehicle.category}
        mapStyleMode={mapStyleMode}
        is3D={is3DBuildings}
        initialCenter={HANOI_INITIAL_CENTER}
        initialZoom={12.7}
        cameraRefExternal={cameraRef}
      />

      {/* Minimal Voice-First Floating Top Bar */}
      <View style={[styles.topOverlay, { top: insets.top + SPACING.sm }]}>
        <View style={styles.searchRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              triggerVoiceAssistant();
              router.push('/(tabs)/journey');
            }}
            style={styles.searchBar}
            accessibilityRole="button"
            accessibilityLabel="Nói với AI để tìm trạm sạc"
          >
            <View style={styles.micBadge}>
              <Image
                source={CUSTOM_ICONS.micVoice}
                style={{ width: 16, height: 16 }}
                contentFit="contain"
              />
            </View>
            <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary, flex: 1 }]} numberOfLines={1}>
              Nói với AI nơi bạn muốn đến...
            </Text>
          </Pressable>

          <View style={styles.batteryPill}>
            <Image
              source={ASSETS_3D.battery}
              style={{ width: 18, height: 18 }}
              contentFit="contain"
            />
            <Text style={[TYPOGRAPHY.metricSmall, { color: batteryColor }]}>
              {effectiveInput.batteryPct}%
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsRow}
        >
          {(
            [
              { id: 'all', label: 'Tất cả' },
              { id: 'available', label: 'Đang trống' },
              { id: 'noon_bonus', label: '+45đ Trưa nắng' },
            ] as const
          ).map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setFilter(f.id);
                }}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[
                    TYPOGRAPHY.micro,
                    { color: active ? '#0B1017' : COLORS.textPrimary },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Right Map Controls */}
      <View style={[styles.rightControls, { top: insets.top + 106 }]}>
        <Pressable
          onPress={handleRecenter}
          style={styles.mapCtrlBtn}
          accessibilityLabel="Về vị trí xe"
        >
          <Compass size={19} color={COLORS.textPrimary} />
        </Pressable>

        <Pressable
          onPress={handleToggle3D}
          style={[styles.mapCtrlBtn, is3DBuildings && styles.mapCtrlBtnActive]}
          accessibilityLabel="Bật tắt bản đồ 3D"
        >
          <Text
            style={[
              TYPOGRAPHY.micro,
              { color: is3DBuildings ? COLORS.energyGreen : COLORS.textSecondary, fontWeight: '700' },
            ]}
          >
            {is3DBuildings ? '3D' : '2D'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            toggleMapStyle();
          }}
          style={styles.mapCtrlBtn}
          accessibilityLabel="Đổi giao diện bản đồ sáng tối"
        >
          {mapStyleMode === 'dark' ? (
            <Sun size={18} color={COLORS.warningAmber} />
          ) : (
            <Moon size={18} color={COLORS.textPrimary} />
          )}
        </Pressable>
      </View>

      {/* Instant Floating Station Info Popup Card when tapping any station marker */}
      {stationPopupVisible && selectedStation && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={[styles.popupCard, { top: insets.top + 106 }]}
        >
          <View style={styles.popupHeader}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.tagRow}>
                <StatusBadge status={selectedStation.status} compact />
                {selectedStation.status === 'available' && selectedStation.maxPowerKw >= 120 && (
                  <View style={styles.noonBonusPill}>
                    <Image
                      source={CUSTOM_ICONS.greenCharge}
                      style={{ width: 12, height: 12 }}
                      contentFit="contain"
                    />
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>
                      +45đ Trưa nắng
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
                {selectedStation.shortName}
              </Text>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={2}>
                {selectedStation.address}
              </Text>
            </View>

            <Pressable
              onPress={() => setStationPopupVisible(false)}
              style={styles.popupCloseBtn}
              hitSlop={8}
              accessibilityLabel="Đóng thông tin trạm"
            >
              <X size={16} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.popupMetaRow}>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen, fontWeight: '700' }]}>
              {selectedStation.availableBays}/{selectedStation.totalBays} trụ trống
            </Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary }]}>
              {selectedStation.maxPowerKw} kW
            </Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.warningAmber }]}>
              {selectedStation.estimatedWaitMin > 0 ? `Chờ ${selectedStation.estimatedWaitMin}p` : 'Vào ngay'}
            </Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
              {formatVnd(selectedStation.pricePerKwhVnd)}/kWh
            </Text>
          </View>

          <View style={styles.popupActions}>
            <Pressable
              onPress={() => {
                setStationPopupVisible(false);
                router.push(`/station/${selectedStation.id}`);
              }}
              style={styles.popupDetailBtn}
            >
              <BatteryCharging size={14} color={COLORS.textPrimary} />
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary }]}>
                Chi tiết trạm
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                selectStation(selectedStation.id);
                setStationPopupVisible(false);
                router.push('/navigation');
              }}
              disabled={selectedStation.status === 'maintenance'}
              style={[
                styles.popupNavBtn,
                selectedStation.status === 'maintenance' && { opacity: 0.45 },
              ]}
            >
              <Navigation size={14} color="#0B1017" />
              <Text style={[TYPOGRAPHY.caption, { color: '#0B1017', fontWeight: '700' }]}>
                Dẫn đường
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Draggable Bottom Sheet (starts compact at 18% so 3D Hanoi map & markers stay clickable) */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        enableOverDrag={false}
        // Expanded sheet must sit above the map overlays and below the status bar (QA P0).
        topInset={insets.top + 8}
        containerStyle={{ zIndex: 30, elevation: 30 }}
        onChange={(idx) => {
          if (idx >= 1) setStationPopupVisible(false);
        }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          {selectedStation && (
            <View style={styles.selectedCard}>
              <View style={styles.selectedHeader}>
                <View style={styles.stationThumbWrap}>
                  <Image
                    source={CUSTOM_ICONS.evStation}
                    style={styles.stationThumb}
                    contentFit="contain"
                  />
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.tagRow}>
                    <StatusBadge status={selectedStation.status} compact />
                    {recommendation.recommended?.station.id === selectedStation.id && (
                      <View style={styles.aiRecPill}>
                        <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>
                          AI Khuyên dùng
                        </Text>
                      </View>
                    )}
                    {selectedStation.status === 'available' && selectedStation.maxPowerKw >= 120 && (
                      <View style={styles.noonBonusPill}>
                        <Image
                          source={CUSTOM_ICONS.greenCharge}
                          style={{ width: 13, height: 13 }}
                          contentFit="contain"
                        />
                        <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>
                          +45đ Trưa nắng
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]}>
                    {selectedStation.shortName}
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={2}>
                    {selectedStation.address}
                  </Text>
                </View>
              </View>

              <View style={styles.metricsGrid}>
                <View style={styles.metricBox}>
                  <Text
                    style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {selectedEval
                      ? `${selectedEval.distanceToStationKm} km`
                      : selectedStation.roadKm != null
                        ? `${selectedStation.roadKm} km`
                        : 'Hà Nội'}
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Cách
                  </Text>
                </View>
                <View style={styles.metricBox}>
                  <Text
                    style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {selectedStation.availableBays}/{selectedStation.totalBays}
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Trụ trống
                  </Text>
                </View>
                <View style={styles.metricBox}>
                  <Text
                    style={[
                      TYPOGRAPHY.metricMedium,
                      {
                        color:
                          selectedStation.estimatedWaitMin > 0
                            ? COLORS.warningAmber
                            : COLORS.energyGreen,
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {selectedStation.estimatedWaitMin}p
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Chờ hàng
                  </Text>
                </View>
                <View style={styles.metricBox}>
                  <Text
                    style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {selectedEval ? `${selectedEval.chargeMin}p` : `${selectedStation.maxPowerKw}kW`}
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    {selectedEval ? 'Sạc pin' : 'Công suất'}
                  </Text>
                </View>
              </View>

              <View style={styles.sheetActions}>
                <Pressable
                  onPress={() => router.push(`/station/${selectedStation.id}`)}
                  style={styles.detailBtn}
                >
                  <BatteryCharging size={16} color={COLORS.textPrimary} />
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary }]}>
                    Chi tiết trụ sạc
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    selectStation(selectedStation.id);
                    router.push('/navigation');
                  }}
                  disabled={selectedStation.status === 'maintenance'}
                  style={[
                    styles.navBtn,
                    selectedStation.status === 'maintenance' && { opacity: 0.45 },
                  ]}
                >
                  <Navigation size={15} color="#0B1017" />
                  <Text style={[TYPOGRAPHY.caption, { color: '#0B1017', fontWeight: '700' }]}>
                    Dẫn đường mô phỏng
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Nearby / Alternative Stations List */}
          <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary, marginTop: 8 }]}>
            Danh sách trạm sạc tại Hà Nội ({filteredStations.length})
          </Text>

          {filteredStations.map((st) => {
            const isSel = st.id === selectedStation?.id;
            const isRec = st.id === recommendation.recommended?.station.id;
            return (
              <Pressable
                key={st.id}
                onPress={() => handleSelectStation(st.id)}
                style={[styles.stationRow, isSel && styles.stationRowSelected]}
              >
                <View style={styles.rowThumb3D}>
                  <Image
                    source={CUSTOM_ICONS.evStation}
                    style={{ width: 32, height: 32 }}
                    contentFit="contain"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.stationRowTitle}>
                    <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.textPrimary, flex: 1 }]} numberOfLines={1}>
                      {st.shortName}
                    </Text>
                    {isRec && (
                      <View style={styles.aiRecPill}>
                        <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>
                          Tối ưu
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginTop: 2 }]} numberOfLines={1}>
                    {st.district} · {st.maxPowerKw}kW DC · {st.statusNote}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <StatusBadge status={st.status} compact />
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    {st.estimatedWaitMin > 0 ? `Chờ ~${st.estimatedWaitMin}p` : 'Vào ngay'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheet>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(21, 30, 41, 0.94)',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    ...SHADOWS.card,
  },
  batteryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(21, 30, 41, 0.94)',
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  filterChipsRow: {
    gap: 8,
    paddingRight: SPACING.lg,
  },
  filterChip: {
    backgroundColor: 'rgba(21, 30, 41, 0.92)',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  filterChipActive: {
    backgroundColor: COLORS.energyGreen,
    borderColor: COLORS.energyGreen,
  },
  rightControls: {
    position: 'absolute',
    right: SPACING.md,
    gap: 8,
    zIndex: 15,
  },
  mapCtrlBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(21, 30, 41, 0.94)',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  mapCtrlBtnActive: {
    borderColor: COLORS.energyGreenBorder,
  },
  popupCard: {
    position: 'absolute',
    left: SPACING.md,
    right: 68,
    backgroundColor: 'rgba(21, 30, 41, 0.97)',
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    borderColor: COLORS.energyGreenBorder,
    padding: SPACING.md + 2,
    gap: 10,
    zIndex: 25,
    ...SHADOWS.floating,
  },
  popupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  popupCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popupMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  popupActions: {
    flexDirection: 'row',
    gap: 6,
  },
  popup3DBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreenDim,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
  },
  popupDetailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  popupNavBtn: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
  },
  sheetBg: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sheetHandle: {
    backgroundColor: COLORS.textMuted,
    width: 42,
  },
  sheetContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  selectedCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md + 2,
    gap: SPACING.md,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stationThumbWrap: {
    width: 66,
    height: 66,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.energyGreenDim,
  },
  stationThumb: {
    width: 44,
    height: 44,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  aiRecPill: {
    backgroundColor: COLORS.energyGreenDim,
    borderColor: COLORS.energyGreenBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  noonBonusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.energyGreenDim,
    borderColor: COLORS.energyGreenBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  micBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.energyGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 8,
  },
  detailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  navBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm + 4,
  },
  rowThumb3D: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.energyGreenDim,
  },
  stationRowSelected: {
    borderColor: COLORS.energyGreen,
    backgroundColor: COLORS.surfaceElevated,
  },
  stationRowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
