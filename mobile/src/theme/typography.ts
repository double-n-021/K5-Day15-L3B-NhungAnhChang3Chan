import { TextStyle } from 'react-native';

export const FONT_FAMILY = {
  vnRegular: 'BeVietnamPro_400Regular',
  vnMedium: 'BeVietnamPro_500Medium',
  vnSemiBold: 'BeVietnamPro_600SemiBold',
  vnBold: 'BeVietnamPro_700Bold',
  numMedium: 'Inter_500Medium',
  numSemiBold: 'Inter_600SemiBold',
  numBold: 'Inter_700Bold',
} as const;

export const TYPOGRAPHY: Record<string, TextStyle> = {
  heroMetric: {
    fontFamily: FONT_FAMILY.numBold,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  metricLarge: {
    fontFamily: FONT_FAMILY.numBold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  metricMedium: {
    fontFamily: FONT_FAMILY.numSemiBold,
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  metricSmall: {
    fontFamily: FONT_FAMILY.numMedium,
    fontSize: 13,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  screenTitle: {
    fontFamily: FONT_FAMILY.vnBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.vnSemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  cardTitle: {
    fontFamily: FONT_FAMILY.vnSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  body: {
    fontFamily: FONT_FAMILY.vnRegular,
    fontSize: 14,
    lineHeight: 20,
  },
  bodyMedium: {
    fontFamily: FONT_FAMILY.vnMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: FONT_FAMILY.vnMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  micro: {
    fontFamily: FONT_FAMILY.vnSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
};
