import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { MascotMood } from '@/types';

const MASCOT_ORIGINAL_P006 = require('../../../assets/mascot/pilot-bot.webp');

interface MascotAssistantProps {
  mood?: MascotMood;
  speech: string;
  size?: number;
  badgeText?: string;
  compact?: boolean;
}

const MOOD_ACCENT: Record<MascotMood, string> = {
  idle: COLORS.border,
  listening: COLORS.energyGreen,
  thinking: COLORS.navBlue,
  happy: COLORS.energyGreen,
  warning: COLORS.warningAmber,
};

export function MascotAssistant({
  mood = 'idle',
  speech,
  size = 64,
  badgeText,
  compact = false,
}: MascotAssistantProps) {
  const reducedMotion = useReducedMotion();
  const floatY = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.35);

  const displaySize = compact ? Math.max(46, size - 16) : size;

  useEffect(() => {
    if (reducedMotion) return;
    floatY.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(3, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [floatY, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || (mood !== 'listening' && mood !== 'thinking')) {
      pulseScale.value = withTiming(1, { duration: 250 });
      pulseOpacity.value = withTiming(0, { duration: 250 });
      return;
    }
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.24, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 450 }),
        withTiming(0.15, { duration: 1350 })
      ),
      -1,
      false
    );
  }, [mood, pulseOpacity, pulseScale, reducedMotion]);

  const avatarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const ringAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const accent = MOOD_ACCENT[mood];

  return (
    <View style={styles.row}>
      <View style={[styles.avatarWrap, { width: displaySize + 10, height: displaySize + 10 }]}>
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: displaySize + 6,
              height: displaySize + 6,
              borderRadius: (displaySize + 6) / 2,
              borderColor: accent,
            },
            ringAnimStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.avatarCircle,
            {
              width: displaySize,
              height: displaySize,
              borderRadius: displaySize / 2,
              borderColor: accent,
            },
            avatarAnimStyle,
          ]}
        >
          <Image
            source={MASCOT_ORIGINAL_P006}
            style={{
              width: displaySize - 4,
              height: displaySize - 4,
              borderRadius: (displaySize - 4) / 2,
            }}
            contentFit="cover"
          />
        </Animated.View>
      </View>

      <View
        style={[
          styles.bubble,
          compact && styles.bubbleCompact,
          { borderColor: mood === 'idle' ? COLORS.border : accent },
        ]}
      >
        {badgeText ? (
          <Text style={[TYPOGRAPHY.micro, { color: accent, marginBottom: 2 }]}>
            {badgeText}
          </Text>
        ) : null}
        <Text
          style={[
            compact ? TYPOGRAPHY.caption : TYPOGRAPHY.body,
            { color: COLORS.textPrimary, lineHeight: compact ? 18 : 20 },
          ]}
          numberOfLines={compact ? 3 : undefined}
        >
          {speech}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  avatarCircle: {
    borderWidth: 2,
    backgroundColor: '#0B1017',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  bubble: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.md,
  },
  bubbleCompact: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
});
