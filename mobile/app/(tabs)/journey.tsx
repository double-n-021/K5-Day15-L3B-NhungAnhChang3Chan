import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { requireOptionalNativeModule } from 'expo';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Check, Clock, Mic, MicOff, Navigation, RotateCcw, Send, X } from 'lucide-react-native';
import Animated, { LinearTransition, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { JourneyProposals } from '@/components/journey/JourneyProposals';
import { MascotAssistant, MOOD_ACCENT, type AssistantMood } from '@/components/mascot/MascotAssistant';
import { ChargePilotBrand } from '@/components/shared/ChargePilotBrand';
import { MarkdownText, stripMarkdown } from '@/components/shared/MarkdownText';
import { CUSTOM_ICONS } from '@/data/customIcons';
import { cancelVietnameseSpeech, ensureMicrophonePermission, startVietnameseSpeech, stopVietnameseSpeech } from '@/services/voiceRecognition';
import { useChargePilotStore } from '@/stores/useChargePilotStore';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { TYPOGRAPHY } from '@/theme/typography';
import type { ApiChatResponse, MissingInfoField, ProposedItineraryOption } from '@/types';

const SAMPLES = [
  { label: 'Trạm gần nhất', prompt: 'Tìm trạm sạc gần nhất' },
  { label: 'Đi Văn Miếu', prompt: 'VF e34 còn 35%, đang ở Hồ Hoàn Kiếm lúc 14:00 thứ Bảy, 16:30 đi Văn Miếu.' },
  { label: 'Sạc trưa nắng', prompt: 'Xe máy điện Evo200 còn 15%, đang ở Thanh Xuân lúc 11:30 Chủ nhật, sạc ở đâu có điểm xanh?' },
];

const QUICK_REPLIES: Record<MissingInfoField | 'origin' | 'vehicle', { label: string; text: string }[]> = {
  battery: [10, 20, 30, 50].map((pct) => ({ label: `${pct}%`, text: `Pin còn ${pct}%` })),
  destination: [{ label: 'Hồ Gươm', text: 'Đi Hồ Gươm' }, { label: 'Văn Miếu', text: 'Đi Văn Miếu' }],
  origin: [{ label: 'Cầu Giấy', text: 'Đang ở Cầu Giấy' }, { label: 'Thanh Xuân', text: 'Đang ở Thanh Xuân' }],
  time: [{ label: '8:00', text: 'Đi lúc 8:00' }, { label: '12:00', text: 'Đi lúc 12:00' }, { label: '14:30', text: 'Đi lúc 14:30' }],
  vehicle: [{ label: 'VF e34', text: 'Xe VF e34' }, { label: 'Evo200', text: 'Xe máy điện Evo200' }],
};

const FIELD_LABELS = { battery: '% pin', destination: 'điểm đến', origin: 'vị trí', time: 'giờ đi', vehicle: 'mẫu xe' };
type ClarificationField = keyof typeof FIELD_LABELS;

function getAskedFields(response: ApiChatResponse | null, missing: MissingInfoField[]): ClarificationField[] {
  if (missing.length) return missing;
  if (response?.intent_state !== 'ask_back') return [];
  const question = (response.follow_up_questions.join(' ') || response.tts_summary || response.reply_text).toLowerCase();
  const fields: ClarificationField[] = [];
  if (/pin|phần trăm|%/.test(question) && response.battery.current_pct == null) fields.push('battery');
  if (/vị trí|đang ở|địa chỉ|khu vực|xuất phát/.test(question)) fields.push('origin');
  if (/điểm đến|đến đâu|đi đâu|điểm hẹn/.test(question)) fields.push('destination');
  if (/giờ đi|lúc mấy giờ|thời gian|giờ hẹn|khi nào/.test(question)) fields.push('time');
  if (/mẫu xe|loại xe|xe gì|dòng xe/.test(question)) fields.push('vehicle');
  return fields;
}

function briefReply(text: string, rescue = false): string {
  const clean = stripMarkdown(text).replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/);
  // The rescue banner already states that the battery is low. Keep the action when the API sends three sentences.
  return (rescue && sentences.length > 2 ? sentences.slice(1, 3) : sentences.slice(0, 2)).join(' ').trim();
}

