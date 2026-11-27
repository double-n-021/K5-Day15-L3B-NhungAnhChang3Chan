import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { METEOCON_XML } from '@/data/weatherIcons';
import type { WeatherCondition } from '@/types';

interface MeteoconIconProps {
  iconKey: WeatherCondition['iconKey'];
  size?: number;
}

export function MeteoconIcon({ iconKey, size = 48 }: MeteoconIconProps) {
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-2.5, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(2.5, { duration: 1800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [reducedMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
      <SvgXml xml={METEOCON_XML[iconKey]} width={size} height={size} />
    </Animated.View>
  );
}
