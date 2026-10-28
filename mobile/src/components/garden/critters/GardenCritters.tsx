import { BlurMask, Group, Image, ImageShader, Oval, Rect, Shader, useImage, type SkImage } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useDerivedValue, useReducedMotion, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import { isGardenGroundBlocked } from '../fairy/gardenGround';
import { safeSegment, WALK_NETWORK } from '../fairy/walkNetwork';
import { wingbeat, wingbeatEffect } from '../wingbeat';
import {
  burstPhase, CRITTERS, nextGap, planVisit, visitPose, walkableEdges, type CritterId, type Visit,
} from './critterVisits';

// Painted visitors (one painting each); all motion is drawn from the Garden clock, so no React
// renders happen while they move. Art: assets/garden/critters, painting size in pixels.
const ART: Record<CritterId, { source: number; w: number; h: number }> = {
  butterfly: { source: require('@/assets/garden/critters/butterfly.webp'), w: 448, h: 373 },
  dragonfly: { source: require('@/assets/garden/critters/dragonfly.webp'), w: 448, h: 390 },
  bluebird: { source: require('@/assets/garden/critters/bluebird.webp'), w: 448, h: 446 },
  rabbit: { source: require('@/assets/garden/critters/rabbit.webp'), w: 448, h: 425 },
  hedgehog: { source: require('@/assets/garden/critters/hedgehog.webp'), w: 448, h: 411 },
};

const EDGES = walkableEdges(WALK_NETWORK, isGardenGroundBlocked, (a, b) => safeSegment(a, b, isGardenGroundBlocked));
const POINTS = WALK_NETWORK.nodes.filter(node => !isGardenGroundBlocked(node));

