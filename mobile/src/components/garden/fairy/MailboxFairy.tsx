import { Group, ImageShader, Rect, Shader, Skia, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

// Original RGBA atlas sampled at native resolution. Each pose uses its measured
// sole pivot, so the head turns and hands unfold without moving the planted feet.
// Premultiplied interpolation preserves translucent wing edges between key poses.
const effect=Skia.RuntimeEffect.Make(`
uniform shader atlas;
uniform float frame;
uniform float breath;
half4 pose(float2 p, float index) {
  float2 q=p/.205;
  float4 bounds;
  if(index<.5) { q+=float2(235.,620.); bounds=float4(0.,0.,452.,627.); }
  else if(index<1.5) { q+=float2(658.,620.); bounds=float4(452.,0.,879.,627.); }
  else if(index<2.5) { q.x=-q.x; q+=float2(1080.,620.); bounds=float4(879.,0.,1254.,627.); }
  else if(index<3.5) { q+=float2(235.,1230.); bounds=float4(0.,627.,433.,1254.); }
  else if(index<4.5) { q+=float2(631.,1230.); bounds=float4(433.,627.,836.,1254.); }
  else { q+=float2(1044.,1230.); bounds=float4(836.,627.,1254.,1254.); }
  if(q.x<bounds.x || q.y<bounds.y || q.x>=bounds.z || q.y>=bounds.w) return half4(0.);
  return atlas.eval(q);
}
half4 main(float2 p) {
  // Less than half a world unit of upper-body breathing; feet remain grounded.
  p.y+=breath*(1.-smoothstep(-65.,-8.,p.y));
  float a=floor(frame), b=min(5.,a+1.);
  return mix(pose(p,a),pose(p,b),fract(frame));
}`);
const ease=(v:number)=>{'worklet';const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
type Props={x:SharedValue<number>;y:SharedValue<number>;phase:SharedValue<number>;elapsedMs:SharedValue<number>;opacity:SharedValue<number>};
export default function MailboxFairy({x,y,phase,elapsedMs,opacity}:Props){
  const atlas=useImage(require('@/assets/garden/fairy/mailbox-v1/poses.webp'));
  const transform=useDerivedValue(()=>[{translateX:x.value},{translateY:y.value}]);
  const uniforms=useDerivedValue(()=>{
    const ms=elapsedMs.value;
    const frame=phase.value===1?ease((ms-400)/350):phase.value===2?
      (ms<550?1+ease(ms/550):2+ease((ms-550)/550)):
      (ms<450?3+ease(ms/450):4+ease((ms-450)/550));
    return {frame,breath:.3*Math.sin(ms/900)};
  });
  if(!atlas||!effect)return null;
  return <Group transform={transform} opacity={opacity}>
    <Rect x={-65} y={-135} width={130} height={145}>
      <Shader source={effect} uniforms={uniforms}>
        <ImageShader image={atlas} rect={{x:0,y:0,width:1254,height:1254}} fit="fill" sampling={{B:0,C:.5}} tx="decal" ty="decal"/>
      </Shader>
    </Rect>
  </Group>;
}
