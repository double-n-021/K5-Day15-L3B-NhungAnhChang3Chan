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
  ExternalLink,
  Flag,
  Mic,
  MicOff,
  Navigation,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react-native';
import { MascotAssistant } from '@/components/mascot/MascotAssistant';
import { MarkdownText, stripMarkdown } from '@/components/shared/MarkdownText';
import { ASSETS_3D } from '@/data/assets3d';
import { CUSTOM_ICONS } from '@/data/customIcons';
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
    id: 'hoan-kiem-van-mieu',
    label: '“VF e34 còn 35%, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.”',
    prompt: 'VF e34 còn 35%, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.',
  },
  {
    id: 'evo200-green-sunday',
    label: '“Xe máy điện Evo200 còn 15%, đang ở Thanh Xuân lúc 11:30 Chủ nhật, sạc ở đâu có điểm xanh?”',
    prompt: 'Xe máy điện Evo200 còn 15%, đang ở Thanh Xuân lúc 11:30 Chủ nhật, sạc ở đâu có điểm xanh?',
  },
  {
    id: 'rescue-10pct',
    label: '“Pin còn 10%, VF e34, đang ở Phố Cổ lúc 18:00 thứ Tư” (cứu pin <15%)',
    prompt: 'Pin còn 10%, VF e34, đang ở Phố Cổ lúc 18:00 thứ Tư',
  },
  {
    id: 'guardrail-da-nang',
    label: '“Pin 40%, đi Đà Nẵng sạc ở đâu?” (Ngoài khu vực Hà Nội)',
    prompt: 'Pin 40%, đi Đà Nẵng sạc ở đâu?',
  },
];

// API etaText is the charge window ("11:42–12:30") or "Sạc ngay"; offline mode gives an arrival time.
function isChargeWindowText(text: string): boolean {
  return /\d{1,2}:\d{2}\s*[–-]/.test(text) || text === 'Sạc ngay';
}

const QUICK_FILL_CHIPS: Record<
  MissingInfoField,
  { chips: { label: string; append: string }[] }
> = {
  destination: {
    chips: [
      { label: 'Ở Cầu Giấy', append: ' đang ở Cầu Giấy' },
      { label: 'Ở Hồ Hoàn Kiếm', append: ' đang ở Hồ Hoàn Kiếm' },
      { label: 'Đi Văn Miếu', append: ' đi Văn Miếu' },
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
      { label: 'Trưa nắng 12h (+45đ)', append: ' lúc trưa nắng 12h' },
      { label: '8h sáng', append: ' lúc 8h sáng' },
      { label: 'Trước 14h30', append: ', 14h30 phải có mặt' },
    ],
  },
};

