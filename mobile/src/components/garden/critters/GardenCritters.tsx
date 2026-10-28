import { BlurMask, ColorMatrix, Group, Image, ImageShader, Oval, Rect, Shader, useImage, Vertices, type SkImage } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useDerivedValue, useReducedMotion, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import { isGardenGroundBlocked } from '../fairy/gardenGround';
import { safeSegment, WALK_NETWORK } from '../fairy/walkNetwork';
import { wingbeat, wingbeatEffect } from '../wingbeat';
import {
  CRITTERS, nextGap, planVisit, visitDistance, visitPose, walkableEdges, type CritterId, type Visit,
} from './critterVisits';
import { hedgehogPose, puppyPose, rabbitPose, WALKER_MESHES, type WalkerId } from './gaits';
import { posePoints, type Layer } from './rig';

// Painted visitors (one painting each); all motion is drawn from the Garden clock, so no React
// renders happen while they move. Art: assets/garden/critters, painting size in pixels. The
// walkers are skinned meshes on a skeleton (rig.ts, gaits.ts); the flyers are single paintings.
const ART: Record<CritterId, { source: number; legs?: number; w: number; h: number }> = {
  butterfly: { source: require('@/assets/garden/critters/butterfly.webp'), w: 448, h: 367 },
  bluebird: { source: require('@/assets/garden/critters/bluebird.webp'), w: 448, h: 448 },
  // Walkers: the body and the near legs, cut from one painting (scripts/critters/cut-parts.py).
  rabbit: { source: require('@/assets/garden/critters/rabbit-body.webp'), legs: require('@/assets/garden/critters/rabbit-legs.webp'), w: 512, h: 491 },
  hedgehog: { source: require('@/assets/garden/critters/hedgehog-body.webp'), legs: require('@/assets/garden/critters/hedgehog-legs.webp'), w: 512, h: 467 },
  puppy: { source: require('@/assets/garden/critters/puppy-body.webp'), legs: require('@/assets/garden/critters/puppy-legs.webp'), w: 512, h: 415 },
};
export const WALKER_ART = { puppy: ART.puppy, rabbit: ART.rabbit, hedgehog: ART.hedgehog };

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
  const art = ART[visit.id];
  const image = useImage(art.source), legs = useImage(art.legs ?? null);
  const walker = CRITTERS[visit.id].kind === 'walker';
  if (!image || (walker && !legs)) return null;
  return <Group transform={zoom === 1 ? undefined : [{ scale: zoom }]}>
    {walker ? <Walker visit={visit} clock={clock} body={image} legs={legs!} /> : <Flyer visit={visit} clock={clock} image={image} />}
  </Group>;
}

// A walker on its skeleton: the gait sets where each paw is, the legs bend to reach.
function Walker({ visit, clock, body, legs }: { visit: Visit; clock: SharedValue<number>; body: SkImage; legs: SkImage }) {
  const id = visit.id as WalkerId, mesh = WALKER_MESHES[id], spec = CRITTERS[visit.id];
  const reduced = useReducedMotion();
  const scale = spec.size / Math.max(mesh.w, mesh.h);
  // One hop per burst for the rabbit: its length in world units.
  const hop = visit.speed * visit.rhythm.cycle * visit.rhythm.moving;
  const layers = useDerivedValue(() => {
    const t = clock.value, here = visitDistance(visit, t);
    const pace = Math.min(1, (here - visitDistance(visit, t - 0.1)) / 0.1 / visit.speed * 1.6);
    const stepping = reduced ? 0 : pace * pace * (3 - 2 * pace), d = reduced ? 0 : here / scale;
    const pose = id === 'rabbit' ? rabbitPose(reduced ? 0 : (here / hop) % 1, hop / scale, t)
      : id === 'puppy' ? puppyPose(d, stepping, t) : hedgehogPose(d, stepping, t);
    return posePoints(mesh, pose);
  }, [visit, reduced, scale, hop]);
  const opacity = useDerivedValue(() => visitPose(visit, clock.value).opacity, [visit]);
  const transform = useDerivedValue(() => {
    const pose = visitPose(visit, clock.value);
    // Painted facing right: face the way it goes. Paws stand on the path point.
    return [{ translateX: pose.x }, { translateY: pose.y }, { scaleX: (pose.dx < 0 ? -1 : 1) * scale }, { scaleY: scale },
      { translateX: -mesh.w / 2 }, { translateY: -mesh.ground }];
  }, [visit, scale]);
  const shadow = useDerivedValue(() => {
    const pose = visitPose(visit, clock.value);
    // The rabbit's shadow shrinks as it leaves the ground.
    const air = id === 'rabbit' ? Math.sin(Math.PI * Math.max(0, Math.min(1, ((visitDistance(visit, clock.value) / hop) % 1 - 0.14) / 0.66))) : 0;
    return [{ translateX: pose.x }, { translateY: pose.y }, { scaleX: 1 - air * 0.25 }, { scaleY: 1 - air * 0.25 }];
  }, [visit, hop]);
  const rect = useMemo(() => ({ x: 0, y: 0, width: mesh.w, height: mesh.h }), [mesh]);
  return <Group opacity={opacity}>
    <Group transform={shadow}>
      <Oval x={-spec.size * 0.4} y={-spec.size * 0.07} width={spec.size * 0.8} height={spec.size * 0.14} color="rgba(30, 44, 26, 0.22)">
        <BlurMask blur={3} style="normal" />
      </Oval>
    </Group>
    <Group transform={transform}>
      {mesh.layers.map((layer, l) => <MeshLayer key={l} layers={layers} index={l} layer={layer} image={layer.texture === 'body' ? body : legs} rect={rect} />)}
    </Group>
  </Group>;
}

export function MeshLayer({ layers, index, layer, image, rect }: {
  layers: DerivedValue<{ x: number; y: number }[][]> | { value: { x: number; y: number }[][] }; index: number; layer: Layer;
  image: SkImage; rect: { x: number; y: number; width: number; height: number };
}) {
  const vertices = useDerivedValue(() => layers.value[index], [index, layers]);
  const k = layer.shade;
  return <Vertices vertices={vertices} textures={layer.textures} indices={layer.indices}>
    <ImageShader image={image} rect={rect} fit="fill" />
    {/* A far leg, in the body's shade. */}
    {k < 1 ? <ColorMatrix matrix={[k, 0, 0, 0, 0, 0, k, 0, 0, 0, 0, 0, k * 1.02, 0, 0, 0, 0, 0, 1, 0]} /> : null}
  </Vertices>;
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
      // Side view, painted facing right: face the way it goes.
      const facing = pose.dx < 0 ? -1 : 1;
      sx *= facing;
      y += Math.sin(t * Math.PI * 2 / 0.3) * 2;
      rotate = Math.max(-0.25, Math.min(0.25, Math.atan2(pose.dy, Math.abs(pose.dx)) * 0.5)) * facing;
    }
    return [{ translateX: x }, { translateY: y }, { rotate }, { scaleX: sx }, { scaleY: scale },
      { translateX: -art.w / 2 }, { translateY: -art.h / 2 }];
  }, [visit, scale, reduced]);
  // The bluebird's wing roots (a–b) and head in its painting (wingbeat.ts); literal so the
  // worklet carries them.
  const uniforms = useDerivedValue(() => ({ flap: reduced ? 0 : wingbeat(clock.value, 0.3), a: [210, 205], b: [350, 145], head: [305, 142, 50] }), [reduced]);
  return <Group opacity={opacity}>
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
