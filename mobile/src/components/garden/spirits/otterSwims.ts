// Memory Otter's swims (pure; GardenScene draws them from the Garden clock in MemoryOtter.tsx).
// Each swim is one straight stretch of open water: it surfaces at `a`, swims to `b`, dives, and
// stays under a while before surfacing somewhere near. Open water keeps a margin from every shore
// so its body never crosses land, and stretches stay near level because it is painted side on.
// Diving between stretches is also how it turns: it never flips round above the water.
import { distance, type Point } from '../fairy/walkNetwork';

export type Swim = { a: Point; b: Point; start: number; swim: number; under: number };
export const OTTER_SPEED = 70; // world units per second
export const OTTER_FADE = 0.9; // seconds to surface or dive
// Water kept around its body: it is long and low side on, so more ahead and behind than above
// and below (world units).
export const OTTER_MARGIN = { x: 80, y: 32 };
const UNDER: [number, number] = [1.5, 5];
const LENGTH: [number, number] = [160, 460];
const MAX_TILT = 0.4; // radians from level

const between = ([low, high]: readonly [number, number], random: () => number) => low + (high - low) * random();

export function isOpenWater(point: Point, isWater: (p: Point) => boolean) {
  if (!isWater(point)) return false;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    if (!isWater({ x: point.x + Math.cos(angle) * OTTER_MARGIN.x, y: point.y + Math.sin(angle) * OTTER_MARGIN.y })) return false;
  }
  return true;
}

// The next swim: surfacing near `from` (where it last dived), or anywhere in `bounds` (the part of
// the lake people see) when it first appears. Both ends stay inside `bounds`.
export type SwimBounds = { minX: number; minY: number; maxX: number; maxY: number };
export function planSwim({ from, now, isWater, bounds, random }: {
  from: Point | null; now: number; isWater: (p: Point) => boolean; bounds: SwimBounds; random: () => number;
}): Swim | null {
  const inside = (p: Point) => p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;
  for (let attempt = 0; attempt < 80; attempt++) {
    const a = from
      ? (() => { const angle = random() * Math.PI * 2, d = 120 + random() * 280; return { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d }; })()
      : { x: bounds.minX + random() * (bounds.maxX - bounds.minX), y: bounds.minY + random() * (bounds.maxY - bounds.minY) };
    const tilt = (random() * 2 - 1) * MAX_TILT, side = random() < 0.5 ? -1 : 1, length = between(LENGTH, random);
    const b = { x: a.x + side * Math.cos(tilt) * length, y: a.y + Math.sin(tilt) * length };
    let clear = inside(a) && inside(b) && isOpenWater(a, isWater) && isOpenWater(b, isWater);
    for (let s = 20; clear && s < length; s += 20) clear = isOpenWater({ x: a.x + (b.x - a.x) * s / length, y: a.y + (b.y - a.y) * s / length }, isWater);
    if (clear) return { a, b, start: now, swim: length / OTTER_SPEED, under: between(UNDER, random) };
  }
  return null;
}

export const swimEnd = (swim: Swim) => swim.start + OTTER_FADE * 2 + swim.swim + swim.under;

// Where it is `seconds` in: it rises in place, swims at a steady pace, sinks at the far end, then
// stays hidden. `depth` (0 at the surface, 1 under) lowers it a little as it fades.
export function swimPose(swim: Swim, seconds: number) {
  'worklet';
  const e = seconds - swim.start, facing = swim.b.x >= swim.a.x ? 1 : -1;
  const along = Math.max(0, Math.min(1, (e - OTTER_FADE) / swim.swim));
  const x = swim.a.x + (swim.b.x - swim.a.x) * along, y = swim.a.y + (swim.b.y - swim.a.y) * along;
  const up = Math.min(1, Math.max(0, e / OTTER_FADE));
  const down = Math.min(1, Math.max(0, (OTTER_FADE * 2 + swim.swim - e) / OTTER_FADE));
  const visible = Math.min(up, down);
  return { x, y, facing, opacity: visible * visible * (3 - 2 * visible), depth: 1 - visible, tilt: Math.atan2(swim.b.y - swim.a.y, Math.abs(swim.b.x - swim.a.x)) };
}
