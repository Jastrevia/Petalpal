// Garden visitors: a butterfly, a bluebird, a rabbit, a hedgehog and a puppy drop by now
// and then and stay: each wanders one route (a leg), rests where it ended, and sets off again.
// They go home only once the Garden has been away (closed, in the background) for AWAY_SECONDS.
// At most two at a time; each leg is planned here (pure, seeded by the caller's random) and
// drawn by GardenCritters.tsx from the Garden clock. Walkers only use connected dry paths of the walk network; flyers hop between
// path points high above them, so nobody ever stands in the pond.
import { distance, type Network, type Point } from '../fairy/walkNetwork';

// `silktail`, the Silktail Fox spirit, walks like the others but is not a random visitor: it comes
// for a Journal milestone (when exactly is still to be designed), so it is left out of CRITTER_IDS.
// Nor are the bluebird and the butterfly any more: they live on the Garden's perches and stones
// (spirits/Bluebird.tsx, Butterfly.tsx).
export type CritterId = 'butterfly' | 'bluebird' | 'rabbit' | 'hedgehog' | 'puppy' | 'silktail' | 'maltese';
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
// The Maltese's drawn size and walking pace (world units), from its painted walk.
// (Its sheet's cells are 293 px wide. Its painting since 2026-11-05 has a bigger head than the
// first one, so it is drawn at 0.8 of the first one's 62 units, keeping it about half the puppy's
// size. Its painted walk covers 47.9 units a 48-frame stride, 34.6 a 42-frame one in its petal
// look. It walks as fast as the puppy (the owner's choice, 2026-11-05): its frames follow the ground
// it covers, so its stride stays the painted one and its little legs simply step quicker, about 1.7
// times the video's own pace.)
export const MALTESE_SIZE = 49.6, MALTESE_SPEED = 38;
// Its gallop: two strides of about 33 units each loop. A small dog's strides are short and quick:
// it takes two to each of the puppy's (the puppy's gallop: 178 units a stride at RUN_SPEED, 1.23 s),
// so it runs a loop in about 1.23 s.
export const MALTESE_RUN_SPEED = 53;
export const CRITTERS: Readonly<Record<CritterId, CritterSpec>> = {
  butterfly: { id: 'butterfly', kind: 'flyer', size: 60, speed: 46, altitude: [36, 90] },
  bluebird: { id: 'bluebird', kind: 'flyer', size: 92, speed: 140, altitude: [120, 200] },
  // The rabbit's pace matches its painted hops: 45 units (about a body length) each 0.55 s burst.
  rabbit: { id: 'rabbit', kind: 'walker', size: 62, speed: 82.3, altitude: [0, 0] },
  // The hedgehog's pace matches its painted steps: 19.8 units each 1.08 s.
  hedgehog: { id: 'hedgehog', kind: 'walker', size: 42, speed: 18.4, altitude: [0, 0] },
  // The puppy's pace sits between its two painted walks (puppyLooks.ts): bare 123.7 units each
  // 2.75 s, caped 43.3 units each 1.25 s (it runs at RUN_SPEED).
  puppy: { id: 'puppy', kind: 'walker', size: 113, speed: 38, altitude: [0, 0] },
  // The fox runs: its pace matches its painted gallop, 394 units each 3.92 s.
  silktail: { id: 'silktail', kind: 'walker', size: 170, speed: 100.6, altitude: [0, 0] },
  // The Maltese, the puppy's tiny best friend (follows it: planFollow). Size and pace set from its
  // painted walk (GardenCritters ART.maltese).
  maltese: { id: 'maltese', kind: 'walker', size: MALTESE_SIZE, speed: MALTESE_SPEED, altitude: [0, 0] },
};
// (The Maltese is not one of them: it comes with the puppy, planFriendVisit.)
export const CRITTER_IDS = (Object.keys(CRITTERS) as CritterId[]).filter(id => id !== 'silktail' && id !== 'bluebird' && id !== 'butterfly' && id !== 'maltese');
// The rabbit, the hedgehog and the puppy can all be in at once (and the puppy's friend, the Maltese).
export const MAX_VISITORS = 3;
// Seconds between one visitor arriving and the next.
export const VISIT_GAP: [number, number] = [10, 35];
export const FADE_SECONDS = 0.8;
// Visitors stay while you are in the Garden; after this long away they have gone home.
export const AWAY_SECONDS = 10 * 60;
// Seconds a visitor rests where a leg ended before the next one (the bluebird flies on).
export const REST: Readonly<Record<CritterId, [number, number]>> = {
  butterfly: [0.4, 2.5], bluebird: [0, 0], rabbit: [2, 7], hedgehog: [3, 9], puppy: [3, 10], silktail: [12, 24], maltese: [2, 5],
};

