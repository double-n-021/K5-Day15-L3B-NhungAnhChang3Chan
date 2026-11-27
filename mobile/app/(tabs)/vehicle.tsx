import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  ChevronDown,
  ChevronUp,
  Info,
  Minus,
  Play,
  Plus,
  ShieldCheck,
} from 'lucide-react-native';
import { AnimatedBatteryBar, getBatteryColor } from '@/components/shared/AnimatedBatteryBar';
import { ASSETS_3D } from '@/data/assets3d';
import { VEHICLES } from '@/data/vehicles';
import { HANOI_WEATHER_STATES } from '@/data/weather';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { WeatherConditionId } from '@/types';

export default function VehicleScreen() {
  const insets = useSafeAreaInsets();
  const {
    vehicleId,
    setVehicleId,
    journeyInput,
    setBatteryPct,
    weather,
    setWeatherCondition,
    recommendation,
    greenPoints,
    rewardHistory,
    startDemo,
  } = useChargePilotStore();

  const [showLicenses, setShowLicenses] = useState(false);
  const [angleIdx, setAngleIdx] = useState(0);

  const vehicle = VEHICLES[vehicleId];
  const activeAngle = vehicle.angles[angleIdx] ?? vehicle.angles[0];
  const batteryColor = getBatteryColor(journeyInput.batteryPct);

  const weatherIcon3D = (wId: WeatherConditionId) => {
    if (wId === 'mild_sun') return ASSETS_3D.sunGold;
    if (wId === 'overcast_cool') return ASSETS_3D.weatherSunCloud;
    return ASSETS_3D.weatherRain;
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={[TYPOGRAPHY.screenTitle, { color: COLORS.textPrimary }]}>
            Xe của tôi
          </Text>
          <Image
            source={vehicle.category === 'motorbike' ? ASSETS_3D.scooterIcon : ASSETS_3D.carIcon}
            style={{ width: 28, height: 28 }}
            contentFit="contain"
          />
        </View>

        {/* Strict 2-Vehicle Switcher */}
        <View style={styles.switcherRow}>
          {(['vfe34', 'vinfast_evo200'] as const).map((id) => {
            const active = vehicleId === id;
            const v = VEHICLES[id];
            return (
              <Pressable
                key={id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setAngleIdx(0);
                  setVehicleId(id);
                }}
                style={[styles.switchPill, active && styles.switchPillActive]}
              >
                <Text
                  style={[
                    TYPOGRAPHY.cardTitle,
                    { color: active ? '#0B1017' : COLORS.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {v.name}
                </Text>
                <Text
                  style={[
                    TYPOGRAPHY.micro,
                    { color: active ? '#0B1017' : COLORS.textSecondary },
                  ]}
                >
                  {v.usableBatteryKwh} kWh · {v.connectorType}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Vehicle Showcase Card */}
        <View style={styles.card}>
          <View style={styles.heroImageWrap}>
            <Image
              source={activeAngle.source}
              style={styles.heroImage}
              contentFit="cover"
              transition={150}
            />
            {vehicle.angles.length > 1 && (
              <View style={styles.angleSwitchRow}>
                {vehicle.angles.map((ang, idx) => {
                  const active = (vehicle.angles[angleIdx] ? angleIdx : 0) === idx;
                  return (
                    <Pressable
                      key={ang.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setAngleIdx(idx);
                      }}
                      style={[styles.anglePill, active && styles.anglePillActive]}
                    >
                      <Text
                        style={[
                          TYPOGRAPHY.micro,
                          { color: active ? '#0B1017' : COLORS.textPrimary, fontWeight: '700' },
                        ]}
                      >
                        {ang.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          <View style={styles.vehicleBody}>
            <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]}>
              {vehicle.name}
            </Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
              {vehicle.paintName} · {vehicle.segment}
            </Text>

            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                  {vehicle.usableBatteryKwh} kWh
                </Text>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                  Pin khả dụng
                </Text>
              </View>
              <View style={styles.specItem}>
                <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                  {vehicle.wltpRangeKm} km
                </Text>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                  Phạm vi chuẩn
                </Text>
              </View>
              <View style={styles.specItem}>
                <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]}>
                  {vehicle.maxDcPowerKw} kW
                </Text>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                  {vehicle.connectorType}
                </Text>
              </View>
            </View>

            <View style={styles.fastChargeBanner}>
              <Image
                source={ASSETS_3D.flashGold}
                style={{ width: 18, height: 18 }}
                contentFit="contain"
              />
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, flex: 1 }]}>
                {vehicle.fastChargeNote}
              </Text>
            </View>
          </View>
        </View>

        {/* Simulated 3D Battery Control */}
        <View style={styles.cardPad}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Image
                source={ASSETS_3D.battery}
                style={{ width: 30, height: 30 }}
                contentFit="contain"
              />
              <View>
                <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
                  Mức pin mô phỏng hiện tại
                </Text>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                  Tầm chạy thực tế: ~{recommendation.summary.estimatedRangeKm} km
                </Text>
              </View>
            </View>
            <Text style={[TYPOGRAPHY.metricLarge, { color: batteryColor }]}>
              {journeyInput.batteryPct}%
            </Text>
          </View>

          <AnimatedBatteryBar percentage={journeyInput.batteryPct} height={10} />

          <View style={styles.batteryBtnsRow}>
            {[10, 18, 35, 60, 80].map((val) => (
              <Pressable
                key={val}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setBatteryPct(val);
                }}
                style={[
                  styles.presetPctBtn,
                  journeyInput.batteryPct === val && styles.presetPctBtnActive,
                ]}
              >
                <Text
                  style={[
                    TYPOGRAPHY.metricSmall,
                    {
                      color:
                        journeyInput.batteryPct === val ? '#0B1017' : COLORS.textPrimary,
                    },
                  ]}
                >
                  {val}%
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setBatteryPct(journeyInput.batteryPct - 2)}
              style={styles.miniStep}
            >
              <Minus size={15} color={COLORS.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => setBatteryPct(journeyInput.batteryPct + 2)}
              style={styles.miniStep}
            >
              <Plus size={15} color={COLORS.textPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Weather Condition Simulator */}
        <View style={styles.cardPad}>
          <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
            Thời tiết Hà Nội (mô phỏng tiêu hao pin)
          </Text>
          <View style={styles.weatherGrid}>
            {(Object.keys(HANOI_WEATHER_STATES) as WeatherConditionId[]).map((wId) => {
              const w = HANOI_WEATHER_STATES[wId];
              const active = weather.id === wId;
              return (
                <Pressable
                  key={wId}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setWeatherCondition(wId);
                  }}
                  style={[styles.weatherPill, active && styles.weatherPillActive]}
                >
                  <Image
                    source={weatherIcon3D(wId)}
                    style={{ width: 22, height: 22 }}
                    contentFit="contain"
                  />
                  <Text
                    style={[
                      TYPOGRAPHY.caption,
                      { color: active ? '#0B1017' : COLORS.textPrimary },
                    ]}
                  >
                    {w.temperatureC}°C · {w.conditionLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Green Off-Peak Points & Demo Mode */}
        <View style={styles.cardPad}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image
                source={ASSETS_3D.trophyGold}
                style={{ width: 24, height: 24 }}
                contentFit="contain"
              />
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
                Điểm Sạc Xanh (Trưa nắng)
              </Text>
            </View>
            <Text style={[TYPOGRAPHY.metricLarge, { color: COLORS.warningAmber }]}>
              {greenPoints}đ
            </Text>
          </View>
          {rewardHistory.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Image
                  source={ASSETS_3D.medalGold}
                  style={{ width: 16, height: 16 }}
                  contentFit="contain"
                />
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, flex: 1 }]} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>
                +{item.points}đ
              </Text>
            </View>
          ))}
          <Pressable
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              startDemo();
            }}
            style={styles.demoTriggerBtn}
          >
            <Play size={15} color="#0B1017" fill="#0B1017" />
            <Text style={[TYPOGRAPHY.cardTitle, { color: '#0B1017' }]}>
              Chạy trình diễn Demo Hackathon (13 bước)
            </Text>
          </Pressable>
        </View>

        {/* Asset Licenses */}
        <Pressable
          onPress={() => setShowLicenses((v) => !v)}
          style={styles.cardPad}
        >
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color={COLORS.navBlue} />
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
                Nguồn dữ liệu & Bản quyền
              </Text>
            </View>
            {showLicenses ? (
              <ChevronUp size={18} color={COLORS.textSecondary} />
            ) : (
              <ChevronDown size={18} color={COLORS.textSecondary} />
            )}
          </View>

          {showLicenses && (
            <View style={styles.licenseBody}>
              <Text style={[TYPOGRAPHY.caption, styles.licenseLine]}>
                • Icon giao diện: 3dicons (CC0) & Microsoft Fluent UI Emoji 3D (MIT).
              </Text>
              <Text style={[TYPOGRAPHY.caption, styles.licenseLine]}>
                • Bản đồ 3D Hà Nội: OpenFreeMap & OpenStreetMap (ODbL) render qua MapLibre (MIT) & OSRM.
              </Text>
              <View style={styles.infoNote}>
                <Info size={14} color={COLORS.warningAmber} />
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.warningAmber, flex: 1 }]}>
                  Trạng thái trụ trống, hàng chờ và mô phỏng tiêu hao là dữ liệu demo cho Hackathon.
                </Text>
              </View>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
  },
  switcherRow: {
    flexDirection: 'row',
    gap: 10,
  },
  switchPill: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  switchPillActive: {
    backgroundColor: COLORS.energyGreen,
    borderColor: COLORS.energyGreen,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  heroImageWrap: {
    position: 'relative',
    width: '100%',
    height: 224,
    backgroundColor: '#0B1017',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  angleSwitchRow: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    gap: 6,
  },
  anglePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(11, 16, 23, 0.82)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  anglePillActive: {
    backgroundColor: COLORS.energyGreen,
    borderColor: COLORS.energyGreen,
  },
  vehicleBody: {
    padding: SPACING.lg,
    gap: 10,
  },
  specGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  specItem: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    padding: 10,
    gap: 2,
  },
  fastChargeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm,
    padding: 10,
  },
  cardPad: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batteryBtnsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  presetPctBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetPctBtnActive: {
    backgroundColor: COLORS.energyGreen,
    borderColor: COLORS.energyGreen,
  },
  miniStep: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weatherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  weatherPillActive: {
    backgroundColor: COLORS.energyGreen,
    borderColor: COLORS.energyGreen,
  },
  licenseBody: {
    gap: 6,
    paddingTop: 4,
  },
  licenseLine: {
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.warningAmberDim,
    borderRadius: RADIUS.sm,
    padding: 10,
    marginTop: 4,
  },
  demoTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
    marginTop: 4,
  },
});
