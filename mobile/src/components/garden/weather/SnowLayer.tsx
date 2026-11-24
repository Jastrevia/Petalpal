import {
  Atlas, Circle, ColorMatrix, Group, ImageShader, Paint, RadialGradient, Rect, Shader, Skia, rect, useColorBuffer, useImage,
  useRSXformBuffer, vec, type SkImage, type Transforms3d,
} from '@shopify/react-native-skia';
import { createContext, memo, useContext, useMemo, type ReactNode } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { SKY_NOISE } from './SkyLayers';
import { WIND_DIR, type WeatherLook } from './gardenWeather';
import { onWater, useSprite, useWaterGrid } from './weatherSprites';

// Snow in two parts that belong together. Lying snow is the painting itself turning white: in world
// space, where snow has drifted, the paint below loses its colour and is lifted toward a cold white
// while keeping its own values, so strokes, shading and texture show through the snow (blend modes
// on the painted layers, no overlay picture). It settles gradually as the snow sets in, stays put in
// the world and leaves the open water dark. Falling flakes drift down in world space, flutter in the
// wind and settle onto that snow, fading into it; a flake that reaches the water is simply gone.

// ── Lying snow ───────────────────────────────────────────────────────────────────────────────
const DRIFTS = Skia.RuntimeEffect.Make(`
uniform shader water;
uniform float amount;
uniform float4 tint;
uniform float landOnly;
uniform float reach;
${SKY_NOISE}
half4 main(float2 p) {
  float drifts=skyFbm(p/150.0)*0.62+skyFbm(p/36.0)*0.38;
  // Fine grain breaks the drift edges into scattered snow instead of smooth shapes.
  drifts=clamp((drifts-0.5)*2.2+0.5+(skyNoise(p/6.5)-0.5)*0.26+(skyNoise(p/2.6+7.3)-0.5)*0.12,0.0,1.0);
  // More snow lies the longer it snows: the bare patches close up as the amount rises.
  float cover=smoothstep(1.02-amount*0.62,1.12-amount*0.5,drifts+0.1+reach);
  if(landOnly>0.5) cover*=1.0-water.eval(clamp(p,float2(0.0),float2(2399.0,1799.0))).r;
  cover*=smoothstep(0.0,0.25,amount);
  return half4(tint.rgb*tint.a*cover,tint.a*cover);
}
`);

const REGION = rect(-700, -800, 3800, 3400);
// Snow takes the paint's own value, drained of colour and lifted toward white: the same look as
// SNOW_MATRIX below, done with blend modes so it can lie on everything already painted.
const SNOW_GREY = [0.9, 0.925, 0.97, 1];
const SNOW_LIFT = [0.56, 0.6, 0.67, 1];
const SNOW_MATRIX = [
  0.13, 0.44, 0.05, 0, 0.36,
  0.12, 0.46, 0.05, 0, 0.38,
  0.12, 0.44, 0.07, 0, 0.44,
  0, 0, 0, 1, 0,
];
// Snow caps: bright, with just enough of the paint's value left to keep their edge readable.
const CAP_MATRIX = [
  0.05, 0.16, 0.02, 0, 0.74,
  0.05, 0.16, 0.02, 0, 0.76,
  0.05, 0.16, 0.03, 0, 0.82,
  0, 0, 0, 1, 0,
];

function useDrifts(look: SharedValue<WeatherLook>, tint: number[], landOnly: boolean, reach = 0) {
  return useDerivedValue(() => ({ amount: look.value.snow, tint, landOnly: landOnly ? 1 : 0, reach }));
}

/** Snow lying on everything painted before it (land, roads, the treehouse, swing and moon bed). */
export function SnowGroundCover({ look, cameraTransform }: { look: SharedValue<WeatherLook>; cameraTransform: SharedValue<Transforms3d> }) {
  const mask = useImage(require('../water/assets/water-surface-mask.png'));
  const grey = useDrifts(look, SNOW_GREY, true), lift = useDrifts(look, SNOW_LIFT, true);
  if (!DRIFTS || !mask) return null;
  const water = <ImageShader image={mask} fit="fill" rect={rect(0, 0, 2400, 1800)} />;
  return <Group transform={cameraTransform}>
    <Rect rect={REGION} blendMode="color"><Shader source={DRIFTS} uniforms={grey}>{water}</Shader></Rect>
    <Rect rect={REGION} blendMode="screen"><Shader source={DRIFTS} uniforms={lift}>{water}</Shader></Rect>
  </Group>;
}

const SnowContext = createContext<SharedValue<WeatherLook> | null>(null);
export const SnowProvider = SnowContext.Provider;

/**
 * Snow on artwork drawn after the ground cover (the pavilion, the arch, flowers, lanterns), kept to
 * the artwork's own shape: a light frost in the same world drifts as the ground, and caps of snow
 * along its upper edges (roof ridges, the tops of leaves and posts), found as the band of the
 * artwork with nothing of itself just above. Plain children when dry.
 */
export function Snowy({ children, cap = 9 }: { children: ReactNode; cap?: number }) {
  const look = useContext(SnowContext);
  if (!look) return <>{children}</>;
  return <SnowyCopy look={look} cap={cap}>{children}</SnowyCopy>;
}

