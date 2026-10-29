// Garden visitors: a butterfly, a bluebird, a rabbit, a hedgehog and a puppy drop by now
// and then and stay: each wanders one route (a leg), rests where it ended, and sets off again.
// They go home only once the Garden has been away (closed, in the background) for AWAY_SECONDS.
// At most two at a time; each leg is planned here (pure, seeded by the caller's random) and
// drawn by GardenCritters.tsx from the Garden clock. Walkers only use connected dry paths of the walk network; flyers hop between
// path points high above them, so nobody ever stands in the pond.
import { distance, type Network, type Point } from '../fairy/walkNetwork';

// `silktail`, the Silktail Fox spirit, walks like the others but is not a random visitor: it comes
// for a Journal milestone (when exactly is still to be designed), so it is left out of CRITTER_IDS.
export type CritterId = 'butterfly' | 'bluebird' | 'rabbit' | 'hedgehog' | 'puppy' | 'silktail';
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
  // The rabbit's pace matches its painted hops: 75.7 units (about a body length) each 0.55 s burst.
  rabbit: { id: 'rabbit', kind: 'walker', size: 104, speed: 138, altitude: [0, 0] },
  // The hedgehog's pace matches its painted steps: 30.2 units each 1.08 s.
  hedgehog: { id: 'hedgehog', kind: 'walker', size: 64, speed: 28, altitude: [0, 0] },
  // The puppy's pace matches its painted stride: 41.9 units each 1.42 s.
  puppy: { id: 'puppy', kind: 'walker', size: 100, speed: 30, altitude: [0, 0] },
  // The fox runs: its pace matches its painted gallop, 394 units each 3.92 s.
  silktail: { id: 'silktail', kind: 'walker', size: 170, speed: 100.6, altitude: [0, 0] },
};
export const CRITTER_IDS = (Object.keys(CRITTERS) as CritterId[]).filter(id => id !== 'silktail');
export const MAX_VISITORS = 2;
// Seconds between one visitor arriving and the next.
export const VISIT_GAP: [number, number] = [10, 35];
export const FADE_SECONDS = 0.8;
// Visitors stay while you are in the Garden; after this long away they have gone home.
export const AWAY_SECONDS = 10 * 60;
// Seconds a visitor rests where a leg ended before the next one (the bluebird flies on).
export const REST: Readonly<Record<CritterId, [number, number]>> = {
  butterfly: [0.4, 2.5], bluebird: [0, 0], rabbit: [2, 7], hedgehog: [3, 9], puppy: [3, 10], silktail: [12, 24],
};

// How a visitor moves: in bursts of `moving` (fraction) of every `cycle` seconds, still otherwise
// (cycle 0: steady). Each of the rabbit's bursts is one hop; the hedgehog and the puppy stop
// now and then to sniff.
export type Rhythm = { cycle: number; moving: number };
export const RHYTHMS: Readonly<Record<CritterId, Rhythm>> = {
  butterfly: { cycle: 0, moving: 1 }, bluebird: { cycle: 0, moving: 1 },
  rabbit: { cycle: 1.1, moving: 0.5 }, hedgehog: { cycle: 4, moving: 0.65 }, puppy: { cycle: 7, moving: 0.8 },
  silktail: { cycle: 0, moving: 1 },
};
// World units covered in one burst (the rabbit: one hop).
export const burstLength = (id: CritterId) => CRITTERS[id].speed * RHYTHMS[id].cycle * RHYTHMS[id].moving;
// One leg: `lead` seconds still at the path's start (fading in on arrival, else resting), then
// travel; `duration` covers both. `walked`: ground covered on earlier legs, so painted strides
// carry on where they stopped.
export type Visit = {
  key: number; id: CritterId; path: Point[]; start: number; duration: number; speed: number; rhythm: Rhythm;
  lead: number; fadeIn: boolean; walked: number;
};

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

// A walker strolls 3–6 connected path segments without turning straight back, from node `from`
// when given.
export function planWalk(network: Network, edges: Network['edges'], random: () => number, segments = 3 + Math.floor(random() * 4), from?: number) {
  if (!edges.length) return null;
  const neighbours = new Map<number, number[]>();
  for (const edge of edges) {
    neighbours.set(edge.a, [...(neighbours.get(edge.a) ?? []), edge.b]);
    neighbours.set(edge.b, [...(neighbours.get(edge.b) ?? []), edge.a]);
  }
  const onward = from === undefined ? [] : neighbours.get(from) ?? [];
  if (from !== undefined && !onward.length) return null;
  const first = pick(edges, random);
  const route = from === undefined ? [first.a, first.b] : [from, pick(onward, random)];
  while (route.length <= segments) {
    const here = route[route.length - 1], previous = route[route.length - 2];
    const options = (neighbours.get(here) ?? []).filter(node => node !== previous);
    if (!options.length) break;
    route.push(pick(options, random));
  }
  return route.map(index => network.nodes[index]);
}

