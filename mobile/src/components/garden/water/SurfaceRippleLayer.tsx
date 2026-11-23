import { runtimeAudit } from '../performance/runtimeAudit';
import { ImageShader, Rect, Shader, Skia } from '@shopify/react-native-skia';
import { useGardenImage } from '../gardenImageScope';
import { memo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { GARDEN_WORLD_HEIGHT, GARDEN_WORLD_WIDTH } from '../gardenMapLayout';
import { useWaterTopFlow, type WaterTopFlow } from './WaterTopAssembly';
import { WATER_WAVE_SKSL } from './waterWaveShader';

// Preview compatibility only: mixed wave periods never reset together.
export const SURFACE_RIPPLE_CYCLE_MS = 18000;

const SURFACE = Skia.RuntimeEffect.Make(`
uniform shader openWater;
uniform shader shoreline;
uniform float seconds;
uniform float strength;
uniform float2 size;
uniform float softEdges;
${WATER_WAVE_SKSL}

// Occasional, outward-fading fragments at existing stones. Four separated
// anchors, unequal timings, no complete rings or island-wide outline.
float stoneWave(float2 p,float2 center,float t,float seed) {
  float2 q=(p-center)*float2(1.0,1.32);
  if(dot(q,q)>105.0*105.0) return 0.0;
  float radius=length(q);
  float phase=fract(t/(5.8+seed*0.31)+seed*0.27);
  float softness=5.5+phase*2.2;
  float ring=exp(-pow((radius-(12.0+phase*72.0))/softness,2.0))*(5.5/softness);
  float angle=atan(q.y,q.x);
  float broken=smoothstep(0.25,0.82,sin(angle*2.3+seed+sin(angle*4.0+seed+phase*0.9)*0.65));
  return ring*broken*sin(phase*3.14159)*(1.0-phase)*0.20;
}
// Disconnected satin-like flecks of refracted light. They evolve locally on
// the existing clock; no thresholded wave crests, cells or scrolling texture.
float lightFragments(float2 p,float t) {
  float2 uv=p+waterRefraction(p,t)*0.8;
  float2 warp=float2(wwNoise(p/130.0+9.7),wwNoise(p/115.0+2.3))-0.5;
  float grain=wwNoise(uv/float2(23.0,14.0)+warp*1.9);
  float islands=smoothstep(0.51,0.76,wwNoise(p/145.0+float2(3.9,19.1)));
  float timing=0.73+0.27*sin(t*0.52+wwNoise(p/90.0+8.9)*6.28);
  return smoothstep(0.69,0.88,grain)*islands*timing;
}
half4 main(float2 xy) {
  float2 p=xy/size*float2(2400,1800);
  float wet=openWater.eval(xy).r;
  float distance=shoreline.eval(xy).r*320.0;
  float contact=smoothstep(10.0,52.0,distance);
  float2 fall=(p-float2(1060,185))/float2(150,190);
  float mask=wet*contact*mix(0.35,1.0,smoothstep(0.15,1.2,dot(fall,fall)));
  float edge=smoothstep(-600.0,-500.0,xy.x)*smoothstep(-400.0,-300.0,xy.y)*
    smoothstep(-600.0,-500.0,size.x-xy.x)*smoothstep(-400.0,-300.0,size.y-xy.y);
  mask*=mix(1.0,edge,softEdges);
  if(mask<0.001) return half4(0);
  // Soft signed response to the SAME wave normals as the refracted floor.
  // Broad illumination is secondary to visible underwater deformation.
  float value=waterWaveLight(p,seconds);
  value+=stoneWave(p,float2(568,1338),seconds,1.3)+
    stoneWave(p,float2(2252,870),seconds,2.9)+
    stoneWave(p,float2(1412,1538),seconds,4.6)+
    stoneWave(p,float2(1952,1568),seconds,6.1);
  // Neutral soft-light cannot lay a pale opaque film over the mineral detail.
  float fragments=lightFragments(p,seconds)*mix(0.12,1.0,exp(-distance/220.0));
  float gray=0.5+value*(value>0.0?0.085:0.065)+fragments*0.20;
  float alpha=mask*min(strength*0.75,1.0);
  return half4(float3(gray)*alpha,alpha);
}
`);

type SurfaceRippleLayerProps = {
  active: boolean; enabled?: boolean; opacity?: number; flow?: WaterTopFlow;
  width?: number; height?: number; softWorldEdges?: boolean;
};

function SurfaceRippleLayer({ active, enabled = true, opacity = 0.35,
  width = GARDEN_WORLD_WIDTH, height = GARDEN_WORLD_HEIGHT,
  softWorldEdges = false, flow: sharedFlow }: SurfaceRippleLayerProps) {
  runtimeAudit.render('SurfaceRippleLayer');
  const mask = useGardenImage(require('./assets/water-surface-mask.png'));
  const shoreline = useGardenImage(require('./assets/garden-shore-distance.png'));
  const standalone = useWaterTopFlow(active && !sharedFlow, enabled && !sharedFlow);
  const flow = sharedFlow ?? standalone;
  const uniforms = useDerivedValue(() => ({
    seconds: flow.enabled ? flow.seconds.value : 0,
    strength: Math.max(0, Math.min(1.5, opacity / 0.35)),
    size: [width, height], softEdges: softWorldEdges ? 1 : 0,
  }), [flow.enabled, opacity, width, height, softWorldEdges]);
  if (!enabled || !SURFACE || !mask || !shoreline) return null;
  return <Rect x={-600} y={-400} width={width + 1200} height={height + 800} blendMode="softLight">
    <Shader source={SURFACE} uniforms={uniforms}>
      <ImageShader image={mask} rect={{ x: 0, y: 0, width, height }} fit="fill" tx="clamp" ty="clamp" />
      <ImageShader image={shoreline} rect={{ x: 0, y: 0, width, height }} fit="fill" tx="clamp" ty="clamp" />
    </Shader>
  </Rect>;
}
export default memo(SurfaceRippleLayer);
