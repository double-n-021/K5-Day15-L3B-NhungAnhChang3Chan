import React, { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getBatteryColor } from '@/components/shared/AnimatedBatteryBar';
import { ASSETS_3D } from '@/data/assets3d';
import { VEHICLES } from '@/data/vehicles';
import { isBatteryFresh, useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { VehicleId } from '@/types';

// Quick battery levels: one tap is enough to stop the AI asking "pin còn bao nhiêu %?".
const BATTERY_CHIPS = [10, 20, 30, 50, 70, 90];

// Max Green Score at midday per codebase/tools.py estimate_green_reward:
// off-peak +20, solar ≥300 W/m² +15, QĐ 2892 time-of-use station +10.
const NOON_MAX_POINTS = 45;

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    vehicleId,
    setVehicleId,
    effectiveInput,
    effectiveWeather,
    recommendation,
    greenPoints,
    itineraryStatus,
    proposedOptions,
    activeOptionIndex,
    locationLabel,
    gpsStatus,
    batteryConfirmedAt,
    refreshUserLocation,
    triggerVoiceAssistant,
    confirmBatteryPct,
    queuePrompt,
  } = useChargePilotStore();

  const [promptText, setPromptText] = useState('');
  const [needBattery, setNeedBattery] = useState(false);

  const vehicle = VEHICLES[vehicleId];
  const batteryPct = effectiveInput.batteryPct;
  const batteryFresh = isBatteryFresh(batteryConfirmedAt);
  const batteryColor = batteryFresh ? getBatteryColor(batteryPct) : COLORS.textMuted;
  const activeProposal = proposedOptions[activeOptionIndex] ?? null;

  const handleTapMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    triggerVoiceAssistant();
    router.push('/(tabs)/journey');
  };

  const handleSelectVehicle = (nextId: VehicleId) => {
    if (vehicleId === nextId) return;
    Haptics.selectionAsync().catch(() => {});
    setVehicleId(nextId);
  };

  const handlePickBattery = (pct: number) => {
    Haptics.selectionAsync().catch(() => {});
    confirmBatteryPct(pct);
    setNeedBattery(false);
  };

  const handleStepBattery = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    confirmBatteryPct(batteryPct + delta);
    setNeedBattery(false);
  };

  const handleFindNearest = () => {
    // Never send the 18% demo default: the driver must report a real level first.
    if (!batteryFresh) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setNeedBattery(true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    queuePrompt('Tìm trạm sạc gần nhất');
    router.push('/(tabs)/journey');
  };

  const handleSubmitText = () => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    queuePrompt(trimmed);
    setPromptText('');
    router.push('/(tabs)/journey');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Location + points */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              void refreshUserLocation();
            }}
            style={styles.locationRow}
            accessibilityLabel="Cập nhật vị trí GPS hiện tại"
          >
            <Image source={ASSETS_3D.mapPinGold} style={styles.icon22} contentFit="contain" />
            <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
              {gpsStatus === 'loading' ? 'Đang lấy GPS...' : locationLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/vehicle')}
            style={styles.pointsPill}
            accessibilityLabel="Điểm Sạc Xanh hiện có"
          >
            <Image source={ASSETS_3D.trophyGold} style={styles.icon18} contentFit="contain" />
            <Text style={[TYPOGRAPHY.metricSmall, { color: COLORS.warningAmber }]} numberOfLines={1}>
              {greenPoints} điểm
            </Text>
          </Pressable>
        </View>

        {/* Vehicle + battery card (compact) */}
        <View style={styles.card}>
          <View style={styles.catRow}>
            {(['vfe34', 'vinfast_evo200'] as VehicleId[]).map((id) => {
              const active = vehicleId === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => handleSelectVehicle(id)}
                  style={[styles.catPill, active && styles.catPillActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Image
                    source={id === 'vfe34' ? ASSETS_3D.carIcon : ASSETS_3D.scooterIcon}
                    style={styles.icon20}
                    contentFit="contain"
                  />
                  <Text
                    style={[
                      TYPOGRAPHY.caption,
                      { color: active ? '#0B1017' : COLORS.textPrimary, fontWeight: '700', flexShrink: 1 },
                    ]}
                    numberOfLines={1}
                  >
                    {id === 'vfe34' ? 'VinFast VF e34' : 'Evo200 2023'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.vehicleRow}>
            <Image
              source={vehicle.angles[0].source}
              style={styles.vehicleThumb}
              contentFit={vehicle.category === 'motorbike' ? 'contain' : 'cover'}
              transition={150}
            />
            <View style={{ flex: 1 }}>
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
                {vehicle.name}
              </Text>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={1}>
                {effectiveWeather.temperatureC}°C
                {batteryFresh ? ` · ~${recommendation.summary.estimatedRangeKm} km` : ''}
              </Text>
            </View>

            <View style={styles.batteryReadout}>
              {batteryFresh && (
                <Pressable
                  onPress={() => handleStepBattery(-5)}
                  hitSlop={8}
                  style={styles.stepBtn}
                  accessibilityLabel="Giảm 5% pin"
                >
                  <Text style={styles.stepTxt}>−</Text>
                </Pressable>
              )}
              <Text style={[TYPOGRAPHY.metricLarge, { color: batteryColor }]}>
                {batteryFresh ? `${batteryPct}%` : '--%'}
              </Text>
              {batteryFresh && (
                <Pressable
                  onPress={() => handleStepBattery(5)}
                  hitSlop={8}
                  style={styles.stepBtn}
                  accessibilityLabel="Tăng 5% pin"
                >
                  <Text style={styles.stepTxt}>+</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={[styles.chipsWrap, needBattery && styles.chipsWrapAlert]}>
            <Text
              style={[TYPOGRAPHY.micro, { color: needBattery ? COLORS.criticalRed : COLORS.textSecondary }]}
              numberOfLines={1}
            >
              {needBattery
                ? 'Chọn mức pin trước để mình tìm trạm nhé'
                : batteryFresh && batteryConfirmedAt !== null
                  ? `Pin hiện tại · báo lúc ${formatHHMM(batteryConfirmedAt)}, AI tự dùng mức này 30 phút`
                  : 'Pin hiện tại còn khoảng bao nhiêu?'}
            </Text>
            <View style={styles.chipsRow}>
              {BATTERY_CHIPS.map((pct) => {
                const active = batteryFresh && batteryPct === pct;
                return (
                  <Pressable
                    key={pct}
                    onPress={() => handlePickBattery(pct)}
                    style={[styles.chip, active && { backgroundColor: getBatteryColor(pct), borderColor: getBatteryColor(pct) }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Pin còn ${pct}%`}
                  >
                    <Text style={[TYPOGRAPHY.caption, { color: active ? '#0B1017' : COLORS.textPrimary, fontWeight: '700' }]}>
                      {pct}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Primary one-tap actions */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleTapMic}
            style={({ pressed }) => [styles.bigMicBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Bấm Mic để nói với trợ lý AI"
          >
            <Image source={ASSETS_3D.micGold} style={{ width: 38, height: 38 }} contentFit="contain" />
            <Text style={[TYPOGRAPHY.micro, { color: '#0B1017', fontWeight: '700' }]}>Nói</Text>
          </Pressable>

          <Pressable
            onPress={handleFindNearest}
            style={({ pressed }) => [styles.nearestBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Tìm trạm sạc gần nhất ngay"
          >
            <Image source={ASSETS_3D.evChargerStation} style={{ width: 40, height: 40 }} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
                Tìm trạm gần nhất
              </Text>
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]} numberOfLines={1}>
                {batteryFresh ? `GPS + ${vehicle.name} + pin ${batteryPct}%` : 'Chọn mức pin ở trên trước'}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Always-visible text input */}
        <View style={styles.inputRow}>
          <TextInput
            value={promptText}
            onChangeText={setPromptText}
            onSubmitEditing={handleSubmitText}
            placeholder="Hoặc gõ: đi Hồ Gươm lúc 15h…"
            placeholderTextColor={COLORS.textMuted}
            style={[TYPOGRAPHY.bodyMedium, styles.input]}
            returnKeyType="send"
            accessibilityLabel="Gõ yêu cầu cho trợ lý AI"
          />
          <Pressable
            onPress={handleSubmitText}
            disabled={!promptText.trim()}
            style={[styles.sendBtn, !promptText.trim() && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Gửi yêu cầu"
          >
            <Text style={[TYPOGRAPHY.caption, { color: '#0B1017', fontWeight: '700' }]}>Gửi</Text>
          </Pressable>
        </View>

        {/* One line when a plan is being held (replaces the mascot greeting) */}
        {itineraryStatus === 'accepted' && activeProposal && (
          <Pressable onPress={() => router.push('/(tabs)/journey')} style={styles.planLine}>
            <Image source={ASSETS_3D.clockGold} style={styles.icon20} contentFit="contain" />
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, flex: 1 }]} numberOfLines={1}>
              Đang giữ lịch: ghé {activeProposal.stationName} → {activeProposal.destinationName}
            </Text>
          </Pressable>
        )}

        {/* Green Score tip: numbers match the backend, tap opens points instead of the mic */}
        <Pressable
          onPress={() => router.push('/(tabs)/vehicle')}
          style={styles.noonStrip}
          accessibilityLabel="Xem điểm Sạc Xanh"
        >
          <Image source={ASSETS_3D.sunGold} style={{ width: 24, height: 24 }} contentFit="contain" />
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, flex: 1 }]} numberOfLines={2}>
            Sạc trưa nắng 11:00–14:00, ngoài cao điểm: đến{' '}
            <Text style={{ color: COLORS.energyGreen, fontWeight: '700' }}>+{NOON_MAX_POINTS} điểm Sạc Xanh</Text>
          </Text>
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
    paddingBottom: SPACING.xxl,
    gap: SPACING.md,
  },
  icon18: { width: 18, height: 18, flexShrink: 0 },
  icon20: { width: 20, height: 20, flexShrink: 0 },
  icon22: { width: 22, height: 22, flexShrink: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: SPACING.sm,
  },
  locationRow: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pointsPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningAmberDim,
    borderWidth: 1,
    borderColor: COLORS.warningAmberBorder,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.card,
  },
  catRow: {
    flexDirection: 'row',
    gap: 8,
  },
  catPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catPillActive: {
    backgroundColor: COLORS.energyGreen,
    borderColor: COLORS.energyGreen,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  vehicleThumb: {
    width: 76,
    height: 52,
    borderRadius: RADIUS.sm,
    backgroundColor: '#0B1017',
  },
  batteryReadout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepTxt: {
    color: COLORS.textPrimary,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  chipsWrap: {
    gap: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipsWrapAlert: {
    borderColor: COLORS.criticalRedBorder,
    backgroundColor: COLORS.criticalRedDim,
    padding: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'stretch',
  },
  bigMicBtn: {
    width: 84,
    minHeight: 84,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.energyGreen,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 3,
    borderColor: COLORS.energyGreenBorder,
    ...SHADOWS.floating,
  },
  nearestBtn: {
    flex: 1,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: SPACING.lg,
    paddingRight: 6,
    minHeight: 52,
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    paddingVertical: 10,
  },
  sendBtn: {
    paddingHorizontal: SPACING.lg,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.energyGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.navBlueDim,
    borderWidth: 1,
    borderColor: COLORS.navBlueBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  noonStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
});
