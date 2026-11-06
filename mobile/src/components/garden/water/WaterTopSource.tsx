import { Group, ImageShader, Rect, Shader, Skia, useImage } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { type WaterTopPlacement } from '../waterTopPlacement';
import { useWaterTopFlow } from './WaterTopAssembly';

export const WATER_TOP_SOURCE = require('@/assets/garden/water/water-top/water-top-cliff-source-v2.webp');
// The complete corrected painting remains one layer. Only safe open-water RGB
// samples move; original alpha, rocks, submerged stones and lip stay fixed.
const SOURCE_FLOW = Skia.RuntimeEffect.Make(`
uniform shader painting;
uniform float seconds;
uniform float enabled;
half4 main(float2 p) {
  half4 original = painting.eval(p);
  float downstream = smoothstep(1700.0,2370.0,p.y);
  float center = mix(780.0,790.0,downstream);
  float halfWidth = mix(180.0,130.0,downstream);
  float inside = 1.0-smoothstep(halfWidth*0.55,halfWidth,abs(p.x-center));
  inside *= smoothstep(20.0,100.0,p.y)*(1.0-smoothstep(2330.0,2420.0,p.y));
  float2 velocity = float2((center-p.x)*0.045,22.0+22.0*downstream);
  float a = fract(seconds/4.0), b = fract(seconds/4.0+0.5);
  float weight = 1.0-abs(2.0*a-1.0);
  half4 first = painting.eval(p-velocity*4.0*a);
  half4 second = painting.eval(p-velocity*4.0*b);
  half3 moving = mix(second.rgb/max(second.a,0.001),first.rgb/max(first.a,0.001),weight);
  return half4(mix(original.rgb,moving*original.a,inside*enabled*0.8),original.a);
}
`);
if (!SOURCE_FLOW) throw new Error('Water-top source flow shader compilation failed');

export default function WaterTopSource({ placement, active, animated }: {
  placement: WaterTopPlacement; active: boolean; animated: boolean;
}) {
  const image = useImage(WATER_TOP_SOURCE);
  const flow = useWaterTopFlow(active, animated);
  const enabled = flow.enabled ? 1 : 0;
  const uniforms = useDerivedValue(() => ({ seconds: flow.seconds.value, enabled }), [enabled]);
  if (!image) return null;
  const center = { x: placement.x+1536*placement.scale/2, y: placement.y+1024*placement.scale/2 };
  return <Group origin={center} transform={[{ rotate: placement.rotation*Math.PI/180 }]}>
    <Group transform={[{translateX:placement.x},{translateY:placement.y},{scale:placement.scale}]}>
      {/* Extend upstream without changing the approved placement or rotation pivot. */}
      <Group transform={[{translateY:-1536}]}>
      <Rect x={0} y={0} width={1536} height={3072}>
        <Shader source={SOURCE_FLOW!} uniforms={uniforms}>
          <ImageShader image={image} fit="contain" rect={{x:0,y:0,width:1536,height:3072}} tx="clamp" ty="clamp" />
        </Shader>
      </Rect>
      </Group>
    </Group>
  </Group>;
}