// How a visitor moves: in bursts of `moving` (fraction) of every `cycle` seconds, still otherwise
// (cycle 0: steady). Each of the rabbit's bursts is one hop; the hedgehog and the puppy stop
// now and then to sniff.
export type Rhythm = { cycle: number; moving: number };
export const RHYTHMS: Readonly<Record<CritterId, Rhythm>> = {
  butterfly: { cycle: 0, moving: 1 }, bluebird: { cycle: 0, moving: 1 },
  rabbit: { cycle: 1.1, moving: 0.5 }, hedgehog: { cycle: 4, moving: 0.65 }, puppy: { cycle: 7, moving: 0.8 },
  silktail: { cycle: 0, moving: 1 }, maltese: { cycle: 0, moving: 1 },
};
// World units covered in one burst (the rabbit: one hop).
export const burstLength = (id: CritterId) => CRITTERS[id].speed * RHYTHMS[id].cycle * RHYTHMS[id].moving;
// One leg: `lead` seconds still at the path's start (fading in on arrival, else resting), then
// travel; `duration` covers both. `walked`: ground covered on earlier legs, so painted strides
// carry on where they stopped.
export type Visit = {
  key: number; id: CritterId; path: Point[]; start: number; duration: number; speed: number; rhythm: Rhythm;
  lead: number; fadeIn: boolean; walked: number;
  // The lawn (month) a lawn animal plays on; `leaving`: fading out where it stands.
  lawn?: number; leaving?: boolean;
  // The puppy: `chase`, running after the bluebird; `sits`, sitting where it caught up (its rest
  // is sitting down, sitting, getting up); `rising`, getting up before it runs off again.
  chase?: boolean; sits?: boolean; rising?: boolean;
  // Tapped: sitting where it was while its ring menu is open (holdVisit, releaseVisit).
  held?: boolean;
  // While held: eating or being patted (puppyLooks.ts PUPPY_ACTIONS), from `start` (clock seconds).
  action?: { kind: 'eat' | 'pat'; start: number };
  // The Maltese dashing off in a game of chase with the puppy (planPlay); `following`: a leg going
  // after (or sitting by) the other of the pair (planFollow).
  play?: boolean; following?: boolean;
  // Drawn with its run (the Maltese running in a game or catching up); `inScene`: part of a pair
  // scene (tug-of-war, a hug) shown as one clip from `start` to `end` (planScene).
  running?: boolean; inScene?: { start: number; end: number };
};

// The puppy chases the bluebird about half the times it takes off: it runs (its painted gallop,
// RUN_SPEED to match) along the paths to the one nearest below where the bird will land, sits
// there watching it for SIT_SECONDS, and then strolls on.
export const CHASE_CHANCE = 0.5;
export const RUN_SPEED = 145;
export const SIT_SECONDS: [number, number] = [14, 28];
export const RISE_SECONDS = 1.2;
const RUNNING: Rhythm = { cycle: 0, moving: 1 };
export function planChase({ visit, now, path }: { visit: Visit; now: number; path: Point[] | null }): Visit | null {
  if (!path || path.length < 2 || pathLength(path) < 40) return null;
  // Sitting: get up first.
  const rising = Boolean(visit.sits) && now < visit.start + visit.lead;
  const lead = rising ? RISE_SECONDS : 0.15;
  return { ...visit, path, start: now, lead, fadeIn: false, walked: visit.walked + visitDistance(visit, now),
    chase: true, sits: false, rising, speed: RUN_SPEED, rhythm: RUNNING, duration: lead + pathLength(path) / RUN_SPEED };
}

// Stops a chase where the puppy is now (when its outfit changes mid-run, it sits down first and
// changes sitting): the leg simply ends here, so the next leg is the usual sit after a chase.
export function stopChase(visit: Visit, now: number): Visit {
  if (!visit.chase || now >= visit.start + visit.duration) return visit;
  return { ...visit, duration: Math.max(visit.lead, now - visit.start) };
}

