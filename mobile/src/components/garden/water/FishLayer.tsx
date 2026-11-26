import FishSurfaceWake from './FishSurfaceWake';
import { runtimeAudit } from '../performance/runtimeAudit';
import { Group, ImageShader, Rect, Shader, Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { getFishForDensity, getFishPose, type FishConfig, type FishDensity, type FishMotionPreset } from './fishMotion';
export { FISH, getFishForDensity } from './fishMotion';
export type { FishConfig, FishDensity, FishMotionPreset } from './fishMotion';

// Each rect is one complete koi in the transparent atlas; all face right.
const REGIONS = [
  [35,205,570,300], [660,207,570,300], [30,795,580,300], [657,797,575,302],
] as const;
const KOI = Skia.RuntimeEffect.Make(`
uniform shader atlas;
uniform float4 region;
uniform float2 size;
uniform float seconds;
uniform float phase;
half4 main(float2 p) {
  // Small independent tail strokes, strongest at the tail and absent at the
  // head. The complete fish follows the smooth route tangent without jitter.
  float tail = 1.0 - smoothstep(-size.x * .43, size.x * .13, p.x);
  float wave = sin(seconds * (1.65 + phase * .012) + phase - p.x / size.x * 5.0);
  float2 q = p - float2(0.0, size.x * .012 * tail * wave);
  float2 uv = q / size + .5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return half4(0);
  float2 at = region.xy + uv * region.zw;
  // Filter premultiplied pigment together with its silhouette: fins dissolve
  // into the water without a bright fringe or an opaque blurred rectangle.
  float2 soft = region.zw / size * .72;
  half4 c = atlas.eval(at) * .52;
  c += (atlas.eval(at + float2(soft.x,0)) + atlas.eval(at - float2(soft.x,0))
      + atlas.eval(at + float2(0,soft.y)) + atlas.eval(at - float2(0,soft.y))) * .12;
  float3 rgb = c.rgb / max(c.a, .001);
  float depth = .105 + .025 * sin(phase);
  rgb = mix(rgb, float3(.45,.75,.74), depth);
  return half4(rgb * c.a, c.a);
}
`);

const FishSprite = memo(function FishSprite({ config, image, seconds, opacity }: {
  config:FishConfig; image:SkImage; seconds:SharedValue<number>; opacity:number;
}) {
  const region = REGIONS[config.palette];
  const width = config.length * .89;
  const height = width * region[3] / region[2];
  const transform = useDerivedValue(() => {
    const p = getFishPose(config, seconds.value);
    return [{translateX:p.x},{translateY:p.y},{rotate:p.heading}];
  }, [config, seconds]);
  const uniforms = useDerivedValue(() => ({
    region:[...region], size:[width,height], seconds:seconds.value, phase:config.phase,
  }), [region, width, height, seconds, config.phase]);
  if (!KOI) return null;
  return <Group transform={transform} opacity={opacity * (.96 + .025 * Math.sin(config.phase))}>
    <FishSurfaceWake seconds={seconds} x={width*.43} y={0} heading={0} seed={config.phase} />
    <Rect x={-width*.5-3} y={-height*.5-3} width={width+6} height={height+6}>
      <Shader source={KOI} uniforms={uniforms}>
        <ImageShader image={image} rect={{x:0,y:0,width:1254,height:1254}} fit="fill" tx="decal" ty="decal" />
      </Shader>
    </Rect>
  </Group>;
});

export type FishLayerProps = {
  active:boolean; enabled?:boolean; opacity?:number;
  motionPreset?:FishMotionPreset; density?:FishDensity;
};
const SPEED = { subtle:.65, normal:1, strong:1.45 };

function FishLayer({ active, enabled=true, opacity=1, motionPreset='normal', density='normal' }:FishLayerProps) {
  runtimeAudit.render('FishLayer');
  const image = useImage(require('./terrain/koi-atlas-v2.webp'));
  const reducedMotion = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  const running = active && enabled && foreground && !reducedMotion;
  const seconds = useSharedValue(0);
  const speed = SPEED[motionPreset];
  const frame = useFrameCallback(frame => {
    if (!running) return;
    seconds.value += Math.min(.05, Math.max(0, (frame.timeSincePreviousFrame ?? 16.667) / 1000)) * speed;
  }, false);
  useEffect(() => {
    frame.setActive(running);
    return () => frame.setActive(false);
  }, [frame, running]);
  const fish = useMemo(() => getFishForDensity(density), [density]);
  if (!enabled || !image) return null;
  return <Group>{fish.map(config => <FishSprite key={config.id} config={config}
    image={image} seconds={seconds} opacity={opacity} />)}</Group>;
}
export default memo(FishLayer);
