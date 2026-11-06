import {Group,ImageShader,Rect,Shader,Skia,useImage} from '@shopify/react-native-skia';
import {useDerivedValue,useReducedMotion,useSharedValue,type SharedValue} from 'react-native-reanimated';
import {teaSipPhase} from './teaAnimation';
// Registered two-pose sheet: fixed skirt/seat pivot, slow cup lift, sip hold,
// then lower. Premultiplied interpolation avoids dark transparent edges.
// Explicit Catmull-Rom sampling preserves fine sprite detail; the implicit
// ImageShader cubic default softens it. Source PNG and draw size stay intact.
const effect=Skia.RuntimeEffect.Make(`
uniform shader sprite;
uniform float sip;
uniform float breath;
half4 main(float2 p){
 float2 q=p/float2(440.,640.)*float2(724.,1086.);
 // The fixed lap and skirt keep the character planted in the chair.
 float upper=1.-smoothstep(480.,650.,q.y);
 q.y+=breath*upper;
 float head=(1.-smoothstep(125.,180.,length((q-float2(400.,205.))*float2(1.,.8))));
 float2 relative=q-float2(405.,330.);
 q+=float2(-relative.y,relative.x)*(.012*sip*head);
 // Register the cup/forearm between the two authored poses before blending.
 // This gives a small continuous lift rather than two ghosted cup positions.
 float arm=smoothstep(155.,220.,q.x)*(1.-smoothstep(370.,455.,q.x))
   *smoothstep(225.,280.,q.y)*(1.-smoothstep(440.,510.,q.y));
 float2 lift=float2(38.,-48.)*arm;
 half4 rest=sprite.eval(q-lift*sip);
 half4 drink=sprite.eval(q+lift*(1.-sip)+float2(692.,0.));
 return mix(rest,drink,sip*upper);
}`);
export default function TeaFairy({state,seconds:sharedSeconds}:{state:'seatedAtTea'|'drinkingTea'|null;seconds?:SharedValue<number>}){
 const sprite=useImage(require('@/assets/garden/fairy/tea-v1/poses.webp'));
 const stationarySeconds=useSharedValue(0),seconds=sharedSeconds??stationarySeconds;
 const reduced=useReducedMotion();
 // The existing Fairy scheduler owns this clock; no second RAF loop.
 const uniforms=useDerivedValue(()=>({sip:reduced?0:teaSipPhase(seconds.value),breath:reduced?0:1.3*Math.sin(seconds.value*1.2)}));
 if(!sprite||!effect||!state)return null;
 return <Group transform={[{translateX:995},{translateY:170}]}><Rect x={0} y={0} width={440} height={640}>
 <Shader source={effect} uniforms={uniforms}><ImageShader sampling={{B:0,C:0.5}} image={sprite} rect={{x:0,y:0,width:1448,height:1086}} fit="fill" tx="decal" ty="decal"/></Shader>
 </Rect></Group>;
}
