import {
  Atlas, Blur, Circle, Group, LinearGradient, Oval, Path, Skia, rect,
  useColorBuffer, useRSXformBuffer, vec,
  type SkImage, type Transforms3d,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { WeatherLook } from './gardenWeather';
import { onWater, useSprite, useWaterGrid } from './weatherSprites';

// Falling rain in Garden world space. Each drop falls toward one point on the painted ground. On
// land it ends in a small crown splash; on water it simply enters the surface, because the rings
// there belong to the water itself (GardenWaterField), drawn under the treehouse, bridges and rocks
// so anything standing in the water hides them. Drops pan and zoom with the Garden, so the rain
// stays in the world instead of on the glass. The overcast grade lives in the scene colour layer.

const STREAK_W = 20, STREAK_H = 96;
const CROWN_W = 64, CROWN_H = 44;

const REGION_X = -300, REGION_Y = -450, REGION_W = 3000, REGION_H = 2650;
// RAIN draws 1200 of them (the approved sample), a storm all of them.
const DROP_COUNT = 1700;

function streakPath() {
  const p = Skia.Path.Make();
  const c = STREAK_W / 2;
  p.moveTo(c, 3);
  p.cubicTo(c + 0.5, 34, c + 2.0, 72, c + 1.9, 86);
  p.cubicTo(c + 1.7, 93, c - 1.7, 93, c - 1.9, 86);
  p.cubicTo(c - 2.0, 72, c - 0.5, 34, c, 3);
  p.close();
  return p;
}

function StreakSprite() {
  const path = streakPath();
  return <Group>
    <Group transform={[{ translateX: STREAK_W / 2 }, { scaleX: 2.4 }, { translateX: -STREAK_W / 2 }]} opacity={0.3}>
      <Path path={path}>
        <LinearGradient start={vec(0, 0)} end={vec(0, STREAK_H)} colors={['#DDE8EE00', '#DDE8EE80', '#E8F0F3C0']} positions={[0, 0.6, 1]} />
        <Blur blur={2.6} />
      </Path>
    </Group>
    <Path path={path}>
      <LinearGradient start={vec(0, 0)} end={vec(0, STREAK_H)} colors={['#F2F7FA00', '#EEF4F7A0', '#FAFCFDE8']} positions={[0, 0.62, 1]} />
      <Blur blur={0.8} />
    </Path>
  </Group>;
}

function CrownSprite() {
  // A crown splash on stone, grass or a roof: a soft wet flash with a few beads thrown out. No ring.
  const beads = [[-17, -9, 1.6], [-9, -15, 1.3], [0, -17, 1.5], [9, -14, 1.2], [17, -8, 1.5], [-12, 2, 1.0], [13, 3, 1.1]];
  return <Group>
    <Group transform={[{ translateX: 32 }, { translateY: 30 }]}>
      <Oval rect={rect(-15, -5, 30, 10)} color="#EAF2F566"><Blur blur={3} /></Oval>
      {beads.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} color="#F4F8FAD0"><Blur blur={0.6} /></Circle>)}
    </Group>
  </Group>;
}

type Drop = { phase: number; fall: number; height: number; scale: number; alpha: number; seed: number };
const SPLASH = 0.3;

function makeDrops(): Drop[] {
  let s = 7;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: DROP_COUNT }, (_, i) => {
    const near = Math.pow(r(), 1.8);
    return {
      phase: r() * 4, fall: 0.38 + r() * 0.22, height: 150 + r() * 130,
      scale: 0.42 + near * 0.45, alpha: 0.42 + near * 0.45, seed: i * 7919 + 101,
    };
  });
}

/** Rain bands sweeping across the Garden; the same formula as rainGust in GardenWaterField. */
function gust(x: number, y: number, t: number) {
  'worklet';
  const v = 0.5 + 0.35 * Math.sin((x * 0.82 + y * 0.57) * 0.0021 - t * 0.42)
    + 0.2 * Math.sin((y * 0.9 - x * 0.4) * 0.0047 + t * 0.27);
  return Math.min(1, Math.max(0.12, v));
}

