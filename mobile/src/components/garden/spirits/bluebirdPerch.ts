// The Garden's bluebird lives on three perches (the pavilion's finial, the swing's top beam, the
// top of the moon bed) and spends most of its time sitting on one. About once a minute it takes
// off, flies one arc up over the Garden and lands on another (pure; Bluebird.tsx draws it). Its
// frames (one sheet): TAKEOFF, perched → springing up → flying in place, whose last frame is the
// first of FLY, a wingbeat loop. Landing is TAKEOFF backwards. Its feet are the anchor, so a
// perched bird stands exactly on its perch; an arc never doubles back, so it never has to turn
// round in the air. If its next perch is behind it, it hops round on the spot first.
import { distance, type Point } from '../fairy/walkNetwork';

// Garden world units, measured against the landmarks' own placements.
export const PERCHES: readonly Point[] = [
  { x: 1189, y: 524 }, // pavilion finial
  { x: 896, y: 979 }, // swing top beam
  { x: 1945, y: 891 }, // moon bed, top of the crescent
];
export const FPS = 12;
export const TAKEOFF = { count: 62, lift: 12 }; // cells 0..61; it leaves the perch at cell `lift`
export const FLY = { count: 26 }; // cells 62..87
const TAKEOFF_SECONDS = TAKEOFF.count / FPS, STILL = TAKEOFF.lift / FPS;
const HOP_TURN = 0.3, SPEED = 110, MIN_MOVING = TAKEOFF_SECONDS * 2 - STILL * 2;
const PERCHED: [number, number] = [50, 70];

export type Hop = { from: number; to: number; start: number; facing: 1 | -1; turn: boolean; moving: number; height: number };

const between = ([low, high]: readonly [number, number], random: () => number) => low + (high - low) * random();
export const nextPerchWait = (random: () => number) => between(PERCHED, random);

// The next hop from perch `from`, facing `facing`, starting at `now`.
export function planHop(from: number, facing: 1 | -1, now: number, random: () => number): Hop {
  const others = PERCHES.map((_, i) => i).filter(i => i !== from);
  const to = others[Math.min(others.length - 1, Math.floor(random() * others.length))];
  const a = PERCHES[from], b = PERCHES[to], heading = b.x >= a.x ? 1 : -1;
  const d = distance(a, b), height = 90 + d * 0.3 + random() * 60;
  return { from, to, start: now, facing: heading, turn: heading !== facing, height,
    moving: Math.max(MIN_MOVING, (d + height * 1.2) / SPEED) };
}

export const hopSeconds = (hop: Hop) => (hop.turn ? HOP_TURN : 0) + STILL * 2 + hop.moving;

// Where it is `seconds` into a hop (feet point), which way it faces and which cell shows; before
// the hop it sits on `from`, after it on `to`.
export function hopPose(hop: Hop, seconds: number) {
  'worklet';
  const a = PERCHES[hop.from], b = PERCHES[hop.to];
  let t = seconds - hop.start;
  if (t <= 0) return { x: a.x, y: a.y, facing: hop.turn ? -hop.facing : hop.facing, cell: 0 };
  if (hop.turn) {
    // A quick hop round on the perch.
    if (t < HOP_TURN) return { x: a.x, y: a.y - Math.sin(Math.PI * t / HOP_TURN) * 5, facing: t < HOP_TURN / 2 ? -hop.facing : hop.facing, cell: 0 };
    t -= HOP_TURN;
  }
  const total = STILL * 2 + hop.moving;
  if (t >= total) return { x: b.x, y: b.y, facing: hop.facing, cell: 0 };
  // Cells: take-off forwards, the wingbeat loop, then take-off backwards to land.
  let cell;
  if (t < TAKEOFF_SECONDS) cell = Math.floor(t * FPS);
  else if (t > total - TAKEOFF_SECONDS) cell = Math.max(0, Math.floor((total - t) * FPS));
  else cell = TAKEOFF.count + Math.floor((t - TAKEOFF_SECONDS) * FPS) % FLY.count;
  const s = Math.max(0, Math.min(1, (t - STILL) / hop.moving)), e = s * s * (3 - 2 * s);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * hop.height, facing: hop.facing, cell };
}
