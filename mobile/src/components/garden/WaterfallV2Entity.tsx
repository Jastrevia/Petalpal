import { Group, Image, ImageShader, Rect, Shader, Skia, useImage } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { useWaterTopFlow } from './water/WaterTopAssembly';
import WaterfallV2Spray from './water/WaterfallV2Spray';
import WaterfallV2Impact from './water/WaterfallV2Impact';
import { WATERFALL_V2_SHORT_BANDS, WATERFALL_V2_ORIGINAL_BANDS } from './waterfallV2Proportions';
import { INITIAL_WATERFALL_V2_PLACEMENT, WATERFALL_V2_CONTENT_OFFSET_Y, WATERFALL_V2_HEIGHT as HEIGHT, WATERFALL_V2_WIDTH as WIDTH } from './waterfallV2Placement';

export const WATERFALL_V2_ASSET = require('@/assets/garden/landmarks/waterfall-v2/waterfall-v2-compact-r3.webp');

// One painted landform avoids a compositing seam at the lip. A spatial flow
// field transports painted water detail; neither the banks nor alpha move.
// Three overlapping parcels hide resets, with a second independently timed
// detail field to avoid a single sliding sheet. No added white line primitives.
const FLOW = Skia.RuntimeEffect.Make(`
uniform shader painting;
uniform float seconds;
uniform float enabled;
float hash(float2 p) { return fract(sin(dot(p,float2(127.1,311.7)))*43758.5453); }
float noise(float2 p) {
  float2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+float2(1,0)),f.x),
             mix(hash(i+float2(0,1)),hash(i+float2(1,1)),f.x),f.y);
}
float water(half4 c) {
  float3 rgb=c.rgb/max(c.a,0.001);
  float aqua=smoothstep(0.015,0.085,min(rgb.g-rgb.r,rgb.b-rgb.r));
  float aerated=smoothstep(0.84,0.96,min(rgb.r,min(rgb.g,rgb.b)))*0.65;
  return max(aqua,aerated)*smoothstep(0.5,0.9,c.a);
}
float2 channel(float y) {
  float2 bounds=mix(float2(315,660),float2(365,715),smoothstep(0.0,320.0,y));
  return mix(bounds,float2(410,700),smoothstep(320.0,565.0,y));
}
half3 parcel(float2 p,float2 velocity,float period,float seed,float distortion,half4 original) {
  half3 sum=half3(0); float total=0.0;
  float offset=noise(float2(p.x/180.0,seed))*0.22;
  for(int i=0;i<3;i++) {
    float phase=fract(seconds/period+float(i)/3.0+offset);
    float w=0.5-0.5*cos(6.2831853*phase);
    float2 q=p-velocity*period*phase;
    float n=noise(float2(p.x/35.0,p.y/95.0-seconds*0.7)+seed)-0.5;
    q.x+=n*distortion*phase;
    half4 c=painting.eval(q+float2(0,192));
    // Reject any transported rock/vegetation/transparent sample.
    float safe=water(c);
    half3 rgb=mix(original.rgb/max(original.a,0.001),c.rgb/max(c.a,0.001),safe);
    sum+=rgb*w; total+=w;
  }
  return sum/max(total,0.001);
}
half4 poolTransition(half4 color,float2 p,float edge) {
  half3 rgb=color.rgb/max(color.a,0.001);
  // Grade only the wet falling sheet, retaining its painted light/dark detail
  // and original alpha. Pale cliff flecks outside this channel stay untouched.
  float falling=smoothstep(510.0,650.0,p.y)*(1.0-smoothstep(1540.0,1770.0,p.y));
  falling*=1.0-smoothstep(158.0,210.0,abs(p.x-550.0));
  float fallWet=water(painting.eval(p+float2(0,192)));
  float cold=max(rgb.b-rgb.g,0.0);
  half3 aqua=rgb+half3(cold*0.08,cold*0.30,-cold*0.65);
  rgb=mix(rgb,aqua,falling*fallWet*mix(0.72,1.0,smoothstep(850.0,1500.0,p.y)));
  if(p.y<1460.0)return half4(rgb*color.a,color.a);
  float wet=max(smoothstep(0.015,0.085,min(rgb.g-rgb.r,rgb.b-rgb.r)),
    smoothstep(0.68,0.94,min(rgb.r,min(rgb.g,rgb.b))));
  float downstream=smoothstep(1460.0,1760.0,p.y+(p.x-555.0)*0.12);
  float tone=clamp(dot(rgb,half3(0.25,0.5,0.25)),0.0,1.0);
  half3 pool=mix(half3(0.375,0.680,0.705),half3(0.590,0.835,0.820),tone);
  // Retain painted detail while exchanging outer whitewater for pool color.
  rgb=mix(rgb,pool,downstream*wet*0.78);
  return half4(rgb*color.a,color.a)*edge;
}
half4 main(float2 position) {
  // Match WATERFALL_V2_CONTENT_OFFSET_Y; no artwork or alpha deformation.
  float2 p=position-float2(0,192);
  half4 original=painting.eval(position);
  // Feather only the painted pool skirt, never the falling sheet or rocks.
  // Static and animated views use the same stationary edge blend.
  float3 skirtColor=original.rgb/max(original.a,0.001);
  float skirtWater=max(smoothstep(0.005,0.065,min(skirtColor.g-skirtColor.r,skirtColor.b-skirtColor.r)),
                       smoothstep(0.82,0.95,min(skirtColor.r,min(skirtColor.g,skirtColor.b))));
  float skirt=smoothstep(1515.0,1750.0,p.y+(p.x-555.0)*0.12+18.0*sin(p.x/95.0))*skirtWater;
  float edge=1.0-skirt;
  // No punched-out internal holes: color disperses before the outer alpha fades.
  if(enabled<0.5 || original.a<0.001) return poolTransition(original,p,edge);
  float2 bounds=channel(p.y);
  float center=(bounds.x+bounds.y)*0.5;
  float across=smoothstep(bounds.x,bounds.x+24.0,p.x)*(1.0-smoothstep(bounds.y-24.0,bounds.y,p.x));
  float upstream=across*(1.0-smoothstep(530.0,615.0,p.y));
  float descent=smoothstep(530.0,625.0,p.y)*(1.0-smoothstep(1430.0,1520.0,p.y));
  float fallCenter=mix(546.0,553.0,smoothstep(575.0,1460.0,p.y));
  float fallWidth=mix(140.0,166.0,smoothstep(575.0,1460.0,p.y));
  descent*=1.0-smoothstep(fallWidth-18.0,fallWidth,abs(p.x-fallCenter));
  float wet=water(original);
  float2 impact=(p-float2(555,1545))/float2(285,175);
  float foam=(1.0-smoothstep(0.45,1.0,length(impact)))*wet;
  if(wet<0.001 || upstream+descent+foam<0.001) return poolTransition(original,p,edge);
  float pull=smoothstep(250.0,595.0,p.y);
  float eddy=noise(float2(p.x/100.0,p.y/180.0-seconds*0.15))-0.5;
  float2 surfaceVelocity=float2((center-p.x)*0.10+eddy*9.0,40.0+56.0*pull);
  float fallSpeed=195.0+155.0*smoothstep(575.0,1490.0,p.y);
  float2 fallVelocity=float2(eddy*10.0,fallSpeed*(0.9+0.2*noise(float2(p.x/55.0,2.0))));
  half3 rgb=original.rgb/max(original.a,0.001);
  // Broad upstream movement, then accelerating breakup through the fall.
  if(upstream>0.001) {
    half3 upper=parcel(p,surfaceVelocity,2.9,2.7,7.0,original);
    rgb=mix(rgb,upper,upstream*wet*0.95);
  }
  if(descent>0.001) {
    half3 falling=parcel(p,fallVelocity,1.15,8.3,12.0,original)*0.68+
                  parcel(p,fallVelocity*0.72,1.73,17.1,7.0,original)*0.32;
    rgb=mix(rgb,falling,descent*wet*0.97);
  }
  // Local outward current and counter-rotating eddies, confined below the fall.
  // Reuse painted froth detail rather than translating the whole foam mass.
  if(foam>0.001) {
    float bottom=smoothstep(1460.0,1525.0,p.y);
    float2 d=p-float2(555,1515);
    float2 left=p-float2(425,1570),right=p-float2(695,1590);
    float2 swirl=float2(-left.y,left.x)*exp(-dot(left,left)/10000.0)*0.9-
                 float2(-right.y,right.x)*exp(-dot(right,right)/12000.0)*0.8;
    float2 outward=float2(d.x*0.30,28.0+max(d.y,0.0)*0.22)+swirl;
    half3 contact=parcel(p,outward,0.91,29.1,16.0,original)*0.6+
                  parcel(p,outward*0.67+float2(12,-8),1.37,41.7,10.0,original)*0.4;
    half3 previous=parcel(p,float2(impact.x*22.0,impact.y*13.0),0.79,29.1,5.0,original);
    rgb=mix(rgb,mix(previous,contact,bottom),foam*mix(0.82,0.96,bottom));
  }
  return poolTransition(half4(rgb*original.a,original.a),p,edge);
}
`);