function optionSummary(option: ProposedItineraryOption): string {
  const status = option.statusLabel?.trim().replace(/[.!?]+$/, '');
  const detail = status || (option.waitMin > 0 ? `dự kiến chờ ${option.waitMin} phút` : `sạc khoảng ${option.chargeMin} phút`);
  return `${option.stationName} cách ${option.distanceKm.toLocaleString('vi-VN')} ki-lô-mét, ${detail}.`;
}

function suggestedDistance(option: ProposedItineraryOption, response: ApiChatResponse | null): number {
  // Use the same starting point as the assistant summary. Navigation separately uses live GPS routing.
  return response?.stations.find((station) => station.id === option.apiStationId)?.road_km ?? option.distanceKm;
}

function responseSummary(response: ApiChatResponse | null, option?: ProposedItineraryOption, index = 0): string {
  if (response?.intent_state === 'refusal') {
    const reason = briefReply(response.guardrails.excluded_note || response.tts_summary || response.reply_text)
      .split(/(?<=[.!?])\s+/)[0];
    return reason
      ? `${reason.replace(/[.!?]+$/, '')}. Bạn có thể hỏi mình tìm trạm sạc cho xe điện.`
      : 'Bạn có thể hỏi mình tìm trạm sạc cho xe điện.';
  }
  if (response?.intent_state === 'ask_back' || response?.intent_state === 'partial_prompt') {
    return briefReply(response.follow_up_questions.join(' ') || response.tts_summary);
  }
  if (option && (index > 0 || !response?.tts_summary)) {
    return optionSummary({ ...option, distanceKm: suggestedDistance(option, response) });
  }
  return briefReply(response?.tts_summary || response?.reply_text || '', response?.intent_state === 'rescue');
}

const speechAvailable = Platform.OS === 'web'
  ? typeof globalThis.speechSynthesis !== 'undefined'
  : Boolean(requireOptionalNativeModule('ExpoSpeech'));

async function speakSummary(text: string) {
  if (!speechAvailable || !text) return;
  const speech = await import('expo-speech');
  await speech.stop();
  speech.speak(text, { language: 'vi-VN' });
}

async function stopSummary() {
  if (speechAvailable) await (await import('expo-speech')).stop();
}

