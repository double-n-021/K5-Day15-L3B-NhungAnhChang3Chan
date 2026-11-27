import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  BatteryCharging,
  CalendarClock,
  Check,
  Clock,
  Flag,
  Mic,
  MicOff,
  Navigation,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react-native';
import { MascotAssistant } from '@/components/mascot/MascotAssistant';
import { ASSETS_3D } from '@/data/assets3d';
import { formatVnd } from '@/services/decisionEngine';
import {
  cancelVietnameseSpeech,
  ensureMicrophonePermission,
  startVietnameseSpeech,
  stopVietnameseSpeech,
} from '@/services/voiceRecognition';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { JourneyStageType, MascotMood, MissingInfoField } from '@/types';

const VOICE_SAMPLES = [
  {
    id: 'noon-reward',
    label: '“VF e34 còn 20% pin, trưa nắng 12h sạc ở đâu có điểm thưởng?”',
    prompt: 'VF e34 còn 20% pin, trưa nắng 12h sạc ở đâu có điểm thưởng?',
  },
  {
    id: 'evo200-noon',
    label: '“Xe máy điện Evo200 còn 15% pin, trưa 12h sạc ở đâu?”',
    prompt: 'Xe máy điện Evo200 còn 15% pin, trưa 12h sạc ở đâu?',
  },
  {
    id: 'vung-tau-noon',
    label: '“Tôi muốn đi Vũng Tàu lúc 11h30 trưa, còn 22% pin”',
    prompt: 'Tôi muốn đi Vũng Tàu lúc 11h30 trưa, còn 22% pin',
  },
  {
    id: 'vung-tau-missing',
    label: '“Tôi muốn đi Vũng Tàu, xe còn 22% pin” (thử thiếu giờ)',
    prompt: 'Tôi muốn đi Vũng Tàu, xe còn 22% pin',
  },
];

const QUICK_FILL_CHIPS: Record<
  MissingInfoField,
  { chips: { label: string; append: string }[] }
> = {
  destination: {
    chips: [
      { label: 'Đi Vũng Tàu', append: ' đi Vũng Tàu' },
      { label: 'Đi Hồ Gươm', append: ' đi Hồ Gươm' },
      { label: 'Sạc quanh Hà Nội', append: ' sạc ở đâu có điểm thưởng' },
    ],
  },
  battery: {
    chips: [
      { label: '18% pin', append: ', còn 18% pin' },
      { label: '22% pin', append: ', còn 22% pin' },
      { label: '35% pin', append: ', còn 35% pin' },
    ],
  },
  time: {
    chips: [
      { label: 'Trưa nắng 12h (+80đ)', append: ' lúc trưa nắng 12h' },
      { label: '8h sáng', append: ' lúc 8h sáng' },
      { label: 'Trước 14h30', append: ', 14h30 phải có mặt' },
    ],
  },
};

const STAGE_ICON_COLOR: Record<JourneyStageType, string> = {
  departure: COLORS.textSecondary,
  driving: COLORS.navBlue,
  waiting: COLORS.warningAmber,
  charging: COLORS.energyGreen,
  appointment: '#A78BFA',
  destination: COLORS.energyGreen,
};