function SnowyCopy({ look, cap, children }: { look: SharedValue<WeatherLook>; cap: number; children: ReactNode }) {
  const mask = useImage(require('../water/assets/water-surface-mask.png'));
  const frost = useDrifts(look, [0.5, 0.5, 0.5, 0.5], false);
  const caps = useDrifts(look, [1, 1, 1, 1], false, 0.22);
  if (!DRIFTS || !mask) return <>{children}</>;
  const water = <ImageShader image={mask} fit="fill" rect={rect(0, 0, 2400, 1800)} />;
  return <>
    {children}
    <Group layer={<Paint />}>
      <Group layer={<Paint><ColorMatrix matrix={SNOW_MATRIX} /></Paint>}>{children}</Group>
      <Rect rect={REGION} blendMode="dstIn"><Shader source={DRIFTS} uniforms={frost}>{water}</Shader></Rect>
    </Group>
    <Group layer={<Paint />}>
      <Group layer={<Paint><ColorMatrix matrix={CAP_MATRIX} /></Paint>}>{children}</Group>
      <Group transform={[{ translateY: cap }]} blendMode="dstOut">{children}</Group>
      <Rect rect={REGION} blendMode="dstIn"><Shader source={DRIFTS} uniforms={caps}>{water}</Shader></Rect>
    </Group>
  </>;
}

// ── Falling flakes ───────────────────────────────────────────────────────────────────────────
const FLAKE = 28;
const REGION_X = -300, REGION_Y = -500, REGION_W = 3000, REGION_H = 2700;
const COUNT = 1400;
const SETTLE = 1.6;

function FlakeSprite() {
  return <Group>
    <Circle cx={FLAKE / 2} cy={FLAKE / 2} r={FLAKE / 2}>
      <RadialGradient c={vec(FLAKE / 2, FLAKE / 2)} r={FLAKE / 2} colors={['#FFFFFFF2', '#F6F9FCB0', '#EEF3F800']} positions={[0, 0.42, 1]} />
    </Circle>
  </Group>;
}

type Flake = { phase: number; fall: number; height: number; scale: number; alpha: number; seed: number; sway: number; swayRate: number };

function makeFlakes(): Flake[] {
  let s = 19;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: COUNT }, (_, i) => {
    const near = Math.pow(r(), 2.2);
    return {
      phase: r() * 12, fall: 5.5 + r() * 4.5, height: 240 + r() * 260, scale: 0.18 + near * 0.42,
      alpha: 0.55 + near * 0.4, seed: i * 6151 + 37, sway: 6 + r() * 16, swayRate: 0.8 + r() * 1.4,
    };
  });
}

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

const Flakes = memo(function Flakes({ sprite, grid, seconds, look, cameraTransform, night }: {
  sprite: SkImage; grid: number[]; seconds: SharedValue<number>; look: SharedValue<WeatherLook>;
  cameraTransform: SharedValue<Transforms3d>; night: SharedValue<number>;
}) {
  const flakes = useMemo(makeFlakes, []);
  const sprites = useMemo(() => flakes.map(() => rect(0, 0, FLAKE, FLAKE)), [flakes]);
  const transforms = useRSXformBuffer(COUNT, (val, i) => {
    'worklet';
    const f = flakes[i];
    const span = f.fall + SETTLE;
    const cycle = (seconds.value + f.phase) / span;
    const n = Math.floor(cycle);
    const time = (cycle - n) * span;
    const k = Math.min(1, time / f.fall);
    const g = landing(f.seed, n);
    const up = f.height * (1 - k);
    // Carried downwind while it falls, fluttering side to side, slowing as it nears the ground.
    const wind = look.value.wind;
    const carry = up * (0.15 + 1.5 * wind);
    const flutter = Math.sin(seconds.value * f.swayRate + f.seed) * f.sway * (k < 1 ? 1 : 0);
    const x = g[0] - carry * WIND_DIR.x + flutter;
    const y = g[1] - up - carry * WIND_DIR.y * 0.4;
    const sc = f.scale;
    val.set(sc, 0, x - (FLAKE / 2) * sc, y - (FLAKE / 2) * sc);
  });
  const colors = useColorBuffer(COUNT, (val, i) => {
    'worklet';
    const f = flakes[i];
    const span = f.fall + SETTLE;
    const cycle = (seconds.value + f.phase) / span;
    const time = (cycle - Math.floor(cycle)) * span;
    const k = time / f.fall;
    const g = landing(f.seed, Math.floor(cycle));
    let a = Math.min(1, k / 0.12) * f.alpha;
    if (k >= 1) {
      // Settled: on snow it fades into the cover; on water it is gone at once.
      const p = (time - f.fall) / SETTLE;
      a *= onWater(grid, g[0], g[1]) ? 0 : 0.8 * Math.pow(1 - p, 1.4);
    }
    a *= look.value.flakes * (1 - 0.45 * night.value);
    val[0] = 1; val[1] = 1; val[2] = 1; val[3] = a;
  });
  return <Group transform={cameraTransform}>
    <Atlas image={sprite} sprites={sprites} transforms={transforms} colors={colors} colorBlendMode="dstIn" />
  </Group>;
});

export function SnowFlakesLayer({ seconds, look, cameraTransform, night }: {
  seconds: SharedValue<number>; look: SharedValue<WeatherLook>; cameraTransform: SharedValue<Transforms3d>; night: SharedValue<number>;
}) {
  const sprite = useSprite(<FlakeSprite />, FLAKE, FLAKE);
  const grid = useWaterGrid();
  if (!sprite || !grid) return null;
  return <Flakes sprite={sprite} grid={grid} seconds={seconds} look={look} cameraTransform={cameraTransform} night={night} />;
}