// Tapped (its ring menu is open): it sits down where it is and stays sitting until let go. The
// leg becomes a sit here followed by the rest of the path it was on, at its own pace (a chase is
// given up). Already sitting, it simply sits on. At the end of its path, a hair's step back keeps
// the way it faces.
export const HOLD_SECONDS = 3600;
export function holdVisit(visit: Visit, now: number): Visit {
  if (visit.held) return visit;
  const elapsed = now - visit.start;
  if (visit.sits && !visit.rising && elapsed >= 0 && elapsed < visit.lead) {
    const lead = elapsed + HOLD_SECONDS;
    return { ...visit, held: true, lead, duration: visit.duration + lead - visit.lead };
  }
  const spec = CRITTERS[visit.id], gone = visitDistance(visit, now);
  const pose = visitPose(visit, now), here = { x: pose.x, y: pose.y };
  let ahead = visit.path.length;
  for (let i = 1, along = 0; i < visit.path.length; i++) {
    along += distance(visit.path[i - 1], visit.path[i]);
    if (gone < along - 1e-6) { ahead = i; break; }
  }
  const rest = visit.path.slice(ahead);
  const path = rest.length ? [here, ...rest] : [{ x: here.x - (pose.dx < 0 ? -1 : 1) * 1e-3, y: here.y }, here];
  return { ...visit, path, start: now, lead: HOLD_SECONDS, fadeIn: false, walked: visit.walked + gone,
    chase: false, rising: false, sits: true, held: true, speed: spec.speed, rhythm: RHYTHMS[visit.id],
    duration: HOLD_SECONDS + travelSeconds(pathLength(path) / spec.speed, RHYTHMS[visit.id]) };
}

// Let go (the ring menu closed): it finishes sitting down if it had only just begun (`settle`
// seconds), gets up (`rise` seconds) and walks on along the rest of its path.
export function releaseVisit(visit: Visit, now: number, settle: number, rise: number): Visit {
  if (!visit.held) return visit;
  const lead = Math.max(now - visit.start, settle) + rise;
  return { ...visit, held: false, action: undefined, lead, duration: visit.duration - visit.lead + lead };
}

// The rabbit and the hedgehog play only on lawns with no flowers yet, one animal to a lawn (and
// the rabbit never on the butterfly's lawn). Once every lawn has flowers they walk the paths.
export const LAWN_ANIMALS: readonly CritterId[] = ['rabbit', 'hedgehog'];
export type LawnBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Lawns = {
  unplanted: readonly number[];
  // Lawns another animal is on, per animal asking.
  taken: (id: CritterId) => readonly number[];
  isOn: (month: number, point: Point) => boolean;
  bounds: (month: number) => LawnBounds;
};
// Kept from a lawn's edge (world units), so a body never hangs over the path or the water.
export const LAWN_MARGIN = 16;

const onLawn = (lawns: Lawns, month: number, p: Point) => {
  if (!lawns.isOn(month, p)) return false;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    if (!lawns.isOn(month, { x: p.x + Math.cos(a) * LAWN_MARGIN, y: p.y + Math.sin(a) * LAWN_MARGIN })) return false;
  }
  return true;
};
const segmentOnLawn = (lawns: Lawns, month: number, a: Point, b: Point) => {
  const d = distance(a, b);
  for (let s = 0; s <= d; s += 8) if (!onLawn(lawns, month, { x: a.x + (b.x - a.x) * s / (d || 1), y: a.y + (b.y - a.y) * s / (d || 1) })) return false;
  return true;
};

// A stroll of 2–4 straight stretches inside one lawn, from `from` (where it is) when given.
export function planLawnWalk(month: number, lawns: Lawns, random: () => number, from?: Point, stops = 2 + Math.floor(random() * 3)) {
  const b = lawns.bounds(month);
  let here: Point | null = from ?? null;
  for (let attempt = 0; !here && attempt < 120; attempt++) {
    const p = { x: b.minX + random() * (b.maxX - b.minX), y: b.minY + random() * (b.maxY - b.minY) };
    if (onLawn(lawns, month, p)) here = p;
  }
  if (!here) return null;
  const path = [here];
  for (let i = 0; i < stops; i++) {
    const at: Point = here;
    let next: Point | null = null;
    for (let attempt = 0; !next && attempt < 40; attempt++) {
      const angle = random() * Math.PI * 2, d = 30 + random() * 170;
      const p: Point = { x: at.x + Math.cos(angle) * d, y: at.y + Math.sin(angle) * d };
      if (onLawn(lawns, month, p) && segmentOnLawn(lawns, month, at, p)) next = p;
    }
    if (!next) break;
    path.push(next); here = next;
  }
  return path.length >= 2 ? path : null;
}

