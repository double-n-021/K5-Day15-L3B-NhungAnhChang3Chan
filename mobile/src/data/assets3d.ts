import type { ImageSource } from 'expo-image';

export const ASSETS_3D = {
  // 3D Mascot states (Ceramic & Gold BA Bot DNA)
  mascotIdle: require('../../assets/3d/mascot-idle.webp') as ImageSource,
  mascotListening: require('../../assets/3d/mascot-listening.webp') as ImageSource,
  mascotThinking: require('../../assets/3d/mascot-thinking.webp') as ImageSource,

  // 3dicons Blender Cycles Dynamic-Premium Renders (CC0)
  flashGold: require('../../assets/3d/icon3d-flash.webp') as ImageSource,
  micGold: require('../../assets/3d/icon3d-mic.webp') as ImageSource,
  trophyGold: require('../../assets/3d/icon3d-trophy.webp') as ImageSource,
  medalGold: require('../../assets/3d/icon3d-medal.webp') as ImageSource,
  sunGold: require('../../assets/3d/icon3d-sun.webp') as ImageSource,
  mapPinGold: require('../../assets/3d/icon3d-map-pin.webp') as ImageSource,
  clockGold: require('../../assets/3d/icon3d-clock.webp') as ImageSource,

  // Microsoft Fluent 3D Studio Renders (MIT)
  battery: require('../../assets/3d/battery-3d.webp') as ImageSource,
  bolt: require('../../assets/3d/bolt-3d.webp') as ImageSource,
  micStudio: require('../../assets/3d/mic-3d.webp') as ImageSource,
  trophy: require('../../assets/3d/trophy-3d.webp') as ImageSource,
  medal: require('../../assets/3d/medal-3d.webp') as ImageSource,
  coin: require('../../assets/3d/coin-3d.webp') as ImageSource,
  sun: require('../../assets/3d/sun-3d.webp') as ImageSource,
  weatherSunCloud: require('../../assets/3d/weather-sun-cloud-3d.webp') as ImageSource,
  weatherRain: require('../../assets/3d/weather-rain-3d.webp') as ImageSource,
  weatherCloud: require('../../assets/3d/weather-cloud-3d.webp') as ImageSource,
  chargerPump: require('../../assets/3d/charger-pump-3d.webp') as ImageSource,
  plug: require('../../assets/3d/plug-3d.webp') as ImageSource,
  scooterIcon: require('../../assets/3d/scooter-icon-3d.webp') as ImageSource,
  carIcon: require('../../assets/3d/car-icon-3d.webp') as ImageSource,
  compass: require('../../assets/3d/compass-3d.webp') as ImageSource,
  pin: require('../../assets/3d/pin-3d.webp') as ImageSource,
  shield: require('../../assets/3d/shield-3d.webp') as ImageSource,
  sparkles: require('../../assets/3d/sparkles-3d.webp') as ImageSource,

  // EV Charging Station Preview
  evChargerStation: require('../../assets/3d/ev-charger-station-3d.webp') as ImageSource,
} as const;
