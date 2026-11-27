import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { StationStatus } from '@/types';

interface StatusBadgeProps {
  status: StationStatus;
  compact?: boolean;
  labelOverride?: string;
}

const STATUS_CONFIG: Record<
  StationStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  available: {
    label: 'Sẵn sàng',
    color: COLORS.energyGreen,
    bg: COLORS.energyGreenDim,
    border: COLORS.energyGreenBorder,
  },
  busy: {
    label: 'Đang đông',
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

export function StatusBadge({ status, compact, labelOverride }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        { backgroundColor: cfg.bg, borderColor: cfg.border },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: cfg.color }]} />
      <Text
        style={[
          compact ? TYPOGRAPHY.micro : TYPOGRAPHY.caption,
          { color: cfg.color },
        ]}
        numberOfLines={1}
      >
        {labelOverride ?? cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeCompact: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
