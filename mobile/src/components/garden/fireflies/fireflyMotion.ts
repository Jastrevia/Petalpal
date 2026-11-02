export type FireflySettings = {
  enabled: boolean; count: number; brightness: number; speed: number;
  coreSize: number; coreOpacity: number;
  haloRadius: number; haloOpacity: number;
  bloomRadius: number; bloomOpacity: number;
  maxBrightness?: boolean;
  motionDiagnostic?: boolean;
  showTrails?: boolean;
};
export const DEFAULT_FIREFLIES: FireflySettings = {
  enabled: true, count: 48, brightness: 1, speed: 1,
  coreSize: 2.0, coreOpacity: .96,
  haloRadius: 8.0, haloOpacity: .82,
  bloomRadius: 15, bloomOpacity: .12,
  maxBrightness: false,
  motionDiagnostic: false,
  showTrails: false,
};

// Air pockets among the canopy/wisteria (18), Swing flowers (14), pavilion
// grass (10), and a few waterside plants (6). Large eastern areas stay quiet.
const ANCHORS: readonly [number, number][] = [
  [290,190],[370,265],[470,210],[590,155],[715,235],[810,325],
  [330,385],[435,430],[550,355],[670,400],[755,485],[480,550],
  [260,485],[605,510],[850,205],[385,130],[565,275],[725,120],
  [670,1010],[750,1080],[825,985],[940,1040],[1030,1130],
  [920,1235],[810,1285],[710,1200],[605,1165],[570,1045],
  [1045,1270],[880,1130],[660,1310],[780,900],
  [1075,650],[1185,580],[1290,665],[1380,745],[1370,895],
  [1280,1010],[1150,1045],[1060,920],[1105,785],[1450,980],
  [1645,560],[1720,680],[1860,1150],[1960,1270],[1740,1320],[310,1280],
];

const REGION_BOUNDS = [
  { minX: 220, maxX: 880, minY: 110, maxY: 580 },   // 0..17: Treehouse & wisteria
  { minX: 540, maxX: 1080, minY: 870, maxY: 1340 },  // 18..31: Swing & nearby flowers
  { minX: 1030, maxX: 1480, minY: 550, maxY: 1070 }, // 32..41: Central pavilion & lawn
  { minX: 1580, maxX: 1790, minY: 500, maxY: 740 },  // 42..43: NE grassy/waterside area
  { minX: 1700, maxX: 2010, minY: 1110, maxY: 1360 },// 44..46: SE grassy/waterside area
  { minX: 240, maxX: 430, minY: 1180, maxY: 1360 },  // 47: SW shoreline vegetation
] as const;

function regionForIndex(i: number) {
  if (i < 18) return REGION_BOUNDS[0];
  if (i < 32) return REGION_BOUNDS[1];
  if (i < 42) return REGION_BOUNDS[2];
  if (i < 44) return REGION_BOUNDS[3];
  if (i < 47) return REGION_BOUNDS[4];
  return REGION_BOUNDS[5];
}

function clamp(v: number, lo: number, hi: number) {
  'worklet';
  return Math.max(lo, Math.min(hi, v));
}

function evalClosedSpline(pts: readonly [number, number][], u: number): [number, number] {
  'worklet';
  const n = pts.length;
  const w = ((u % n) + n) % n;
  const idx = Math.floor(w);
  const t = w - idx;
  const t2 = t * t, t3 = t2 * t;
  const b0 = (1 - 3 * t + 3 * t2 - t3) / 6;
  const b1 = (4 - 6 * t2 + 3 * t3) / 6;
  const b2 = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
  const b3 = t3 / 6;
  const p0 = pts[(idx + n - 1) % n];
  const p1 = pts[idx];
  const p2 = pts[(idx + 1) % n];
  const p3 = pts[(idx + 2) % n];
  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
}

