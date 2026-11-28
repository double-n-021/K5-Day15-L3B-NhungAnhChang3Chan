import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { COLORS } from '@/theme/tokens';

const PILOT_BOT = require('../../../assets/mascot/pilot-bot.webp');

export type AssistantMood = 'idle' | 'listening' | 'thinking' | 'warning' | 'result' | 'refusal' | 'rescue' | 'happy' | 'offline';

export const MOOD_ACCENT: Record<AssistantMood, string> = {
  idle: COLORS.textSecondary,
  listening: COLORS.energyGreen,
  thinking: COLORS.navBlue,
  warning: COLORS.warningAmber,
  result: COLORS.energyGreen,
  refusal: COLORS.criticalRed,
  rescue: COLORS.criticalRed,
  happy: COLORS.energyGreen,
  offline: COLORS.textSecondary,
};

export function MascotAssistant({
  mood,
  size,
  audioLevel,
}: {
  mood: AssistantMood;
  size: number;
  audioLevel: SharedValue<number>;
}) {
  const reducedMotion = useReducedMotion();
  const movement = useSharedValue(0);
  const accent = MOOD_ACCENT[mood];

  useEffect(() => {
    movement.set(0);
    if (reducedMotion) return;
    if (mood === 'thinking') {
      movement.set(withRepeat(withTiming(1, { duration: 1200 }), -1));
    } else if (mood === 'idle' || mood === 'rescue') {
      movement.set(withRepeat(withTiming(1, { duration: 1450 }), -1, true));
    } else if (mood === 'happy') {
      movement.set(withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 360 })));
    }
    return () => cancelAnimation(movement);
  }, [mood, movement, reducedMotion]);

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: mood === 'idle' || mood === 'happy' ? -5 * movement.get() : 0 },
      { rotate: mood === 'warning' ? '-9deg' : '0deg' },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: mood === 'rescue' ? 0.35 + movement.get() * 0.6 : 0.75,
    transform: [
      { scale: mood === 'listening' && !reducedMotion ? 1 + audioLevel.get() * 0.18 : 1 },
      { rotate: mood === 'thinking' ? `${movement.get() * 360}deg` : '0deg' },
    ],
  }));

  return (
    <Animated.View
      accessible={false}
      style={[styles.frame, { width: size + 8, height: size + 8 }, avatarStyle]}
    >
      <Animated.View
        style={[
          styles.ring,
          { borderColor: accent, borderRadius: (size + 8) / 2 },
          mood === 'thinking' && { borderLeftColor: 'transparent', borderBottomColor: COLORS.navBlueDim },
          ringStyle,
        ]}
      />
      <Image
        source={PILOT_BOT}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ring: { ...StyleSheet.absoluteFill, borderWidth: 2 },
});
