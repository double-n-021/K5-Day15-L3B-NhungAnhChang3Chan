import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react-native';
import { DEMO_SEQUENCE } from '@/data/presets';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';

export function HackathonDemoOverlay() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    isDemoActive,
    isDemoPlaying,
    demoStepIndex,
    toggleDemoPlay,
    nextDemoStep,
    restartDemo,
    stopDemo,
  } = useChargePilotStore();

  const currentStep = DEMO_SEQUENCE[demoStepIndex];

  useEffect(() => {
    if (!isDemoActive || !currentStep) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push(currentStep.targetRoute as never);
  }, [isDemoActive, demoStepIndex, currentStep, router]);

  useEffect(() => {
    if (!isDemoActive || !isDemoPlaying) return;
    const timer = setTimeout(() => {
      nextDemoStep();
    }, 4200);
    return () => clearTimeout(timer);
  }, [isDemoActive, isDemoPlaying, demoStepIndex, nextDemoStep]);

  if (!isDemoActive || !currentStep) return null;

  return (
    <View
      style={[styles.wrapper, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <View style={styles.hudCard}>
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]}>
              DEMO {currentStep.stepNumber}/{DEMO_SEQUENCE.length}
            </Text>
          </View>
          <Text
            style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, flex: 1 }]}
            numberOfLines={1}
          >
            {currentStep.title}
          </Text>
          <Pressable
            onPress={stopDemo}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Thoát chế độ Demo"
          >
            <X size={15} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        <Text style={[TYPOGRAPHY.caption, styles.narrative]} numberOfLines={2}>
          {currentStep.narrative}
        </Text>

        <View style={styles.controlsRow}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              toggleDemoPlay();
            }}
            style={[styles.ctrlBtn, styles.ctrlPrimary]}
          >
            {isDemoPlaying ? (
              <Pause size={14} color="#0B1017" />
            ) : (
              <Play size={14} color="#0B1017" />
            )}
            <Text style={[TYPOGRAPHY.micro, { color: '#0B1017' }]}>
              {isDemoPlaying ? 'Tạm dừng' : 'Tiếp tục'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              nextDemoStep();
            }}
            style={styles.ctrlBtn}
          >
            <SkipForward size={14} color={COLORS.textPrimary} />
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textPrimary }]}>
              Bước tiếp
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              restartDemo();
            }}
            style={styles.ctrlBtn}
          >
            <RotateCcw size={14} color={COLORS.textSecondary} />
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
              Chạy lại
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 100,
  },
  hudCard: {
    backgroundColor: 'rgba(15, 23, 34, 0.95)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    padding: SPACING.md,
    gap: 8,
    ...SHADOWS.floating,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: COLORS.energyGreenDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrative: {
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ctrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceElevated,
    minHeight: 34,
  },
  ctrlPrimary: {
    backgroundColor: COLORS.energyGreen,
  },
});
