import {
  Atlas, Blur, Group, LinearGradient, Oval, Path, Skia, rect, useColorBuffer, useRSXformBuffer, vec,
  type SkImage, type Transforms3d,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { WIND_DIR, windGust, type WeatherLook } from './gardenWeather';
import { useSprite } from './weatherSprites';

// Leaves and petals torn loose by the wind, carried across the Garden in world space. Each one
// flies at its own height above the ground and casts a small soft shadow on the ground beneath it
// (by day), so it is in the air over the Garden rather than on the glass. It tumbles as it goes:
// three painted views of each leaf, face on, turning and edge on.

const CELL_W = 40, CELL_H = 28;
const KINDS = [
  ['#C8A5D8', '#9C79B8'], // wisteria petal
  ['#F2C4CC', '#D8909E'], // blossom petal
  ['#9DB46A', '#5F7A3A'], // green leaf
  ['#D9B35C', '#A9762E'], // turning leaf
] as const;
const FRAMES = [1, 0.55, 0.18];
const COUNT = 110;
const SHADOW_W = 30, SHADOW_H = 14;

function leafPath(width: number) {
  const p = Skia.Path.Make();
  const cx = CELL_W / 2, cy = CELL_H / 2, hw = (CELL_W * 0.42) * 1, hh = (CELL_H * 0.32) * width;
  p.moveTo(cx - hw, cy);
  p.cubicTo(cx - hw * 0.4, cy - hh * 1.25, cx + hw * 0.5, cy - hh * 1.1, cx + hw, cy);
  p.cubicTo(cx + hw * 0.45, cy + hh * 1.05, cx - hw * 0.45, cy + hh * 1.2, cx - hw, cy);
  p.close();
  return p;
}

function LeafSheet() {
  return <Group>
    {KINDS.map(([light, dark], k) => FRAMES.map((width, f) => {
      const path = leafPath(width);
      return <Group key={`${k}-${f}`} transform={[{ translateX: f * CELL_W }, { translateY: k * CELL_H }]}>
        <Path path={path}>
          <LinearGradient start={vec(CELL_W * 0.2, CELL_H * 0.2)} end={vec(CELL_W * 0.8, CELL_H * 0.8)} colors={[light, dark]} />
          <Blur blur={0.6} />
        </Path>
      </Group>;
    }))}
  </Group>;
}

function ShadowSprite() {
  return <Oval rect={rect(4, 3, SHADOW_W - 8, SHADOW_H - 6)} color="#1E281C"><Blur blur={2.4} /></Oval>;
}

type Leaf = { kind: number; phase: number; life: number; scale: number; height: number; spin: number; tumble: number; seed: number; lateral: number };

function makeLeaves(): Leaf[] {
  let s = 41;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: COUNT }, (_, i) => ({
    kind: Math.floor(r() * KINDS.length), phase: r() * 20, life: 5 + r() * 5, scale: 0.42 + r() * 0.5,
    height: 30 + r() * 110, spin: (r() - 0.5) * 5, tumble: 2 + r() * 5, seed: i * 2731 + 13, lateral: r() * 2 - 1,
  }));
}

