import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react-native';
import { AnimatedBatteryBar, getBatteryColor } from '@/components/shared/AnimatedBatteryBar';
import { ASSETS_3D } from '@/data/assets3d';
import { CUSTOM_ICONS } from '@/data/customIcons';
import { VEHICLES } from '@/data/vehicles';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { WeatherConditionId } from '@/types';

// Short switcher labels so both buttons stay one line and equal height (full name is shown on the card).
const SWITCH_LABELS = {
  vfe34: { title: 'VinFast VF e34', connector: 'CCS2' },
  vinfast_evo200: { title: 'Evo200 2023', connector: 'LFP / AC' },
} as const;

export default function VehicleScreen() {
  const insets = useSafeAreaInsets();
  const {
    vehicleId,
    setVehicleId,
    journeyInput,
    confirmBatteryPct,
    weather,
    refreshLiveWeather,
    recommendation,
    greenPoints,
    rewardHistory,
    leaderboard,
    driverName,
    setDriverName,
    refreshLeaderboard,
  } = useChargePilotStore();

  const [showLicenses, setShowLicenses] = useState(false);
  const [showGreenRules, setShowGreenRules] = useState(false);
  const [angleIdx, setAngleIdx] = useState(0);
  const [nameDraft, setNameDraft] = useState(driverName);

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
                  {SWITCH_LABELS[id].title}
                </Text>
                <Text
                  style={[
                    TYPOGRAPHY.micro,
                    { color: active ? '#0B1017' : COLORS.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {v.usableBatteryKwh} kWh · {SWITCH_LABELS[id].connector}
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
                {vehicle.fastChargeNote.replace(/->/g, '→')}
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
                  confirmBatteryPct(val);
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
              onPress={() => confirmBatteryPct(journeyInput.batteryPct - 2)}
              style={styles.miniStep}
            >
              <Minus size={15} color={COLORS.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => confirmBatteryPct(journeyInput.batteryPct + 2)}
              style={styles.miniStep}
            >
              <Plus size={15} color={COLORS.textPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Live Auto-Synced Hanoi Weather (Open-Meteo via Server) */}
        <View style={styles.cardPad}>
          <View style={styles.greenHeaderRow}>
            <View style={styles.greenTitleLeft}>
              <Image
                source={weatherIcon3D(weather.id)}
                style={{ width: 22, height: 22, flexShrink: 0 }}
                contentFit="contain"
              />
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
                Thời tiết Hà Nội (Tự động)
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                void refreshLiveWeather();
              }}
              style={[styles.miniStep, { width: 'auto', paddingHorizontal: 10 }]}
            >
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen, fontWeight: '700' }]}>
                Cập nhật
              </Text>
            </Pressable>
          </View>
          <View style={{ marginTop: 6, gap: 4 }}>
            <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]}>
              {weather.temperatureC}°C · {weather.conditionLabel}
            </Text>
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, lineHeight: 19 }]}>
              {weather.impactExplanation}
            </Text>
          </View>
        </View>

        {/* Green Off-Peak Points */}
        <View style={styles.cardPad}>
          <View style={styles.greenHeaderRow}>
            <View style={styles.greenTitleLeft}>
              <Image
                source={CUSTOM_ICONS.greenCharge}
                style={{ width: 22, height: 22, flexShrink: 0 }}
                contentFit="contain"
              />
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
                Điểm Sạc Xanh
              </Text>
            </View>
            <View style={styles.greenScoreRight}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  void refreshLeaderboard();
                }}
                style={styles.miniRefreshBtn}
                accessibilityLabel="Làm mới bảng xếp hạng Green Score"
              >
                <RefreshCw size={14} color={COLORS.textSecondary} />
              </Pressable>
              <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]} numberOfLines={1}>
                {greenPoints}đ
              </Text>
            </View>
          </View>

          <TextInput
            value={nameDraft}
            onChangeText={(txt) => {
              setNameDraft(txt);
              setDriverName(txt);
            }}
            placeholder="Tên tài xế hiển thị trên Bảng xếp hạng"
            placeholderTextColor={COLORS.textMuted}
            style={styles.apiInput}
          />

          {rewardHistory.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 8 }}>
                <Image
                  source={CUSTOM_ICONS.greenCharge}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                  contentFit="contain"
                />
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, flex: 1 }]} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen, flexShrink: 0 }]}>
                +{item.points}đ
              </Text>
            </View>
          ))}
          {leaderboard.length > 0 && (
            <View style={styles.leaderboardBox}>
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary, fontWeight: '700' }]}>
                Bảng xếp hạng Sạc Xanh
              </Text>
              {leaderboard.slice(0, 3).map((row) => (
                <View key={`${row.rank}-${row.user_name}`} style={styles.rowBetween}>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, flex: 1, paddingRight: 8 }]} numberOfLines={1}>
                    #{row.rank} {row.user_name} ({row.green_sessions} phiên)
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.warningAmber, fontWeight: '700', flexShrink: 0 }]}>
                    {row.total_points}đ
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setShowGreenRules((v) => !v);
            }}
            style={styles.greenRulesToggle}
            accessibilityRole="button"
            accessibilityLabel="Cách tính điểm Sạc Xanh"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Info size={14} color={COLORS.energyGreen} />
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen, fontWeight: '700' }]}>
                Cách tính điểm Sạc Xanh
              </Text>
            </View>
            {showGreenRules ? (
              <ChevronUp size={15} color={COLORS.energyGreen} />
            ) : (
              <ChevronDown size={15} color={COLORS.energyGreen} />
            )}
          </Pressable>

          {showGreenRules && (
            <View style={styles.greenRulesBox}>
              <Text style={[TYPOGRAPHY.micro, styles.licenseLine]}>
                • +20đ: Sạc ngoài khung cao điểm lưới điện (17:30–22:30)
              </Text>
              <Text style={[TYPOGRAPHY.micro, styles.licenseLine]}>
                • +15đ: Trùng giờ bức xạ mặt trời cao (≥300 W/m²)
              </Text>
              <Text style={[TYPOGRAPHY.micro, styles.licenseLine]}>
                • +10đ: Trạm biểu giá bậc giờ QĐ 2892 hoặc sạc tại nhà
              </Text>
              <Text style={[TYPOGRAPHY.micro, styles.licenseLine]}>
                • +10đ: Khung thấp điểm đêm (22:30–06:00)
              </Text>
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen, marginTop: 2 }]}>
                Điểm chỉ cộng khi bạn bấm xác nhận theo lịch.
              </Text>
            </View>
          )}
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
    gap: 8,
  },
  greenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  greenTitleLeft: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  greenScoreRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  miniRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardBox: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    gap: 6,
  },
  greenRulesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.energyGreenDim,
    borderColor: COLORS.energyGreenBorder,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  greenRulesBox: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    gap: 4,
  },
  apiStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  apiInput: {
    minHeight: 42,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    color: COLORS.textPrimary,
    fontFamily: 'BeVietnamPro_400Regular',
    fontSize: 13,
  },
  checkApiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
  },
});
