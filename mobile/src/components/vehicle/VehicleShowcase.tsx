import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { RotateCw } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { Vehicle } from '@/types';

interface VehicleShowcaseProps {
  vehicle: Vehicle;
  height?: number;
  minimal?: boolean;
}

export function VehicleShowcase({
  vehicle,
  height = 196,
  minimal = false,
}: VehicleShowcaseProps) {
  const [angleIdx, setAngleIdx] = useState(0);

  const safeIdx = angleIdx % vehicle.angles.length;
  const activeAngle = vehicle.angles[safeIdx];

  const handleToggleAngle = () => {
    Haptics.selectionAsync().catch(() => {});
    setAngleIdx((prev) => (prev + 1) % vehicle.angles.length);
  };

  return (
    <View style={[styles.container, { height }]}>
      <Pressable
        onPress={handleToggleAngle}
        style={styles.imageStage}
        accessibilityRole="button"
        accessibilityLabel={`Chạm để đổi góc nhìn ${vehicle.name}`}
      >
        <Image
          source={activeAngle.source}
          style={styles.vehicleImage}
          contentFit="cover"
          transition={220}
        />
      </Pressable>

      {/* Top left category badge + Top right Angle controls */}
      {!minimal && (
        <>
          <View style={styles.categoryBadge}>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textPrimary }]}>
              {vehicle.supportsBatterySwap
                ? 'Xe máy điện · Đổi pin 2p'
                : vehicle.category === 'motorbike'
                  ? 'Xe máy điện'
                  : 'Ô tô điện'}
            </Text>
          </View>

          <View style={styles.controlsRow}>
            {vehicle.angles.length > 1 && (
              <Pressable
                onPress={handleToggleAngle}
                style={styles.pillBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Đổi góc xe"
              >
                <RotateCw size={13} color={COLORS.textPrimary} />
                <Text style={[TYPOGRAPHY.micro, styles.pillText]}>
                  {activeAngle.label}
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* Angle indicator dots */}
      <View style={styles.dotsRow}>
        {vehicle.angles.map((a, idx) => (
          <View
            key={a.id}
            style={[styles.dot, idx === safeIdx && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bg,
    position: 'relative',
  },
  imageStage: {
    flex: 1,
    width: '100%',
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(11, 16, 23, 0.78)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  controlsRow: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    flexDirection: 'row',
    gap: 6,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(11, 16, 23, 0.78)',
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 32,
  },
  pill3D: {
    borderColor: COLORS.energyGreenBorder,
  },
  pillText: {
    color: COLORS.textPrimary,
  },
  dotsRow: {
    position: 'absolute',
    bottom: SPACING.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(244, 247, 251, 0.32)',
  },
  dotActive: {
    width: 18,
    backgroundColor: COLORS.energyGreen,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webviewWrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