function buildWaypoints(i: number): { waypoints: [number, number][]; splineRate: number; regionIndex: number } {
  const [ax, ay] = ANCHORS[i];
  const b = regionForIndex(i);
  const regionIndex = i < 18 ? 0 : i < 32 ? 1 : i < 42 ? 2 : 3;
  const cx = clamp(ax + 30 * Math.cos(i * 1.71), b.minX + 60, b.maxX - 60);
  const cy = clamp(ay + 25 * Math.sin(i * 2.13), b.minY + 50, b.maxY - 50);
  const dir = i % 2 === 0 ? 1 : -1;
  const rx = 56 + (i % 5) * 9;
  const ry = 44 + ((i + 2) % 5) * 7;
  const tilt = (i * 0.83) % Math.PI;
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

  const raw: [number, number][] = [];
  const N = 8;
  for (let k = 0; k < N; k++) {
    const theta = dir * (k / N) * Math.PI * 2 + i * 0.618;
    const rMod = 0.78 + 0.26 * Math.sin(k * 2.1 + i * 1.1) + 0.16 * Math.cos(k * 3.0 - i * 0.7);
    const lx = rx * rMod * Math.cos(theta) + 12 * Math.sin(2 * theta + i);
    const ly = ry * rMod * Math.sin(theta) + 10 * Math.cos(3 * theta - i * 1.4);
    const wx = clamp(cx + lx * cosT - ly * sinT, b.minX, b.maxX);
    const wy = clamp(cy + lx * sinT + ly * cosT, b.minY, b.maxY);
    raw.push([wx, wy]);
  }

  // Arc-length balance the 8 control points so the firefly glides smoothly without segment speed spikes.
  const M = 160;
  const samples: [number, number][] = [];
  const cum: number[] = [0];
  let prev = evalClosedSpline(raw, 0);
  samples.push(prev);
  for (let s = 1; s <= M; s++) {
    const cur = evalClosedSpline(raw, (s / M) * N);
    samples.push(cur);
    cum.push(cum[s - 1] + Math.hypot(cur[0] - prev[0], cur[1] - prev[1]));
    prev = cur;
  }
  const total = cum[M];
  const waypoints: [number, number][] = [];
  for (let k = 0; k < N; k++) {
    const target = (k / N) * total;
    let idx = 0;
    while (idx < M && cum[idx + 1] < target) idx++;
    waypoints.push([Math.round(samples[idx][0]), Math.round(samples[idx][1])]);
  }

  let perim = 0;
  let pPrev = evalClosedSpline(waypoints, 0);
  for (let s = 1; s <= 80; s++) {
    const cur = evalClosedSpline(waypoints, (s / 80) * N);
    perim += Math.hypot(cur[0] - pPrev[0], cur[1] - pPrev[1]);
    pPrev = cur;
  }
  // Calibrated against normal Garden camera scale (~0.60 CSS px/world unit) so typical
  // 5-second displacement is ~15-35 screen pixels (~25-58 world units).
  const speedTier = [6.8, 7.8, 8.9, 9.9, 11.2, 7.4, 8.5][i % 7];
  const splineRate = (speedTier / Math.max(120, perim)) * N;
  return { waypoints, splineRate, regionIndex };
}

export const FIREFLIES = ANCHORS.map(([x, y], i) => {
  const { waypoints, splineRate, regionIndex } = buildWaypoints(i);
  const bounds = regionForIndex(i);
  return {
    id: i,
    x, y,
    regionIndex,
    bounds,
    waypoints,
    splineRate,
    hoverFreq: .34 + (i % 5) * .035,
    startOffset: (i * .61803398875) * waypoints.length,
    phase: i * 2.39996 + .73,
    glowPhase: (i * .61803398875) % 1,
    cycle: 4.4 + ((i * 17) % 35) / 10,
    rise: .28 + (i % 4) * .025,
    hold: .20 + (i % 3) * .035,
    fall: .38 + (i % 5) * .02,
    scale: .92 + (i % 5) * .03,
    depth: .86 + (i % 5) * .035,
  };
});
export type Firefly = (typeof FIREFLIES)[number];

function smooth(t: number) {
  'worklet';
  const v = Math.max(0, Math.min(1, t));
  return v * v * v * (v * (v * 6 - 15) + 10);
}

/** Smooth C2 free-flying path through the firefly's Garden region with gentle
 * hovering pauses, directional turns, altitude variation, and asynchronous glow. */
export function fireflyAt(fly: Firefly, seconds: number) {
  'worklet';
  const p = fly.phase;
  const hf = fly.hoverFreq;
  const h = seconds * hf + p;
  // Smooth hover-and-cruise time envelope: slows down briefly to hover, then glides onward.
  const warpedSec = seconds - (.45 / hf) * Math.sin(h) - (.14 / hf) * Math.sin(2 * h + .8);
  const u = warpedSec * fly.splineRate + fly.startOffset;
  const [bx, by] = evalClosedSpline(fly.waypoints, u);

  // Subtle incommensurate air-current wander & vertical rise/descend
  const x = bx + 8.5 * Math.sin(seconds * .29 + p) + 4.0 * Math.cos(seconds * .53 - p * 1.3);
  const y = by + 7.5 * Math.cos(seconds * .23 + p * 1.2) + 3.8 * Math.sin(seconds * .61 + p * .8);

  const g = seconds / fly.cycle + fly.glowPhase + .035 * Math.sin(seconds * .21 + p);
  const phase = g - Math.floor(g);
  const peakEnd = fly.rise + fly.hold;
  const pulse = phase < fly.rise ? smooth(phase / fly.rise)
    : phase < peakEnd ? 1 : 1 - smooth((phase - peakEnd) / fly.fall);
  const variation = .93 + .07 * Math.sin(seconds * .17 + p * 1.3);
  const opacity = Math.min(1, .24 + .76 * pulse * variation * fly.depth);
  return { x, y, opacity, sizeScale: 1 + .10 * pulse, pulse };
}

/** Computes a firefly's displacement over the preceding 5-second interval
 * in both world units and normal-zoom screen pixels (~0.60 CSS px/world unit). */
export function fireflyDisplacement5s(fly: Firefly, seconds: number, cameraScale = 0.6) {
  'worklet';
  const now = fireflyAt(fly, seconds);
  const prev = fireflyAt(fly, seconds - 5);
  const distWorld = Math.hypot(now.x - prev.x, now.y - prev.y);
  return {
    fromX: prev.x,
    fromY: prev.y,
    toX: now.x,
    toY: now.y,
    distWorld,
    distScreenPx: distWorld * cameraScale,
  };
}
