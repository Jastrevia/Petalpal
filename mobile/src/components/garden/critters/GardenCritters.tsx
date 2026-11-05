import { BlurMask, Group, Image, Oval, Path, Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useDerivedValue, useReducedMotion, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import { usePetOutfits } from '@/services/gardenPets';
import { isGardenGroundBlocked, isOnMonthLawn, monthLawnBounds } from '../fairy/gardenGround';
import { usePlanting } from '../planting/PlantingContext';
import { awaitsPlanting } from '../planting/plantingPersistence';
import { onBirdFlight, residents } from './gardenResidents';
import { ACTION_FPS, actionSeconds, malteseLookOf, malteseLookOfOutfit, MATCHING_FRAME, PUPPY_ACTIONS, PUPPY_LOOKS, puppyLookOf, type ActionFrames, type MalteseLook, type PuppyAction, type PuppyLook } from './puppyLooks';
export type { MalteseLook } from './puppyLooks';
import { distance, route, safeSegment, WALK_NETWORK, type Point } from '../fairy/walkNetwork';
import SheetFrame from '../SheetFrame';
import {
  AWAY_SECONDS, burstLength, CHASE_CHANCE, RHYTHMS, APART, asideFrom, breakOff, clearOf, CRITTERS, FOLLOW_NEAR, holdVisit, isRunning, leadSpell, pickLeader, planFollow, planFriendVisit, planPlay, planScene, PLAY_CHANCE, PLAY_NEAR, SCENE_SPECS, sceneHold, sceneShown, type PairLeader, type Scene, type SceneKind, leaveVisit, releaseVisit, nextGap, planChase, planNextLeg, planVisit, pointAlong, sitDown, visitDistance, visitPose, walkableEdges,
  type CritterId, type Lawns, type Visit,
} from './critterVisits';

// Painted visitors (one painting each); all motion is drawn from the Garden clock, so no React
// renders happen while they move. Art: assets/garden/critters, painting size in pixels. The
// walkers and the bluebird move in painted frames; the butterfly is a single painting.
// A painted motion: frames in a grid (scripts/critters/video-frames.py), `w` × `h` each. A
// walk: `ground` the row the paws stand on, `loop` the world units walked over all its frames.
// A flight: `fps`, played in time. `rest`: frames of settling down (same cells), played while it
// rests between legs (`always`, or when the leg `sits`), and backwards as far as `rise`
// (standing) to get up again. `run`: a running stride (same cells), for a leg that `chase`s.
// `trail`: a painted petal it sheds behind it while it moves.
type Frames = { columns: number; count: number; ground: number; loop: number; fps?: number;
  rest?: { source: number; count: number; rise: number; always?: boolean };
  run?: { source: number; columns: number; count: number; loop: number;
    // A run in bigger cells than the walk's (a gallop stretches past them): their size, and where
    // their top left lies in the walk's cell, in walk-cell pixels.
    cell?: { w: number; h: number; x: number; y: number } }; trail?: number };
// The Maltese (Xiaobai), from the owner's Holopix painting of it in its petal outfit (2026-11-05;
// ~/dev/petalpal-motion/maltese/v2): that painting on green is the dressed look, the same painting
// with every piece taken off the bare one. Each look: an oil-motion walk (a four-beat walk, one
// stride), a walk-to-sit (20 frames) and a gallop (two strides, painted from a mid-stride key
// frame), all cut with the walk's scale (crop 190,30,920,690 into 293 × 220 cells; the gallop is
// longer, so it is cut wider, 40,0,1240,744 into 395 × 237 cells, and drawn offset onto them, its
// landing paws on the walk's ground). `loop` is the ground the planted paws cover (measured by
// video-frames.py) at MALTESE_SIZE.
// Its own pieces, the painting's flower clip (its hat) and pink bow with two charms (its necklace),
// are laid onto the bare clips frame by frame (maltese/v2/pieces/overlay_maltese.py, after Kiro's
// head tracking for the golden) and cut with the bare sheets' frames, so hat, necklace and both
// walk in step with the bare look; the cape looks likewise share the cape's clips. It dresses like
// its friend: malteseLookOfOutfit.
const malteseBare = (walk: number, sit: number, run: number): Frames & { source: number } => ({
  source: walk, columns: 8, count: 48, ground: 216, loop: 47.9,
  rest: { source: sit, count: 20, rise: 1 },
  run: { source: run, columns: 8, count: 60, loop: 66.3, cell: { w: 395.4, h: 237.2, x: -47.83, y: -16.1 } } });
// The capelet alone: its own oil-motion clips (2026-11-05, from the petal painting with the flower
// clip and bow taken off and the capelet fastened by a gold clasp; ~/dev/petalpal-motion/maltese/v2/
// cape), its walk one 40-frame stride and its gallop starting from the petal gallop's key, so they
// share the petal look's cells; hat and necklace are laid onto them like the bare clips'.
const malteseCape = (walk: number, sit: number, run: number): Frames & { source: number } => ({
  source: walk, columns: 8, count: 40, ground: 216, loop: 34.6,
  rest: { source: sit, count: 20, rise: 1 },
  run: { source: run, columns: 8, count: 60, loop: 71.2, cell: { w: 395.4, h: 237.2, x: -47.83, y: -15 } } });
const MALTESE_LOOKS: Record<MalteseLook, Frames & { source: number }> = {
  bare: malteseBare(require('@/assets/garden/critters/maltese-walk.webp'), require('@/assets/garden/critters/maltese-sit.webp'),
    require('@/assets/garden/critters/maltese-run.webp')),
  hat: malteseBare(require('@/assets/garden/critters/maltese-looks/walk-hat.webp'), require('@/assets/garden/critters/maltese-looks/sit-hat.webp'),
    require('@/assets/garden/critters/maltese-looks/run-hat.webp')),
  necklace: malteseBare(require('@/assets/garden/critters/maltese-looks/walk-necklace.webp'), require('@/assets/garden/critters/maltese-looks/sit-necklace.webp'),
    require('@/assets/garden/critters/maltese-looks/run-necklace.webp')),
  'hat-necklace': malteseBare(require('@/assets/garden/critters/maltese-looks/walk-hat-necklace.webp'), require('@/assets/garden/critters/maltese-looks/sit-hat-necklace.webp'),
    require('@/assets/garden/critters/maltese-looks/run-hat-necklace.webp')),
  cape: malteseCape(require('@/assets/garden/critters/maltese-looks/walk-cape.webp'), require('@/assets/garden/critters/maltese-looks/sit-cape.webp'),
    require('@/assets/garden/critters/maltese-looks/run-cape.webp')),
  'cape-hat': malteseCape(require('@/assets/garden/critters/maltese-looks/walk-cape-hat.webp'), require('@/assets/garden/critters/maltese-looks/sit-cape-hat.webp'),
    require('@/assets/garden/critters/maltese-looks/run-cape-hat.webp')),
  'cape-necklace': malteseCape(require('@/assets/garden/critters/maltese-looks/walk-cape-necklace.webp'), require('@/assets/garden/critters/maltese-looks/sit-cape-necklace.webp'),
    require('@/assets/garden/critters/maltese-looks/run-cape-necklace.webp')),
  petal: { source: require('@/assets/garden/critters/maltese-petal-walk.webp'), columns: 8, count: 42, ground: 216, loop: 34.6,
    rest: { source: require('@/assets/garden/critters/maltese-petal-sit.webp'), count: 20, rise: 1 },
    run: { source: require('@/assets/garden/critters/maltese-petal-run.webp'), columns: 8, count: 59, loop: 64.4,
      cell: { w: 395.4, h: 237.2, x: -47.83, y: -22.2 } } },
};
const ART: Record<CritterId, { source: number; frames?: Frames; w: number; h: number }> = {
  butterfly: { source: require('@/assets/garden/critters/butterfly.webp'), w: 448, h: 367 },
  // The bluebird flies in painted frames: a few wingbeats of a generated flying clip.
  bluebird: { source: require('@/assets/garden/critters/bluebird-fly.webp'), frames: { columns: 6, count: 26, ground: 0, loop: 0, fps: 12 }, w: 251, h: 240 },
  // The rabbit hops in painted frames: two hops of a generated hopping clip, so `loop` is two of
  // its bursts and every pause lands on a sitting frame.
  rabbit: { source: require('@/assets/garden/critters/rabbit-hop.webp'), frames: { columns: 6, count: 26, ground: 257, loop: 2 * burstLength('rabbit') }, w: 360, h: 260 },
  // The puppy and the hedgehog walk in painted frames: one stride of a generated walking clip
  // (scripts/critters/video-frames.py), every pose painted whole. `loop` is the ground their
  // planted paws cover in that stride, so they do not skid.
  hedgehog: { source: require('@/assets/garden/critters/hedgehog-walk.webp'), frames: { columns: 5, count: 13, ground: 277, loop: 19.8 }, w: 344, h: 280 },
  // The puppy walks, gallops after the bluebird and sits down where it caught up in its outfit's
  // paintings (puppyLooks.ts; bare when it has nothing on), all sharing one crop, ground and scale.
  puppy: { source: PUPPY_LOOKS.bare.source, w: 418, h: 300, frames: PUPPY_LOOKS.bare },
  // The Maltese, the puppy's tiny friend (bare, or in its own look: MALTESE_LOOKS).
  maltese: { source: MALTESE_LOOKS.bare.source, w: 293, h: 220, frames: MALTESE_LOOKS.bare },
  // The Silktail Fox spirit, generated from the Garden spirits design sheet: it gallops (several
  // strides of a running clip) shedding petals, then slows, stops and sits down to rest (a clip
  // from that same running pose), and gets up again (back to its standing frame, 24).
  silktail: { source: require('@/assets/garden/spirits/silktail-run.webp'), w: 240, h: 180,
    frames: { columns: 8, count: 47, ground: 167, loop: 394, trail: require('@/assets/garden/spirits/silktail-petal.webp'),
      rest: { source: require('@/assets/garden/spirits/silktail-sit.webp'), count: 62, rise: 24, always: true } } },
};
const REST_FPS = 12;
// From the end of a run to sitting still: the longest settling-down sheet (16 frames at REST_FPS)
// plus the check that starts the next leg.
const SIT_DOWN_MS = 1600;
// How long the pair sit after a run is given up for an outfit, before they walk on.
const SIT_SECONDS = 3.5;
const EDGES = walkableEdges(WALK_NETWORK, isGardenGroundBlocked, (a, b) => safeSegment(a, b, isGardenGroundBlocked));
const POINTS = WALK_NETWORK.nodes.filter(node => !isGardenGroundBlocked(node));
// Where the puppy waits for a bird landing on `perch`: the path point nearest below it.
const belowPerch = (perch: Point) => {
  const under = { x: perch.x, y: perch.y + 80 };
  return POINTS.reduce((best, p) => (Math.hypot(p.x - under.x, p.y - under.y) < Math.hypot(best.x - under.x, best.y - under.y) ? p : best));
};

// What the Garden asks of its pets (GardenScene: a tap on the puppy opens its ring menu).
// `petAt`: the pet whose body is under a world point (`slop` world units of grace), where its
// paws stand and how big it is drawn; `hold`: it sits down where it is until `release`.
export type PetHit = { id: CritterId; x: number; y: number; size: number };
export type GardenPetsHandle = {
  petAt: (point: Point, slop: number) => PetHit | null;
  hold: (id: CritterId) => void;
  release: (id: CritterId) => void;
  // Plays the held pet's painted eating or being-patted clip; how many seconds it lasts, or 0 when
  // its look has none (or motion is reduced): the menu then shows its plain hearts.
  act: (id: CritterId, kind: PuppyAction) => number;
};

// Schedules the visitors: one now and then until MAX_VISITORS are here, only while the Garden is
// active. They stay, setting off again whenever a leg ends; after AWAY_SECONDS away they have
// gone. The rabbit and the hedgehog keep to unplanted lawns (critterVisits.ts): when only one is
// left, just one of them comes this session, picked when the Garden opens.
export default memo(function GardenCritters({ clock, active, pets }: { clock: SharedValue<number>; active: boolean; pets?: MutableRefObject<GardenPetsHandle | null> }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const keyRef = useRef(0);
  const visitsRef = useRef(visits); visitsRef.current = visits;
  const awaySince = useRef<number | null>(null);
  const chase = useRef<(to: Point) => void>(() => {});
  const { placements, isGardenLoading } = usePlanting();
  // What the puppy and the Maltese have on (their wardrobes, lib/garden-pets.js); `dressed`
  // overrides the puppy's in development.
  const outfits = usePetOutfits(active);
  const outfit = outfits?.puppy ?? null;
  const [dressed, setDressed] = useState<PuppyLook | undefined>(undefined);
  const look = dressed !== undefined ? dressed : puppyLookOf(outfit);
  // The Maltese wears its own outfit; on a server from before it had one (no `maltese` entry), and
  // in the development override, the same kinds of piece as its friend.
  const malteseLook = dressed !== undefined ? malteseLookOf(dressed)
    : malteseLookOfOutfit(outfits && 'maltese' in outfits ? outfits.maltese ?? null : outfit);
  // The looks they show, changed together. Walking or sitting, a new outfit goes on at once.
  // Running (after the bluebird, or a game of chase) they both stop and sit down where they are
  // (about SIT_DOWN_MS), then change sitting; a hug or a tug-of-war plays out first, then they sit
  // and change. Meanwhile no game sets them running.
  const [shownLook, setShownLook] = useState(look);
  const shownLookRef = useRef(shownLook); shownLookRef.current = shownLook;
  const [shownMaltese, setShownMaltese] = useState(malteseLook);
  const shownMalteseRef = useRef(shownMaltese); shownMalteseRef.current = shownMaltese;
  // Who leads the pair's walks (critterVisits.ts pickLeader), and hearts rising after a game.
  const pair = useRef<{ leader: PairLeader; until: number }>({ leader: 'maltese', until: 0 });
  const [hearts, setHearts] = useState<{ key: number; x: number; y: number; start: number }[]>([]);
  const forcePlay = useRef(false);
  // An outfit waiting to go on until the puppy has stopped running.
  const lookPending = useRef(false);
  const forceKind = useRef<'chase' | 'tug' | 'hug' | null>(null);
  const lastTry = useRef<unknown>(null);
  const [sceneList, setScenes] = useState<Scene[]>([]);
  const scenes = useRef(sceneList); scenes.current = sceneList;
  const reducedRef = useRef(false); reducedRef.current = !!useReducedMotion();
  useEffect(() => {
    const pairNow = (v: Visit) => (v.id === 'puppy' || v.id === 'maltese') && !v.leaving;
    const running = () => visitsRef.current.some(v => pairNow(v) && isRunning(v, clock.value));
    const playingScene = () => scenes.current.some(scene => clock.value < scene.end);
    const wear = () => { lookPending.current = false; setShownLook(look); setShownMaltese(malteseLook); };
    if (!running() && !playingScene()) { wear(); return; }
    lookPending.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const settle = () => {
      if (playingScene()) { timer = setTimeout(settle, 300); return; }
      const now = clock.value;
      visitsRef.current = visitsRef.current.map(v => (pairNow(v) && !v.held ? sitDown(v, now, SIT_SECONDS) : v));
      setVisits(visitsRef.current);
      timer = setTimeout(function wearSitting() {
        if (running()) { timer = setTimeout(wearSitting, 300); return; }
        wear();
      }, SIT_DOWN_MS);
    };
    settle();
    return () => { clearTimeout(timer); lookPending.current = false; };
  }, [look, malteseLook, clock]);
  const unplanted = useMemo(() => {
    const planted = new Set(placements.filter(p => !awaitsPlanting(p)).map(p => p.month));
    return Array.from({ length: 12 }, (_, i) => i + 1).filter(month => !planted.has(month));
  }, [placements]);
  const excluded = useRef<CritterId[] | null>(null);
  if (excluded.current === null && !isGardenLoading) excluded.current = unplanted.length === 1 ? [Math.random() < 0.5 ? 'rabbit' : 'hedgehog'] : [];
  const lawns = useRef<Lawns>({ unplanted, isOn: isOnMonthLawn, bounds: monthLawnBounds, taken: id => {
    const own = (other: CritterId) => visitsRef.current.filter(v => v.id === other && v.lawn !== undefined && !v.leaving).map(v => v.lawn!);
    return id === 'rabbit' ? [...own('hedgehog'), ...(residents.lawns.butterfly ? [residents.lawns.butterfly] : [])] : id === 'hedgehog' ? own('rabbit') : [];
  } });
  lawns.current.unplanted = unplanted;
  // Tell the butterfly where the lawn animals are.
  residents.lawns.rabbit = visits.find(v => v.id === 'rabbit' && !v.leaving)?.lawn;
  residents.lawns.hedgehog = visits.find(v => v.id === 'hedgehog' && !v.leaving)?.lawn;
  useEffect(() => {
    if (!active) { awaySince.current = Date.now(); return; }
    const left = awaySince.current !== null && Date.now() - awaySince.current >= AWAY_SECONDS * 1000;
    awaySince.current = null;
    if (left) { visitsRef.current = []; setVisits([]); }
    let timer: ReturnType<typeof setTimeout>;
    const arrive = () => {
      const visit = excluded.current === null ? null : planVisit({ key: ++keyRef.current, now: clock.value, active: visitsRef.current,
        network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random, lawns: lawns.current, excluded: excluded.current });
      if (visit) setVisits(current => [...current, visit]);
      // The puppy's friend follows it in now and then.
      const friend = Math.random() < 0.7 ? planFriendVisit({ key: ++keyRef.current, now: clock.value, active: visitsRef.current, network: WALK_NETWORK, edges: EDGES, random: Math.random }) : null;
      if (friend) setVisits(current => (current.some(v => v.id === 'maltese') ? current : [...current, friend]));
      timer = setTimeout(arrive, nextGap(Math.random) * 1000);
    };
    // The first visitor comes a few seconds after the Garden opens.
    timer = setTimeout(arrive, visitsRef.current.length ? nextGap(Math.random) * 1000 : 4000 + Math.random() * 6000);
    // A visitor whose leg is over rests and sets off again (checked often, so a flyer, which
    // does not rest, flies straight on). A lawn animal whose lawn now has flowers (or the
    // butterfly, for the rabbit) fades out instead, and one that has faded out is gone.
    const legs = setInterval(() => {
      const now = clock.value;
      if (now >= pair.current.until) pair.current = { leader: pickLeader(Math.random), until: now + leadSpell(Math.random) };
      // Whoever follows breaks off a walk of its own to go after the other.
      const follower = pair.current.leader === 'maltese' ? 'puppy' : 'maltese';
      if (visitsRef.current.some(v => v.id === 'maltese' && !v.leaving) && visitsRef.current.some(v => v.id === 'puppy' && !v.leaving)) {
        const lagging = visitsRef.current.find(v => v.id === follower), other = visitsRef.current.find(v => v.id !== follower && (v.id === 'puppy' || v.id === 'maltese'));
        // Never inside each other: one walking into the other makes the follower step aside.
        const a = lagging && visitPose(lagging, now), b = other && visitPose(other, now);
        const crowded = !!(a && b && Math.hypot(a.x - b.x, a.y - b.y) < APART * 0.7);
        if (lagging && breakOff(lagging, now, crowded) !== lagging) { visitsRef.current = visitsRef.current.map(v => (v === lagging ? breakOff(v, now, crowded) : v)); setVisits(visitsRef.current); }
      }
      if (!visitsRef.current.some(visit => now >= visit.start + visit.duration)) return;
      setVisits(current => {
        // The Maltese and the puppy together: a game of chase now and then, when the Maltese is
        // leading and its walk ends close to the puppy.
        const maltese = current.find(v => v.id === 'maltese' && !v.leaving), puppy = current.find(v => v.id === 'puppy' && !v.leaving);
        let game: ReturnType<typeof planPlay> = null, staged: ReturnType<typeof planScene> = null;
        const busy = (v: Visit) => v.held || v.chase || v.play || (v.inScene && now < v.inScene.end);
        if (__DEV__ && maltese && puppy && now >= maltese.start + maltese.duration && forcePlay.current) {
          const m = visitPose(maltese, maltese.start + maltese.duration), p = visitPose(puppy, now);
          lastTry.current = { check: true, busyM: !!busy(maltese), busyP: !!busy(puppy), gap: Math.round(Math.hypot(m.x - p.x, m.y - p.y)) };
        }
        if (maltese && puppy && !lookPending.current && now >= maltese.start + maltese.duration && !busy(maltese) && !busy(puppy) && (forcePlay.current || Math.random() < PLAY_CHANCE)) {
          const m = visitPose(maltese, maltese.start + maltese.duration), p = visitPose(puppy, now);
          const here = { x: m.x, y: m.y }, mate = { x: p.x, y: p.y };
          if (distance(here, mate) <= PLAY_NEAR * 1.6) {
            // Which game: chasing each other (either one runs), tug-of-war, or a hug.
            // (The tug and hug clips paint the puppy bare: dressed, it only plays chase, in its outfit.)
            const dressedUp = shownLookRef.current !== 'bare';
            const kind = dressedUp ? 'chase' : forceKind.current ?? (['chase', 'chase', 'tug', 'hug'] as const)[Math.floor(Math.random() * 4)];
            if (kind === 'chase') {
              const runner: PairLeader = Math.random() < 0.5 ? 'maltese' : 'puppy';
              const from = runner === 'maltese' ? here : mate, other = runner === 'maltese' ? mate : here;
              const goal = dashGoal(from, other, Math.random);
              const dash = goal ? pathTo(from, goal) : null;
              const toStart = pathTo(other, from);
              game = dash ? planPlay({ maltese, puppy, now, dash, chase: toStart, runner }) : null;
            } else {
              // Its place beside the puppy, on the side it is on (else the other side), with a way there.
              const near = here.x >= mate.x ? 1 : -1;
              for (const dir of [near, -near]) {
                const spot = { x: mate.x + dir * SCENE_SPECS[kind].apart, y: mate.y };
                if (isGardenGroundBlocked(spot)) continue;
                const approach = pathTo(here, spot);
                staged = planScene({ key: ++keyRef.current, kind, maltese, puppy, now, mAt: { x: mate.x + dir * (SCENE_SPECS[kind].apart + 1), y: mate.y }, pAt: mate, approach });
                if (staged) break;
              }
              if (__DEV__) lastTry.current = { kind, at: now, staged: !!staged };
            }
          }
        }
        if (game || staged) { forcePlay.current = false; forceKind.current = null; }
        if (game) {
          const played = game;
          setHearts(all => [...all.filter(h => h.start + 3 > now), { key: ++keyRef.current, x: played.at.x, y: played.at.y, start: played.ends + 0.6 }]);
          return current.map(v => (v.key === played.maltese.key ? played.maltese : v.key === played.puppy.key ? played.puppy : v));
        }
        if (staged) {
          const s = staged;
          setScenes(all => [...all.filter(x => x.end > now), s.scene]);
          if (s.scene.kind === 'hug') setHearts(all => [...all.filter(h => h.start + 3 > now), { key: ++keyRef.current, x: s.scene.x + s.scene.dir * 32, y: s.scene.y, start: s.scene.start + 2.2 }]);
          return current.map(v => (v.key === s.maltese.key ? s.maltese : v.key === s.puppy.key ? s.puppy : v));
        }
        return current.flatMap(original => {
        let visit = original;
        if (now < visit.start + visit.duration) return [visit];
        if (visit.leaving) return [];
        const lawn = visit.lawn;
        if (lawn !== undefined && (!lawns.current.unplanted.includes(lawn) || lawns.current.taken(visit.id).includes(lawn))) return [leaveVisit(visit, now)];
        // In a pair scene: stay put until it is over (the clip shows them both meanwhile).
        if (visit.inScene && now < visit.inScene.end) {
          const at = visitPose(visit, visit.start + visit.duration);
          return [sceneHold(visit, now, { x: at.x, y: at.y }, at.dx < 0 ? -1 : 1, SCENE_SPECS[scenes.current.find(x => x.end === visit.inScene!.end)?.kind ?? 'tug'].sits)];
        }
        if (visit.inScene) visit = { ...visit, inScene: undefined };
        // The pair: whoever is not leading goes after the other and sits down beside it. After a
        // game the Maltese sits facing the puppy; after a chase the puppy sits where it caught up.
        const mateId = visit.id === 'maltese' ? 'puppy' : visit.id === 'puppy' ? 'maltese' : null;
        const friend = mateId ? current.find(v => v.id === mateId && !v.leaving) : undefined;
        const follows = friend && (visit.id === 'maltese' ? visit.play || pair.current.leader === 'puppy' : !visit.chase && pair.current.leader === 'maltese');
        if (friend && follows) {
          const end = visitPose(visit, visit.start + visit.duration), mate = visitPose(friend, now);
          const here = { x: end.x, y: end.y }, leader = { x: mate.x, y: mate.y };
          const path = !visit.play && distance(here, leader) > FOLLOW_NEAR ? pathTo(here, leader) : null;
          const aside = distance(here, leader) < APART ? asideFrom(here, leader, isGardenGroundBlocked) : null;
          return [{ ...planFollow({ visit, now, here, leader, path, random: Math.random, aside }), play: false }];
        }
        const plan = () => planNextLeg({ visit, now, network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random, lawns: lawns.current });
        // Leading the pair: a walk that does not go through the other one.
        const mate = friend ? visitPose(friend, now) : null;
        const next = mate ? clearOf([plan(), plan(), plan(), plan(), plan(), plan()], { x: mate.x, y: mate.y }) : plan();
        if (next) return [{ ...next, following: false, play: false, running: false }];
        // Off the paths (a game or a chase ended between path points): walk back onto the nearest one.
        const end = visitPose(visit, visit.start + visit.duration), here = { x: end.x, y: end.y };
        const node = WALK_NETWORK.nodes.filter(n => Math.hypot(n.x - here.x, n.y - here.y) > 4 && safeSegment(here, n, isGardenGroundBlocked))
          .sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y))[0];
        if (!node) return [visit];
        const spec = CRITTERS[visit.id], lead = visit.chase ? between2(3, 6) : 0.6;
        return [{ ...visit, path: [here, node], start: now, lead, duration: lead + Math.hypot(node.x - here.x, node.y - here.y) / spec.speed,
          speed: spec.speed, rhythm: RHYTHMS_OF(visit.id), fadeIn: false, walked: visit.walked + visitDistance(visit, visit.start + visit.duration),
          sits: Boolean(visit.chase), rising: false, chase: false, play: false, running: false, following: false }];
        });
      });
    }, 150);
    // The bluebird takes off: about half the time the puppy runs after it.
    chase.current = (to: Point) => {
      const now = clock.value, goal = belowPerch(to);
      setVisits(current => current.map(visit => {
        if (visit.id !== 'puppy' || visit.leaving || visit.held || lookPending.current || visit.fadeIn && now < visit.start + visit.lead) return visit;
        const pose = visitPose(visit, now);
        return planChase({ visit, now, path: route({ x: pose.x, y: pose.y }, goal, isGardenGroundBlocked) }) ?? visit;
      }));
    };
    const unwatch = onBirdFlight(flight => { if (Math.random() < CHASE_CHANCE) chase.current(flight.to); });
    return () => { clearTimeout(timer); clearInterval(legs); unwatch(); };
  }, [active, clock]);
  // The puppy and the Maltese answer a tap (the other pets have no wardrobe yet). A body is drawn
  // about 0.9 of its size wide and 0.7 tall, standing on its paws. The pair go together: a tap on
  // either sits both down where they are until its menu closes; a hug or a tug-of-war plays out
  // first (no tap during it).
  useEffect(() => {
    if (!pets) return;
    const update = (id: CritterId, change: (visit: Visit, now: number) => Visit) => {
      const now = clock.value;
      visitsRef.current = visitsRef.current.map(v => (v.id === id ? change(v, now) : v));
      setVisits(visitsRef.current);
    };
    pets.current = {
      petAt: (point, slop) => {
        const now = clock.value;
        for (const visit of visitsRef.current) {
          if (visit.id !== 'puppy' && visit.id !== 'maltese' || visit.leaving || visit.fadeIn && now < visit.start + visit.lead || visit.inScene && now < visit.inScene.end) continue;
          const pose = visitPose(visit, now), size = CRITTERS[visit.id].size;
          if (Math.abs(point.x - pose.x) <= size * 0.45 + slop && point.y >= pose.y - size * 0.7 - slop && point.y <= pose.y + size * 0.08 + slop)
            return { id: visit.id, x: pose.x, y: pose.y, size };
        }
        return null;
      },
      hold: () => {
        const sittable = (v: Visit, now: number) => !(v.leaving || v.fadeIn && now < v.start + v.lead || v.inScene && now < v.inScene.end);
        update('puppy', (v, now) => (sittable(v, now) ? holdVisit(v, now) : v));
        update('maltese', (v, now) => (sittable(v, now) ? holdVisit(v, now) : v));
      },
      act: (id, kind) => {
        // (The Maltese has no painted eating or patting yet: its menu shows hearts.)
        const frames = id === 'puppy' ? PUPPY_ACTIONS[shownLookRef.current]?.[kind] : undefined;
        const visit = visitsRef.current.find(v => v.id === id && v.held);
        if (!frames || !visit || reducedRef.current) return 0;
        update(id, (v, now) => ({ ...v, action: { kind, start: now } }));
        return actionSeconds(frames);
      },
      release: () => {
        update('puppy', (visit, now) => {
          const rest = PUPPY_LOOKS[shownLookRef.current].rest;
          return releaseVisit(visit, now, rest.count / REST_FPS, (rest.count - rest.rise) / REST_FPS);
        });
        update('maltese', (visit, now) => {
          const rest = MALTESE_LOOKS[shownMalteseRef.current].rest!;
          return releaseVisit(visit, now, rest.count / REST_FPS, (rest.count - rest.rise) / REST_FPS);
        });
      },
    };
    return () => { pets.current = null; };
  }, [pets, clock]);
  // Development only: window.__gardenCritters.spawn('rabbit') brings one now; .visits lists them.
  useEffect(() => {
    if (!__DEV__ || typeof window === 'undefined') return;
    (window as unknown as { __gardenCritters?: unknown }).__gardenCritters = {
      visits: () => visitsRef.current.map(visit => ({ id: visit.id, from: visit.path[0], to: visit.path.at(-1), chase: Boolean(visit.chase), sits: Boolean(visit.sits) })),
      clear: () => setVisits([]),
      // The pair: who leads for the next while ('maltese' or 'puppy'); start a game of chase as soon as they can.
      lastTry: () => lastTry.current,
      scenes: () => scenes.current,
      lead: (who: PairLeader) => { pair.current = { leader: who, until: clock.value + 120 }; },
      play: (kind?: 'chase' | 'tug' | 'hug') => { pair.current = { leader: 'maltese', until: clock.value + 120 }; forcePlay.current = true; forceKind.current = kind ?? null; },
      // Where each visitor is now (world units).
      poses: () => visitsRef.current.map(visit => { const pose = visitPose(visit, clock.value); return { id: visit.id, x: Math.round(pose.x), y: Math.round(pose.y), sits: Boolean(visit.sits), opacity: Math.round(pose.opacity * 100) / 100, leaving: Boolean(visit.leaving), held: Boolean(visit.held), left: Math.round(visit.start + visit.duration - clock.value) }; }),
      // Send the puppy after the bluebird as if it had just taken off for `to`.
      chase: (to: Point) => chase.current(to),
      // Dress the puppy as if its outfit were `to` ('bare', 'hat', 'cape-hat' …; undefined: back
      // to what the server says).
      dress: (to?: PuppyLook) => setDressed(to),
      unplanted: () => lawns.current.unplanted, lawnOf: (id: CritterId) => visitsRef.current.find(v => v.id === id)?.lawn,
      spawn: (id: CritterId) => {
        if (id === 'maltese') {
          const friend = planFriendVisit({ key: ++keyRef.current, now: clock.value, active: visitsRef.current, network: WALK_NETWORK, edges: EDGES, random: Math.random });
          if (friend) setVisits(current => [...current, friend]);
          return !!friend;
        }
        for (let attempt = 0; attempt < 40; attempt++) {
          const visit = planVisit({ key: ++keyRef.current, now: clock.value, active: [], network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random, lawns: lawns.current });
          if (visit?.id === id) {
            setVisits(current => [...current, visit]);
            return true;
          }
        }
        return false;
      },
    };
  }, [clock]);
  return <>
    {visits.map(visit => <Critter key={visit.key} visit={visit} clock={clock} look={shownLook} malteseLook={shownMaltese} />)}
    {sceneList.map(scene => <PairSceneClip key={scene.key} scene={scene} clock={clock} />)}
    {hearts.map(heart => <PlayHearts key={heart.key} x={heart.x} y={heart.y} start={heart.start} clock={clock} />)}
  </>;
});

