// Garden visitors: a butterfly, a bluebird, a rabbit, a hedgehog and a puppy drop by now
// and then, do their thing for a while and leave. At most two at a time; each visit is planned
// here (pure, seeded by the caller's random) and drawn by GardenCritters.tsx from the Garden
// clock. Walkers only use connected dry paths of the walk network; flyers hop between
// path points high above them, so nobody ever stands in the pond.
import { distance, type Network, type Point } from '../fairy/walkNetwork';

export type CritterId = 'butterfly' | 'bluebird' | 'rabbit' | 'hedgehog' | 'puppy';
export type CritterKind = 'flyer' | 'walker';
export type CritterSpec = {
  id: CritterId; kind: CritterKind;
  // Longest side when drawn, Garden world units (PPL's walking frame is about 102 wide).
  size: number;
  // World units per second while moving.
  speed: number;
  // Height above the path for flyers (world units).
  altitude: [number, number];
};
export const CRITTERS: Readonly<Record<CritterId, CritterSpec>> = {
  butterfly: { id: 'butterfly', kind: 'flyer', size: 60, speed: 46, altitude: [36, 90] },
  bluebird: { id: 'bluebird', kind: 'flyer', size: 92, speed: 140, altitude: [120, 200] },
  rabbit: { id: 'rabbit', kind: 'walker', size: 84, speed: 60, altitude: [0, 0] },
  hedgehog: { id: 'hedgehog', kind: 'walker', size: 64, speed: 18, altitude: [0, 0] },
  puppy: { id: 'puppy', kind: 'walker', size: 100, speed: 62, altitude: [0, 0] },
};
export const CRITTER_IDS = Object.keys(CRITTERS) as CritterId[];
export const MAX_VISITORS = 2;
// Seconds between one visit ending and the next one starting.
export const VISIT_GAP: [number, number] = [10, 35];
export const FADE_SECONDS = 0.8;

// How a visitor moves: in bursts of `moving` (fraction) of every `cycle` seconds, still otherwise
// (cycle 0: steady). Each of the rabbit's bursts is one hop; the hedgehog and the puppy stop
// now and then to sniff.
export type Rhythm = { cycle: number; moving: number };
export const RHYTHMS: Readonly<Record<CritterId, Rhythm>> = {
  butterfly: { cycle: 0, moving: 1 }, bluebird: { cycle: 0, moving: 1 },
  rabbit: { cycle: 1.1, moving: 0.5 }, hedgehog: { cycle: 4, moving: 0.65 }, puppy: { cycle: 7, moving: 0.8 },
};
export type Visit = { key: number; id: CritterId; path: Point[]; start: number; duration: number; speed: number; rhythm: Rhythm };

const pick = <T,>(items: readonly T[], random: () => number) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const between = ([low, high]: readonly [number, number], random: () => number) => low + (high - low) * random();

export function pathLength(path: readonly Point[]) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
  return total;
}

// Dry paths only: both ends on ground and the whole segment clear.
export function walkableEdges(network: Network, blocked: (point: Point) => boolean, segmentClear: (a: Point, b: Point) => boolean) {
  return network.edges.filter(edge => {
    const a = network.nodes[edge.a], b = network.nodes[edge.b];
    return !blocked(a) && !blocked(b) && segmentClear(a, b);
  });
}

// A walker strolls 3–6 connected path segments without turning straight back.
export function planWalk(network: Network, edges: Network['edges'], random: () => number, segments = 3 + Math.floor(random() * 4)) {
  if (!edges.length) return null;
  const neighbours = new Map<number, number[]>();
  for (const edge of edges) {
    neighbours.set(edge.a, [...(neighbours.get(edge.a) ?? []), edge.b]);
    neighbours.set(edge.b, [...(neighbours.get(edge.b) ?? []), edge.a]);
  }
  const first = pick(edges, random);
  const route = [first.a, first.b];
  while (route.length <= segments) {
    const here = route[route.length - 1], previous = route[route.length - 2];
    const options = (neighbours.get(here) ?? []).filter(node => node !== previous);
    if (!options.length) break;
    route.push(pick(options, random));
  }
  return route.map(index => network.nodes[index]);
}