// A free unplanted lawn for `id`, or null.
export function chooseLawn(id: CritterId, lawns: Lawns, random: () => number) {
  const taken = lawns.taken(id), free = lawns.unplanted.filter(month => !taken.includes(month));
  return free.length ? pick(free, random) : null;
}

// Fades out where it stands (its lawn has flowers now, or someone else's turn).
export function leaveVisit(visit: Visit, now: number): Visit {
  const here = visitPose(visit, now);
  return { ...visit, path: [{ x: here.x, y: here.y }, { x: here.x, y: here.y }], start: now, lead: 0, duration: FADE_SECONDS, fadeIn: false, leaving: true,
    walked: visit.walked + visitDistance(visit, now) };
}

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

// The next visitor: someone not already in the Garden (nor `excluded`), with a route and how
// long it lasts. A lawn animal needs a free unplanted lawn while any lawn is unplanted.
export function planVisit({ key, now, active, network, edges, points, random, lawns, excluded = [] }: {
  key: number; now: number; active: readonly Visit[]; network: Network; edges: Network['edges'];
  points: readonly Point[]; random: () => number; lawns?: Lawns; excluded?: readonly CritterId[];
}): Visit | null {
  if (active.length >= MAX_VISITORS) return null;
  const free = CRITTER_IDS.filter(id => !excluded.includes(id) && !active.some(visit => visit.id === id)
    && !(lawns && LAWN_ANIMALS.includes(id) && lawns.unplanted.length && chooseLawn(id, lawns, () => 0) === null));
  if (!free.length) return null;
  const id = pick(free, random), spec = CRITTERS[id];
  const lawn = lawns && LAWN_ANIMALS.includes(id) && lawns.unplanted.length ? chooseLawn(id, lawns, random) : null;
  const path = lawn !== null && lawns ? planLawnWalk(lawn, lawns, random)
    : spec.kind === 'walker' ? planWalk(network, edges, random) : planFlight(points, spec, random);
  if (!path || path.length < 2) return null;
  const rhythm = RHYTHMS[id];
  return { key, id, path, start: now, duration: FADE_SECONDS + travelSeconds(pathLength(path) / spec.speed, rhythm), speed: spec.speed, rhythm,
    lead: FADE_SECONDS, fadeIn: true, walked: 0, ...(lawn !== null ? { lawn } : {}) };
}

