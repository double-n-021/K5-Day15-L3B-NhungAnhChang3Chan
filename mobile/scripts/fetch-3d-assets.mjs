#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MOBILE_DIR = path.resolve(import.meta.dirname, '..');
const ASSETS_3D_DIR = path.join(MOBILE_DIR, 'assets', '3d');
const VEHICLES_DIR = path.join(MOBILE_DIR, 'assets', 'vehicles');
const TMP_DIR = '/tmp/chargepilot_3d_fetch';

fs.mkdirSync(ASSETS_3D_DIR, { recursive: true });
fs.mkdirSync(VEHICLES_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

function downloadFile(url, destPath) {
  execFileSync('curl', ['-fsSL', '--retry', '2', '--max-time', '25', '-L', url, '-o', destPath], {
    stdio: 'pipe',
  });
  const stat = fs.statSync(destPath);
  if (stat.size < 1024) {
    throw new Error(`Downloaded file too small (${stat.size}B): ${url}`);
  }
}

function fetchJson(url) {
  const out = execFileSync(
    'curl',
    ['-fsSL', '--retry', '2', '--max-time', '20', '-H', 'User-Agent: ChargePilotAI/1.0', url],
    { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 }
  );
  return JSON.parse(out);
}

function toWebpSquare(srcPath, destPath, size = 384, quality = 90) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      srcPath,
      '-vf',
      `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      '-c:v',
      'libwebp',
      '-quality',
      String(quality),
      destPath,
    ],
    { stdio: 'pipe' }
  );
}

function toWebpLandscape(srcPath, destPath, width = 768, height = 480, quality = 90) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      srcPath,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
      '-c:v',
      'libwebp',
      '-quality',
      String(quality),
      destPath,
    ],
    { stdio: 'pipe' }
  );
}

const FLUENT_BASE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';
const FLUENT_ICONS = [
  ['battery-3d.webp', 'Battery/3D/battery_3d.png'],
  ['bolt-3d.webp', 'High%20voltage/3D/high_voltage_3d.png'],
  ['mic-3d.webp', 'Studio%20microphone/3D/studio_microphone_3d.png'],
  ['trophy-3d.webp', 'Trophy/3D/trophy_3d.png'],
  ['medal-3d.webp', '1st%20place%20medal/3D/1st_place_medal_3d.png'],
  ['coin-3d.webp', 'Coin/3D/coin_3d.png'],
  ['sun-3d.webp', 'Sun/3D/sun_3d.png'],
  ['weather-sun-cloud-3d.webp', 'Sun%20behind%20small%20cloud/3D/sun_behind_small_cloud_3d.png'],
  ['weather-rain-3d.webp', 'Cloud%20with%20rain/3D/cloud_with_rain_3d.png'],
  ['weather-cloud-3d.webp', 'Cloud/3D/cloud_3d.png'],
  ['charger-pump-3d.webp', 'Fuel%20pump/3D/fuel_pump_3d.png'],
  ['plug-3d.webp', 'Electric%20plug/3D/electric_plug_3d.png'],
  ['scooter-icon-3d.webp', 'Motor%20scooter/3D/motor_scooter_3d.png'],
  ['car-icon-3d.webp', 'Sport%20utility%20vehicle/3D/sport_utility_vehicle_3d.png'],
  ['compass-3d.webp', 'Compass/3D/compass_3d.png'],
  ['pin-3d.webp', 'Round%20pushpin/3D/round_pushpin_3d.png'],
  ['shield-3d.webp', 'Shield/3D/shield_3d.png'],
  ['sparkles-3d.webp', 'Sparkles/3D/sparkles_3d.png'],
];

async function run() {
  console.log('1) Converting local 3D Mascot renders...');
  const mascotSources = [
    [
      '/home/jay/.gemini/antigravity-cli/brain/af1e3665-6e06-49fd-a875-89748a121179/ev_ai_companion_robot_1795795349426.jpg',
      'mascot-idle.webp',
    ],
    [
      '/home/jay/.gemini/antigravity-cli/brain/af1e3665-6e06-49fd-a875-89748a121179/ev_ai_companion_robot_bust_1795795348426.jpg',
      'mascot-listening.webp',
    ],
    [
      '/home/jay/.gemini/antigravity-cli/brain/af1e3665-6e06-49fd-a875-89748a121179/ev_ai_companion_robot_bust_1795795350349.jpg',
      'mascot-thinking.webp',
    ],
  ];
  for (const [src, name] of mascotSources) {
    if (fs.existsSync(src)) {
      toWebpSquare(src, path.join(ASSETS_3D_DIR, name), 512, 88);
      console.log(`  OK ${name}`);
    }
  }

  console.log('2) Fetching Microsoft Fluent 3D Studio PNGs (MIT)...');
  for (const [outName, relPath] of FLUENT_ICONS) {
    const tmp = path.join(TMP_DIR, outName.replace('.webp', '.png'));
    try {
      downloadFile(`${FLUENT_BASE}/${relPath}`, tmp);
      toWebpSquare(tmp, path.join(ASSETS_3D_DIR, outName), 384, 90);
      console.log(`  OK ${outName}`);
    } catch (err) {
      console.warn(`  WARN ${outName}: ${err.message}`);
    }
  }

  console.log('3) Fetching 3dicons Blender renders (CC0 CDN)...');
  const THREEDICONS_CDN = 'https://3dicons.sgp1.cdn.digitaloceanspaces.com/v1/dynamic/premium';
  const cdnIcons = [
    ['icon3d-flash.webp', 'flash-dynamic-premium.png'],
    ['icon3d-mic.webp', 'mic-dynamic-premium.png'],
    ['icon3d-trophy.webp', 'trophy-dynamic-premium.png'],
    ['icon3d-medal.webp', 'medal-dynamic-premium.png'],
    ['icon3d-sun.webp', 'sun-dynamic-premium.png'],
    ['icon3d-map-pin.webp', 'map-pin-dynamic-premium.png'],
    ['icon3d-shield.webp', 'shield-dynamic-premium.png'],
    ['icon3d-clock.webp', 'clock-dynamic-premium.png'],
  ];
  for (const [outName, cdnFile] of cdnIcons) {
    const tmp = path.join(TMP_DIR, outName.replace('.webp', '.png'));
    try {
      downloadFile(`${THREEDICONS_CDN}/${cdnFile}`, tmp);
      toWebpSquare(tmp, path.join(ASSETS_3D_DIR, outName), 384, 90);
      console.log(`  OK ${outName}`);
    } catch (err) {
      console.warn(`  WARN ${outName}: ${err.message}`);
    }
  }

  console.log('4) Fetching real Sketchfab 3D renders + embed metadata...');
  const manifest = {};

  function pickBestThumb(model) {
    const imgs = model?.thumbnails?.images || [];
    const sorted = [...imgs].sort((a, b) => (b.width || 0) - (a.width || 0));
    return sorted[0]?.url || null;
  }

  function recordModel(key, model, outDir, outFile, landscape = true, cropCenter = false) {
    const thumbUrl = pickBestThumb(model);
    if (!thumbUrl) throw new Error(`No thumbnail URL for ${key}`);
    const tmp = path.join(TMP_DIR, `${key}.jpg`);
    downloadFile(thumbUrl, tmp);
    const dest = path.join(outDir, outFile);
    if (landscape) {
      if (cropCenter) {
        // Trim excessive empty studio padding on centered car models
        execFileSync(
          'ffmpeg',
          [
            '-y',
            '-i',
            tmp,
            '-vf',
            'crop=iw*0.58:ih*0.58:iw*0.21:ih*0.26,scale=768:480:force_original_aspect_ratio=increase,crop=768:480',
            '-c:v',
            'libwebp',
            '-quality',
            '90',
            dest,
          ],
          { stdio: 'pipe' }
        );
      } else {
        toWebpLandscape(tmp, dest, 768, 480, 90);
      }
    } else {
      toWebpSquare(tmp, dest, 512, 90);
    }
    const uid = model.uid;
    const author = model.user?.displayName || model.user?.username || 'Sketchfab Creator';
    manifest[key] = {
      uid,
      name: model.name,
      author,
      license: model.license?.label || 'Sketchfab Public Embed',
      embedUrl: `https://sketchfab.com/models/${uid}/embed?autostart=1&transparent=1&ui_infos=0&ui_stop=0&ui_inspector=0&ui_watermark_link=0`,
      file: outFile,
    };
    console.log(`  OK ${key} (${uid} - ${model.name}) -> ${outFile}`);
  }

  // Keep clean vfe34-front34.webp already in repo, fetch better BYD Atto 3 + Gogoro + EV scooters
  try {
    const bydSearch = fetchJson(
      'https://api.sketchfab.com/v3/search?type=models&q=byd+atto+3&sort_by=-likeCount&count=8'
    );
    const bydCandidates = (bydSearch.results || []).filter((m) =>
      (m.thumbnails?.images || []).some((img) => (img.width || 0) >= 640)
    );
    // Prefer dark/angled or fallback to zoom-cropped 3e9408e95e3a4d7db8c332b31019e30d
    const bydPick =
      bydCandidates.find((m) => m.uid === '0af7ffe7b3b64d7fb9e31d4f1bac10c1') ||
      bydCandidates.find((m) => m.uid !== '3e9408e95e3a4d7db8c332b31019e30d') ||
      fetchJson('https://api.sketchfab.com/v3/models/3e9408e95e3a4d7db8c332b31019e30d');
    const shouldZoomCrop = bydPick.uid === '3e9408e95e3a4d7db8c332b31019e30d';
    recordModel('byd_atto3', bydPick, VEHICLES_DIR, 'byd-atto3-3d.webp', true, shouldZoomCrop);
  } catch (err) {
    console.warn(`  WARN byd_atto3: ${err.message}`);
  }

  try {
    const gogoroModel = fetchJson('https://api.sketchfab.com/v3/models/6af67a41415543248fe63c1f3a97580c');
    recordModel('selex_camel', gogoroModel, VEHICLES_DIR, 'selex-swap-scooter-3d.webp', true);
  } catch (err) {
    console.warn(`  WARN selex_camel: ${err.message}`);
  }

  try {
    const sportModel = fetchJson('https://api.sketchfab.com/v3/models/8ef8749ade9c4f7d87eb22711fde19cb');
    recordModel('datbike_quantum', sportModel, VEHICLES_DIR, 'datbike-quantum-3d.webp', true);
  } catch (err) {
    console.warn(`  WARN datbike_quantum: ${err.message}`);
  }

  // Search for modern clean urban electric scooter (BMW CE 04 / Vespa / NIU / Electric Scooter)
  try {
    const queries = [
      'https://api.sketchfab.com/v3/search?type=models&q=bmw+ce+04&sort_by=-likeCount&count=8',
      'https://api.sketchfab.com/v3/search?type=models&q=vespa+elettrica&sort_by=-likeCount&count=8',
      'https://api.sketchfab.com/v3/search?type=models&q=vespa+primavera&sort_by=-likeCount&count=8',
      'https://api.sketchfab.com/v3/search?type=models&q=modern+scooter&sort_by=-likeCount&count=10',
    ];
    let urbanPick = null;
    for (const qUrl of queries) {
      const res = fetchJson(qUrl);
      const found = (res.results || []).find(
        (m) =>
          m.uid !== '6af67a41415543248fe63c1f3a97580c' &&
          m.uid !== '8ef8749ade9c4f7d87eb22711fde19cb' &&
          m.uid !== '6a7cb1e0338e4cbd9fc6d2a1ef9cf845' &&
          !/sidecar|destroyed|wreck|low\s*poly|pixel|voxel|kick|cartoon/i.test(m.name || '') &&
          (m.thumbnails?.images || []).some((img) => (img.width || 0) >= 640)
      );
      if (found) {
        urbanPick = found;
        break;
      }
    }
    if (urbanPick) {
      recordModel('vinfast_evo200', urbanPick, VEHICLES_DIR, 'evo200-scooter-3d.webp', true);
    }
  } catch (err) {
    console.warn(`  WARN urban scooter search: ${err.message}`);
  }

  try {
    const chargerRes = fetchJson(
      'https://api.sketchfab.com/v3/search?type=models&q=ev+charging+station&sort_by=-likeCount&count=10'
    );
    const chargerPick = (chargerRes.results || []).find((m) =>
      (m.thumbnails?.images || []).some((img) => (img.width || 0) >= 640)
    );
    if (chargerPick) {
      recordModel(
        'ev_charger_station',
        chargerPick,
        ASSETS_3D_DIR,
        'ev-charger-station-3d.webp',
        false
      );
    }
  } catch (err) {
    console.warn(`  WARN charger search: ${err.message}`);
  }

  fs.writeFileSync(
    path.join(ASSETS_3D_DIR, 'sketchfab-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('Done! Manifest written to assets/3d/sketchfab-manifest.json');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