export default function JourneyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const audioLevel = useSharedValue(0);
  const lastVoiceTrigger = useRef(0);
  const voiceDraft = useRef(false);
  const voiceAnswer = useRef(false);
  const requestInFlight = useRef(false);
  const focused = useRef(false);

  const {
    effectiveInput, parsedRequest, proposedOptions, activeOptionIndex, itineraryStatus, greenPoints,
    voiceDrawerTrigger, pendingPrompt, consumePendingPrompt, setVehicleId, sendPromptToApi,
    confirmGreenToken, resetApiSession, acceptProposedItinerary, confirmAcceptedItineraryReward,
    declineProposedItinerary, requestAlternativeOption, recommendation, apiLoading, apiError,
    apiSourceMode, lastApiResponse, confirmedTokens, creditedOptionIds,
  } = useChargePilotStore();

  const [prompt, setPrompt] = useState('');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [micBlocked, setMicBlocked] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [sheet, setSheet] = useState<'reply' | 'timeline' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [rewardError, setRewardError] = useState(false);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => {
      focused.current = false;
      void stopSummary().catch(() => {});
    };
  }, []));

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
      void cancelVietnameseSpeech();
    };
  }, []);

  const submit = useCallback(async (value: string, fromVoice = false) => {
    const text = value.trim();
    if (!text || requestInFlight.current || useChargePilotStore.getState().apiLoading) return;
    requestInFlight.current = true;
    setSubmitting(true);
    voiceDraft.current = false;
    voiceAnswer.current = fromVoice;
    Keyboard.dismiss();
    void stopSummary().catch(() => {});
    void cancelVietnameseSpeech();
    setListening(false);
    setTranscript('');
    setVoiceError('');
    setRewardError(false);
    setSheet(null);
    setPrompt('');
    try {
      const lower = text.toLowerCase();
      if (/evo|xe máy/.test(lower)) setVehicleId('vinfast_evo200');
      else if (/e34|ô tô/.test(lower)) setVehicleId('vfe34');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await sendPromptToApi(text);
      const result = useChargePilotStore.getState();
      const summary = responseSummary(result.lastApiResponse, result.proposedOptions[0])
        || (result.parsedRequest?.missingFields.length
          ? `Mình cần thêm ${result.parsedRequest.missingFields.map((field) => FIELD_LABELS[field]).join(', ')}.`
          : 'Chưa tìm được trạm phù hợp từ dữ liệu offline.');
      if (fromVoice && focused.current) void speakSummary(summary).catch(() => {});
    } finally {
      requestInFlight.current = false;
      setSubmitting(false);
    }
  }, [sendPromptToApi, setVehicleId]);

  const startMic = useCallback(async () => {
    if (useChargePilotStore.getState().apiLoading) return;
    Keyboard.dismiss();
    await stopSummary().catch(() => {});
    setVoiceError('');
    setMicBlocked(false);
    setTranscript('');
    audioLevel.set(0);

    const permission = await ensureMicrophonePermission();
    if (permission !== 'granted') {
      setMicBlocked(permission === 'never_ask_again');
      setVoiceError(permission === 'unavailable' ? 'Thiết bị chưa hỗ trợ nhận giọng nói.' : 'Hãy cấp quyền micro hoặc gõ yêu cầu.');
      return;
    }

    setListening(true);
    await startVietnameseSpeech({
      onRms: (rms) => { audioLevel.set(withTiming(Math.min(1, Math.max(0, (rms + 2) / 12)), { duration: 100 })); },
      onPartial: (text) => {
        voiceDraft.current = true;
        setTranscript(text);
        setPrompt(text);
      },
      onResult: (text) => {
        voiceDraft.current = true;
        setTranscript(text);
        setPrompt(text);
        setListening(false);
      },
      onError: (message) => { setListening(false); setVoiceError(message); },
      onEnd: () => { setListening(false); audioLevel.set(0); },
    });
  }, [audioLevel]);

  useEffect(() => {
    if (voiceDrawerTrigger <= lastVoiceTrigger.current) return;
    lastVoiceTrigger.current = voiceDrawerTrigger;
    void startMic().catch(() => {});
  }, [voiceDrawerTrigger, startMic]);

  useEffect(() => {
    if (!pendingPrompt || apiLoading || submitting || resetting || requestInFlight.current) return;
    const queued = consumePendingPrompt();
    if (queued) void submit(queued);
  }, [pendingPrompt, apiLoading, submitting, resetting, consumePendingPrompt, submit]);

  const option = proposedOptions[activeOptionIndex];
  const intent = lastApiResponse?.intent_state;
  const accepted = itineraryStatus === 'accepted' && Boolean(option);
  const offline = apiSourceMode === 'offline_fallback' && Boolean(parsedRequest);
  const rescue = intent === 'rescue' || (offline && Boolean(option) && effectiveInput.batteryPct < 15);
  const askedFields = getAskedFields(lastApiResponse, parsedRequest?.missingFields ?? []);
  const clarify = intent === 'ask_back' || intent === 'partial_prompt' || askedFields.length > 0;
  const reviewVoice = Boolean(transcript && prompt.trim());
  const composing = listening || keyboardOpen || reviewVoice;
  const timeline = option?.timeline.length ? option.timeline : recommendation.timeline;
  const replyText = lastApiResponse?.reply_text || option?.fullReplyText || option?.whyThisOption || '';
  const guardrail = lastApiResponse?.guardrails.excluded_note;
  const hasDetails = Boolean(replyText || guardrail || proposedOptions.length || lastApiResponse?.follow_up_questions.length);
  const busy = apiLoading || submitting || resetting;

  let mood: AssistantMood = 'idle';
  let status = 'Chào bạn! Hỏi mình về trạm sạc nhé';
  let summary = '';
  if (busy) {
    mood = 'thinking';
    status = resetting ? 'Đang làm mới phiên…' : 'Đang tìm trạm phù hợp…';
  } else if (composing) {
    mood = 'listening';
    status = listening ? 'Đang nghe…' : reviewVoice ? 'Kiểm tra rồi bấm gửi' : 'Đang nhập…';
    summary = listening || reviewVoice ? prompt : '';
  } else if (voiceError) {
    mood = 'warning';
    status = 'Chưa nhận được giọng nói';
    summary = voiceError;
  } else if (intent === 'refusal') {
    mood = 'refusal';
    status = 'Ngoài phạm vi hỗ trợ';
    summary = responseSummary(lastApiResponse);
  } else if (clarify) {
    mood = 'warning';
    status = askedFields.length
      ? `Mình cần thêm: ${askedFields.map((field) => FIELD_LABELS[field]).join(', ')}`
      : intent === 'partial_prompt' ? 'Bạn muốn mình tìm trạm?' : 'Mình cần thêm thông tin';
    summary = responseSummary(lastApiResponse);
  } else if (accepted) {
    mood = 'happy';
    status = 'Đã chốt lịch';
    summary = option.stationName;
  } else if (option || lastApiResponse || offline) {
    mood = rescue ? 'rescue' : offline ? 'offline' : 'result';
    status = rescue ? 'Pin dưới 15% — sạc ngay' : offline ? 'Mất kết nối — đang dùng dữ liệu offline' : 'Đề xuất cho bạn';
    summary = responseSummary(lastApiResponse, option, activeOptionIndex);
    if (!summary && offline) summary = 'Chưa tìm được trạm phù hợp từ dữ liệu offline.';
  }

  const showingResult = !composing && !busy && !voiceError && !clarify
    && intent !== 'refusal' && !accepted && Boolean(option);
  const showAccepted = !composing && !busy && !voiceError && accepted;
  const compact = showingResult || composing || mood === 'thinking' || (mood === 'rescue' && !option);
  const stageSize = compact ? (composing ? 48 : 56) : showAccepted ? 96 : Math.min(152, height * 0.19);
  const homeReward = intent === 'home_charging' && lastApiResponse?.green_reward.eligible
    ? lastApiResponse.green_reward : null;
  const rewardToken = showAccepted ? option?.confirmToken : homeReward?.confirm_token;
  const rewardPoints = showAccepted && !rescue && (!option?.isLiveApi || rewardToken)
    ? option?.reward.points ?? 0 : homeReward?.confirm_token ? homeReward.points : 0;
  const credited = rewardToken ? confirmedTokens.includes(rewardToken) : !!option && creditedOptionIds.includes(option.id);
  const canNavigate = option && ((!option.isIntercitySimulated && (option.hanoiStationId || option.apiStationId))
    || (option.stationLat != null && option.stationLon != null));

  const selectOption = (index: number) => {
    requestAlternativeOption(index);
    void Haptics.selectionAsync().catch(() => {});
    const next = proposedOptions[index];
    if (voiceAnswer.current && focused.current && next) {
      void speakSummary(responseSummary(lastApiResponse, next, index)).catch(() => {});
    }
  };

  const claimReward = async () => {
    if (rewardBusy || credited) return;
    setRewardBusy(true);
    setRewardError(false);
    try {
      const success = showAccepted ? await confirmAcceptedItineraryReward()
        : rewardToken ? await confirmGreenToken(rewardToken, 'Sạc tại nhà ngoài cao điểm') : false;
      setRewardError(!success);
    } finally {
      setRewardBusy(false);
    }
  };

  const reset = async () => {
    if (resetting || apiLoading) return;
    setResetting(true);
    voiceDraft.current = false;
    voiceAnswer.current = false;
    setListening(false);
    setVoiceError('');
    setMicBlocked(false);
    setTranscript('');
    setPrompt('');
    setRewardError(false);
    setSheet(null);
    Keyboard.dismiss();
    void cancelVietnameseSpeech();
    void stopSummary().catch(() => {});
    try {
      await resetApiSession();
    } finally {
      setResetting(false);
    }
  };

  const submitQuickReply = (text: string) => {
    const prior = offline && parsedRequest ? `${parsedRequest.rawText}. ` : '';
    void submit(prior + text);
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior="padding">
      <View style={styles.header}>
        <ChargePilotBrand size={28} />
        <View style={styles.headerActions}>
          <Pressable onPress={() => void reset()} disabled={busy} style={styles.reset} accessibilityRole="button" accessibilityLabel="Bắt đầu phiên mới">
            <RotateCcw size={17} color={COLORS.textSecondary} />
          </Pressable>
          <View style={styles.points} accessible accessibilityLabel={`${greenPoints} điểm Sạc Xanh`}>
            <Image source={CUSTOM_ICONS.greenCharge} style={styles.pointIcon} contentFit="contain" />
            <Text style={[TYPOGRAPHY.caption, styles.mint]}>{greenPoints}đ</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.stage}
        contentContainerStyle={[styles.stageContent, !compact && styles.centerStage, showingResult && fontScale < 1.45 && styles.resultStage]}
        scrollEnabled={!showingResult || fontScale >= 1.45 || height < 700}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View layout={reducedMotion ? undefined : LinearTransition.duration(220)} style={compact ? styles.compactHero : styles.hero}>
          <MascotAssistant mood={mood} size={stageSize} audioLevel={audioLevel} />
          <View style={[compact ? styles.compactCopy : styles.centerCopy, showingResult && styles.resultBubble]}>
            <Text accessibilityLiveRegion="polite" style={[compact ? TYPOGRAPHY.caption : TYPOGRAPHY.sectionTitle, { color: MOOD_ACCENT[mood] }, !compact && styles.centerText]}>
              {status}
            </Text>
            {!!summary && (
              <Text
                style={[compact ? TYPOGRAPHY.caption : TYPOGRAPHY.body, styles.summary, !compact && styles.centerText]}
                numberOfLines={composing ? 4 : undefined}
              >
                {summary}
              </Text>
            )}
          </View>
        </Animated.View>

        {mood === 'idle' && (
          <View style={[styles.chips, styles.centerChips]}>
            {SAMPLES.map((sample) => (
              <Pressable key={sample.label} onPress={() => void submit(sample.prompt)} style={styles.chip} accessibilityRole="button">
                <Text style={[TYPOGRAPHY.caption, styles.primary]}>{sample.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {!composing && !busy && !voiceError && clarify && (
          <View style={styles.clarifications}>
            {intent === 'partial_prompt' ? (
              <View style={[styles.chips, styles.centerChips]}>
                <Pressable style={styles.chip} onPress={() => submitQuickReply('Có, tìm giúp mình')} accessibilityRole="button"><Text style={[TYPOGRAPHY.caption, styles.mint]}>Tìm trạm</Text></Pressable>
                <Pressable style={styles.chip} onPress={() => submitQuickReply('Không, cảm ơn')} accessibilityRole="button"><Text style={[TYPOGRAPHY.caption, styles.primary]}>Để sau</Text></Pressable>
              </View>
            ) : askedFields.map((field) => (
              <View key={field} style={[styles.chips, styles.centerChips]}>
                {QUICK_REPLIES[field].map((entry) => (
                  <Pressable key={entry.label} style={styles.chip} onPress={() => submitQuickReply(entry.text)} accessibilityRole="button">
                    <Text style={[TYPOGRAPHY.caption, styles.mint]}>{entry.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}

        {voiceError && micBlocked && !composing && (
          <Pressable onPress={() => void Linking.openSettings()} style={styles.chip} accessibilityRole="button">
            <Text style={[TYPOGRAPHY.caption, styles.mint]}>Mở Cài đặt micro</Text>
          </Pressable>
        )}

        {showingResult && (
          <JourneyProposals
            options={proposedOptions.map((proposal) => ({ ...proposal, distanceKm: suggestedDistance(proposal, lastApiResponse) }))}
            activeIndex={activeOptionIndex}
            width={width - SPACING.lg * 2}
            rescue={rescue}
            canKeepDriving={lastApiResponse?.mappo_strategy?.strategy === 'SKIP'}
            onSelect={selectOption}
            onAccept={() => {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              acceptProposedItinerary(false);
            }}
            onMap={() => {
              declineProposedItinerary();
              router.push('/(tabs)/map');
            }}
          />
        )}

        {showAccepted && (
          <View style={styles.acceptedActions}>
            {canNavigate && (
              <Pressable
                style={styles.primaryButton}
                accessibilityRole="button"
                onPress={() => {
                  if (!option.isIntercitySimulated && (option.hanoiStationId || option.apiStationId)) {
                    router.push('/navigation');
                  } else {
                    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${option.stationLat},${option.stationLon}`).catch(() => {});
                  }
                }}
              >
                <Navigation size={18} color={COLORS.bg} />
                <Text style={[TYPOGRAPHY.cardTitle, styles.onMint]}>Bắt đầu dẫn đường</Text>
              </Pressable>
            )}
            {timeline.length > 0 && (
              <Pressable style={styles.link} onPress={() => setSheet('timeline')} accessibilityRole="button">
                <Clock size={15} color={COLORS.energyGreen} />
                <Text style={[TYPOGRAPHY.caption, styles.mint]}>Xem lộ trình chi tiết ({timeline.length} chặng)</Text>
              </Pressable>
            )}
          </View>
        )}

        {!composing && !busy && !rescue && rewardPoints > 0 && (
          <View style={styles.clarifications}>
            <Pressable disabled={credited || rewardBusy} style={styles.link} onPress={() => void claimReward()} accessibilityRole="button">
              <Check size={16} color={COLORS.energyGreen} />
              <Text style={[TYPOGRAPHY.caption, styles.mint]}>
                {credited ? `Đã nhận +${rewardPoints} điểm Sạc Xanh` : rewardBusy ? 'Đang xác nhận…' : `Xác nhận +${rewardPoints} điểm Sạc Xanh`}
              </Text>
            </Pressable>
            {rewardError && <Text style={[TYPOGRAPHY.caption, styles.centerText, styles.warning]}>{apiError || 'Chưa xác nhận được điểm. Hãy thử lại.'}</Text>}
          </View>
        )}

        {!composing && !busy && hasDetails && (
          <Pressable style={styles.link} onPress={() => setSheet('reply')} accessibilityRole="button">
            <Text style={[TYPOGRAPHY.caption, styles.mint]}>Xem chi tiết</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={styles.inputDock}>
        <Pressable
          onPress={() => { if (listening) void stopVietnameseSpeech(); else void startMic(); }}
          disabled={busy}
          style={[styles.mic, listening && styles.micActive]}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Dừng nghe' : 'Bật micro'}
        >
          {listening ? <MicOff size={20} color={COLORS.bg} /> : <Mic size={20} color={COLORS.bg} />}
        </Pressable>
        <TextInput
          value={prompt}
          onChangeText={(text) => {
            if (!text.trim()) { voiceDraft.current = false; setTranscript(''); }
            setPrompt(text);
            setVoiceError('');
          }}
          placeholder="Nói hoặc gõ yêu cầu…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          multiline
          maxLength={400}
          textAlignVertical="center"
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={() => void submit(prompt, voiceDraft.current)}
          accessibilityLabel="Nói hoặc gõ yêu cầu"
        />
        <Pressable
          onPress={() => void submit(prompt, voiceDraft.current)}
          disabled={!prompt.trim() || busy}
          style={[styles.send, (!prompt.trim() || busy) && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Gửi yêu cầu"
        >
          <Send size={18} color={COLORS.energyGreen} />
        </Pressable>
      </View>

      {sheet && (
        <Modal transparent animationType="none" onRequestClose={() => setSheet(null)} statusBarTranslucent>
          <GestureHandlerRootView style={styles.sheetRoot}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} accessibilityLabel="Đóng chi tiết" />
            <BottomSheet
              snapPoints={['76%']}
              enableDynamicSizing={false}
              enablePanDownToClose
              onClose={() => setSheet(null)}
              backgroundStyle={styles.sheetBackground}
              handleIndicatorStyle={styles.sheetHandle}
            >
              <View style={styles.sheetHeader}>
                <Text style={[TYPOGRAPHY.sectionTitle, styles.primary]}>{sheet === 'timeline' ? 'Lộ trình chi tiết' : 'Chi tiết đề xuất'}</Text>
                <Pressable onPress={() => setSheet(null)} accessibilityRole="button" accessibilityLabel="Đóng" style={styles.reset}>
                  <X size={20} color={COLORS.textPrimary} />
                </Pressable>
              </View>
              <BottomSheetScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.xl }]}>
                {sheet === 'timeline' ? timeline.map((item) => (
                  <View key={item.id} style={styles.timelineRow}>
                    <Text style={[TYPOGRAPHY.metricSmall, styles.mint, styles.timelineTime]}>{item.time}</Text>
                    <View style={styles.timelineCopy}>
                      <Text style={[TYPOGRAPHY.cardTitle, styles.primary]}>{item.title}</Text>
                      <Text style={[TYPOGRAPHY.caption, styles.secondary]}>{item.subtitle}</Text>
                      <Text style={[TYPOGRAPHY.micro, item.status === 'critical' ? styles.critical : styles.mint]}>{item.batteryPct}% pin</Text>
                    </View>
                  </View>
                )) : (
                  <>
                    {!!replyText && <MarkdownText>{replyText}</MarkdownText>}
                    {!!guardrail && <Text style={[TYPOGRAPHY.body, styles.warning]}>{guardrail}</Text>}
                    {proposedOptions.length > 0 && (!lastApiResponse || !replyText) && (
                      <View style={styles.clarifications}>
                        <Text style={[TYPOGRAPHY.cardTitle, styles.primary]}>Các trạm đề xuất</Text>
                        {proposedOptions.map((item, index) => (
                          <Text key={item.id} style={[TYPOGRAPHY.body, styles.secondary]}>
                            {index + 1}. {item.stationName} · {item.distanceKm} km{item.statusLabel ? ` · ${item.statusLabel}` : ''}
                          </Text>
                        ))}
                      </View>
                    )}
                    {!rescue && !!option?.reward.points && <Text style={[TYPOGRAPHY.body, styles.mint]}>{option.reward.reason}</Text>}
                  </>
                )}
              </BottomSheetScrollView>
            </BottomSheet>
          </GestureHandlerRootView>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 52, paddingHorizontal: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reset: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  points: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.energyGreenDim, borderColor: COLORS.energyGreenBorder, borderWidth: 1, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pointIcon: { width: 16, height: 16 },
  stage: { flex: 1 },
  stageContent: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.md },
  centerStage: { justifyContent: 'center' },
  resultStage: { paddingTop: SPACING.md },
  hero: { alignItems: 'center', gap: SPACING.lg, paddingVertical: SPACING.sm },
  compactHero: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  compactCopy: { flex: 1, gap: 4 },
  resultBubble: { padding: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderColor: COLORS.border, borderWidth: 1 },
  centerCopy: { alignItems: 'center', maxWidth: 380, gap: SPACING.sm },
  centerText: { textAlign: 'center' },
  summary: { color: COLORS.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  centerChips: { justifyContent: 'center' },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  clarifications: { gap: SPACING.sm },
  acceptedActions: { gap: 4 },
  link: { minHeight: 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: SPACING.sm },
  primaryButton: { minHeight: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.energyGreen, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm },
  inputDock: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  mic: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.energyGreen },
  micActive: { backgroundColor: COLORS.warningAmber },
  input: { ...TYPOGRAPHY.body, flex: 1, minHeight: 44, maxHeight: 96, backgroundColor: COLORS.bg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 10, color: COLORS.textPrimary },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  sheetRoot: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.60)' },
  sheetBackground: { backgroundColor: COLORS.surface },
  sheetHandle: { backgroundColor: COLORS.textMuted },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: SPACING.lg, paddingRight: SPACING.sm },
  sheetContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.md },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.bg },
  timelineTime: { minWidth: 54 },
  timelineCopy: { flex: 1, gap: 4 },
  mint: { color: COLORS.energyGreen },
  onMint: { color: COLORS.bg, fontWeight: '700' },
  primary: { color: COLORS.textPrimary },
  secondary: { color: COLORS.textSecondary },
  warning: { color: COLORS.warningAmber },
  critical: { color: COLORS.criticalRed },
});
