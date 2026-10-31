import { Circle, Group, ImageShader, RadialGradient, Rect, Shader, Skia, useImage, vec, type SkImage } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { TREEHOUSE_WIDTH, TREEHOUSE_HEIGHT, WINDOW_INTERIOR, LIBRARY_INTERIOR } from '../TreehouseEntity';
import { SWING_WIDTH, SWING_HEIGHT, SWING_LAYER_REGISTRATION, LEFT_LANTERN_GLASS, RIGHT_LANTERN_GLASS } from '../SwingEntity';

// Sample the authored material rather than painting a uniform orange cutout.
// Source alpha keeps gaps empty; luminance retains dark joints, grids and grain.
// Elliptical/skewed source falloff is compact, smooth and entirely timer-free.
const MATERIAL_LIGHT = Skia.RuntimeEffect.Make(`
uniform shader artwork;
uniform float4 lampA;
uniform float4 lampB;
uniform float gain;
uniform float warmth;
float falloff(float2 p,float4 lamp) {
  float2 q=(p-lamp.xy)/lamp.zw;
  q.x+=q.y*0.11;
  float f=max(0.0,1.0-dot(q,q));
  return f*f*(1.0-0.10*q.x+0.06*q.x*q.y);
}
half4 main(float2 p) {
  half4 sample=artwork.eval(p);
  float3 pigment=sample.rgb/max(sample.a,0.001);
  float lum=dot(pigment,float3(0.24,0.62,0.14));
  float field=min(1.0,falloff(p,lampA)+falloff(p,lampB));
  float alpha=sample.a*gain*field*(0.12+0.88*lum);
  float3 response=mix(pigment,float3(1.0,0.79,0.40),warmth);
  return half4(response*alpha,alpha);
}`);

type RectSpec = { x: number; y: number; width: number; height: number };
type Source = [number, number, number, number];
const OFF: Source = [-10000,-10000,1,1];
function MaterialLight({ image, rect, a, b = OFF, gain, warmth = .35, clip }: {
  image: SkImage | null; rect: RectSpec; a: Source; b?: Source; gain: number; warmth?: number; clip?: string;
}) {
  if (!image || !MATERIAL_LIGHT) return null;
  const sources = b === OFF ? [a] : [a,b];
  // The skewed ellipse is contained by this conservative box. Sample only the lit region.
  const left = Math.max(rect.x, Math.min(...sources.map(s => s[0] - s[2] * 1.12)));
  const top = Math.max(rect.y, Math.min(...sources.map(s => s[1] - s[3])));
  const right = Math.min(rect.x + rect.width, Math.max(...sources.map(s => s[0] + s[2] * 1.12)));
  const bottom = Math.min(rect.y + rect.height, Math.max(...sources.map(s => s[1] + s[3])));
  return <Group clip={clip}>
    <Rect x={left} y={top} width={Math.max(0,right-left)} height={Math.max(0,bottom-top)} blendMode="srcOver">
      <Shader source={MATERIAL_LIGHT} uniforms={{ lampA: a, lampB: b, gain, warmth }}>
        <ImageShader image={image} fit="fill" rect={rect} />
      </Shader>
    </Rect>
  </Group>;
}

function ReflectedEdge({ clip, x, y, rx, ry, opacity }: {
  clip: string; x: number; y: number; rx: number; ry: number; opacity: number;
}) {
  // Very low-energy light on ropes/seat: soft-light retains underlying linework.
  return <Group clip={clip} opacity={opacity} blendMode="softLight">
    <Group transform={[{ translateX: x }, { translateY: y }, { scaleX: rx }, { scaleY: ry }]}>
      <Circle cx={0} cy={0} r={1}>
        <RadialGradient c={vec(0,0)} r={1} colors={['#FFD69A', '#E8AA65AA', '#E8AA6500']} positions={[0,.25,1]} />
      </Circle>
    </Group>
  </Group>;
}

