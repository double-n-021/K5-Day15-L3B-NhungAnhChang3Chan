import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MascotAssistant } from '@/components/mascot/MascotAssistant';
import { AnimatedBatteryBar, getBatteryColor } from '@/components/shared/AnimatedBatteryBar';
import { ASSETS_3D } from '@/data/assets3d';
import { VEHICLES } from '@/data/vehicles';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { VehicleId } from '@/types';

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
    refreshUserLocation,
    triggerVoiceAssistant,
  } = useChargePilotStore();

  const vehicle = VEHICLES[vehicleId];
  const batteryPct = effectiveInput.batteryPct;
  const batteryColor = getBatteryColor(batteryPct);
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

  const mascotGreeting =
    itineraryStatus === 'accepted' && activeProposal
      ? `Mình đang giữ lịch đi ${activeProposal.destinationName}, ghé ${activeProposal.stationName}. Bấm Mic nếu bạn muốn đổi kế hoạch nhé.`
      : `Chào bạn! Đang chọn ${vehicle.name}. Bấm Mic nói mình biết bạn muốn đi đâu và mấy giờ nhé.`;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Minimal 3D Top Header */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              void refreshUserLocation();
            }}
            style={styles.locationRow}
            accessibilityLabel="Cập nhật vị trí GPS hiện tại"
          >
            <Image
              source={ASSETS_3D.mapPinGold}
              style={{ width: 22, height: 22, flexShrink: 0 }}
              contentFit="contain"
            />
            <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.textPrimary, flexShrink: 1 }]} numberOfLines={1}>
              {gpsStatus === 'loading' ? 'Đang lấy GPS...' : locationLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/vehicle')}
            style={styles.pointsPill}
            accessibilityLabel="Điểm Sạc Xanh hiện có"
          >
            <Image
              source={ASSETS_3D.trophyGold}
              style={{ width: 18, height: 18, flexShrink: 0 }}
              contentFit="contain"
            />
            <Text style={[TYPOGRAPHY.metricSmall, { color: COLORS.warningAmber }]} numberOfLines={1}>
              {greenPoints} điểm
            </Text>
          </Pressable>
        </View>

        {/* Strict 2-Vehicle Selector: VinFast VF e34 & VinFast Evo200 2023 */}
        <View style={styles.catRow}>
          <Pressable
            onPress={() => handleSelectVehicle('vfe34')}
            style={[styles.catPill, vehicleId === 'vfe34' && styles.catPillActive]}
          >
            <Image
              source={ASSETS_3D.carIcon}
              style={{ width: 20, height: 20, flexShrink: 0 }}
              contentFit="contain"
            />
            <Text
              style={[
                TYPOGRAPHY.caption,
                {
                  color: vehicleId === 'vfe34' ? '#0B1017' : COLORS.textPrimary,
                  fontWeight: '700',
                  flexShrink: 1,
                },
              ]}
              numberOfLines={1}
            >
              VinFast VF e34
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleSelectVehicle('vinfast_evo200')}
            style={[styles.catPill, vehicleId === 'vinfast_evo200' && styles.catPillActive]}
          >
            <Image
              source={ASSETS_3D.scooterIcon}
              style={{ width: 20, height: 20, flexShrink: 0 }}
              contentFit="contain"
            />
            <Text
              style={[
                TYPOGRAPHY.caption,
                {
                  color: vehicleId === 'vinfast_evo200' ? '#0B1017' : COLORS.textPrimary,
                  fontWeight: '700',
                  flexShrink: 1,
                },
              ]}
              numberOfLines={1}
            >
              Evo200 2023
            </Text>
          </Pressable>
        </View>

        {/* Vehicle Showcase Card */}
        <View style={styles.heroCard}>
          <Image
            source={vehicle.angles[0].source}
            style={styles.heroImage}
            contentFit={vehicle.category === 'motorbike' ? 'contain' : 'cover'}
            transition={150}
          />

          <View style={styles.heroBody}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
                  {vehicle.name}
                </Text>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={1}>
                  {vehicle.segment} · {effectiveWeather.temperatureC}°C
                </Text>
              </View>

              <View style={styles.batteryRight}>
                <Image
                  source={ASSETS_3D.battery}
                  style={{ width: 22, height: 22 }}
                  contentFit="contain"
                />
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[TYPOGRAPHY.metricLarge, { color: batteryColor }]}>
                    {batteryPct}%
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    ~{recommendation.summary.estimatedRangeKm} km
                  </Text>
                </View>
              </View>
            </View>

            <AnimatedBatteryBar percentage={batteryPct} height={8} showSegments={false} />
          </View>
        </View>

        {/* Solar Noon Off-Peak Reward Strip */}
        <Pressable
          onPress={handleTapMic}
          style={styles.noonStrip}
          accessibilityLabel="Tìm trạm sạc khung giờ trưa nắng nhận điểm thưởng"
        >
          <Image
            source={ASSETS_3D.sunGold}
            style={{ width: 28, height: 28 }}
            contentFit="contain"
          />
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, flex: 1 }]}>
            Trưa nắng 11:00–14:00 vắng xe: sạc nhận{' '}
            <Text style={{ color: COLORS.energyGreen, fontWeight: '700' }}>
              +80 điểm Sạc Xanh
            </Text>
          </Text>
          <Image
            source={ASSETS_3D.coin}
            style={{ width: 22, height: 22 }}
            contentFit="contain"
          />
        </Pressable>

        {/* Original P-006 Mascot + 3D Mic Centerpiece */}
        <View style={styles.voiceStage}>
          <MascotAssistant
            mood={itineraryStatus === 'accepted' ? 'happy' : 'idle'}
            speech={mascotGreeting}
            size={64}
          />

          <Pressable
            onPress={handleTapMic}
            style={({ pressed }) => [
              styles.bigMicBtn,
              pressed && { transform: [{ scale: 0.96 }], opacity: 0.92 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Bấm Mic để nói với trợ lý AI"
          >
            <Image
              source={ASSETS_3D.micGold}
              style={{ width: 40, height: 40 }}
              contentFit="contain"
            />
          </Pressable>

          <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
            Nhấn Mic để nói với Trợ lý AI
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/journey')}
            hitSlop={10}
          >
            <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
              hoặc chạm để gõ yêu cầu bằng chữ
            </Text>
          </Pressable>
        </View>
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
    gap: SPACING.md - 2,
  },
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
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catPillActive: {
    backgroundColor: COLORS.energyGreen,
    borderColor: COLORS.energyGreen,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  heroImage: {
    width: '100%',
    height: 210,
    backgroundColor: '#0B1017',
  },
  heroBody: {
    padding: SPACING.md + 2,
    paddingTop: SPACING.md,
    gap: SPACING.sm + 2,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batteryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noonStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warningAmberBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 3,
  },
  voiceStage: {
    marginTop: 2,
    gap: SPACING.sm + 2,
    alignItems: 'center',
  },
  bigMicBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: COLORS.energyGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(54, 230, 163, 0.35)',
    marginTop: 2,
    ...SHADOWS.floating,
  },
});
