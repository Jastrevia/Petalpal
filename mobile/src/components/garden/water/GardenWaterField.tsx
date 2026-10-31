import { runtimeAudit } from '../performance/runtimeAudit';
import { Image, ImageShader, Rect, Shader, Skia, useImage, type SkImage } from '@shopify/react-native-skia';
import { Platform } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { useWaterTopFlow, type WaterTopFlow } from './WaterTopAssembly';
import { WATER_WAVE_SKSL } from './waterWaveShader';
import { GARDEN_WATER_COLOR } from '../gardenMapLayout';

// A colored mineral bed seen through clear aqua, rather than relief added over
// an opaque cyan wash. The original shore-distance map controls transmission;
// geometry, shoreline masks and the shared refraction remain untouched.
const FIELD = Skia.RuntimeEffect.Make(`
uniform shader mineralFloor;
uniform shader shoreDistance;
uniform shader openWater;
uniform float displayP3;
uniform float seconds;
${WATER_WAVE_SKSL}
float3 linearize(float3 c) {
  return mix(c/12.92,pow((c+0.055)/1.055,float3(2.4)),step(float3(0.04045),c));
}
float3 encode(float3 c) {
  return mix(c*12.92,1.055*pow(max(c,float3(0)),float3(1.0/2.4))-0.055,step(float3(0.0031308),c));
}
// Stable world-space variation separates mineral shelves from calm open pools.
float floorHash(float2 p) {
  float3 q=fract(float3(p.x,p.y,p.x)*0.1031);
  q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);
}
float floorNoise(float2 p) {
  float2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(floorHash(i),floorHash(i+float2(1,0)),f.x),
    mix(floorHash(i+float2(0,1)),floorHash(i+1.0),f.x),f.y);
}
float cove(float2 p,float2 center,float2 radius) {
  float2 q=(p-center)/radius;return exp(-dot(q,q)*2.0);
}
float bankDistance(float2 p,float2 a,float2 b) {
  float2 ab=b-a;
  return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0));
}
float3 softFloor(float2 q,float radius) {
  return (mineralFloor.eval(q).rgb*2.0+
    mineralFloor.eval(q+float2(radius,radius*0.63)).rgb+
    mineralFloor.eval(q-float2(radius*0.71,radius)).rgb)*0.25;
}
half4 main(float2 p) {
  float2 outside=max(max(-p,p-float2(2400,1800)),float2(0));
  float distance=shoreDistance.eval(clamp(p,float2(0),float2(2400,1800))).r*320.0+length(outside);
  // Existing coves retain their positions. Shelf reach varies by mineral bed,
  // so detailed shallows taper into channels without an island-wide edge ring.
  float priority=max(max(cove(p,float2(340,1480),float2(280,185)),
    cove(p,float2(2090,230),float2(220,170))),
    max(cove(p,float2(1680,1640),float2(260,180)),
    max(cove(p,float2(1640,1090),float2(220,290)),
        cove(p,float2(1040,250),float2(190,170)))));
  float2 drift=float2(floorNoise(p/370.0+7.1),floorNoise(p/310.0+23.4))-0.5;
  float deposits=floorNoise(p/210.0+drift*0.85)*0.72+
    floorNoise(p/83.0+11.7)*0.28;
  float bedPatch=smoothstep(0.25,0.72,deposits);
  // Submerged extensions of the existing terrain, including the negative-y
  // water exposed by the portrait camera. These are broken mineral shelves,
  // not new land or a dilated bright shoreline ring.
  float upperLeft=max(cove(p,float2(330,-70),float2(340,245)),
    max(cove(p,float2(680,-220),float2(285,205)),
        cove(p,float2(835,65),float2(180,255))));
  float upperRight=max(cove(p,float2(1240,-5),float2(210,230)),
    max(cove(p,float2(1510,-165),float2(330,220)),
    max(cove(p,float2(1870,-30),float2(305,245)),
        cove(p,float2(2210,240),float2(245,300)))));
  float bridgeShelf=cove(p,float2(1700,355),float2(150,210));
  float upperBed=max(max(upperLeft,upperRight),bridgeShelf);
  upperBed*=mix(0.55,1.0,bedPatch);
  float opticalDepth=distance/(1.0+priority*0.30);
  // Keep the detailed bed close to irregular banks. The broader transition is
  // midwater, not a second crisp mineral shelf spanning the open pools.
  float shelf=max(exp(-pow(opticalDepth/mix(66.0,144.0,bedPatch),1.65)),upperBed*0.91);
  float midwater=max(1.0-smoothstep(92.0,275.0,opticalDepth),sqrt(upperBed)*0.90);
  float visibleDepth=min(opticalDepth,mix(255.0,38.0,upperBed));

  // Clear, broad blue-green depth transitions. There is no pale surface wash;
  // the quiet pools carry much less fine detail than the submerged shelves.
  float poolTone=floorNoise(p/650.0+float2(29.3,7.8));
  float3 water=mix(float3(0.275,0.590,0.650),float3(0.390,0.730,0.770),poolTone);
  // Mid-scale translucent planes are visible even in quiet pools. They carry
  // the reference's layered aqua, without surface lines or white mist.
  float plane=floorNoise(p/145.0+drift*1.1);
  float broadPlane=floorNoise(p/310.0+float2(41.3,9.2));
  water+=float3(0.070,0.087,0.075)*(plane-0.5);
  water=mix(water,float3(0.380,0.745,0.775),
    smoothstep(0.49,0.80,broadPlane)*0.20+upperBed*0.10);
  float channel=max(cove(p,float2(1720,745),float2(300,210)),
    max(cove(p,float2(1570,1210),float2(235,300)),
    max(cove(p,float2(1450,1620),float2(350,190)),
        cove(p,float2(650,1420),float2(370,220)))));
  water=mix(water,float3(0.315,0.655,0.710),
    channel*smoothstep(28.0,175.0,distance)*0.28);

  // Only the receiving pool: a continuous aqua basin replaces the dark,
  // cloudy floor response. The actual bank distance keeps its edges shallow;
  // the deeper outflow eases downstream without a painted shadow footprint.
  float2 receiving=(p-float2(1025,285))/float2(205,185);
  float receivingPool=1.0-smoothstep(0.48,1.20,length(receiving));
  float poolShallow=1.0-smoothstep(24.0,125.0,distance);
  // Shallows follow the two uneven rock shoulders and turn southwest at the
  // lower bank. Keep the center open instead of tracing a closed basin ring.
  float bankToe=min(bankDistance(p,float2(980,155),float2(950,305)),
    min(bankDistance(p,float2(1120,160),float2(1110,290)),
        bankDistance(p,float2(1110,290),float2(995,365))));
  float basinShelf=exp(-pow(bankToe/(32.0+bedPatch*15.0),2.0))*receivingPool;
  poolShallow=max(poolShallow,basinShelf*0.88);
  float outflowDepth=cove(p,float2(1040,240),float2(150,195))*(1.0-poolShallow);
  float3 clearPool=mix(float3(0.465,0.745,0.765),float3(0.355,0.650,0.705),outflowDepth);
  clearPool+=(floorNoise(p/195.0+float2(6.2,17.4))-0.5)*0.018;
  // A little aerated aqua light carries beyond the falling sheet. It colors
  // the water beneath the mineral bed, so the clear floor remains readable.
  float impactLight=cove(p,float2(1040,235),float2(130,180))*
    smoothstep(8.0,48.0,distance)*0.20;
  clearPool=mix(clearPool,float3(0.660,0.865,0.835),impactLight);
  water=mix(water,clearPool,receivingPool);

  float refractionMask=openWater.eval(p).r*smoothstep(14.0,62.0,distance);
  float2 refracted=p+waterRefraction(p,seconds)*refractionMask;
  float2 q=float2(refracted.x*0.932-refracted.y*0.362,refracted.x*0.362+refracted.y*0.932)*0.64+drift*80.0;
  // One coherent painted bed: overlapping two displaced textures had softened
  // distinct mineral edges into clouds. Only deeper water softens this sample.
  float3 detail=softFloor(q+float2(183,97),mix(0.16,2.1,smoothstep(80.0,255.0,visibleDepth)));
  float luminance=dot(detail,float3(0.2126,0.7152,0.0722));
  float face=smoothstep(0.53,0.79,luminance);
  float warmDeposit=smoothstep(0.46,0.73,floorNoise(p/155.0+float2(8.7,24.1)));
  // Recover limestone, pale tan and olive mineral color from the existing
  // painted faces. Cool interstices stay aqua rather than becoming brown mud.
  float3 coolMineral=mix(float3(0.230,0.530,0.580),float3(0.645,0.840,0.805),face);
  float3 warmMineral=mix(float3(0.420,0.510,0.415),float3(0.915,0.855,0.685),face);
  float mineralWarmth=warmDeposit*0.90*smoothstep(0.68,0.94,face)*mix(0.12,1.0,shelf);
  float3 mineral=mix(coolMineral,warmMineral,mineralWarmth);
  float crevice=1.0-smoothstep(0.46,0.61,luminance);
  mineral=mix(mineral,float3(0.285,0.555,0.565),crevice*0.36);
  // Reuse the same mineral faces, with luminous aqua interstices. Preserve
  // sparse warm shallow hints without darkening the entire pool into a cloud.
  float3 poolMineral=mix(float3(0.410,0.665,0.685),float3(0.705,0.835,0.790),face);
  poolMineral=mix(poolMineral,warmMineral,mineralWarmth*poolShallow*0.55);
  mineral=mix(mineral,poolMineral,receivingPool);
  // Warm faces retain their color at the surface; depth progressively filters
  // them toward blue-green. This is bottom transmission, never a white veil.
  float depthTint=mix(0.04,0.24,smoothstep(40.0,350.0,visibleDepth));
  float3 submerged=mix(mineral,water,depthTint);
  // Three continuous visibility zones: clear rich shelves, quieter midwater,
  // then almost texture-free pools. Rare low-contrast mineral hints interrupt
  // the broad aqua depth field without revealing a tiled floor everywhere.
  float openHint=0.10+smoothstep(0.40,0.76,deposits)*0.10;
  float middleHint=0.25+bedPatch*0.18;
  float transmission=mix(openHint,middleHint,midwater);
  transmission=mix(transmission,0.58+pow(bedPatch,1.35)*0.39,shelf);
  float poolTransmission=mix(0.16,0.48+bedPatch*0.12,poolShallow);
  transmission=mix(transmission,poolTransmission,receivingPool);
  float3 rgb=mix(water,submerged,transmission);
  // A few light-facing mineral edges catch pale aqua light. Interrupt them by
  // deposit, not wave cells: no continuous white caustic network or surface film.
  float neighbor=dot(mineralFloor.eval(q+float2(181,95)).rgb,float3(0.2126,0.7152,0.0722));
  float edge=smoothstep(0.035,0.13,neighbor-luminance)*smoothstep(0.60,0.78,luminance);
  float glint=edge*smoothstep(0.50,0.76,floorNoise(p/97.0+19.7))*shelf;
  rgb=mix(rgb,float3(0.78,0.90,0.86),glint*0.18);
  if(displayP3>0.5) {
    float3 c=linearize(rgb);
    rgb=encode(float3(dot(c,float3(0.822593,0.177534,0)),
      dot(c,float3(0.033200,0.966784,0)),dot(c,float3(0.017085,0.072396,0.910302))));
  }
  return half4(rgb,1);
}
`);

