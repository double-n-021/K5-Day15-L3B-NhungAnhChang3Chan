import { useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { CUSTOM_ICONS } from '@/data/customIcons';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { ProposedItineraryOption } from '@/types';

export function JourneyProposals({
  options,
  activeIndex,
  width,
  rescue,
  canKeepDriving,
  onSelect,
  onAccept,
  onMap,
}: {
  options: ProposedItineraryOption[];
  activeIndex: number;
  width: number;
  rescue: boolean;
  canKeepDriving: boolean;
  onSelect: (index: number) => void;
  onAccept: () => void;
  onMap: () => void;
}) {
  const carousel = useRef<ComponentRef<typeof ScrollView>>(null);
  const manualScroll = useRef(false);
  const scrollPosition = useRef({ width: 0, index: 0 });
  const move = (index: number) => {
    manualScroll.current = false;
    scrollPosition.current = { width, index };
    carousel.current?.scrollTo({ x: index * width, animated: activeIndex !== options.length - 1 || index !== 0 });
    onSelect(index);
  };

  useEffect(() => {
    if (scrollPosition.current.width === width && scrollPosition.current.index === activeIndex) return;
    scrollPosition.current = { width, index: activeIndex };
    carousel.current?.scrollTo({ x: activeIndex * width, animated: false });
  }, [activeIndex, width]);

  return (
    <Animated.View entering={FadeInUp.duration(240)} style={styles.card}>
      <ScrollView
        ref={carousel}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        onScrollBeginDrag={() => { manualScroll.current = true; }}
        onMomentumScrollEnd={({ nativeEvent }) => {
          if (!manualScroll.current) return;
          manualScroll.current = false;
          const index = Math.round(nativeEvent.contentOffset.x / width);
          if (index >= 0 && index < options.length && index !== activeIndex) {
            scrollPosition.current = { width, index };
            onSelect(index);
          }
        }}
      >
        {options.map((option, index) => (
          <View
            key={option.id}
            style={[styles.page, { width }]}
            accessibilityElementsHidden={index !== activeIndex}
            importantForAccessibility={index === activeIndex ? 'auto' : 'no-hide-descendants'}
          >
            <Text style={[TYPOGRAPHY.sectionTitle, styles.primary]} numberOfLines={2}>
              {option.stationName}
            </Text>
            <View style={styles.metrics}>
              {[
                { label: 'Cách trạm', value: `${option.distanceKm.toLocaleString('vi-VN')} km` },
                { label: 'Sạc', value: `${option.chargeMin} phút` },
                {
                  label: option.chargeWindowText || option.isLiveApi ? 'Khung sạc' : 'Đến nơi',
                  value: option.chargeWindowText || option.etaText,
                },
              ].map(({ label, value }) => (
                <View key={label} style={styles.metric}>
                  <Text style={[TYPOGRAPHY.metricSmall, styles.primary]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {value}
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, styles.secondary]}>{label}</Text>
                </View>
              ))}
            </View>

            {!rescue && (
              <View style={[styles.reward, option.reward.points > 0 && styles.rewardEarned]}>
                {option.reward.points > 0 && <Image source={CUSTOM_ICONS.greenCharge} style={styles.rewardIcon} contentFit="contain" />}
                <Text style={[TYPOGRAPHY.caption, option.reward.points > 0 ? styles.mint : styles.secondary]} numberOfLines={1}>
                  {option.reward.points > 0
                    ? `+${option.reward.points} điểm Sạc Xanh`
                    : canKeepDriving ? 'Pin vẫn đủ chạy tiếp' : 'Không cộng điểm Sạc Xanh'}
                </Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      {options.length > 1 && (
        <View style={styles.indicator} accessible accessibilityLabel={`Gợi ý ${activeIndex + 1} trên ${options.length}`} accessibilityLiveRegion="polite">
          {options.map((option, index) => (
            <View key={option.id} style={[styles.dot, index === activeIndex && styles.activeDot]} />
          ))}
          <Text style={[TYPOGRAPHY.micro, styles.secondary]}>{activeIndex + 1}/{options.length}</Text>
        </View>
      )}
      <View style={styles.actions}>
        <Pressable style={[styles.action, styles.accept]} onPress={onAccept} accessibilityRole="button">
          <Text style={[TYPOGRAPHY.caption, styles.actionLabel, styles.acceptLabel]}>Theo lịch này</Text>
        </Pressable>
        <Pressable
          style={[styles.action, options.length < 2 && styles.unavailable]}
          onPress={() => move((activeIndex + 1) % options.length)}
          disabled={options.length < 2}
          accessibilityRole="button"
          accessibilityState={{ disabled: options.length < 2 }}
        >
          <Text style={[TYPOGRAPHY.caption, styles.actionLabel, styles.primary]}>Gợi ý khác</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={onMap} accessibilityRole="button">
          <Text style={[TYPOGRAPHY.caption, styles.actionLabel, styles.secondary]}>Tự chọn</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: RADIUS.lg, backgroundColor: COLORS.surface },
  page: { padding: SPACING.md, gap: SPACING.sm },
  metrics: { flexDirection: 'row', gap: SPACING.xs },
  metric: { flex: 1, backgroundColor: COLORS.bg, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 5 },
  reward: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.bg, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 4 },
  rewardEarned: { backgroundColor: COLORS.energyGreenDim },
  rewardIcon: { width: 16, height: 16 },
  indicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: SPACING.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textMuted },
  activeDot: { width: 13, backgroundColor: COLORS.energyGreen },
  actions: { flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 4, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceElevated },
  accept: { backgroundColor: COLORS.energyGreen, flex: 1.2 },
  actionLabel: { textAlign: 'center', flexShrink: 1 },
  acceptLabel: { color: COLORS.bg, fontWeight: '700' },
  unavailable: { opacity: 0.5 },
  primary: { color: COLORS.textPrimary },
  secondary: { color: COLORS.textSecondary },
  mint: { color: COLORS.energyGreen },
});