// A visitor's next leg once `visit` has ended: a rest where it stopped, then a new route from
// there. Null when no route leads on (it then stays put and is asked again later).
export function planNextLeg({ visit, now, network, edges, points, random, lawns }: {
  visit: Visit; now: number; network: Network; edges: Network['edges']; points: readonly Point[]; random: () => number; lawns?: Lawns;
}): Visit | null {
  const spec = CRITTERS[visit.id], gone = visitDistance(visit, visit.start + visit.duration);
  // After a chase the puppy sits a while where it caught up, then walks on at its own pace.
  const after = visit.chase ? { sits: true, chase: false, rising: false, speed: spec.speed, rhythm: RHYTHMS[visit.id] } : { sits: false, rising: false };
  const rest = () => (visit.chase ? between(SIT_SECONDS, random) : between(REST[visit.id], random));
  if (visit.lawn !== undefined && lawns) {
    // On its lawn: stroll on from where it stopped; a planted lawn is left (leaveVisit).
    const end = visitPose(visit, visit.start + visit.duration);
    const path = planLawnWalk(visit.lawn, lawns, random, { x: end.x, y: end.y });
    if (!path) return null;
    const lead = rest();
    return { ...visit, ...after, path, start: now, lead, fadeIn: false, walked: visit.walked + gone,
      duration: lead + travelSeconds(pathLength(path) / spec.speed, RHYTHMS[visit.id]) };
  }
  // Where it stopped (walkers move in whole steps, so maybe short of the last point) and the
  // path point ahead of it: a walker finishes that segment, then strolls on from there.
  let ahead = visit.path.length - 1;
  for (let i = 1, along = 0; i < visit.path.length; i++) {
    along += distance(visit.path[i - 1], visit.path[i]);
    if (gone < along - 1e-6) { ahead = i; break; }
  }
  const pose = visitPose(visit, visit.start + visit.duration), here = { x: pose.x, y: pose.y };
  const target = visit.path[ahead];
  const node = network.nodes.findIndex(n => Math.abs(n.x - target.x) < 1e-3 && Math.abs(n.y - target.y) < 1e-3);
  const onward = spec.kind === 'walker' && node >= 0 ? planWalk(network, edges, random, undefined, node) : null;
  const path = spec.kind === 'walker'
    ? (onward ? (distance(here, onward[0]) > 1e-6 ? [here, ...onward] : onward) : null)
    : planFlight(points, spec, random, undefined, here);
  if (!path || path.length < 2) return null;
  const lead = rest();
  return { ...visit, ...after, path, start: now, lead, fadeIn: false, walked: visit.walked + gone,
    duration: lead + travelSeconds(pathLength(path) / spec.speed, visit.chase ? RHYTHMS[visit.id] : visit.rhythm) };
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
  const opacity = visit.leaving ? Math.max(0, 1 - elapsed / FADE_SECONDS) : visit.fadeIn ? Math.max(0, Math.min(1, elapsed / FADE_SECONDS)) : 1;
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

// The Maltese comes only with the puppy, to play with it: once the puppy is here (and the Maltese
// is not), it turns up somewhere on the paths and sets off after it (planFollow).
export function planFriendVisit({ key, now, active, network, edges, random }: {
  key: number; now: number; active: readonly Visit[]; network: Network; edges: Network['edges']; random: () => number;
}): Visit | null {
  const puppy = active.find(visit => visit.id === 'puppy' && !visit.leaving);
  if (!puppy || active.some(visit => visit.id === 'maltese')) return null;
  // It turns up a little way from the puppy (a path crossing 100–260 units off), in sight of it.
  const at = visitPose(puppy, now), linked = new Set(edges.flatMap(edge => [edge.a, edge.b]));
  const near = network.nodes.map((node, i) => ({ i, d: distance(node, at) })).filter(({ i, d }) => linked.has(i) && d >= 100 && d <= 260);
  const from = near.length ? near[Math.floor(random() * near.length)].i : undefined;
  const spec = CRITTERS.maltese, path = planWalk(network, edges, random, from === undefined ? undefined : 1, from);
  if (!path || path.length < 2) return null;
  const rhythm = RHYTHMS.maltese;
  return { key, id: 'maltese', path, start: now, duration: FADE_SECONDS + travelSeconds(pathLength(path) / spec.speed, rhythm), speed: spec.speed, rhythm,
    lead: FADE_SECONDS, fadeIn: true, walked: 0 };
}

// The Maltese plays with the puppy: whenever a leg ends it heads for its friend along the paths
// (a short stretch at a time, so it keeps up as the puppy moves on), trotting a little faster when
// it has fallen far behind; once beside it, it sits down facing it for a while, then checks again.
// `path`: the route to the puppy (walkNetwork route), null when none; `leader`: the puppy's pose now.
// They never stand or sit inside each other: at least APART units between them (the puppy's body
// is about 50 either side of its paws, the Maltese's about 28), so a follower stops that far short
// and, finding itself closer, first steps aside to `aside` (a free spot that far from the other).
export const APART = 82;
export const FOLLOW_NEAR = 110;
const FOLLOW_STRETCH = 160;
export function planFollow({ visit, now, here, leader, path, random, aside = null }: {
  visit: Visit; now: number; here: Point; leader: Point; path: Point[] | null; random: () => number; aside?: Point | null;
}): Visit {
  const spec = CRITTERS[visit.id], walked = visit.walked + visitDistance(visit, visit.start + visit.duration);
  const gap = distance(here, leader);
  if (gap < APART && aside && distance(aside, here) > 4) {
    // Too close: step aside first (then sit, on the next leg).
    return { ...visit, path: [here, aside], start: now, lead: 0.1, duration: 0.1 + distance(here, aside) / spec.speed, speed: spec.speed,
      rhythm: RHYTHMS[visit.id], fadeIn: false, walked, sits: false, rising: false, chase: false, following: true, running: false };
  }
  if (gap <= FOLLOW_NEAR || !path || path.length < 2) {
    // Beside it (or no way there): sit down facing it.
    const facing = leader.x >= here.x ? 1 : -1;
    const lead = between(REST[visit.id], random) + 1.5;
    return { ...visit, path: [here, { x: here.x + facing * 0.5, y: here.y }], start: now, lead, duration: lead + 0.05,
      speed: spec.speed, rhythm: RHYTHMS[visit.id], fadeIn: false, walked, sits: true, rising: false, chase: false, following: true, running: false };
  }
  // Stop well short of it, and go only a stretch of the way before looking again.
  const route: Point[] = [path[0]];
  let left = Math.min(FOLLOW_STRETCH, Math.max(0, pathLength(path) - APART - 10));
  for (let i = 1; i < path.length && left > 1e-6; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b);
    if (length <= left) { route.push(b); left -= length; continue; }
    route.push({ x: a.x + (b.x - a.x) * left / length, y: a.y + (b.y - a.y) * left / length }); left = 0;
  }
  if (route.length < 2 || pathLength(route) < 4) return { ...visit, start: now, lead: 1, duration: 1.05, path: [here, { x: here.x + 0.5, y: here.y }], fadeIn: false, walked, sits: false, following: true };
  const far = gap > FOLLOW_STRETCH * 2, speed = far ? (visit.id === 'maltese' ? MALTESE_RUN_SPEED : spec.speed * 1.6) : spec.speed;
  // Sitting: it gets up first (its sit played back), then sets off.
  const rising = Boolean(visit.sits), lead = rising ? RISE_SECONDS * 0.7 : 0.15;
  return { ...visit, path: route, start: now, lead, duration: lead + pathLength(route) / speed, speed, rhythm: RHYTHMS[visit.id],
    fadeIn: false, walked, sits: false, rising, chase: false, following: true, running: far && visit.id === 'maltese' };
}

