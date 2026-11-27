import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const START = {
  id: 'start-lang-ha',
  name: 'Láng Hạ, Đống Đa, Hà Nội',
  lat: 21.0169,
  lng: 105.8143,
};

const HO_GUOM = {
  id: 'ho-guom',
  name: 'Hồ Hoàn Kiếm (Hồ Gươm)',
  lat: 21.0285,
  lng: 105.8542,
};

const NOI_BAI = {
  id: 'noi-bai-airport',
  name: 'Cảng HKQT Nội Bài',
  lat: 21.2212,
  lng: 105.8070,
};

const STATIONS = [
  { id: 'nguyen-chi-thanh', lat: 21.02347, lng: 105.80948 },
  { id: 'metropolis', lat: 21.0321, lng: 105.8150 },
  { id: 'pham-ngoc-thach', lat: 21.0063, lng: 105.83196 },
  { id: 'ba-trieu', lat: 21.0116, lng: 105.8500 },
  { id: 'bigc-thang-long', lat: 21.0065, lng: 105.7957 },
  { id: 'lotte-west-lake', lat: 21.07599, lng: 105.81268 },
  { id: 'royal-city', lat: 21.0028, lng: 105.8153 },
  { id: 'noi-bai', lat: 21.2187, lng: 105.8042 },
  { id: 'times-city', lat: 20.9943, lng: 105.8680 },
];

function translateManeuver(type, modifier, streetName) {
  const road = streetName && streetName.trim() ? streetName.trim() : 'tuyến đường phía trước';
  const modMap = {
    left: 'Rẽ trái',
    'slight left': 'Chếch trái',
    'sharp left': 'Rẽ gắt trái',
    right: 'Rẽ phải',
    'slight right': 'Chếch phải',
    'sharp right': 'Rẽ gắt phải',
    straight: 'Đi thẳng',
    uturn: 'Quay đầu',
  };
  if (type === 'depart') return `Xuất phát theo ${road}`;
  if (type === 'arrive') return `Đến điểm đích tại ${road}`;
  if (type === 'roundabout' || type === 'rotary') return `Vào vòng xuyến, đi theo lối ra hướng ${road}`;
  const action = modMap[modifier] || 'Tiếp tục đi';
  return `${action} vào ${road}`;
}

async function fetchOsrmRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const raw = execFileSync('curl', ['-fsSL', url], { encoding: 'utf8', timeout: 25000 });
  const data = JSON.parse(raw);
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM returned no route for ${from.id} -> ${to.id}`);
  }
  const route = data.routes[0];
  const steps = [];
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      steps.push({
        instruction: translateManeuver(step.maneuver?.type, step.maneuver?.modifier, step.name),
        streetName: step.name || 'Đường nội đô Hà Nội',
        distanceMeters: Math.round(step.distance || 0),
        durationSeconds: Math.round(step.duration || 0),
        location: step.maneuver?.location || route.geometry.coordinates[0],
        maneuverType: step.maneuver?.type || 'turn',
        modifier: step.maneuver?.modifier || 'straight',
      });
    }
  }
  return {
    id: `${from.id}__${to.id}`,
    fromId: from.id,
    toId: to.id,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    coordinates: route.geometry.coordinates,
    steps,
  };
}

async function main() {
  const pairs = [];
  for (const s of STATIONS) {
    pairs.push([START, s]);
  }
  for (const id of ['metropolis', 'ba-trieu', 'nguyen-chi-thanh', 'bigc-thang-long', 'lotte-west-lake', 'royal-city', 'pham-ngoc-thach', 'times-city']) {
    const s = STATIONS.find((x) => x.id === id);
    if (s) pairs.push([s, HO_GUOM]);
  }
  pairs.push([HO_GUOM, NOI_BAI]);
  pairs.push([START, HO_GUOM]);

  const routes = {};
  for (const [from, to] of pairs) {
    const route = await fetchOsrmRoute(from, to);
    routes[route.id] = route;
    console.log(`Fetched ${route.id}: ${route.coordinates.length} pts, ${(route.distanceMeters / 1000).toFixed(2)} km, ${Math.round(route.durationSeconds / 60)} min`);
    await new Promise((r) => setTimeout(r, 120));
  }

  const outPath = path.resolve(process.cwd(), 'assets/routes/hanoi-routes.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'OSRM (router.project-osrm.org) — OpenStreetMap road geometry',
        routes,
      },
      null,
      2
    )
  );
  console.log(`Saved ${Object.keys(routes).length} routes to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
