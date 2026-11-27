import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Info, MapPin, Navigation, X, Zap } from 'lucide-react-native';
import { ChargerBayIllustration } from '@/components/charging/ChargerBayIllustration';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatVnd } from '@/services/decisionEngine';
import { getCachedRoute } from '@/services/routeService';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';

export default function StationDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stationId } = useLocalSearchParams<{ stationId?: string }>();
  const {
    effectiveStations,
    effectiveInput,
    selectedStationId,
    selectStation,
    recommendation,
  } = useChargePilotStore();

  const targetId = stationId ?? selectedStationId;
  const station =
    effectiveStations.find((s) => s.id === targetId) ?? effectiveStations[0];

  const route = getCachedRoute(effectiveInput.origin.id, station.id);
  const distanceKm = route ? (route.distanceMeters / 1000).toFixed(1) : '3.0';
  const estChargeMin =
    recommendation.recommended?.station.id === station.id
      ? recommendation.recommended.chargeMin
      : 22;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen }]}>
            {station.operator} · {station.district}
          </Text>
          <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]} numberOfLines={2}>
            {station.name}
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          accessibilityLabel="Đóng chi tiết trạm"
        >
          <X size={20} color={COLORS.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Verified Address & Status */}
        <View style={styles.infoCard}>
          <View style={styles.rowBetween}>
            <StatusBadge status={station.status} />
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Tọa độ xác thực OSM/VinFast
            </Text>
          </View>

          <View style={styles.addrRow}>
            <MapPin size={16} color={COLORS.textSecondary} />
            <Text style={[TYPOGRAPHY.body, { color: COLORS.textPrimary, flex: 1 }]}>
              {station.address}
            </Text>
          </View>
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
            Vị trí trụ: {station.bayLocationNote}
          </Text>
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
            {station.parkingNote}
          </Text>
        </View>

        {/* Simulated Telemetry Notice */}
        <View style={styles.simNotice}>
          <Info size={16} color={COLORS.navBlue} />
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, flex: 1 }]}>
            Dữ liệu vận hành mô phỏng: số trụ trống, hàng chờ, thời gian chờ và đơn giá ({formatVnd(station.pricePerKwhVnd)}/kWh) được mô phỏng cho Hackathon.
          </Text>
        </View>

        {/* Metrics Summary */}
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
              {distanceKm} km
            </Text>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Khoảng cách
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]}>
              {station.maxPowerKw} kW
            </Text>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Công suất tối đa
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
              {station.estimatedWaitMin}p
            </Text>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Chờ ước tính
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
              ~{estChargeMin}p
            </Text>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Thời gian sạc
            </Text>
          </View>
        </View>

        {/* Visual Charging Bay Grid */}
        <View style={styles.baysHeader}>
          <Zap size={16} color={COLORS.energyGreen} />
          <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
            Trạng thái từng trụ sạc ({station.availableBays}/{station.totalBays} trống)
          </Text>
        </View>

        <View style={styles.baysGrid}>
          {station.bays.map((bay) => (
            <ChargerBayIllustration key={bay.id} bay={bay} />
          ))}
        </View>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            selectStation(station.id);
            router.replace('/navigation');
          }}
          disabled={station.status === 'maintenance'}
          style={[
            styles.navCta,
            station.status === 'maintenance' && { opacity: 0.45 },
          ]}
        >
          <Navigation size={18} color="#0B1017" />
          <Text style={[TYPOGRAPHY.sectionTitle, { color: '#0B1017' }]}>
            {station.status === 'maintenance'
              ? 'Trạm đang bảo trì — Không thể dẫn đường'
              : 'Dẫn đường mô phỏng tới trạm này'}
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
  header: {
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
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  simNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.navBlueDim,
    borderColor: COLORS.navBlueBorder,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 3,
  },
  baysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  baysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  navCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
    marginTop: SPACING.sm,
  },
});