// Who leads their walks: the Maltese most of the time (the puppy is clingy and trails after it),
// the puppy the rest; chosen afresh every LEAD_SPELL seconds.
export type PairLeader = 'maltese' | 'puppy';
export const MALTESE_LEADS = 0.7;
export const LEAD_SPELL: [number, number] = [40, 70];
export const pickLeader = (random: () => number): PairLeader => (random() < MALTESE_LEADS ? 'maltese' : 'puppy');
export const leadSpell = (random: () => number) => between(LEAD_SPELL, random);

// A game of chase, now and then when the two are close: the Maltese dashes off along `dash`, the
// puppy gallops after it along `chase` (its painted run) and catches up just as the Maltese stops;
// then both sit down together (the Maltese facing it) and `ends` is when hearts may rise.
export const PLAY_NEAR = 110;
export const PLAY_CHANCE = 0.35;
const PULL_UP = APART + 8;
// `path` without its last `by` units.
export function trimEnd(path: Point[], by: number): Point[] {
  let keep = pathLength(path) - by;
  if (keep <= 0) return path.slice(0, 1);
  const out: Point[] = [path[0]];
  for (let i = 1; i < path.length && keep > 1e-6; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b);
    if (length <= keep) { out.push(b); keep -= length; continue; }
    out.push({ x: a.x + (b.x - a.x) * keep / length, y: a.y + (b.y - a.y) * keep / length }); keep = 0;
  }
  return out;
}
export function planPlay({ maltese, puppy, now, dash, chase, runner = 'maltese' }: {
  maltese: Visit; puppy: Visit; now: number; dash: Point[] | null; chase: Point[] | null; runner?: PairLeader;
}): { maltese: Visit; puppy: Visit; ends: number; at: Point } | null {
  // `dash`: the runner's way off; `chase`: the chaser's way to where the runner starts from. The
  // chaser then runs the runner's own trail behind it, never closer than APART, and pulls up that
  // far behind it as it stops. Either may run: the Maltese dashes off, or the puppy does and the
  // Maltese scampers after it (both on their painted runs).
  if (!dash || dash.length < 2 || pathLength(dash) < 60 || !chase || chase.length < 1 || puppy.held || puppy.chase || maltese.held) return null;
  const run = runner === 'maltese' ? maltese : puppy, after = runner === 'maltese' ? puppy : maltese;
  // Each at its own natural run: the Maltese's quick little gallop, the puppy's long one.
  const speed = runner === 'maltese' ? MALTESE_RUN_SPEED : RUN_SPEED;
  const walked = run.walked + visitDistance(run, Math.min(now, run.start + run.duration));
  const dashing: Visit = { ...run, path: dash, start: now, lead: 0.2, duration: 0.2 + pathLength(dash) / speed, speed,
    rhythm: runner === 'maltese' ? RHYTHMS.maltese : RUNNING, fadeIn: false, walked, sits: false, rising: false,
    chase: runner === 'puppy', play: runner === 'maltese', running: runner === 'maltese', following: false };
  const arrives = now + dashing.duration;
  const trail = trimEnd([...chase, ...dash.slice(distance(chase[chase.length - 1], dash[0]) < 1e-6 ? 1 : 0)], PULL_UP);
  // It sets off once the runner is a body length ahead along the trail.
  const delay = Math.max(0.6, (APART - pathLength(chase)) / speed + 0.2);
  if (trail.length < 2 || pathLength(trail) < 40) return null;
  // The chaser runs at its own pace too: the puppy, much faster, sets off late enough to pull up
  // behind the Maltese just as it stops; the Maltese, slower, simply runs after the puppy and gets
  // there after it.
  const pace = runner === 'maltese' ? RUN_SPEED : MALTESE_RUN_SPEED;
  const startAt = runner === 'maltese' ? Math.max(now + delay, arrives - pathLength(trail) / pace - 0.15) : now + delay;
  const rising = Boolean(after.sits) && startAt < after.start + after.lead;
  const lead = rising ? RISE_SECONDS : 0.15, start = rising ? startAt - RISE_SECONDS + 0.15 : startAt;
  const chasing: Visit = { ...after, path: trail, start, lead, duration: lead + pathLength(trail) / pace, speed: pace,
    rhythm: runner === 'maltese' ? RUNNING : RHYTHMS.maltese, fadeIn: false, walked: after.walked + visitDistance(after, Math.min(now, after.start + after.duration)),
    sits: false, rising, chase: runner === 'maltese', play: runner === 'puppy', running: runner === 'puppy', following: false };
  const out = runner === 'maltese' ? { maltese: dashing, puppy: chasing } : { maltese: chasing, puppy: dashing };
  return { ...out, ends: Math.max(arrives, chasing.start + chasing.duration), at: dash[dash.length - 1] };
}

