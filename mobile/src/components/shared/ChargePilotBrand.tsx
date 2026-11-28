import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { COLORS } from '@/theme/tokens';
import { FONT_FAMILY } from '@/theme/typography';

interface ChargePilotLogoMarkProps {
  size?: number;
  animated?: boolean;
}

/** Smooth 3-actor vector emblem: recessed EV gauge track, Energy C-Arc, Pilot bolt & Spark. */
export function ChargePilotLogoMark({
  size = 34,
  animated = true,
}: ChargePilotLogoMarkProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [animated, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + pulse.value * 0.08 }],
    opacity: 0.25 + pulse.value * 0.35,
  }));

  const sparkStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 0.9 + pulse.value * 0.2 },
      { rotate: `${pulse.value * 12}deg` },
    ],
  }));

  return (
    <View
      style={[
        styles.markWrap,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.28),
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.auraRing,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.28),
          },
          glowStyle,
        ]}
      />
      <Svg width={size * 0.78} height={size * 0.78} viewBox="0 0 120 120" fill="none">
        <Defs>
          <LinearGradient id="cpArc" x1="22" y1="22" x2="96" y2="100" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#38BDF8" />
            <Stop offset="50%" stopColor="#18E299" />
            <Stop offset="100%" stopColor="#10B981" />
          </LinearGradient>
          <LinearGradient id="cpBolt" x1="46" y1="36" x2="72" y2="88" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="55%" stopColor="#A7F3D0" />
            <Stop offset="100%" stopColor="#18E299" />
          </LinearGradient>
        </Defs>
        <Circle cx="58" cy="62" r="39" stroke="rgba(56, 189, 248, 0.18)" strokeWidth={11} />
        <Path
          d="M 87.0 88.1 A 39 39 0 1 1 84.1 33.0"
          stroke="url(#cpArc)"
          strokeWidth={11}
          strokeLinecap="round"
        />
        <Path
          d="M 63 36 L 41 65 L 55 65 L 51 88 L 75 57 L 60 57 Z"
          fill="url(#cpBolt)"
          stroke="url(#cpBolt)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>

      {/* Twinkling top-right core spark */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.sparkOverlay,
          {
            right: size * 0.08,
            top: size * 0.08,
          },
          sparkStyle,
        ]}
      >
        <Svg width={size * 0.26} height={size * 0.26} viewBox="0 0 32 32" fill="none">
          <Path
            d="M 16 2 Q 18 14 30 16 Q 18 18 16 30 Q 14 18 2 16 Q 14 14 16 2 Z"
            fill="#38BDF8"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

interface ChargePilotBrandProps {
  size?: number;
}

/** Drop-in animated ChargePilot header brand lockup (no AI badge, no city subtitle). */
export function ChargePilotBrand({ size = 34 }: ChargePilotBrandProps) {
  return (
    <View style={styles.brandRow}>
      <ChargePilotLogoMark size={size} animated />
      <Text style={styles.wordmark} numberOfLines={1}>
        Charge<Text style={styles.wordmarkAccent}>Pilot</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  markWrap: {
    backgroundColor: '#111D29',
    borderWidth: 1,
    borderColor: 'rgba(24, 226, 153, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  auraRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(24, 226, 153, 0.55)',
  },
  sparkOverlay: {
    position: 'absolute',
  },
  wordmark: {
    fontFamily: FONT_FAMILY.vnBold,
    fontSize: 20,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
  wordmarkAccent: {
    color: COLORS.energyGreen,
  },
});