/** Where drop `d` lands in cycle `n`, as a world point in [0,1)² of the rain region. */
function landing(seed: number, n: number) {
  'worklet';
  let h = (seed * 374761393 + n * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  const u = (h >>> 0) / 4294967296;
  let g = Math.imul(h ^ 0x9e3779b9, 2246822519);
  g = g ^ (g >>> 15);
  const v = (g >>> 0) / 4294967296;
  return [REGION_X + u * REGION_W, REGION_Y + v * REGION_H];
}

const RainDrops = memo(function RainDrops({ streak, crown, grid, seconds, cameraTransform, look, flash, night }: {
  streak: SkImage; crown: SkImage; grid: number[]; seconds: SharedValue<number>;
  cameraTransform: SharedValue<Transforms3d>; look: SharedValue<WeatherLook>; flash: SharedValue<number>; night: boolean;
}) {
  const drops = useMemo(() => makeDrops(), []);
  const streakSprites = useMemo(() => drops.map(() => rect(0, 0, STREAK_W, STREAK_H)), [drops]);
  const crownSprites = useMemo(() => drops.map(() => rect(0, 0, CROWN_W, CROWN_H)), [drops]);
  const dim = night ? 0.6 : 1;

  const streakTransforms = useRSXformBuffer(DROP_COUNT, (val, i) => {
    'worklet';
    const d = drops[i];
    const cycle = (seconds.value + d.phase) / (d.fall + SPLASH);
    const n = Math.floor(cycle);
    const time = (cycle - n) * (d.fall + SPLASH);
    const f = Math.min(1, time / d.fall);
    const g = landing(d.seed, n);
    const up = d.height * (1 - f);
    // The harder the wind, the more the rain slants.
    const w = look.value.wind;
    const wind = -(0.05 + 0.25 * w + 0.25 * w * w);
    const angle = Math.atan(wind);
    // The bead (bottom centre of the sprite) sits at the drop's current point above its landing.
    const x = g[0] + wind * up, y = g[1] - up;
    const c = Math.cos(angle) * d.scale, s = Math.sin(angle) * d.scale;
    const ax = STREAK_W / 2, ay = STREAK_H * 0.94;
    val.set(c, s, x - (c * ax - s * ay), y - (s * ax + c * ay));
  });
  const streakColors = useColorBuffer(DROP_COUNT, (val, i) => {
    'worklet';
    const d = drops[i];
    const cycle = (seconds.value + d.phase) / (d.fall + SPLASH);
    const time = (cycle - Math.floor(cycle)) * (d.fall + SPLASH);
    const f = time / d.fall;
    const g = landing(d.seed, Math.floor(cycle));
    // Heavier bands carry brighter drops; a lull thins the rain without stopping it.
    const band = gust(g[0], g[1], seconds.value);
    // Light rain: only some of the drops fall. A lightning flash lights every drop in the air.
    const falling = i < DROP_COUNT * look.value.rain ? 1 : 0;
    const lit = 1 + 0.9 * flash.value;
    const a = f >= 1 ? 0 : Math.min(1, Math.min(1, f / 0.2) * d.alpha * dim * (0.4 + 0.6 * band) * lit) * falling;
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = a;
  });

  const splashTransforms = useRSXformBuffer(DROP_COUNT, (val, i) => {
    'worklet';
    const d = drops[i];
    const cycle = (seconds.value + d.phase) / (d.fall + SPLASH);
    const n = Math.floor(cycle);
    const time = (cycle - n) * (d.fall + SPLASH);
    const p = Math.max(0, (time - d.fall) / SPLASH);
    const g = landing(d.seed, n);
    const k = (0.32 + 0.3 * p) * (0.7 + d.scale);
    val.set(k, 0, g[0] - (CROWN_W / 2) * k, g[1] - CROWN_H * 0.68 * k);
  });
  const splashColors = useColorBuffer(DROP_COUNT, (val, i) => {
    'worklet';
    const d = drops[i];
    const cycle = (seconds.value + d.phase) / (d.fall + SPLASH);
    const time = (cycle - Math.floor(cycle)) * (d.fall + SPLASH);
    const p = (time - d.fall) / SPLASH;
    const g = landing(d.seed, Math.floor(cycle));
    // Only on land: a drop that reaches water just enters it.
    const land = !onWater(grid, g[0], g[1]);
    const band = (0.4 + 0.6 * gust(g[0], g[1], seconds.value));
    const falling = i < DROP_COUNT * look.value.rain ? 1 : 0;
    const a = p < 0 || !land ? 0 : Math.pow(1 - p, 1.6) * Math.min(1, p / 0.1) * (0.35 + d.alpha) * dim * band * falling;
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = a;
  });

  return <Group transform={cameraTransform} blendMode="screen">
    <Atlas image={crown} sprites={crownSprites} transforms={splashTransforms} colors={splashColors} colorBlendMode="dstIn" />
    <Atlas image={streak} sprites={streakSprites} transforms={streakTransforms} colors={streakColors} colorBlendMode="dstIn" />
  </Group>;
});

export type RainLayerProps = {
  width: number; height: number; cameraTransform: SharedValue<Transforms3d>;
  active: boolean; night: boolean; look: SharedValue<WeatherLook>; flash: SharedValue<number>; clock?: SharedValue<number>;
};

/** Drawn after the graded scene, so it sets its own night strength. */
export default function RainLayer({ cameraTransform, active, night, look, flash, clock }: RainLayerProps) {
  const reduced = useReducedMotion();
  const own = useSharedValue(0);
  // Share the water surface's clock when it runs, so falling bands and water rings stay in step.
  const seconds = clock ?? own;
  const streak = useSprite(<StreakSprite />, STREAK_W, STREAK_H);
  const crown = useSprite(<CrownSprite />, CROWN_W, CROWN_H);
  const grid = useWaterGrid();
  const frame = useFrameCallback(info => {
    const dt = Math.min(0.064, Math.max(0, (info.timeSincePreviousFrame ?? 16.667) / 1000));
    own.value += dt;
  }, false);
  useEffect(() => {
    frame.setActive(active && !reduced && !clock);
    return () => frame.setActive(false);
  }, [frame, active, reduced, clock]);

  if (!streak || !crown || !grid) return null;
  return <RainDrops streak={streak} crown={crown} grid={grid} seconds={seconds}
    cameraTransform={cameraTransform} look={look} flash={flash} night={night} />;
}