// The one who should follow is off on a walk of its own (just arrived, or the lead just changed):
// it breaks off where it is now, so its next leg goes after the other. Not while resting where a
// leg ended (it gets up and goes when the rest is over), held, chasing or in a game.
export function breakOff(visit: Visit, now: number, crowded = false): Visit {
  const elapsed = now - visit.start;
  if (visit.chase || visit.held || visit.play || visit.leaving || visit.inScene || now >= visit.start + visit.duration) return visit;
  // Crowded (the other walking into it): it makes room at once, even from a rest or a follow.
  // (Not one already walking a follow leg, e.g. stepping aside: that one is moving off.)
  if (crowded && (visit.sits || !visit.following)) return { ...visit, lead: Math.min(visit.lead, elapsed), duration: elapsed };
  if (visit.following || elapsed < visit.lead) return visit;
  return { ...visit, duration: elapsed };
}

// A free spot `APART` from `other`, on the side `from` is on (else the other side), for a pair
// member that ended up too close; null when neither side is free.
export function asideFrom(from: Point, other: Point, blocked: (p: Point) => boolean): Point | null {
  const side = from.x >= other.x ? 1 : -1;
  for (const s of [side, -side]) {
    const spot = { x: other.x + s * APART, y: from.y };
    if (!blocked(spot)) return spot;
  }
  return null;
}

// How close `path` comes to `point`, past its first `skip` units (its start may be close already).
export function closestApproach(path: readonly Point[], point: Point, skip = 0) {
  let best = Infinity, along = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b);
    for (let k = 0; k <= 8; k++) {
      const u = k / 8, d = along + u * length;
      if (d < skip) continue;
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
      best = Math.min(best, Math.hypot(x - point.x, y - point.y));
    }
    along += length;
  }
  return best;
}
// The leader's next walk keeps clear of the other one: of a few candidate walks the first that
// never comes within APART of it, else the one that keeps farthest, cut off before it gets close.
export function clearOf(candidates: readonly (Visit | null)[], other: Point): Visit | null {
  let best: Visit | null = null, bestGap = -1;
  for (const leg of candidates) {
    if (!leg) continue;
    const gap = closestApproach(leg.path, other, 20);
    if (gap >= APART) return leg;
    if (gap > bestGap) { best = leg; bestGap = gap; }
  }
  if (!best) return null;
  // Walk only up to where it would come close, then rest there.
  let cut = best.path.length;
  for (let i = 1; i < best.path.length; i++) if (Math.hypot(best.path[i].x - other.x, best.path[i].y - other.y) < APART) { cut = i; break; }
  const path = best.path.slice(0, Math.max(2, cut));
  if (path.length < 2 || pathLength(path) < 2) return best;
  return { ...best, path, duration: best.lead + travelSeconds(pathLength(path) / best.speed, best.rhythm) };
}

