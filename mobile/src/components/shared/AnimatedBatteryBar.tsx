import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADIUS } from '@/theme/tokens';

interface AnimatedBatteryBarProps {
  percentage: number;
  height?: number;
  showSegments?: boolean;
}

export function getBatteryColor(pct: number): string {
  if (pct <= 15) return COLORS.criticalRed;
  if (pct <= 28) return COLORS.warningAmber;
  return COLORS.energyGreen;
}

export function AnimatedBatteryBar({
  percentage,
  height = 10,
  showSegments = true,
}: AnimatedBatteryBarProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const reducedMotion = useReducedMotion();
  const widthPct = useSharedValue(clamped);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    widthPct.value = withTiming(clamped, { duration: 550 });
  }, [clamped, widthPct]);

  useEffect(() => {
    if (reducedMotion || clamped > 20) {
      pulseOpacity.value = 1;
      return;
    }
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 850 }),
        withTiming(1, { duration: 850 })
      ),
      -1,
      true
    );
  }, [clamped, pulseOpacity, reducedMotion]);

  const fillColor = getBatteryColor(clamped);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${widthPct.value}%`,
    opacity: pulseOpacity.value,
  }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: fillColor, borderRadius: height / 2 },
          fillStyle,
        ]}
      />
      {showSegments && (
        <View style={styles.segmentsOverlay} pointerEvents="none">
          {[25, 50, 75].map((mark) => (
            <View
              key={mark}
              style={[styles.segmentTick, { left: `${mark}%` }]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
  },
  segmentsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  segmentTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(11, 16, 23, 0.55)',
  },
});
