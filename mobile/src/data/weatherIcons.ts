import type { WeatherCondition } from '@/types';

// MIT-licensed Meteocons by Bas Milius (cleaned static XML for react-native-svg Android/iOS compatibility)
export const METEOCON_XML: Record<WeatherCondition['iconKey'], string> = {
  'partly-cloudy-day': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="sunGrad" x1="78" x2="118" y1="63" y2="133" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fbbf24"/>
        <stop offset="1" stop-color="#f59e0b"/>
      </linearGradient>
      <linearGradient id="cloudGrad" x1="99" x2="232" y1="30" y2="261" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#f3f7fe"/>
        <stop offset="1" stop-color="#cfe0f8"/>
      </linearGradient>
    </defs>
    <g transform="translate(68, 108)">
      <circle cx="98" cy="98" r="40" fill="url(#sunGrad)" stroke="#f8af18" stroke-width="4"/>
      <path fill="none" stroke="#fbbf24" stroke-linecap="round" stroke-width="12" d="M98 31.4V6m0 184v-25.4M145.1 51l18-17.9M33 163l18-17.9M51 51 33 33m130.1 130.1-18-18M6 98h25.4M190 98h-25.4"/>
      <path transform="translate(13, 36)" fill="url(#cloudGrad)" stroke="#e6effc" stroke-width="6" d="m291 107-2.5.1A83.9 83.9 0 00135.6 43 56 56 0 0051 91a56.6 56.6 0 00.8 9A60 60 0 0063 219l4-.2v.2h224a56 56 0 000-112Z"/>
    </g>
  </svg>`,

  overcast: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="ovBack" x1="52" x2="133" y1="10" y2="149" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#9ca3af"/>
        <stop offset="1" stop-color="#6b7280"/>
      </linearGradient>
      <linearGradient id="ovFront" x1="99" x2="232" y1="30" y2="261" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#f3f7fe"/>
        <stop offset="1" stop-color="#cfe0f8"/>
      </linearGradient>
    </defs>
    <g transform="translate(68, 145)">
      <path transform="translate(198, 27)" fill="url(#ovBack)" stroke="#848b98" stroke-width="4" d="M.5 93.2a32.4 32.4 0 0032.4 32.4h129.8v-.1l2.3.1a34.8 34.8 0 006.5-68.9 32.4 32.4 0 00-48.5-33 48.6 48.6 0 00-88.6 37.1h-1.5A32.4 32.4 0 00.5 93.1Z"/>
      <path fill="url(#ovFront)" stroke="#e6effc" stroke-width="6" d="m291 107-2.5.1A83.9 83.9 0 00135.6 43 56 56 0 0051 91a56.6 56.6 0 00.8 9A60 60 0 0063 219l4-.2v.2h224a56 56 0 000-112Z"/>
    </g>
  </svg>`,

  rain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="rainCloud" x1="99" x2="232" y1="30" y2="261" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#f3f7fe"/>
        <stop offset="1" stop-color="#cfe0f8"/>
      </linearGradient>
      <linearGradient id="dropGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#38bdf8"/>
        <stop offset="1" stop-color="#2563eb"/>
      </linearGradient>
    </defs>
    <path transform="translate(81, 130)" fill="url(#rainCloud)" stroke="#e6effc" stroke-width="6" d="m291 107-2.5.1A83.9 83.9 0 00135.6 43 56 56 0 0051 91a56.6 56.6 0 00.8 9A60 60 0 0063 219l4-.2v.2h224a56 56 0 000-112Z"/>
    <g transform="translate(185, 345)">
      <rect x="0" y="0" width="16" height="54" rx="8" fill="url(#dropGrad)" transform="rotate(14)"/>
      <rect x="56" y="14" width="16" height="54" rx="8" fill="url(#dropGrad)" transform="rotate(14)"/>
      <rect x="112" y="-4" width="16" height="54" rx="8" fill="url(#dropGrad)" transform="rotate(14)"/>
    </g>
  </svg>`,

  drizzle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="drzCloud" x1="99" x2="232" y1="30" y2="261" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#f3f7fe"/>
        <stop offset="1" stop-color="#cfe0f8"/>
      </linearGradient>
    </defs>
    <path transform="translate(81, 130)" fill="url(#drzCloud)" stroke="#e6effc" stroke-width="6" d="m291 107-2.5.1A83.9 83.9 0 00135.6 43 56 56 0 0051 91a56.6 56.6 0 00.8 9A60 60 0 0063 219l4-.2v.2h224a56 56 0 000-112Z"/>
    <rect x="192" y="368" width="16" height="28" rx="8" fill="#38bdf8" transform="rotate(12 200 382)"/>
    <rect x="248" y="384" width="16" height="28" rx="8" fill="#38bdf8" transform="rotate(12 256 398)"/>
    <rect x="304" y="368" width="16" height="28" rx="8" fill="#38bdf8" transform="rotate(12 312 382)"/>
  </svg>`,

  'clear-day': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="clearSun" x1="150" x2="234" y1="119" y2="265" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fbbf24"/>
        <stop offset="1" stop-color="#f59e0b"/>
      </linearGradient>
    </defs>
    <g transform="translate(64, 64)">
      <circle cx="192" cy="192" r="84" fill="url(#clearSun)" stroke="#f8af18" stroke-width="6"/>
      <path fill="none" stroke="#fbbf24" stroke-linecap="round" stroke-width="24" d="M192 61.7V12m0 360v-49.7m92.2-222.5 35-35M64.8 319.2l35.1-35.1m0-184.4-35-35m254.5 254.5-35.1-35.1M61.7 192H12m360 0h-49.7"/>
    </g>
  </svg>`,

  'thermometer-colder': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <g transform="translate(197, 117)">
      <path fill="rgba(107,114,128,0.18)" stroke="#cbd5e1" stroke-linecap="round" stroke-linejoin="round" stroke-width="6" d="M115 218.2c0 31.4-25 56.8-56 56.8S3 249.6 3 218.2a57 57 0 0124-46.6V35.5a32 32 0 1164 0v136a57 57 0 0124 46.7Z"/>
      <circle cx="59" cy="219" r="34" fill="#38bdf8"/>
      <path fill="none" stroke="#38bdf8" stroke-linecap="round" stroke-width="22" d="M59 105v112"/>
    </g>
  </svg>`,
};