// Pair scenes, drawn as one painted clip of both (GardenCritters PAIR_SCENES): a tug-of-war with a
// rope toy (both standing) and a hug (both sitting). The Maltese walks up to its place facing the
// puppy (`apart` units from it, on its side) and the scene plays there, both held for it.
export type SceneKind = 'tug' | 'hug';
export const SCENE_SPECS: Readonly<Record<SceneKind, { seconds: number; apart: number; sits: boolean }>> = {
  tug: { seconds: 71 / 12, apart: 102.5, sits: false },
  hug: { seconds: 71 / 12, apart: 63.9, sits: true },
};
export type Scene = { key: number; kind: SceneKind; start: number; end: number; x: number; y: number; dir: 1 | -1 };
export function planScene({ key, kind, maltese, puppy, now, mAt, pAt, approach }: {
  key: number; kind: SceneKind; maltese: Visit; puppy: Visit; now: number; mAt: Point; pAt: Point; approach: Point[] | null;
}): { maltese: Visit; puppy: Visit; scene: Scene } | null {
  if (puppy.held || maltese.held || puppy.chase || !approach || approach.length < 1) return null;
  const spec = SCENE_SPECS[kind], dir: 1 | -1 = mAt.x >= pAt.x ? 1 : -1;
  const spot = { x: pAt.x + dir * spec.apart, y: pAt.y };
  const to = [...approach.slice(0, -1), spot];
  const path = to.length >= 2 ? [...to, { x: spot.x - dir * 0.5, y: spot.y }] : [mAt, { x: mAt.x - dir * 0.5, y: mAt.y }];
  const speed = CRITTERS.maltese.speed, walking = pathLength(path) / speed;
  const start = now + Math.max(walking + 0.3, spec.sits ? 1.6 : 0.4), end = start + spec.seconds;
  const scene: Scene = { key, kind, start, end, x: pAt.x, y: pAt.y, dir };
  const m: Visit = { ...maltese, path, start: now, lead: 0.1, duration: 0.1 + walking, speed, rhythm: RHYTHMS.maltese, fadeIn: false,
    walked: maltese.walked + visitDistance(maltese, Math.min(now, maltese.start + maltese.duration)), sits: false, rising: false, chase: false,
    play: false, running: false, following: true, inScene: { start, end } };
  const lead = end - now;
  const p: Visit = { ...puppy, path: [pAt, { x: pAt.x + dir * 0.5, y: pAt.y }], start: now, lead, duration: lead + 0.05, speed: CRITTERS.puppy.speed,
    rhythm: RHYTHMS.puppy, fadeIn: false, walked: puppy.walked + visitDistance(puppy, Math.min(now, puppy.start + puppy.duration)),
    sits: spec.sits, rising: false, chase: false, following: true, inScene: { start, end } };
  return { maltese: m, puppy: p, scene };
}
// Holding still in place until a scene is over (a pair member whose own leg ended first).
export function sceneHold(visit: Visit, now: number, here: Point, facing: 1 | -1, sits: boolean): Visit {
  const end = visit.inScene!.end, lead = Math.max(0.05, end - now);
  return { ...visit, path: [here, { x: here.x + facing * 0.5, y: here.y }], start: now, lead, duration: lead + 0.05, fadeIn: false, sits, rising: false,
    walked: visit.walked + visitDistance(visit, visit.start + visit.duration) };
}
// How much of a scene shows at `t` (0..1), fading in and out over SCENE_FADE.
export const SCENE_FADE = 0.35;
export function sceneShown(scene: { start: number; end: number } | undefined, t: number) {
  'worklet';
  if (!scene || t <= scene.start || t >= scene.end) return 0;
  return Math.min(1, (t - scene.start) / SCENE_FADE, (scene.end - t) / SCENE_FADE);
}
