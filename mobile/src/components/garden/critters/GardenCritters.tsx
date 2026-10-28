import { BlurMask, Group, Image, Oval, useImage, type SkImage } from '@shopify/react-native-skia';
import { memo, useEffect, useRef, useState } from 'react';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { isGardenGroundBlocked } from '../fairy/gardenGround';
import { safeSegment, WALK_NETWORK } from '../fairy/walkNetwork';
import SheetFrame from '../SheetFrame';
import {
  AWAY_SECONDS, burstLength, CRITTERS, nextGap, planNextLeg, planVisit, visitDistance, visitPose, walkableEdges, type CritterId, type Visit,
} from './critterVisits';

// Painted visitors (one painting each); all motion is drawn from the Garden clock, so no React
// renders happen while they move. Art: assets/garden/critters, painting size in pixels. The
// walkers and the bluebird move in painted frames; the butterfly is a single painting.
// A painted motion: frames in a grid (scripts/critters/video-frames.py), `w` × `h` each. A
// walk: `ground` the row the paws stand on, `loop` the world units walked over all its frames.
// A flight: `fps`, played in time. `rest`: frames of settling down (same cells), played while it
// rests between legs, and backwards to get up again.
type Frames = { columns: number; count: number; ground: number; loop: number; fps?: number; rest?: { source: number; count: number } };
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
  hedgehog: { source: require('@/assets/garden/critters/hedgehog-walk.webp'), frames: { columns: 5, count: 13, ground: 277, loop: 30.2 }, w: 344, h: 280 },
  puppy: { source: require('@/assets/garden/critters/puppy-walk.webp'), frames: { columns: 6, count: 17, ground: 297, loop: 41.9 }, w: 420, h: 300 },
  // The Silktail Fox spirit: a generated walking clip (several strides), and between legs it sits
  // down to rest (a generated settling clip) and gets up again.
  silktail: { source: require('@/assets/garden/spirits/silktail-walk.webp'), w: 237, h: 180,
    frames: { columns: 8, count: 62, ground: 176, loop: 131.8, rest: { source: require('@/assets/garden/spirits/silktail-rest.webp'), count: 41 } } },
};
const REST_FPS = 12;
const EDGES = walkableEdges(WALK_NETWORK, isGardenGroundBlocked, (a, b) => safeSegment(a, b, isGardenGroundBlocked));
const POINTS = WALK_NETWORK.nodes.filter(node => !isGardenGroundBlocked(node));

// Schedules the visitors: one now and then until two are here, only while the Garden is active.
// They stay, setting off again whenever a leg ends; after AWAY_SECONDS away they have gone.
export default memo(function GardenCritters({ clock, active }: { clock: SharedValue<number>; active: boolean }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const keyRef = useRef(0);
  const visitsRef = useRef(visits); visitsRef.current = visits;
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    if (!active) { awaySince.current = Date.now(); return; }
    const left = awaySince.current !== null && Date.now() - awaySince.current >= AWAY_SECONDS * 1000;
    awaySince.current = null;
    if (left) { visitsRef.current = []; setVisits([]); }
    let timer: ReturnType<typeof setTimeout>;
    const arrive = () => {
      const visit = planVisit({ key: ++keyRef.current, now: clock.value, active: visitsRef.current,
        network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random });
      if (visit) setVisits(current => [...current, visit]);
      timer = setTimeout(arrive, nextGap(Math.random) * 1000);
    };
    // The first visitor comes a few seconds after the Garden opens.
    timer = setTimeout(arrive, visitsRef.current.length ? nextGap(Math.random) * 1000 : 4000 + Math.random() * 6000);
    // A visitor whose leg is over rests and sets off again (checked often, so the bluebird,
    // which does not rest, flies straight on).
    const legs = setInterval(() => {
      const now = clock.value;
      if (!visitsRef.current.some(visit => now >= visit.start + visit.duration)) return;
      setVisits(current => current.map(visit => (now < visit.start + visit.duration ? visit
        : planNextLeg({ visit, now, network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random }) ?? visit)));
    }, 150);
    return () => { clearTimeout(timer); clearInterval(legs); };
  }, [active, clock]);
  // Development only: window.__gardenCritters.spawn('rabbit') brings one now; .visits lists them.
  useEffect(() => {
    if (!__DEV__ || typeof window === 'undefined') return;
    (window as unknown as { __gardenCritters?: unknown }).__gardenCritters = {
      visits: () => visitsRef.current.map(visit => ({ id: visit.id, from: visit.path[0], to: visit.path.at(-1) })),
      clear: () => setVisits([]),
      spawn: (id: CritterId) => {
        for (let attempt = 0; attempt < 40; attempt++) {
          const visit = planVisit({ key: ++keyRef.current, now: clock.value, active: [], network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random });
          if (visit?.id === id) {
            setVisits(current => [...current, visit]);
            return true;
          }
        }
        return false;
      },
    };
  }, [clock]);
  return <>{visits.map(visit => <Critter key={visit.key} visit={visit} clock={clock} />)}</>;
});