export default function WaterfallV2Entity({ active = true, animated = true, proportions = 'short-r1' }: {
  active?: boolean; animated?: boolean; proportions?: 'short-r1' | 'original';
}) {
  const image = useImage(WATERFALL_V2_ASSET);
  const flow = useWaterTopFlow(active, animated);
  const enabled = flow.enabled ? 1 : 0;
  const uniforms = useDerivedValue(() => ({seconds: flow.seconds.value, enabled}), [enabled]);
  if (!image) return null;
  const p = INITIAL_WATERFALL_V2_PLACEMENT;
  const center = {x:p.x+WIDTH*p.scale/2, y:p.y+HEIGHT*p.scale/2};
  const bands = proportions === 'original' ? WATERFALL_V2_ORIGINAL_BANDS : WATERFALL_V2_SHORT_BANDS;
  return <Group>
    <Group origin={center} transform={[{rotate:p.rotation*Math.PI/180}]}>
    <Group transform={[{translateX:p.x},{translateY:p.y},{scale:p.scale}]}>
      {bands.map(band => <Group key={band.start}
        transform={[{translateY:band.translateY},{scaleY:band.scaleY}]}>
      <Group clip={{x:0,y:band.start,width:WIDTH,height:band.end-band.start}}>
      {FLOW ? <Rect x={0} y={0} width={WIDTH} height={HEIGHT}>
        <Shader source={FLOW} uniforms={uniforms}>
          <ImageShader image={image} fit="contain" rect={{x:0,y:0,width:WIDTH,height:HEIGHT}} tx="clamp" ty="clamp" />
        </Shader>
      </Rect> : <Image image={image} x={0} y={0} width={WIDTH} height={HEIGHT} fit="contain" />}
      <Group transform={[{translateY:WATERFALL_V2_CONTENT_OFFSET_Y}]}>
        <WaterfallV2Impact image={image} seconds={flow.seconds} enabled={flow.enabled} />
        <WaterfallV2Spray seconds={flow.seconds} enabled={flow.enabled} />
      </Group>
      </Group>
      </Group>)}
    </Group>
    </Group>
  </Group>;
}