export default function JourneyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const {
    vehicleId,
    effectiveInput,
    effectiveWeather,
    parsedRequest,
    proposedOptions,
    activeOptionIndex,
    itineraryStatus,
    greenPoints,
    voiceDrawerTrigger,
    setVehicleId,
    analyzeNaturalPrompt,
    acceptProposedItinerary,
    declineProposedItinerary,
    requestAlternativeOption,
    recommendation,
    isDemoActive,
    demoStepIndex,
  } = useChargePilotStore();

  const [mode, setMode] = useState<'chat' | 'timeline'>('chat');
  const [promptText, setPromptText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micPermissionBlocked, setMicPermissionBlocked] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const lastVoiceTriggerRef = useRef(0);

  // Explicit Android IME listener so inputDock sits flush above the keyboard even with edgeToEdge
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardOpen(true);
      if (rootRef.current && e.endCoordinates.screenY > 0) {
        rootRef.current.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          const rootBottom = y + h;
          const overlap = Math.max(0, Math.round(rootBottom - e.endCoordinates.screenY));
          if (h > 0) {
            setKeyboardOffset(overlap > 0 ? overlap + 4 : 0);
          } else {
            setKeyboardOffset(e.endCoordinates.height);
          }
        });
      } else {
        setKeyboardOffset(e.endCoordinates.height);
      }
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 60);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardOpen(false);
      setKeyboardOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const activeOption = proposedOptions[activeOptionIndex] ?? null;

  const submitNaturalText = useCallback(
    (textToRun: string) => {
      const trimmed = textToRun.trim();
      if (!trimmed || isThinking) return;

      Keyboard.dismiss();
      cancelVietnameseSpeech().catch(() => {});
      setIsListening(false);
      setLiveTranscript('');
      setVoiceError(null);
      setMicPermissionBlocked(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const lower = trimmed.toLowerCase();
      if (lower.includes('evo') || lower.includes('xe máy')) {
        setVehicleId('vinfast_evo200');
      } else if (lower.includes('e34') || lower.includes('ô tô')) {
        setVehicleId('vfe34');
      }

      const parsed = analyzeNaturalPrompt(trimmed);

      if (!parsed.isComplete) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }

      setIsThinking(true);
      setTimeout(() => {
        setIsThinking(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }, 520);
    },
    [analyzeNaturalPrompt, isThinking, setVehicleId]
  );

  const startRealVoiceListening = useCallback(async () => {
    setVoiceError(null);
    setMicPermissionBlocked(false);
    setLiveTranscript('');

    const permStatus = await ensureMicrophonePermission();
    if (permStatus === 'never_ask_again') {
      setIsListening(false);
      setMicPermissionBlocked(true);
      setVoiceError(
        'Quyền Micro đang bị tắt. Bấm nút bên dưới để mở Cài đặt và bật quyền Microphone cho ChargePilot AI.'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }

    if (permStatus === 'denied') {
      setIsListening(false);
      setVoiceError(
        'Bạn chưa cấp quyền Microphone nên mình chưa nghe được. Bấm lại nút Mic và chọn Cho phép nhé.'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }

    setIsListening(true);
    await startVietnameseSpeech({
      onStart: () => {
        setIsListening(true);
        setVoiceError(null);
      },
      onPartial: (partialText) => {
        setLiveTranscript(partialText);
        setPromptText(partialText);
      },
      onResult: (finalText) => {
        setIsListening(false);
        setLiveTranscript('');
        setPromptText(finalText);
        submitNaturalText(finalText);
      },
      onError: (msg) => {
        setIsListening(false);
        setLiveTranscript('');
        setVoiceError(msg);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  }, [submitNaturalText]);

  useEffect(() => {
    if (voiceDrawerTrigger > 0 && voiceDrawerTrigger !== lastVoiceTriggerRef.current) {
      lastVoiceTriggerRef.current = voiceDrawerTrigger;
      setMode('chat');
      startRealVoiceListening().catch(() => {});
    }
  }, [voiceDrawerTrigger, startRealVoiceListening]);

  useEffect(() => {
    return () => {
      cancelVietnameseSpeech().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!isDemoActive) return;
    if (demoStepIndex === 4) {
      setMode('chat');
      const demoPrompt =
        'Tôi còn 18% pin, 14h30 phải có mặt tại Hồ Gươm và sau đó đi sân bay Nội Bài.';
      setPromptText(demoPrompt);
      analyzeNaturalPrompt(demoPrompt);
    } else if (demoStepIndex === 12) {
      setMode('timeline');
    }
  }, [isDemoActive, demoStepIndex, analyzeNaturalPrompt]);

  const handleToggleMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (isListening) {
      stopVietnameseSpeech().catch(() => {});
      setIsListening(false);
      return;
    }
    startRealVoiceListening().catch(() => {});
  };

  const handleQuickAppend = (appendText: string) => {
    Haptics.selectionAsync().catch(() => {});
    const updated = (promptText.trim() + appendText).trim();
    setPromptText(updated);
    submitNaturalText(updated);
  };

  // Compute Mascot mood & speech
  let mascotMood: MascotMood = 'idle';
  let mascotBadge = 'TRỢ LÝ CHARGEPILOT';
  let mascotSpeech =
    'Chào bạn! Hãy bấm Mic và nói tự nhiên: bạn muốn đi đâu, mấy giờ và xe còn bao nhiêu % pin?';

  if (isListening) {
    mascotMood = 'listening';
    mascotBadge = 'ĐANG LẮNG NGHE · MIC BẬT';
    mascotSpeech = liveTranscript
      ? `Đang nghe: “${liveTranscript}”`
      : 'Mình đang nghe thật qua micro đây! Hãy nói tự nhiên: bạn muốn đi đâu, mấy giờ và xe còn bao nhiêu % pin?';
  } else if (isThinking) {
    mascotMood = 'thinking';
    mascotBadge = 'ĐANG TÍNH TOÁN';
    mascotSpeech =
      'Đợi mình một chút, mình đang kiểm tra trạm trống, % pin và điểm thưởng khung giờ vắng cho bạn...';
  } else if (voiceError) {
    mascotMood = 'warning';
    mascotBadge = 'MICROPHONE';
    mascotSpeech = voiceError;
  } else if (parsedRequest && !parsedRequest.isComplete) {
    mascotMood = 'warning';
    mascotBadge = 'CẦN BỔ SUNG THÔNG TIN';
    const missingNames = parsedRequest.missingFields
      .map((f) =>
        f === 'destination' ? 'điểm đến' : f === 'battery' ? '% pin hiện tại' : 'giờ đi/giờ hẹn'
      )
      .join(' và ');
    mascotSpeech = `Mình chưa rõ ${missingNames}. Bạn nói thêm hoặc chọn nhanh bên dưới để mình lên lịch chính xác nhé!`;
  } else if (activeOption) {
    mascotMood = 'happy';
    mascotBadge =
      itineraryStatus === 'accepted'
        ? 'ĐÃ ÁP DỤNG LỊCH TRÌNH'
        : `ĐỀ XUẤT ${activeOption.optionIndex + 1}/${activeOption.totalOptions}`;
    mascotSpeech = activeOption.mascotSpeech;
  }

  const activeTimeline =
    activeOption?.timeline ??
    (itineraryStatus === 'accepted' ? recommendation.timeline : []);

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={[
        styles.screen,
        {
          paddingTop: insets.top,
          paddingBottom: keyboardOffset,
        },
      ]}
    >
      {/* Minimal Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]}>
            Trợ lý ChargePilot
          </Text>
          <View style={styles.pointsBadge}>
            <Image
              source={ASSETS_3D.trophyGold}
              style={{ width: 16, height: 16 }}
              contentFit="contain"
            />
            <Text style={[TYPOGRAPHY.micro, { color: COLORS.warningAmber }]}>
              {greenPoints} điểm
            </Text>
          </View>
        </View>

        {!isKeyboardOpen && (
          <View style={styles.segmentWrap}>
            <Pressable
              onPress={() => setMode('chat')}
              style={[styles.segmentBtn, mode === 'chat' && styles.segmentBtnActive]}
            >
              <Text
                style={[
                  TYPOGRAPHY.caption,
                  { color: mode === 'chat' ? '#0B1017' : COLORS.textSecondary },
                ]}
              >
                Trò chuyện AI
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('timeline')}
              style={[styles.segmentBtn, mode === 'timeline' && styles.segmentBtnActive]}
            >
              <Text
                style={[
                  TYPOGRAPHY.caption,
                  { color: mode === 'timeline' ? '#0B1017' : COLORS.textSecondary },
                ]}
              >
                Lộ trình ({activeTimeline.length})
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {mode === 'chat' ? (
        <>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Original P-006 Mascot Dialogue Hero */}
            <MascotAssistant
              mood={mascotMood}
              speech={mascotSpeech}
              badgeText={mascotBadge}
              size={64}
              compact={isKeyboardOpen}
            />

            {/* Open Settings CTA if Microphone permission is permanently blocked */}
            {micPermissionBlocked && (
              <Pressable
                onPress={() => {
                  Linking.openSettings().catch(() => {});
                }}
                style={styles.openSettingsBtn}
              >
                <Mic size={16} color="#0B1017" />
                <Text style={[TYPOGRAPHY.caption, { color: '#0B1017', fontWeight: '700' }]}>
                  Mở Cài đặt cấp quyền Micro
                </Text>
              </Pressable>
            )}

            {/* Voice Sample Cards when listening or empty (hidden when keyboard is open) */}
            {!isKeyboardOpen && (isListening || (!activeOption && !parsedRequest)) && (
              <Animated.View entering={FadeInDown.duration(180)} style={styles.samplesBlock}>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                  {isListening ? 'Chạm câu nói mẫu để thử nhanh:' : 'Gợi ý câu hỏi tự nhiên:'}
                </Text>
                {VOICE_SAMPLES.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setPromptText(s.prompt);
                      submitNaturalText(s.prompt);
                    }}
                    style={styles.sampleCard}
                  >
                    <Image
                      source={ASSETS_3D.micGold}
                      style={{ width: 18, height: 18 }}
                      contentFit="contain"
                    />
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, flex: 1 }]}>
                      {s.label}
                    </Text>
                  </Pressable>
                ))}
              </Animated.View>
            )}

            {/* Missing Info Quick-Reply Pills */}
            {parsedRequest && !parsedRequest.isComplete && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.missingBox}>
                {parsedRequest.missingFields.map((field) => (
                  <View key={field} style={styles.quickChipsRow}>
                    {QUICK_FILL_CHIPS[field].chips.map((c) => (
                      <Pressable
                        key={c.label}
                        onPress={() => handleQuickAppend(c.append)}
                        style={styles.quickChip}
                      >
                        <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen }]}>
                          + {c.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Single Clean AI Proposal Card */}
            {!isThinking && activeOption && (
              <Animated.View entering={FadeInDown.duration(220)} style={styles.proposalCard}>
                {/* Off-Peak Solar Noon Reward Banner */}
                <View
                  style={[
                    styles.rewardBanner,
                    activeOption.reward.isSolarNoon
                      ? {
                          backgroundColor: COLORS.energyGreenDim,
                          borderColor: COLORS.energyGreenBorder,
                        }
                      : {
                          backgroundColor: COLORS.surfaceElevated,
                          borderColor: COLORS.border,
                        },
                  ]}
                >
                  <Image
                    source={activeOption.reward.isSolarNoon ? ASSETS_3D.sunGold : ASSETS_3D.coin}
                    style={{ width: 24, height: 24 }}
                    contentFit="contain"
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        TYPOGRAPHY.caption,
                        {
                          color: activeOption.reward.isSolarNoon
                            ? COLORS.energyGreen
                            : COLORS.textPrimary,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {activeOption.reward.label}
                      {activeOption.reward.discountVnd > 0
                        ? ` · Giảm ~${formatVnd(activeOption.reward.discountVnd)}`
                        : ''}
                    </Text>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary, marginTop: 2 }]}>
                      {activeOption.reward.reason}
                    </Text>
                  </View>
                </View>

                <View style={styles.stationHeroRow}>
                  <Image
                    source={ASSETS_3D.evChargerStation}
                    style={styles.stationThumb3D}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary }]} numberOfLines={2}>
                      {activeOption.stationName}
                    </Text>
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginTop: 2 }]} numberOfLines={2}>
                      Đi {activeOption.destinationName} · {activeOption.stationAddress}
                    </Text>
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.metricCell}>
                    <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                      {activeOption.distanceKm} km
                    </Text>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                      Chạy {activeOption.driveMin}p
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]}>
                      {activeOption.chargeMin}p
                    </Text>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                      {activeOption.arrivalBatteryPct}%→{activeOption.departureBatteryPct}%
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                      {activeOption.etaText}
                    </Text>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                      Đến nơi
                    </Text>
                  </View>
                </View>

                {/* 3 Concise Decision Buttons */}
                <View style={styles.decisionRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      acceptProposedItinerary();
                    }}
                    style={styles.acceptBtn}
                  >
                    <Check size={15} color="#0B1017" />
                    <Text style={[TYPOGRAPHY.caption, { color: '#0B1017', fontWeight: '700' }]} numberOfLines={1}>
                      {itineraryStatus === 'accepted' ? 'Đã chọn' : 'Theo lịch này'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      requestAlternativeOption();
                    }}
                    style={styles.altBtn}
                  >
                    <RefreshCw size={14} color={COLORS.textPrimary} />
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary }]} numberOfLines={1}>
                      Gợi ý khác
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      declineProposedItinerary();
                      router.push('/(tabs)/map');
                    }}
                    style={styles.declineBtn}
                  >
                    <XCircle size={14} color={COLORS.textSecondary} />
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]} numberOfLines={1}>
                      Tự chọn
                    </Text>
                  </Pressable>
                </View>

                {itineraryStatus === 'accepted' && !activeOption.isIntercitySimulated && (
                  <Pressable
                    onPress={() => router.push('/navigation')}
                    style={styles.startNavBtn}
                  >
                    <Navigation size={16} color="#0B1017" />
                    <Text style={[TYPOGRAPHY.cardTitle, { color: '#0B1017' }]}>
                      Bắt đầu dẫn đường mô phỏng
                    </Text>
                  </Pressable>
                )}
              </Animated.View>
            )}
          </ScrollView>

          {/* Minimal Voice + Text Input Dock — always stays visible above keyboard */}
          <View style={styles.inputDock}>
            <Pressable
              onPress={handleToggleMic}
              style={[styles.micDockBtn, isListening && styles.micDockBtnActive]}
              accessibilityLabel="Bật tắt Mic"
            >
              {isListening ? (
                <MicOff size={20} color="#0B1017" />
              ) : (
                <Mic size={20} color="#0B1017" />
              )}
            </Pressable>

            <TextInput
              ref={inputRef}
              value={promptText}
              onChangeText={setPromptText}
              placeholder="Nói hoặc gõ yêu cầu..."
              placeholderTextColor={COLORS.textMuted}
              style={styles.dockInput}
              returnKeyType="send"
              onSubmitEditing={() => submitNaturalText(promptText)}
            />

            <Pressable
              onPress={() => submitNaturalText(promptText)}
              disabled={!promptText.trim()}
              style={[styles.sendBtn, !promptText.trim() && { opacity: 0.4 }]}
              accessibilityLabel="Gửi yêu cầu"
            >
              <Send size={18} color={COLORS.energyGreen} />
            </Pressable>
          </View>
        </>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTimeline.length === 0 ? (
            <View style={styles.emptyCard}>
              <MascotAssistant
                mood="idle"
                speech="Chưa có lịch trình nào được chốt. Quay lại tab Trò chuyện AI và nói với mình điểm đến của bạn nhé!"
                size={56}
              />
            </View>
          ) : (
            <View style={styles.timelineList}>
              {activeTimeline.map((stage, idx) => {
                const isLast = idx === activeTimeline.length - 1;
                const accentColor =
                  stage.status === 'critical'
                    ? COLORS.criticalRed
                    : STAGE_ICON_COLOR[stage.type];

                const IconComp =
                  stage.type === 'charging'
                    ? BatteryCharging
                    : stage.type === 'waiting'
                      ? Clock
                      : stage.type === 'appointment'
                        ? CalendarClock
                        : stage.type === 'destination'
                          ? Flag
                          : stage.type === 'driving'
                            ? Navigation
                            : ShieldCheck;

                return (
                  <View key={stage.id} style={styles.timelineItem}>
                    <View style={styles.timeCol}>
                      <Text style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}>
                        {stage.time}
                      </Text>
                    </View>
                    <View style={styles.railCol}>
                      <View style={[styles.nodeCircle, { borderColor: accentColor }]}>
                        <IconComp size={14} color={accentColor} />
                      </View>
                      {!isLast && <View style={styles.railLine} />}
                    </View>
                    <View style={styles.stageCard}>
                      <View style={styles.stageTop}>
                        <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.textPrimary, flex: 1 }]}>
                          {stage.title}
                        </Text>
                        <Text style={[TYPOGRAPHY.metricSmall, { color: COLORS.energyGreen }]}>
                          {stage.batteryPct}%
                        </Text>
                      </View>
                      <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary, marginTop: 4 }]}>
                        {stage.subtitle}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm + 2,
    gap: SPACING.sm + 2,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.warningAmberDim,
    borderWidth: 1,
    borderColor: COLORS.warningAmberBorder,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: COLORS.energyGreen,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.sm + 4,
  },
  threeAuraCard: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    backgroundColor: '#080D14',
  },
  samplesBlock: {
    gap: 8,
  },
  openSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.warningAmber,
    paddingHorizontal: SPACING.md,
  },
  sampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
  },
  missingBox: {
    gap: 8,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  proposalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    padding: SPACING.lg,
    gap: 10,
  },
  rewardBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
  },
  stationHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stationThumb3D: {
    width: 66,
    height: 66,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricCell: {
    flex: 1,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    padding: 10,
    gap: 2,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  acceptBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
    paddingHorizontal: 8,
  },
  altBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
  },
  declineBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
  },
  startNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreen,
    marginTop: 2,
  },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  micDockBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.energyGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micDockBtnActive: {
    backgroundColor: COLORS.warningAmber,
  },
  dockInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    color: COLORS.textPrimary,
    fontFamily: 'BeVietnamPro_400Regular',
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    paddingTop: SPACING.md,
  },
  timelineList: {
    gap: 2,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  timeCol: {
    width: 52,
    paddingTop: 12,
  },
  railCol: {
    width: 30,
    alignItems: 'center',
  },
  nodeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  stageCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: 10,
  },
  stageTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