export function Critter({ visit, clock, zoom = 1 }: { visit: Visit; clock: SharedValue<number>; zoom?: number }) {
  const art = ART[visit.id];
  const image = useImage(art.source);
  if (!image) return null;
  return <Group transform={zoom === 1 ? undefined : [{ scale: zoom }]}>
    {art.frames && CRITTERS[visit.id].kind === 'walker' ? <FrameWalker visit={visit} clock={clock} sheet={image} frames={art.frames} w={art.w} h={art.h} />
      : <Flyer visit={visit} clock={clock} image={image} />}
  </Group>;
}

// A walker in painted frames: which frame shows is set by how far it has come (over all its legs),
// so each stride covers the same ground however the pace changes; standing still, it holds its
// frame and carries on from it.
function FrameWalker({ visit, clock, sheet, frames, w, h }: { visit: Visit; clock: SharedValue<number>; sheet: SkImage; frames: Frames; w: number; h: number }) {
  const spec = CRITTERS[visit.id];
  const reduced = useReducedMotion();
  const scale = spec.size / Math.max(w, h);
  const opacity = useDerivedValue(() => visitPose(visit, clock.value).opacity, [visit]);
  const transform = useDerivedValue(() => {
    const pose = visitPose(visit, clock.value);
    return [{ translateX: pose.x }, { translateY: pose.y }, { scaleX: (pose.dx < 0 ? -1 : 1) * scale }, { scaleY: scale },
      { translateX: -w / 2 }, { translateY: -frames.ground }];
  }, [visit, scale, w, frames]);
  const frame = useDerivedValue(() => {
    const along = reduced ? 0 : (visit.walked + visitDistance(visit, clock.value)) / frames.loop;
    return Math.floor((along - Math.floor(along)) * frames.count) % frames.count;
  }, [visit, frames, reduced]);
  // Resting between legs (with a rest sheet): settling down, sitting, then getting up again.
  const restSheet = useImage(frames.rest?.source ?? null);
  const restFrame = useDerivedValue(() => {
    const rest = frames.rest, e = clock.value - visit.start;
    if (!rest || visit.fadeIn || e < 0 || e >= visit.lead) return -1;
    if (reduced) return rest.count - 1;
    const settle = rest.count / REST_FPS;
    if (e < settle) return Math.floor(e * REST_FPS);
    if (e > visit.lead - settle) return Math.max(0, Math.floor((visit.lead - e) * REST_FPS));
    return rest.count - 1;
  }, [visit, frames, reduced]);
  const walkOpacity = useDerivedValue(() => (restFrame.value < 0 ? 1 : 0), [restFrame]);
  const restOpacity = useDerivedValue(() => (restFrame.value < 0 ? 0 : 1), [restFrame]);
  const restCell = useDerivedValue(() => Math.max(0, restFrame.value), [restFrame]);
  const shadow = useDerivedValue(() => {
    const pose = visitPose(visit, clock.value);
    return [{ translateX: pose.x }, { translateY: pose.y }];
  }, [visit]);
  return <Group opacity={opacity}>
    <Group transform={shadow}>
      <Oval x={-spec.size * 0.4} y={-spec.size * 0.06} width={spec.size * 0.8} height={spec.size * 0.12} color="rgba(30, 44, 26, 0.22)">
        <BlurMask blur={3} style="normal" />
      </Oval>
    </Group>
    <Group transform={transform}>
      <Group opacity={walkOpacity}><SheetFrame sheet={sheet} frame={frame} columns={frames.columns} count={frames.count} w={w} h={h} /></Group>
      {restSheet && frames.rest ? <Group opacity={restOpacity}><SheetFrame sheet={restSheet} frame={restCell} columns={frames.columns} count={frames.rest.count} w={w} h={h} /></Group> : null}
    </Group>
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