function start(seed: number, n: number) {
  'worklet';
  let h = (seed * 374761393 + n * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  const u = (h >>> 0) / 4294967296;
  let g = Math.imul(h ^ 0x9e3779b9, 2246822519);
  g = g ^ (g >>> 15);
  const v = (g >>> 0) / 4294967296;
  return [-500 + u * 2900, -300 + v * 2300];
}

/** Where leaf `i` is now: ground point, height, rotation, tumble frame and how visible it is. */
function pose(leaf: Leaf, i: number, t: number, wind: number) {
  'worklet';
  const cycle = (t + leaf.phase) / leaf.life;
  const n = Math.floor(cycle);
  const k = cycle - n;
  const time = k * leaf.life;
  const s = start(leaf.seed, n);
  const speed = 40 + 300 * wind;
  const gust = windGust(s[0], s[1], t);
  const run = speed * time * (0.7 + 0.6 * gust);
  // Carried downwind, wandering across it, rising and dipping on the air.
  const wander = Math.sin(time * 1.3 + leaf.seed) * 26 * leaf.lateral;
  const x = s[0] + WIND_DIR.x * run - WIND_DIR.y * wander;
  const y = s[1] + WIND_DIR.y * run + WIND_DIR.x * wander;
  const lift = leaf.height * (0.65 + 0.35 * Math.sin(time * 2.1 + leaf.seed * 0.7)) * (0.4 + 0.6 * Math.sin(Math.PI * k));
  const angle = leaf.spin * time + leaf.seed;
  const turn = Math.abs(Math.cos(leaf.tumble * time + leaf.seed));
  const frame = turn > 0.72 ? 0 : turn > 0.32 ? 1 : 2;
  const amount = Math.min(1, Math.max(0, (wind - 0.32) / 0.5));
  const shown = i < COUNT * amount ? Math.min(1, k / 0.1, (1 - k) / 0.15) : 0;
  return { x, y, lift, angle, frame, shown };
}

const Leaves = memo(function Leaves({ sheet, shadow, seconds, look, day, cameraTransform }: {
  sheet: SkImage; shadow: SkImage; seconds: SharedValue<number>; look: SharedValue<WeatherLook>;
  day: SharedValue<number>; cameraTransform: SharedValue<Transforms3d>;
}) {
  const leaves = useMemo(() => makeLeaves(), []);
  const shadowSprites = useMemo(() => leaves.map(() => rect(0, 0, SHADOW_W, SHADOW_H)), [leaves]);
  const shadowTransforms = useRSXformBuffer(COUNT, (val, i) => {
    'worklet';
    const p = pose(leaves[i], i, seconds.value, look.value.wind);
    const sc = leaves[i].scale * (1 - p.lift / 400);
    val.set(sc, 0, p.x - (SHADOW_W / 2) * sc, p.y - (SHADOW_H / 2) * sc);
  });
  const shadowColors = useColorBuffer(COUNT, (val, i) => {
    'worklet';
    const p = pose(leaves[i], i, seconds.value, look.value.wind);
    const a = p.shown * 0.3 * day.value * (1 - 0.6 * look.value.overcast) * Math.max(0, 1 - p.lift / 220);
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = a;
  });
  // One atlas per tumble view: a leaf shows in the one matching how far it has turned.
  const frames = FRAMES.map((_, f) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const sprites = useMemo(() => leaves.map(l => rect(f * CELL_W, l.kind * CELL_H, CELL_W, CELL_H)), []);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const transforms = useRSXformBuffer(COUNT, (val, i) => {
      'worklet';
      const p = pose(leaves[i], i, seconds.value, look.value.wind);
      const sc = leaves[i].scale, c = Math.cos(p.angle) * sc, s = Math.sin(p.angle) * sc;
      const ax = CELL_W / 2, ay = CELL_H / 2, x = p.x, y = p.y - p.lift;
      val.set(c, s, x - (c * ax - s * ay), y - (s * ax + c * ay));
    });
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const colors = useColorBuffer(COUNT, (val, i) => {
      'worklet';
      const p = pose(leaves[i], i, seconds.value, look.value.wind);
      val[0] = 1; val[1] = 1; val[2] = 1; val[3] = p.frame === f ? p.shown * 0.95 : 0;
    });
    return { sprites, transforms, colors };
  });
  return <Group transform={cameraTransform}>
    <Atlas image={shadow} sprites={shadowSprites} transforms={shadowTransforms} colors={shadowColors} colorBlendMode="dstIn" />
    {frames.map((frame, f) => <Atlas key={f} image={sheet} sprites={frame.sprites} transforms={frame.transforms}
      colors={frame.colors} colorBlendMode="modulate" />)}
  </Group>;
});

/** Drawn inside the graded scene, so night and weather light the leaves like the painting. */
export function LeavesLayer({ seconds, look, day, cameraTransform }: {
  seconds: SharedValue<number>; look: SharedValue<WeatherLook>; day: SharedValue<number>; cameraTransform: SharedValue<Transforms3d>;
}) {
  const sheet = useSprite(<LeafSheet />, CELL_W * FRAMES.length, CELL_H * KINDS.length);
  const shadow = useSprite(<ShadowSprite />, SHADOW_W, SHADOW_H);
  if (!sheet || !shadow) return null;
  return <Leaves sheet={sheet} shadow={shadow} seconds={seconds} look={look} day={day} cameraTransform={cameraTransform} />;
}