export default function GardenWaterField({ image, active, animated = true, flow }: {
  image: SkImage; active: boolean; animated?: boolean; flow?: WaterTopFlow;
}) {
  runtimeAudit.render('GardenWaterField');
  const material = useImage(require('./assets/painterly-water-base.png'));
  const floor = useImage(require('./assets/ornamental-water-floor.png'));
  const shore = useImage(require('./assets/garden-shore-distance.png'));
  const wet = useImage(require('./assets/water-surface-mask.png'));
  const standalone = useWaterTopFlow(active && !flow, animated && !flow);
  const clock = flow ?? standalone;
  const displayP3 = Platform.OS === 'web' ? 1 : 0;
  const uniforms = useDerivedValue(() => ({
    displayP3, seconds: clock.enabled ? clock.seconds.value : 0,
  }), [displayP3, clock.enabled, clock.seconds]);
  const base = material ?? image;
  // While the field's textures load: the solid water colour under the base painting, as the scene drew before.
  if (!FIELD || !floor || !shore || !wet) return <>
    <Rect x={-2400} y={-2400} width={7200} height={6600} color={GARDEN_WATER_COLOR} />
    <Image image={base} x={0} y={0} width={2400} height={1800} fit="fill" />
  </>;
  return <Rect x={-2400} y={-2400} width={7200} height={6600}>
    <Shader source={FIELD} uniforms={uniforms}>
      <ImageShader image={floor} rect={{ x: 0, y: 0, width: 2400, height: 1800 }} fit="fill" tx="mirror" ty="mirror" />
      <ImageShader image={shore} rect={{ x: 0, y: 0, width: 2400, height: 1800 }} fit="fill" tx="clamp" ty="clamp" />
      <ImageShader image={wet} rect={{ x: 0, y: 0, width: 2400, height: 1800 }} fit="fill" tx="clamp" ty="clamp" />
    </Shader>
  </Rect>;
}
