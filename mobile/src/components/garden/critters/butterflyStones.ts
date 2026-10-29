// The Garden's butterfly spends most of its time resting on a stone on one of the lawns, wings
// slowly opening and closing, and now and then flutters over to another stone (pure; drawn by
// Butterfly.tsx). It never takes off while the bluebird is in the air (gardenResidents.ts) and
// never lands on the rabbit's lawn.
import { distance, type Point } from '../fairy/walkNetwork';

// Stones on the lawns (Garden world units, checked against the painting).
export const STONES: readonly Point[] = [
  { x: 542, y: 651 }, { x: 594, y: 806 }, { x: 405, y: 943 }, { x: 584, y: 1028 }, { x: 489, y: 1208 },
  { x: 1005, y: 604 }, { x: 1005, y: 742 }, { x: 1273, y: 833 }, { x: 1328, y: 689 }, { x: 1062, y: 469 },
  { x: 1332, y: 513 }, { x: 1229, y: 179 }, { x: 1353, y: 308 }, { x: 1499, y: 80 }, { x: 1627, y: 198 },
  { x: 1579, y: 393 }, { x: 1170, y: 1176 }, { x: 1294, y: 1303 }, { x: 1212, y: 1436 }, { x: 1874, y: 702 },
  { x: 1954, y: 795 },
];
export const SPEED = 55; // world units per second
const PERCHED: [number, number] = [25, 50];
const NEAR: [number, number] = [120, 650];

export type Flutter = { from: number; to: number; start: number; seconds: number; height: number; heading: number };

const between = ([low, high]: readonly [number, number], random: () => number) => low + (high - low) * random();
export const perchSeconds = (random: () => number) => between(PERCHED, random);

// The lawn (month) a stone belongs to: the first lawn found right around it.
export function stoneLawn(stone: number, isOn: (month: number, p: Point) => boolean) {
  const p = STONES[stone];
  for (let r = 0; r <= 60; r += 15) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      for (let month = 1; month <= 12; month++) if (isOn(month, q)) return month;
    }
  }
  return null;
}

// Its next flight from stone `from`: to another stone a short way off, not on `avoid` lawns.
export function planFlutter(from: number, now: number, random: () => number, lawnOf: (stone: number) => number | null, avoid: readonly number[]): Flutter | null {
  const a = STONES[from];
  const ok = (i: number) => i !== from && !avoid.includes(lawnOf(i) ?? -1);
  let options = STONES.map((_, i) => i).filter(i => ok(i) && distance(a, STONES[i]) >= NEAR[0] && distance(a, STONES[i]) <= NEAR[1]);
  if (!options.length) options = STONES.map((_, i) => i).filter(ok);
  if (!options.length) return null;
  const to = options[Math.min(options.length - 1, Math.floor(random() * options.length))], b = STONES[to];
  const d = distance(a, b);
  return { from, to, start: now, seconds: Math.max(3, d / SPEED), height: 40 + d * 0.25, heading: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Where it is `seconds` in: resting on `from` before the flight, on `to` after it; in between
// it flutters along an arc. `flying` 0 resting … 1 in the air (eases its wings into a flap).
export function flutterPose(f: Flutter, seconds: number) {
  'worklet';
  const a = STONES[f.from], b = STONES[f.to], t = (seconds - f.start) / f.seconds;
  if (t <= 0) return { x: a.x, y: a.y, flying: 0, heading: f.heading };
  if (t >= 1) return { x: b.x, y: b.y, flying: 0, heading: f.heading };
  const e = t * t * (3 - 2 * t);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * f.height,
    flying: Math.min(1, Math.min(t, 1 - t) * 8), heading: f.heading };
}
