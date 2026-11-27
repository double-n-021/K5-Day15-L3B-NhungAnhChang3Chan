import React, { useState } from 'react';
import {
  Modal,
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
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  GitCompareArrows,
  Info,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react-native';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatVnd } from '@/services/decisionEngine';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';

export default function RecommendationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    effectiveInput,
    recommendation,
    selectStation,
    acceptProposedItinerary,
    declineProposedItinerary,
    requestAlternativeOption,
    proposedOptions,
    activeOptionIndex,
  } = useChargePilotStore();

  const [showCompare, setShowCompare] = useState(false);

  const rec = recommendation.recommended;
  const activeStationEval =
    proposedOptions[activeOptionIndex]?.hanoiStationId
      ? ([rec, ...recommendation.alternatives].find(
          (x) => x?.station.id === proposedOptions[activeOptionIndex]?.hanoiStationId
        ) ?? rec)
      : rec;

  const handleStartJourney = (stationId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    selectStation(stationId);
    router.push('/navigation');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top Nav Header */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Quay lại"
        >
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]}>
            Đề xuất phương án sạc AI
          </Text>
          <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
            Mô phỏng quyết định · Đến {effectiveInput.primaryDestination.shortName} trước {effectiveInput.arrivalDeadline}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!recommendation.hasSafeRoute || !rec ? (
          <View style={styles.criticalBox}>
            <ShieldAlert size={24} color={COLORS.criticalRed} />
            <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.criticalRed }]}>
              {recommendation.criticalAlertTitle ?? 'Không có phương án an toàn'}
            </Text>
            <Text style={[TYPOGRAPHY.body, { color: COLORS.textPrimary }]}>
              {recommendation.criticalAlertMessage}
            </Text>
          </View>
        ) : (
          <>
            {/* Hero Recommendation Card */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.aiBadge}>
                  <Sparkles size={13} color="#0B1017" />
                  <Text style={[TYPOGRAPHY.micro, { color: '#0B1017' }]}>
                    PHƯƠNG ÁN TỐI ƯU NHẤT
                  </Text>
                </View>
                <StatusBadge status={rec.station.status} compact />
              </View>

              <Text style={[TYPOGRAPHY.screenTitle, { color: COLORS.textPrimary }]}>
                {rec.station.shortName}
              </Text>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                {rec.station.address}
              </Text>

              {/* Key Telemetry Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                    {rec.distanceToStationKm} km
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Chạy {rec.driveToStationMin} phút
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]}>
                    {rec.waitMin} phút
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Thời gian chờ
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                    {rec.chargeMin} phút
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Sạc ({rec.station.maxPowerKw}kW)
                  </Text>
                </View>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.warningAmber }]}>
                    {rec.arrivalBatteryPct}% → {rec.targetDepartureBatteryPct}%
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Pin đến / rời trạm
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                    {formatVnd(rec.estimatedCostVnd)}
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    Chi phí mô phỏng
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text
                    style={[
                      TYPOGRAPHY.metricMedium,
                      {
                        color:
                          rec.scheduleSlackMin >= 0
                            ? COLORS.energyGreen
                            : COLORS.criticalRed,
                      },
                    ]}
                  >
                    {rec.estimatedArrivalTime}
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                    {rec.scheduleSlackMin >= 0
                      ? `Sớm ${rec.scheduleSlackMin}p`
                      : `Trễ ${Math.abs(rec.scheduleSlackMin)}p`}
                  </Text>
                </View>
              </View>

              {/* Safety Checks */}
              <View style={styles.safetyWrap}>
                {[
                  {
                    ok: rec.safetyChecks.reachableWithBuffer,
                    text: `Đủ pin tới trạm an toàn (còn ${rec.arrivalBatteryPct}%)`,
                  },
                  {
                    ok: rec.safetyChecks.stationOperational,
                    text: `Trạm hoạt động bình thường (${rec.station.availableBays}/${rec.station.totalBays} trụ trống)`,
                  },
                  {
                    ok: rec.safetyChecks.enoughForNextLeg,
                    text: `Đủ pin dự phòng chặng cuối (${rec.nextArrivalBatteryPct}% khi tới đích)`,
                  },
                ].map((chk, i) => (
                  <View key={i} style={styles.safetyItem}>
                    <CheckCircle2
                      size={15}
                      color={chk.ok ? COLORS.energyGreen : COLORS.warningAmber}
                    />
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, flex: 1 }]}>
                      {chk.text}
                    </Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/station-detail',
                    params: { stationId: rec.station.id },
                  })
                }
                style={styles.stationDetailLink}
              >
                <Zap size={14} color={COLORS.navBlue} />
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.navBlue }]}>
                  Xem sơ đồ {rec.station.totalBays} trụ sạc tại trạm này
                </Text>
              </Pressable>
            </View>

            {/* Why Better Than Nearest */}
            <View style={styles.whyBox}>
              <View style={styles.whyHeader}>
                <Info size={16} color={COLORS.navBlue} />
                <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
                  Vì sao chọn trạm này thay vì trạm gần nhất?
                </Text>
              </View>
              <Text style={[TYPOGRAPHY.body, { color: COLORS.textSecondary }]}>
                {recommendation.whyBetterThanNearest}
              </Text>
            </View>

            {/* Primary Action Buttons */}
            <View style={styles.primaryActions}>
              <Pressable
                onPress={() => {
                  acceptProposedItinerary();
                  handleStartJourney((activeStationEval ?? rec).station.id);
                }}
                style={styles.btnPrimary}
              >
                <Navigation size={18} color="#0B1017" />
                <Text style={[TYPOGRAPHY.sectionTitle, { color: '#0B1017' }]}>
                  Theo lịch này & Dẫn đường
                </Text>
              </Pressable>

              <View style={styles.secondaryActionsRow}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    if (proposedOptions.length > 1) {
                      requestAlternativeOption();
                    } else {
                      setShowCompare(true);
                    }
                  }}
                  style={styles.btnSecondary}
                >
                  <GitCompareArrows size={16} color={COLORS.textPrimary} />
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary }]}>
                    {proposedOptions.length > 1 ? 'Nhờ AI gợi ý khác' : 'So sánh phương án'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    declineProposedItinerary();
                    router.push('/(tabs)/map');
                  }}
                  style={styles.btnSecondary}
                >
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                    Không theo (Tự chọn)
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  router.push('/simulation');
                }}
                style={[styles.btnSecondary, { borderColor: COLORS.warningAmberBorder, flex: 0 }]}
              >
                <ShieldAlert size={16} color={COLORS.warningAmber} />
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.warningAmber }]}>
                  Mô phỏng rủi ro What-If
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* 2 Alternative Recommendations */}
        {recommendation.alternatives.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary }]}>
              2 phương án dự phòng khả thi
            </Text>
            {recommendation.alternatives.map((alt, idx) => (
              <Pressable
                key={alt.station.id}
                onPress={() =>
                  router.push({
                    pathname: '/station-detail',
                    params: { stationId: alt.station.id },
                  })
                }
                style={styles.altCard}
              >
                <View style={styles.altHeader}>
                  <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.textPrimary, flex: 1 }]}>
                    #{idx + 2} · {alt.station.shortName}
                  </Text>
                  <StatusBadge status={alt.station.status} compact />
                </View>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                  {alt.distanceToStationKm} km · Chờ {alt.waitMin}p · Sạc {alt.chargeMin}p · Đến {effectiveInput.primaryDestination.shortName} lúc {alt.estimatedArrivalTime}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Rejected Stations */}
        {recommendation.rejected.length > 0 && (
          <View style={styles.sectionBlock}>
            <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textSecondary }]}>
              Trạm đã bị loại bỏ ({recommendation.rejected.length})
            </Text>
            {recommendation.rejected.map((rej) => (
              <View key={rej.station.id} style={styles.rejectedCard}>
                <View style={styles.altHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <AlertOctagon size={15} color={COLORS.criticalRed} />
                    <Text style={[TYPOGRAPHY.bodyMedium, { color: COLORS.textPrimary }]}>
                      {rej.station.shortName}
                    </Text>
                  </View>
                  <StatusBadge status={rej.station.status} compact labelOverride={rej.reasonTitle} />
                </View>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                  {rej.reasonDetail}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Compare Modal */}
      <Modal
        visible={showCompare}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCompare(false)}
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalTop}>
            <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]}>
              So sánh phương án (Mô phỏng)
            </Text>
            <Pressable onPress={() => setShowCompare(false)} style={styles.modalClose}>
              <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen }]}>Đóng</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.md }}>
            {[rec, ...recommendation.alternatives].filter(Boolean).map((item, idx) => {
              if (!item) return null;
              return (
                <View
                  key={item.station.id}
                  style={[
                    styles.compareCard,
                    idx === 0 && { borderColor: COLORS.energyGreen },
                  ]}
                >
                  <View style={styles.altHeader}>
                    <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary, flex: 1 }]}>
                      {idx === 0 ? 'Đề xuất: ' : `Dự phòng #${idx}: `}
                      {item.station.shortName}
                    </Text>
                    <ShieldCheck
                      size={16}
                      color={idx === 0 ? COLORS.energyGreen : COLORS.textSecondary}
                    />
                  </View>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                    • Quãng đường tới trạm: {item.distanceToStationKm} km ({item.driveToStationMin} phút)
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                    • Thời gian chờ + sạc: {item.waitMin}p chờ + {item.chargeMin}p sạc
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                    • Pin đến trạm / sau sạc: {item.arrivalBatteryPct}% → {item.targetDepartureBatteryPct}%
                  </Text>
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary }]}>
                    • Đến {effectiveInput.primaryDestination.shortName}: {item.estimatedArrivalTime} (
                    {item.scheduleSlackMin >= 0
                      ? `Sớm ${item.scheduleSlackMin} phút`
                      : `Trễ ${Math.abs(item.scheduleSlackMin)} phút`}
                    )
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
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
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.md,
  },
  criticalBox: {
    backgroundColor: COLORS.criticalRedDim,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.criticalRedBorder,
    padding: SPACING.lg,
    gap: 10,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.energyGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: 10,
    gap: 3,
  },
  safetyWrap: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 8,
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stationDetailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  whyBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.navBlueBorder,
    padding: SPACING.lg,
    gap: 8,
  },
  whyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryActions: {
    gap: 10,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionBlock: {
    gap: 10,
    marginTop: 4,
  },
  altCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: 6,
  },
  altHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rejectedCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.criticalRedBorder,
    padding: SPACING.md,
    gap: 6,
  },
  modalWrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalClose: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compareCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    gap: 6,
  },
});