/** Only the existing Swing/Treehouse light response; shared night fade and placements. */
export default function ExistingWindowLights({ light, treehouse, swing }: {
  light: SharedValue<number>; treehouse: { x: number; y: number; scale: number };
  swing: { x: number; y: number; scale: number; rotation: number };
}) {
  const tree = useImage(require('@/assets/garden/landmarks/treehouse/tree-base.png'));
  const lamps = useImage(require('@/assets/garden/landmarks/swing/lanterns.png'));
  const frame = useImage(require('@/assets/garden/landmarks/swing/frame-static.png'));
  const registration = SWING_LAYER_REGISTRATION.lanterns;
  const frameRegistration = SWING_LAYER_REGISTRATION['frame-static'];
  const treeRect = { x: 0, y: 0, width: TREEHOUSE_WIDTH, height: TREEHOUSE_HEIGHT };
  const lampRect = { x: registration.x, y: registration.y,
    width: registration.sourceWidth * registration.scale, height: registration.sourceHeight * registration.scale };
  const frameRect = { x: frameRegistration.x, y: frameRegistration.y,
    width: frameRegistration.sourceWidth * frameRegistration.scale, height: frameRegistration.sourceHeight * frameRegistration.scale };
  return <Group opacity={light}>
    <Group transform={[{ translateX: treehouse.x }, { translateY: treehouse.y }, { scale: treehouse.scale }]}>
      {/* Wood/stone rim catches light; steps and roots receive a separate downward field. */}
      <MaterialLight image={tree} rect={treeRect} a={[783,420,104,100]} b={[875,755,175,210]} gain={.58} />
      <MaterialLight image={tree} rect={treeRect} a={[905,835,110,155]} b={[940,950,155,90]} gain={.40} warmth={.30} />
      {/* Off-center interior sources leave depth and visible furniture/grid shadows. */}
      <MaterialLight image={tree} rect={treeRect} clip={WINDOW_INTERIOR} a={[791,397,65,78]} gain={1.05} warmth={.28} />
      <MaterialLight image={tree} rect={treeRect} clip={LIBRARY_INTERIOR} a={[881,685,120,135]} b={[845,744,90,65]} gain={.95} warmth={.26} />
    </Group>
    <Group origin={{ x: swing.x + SWING_WIDTH * swing.scale / 2, y: swing.y + SWING_HEIGHT * swing.scale / 2 }}
      transform={[{ rotate: swing.rotation * Math.PI / 180 }]}>
      <Group transform={[{ translateX: swing.x }, { translateY: swing.y }, { scale: swing.scale }]}>
        {/* Texture and alpha create irregular pools on actual stone/roots, never a disk. */}
        <MaterialLight image={frame} rect={frameRect} a={[230,665,260,365]} b={[1100,530,250,380]} gain={.58} />
        <MaterialLight image={frame} rect={frameRect} a={[330,1010,300,155]} b={[1080,990,275,160]} gain={.34} warmth={.30} />
        <ReflectedEdge clip="M 350 310 L 450 310 L 475 800 L 390 800 Z" x={385} y={580} rx={160} ry={320} opacity={.10} />
        <ReflectedEdge clip="M 900 290 L 1010 290 L 990 800 L 910 800 Z" x={955} y={540} rx={180} ry={340} opacity={.10} />
        <ReflectedEdge clip="M 430 800 Q 660 885 980 790 L 980 835 Q 660 930 430 845 Z" x={700} y={830} rx={345} ry={90} opacity={.09} />
        {/* Each interior has a compact core; the painted metal/glass detail is retained. */}
        <MaterialLight image={lamps} rect={lampRect} clip={LEFT_LANTERN_GLASS} a={[222,574,48,75]} gain={1.3} warmth={.58} />
        <MaterialLight image={lamps} rect={lampRect} clip={RIGHT_LANTERN_GLASS} a={[1109,439,60,78]} gain={1.3} warmth={.58} />
      </Group>
    </Group>
  </Group>;
}