// A flyer visits 3–5 dry path points a short way apart, high above them.
export function planFlight(points: readonly Point[], spec: CritterSpec, random: () => number, stops = 3 + Math.floor(random() * 3)) {
  if (points.length < 2) return null;
  const path: Point[] = [];
  let here = pick(points, random);
  for (let i = 0; i < stops; i++) {
    const lift = between(spec.altitude, random);
    path.push({ x: here.x, y: here.y - lift });
    const near = points.filter(point => { const d = distance(point, here); return d > 80 && d < 520; });
    here = pick(near.length ? near : points, random);
  }
  return path;
}

// The next visitor: someone not already in the Garden, with a route and how long it lasts.
export function planVisit({ key, now, active, network, edges, points, random }: {
  key: number; now: number; active: readonly Visit[]; network: Network; edges: Network['edges'];
  points: readonly Point[]; random: () => number;
}): Visit | null {
  if (active.length >= MAX_VISITORS) return null;
  const free = CRITTER_IDS.filter(id => !active.some(visit => visit.id === id));
  if (!free.length) return null;
  const id = pick(free, random), spec = CRITTERS[id];
  const path = spec.kind === 'walker' ? planWalk(network, edges, random) : planFlight(points, spec, random);
  if (!path || path.length < 2) return null;
  const rhythm = RHYTHMS[id];
  return { key, id, path, start: now, duration: travelSeconds(pathLength(path) / spec.speed, rhythm) + FADE_SECONDS * 2, speed: spec.speed, rhythm };
}

// How long a visitor travels to move for `moving` seconds. In bursts it is a whole number of
// them (at least one), so every hop lands and no stride is cut off; the visitor may then stop
// a little short of the last point, never past it.
export function travelSeconds(moving: number, rhythm: Rhythm) {
  if (rhythm.cycle <= 0) return moving / rhythm.moving;
  return Math.max(1, Math.floor(moving / (rhythm.cycle * rhythm.moving))) * rhythm.cycle;
}

export const nextGap = (random: () => number) => between(VISIT_GAP, random);

// Seconds of movement after `elapsed` seconds of a visit's travel, given its rhythm.
export function travelled(elapsed: number, rhythm: Rhythm) {
  'worklet';
  if (rhythm.cycle <= 0) return elapsed * rhythm.moving;
  const burst = rhythm.cycle * rhythm.moving, cycles = Math.floor(elapsed / rhythm.cycle);
  const within = elapsed - cycles * rhythm.cycle;
  // Each burst eases in and out, so hops and darts start and land softly.
  const u = Math.min(1, within / burst);
  return cycles * burst + burst * (u * u * (3 - 2 * u));
}

// How far a visitor has come along its path `seconds` into its visit (world units): walkers'
// legs step by distance, so their feet stay put on the ground however the pace changes.
export function visitDistance(visit: Visit, seconds: number) {
  'worklet';
  const travel = Math.max(0, Math.min(visit.duration - FADE_SECONDS * 2, seconds - visit.start - FADE_SECONDS));
  let length = 0;
  for (let i = 1; i < visit.path.length; i++) length += Math.hypot(visit.path[i].x - visit.path[i - 1].x, visit.path[i].y - visit.path[i - 1].y);
  // A short walk can be less than one of the puppy's long bursts: it stops at the last point.
  return Math.min(length, travelled(travel, visit.rhythm) * visit.speed);
}

// Where a visitor is `seconds` into its visit: point on its path, heading, how visible it is,
// and whether it is moving right now (for hops and wingbeats).
export function visitPose(visit: Visit, seconds: number) {
  'worklet';
  const elapsed = seconds - visit.start;
  const travel = Math.max(0, Math.min(visit.duration - FADE_SECONDS * 2, elapsed - FADE_SECONDS));
  const opacity = Math.max(0, Math.min(1, elapsed / FADE_SECONDS, (visit.duration - elapsed) / FADE_SECONDS));
  let left = travelled(travel, visit.rhythm) * visit.speed;
  const path = visit.path;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length || i === path.length - 1) {
      const u = length ? Math.min(1, left / length) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, dx: b.x - a.x, dy: b.y - a.y, opacity, done: elapsed >= visit.duration };
    }
    left -= length;
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y, dx: 1, dy: 0, opacity: 0, done: true };
}

// Inside a burst (0..1, 0 when still): drives hops and the height of each hop.
export function burstPhase(visit: Visit, seconds: number) {
  'worklet';
  const { cycle, moving } = visit.rhythm;
  if (cycle <= 0) return 0;
  const elapsed = Math.max(0, seconds - visit.start - FADE_SECONDS);
  const within = elapsed % cycle;
  return within < cycle * moving ? within / (cycle * moving) : 0;
}