const INTENT_LABELS: Record<string, string> = {
  recommendation: 'Đề xuất trạm sạc',
  rescue: 'Cứu pin khẩn cấp',
  home_charging: 'Sạc tại nhà',
  ask_back: 'Cần bổ sung thông tin',
  refusal: 'Ngoài phạm vi hỗ trợ',
  chat: 'Trò chuyện',
  partial_prompt: 'Xác nhận tìm trạm',
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
    pendingPrompt,
    consumePendingPrompt,
    setVehicleId,
    sendPromptToApi,
    confirmGreenToken,
    resetApiSession,
    acceptProposedItinerary,
    declineProposedItinerary,
    requestAlternativeOption,
    recommendation,
    apiLoading,
    apiError,
    apiSourceMode,
    lastApiResponse,
    confirmedTokens,
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
  const [showFullReply, setShowFullReply] = useState(false);
  const lastVoiceTriggerRef = useRef(0);
  const fullHeightRef = useRef(0);
  const currentHeightRef = useRef(0);
  const lastKbHeightRef = useRef(0);
  const isKeyboardOpenRef = useRef(false);

  // Hybrid Android IME listener: skips paddingBottom if OS adjustResize already shrank view,
  // and applies exact keyboard height if edgeToEdge prevents resizing.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    let syncTimer: ReturnType<typeof setTimeout> | null = null;

    const showSub = Keyboard.addListener(showEvent, (e) => {
      isKeyboardOpenRef.current = true;
      setIsKeyboardOpen(true);
      const kbHeight = Math.max(0, Math.round(e.endCoordinates?.height ?? 0));
      lastKbHeightRef.current = kbHeight;

      const applyInset = () => {
        const shrink =
          fullHeightRef.current > 0 && currentHeightRef.current > 0
            ? fullHeightRef.current - currentHeightRef.current
            : 0;
        if (shrink >= 80) {
          setKeyboardOffset(0);
        } else {
          setKeyboardOffset(kbHeight);
        }
      };

      applyInset();
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        applyInset();
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 90);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (syncTimer) clearTimeout(syncTimer);
      isKeyboardOpenRef.current = false;
      lastKbHeightRef.current = 0;
      setIsKeyboardOpen(false);
      setKeyboardOffset(0);
    });

    return () => {
      if (syncTimer) clearTimeout(syncTimer);
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const activeOption = proposedOptions[activeOptionIndex] ?? null;

  useEffect(() => {
    setShowFullReply(false);
  }, [lastApiResponse]);

  const submitNaturalText = useCallback(
    async (textToRun: string) => {
      const trimmed = textToRun.trim();
      if (!trimmed || isThinking || apiLoading) return;

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

      setIsThinking(true);
      setPromptText('');
      try {
        await sendPromptToApi(trimmed);
        const stateAfter = useChargePilotStore.getState();
        if (
          stateAfter.apiSourceMode === 'offline_fallback' &&
          stateAfter.parsedRequest &&
          !stateAfter.parsedRequest.isComplete
        ) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 160);
      } finally {
        setIsThinking(false);
      }
    },
    [apiLoading, isThinking, sendPromptToApi, setVehicleId]
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

  // Prompts queued from Home (text box / "Tìm trạm gần nhất") run through the same submit path.
  useEffect(() => {
    if (!pendingPrompt || isThinking || apiLoading) return;
    const queued = consumePendingPrompt();
    if (queued) {
      setMode('chat');
      submitNaturalText(queued).catch(() => {});
    }
  }, [pendingPrompt, isThinking, apiLoading, consumePendingPrompt, submitNaturalText]);

  useEffect(() => {
    return () => {
      cancelVietnameseSpeech().catch(() => {});
    };
  }, []);

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
  const busyThinking = isThinking || apiLoading;
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
  } else if (busyThinking) {
    mascotMood = 'thinking';
    mascotBadge = 'ĐANG TÍNH TOÁN (LIVE AI)';
    mascotSpeech =
      'Đợi mình một chút, mình đang gọi CHARGEPILOT AI kiểm tra trạm trống, % pin và khung giờ sạc an toàn...';
  } else if (voiceError) {
    mascotMood = 'warning';
    mascotBadge = 'MICROPHONE';
    mascotSpeech = voiceError;
  } else if (apiSourceMode === 'live' && lastApiResponse) {
    const st = lastApiResponse.intent_state;
    if (st === 'rescue') {
      mascotMood = 'warning';
      mascotBadge = 'CỨU PIN KHẨN CẤP (<15%)';
    } else if (st === 'refusal') {
      mascotMood = 'warning';
      mascotBadge = 'NGOÀI PHẠM VI / AN TOÀN';
    } else if (st === 'ask_back') {
      mascotMood = 'warning';
      mascotBadge = 'CẦN BỔ SUNG THÔNG TIN';
    } else if (st === 'partial_prompt') {
      mascotMood = 'idle';
      mascotBadge = 'XÁC NHẬN TÌM TRẠM';
    } else if (st === 'chat') {
      mascotMood = 'happy';
      mascotBadge = 'TRỢ LÝ CHARGEPILOT';
    } else if (st === 'home_charging') {
      mascotMood = 'happy';
      mascotBadge = 'SẠC TẠI NHÀ';
    } else {
      mascotMood = 'happy';
      mascotBadge = activeOption
        ? itineraryStatus === 'accepted'
          ? 'ĐÃ ÁP DỤNG LỊCH TRÌNH'
          : `ĐỀ XUẤT ${activeOption.optionIndex + 1}/${activeOption.totalOptions}`
        : 'TRỢ LÝ LIVE AI';
    }
    mascotSpeech = stripMarkdown(lastApiResponse.tts_summary || lastApiResponse.reply_text);
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

  const homeGreenToken =
    apiSourceMode === 'live' &&
    lastApiResponse?.intent_state === 'home_charging' &&
    lastApiResponse.green_reward.eligible
      ? lastApiResponse.green_reward.confirm_token
      : null;
  const isHomeTokenConfirmed = homeGreenToken ? confirmedTokens.includes(homeGreenToken) : false;

  return (
    <View
      ref={rootRef}
      collapsable={false}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        currentHeightRef.current = h;
        if (!isKeyboardOpenRef.current) {
          fullHeightRef.current = h;
          return;
        }
        if (fullHeightRef.current > 0) {
          const shrink = fullHeightRef.current - h;
          if (shrink >= 80) {
            setKeyboardOffset(0);
          } else if (lastKbHeightRef.current > 0) {
            setKeyboardOffset(lastKbHeightRef.current);
          }
        }
      }}
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
          <Text style={[TYPOGRAPHY.sectionTitle, { color: COLORS.textPrimary, flex: 1 }]} numberOfLines={1}>
            Trợ lý ChargePilot
          </Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setPromptText('');
                void resetApiSession();
              }}
              style={styles.resetBtn}
              accessibilityLabel="Bắt đầu phiên trò chuyện mới"
            >
              <RotateCcw size={13} color={COLORS.textSecondary} />
            </Pressable>

            <View style={styles.pointsBadge}>
              <Image
                source={CUSTOM_ICONS.greenCharge}
                style={{ width: 16, height: 16, flexShrink: 0 }}
                contentFit="contain"
              />
              <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen }]} numberOfLines={1}>
                {greenPoints}đ
              </Text>
            </View>
          </View>
        </View>

        {!isKeyboardOpen && (
          <>
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

            {/* 3-Step Human-in-the-Loop (HITL) User Flow Stepper */}
            {lastApiResponse?.intent_state === 'refusal' ? (
              <View style={styles.flowRefusalPill}>
                <ShieldCheck size={14} color={COLORS.warningAmber} />
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.warningAmber, fontWeight: '700', flex: 1 }]} numberOfLines={1}>
                  Chốt chặn an toàn · Yêu cầu ngoài phạm vi / thẩm quyền
                </Text>
              </View>
            ) : (
              <View style={styles.flowStepper}>
                {(() => {
                  const needsClarify =
                    lastApiResponse?.intent_state === 'ask_back' ||
                    lastApiResponse?.intent_state === 'partial_prompt' ||
                    Boolean(parsedRequest && !parsedRequest.isComplete);
                  const hasProposal =
                    !needsClarify && Boolean(activeOption || lastApiResponse?.intent_state === 'home_charging');
                  const step3Confirmed = itineraryStatus === 'accepted' || isHomeTokenConfirmed;
                  const step3Declined = itineraryStatus === 'declined';

                  const steps = [
                    {
                      num: 1,
                      label: needsClarify ? '1. Bổ sung tin' : '1. Yêu cầu',
                      done: hasProposal,
                      active: !hasProposal,
                      warn: needsClarify,
                    },
                    {
                      num: 2,
                      label: '2. Đề xuất AI',
                      done: step3Confirmed || step3Declined,
                      active: hasProposal && !step3Confirmed && !step3Declined,
                      warn: false,
                    },
                    {
                      num: 3,
                      label: step3Declined
                        ? '3. Tự chọn'
                        : isHomeTokenConfirmed
                          ? '3. Đã xác nhận'
                          : '3. Chốt & Đi',
                      done: step3Confirmed,
                      active: step3Confirmed || step3Declined,
                      warn: step3Declined,
                    },
                  ];

                  return steps.map((step, idx) => (
                    <React.Fragment key={step.num}>
                      <View
                        style={[
                          styles.flowStepPill,
                          step.done && styles.flowStepDone,
                          step.warn && !step.done && styles.flowStepWarn,
                          step.active && !step.done && !step.warn && styles.flowStepActive,
                        ]}
                      >
                        <Text
                          style={[
                            TYPOGRAPHY.micro,
                            {
                              color: step.done
                                ? '#0B1017'
                                : step.warn
                                  ? COLORS.warningAmber
                                  : step.active
                                    ? COLORS.energyGreen
                                    : COLORS.textMuted,
                              fontWeight: step.done || step.active || step.warn ? '700' : '500',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {step.done ? `✓ ${step.label}` : step.label}
                        </Text>
                      </View>
                      {idx < 2 && <View style={styles.flowStepConnector} />}
                    </React.Fragment>
                  ));
                })()}
              </View>
            )}
          </>
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
            {/* Original P-006 Mascot Dialogue Hero — hidden while typing so chat & input stay visible */}
            {!isKeyboardOpen && (
              <MascotAssistant
                mood={mascotMood}
                speech={mascotSpeech}
                badgeText={mascotBadge}
                size={64}
              />
            )}

            {/* Subtle offline fallback note when network is unavailable */}
            {apiError && apiSourceMode === 'offline_fallback' && (
              <View style={styles.offlineBanner}>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.warningAmber, flex: 1 }]}>
                  Đang tạm dùng chế độ ngoại tuyến (không có kết nối mạng).
                </Text>
              </View>
            )}

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
            {!isKeyboardOpen &&
              (isListening || (!activeOption && !parsedRequest && !lastApiResponse)) && (
              <Animated.View entering={FadeInDown.duration(180)} style={styles.samplesBlock}>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textSecondary }]}>
                  {isListening ? 'Chạm câu nói mẫu để thử nhanh:' : 'Gợi ý câu hỏi tự nhiên:'}
                </Text>
                {VOICE_SAMPLES.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setPromptText(s.prompt);
                      void submitNaturalText(s.prompt);
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

            {/* User Query Bubble */}
            {!busyThinking && apiSourceMode === 'live' && lastApiResponse?.query && (
              <Animated.View entering={FadeInDown.duration(160)} style={styles.userBubble}>
                <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary, marginBottom: 2 }]}>
                  Bạn vừa hỏi
                </Text>
                <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, lineHeight: 19 }]}>
                  {lastApiResponse.query}
                </Text>
              </Animated.View>
            )}

            {/* AI Full Reply Card — expanded immediately ONLY when there is no glanceable station card */}
            {!busyThinking && apiSourceMode === 'live' && lastApiResponse && !activeOption && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.liveReplyCard}>
                <View style={styles.liveReplyHeader}>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen, fontWeight: '700', flex: 1 }]} numberOfLines={1}>
                    Trợ lý ChargePilot AI
                  </Text>
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary, flexShrink: 0 }]} numberOfLines={1}>
                    {INTENT_LABELS[lastApiResponse.intent_state] || 'Tư vấn sạc'}
                  </Text>
                </View>
                {lastApiResponse.mappo_strategy && (
                  <View style={styles.mappoPill}>
                    <ShieldCheck size={14} color={COLORS.energyGreen} />
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen, flex: 1 }]} numberOfLines={2}>
                      MAPPO: {lastApiResponse.mappo_strategy.strategy_vi}
                    </Text>
                  </View>
                )}
                <MarkdownText>{lastApiResponse.reply_text}</MarkdownText>
                {lastApiResponse.guardrails?.excluded_note && (
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.warningAmber }]}>
                    Lưu ý an toàn: {lastApiResponse.guardrails.excluded_note}
                  </Text>
                )}
                {homeGreenToken && (
                  <Pressable
                    onPress={() => {
                      if (!isHomeTokenConfirmed) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                        void confirmGreenToken(homeGreenToken, 'Sạc tại nhà ngoài cao điểm');
                      }
                    }}
                    disabled={isHomeTokenConfirmed}
                    style={[styles.acceptBtn, isHomeTokenConfirmed && { opacity: 0.6 }]}
                  >
                    <Check size={15} color="#0B1017" />
                    <Text style={[TYPOGRAPHY.caption, { color: '#0B1017', fontWeight: '700' }]}>
                      {isHomeTokenConfirmed
                        ? `Đã nhận +${lastApiResponse.green_reward.points} điểm xanh`
                        : `Xác nhận sạc xanh (+${lastApiResponse.green_reward.points}đ)`}
                    </Text>
                  </Pressable>
                )}
              </Animated.View>
            )}

            {/* Compact MAPPO & safety pill above the glanceable station card */}
            {!busyThinking && activeOption && apiSourceMode === 'live' && lastApiResponse && (
              <>
                {lastApiResponse.mappo_strategy && (
                  <View style={styles.mappoPill}>
                    <ShieldCheck size={14} color={COLORS.energyGreen} />
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.energyGreen, flex: 1 }]} numberOfLines={1}>
                      MAPPO: {lastApiResponse.mappo_strategy.strategy_vi}
                    </Text>
                  </View>
                )}
                {lastApiResponse.guardrails?.excluded_note && (
                  <View style={styles.offlineBanner}>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.warningAmber, flex: 1 }]} numberOfLines={2}>
                      {lastApiResponse.guardrails.excluded_note}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Front-door partial_prompt quick Yes/No reply chips */}
            {!busyThinking &&
              apiSourceMode === 'live' &&
              lastApiResponse?.intent_state === 'partial_prompt' && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.missingBox}>
                <View style={styles.quickChipsRow}>
                  {[
                    { label: 'Có, tìm trạm sạc', text: 'Có, tìm giúp mình' },
                    { label: 'Không, cảm ơn', text: 'Không, cảm ơn' },
                  ].map((q) => (
                    <Pressable
                      key={q.label}
                      onPress={() => {
                        setPromptText(q.text);
                        void submitNaturalText(q.text);
                      }}
                      style={styles.quickChip}
                    >
                      <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen }]}>
                        {q.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* Live AI ask_back follow-up questions & multi-turn quick replies */}
            {!busyThinking &&
              apiSourceMode === 'live' &&
              lastApiResponse?.intent_state === 'ask_back' && (
              <Animated.View entering={FadeInDown.duration(200)} style={styles.missingBox}>
                {lastApiResponse.follow_up_questions.length > 0 && (
                  <Text style={[TYPOGRAPHY.caption, { color: COLORS.warningAmber }]}>
                    {lastApiResponse.follow_up_questions.join(' ')}
                  </Text>
                )}
                <View style={styles.quickChipsRow}>
                  {[
                    {
                      label: 'VF e34 · 35% · Cầu Giấy 10:00 T3',
                      text: 'VF e34 pin 35% đang ở Cầu Giấy lúc 10:00 thứ Ba',
                    },
                    {
                      label: 'Evo200 · 20% · Thanh Xuân 14:00 T7',
                      text: 'Evo200 pin 20% đang ở Thanh Xuân lúc 14:00 thứ Bảy',
                    },
                  ].map((q) => (
                    <Pressable
                      key={q.label}
                      onPress={() => {
                        setPromptText(q.text);
                        void submitNaturalText(q.text);
                      }}
                      style={styles.quickChip}
                    >
                      <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen }]}>
                        + {q.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
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
            {!busyThinking && activeOption && (
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
                    source={activeOption.reward.isSolarNoon ? CUSTOM_ICONS.greenCharge : ASSETS_3D.coin}
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
                  <View style={styles.stationThumb3D}>
                    <Image
                      source={CUSTOM_ICONS.evStation}
                      style={{ width: 44, height: 44 }}
                      contentFit="contain"
                    />
                  </View>
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
                    <Text
                      style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {activeOption.distanceKm} km
                    </Text>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                      Chạy {activeOption.driveMin}p
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text
                      style={[TYPOGRAPHY.metricMedium, { color: COLORS.energyGreen }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {activeOption.chargeMin}p
                    </Text>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]}>
                      {activeOption.arrivalBatteryPct}%→{activeOption.departureBatteryPct}%
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text
                      style={[TYPOGRAPHY.metricMedium, { color: COLORS.textPrimary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {activeOption.etaText}
                    </Text>
                    <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary }]} numberOfLines={1}>
                      {isChargeWindowText(activeOption.etaText) ? 'Khung sạc' : 'Đến nơi'}
                    </Text>
                  </View>
                </View>

                {/* 3 Concise Decision Buttons */}
                <View style={styles.decisionRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      acceptProposedItinerary();
                      setTimeout(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 120);
                    }}
                    style={styles.acceptBtn}
                  >
                    <Check size={15} color="#0B1017" />
                    <Text style={[TYPOGRAPHY.caption, { color: '#0B1017', fontWeight: '700' }]} numberOfLines={1}>
                      {itineraryStatus === 'accepted' ? 'Đã chốt lịch' : 'Theo lịch này'}
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

                {itineraryStatus === 'accepted' && (
                  <View style={styles.confirmedBanner}>
                    <Check size={15} color={COLORS.energyGreen} />
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.energyGreen, flex: 1 }]}>
                      Đã chốt lịch trình tới {activeOption.stationName}. Chọn dẫn đường hoặc xem lộ trình bên dưới!
                    </Text>
                  </View>
                )}

                {itineraryStatus === 'accepted' &&
                  !activeOption.isIntercitySimulated &&
                  (activeOption.hanoiStationId || activeOption.apiStationId) && (
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

                {itineraryStatus === 'accepted' && activeTimeline.length > 0 && (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setMode('timeline');
                    }}
                    style={styles.timelineCtaBtn}
                  >
                    <Clock size={15} color={COLORS.textPrimary} />
                    <Text style={[TYPOGRAPHY.caption, { color: COLORS.textPrimary, fontWeight: '700' }]}>
                      Xem lộ trình chi tiết ({activeTimeline.length} chặng)
                    </Text>
                  </Pressable>
                )}

                {itineraryStatus === 'accepted' &&
                  activeOption.stationLat != null &&
                  activeOption.stationLon != null && (
                  <Pressable
                    onPress={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${activeOption.stationLat},${activeOption.stationLon}`;
                      Linking.openURL(url).catch(() => {});
                    }}
                    style={styles.mapsBtn}
                  >
                    <ExternalLink size={16} color={COLORS.energyGreen} />
                    <Text style={[TYPOGRAPHY.cardTitle, { color: COLORS.energyGreen }]}>
                      Mở Google Maps tới trạm
                    </Text>
                  </Pressable>
                )}
              </Animated.View>
            )}

            {/* Collapsible verbatim AI analysis below the glanceable proposal card */}
            {!busyThinking && activeOption && apiSourceMode === 'live' && lastApiResponse && (
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setShowFullReply((v) => !v);
                  }}
                  style={styles.detailToggleBtn}
                >
                  <Text style={[TYPOGRAPHY.micro, { color: COLORS.textSecondary, fontWeight: '600' }]}>
                    {showFullReply
                      ? 'Thu gọn phân tích AI ▴'
                      : 'Xem chi tiết phân tích AI (Top 3 & luật an toàn) ▾'}
                  </Text>
                </Pressable>
                {showFullReply && (
                  <Animated.View entering={FadeInDown.duration(160)} style={styles.liveReplyCard}>
                    <MarkdownText>{lastApiResponse.reply_text}</MarkdownText>
                  </Animated.View>
                )}
              </View>
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
              multiline
              maxLength={400}
              textAlignVertical="center"
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
    gap: 8,
  },
  headerActions: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  apiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  resetBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.warningAmberDim,
    borderWidth: 1,
    borderColor: COLORS.warningAmberBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  liveReplyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    padding: SPACING.md,
    gap: 8,
  },
  liveReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pointsBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.energyGreenDim,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
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
    backgroundColor: COLORS.energyGreenDim,
    alignItems: 'center',
    justifyContent: 'center',
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
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.energyGreenDim,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
  },
  flowStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  flowStepPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  flowStepActive: {
    borderColor: COLORS.energyGreenBorder,
    backgroundColor: COLORS.energyGreenDim,
  },
  flowStepDone: {
    borderColor: COLORS.energyGreen,
    backgroundColor: COLORS.energyGreen,
  },
  flowStepWarn: {
    borderColor: COLORS.warningAmberBorder,
    backgroundColor: COLORS.warningAmberDim,
  },
  flowRefusalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.warningAmberDim,
    borderWidth: 1,
    borderColor: COLORS.warningAmberBorder,
  },
  flowStepConnector: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.navBlueBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  mappoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.energyGreenDim,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confirmedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.energyGreenDim,
    borderWidth: 1,
    borderColor: COLORS.energyGreenBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  timelineCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    zIndex: 30,
    elevation: 12,
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
    maxHeight: 96,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
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
  detailToggleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