// A flyer visits 3–5 dry path points a short way apart, high above them; from `from` (where it
// is in the air) when given.
export function planFlight(points: readonly Point[], spec: CritterSpec, random: () => number, stops = 3 + Math.floor(random() * 3), from?: Point) {
  if (points.length < 2) return null;
  const path: Point[] = [];
  const lifted = from ? { x: from.x, y: from.y + (spec.altitude[0] + spec.altitude[1]) / 2 } : null;
  let here = lifted ? points.reduce((best, point) => (distance(point, lifted) < distance(best, lifted) ? point : best)) : pick(points, random);
  for (let i = 0; i < stops; i++) {
    const lift = between(spec.altitude, random);
    path.push(i === 0 && from ? from : { x: here.x, y: here.y - lift });
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
  return { key, id, path, start: now, duration: FADE_SECONDS + travelSeconds(pathLength(path) / spec.speed, rhythm), speed: spec.speed, rhythm, lead: FADE_SECONDS, fadeIn: true, walked: 0 };
}

// A visitor's next leg once `visit` has ended: a rest where it stopped, then a new route from
// there. Null when no route leads on (it then stays put and is asked again later).
export function planNextLeg({ visit, now, network, edges, points, random }: {
  visit: Visit; now: number; network: Network; edges: Network['edges']; points: readonly Point[]; random: () => number;
}): Visit | null {
  const spec = CRITTERS[visit.id], gone = visitDistance(visit, visit.start + visit.duration);
  // Where it stopped (walkers move in whole steps, so maybe short of the last point) and the
  // path point ahead of it: a walker finishes that segment, then strolls on from there.
  let ahead = visit.path.length - 1;
  for (let i = 1, along = 0; i < visit.path.length; i++) {
    along += distance(visit.path[i - 1], visit.path[i]);
    if (gone < along - 1e-6) { ahead = i; break; }
  }
  const pose = visitPose(visit, visit.start + visit.duration), here = { x: pose.x, y: pose.y };
  const node = network.nodes.indexOf(visit.path[ahead]);
  const onward = spec.kind === 'walker' && node >= 0 ? planWalk(network, edges, random, undefined, node) : null;
  const path = spec.kind === 'walker'
    ? (onward ? (distance(here, onward[0]) > 1e-6 ? [here, ...onward] : onward) : null)
    : planFlight(points, spec, random, undefined, here);
  if (!path || path.length < 2) return null;
  const lead = between(REST[visit.id], random);
  return { ...visit, path, start: now, lead, fadeIn: false, walked: visit.walked + gone,
    duration: lead + travelSeconds(pathLength(path) / spec.speed, visit.rhythm) };
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

// The point `distance` along a path, and the direction of the segment it is on.
export function pointAlong(path: readonly Point[], distance: number) {
  'worklet';
  let left = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length || i === path.length - 1) {
      const u = length ? Math.min(1, left / length) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, dx: b.x - a.x };
    }
    left -= length;
  }
  return { x: path[0].x, y: path[0].y, dx: 1 };
}

// How far a visitor has come along its path `seconds` into its visit (world units): walkers'
// legs step by distance, so their feet stay put on the ground however the pace changes.
export function visitDistance(visit: Visit, seconds: number) {
  'worklet';
  const travel = Math.max(0, Math.min(visit.duration - visit.lead, seconds - visit.start - visit.lead));
  let length = 0;
  for (let i = 1; i < visit.path.length; i++) length += Math.hypot(visit.path[i].x - visit.path[i - 1].x, visit.path[i].y - visit.path[i - 1].y);
  // A short walk can be less than one of the puppy's long bursts: it stops at the last point.
  return Math.min(length, travelled(travel, visit.rhythm) * visit.speed);
}

// Where a visitor is `seconds` into its leg: point on its path, heading, how visible it is (it
// fades in on arrival; it never fades out, it leaves while you are away) and whether the leg is
// over.
export function visitPose(visit: Visit, seconds: number) {
  'worklet';
  const elapsed = seconds - visit.start;
  const travel = Math.max(0, Math.min(visit.duration - visit.lead, elapsed - visit.lead));
  const opacity = visit.fadeIn ? Math.max(0, Math.min(1, elapsed / FADE_SECONDS)) : 1;
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
  const elapsed = Math.max(0, seconds - visit.start - visit.lead);
  const within = elapsed % cycle;
  return within < cycle * moving ? within / (cycle * moving) : 0;
}