// Schedules the visits: one now and then, at most two at once, only while the Garden is active.
export default memo(function GardenCritters({ clock, active }: { clock: SharedValue<number>; active: boolean }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const keyRef = useRef(0);
  const visitsRef = useRef(visits); visitsRef.current = visits;
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const arrive = () => {
      const visit = planVisit({ key: ++keyRef.current, now: clock.value, active: visitsRef.current,
        network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random });
      if (visit) {
        setVisits(current => [...current, visit]);
        setTimeout(() => setVisits(current => current.filter(item => item.key !== visit.key)), (visit.duration + 0.5) * 1000);
      }
      timer = setTimeout(arrive, nextGap(Math.random) * 1000);
    };
    // The first visitor comes a few seconds after the Garden opens.
    timer = setTimeout(arrive, 4000 + Math.random() * 6000);
    return () => clearTimeout(timer);
  }, [active, clock]);
  // Development only: window.__gardenCritters.spawn('rabbit') brings one now; .visits lists them.
  useEffect(() => {
    if (!__DEV__ || typeof window === 'undefined') return;
    (window as unknown as { __gardenCritters?: unknown }).__gardenCritters = {
      visits: () => visitsRef.current.map(visit => ({ id: visit.id, from: visit.path[0], to: visit.path.at(-1) })),
      spawn: (id: CritterId) => {
        for (let attempt = 0; attempt < 40; attempt++) {
          const visit = planVisit({ key: ++keyRef.current, now: clock.value, active: [], network: WALK_NETWORK, edges: EDGES, points: POINTS, random: Math.random });
          if (visit?.id === id) {
            setVisits(current => [...current, visit]);
            setTimeout(() => setVisits(current => current.filter(item => item.key !== visit.key)), (visit.duration + 0.5) * 1000);
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
  const art = ART[visit.id], spec = CRITTERS[visit.id];
  const image = useImage(art.source);
  const reduced = useReducedMotion();
  const scale = spec.size / Math.max(art.w, art.h);
  const flying = spec.kind === 'flyer';
  const topDown = visit.id === 'butterfly' || visit.id === 'dragonfly';
  const opacity = useDerivedValue(() => visitPose(visit, clock.value).opacity, [visit]);
  const transform = useDerivedValue(() => {
    const t = clock.value, pose = visitPose(visit, t), phase = burstPhase(visit, t);
    let x = pose.x, y = pose.y, rotate = 0, sx = scale, sy = scale;
    if (topDown) {
      // Seen from above: turn to the heading (the body points up in the painting).
      rotate = Math.atan2(pose.dy, pose.dx) + Math.PI / 2;
      if (visit.id === 'butterfly') {
        // Wings open and close; the flight drifts a little side to side.
        sx *= reduced ? 1 : 0.28 + 0.72 * Math.abs(Math.cos(t * Math.PI / 0.24));
        x += Math.sin(t * 2.3) * 9; y += Math.cos(t * 1.7) * 6;
      } else {
        sx *= reduced ? 1 : 0.9 + 0.1 * Math.abs(Math.sin(t * 38));
        y += Math.sin(t * 5) * 1.5;
      }
    } else {
      // Side view, painted facing right: face the way it goes.
      const facing = pose.dx < 0 ? -1 : 1;
      sx *= facing;
      if (visit.id === 'bluebird') {
        y += Math.sin(t * Math.PI * 2 / 0.3) * 2;
        rotate = Math.max(-0.25, Math.min(0.25, Math.atan2(pose.dy, Math.abs(pose.dx)) * 0.5)) * facing;
      } else if (visit.id === 'rabbit' && !reduced) {
        // A hop: up and down along each burst, stretched in the air, squashed on landing.
        const lift = Math.sin(Math.PI * phase);
        y -= lift * 16;
        sy *= 1 + 0.06 * lift; sx *= 1 - 0.04 * lift;
      } else if (visit.id === 'hedgehog' && !reduced && phase > 0) {
        rotate = Math.sin(t * Math.PI * 2 * 2.2) * 0.05;
        y -= Math.abs(Math.sin(t * Math.PI * 2 * 2.2)) * 1.2;
      }
    }
    // Ground creatures stand on the point (feet at the bottom); flyers are centred on it.
    const anchorY = flying ? art.h / 2 : art.h * 0.94;
    return [{ translateX: x }, { translateY: y }, { rotate }, { scaleX: sx }, { scaleY: sy },
      { translateX: -art.w / 2 }, { translateY: -anchorY }];
  }, [visit, scale, reduced, topDown, flying]);
  const shadow = useDerivedValue(() => {
    const pose = visitPose(visit, clock.value), phase = burstPhase(visit, clock.value);
    const lift = visit.id === 'rabbit' ? Math.sin(Math.PI * phase) : 0;
    return [{ translateX: pose.x }, { translateY: pose.y }, { scaleX: 1 - lift * 0.3 }, { scaleY: 1 - lift * 0.3 }];
  }, [visit]);
  // The bluebird's wing roots (a–b) and head in its painting (wingbeat.ts); literal so the
  // worklet carries them.
  const uniforms = useDerivedValue(() => ({ flap: reduced ? 0 : wingbeat(clock.value, 0.3), a: [190, 207], b: [323, 163], head: [308, 140, 56] }), [reduced]);
  if (!image) return null;
  return <Group opacity={opacity} transform={zoom === 1 ? undefined : [{ scale: zoom }]}>
    {!flying ? <Group transform={shadow}>
      <Oval x={-spec.size * 0.38} y={-spec.size * 0.08} width={spec.size * 0.76} height={spec.size * 0.16} color="rgba(30, 44, 26, 0.22)">
        <BlurMask blur={3} style="normal" />
      </Oval>
    </Group> : null}
    <Group transform={transform}>
      {visit.id === 'bluebird' && wingbeatEffect ? <BirdWithWingbeat image={image} w={art.w} h={art.h} uniforms={uniforms} />
        : <Image image={image} x={0} y={0} width={art.w} height={art.h} fit="fill" />}
    </Group>
  </Group>;
}

function BirdWithWingbeat({ image, w, h, uniforms }: { image: SkImage; w: number; h: number; uniforms: DerivedValue<{ flap: number; a: number[]; b: number[]; head: number[] }> }) {
  const rect = useMemo(() => ({ x: 0, y: 0, width: w, height: h }), [w, h]);
  return <Rect x={0} y={0} width={w} height={h}>
    <Shader source={wingbeatEffect!} uniforms={uniforms as never}>
      <ImageShader image={image} rect={rect} fit="fill" tx="decal" ty="decal" />
    </Shader>
  </Rect>;
}
