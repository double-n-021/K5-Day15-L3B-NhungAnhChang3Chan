import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { BayStatus, ChargingBay } from '@/types';

interface ChargerBayIllustrationProps {
  bay: ChargingBay;
}

const BAY_STYLE: Record<
  BayStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  available: {
    label: 'Trống',
    color: COLORS.energyGreen,
    bg: COLORS.energyGreenDim,
    border: COLORS.energyGreenBorder,
  },
  occupied: {
    label: 'Đang sử dụng',
    color: COLORS.warningAmber,
    bg: COLORS.warningAmberDim,
    border: COLORS.warningAmberBorder,
  },
  maintenance: {
    label: 'Bảo trì',
    color: COLORS.criticalRed,
    bg: COLORS.criticalRedDim,
    border: COLORS.criticalRedBorder,
  },
  unknown: {
    label: 'Không xác định',
    color: COLORS.unknownGray,
    bg: COLORS.unknownGrayDim,
    border: COLORS.unknownGrayBorder,
  },
};

export function ChargerBayIllustration({ bay }: ChargerBayIllustrationProps) {
  const cfg = BAY_STYLE[bay.status];

  return (
    <View style={[styles.card, { borderColor: cfg.border }]}>
      <View style={styles.topRow}>
        <Text style={[TYPOGRAPHY.metricSmall, { color: COLORS.textPrimary }]}>
          {bay.code}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
      </View>

      {/* Realistic V-Green DC pedestal SVG */}
      <View style={styles.svgWrap}>
        <Svg width={56} height={64} viewBox="0 0 56 64">
          {/* Base pad */}
          <Rect x={10} y={56} width={36} height={5} rx={2.5} fill="#293746" />
          {/* Pedestal body */}
          <Rect
            x={15}
            y={8}
            width={26}
            height={48}
            rx={5}
            fill="#1D2836"
            stroke="#364659"
            strokeWidth={1.5}
          />
          {/* Top LED status strip */}
          <Rect x={18} y={11} width={20} height={4} rx={2} fill={cfg.color} />
          {/* Screen */}
          <Rect x={20} y={20} width={16} height={11} rx={2} fill="#0B1017" />
          <Circle cx={28} cy={25.5} r={2.2} fill={cfg.color} />
          {/* CCS2 Cable loop */}
          <Path
            d="M41 26 C49 26, 50 44, 42 46"
            fill="none"
            stroke={bay.status === 'maintenance' ? '#64748B' : '#91A2B5'}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Rect x={39} y={43} width={5} height={6} rx={1.5} fill={cfg.color} />
        </Svg>
      </View>

      <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
        <Text style={[TYPOGRAPHY.micro, { color: cfg.color }]} numberOfLines={1}>
          {cfg.label}
        </Text>
      </View>

      <Text style={[TYPOGRAPHY.caption, styles.specText]}>
        {bay.connector} · {bay.powerKw}kW
      </Text>
      {bay.status === 'occupied' && bay.estimatedFreeInMin ? (
        <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary, marginTop: 2 }]}>
          ~{bay.estimatedFreeInMin}p nữa trống
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    alignItems: 'center',
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  svgWrap: {
    marginVertical: SPACING.sm,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  specText: {
    color: COLORS.textSecondary,
    marginTop: 6,
  },
});
