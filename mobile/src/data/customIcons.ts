import type { ImageProps } from 'expo-image';

type BundledIconSource = Extract<ImageProps['source'], number>;

export const CUSTOM_ICONS = {
  micVoice: require('../../assets/icons/mic-voice.png') as BundledIconSource,
  greenCharge: require('../../assets/icons/green-charge.png') as BundledIconSource,
  evStation: require('../../assets/icons/ev-station.png') as BundledIconSource,
} as const;