export function Critter({ visit, clock, zoom = 1, look = 'bare', malteseLook }: { visit: Visit; clock: SharedValue<number>; zoom?: number; look?: PuppyLook; malteseLook?: MalteseLook }) {
  const art = ART[visit.id];
  const image = useImage(visit.id === 'puppy' || visit.id === 'maltese' ? null : art.source);
  if (visit.id === 'puppy') return <Group transform={zoom === 1 ? undefined : [{ scale: zoom }]}><Puppy visit={visit} clock={clock} look={look} /></Group>;
  // The Maltese dresses like its friend (malteseLookOf).
  if (visit.id === 'maltese') return <Group transform={zoom === 1 ? undefined : [{ scale: zoom }]}>
    <Maltese visit={visit} clock={clock} look={malteseLook ?? malteseLookOf(look)} /></Group>;
  if (!image) return null;
  return <Group transform={zoom === 1 ? undefined : [{ scale: zoom }]}>
    {art.frames && CRITTERS[visit.id].kind === 'walker' ? <FrameWalker visit={visit} clock={clock} sheet={image} frames={art.frames} w={art.w} h={art.h} />
      : <Flyer visit={visit} clock={clock} image={image} />}
  </Group>;
}

// The Maltese in its look, changed like the puppy's: the old look stays whole until the new one's
// sheets are in, then fades off it (only those two looks' sheets are loaded); never mid-run: a new
// look waits until its run has ended. Hat and necklace looks share the bare clip's frames, so they
// are in step; the petal look is its own clip and simply crossfades.
type MalteseShown = { look: MalteseLook; from?: MalteseLook; ready: boolean; at: number };
function Maltese({ visit, clock, look }: { visit: Visit; clock: SharedValue<number>; look: MalteseLook }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<MalteseShown>({ look, ready: false, at: 0 });
  const visitRef = useRef(visit); visitRef.current = visit;
  useEffect(() => {
    if (look === shown.look) return;
    const running = () => { const v = visitRef.current; return !!(v.chase || v.running) && clock.value < v.start + v.duration; };
    let timer = setTimeout(function wear() {
      if (running()) { timer = setTimeout(wear, 300); return; }
      setShown(current => {
        if (current.look === look) return current;
        // Back to the look still showing before the new one was in: it simply stays.
        if (look === current.from && !current.ready) return { look, ready: true, at: 0 };
        return { look, from: current.ready ? current.look : current.from, ready: false, at: Infinity };
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [look, shown.look, clock]);
  const ready = useCallback(() => setShown(current => (current.ready ? current : { ...current, ready: true, at: clock.value })), [clock]);
  useEffect(() => {
    if (shown.from === undefined || !shown.ready) return;
    const timer = setTimeout(() => setShown(current => ({ ...current, from: undefined })), (reduced ? 0 : SWITCH_SECONDS * 1000) + 100);
    return () => clearTimeout(timer);
  }, [shown, reduced]);
  const fading = shown.from !== undefined;
  const span = reduced ? 1e-3 : SWITCH_SECONDS;
  const fadeOut = useDerivedValue(() => (fading ? Math.min(1, Math.max(0, 1 - (clock.value - shown.at) / span)) : 0), [fading, shown.at, span]);
  return <>
    <MalteseLookWalker key={shown.look} visit={visit} clock={clock} look={shown.look} onReady={ready} />
    {fading ? <MalteseLookWalker key={shown.from} visit={visit} clock={clock} look={shown.from!} fade={fadeOut} /> : null}
  </>;
}

function MalteseLookWalker({ visit, clock, look, fade, onReady }: { visit: Visit; clock: SharedValue<number>; look: MalteseLook; fade?: DerivedValue<number>; onReady?: () => void }) {
  const sheet = useImage(MALTESE_LOOKS[look].source);
  if (!sheet) return null;
  return <FrameWalker visit={visit} clock={clock} sheet={sheet} frames={MALTESE_LOOKS[look]} w={ART.maltese.w} h={ART.maltese.h} fade={fade} onReady={onReady} />;
}

// The puppy in its outfit. A new outfit simply goes on: the old look fades off the new one in a
// moment. Looks on the same walking clip are in step already; a change to the other clip
// (cape on or off) starts it at the frame whose legs match the ones showing (`phase`, a fraction
// of its stride added to the ground covered), so the step carries on instead of jumping.
// Each look is drawn by its own walker (keyed by the look), so a look's grid is never laid over
// another look's sheet; the old look stays whole until the new one's sheets are in, then fades.
const SWITCH_SECONDS = 0.25;
const frac = (x: number) => x - Math.floor(x);
type Shown = { look: PuppyLook; phase: number; from?: PuppyLook; fromPhase: number; ready: boolean; at: number };
function Puppy({ visit, clock, look }: { visit: Visit; clock: SharedValue<number>; look: PuppyLook }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<Shown>({ look, phase: 0, fromPhase: 0, ready: false, at: 0 });
  useEffect(() => {
    if (look === shown.look) return;
    // Back to the look still showing before the new one was in: it simply stays.
    if (look === shown.from && !shown.ready) { setShown({ look, phase: shown.fromPhase, fromPhase: 0, ready: true, at: 0 }); return; }
    const now = clock.value, along = visit.walked + visitDistance(visit, now);
    const was = PUPPY_LOOKS[shown.look], next = PUPPY_LOOKS[look];
    const frame = Math.floor(frac(along / was.loop + shown.phase) * was.count) % was.count;
    const phase = was.clip === next.clip ? shown.phase : frac((MATCHING_FRAME[was.clip][next.clip]![frame] + 0.5) / next.count - along / next.loop);
    // What shows now goes on showing: the current look once its sheets are in, else the one it
    // was replacing.
    const from = shown.ready ? shown.look : shown.from, fromPhase = shown.ready ? shown.phase : shown.fromPhase;
    setShown({ look, phase, from, fromPhase, ready: false, at: Infinity });
  }, [look, shown, clock, visit]);
  const ready = useCallback(() => setShown(current => (current.ready ? current : { ...current, ready: true, at: clock.value })), [clock]);
  useEffect(() => {
    if (shown.from === undefined || !shown.ready) return;
    const timer = setTimeout(() => setShown(current => ({ ...current, from: undefined })), (reduced ? 0 : SWITCH_SECONDS * 1000) + 100);
    return () => clearTimeout(timer);
  }, [shown, reduced]);
  const fading = shown.from !== undefined;
  const span = reduced ? 1e-3 : SWITCH_SECONDS;
  const fadeOut = useDerivedValue(() => (fading ? Math.min(1, Math.max(0, 1 - (clock.value - shown.at) / span)) : 0), [fading, shown.at, span]);
  return <>
    {/* Keyed by look alone: a look going from shown to fading keeps its walker and its loaded sheets. */}
    <PuppyLookWalker key={shown.look} visit={visit} clock={clock} look={shown.look} phase={shown.phase} onReady={ready} />
    {fading ? <PuppyLookWalker key={shown.from} visit={visit} clock={clock} look={shown.from!} phase={shown.fromPhase} fade={fadeOut} /> : null}
  </>;
}

function PuppyLookWalker({ visit, clock, look, phase, fade, onReady }: { visit: Visit; clock: SharedValue<number>; look: PuppyLook; phase: number; fade?: DerivedValue<number>; onReady?: () => void }) {
  const sheet = useImage(PUPPY_LOOKS[look].source);
  if (!sheet) return null;
  return <FrameWalker visit={visit} clock={clock} sheet={sheet} frames={PUPPY_LOOKS[look]} w={ART.puppy.w} h={ART.puppy.h} phase={phase} fade={fade} onReady={onReady}
    actions={PUPPY_ACTIONS[look]} />;
}

// A walker in painted frames: which frame shows is set by how far it has come (over all its legs),
// so each stride covers the same ground however the pace changes; standing still, it holds its
// frame and carries on from it.
// `phase`: a fraction of the stride to start the walk from; `fade`: drawn fading out over another
// look (no shadow of its own then); `onReady`: told once all its sheets are in.
function FrameWalker({ visit, clock, sheet, frames, w, h, phase = 0, fade, onReady, actions }: { visit: Visit; clock: SharedValue<number>; sheet: SkImage; frames: Frames; w: number; h: number; phase?: number; fade?: DerivedValue<number>; onReady?: () => void; actions?: Record<PuppyAction, ActionFrames> }) {
  const spec = CRITTERS[visit.id];
  const reduced = useReducedMotion();
  const scale = spec.size / Math.max(w, h);
  // (Hidden while the pair's scene clip shows them both.)
  const opacity = useDerivedValue(() => visitPose(visit, clock.value).opacity * (fade ? fade.value : 1) * (1 - sceneShown(visit.inScene, clock.value)), [visit, fade]);
  const transform = useDerivedValue(() => {
    const pose = visitPose(visit, clock.value);
    return [{ translateX: pose.x }, { translateY: pose.y }, { scaleX: (pose.dx < 0 ? -1 : 1) * scale }, { scaleY: scale },
      { translateX: -w / 2 }, { translateY: -frames.ground }];
  }, [visit, scale, w, frames]);
  const running = Boolean((visit.chase || visit.running) && frames.run);
  const stride = running ? frames.run! : frames;
  const frame = useDerivedValue(() => {
    const along = reduced ? 0 : (visit.walked + visitDistance(visit, clock.value)) / stride.loop + (running ? 0 : phase);
    return Math.floor((along - Math.floor(along)) * stride.count) % stride.count;
  }, [visit, stride, reduced, running, phase]);
  const runSheet = useImage(frames.run?.source ?? null);
  // Resting between legs (with a rest sheet): settling down, sitting, then getting up again; or,
  // getting up only (`rising`, before a chase).
  const restSheet = useImage(frames.rest?.source ?? null);
  const loaded = (!frames.run || !!runSheet) && (!frames.rest || !!restSheet);
  useEffect(() => { if (loaded) onReady?.(); }, [loaded, onReady]);
  const restFrame = useDerivedValue(() => {
    const rest = frames.rest, e = clock.value - visit.start;
    if (!rest || visit.fadeIn || e < 0 || e >= visit.lead) return -1;
    if (visit.rising) return Math.max(rest.rise, rest.count - 1 - Math.floor(e / visit.lead * (rest.count - rest.rise)));
    if (!rest.always && !visit.sits) return -1;
    if (reduced) return rest.count - 1;
    const settle = rest.count / REST_FPS, rise = (rest.count - rest.rise) / REST_FPS;
    if (e < settle) return Math.floor(e * REST_FPS);
    if (e > visit.lead - rise) return Math.max(rest.rise, rest.count - 1 - Math.floor((e - (visit.lead - rise)) * REST_FPS));
    return rest.count - 1;
  }, [visit, frames, reduced]);
  // Eating or being patted (held, sitting): its clip over the sitting frame, fading in and out
  // over ACTION_FADE (its first and last frames are the sitting pose; the bowl comes and goes).
  const actionShown = useDerivedValue(() => {
    const action = visit.action, spec = action && actions?.[action.kind];
    if (!action || !spec) return 0;
    const e = clock.value - action.start, length = spec.count / ACTION_FPS;
    if (e < 0 || e >= length) return 0;
    return Math.min(1, e / ACTION_FADE, (length - e) / ACTION_FADE);
  }, [visit, actions]);
  const walkOpacity = useDerivedValue(() => (restFrame.value < 0 ? 1 : 0), [restFrame]);
  const restOpacity = useDerivedValue(() => (restFrame.value < 0 ? 0 : 1 - actionShown.value), [restFrame, actionShown]);
  const restCell = useDerivedValue(() => Math.max(0, restFrame.value), [restFrame]);
  const shadow = useDerivedValue(() => {
    const pose = visitPose(visit, clock.value);
    return [{ translateX: pose.x }, { translateY: pose.y }];
  }, [visit]);
  return <Group opacity={opacity}>
    {fade ? null : <Group transform={shadow}>
      <Oval x={-spec.size * 0.4} y={-spec.size * 0.06} width={spec.size * 0.8} height={spec.size * 0.12} color="rgba(30, 44, 26, 0.22)">
        <BlurMask blur={3} style="normal" />
      </Oval>
    </Group>}
    {frames.trail ? <PetalTrail visit={visit} clock={clock} source={frames.trail} reduced={!!reduced} /> : null}
    <Group transform={transform}>
      <Group opacity={walkOpacity}>{running && runSheet
        ? (frames.run!.cell ? <Group transform={[{ translateX: frames.run!.cell.x }, { translateY: frames.run!.cell.y }, { scale: 0.9986 }]}>
            <SheetFrame sheet={runSheet} frame={frame} columns={frames.run!.columns} count={frames.run!.count} w={374} h={237} /></Group>
          : <SheetFrame sheet={runSheet} frame={frame} columns={frames.run!.columns} count={frames.run!.count} w={w} h={h} />)
        : <SheetFrame sheet={sheet} frame={frame} columns={frames.columns} count={frames.count} w={w} h={h} />}</Group>
      {restSheet && frames.rest ? <Group opacity={restOpacity}><SheetFrame sheet={restSheet} frame={restCell} columns={frames.columns} count={frames.rest.count} w={w} h={h} /></Group> : null}
      {actions ? (['eat', 'pat'] as const).map(kind => <ActionClip key={kind} kind={kind} spec={actions[kind]} visit={visit} clock={clock} shown={actionShown} w={w} ground={frames.ground} />) : null}
    </Group>
  </Group>;
}

// A way on foot from `from` (anywhere, maybe between path points) to `to`: straight when nothing
// is in the way, else along the paths from the nearest path point it can step to.
const between2 = (a: number, b: number) => a + (b - a) * Math.random();
const RHYTHMS_OF = (id: CritterId) => RHYTHMS[id];
function pathTo(from: Point, to: Point): Point[] | null {
  if (safeSegment(from, to, isGardenGroundBlocked)) return [from, to];
  const direct = route(from, to, isGardenGroundBlocked);
  if (direct) return direct;
  const steps = WALK_NETWORK.nodes.filter(n => safeSegment(from, n, isGardenGroundBlocked))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y)).slice(0, 3);
  for (const n of steps) {
    const rest = route(n, to, isGardenGroundBlocked);
    if (rest) return [from, ...rest];
  }
  return null;
}

// Where the Maltese dashes off to in a game: a path point some way off (but not too far), so the
// puppy has a short run after it.
function dashGoal(from: Point, away: Point, random: () => number) {
  // Away from the puppy (on the far side of the Maltese), so the run never goes through it.
  const side = Math.sign(from.x - away.x) || 1;
  const spots = POINTS.filter(p => { const d = Math.hypot(p.x - from.x, p.y - from.y); return d >= 140 && d <= 320 && (p.x - from.x) * side > 40; });
  return spots.length ? spots[Math.floor(random() * spots.length)] : null;
}

// Three small hearts rising over the pair after a game (world units, above where they sat down).
const HEART = Skia.Path.MakeFromSVGString('M0 3 C0 -1 -6 -1 -6 3 C-6 6 -2 8 0 10 C2 8 6 6 6 3 C6 -1 0 -1 0 3 Z')!;
function PlayHearts({ x, y, start, clock }: { x: number; y: number; start: number; clock: SharedValue<number> }) {
  return <>{[[-14, 0, 1.1], [4, -10, 1.4], [18, -2, 0.9]].map(([dx, dy, k], i) => <Heart key={i} x={x + dx} y={y - 70 + dy} k={k} start={start + i * 0.25} clock={clock} color={i === 1 ? '#F38FB3' : '#F7A8C4'} />)}</>;
}
function Heart({ x, y, k, start, clock, color }: { x: number; y: number; k: number; start: number; clock: SharedValue<number>; color: string }) {
  const opacity = useDerivedValue(() => { const t = (clock.value - start) / 1.6; return t < 0 || t > 1 ? 0 : Math.min(1, t * 5, (1 - t) * 2.5); }, [start]);
  const transform = useDerivedValue(() => { const t = Math.max(0, Math.min(1, (clock.value - start) / 1.6)); return [{ translateX: x }, { translateY: y - t * 30 }, { scale: k }]; }, [x, y, k, start]);
  return <Group opacity={opacity} transform={transform}><Path path={HEART} color={color} /></Group>;
}

// The pair scenes: one painted clip of both (oil-motion, ~/dev/petalpal-motion/maltese/pair), drawn
// so the golden puppy's paws land where the puppy stands (`anchor`, its centre and ground row in a
// cell) and scaled to the Garden (`k`, world units per cell pixel); the Maltese is then `apart`
// beside it (SCENE_SPECS), where it walked up to. Mirrored when the Maltese is on its left.
const PAIR_SCENES: Record<SceneKind, { source: number; columns: number; count: number; w: number; h: number; anchor: [number, number]; k: number }> = {
  tug: { source: require('@/assets/garden/critters/pair-tug.webp'), columns: 6, count: 71, w: 564, h: 200, anchor: [153.1, 193.8], k: 0.342 },
  hug: { source: require('@/assets/garden/critters/pair-hug.webp'), columns: 8, count: 71, w: 428, h: 220, anchor: [124, 211.8], k: 0.3072 },
};
const SCENE_FPS = 12;
export function PairSceneClip({ scene, clock }: { scene: Scene; clock: SharedValue<number> }) {
  const spec = PAIR_SCENES[scene.kind];
  const sheet = useImage(spec.source);
  const frame = useDerivedValue(() => Math.max(0, Math.min(spec.count - 1, Math.floor((clock.value - scene.start) * SCENE_FPS))), [scene, spec]);
  const opacity = useDerivedValue(() => sceneShown(scene, clock.value), [scene]);
  const transform = useMemo(() => [{ translateX: scene.x }, { translateY: scene.y }, { scaleX: scene.dir * spec.k }, { scaleY: spec.k },
    { translateX: -spec.anchor[0] }, { translateY: -spec.anchor[1] }], [scene, spec]);
  if (!sheet) return null;
  return <Group opacity={opacity} transform={transform}><SheetFrame sheet={sheet} frame={frame} columns={spec.columns} count={spec.count} w={spec.w} h={spec.h} /></Group>;
}

const ACTION_FADE = 0.2;
// One painted action clip, placed so its puppy lies on the walker's (its centre and paws on the
// walker's cell centre and ground row); drawn only while that action plays.
function ActionClip({ kind, spec, visit, clock, shown, w, ground }: { kind: PuppyAction; spec: ActionFrames; visit: Visit; clock: SharedValue<number>; shown: DerivedValue<number>; w: number; ground: number }) {
  const playing = visit.action?.kind === kind;
  // Loaded once the ring menu is open (the puppy held), so the clip is in when Feed or Pat is chosen.
  const sheet = useImage(visit.held ? spec.source : null);
  const frame = useDerivedValue(() => {
    const start = visit.action?.start ?? 0;
    return Math.max(0, Math.min(spec.count - 1, Math.floor((clock.value - start) * ACTION_FPS)));
  }, [visit, spec]);
  const opacity = useDerivedValue(() => (playing ? shown.value : 0), [playing, shown]);
  if (!playing || !sheet) return null;
  return <Group opacity={opacity} transform={[{ translateX: w / 2 - spec.anchorX }, { translateY: ground - spec.ground }]}>
    <SheetFrame sheet={sheet} frame={frame} columns={spec.columns} count={spec.count} w={spec.w} h={spec.h} />
  </Group>;
}

// Petals shed behind a running spirit: one every SPACING units of ground it covers, each let go at
// its tail and drifting down and back as it fades. Each petal's age comes from when the runner
// passed that spot (its pace is steady), so petals keep drifting and fading after it stops.
const PETALS = 18, SPACING = 20, PETAL_LIFE = 1.8, PETAL_SIZE = 15;
function PetalTrail({ visit, clock, source, reduced }: { visit: Visit; clock: SharedValue<number>; source: number; reduced: boolean }) {
  const petal = useImage(source);
  if (!petal || reduced) return null;
  return <>{Array.from({ length: PETALS }, (_, i) => <Petal key={i} index={i} visit={visit} clock={clock} petal={petal} />)}</>;
}

function Petal({ index, visit, clock, petal }: { index: number; visit: Visit; clock: SharedValue<number>; petal: SkImage }) {
  const size = CRITTERS[visit.id].size;
  const state = useDerivedValue(() => {
    const now = clock.value, moved = visitDistance(visit, now);
    const at = (Math.floor(moved / SPACING) - index) * SPACING;
    const age = now - (visit.start + visit.lead + at / visit.speed);
    if (at < 0 || age < 0 || age > PETAL_LIFE) return { x: 0, y: 0, o: 0, r: 0 };
    const p = pointAlong(visit.path, at), back = p.dx < 0 ? 1 : -1;
    // Let go from the tail (behind and a little up), then drift back, down and sideways.
    const x = p.x + back * (size * 0.42 + age * 16) + Math.sin(age * 4 + index) * 5;
    const y = p.y - size * 0.32 + age * age * 14 + age * 8;
    const o = Math.min(1, age / 0.15) * (1 - age / PETAL_LIFE);
    return { x, y, o, r: age * 2.2 + index * 0.9 };
  }, [visit, index, size]);
  const opacity = useDerivedValue(() => state.value.o, [state]);
  const transform = useDerivedValue(() => [{ translateX: state.value.x }, { translateY: state.value.y }, { rotate: state.value.r },
    { translateX: -PETAL_SIZE / 2 }, { translateY: -PETAL_SIZE / 2 }], [state]);
  return <Group opacity={opacity} transform={transform}>
    <Image image={petal} x={0} y={0} width={PETAL_SIZE} height={PETAL_SIZE} fit="fill" />
  </Group>;
}

function Flyer({ visit, clock, image }: { visit: Visit; clock: SharedValue<number>; image: SkImage }) {
  const art = ART[visit.id], spec = CRITTERS[visit.id];
  const reduced = useReducedMotion();
  const scale = spec.size / Math.max(art.w, art.h);
  const opacity = useDerivedValue(() => visitPose(visit, clock.value).opacity, [visit]);
  const transform = useDerivedValue(() => {
    const t = clock.value, pose = visitPose(visit, t);
    let x = pose.x, y = pose.y, rotate = 0, sx = scale;
    if (visit.id === 'butterfly') {
      // Seen from above: turn to the heading (the body points up in the painting); the wings
      // open and close and the flight drifts a little side to side.
      rotate = Math.atan2(pose.dy, pose.dx) + Math.PI / 2;
      sx *= reduced ? 1 : 0.28 + 0.72 * Math.abs(Math.cos(t * Math.PI / 0.24));
      x += Math.sin(t * 2.3) * 9; y += Math.cos(t * 1.7) * 6;
    } else {
      // Side view, painted facing right: face the way it goes, tilted a little to climb or dive.
      // The painted wingbeats carry their own lift and fall.
      const facing = pose.dx < 0 ? -1 : 1;
      sx *= facing;
      rotate = Math.max(-0.25, Math.min(0.25, Math.atan2(pose.dy, Math.abs(pose.dx)) * 0.5)) * facing;
    }
    return [{ translateX: x }, { translateY: y }, { rotate }, { scaleX: sx }, { scaleY: scale },
      { translateX: -art.w / 2 }, { translateY: -art.h / 2 }];
  }, [visit, scale, reduced]);
  const frames = art.frames;
  const frame = useDerivedValue(() => (frames?.fps && !reduced ? Math.floor(clock.value * frames.fps) % frames.count : 0), [frames, reduced]);
  return <Group opacity={opacity}>
    <Group transform={transform}>
      {frames ? <SheetFrame sheet={image} frame={frame} columns={frames.columns} count={frames.count} w={art.w} h={art.h} />
        : <Image image={image} x={0} y={0} width={art.w} height={art.h} fit="fill" />}
    </Group>
  </Group>;
}

