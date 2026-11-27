import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type EmitterSubscription,
} from 'react-native';

export type MicPermissionStatus = 'granted' | 'denied' | 'never_ask_again' | 'unavailable';

export interface VietnameseSpeechCallbacks {
  onStart?: () => void;
  onPartial?: (text: string) => void;
  onResult?: (text: string) => void;
  onRms?: (rms: number) => void;
  onError?: (message: string, code?: number) => void;
  onEnd?: () => void;
}

interface ChargePilotSpeechNativeModule {
  isAvailable(): Promise<boolean>;
  startListening(locale: string): Promise<string>;
  stopListening(): Promise<boolean>;
  cancelListening(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const SpeechModule = NativeModules.ChargePilotSpeech as
  | ChargePilotSpeechNativeModule
  | undefined;

const speechEmitter = SpeechModule ? new NativeEventEmitter(SpeechModule) : null;
let activeSubscriptions: EmitterSubscription[] = [];

function clearSubscriptions() {
  for (const sub of activeSubscriptions) {
    sub.remove();
  }
  activeSubscriptions = [];
}

/**
 * Checks if Android native speech recognition module is present.
 */
export function isNativeSpeechSupported(): boolean {
  return Platform.OS === 'android' && Boolean(SpeechModule);
}

/**
 * Requests Android RECORD_AUDIO permission with a clear Vietnamese rationale.
 */
export async function ensureMicrophonePermission(): Promise<MicPermissionStatus> {
  if (Platform.OS !== 'android') {
    return 'unavailable';
  }

  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return 'granted';
  }

  const result = await PermissionsAndroid.request(permission, {
    title: 'Cho phép ChargePilot AI dùng Microphone',
    message:
      'ChargePilot AI cần quyền Microphone để bạn nói trực tiếp điểm đến, giờ hẹn và % pin với trợ lý ảo.',
    buttonPositive: 'Cho phép',
    buttonNegative: 'Để sau',
  });

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'never_ask_again';
  }
  return 'denied';
}

/**
 * Starts live Vietnamese speech-to-text recognition via native Android SpeechRecognizer.
 */
export async function startVietnameseSpeech(
  callbacks: VietnameseSpeechCallbacks,
  locale = 'vi-VN'
): Promise<boolean> {
  if (!isNativeSpeechSupported() || !SpeechModule || !speechEmitter) {
    callbacks.onError?.('Thiết bị hiện tại chưa hỗ trợ nhận diện giọng nói trực tiếp.');
    callbacks.onEnd?.();
    return false;
  }

  const permStatus = await ensureMicrophonePermission();
  if (permStatus !== 'granted') {
    const message =
      permStatus === 'never_ask_again'
        ? 'Quyền Micro đang bị tắt. Bấm nút bên dưới để mở Cài đặt và bật quyền Microphone cho ChargePilot AI.'
        : 'Bạn chưa cấp quyền Microphone nên mình chưa nghe được. Bấm lại nút Mic và chọn Cho phép nhé.';
    callbacks.onError?.(message);
    callbacks.onEnd?.();
    return false;
  }

  clearSubscriptions();

  activeSubscriptions = [
    speechEmitter.addListener('ChargePilotSpeech:start', () => {
      callbacks.onStart?.();
    }),
    speechEmitter.addListener('ChargePilotSpeech:rms', (event?: { rms?: number }) => {
      if (typeof event?.rms === 'number') {
        callbacks.onRms?.(event.rms);
      }
    }),
    speechEmitter.addListener('ChargePilotSpeech:partial', (event?: { text?: string }) => {
      if (event?.text) {
        callbacks.onPartial?.(event.text);
      }
    }),
    speechEmitter.addListener('ChargePilotSpeech:result', (event?: { text?: string }) => {
      if (event?.text) {
        callbacks.onResult?.(event.text);
      }
    }),
    speechEmitter.addListener(
      'ChargePilotSpeech:error',
      (event?: { message?: string; code?: number }) => {
        callbacks.onError?.(
          event?.message ?? 'Chưa nhận diện được giọng nói. Bạn thử nói lại hoặc gõ chữ nhé.',
          event?.code
        );
      }
    ),
    speechEmitter.addListener('ChargePilotSpeech:end', () => {
      clearSubscriptions();
      callbacks.onEnd?.();
    }),
  ];

  try {
    await SpeechModule.startListening(locale);
    return true;
  } catch (err) {
    clearSubscriptions();
    const fallbackMessage =
      err instanceof Error ? err.message : 'Không thể khởi động microphone để nghe giọng nói.';
    callbacks.onError?.(fallbackMessage);
    callbacks.onEnd?.();
    return false;
  }
}

/**
 * Stops listening gracefully and waits for final transcript.
 */
export async function stopVietnameseSpeech(): Promise<void> {
  if (!SpeechModule) return;
  try {
    await SpeechModule.stopListening();
  } catch {
    // Ignore stop errors if recognizer already finished
  }
}

/**
 * Cancels the active speech session and tears down event listeners.
 */
export async function cancelVietnameseSpeech(): Promise<void> {
  clearSubscriptions();
  if (!SpeechModule) return;
  try {
    await SpeechModule.cancelListening();
  } catch {
    // Ignore cancel errors during unmount
  }
}
