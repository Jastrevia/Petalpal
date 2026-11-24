import { Group, ImageShader, Rect, Shader, Skia, rect, useImage, type Transforms3d } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { WIND_DIR, type WeatherLook } from './gardenWeather';

// Sky effects drawn into the painted Garden in world space, inside the scene's colour layer so the
// weather and night grades fall on them like on everything else. Cloud shadows multiply the painting
// (the ground under a cloud is the same ground, less lit); mist hangs over it, thicker far away and
// low over the water. Both travel with the wind.

const REGION = rect(-700, -800, 3800, 3400);

export const SKY_NOISE = `
float skyHash(float2 p) {
  float3 q=fract(float3(p.x,p.y,p.x)*0.1031);
  q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);
}
float skyNoise(float2 p) {
  float2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(skyHash(i),skyHash(i+float2(1,0)),f.x),mix(skyHash(i+float2(0,1)),skyHash(i+1.0),f.x),f.y);
}
float skyFbm(float2 p) {
  float v=0.0,a=0.5;
  for(int i=0;i<5;i++){v+=a*skyNoise(p);p=p*2.03+float2(17.1,9.3);a*=0.5;}
  return v;
}
float skyGust(float2 p,float t) {
  float along=p.x*${WIND_DIR.x}+p.y*${WIND_DIR.y};
  return clamp(0.5+0.34*sin(along*0.0024-t*0.9)+0.18*sin((p.y*0.8-p.x*0.35)*0.005+t*0.53),0.0,1.0);
}
`;

const CLOUDS = Skia.RuntimeEffect.Make(`
uniform float2 drift;
uniform float coverage;
uniform float strength;
uniform float bands;
uniform float seconds;
${SKY_NOISE}
half4 main(float2 p) {
  float2 w=p-drift;
  // Big soft clouds that slowly change shape as they travel, with ragged, thinner edges.
  float body=skyFbm(w/560.0+float2(3.1,seconds*0.0035));
  float rag=skyFbm(w/170.0+float2(seconds*0.008,11.7));
  // fbm stays near 0.5; stretch it so clouds and the sunny gaps between them are distinct.
  float c=clamp((body*0.78+rag*0.22-0.5)*2.8+0.5,0.0,1.0);
  float threshold=mix(0.85,0.12,coverage);
  float cover=smoothstep(threshold-0.08,threshold+0.12,c);
  float shade=cover*strength;
  // Under rain the sky is closed; what moves is the darker curtain of each heavier band.
  shade+=bands*(skyGust(p,seconds)-0.45)*0.32;
  shade=clamp(shade,0.0,1.0);
  return half4(mix(float3(1.0),float3(0.67,0.72,0.82),shade),1.0);
}
`);

const MIST = Skia.RuntimeEffect.Make(`
uniform shader water;
uniform float2 drift;
uniform float density;
uniform float seconds;
uniform float night;
${SKY_NOISE}
half4 main(float2 p) {
  float2 w=p-drift*0.4;
  // Long drifting banks with finer wisps inside them, lying flat in the three-quarter view.
  float banks=skyFbm(float2(w.x/560.0,w.y/250.0)+float2(seconds*0.005,0.0));
  float wisps=skyFbm(float2(w.x/170.0,w.y/90.0)-float2(seconds*0.011,seconds*0.002));
  float m=banks*0.72+wisps*0.28;
  float far=1.0-smoothstep(-350.0,1900.0,p.y);
  float onWater=water.eval(clamp(p,float2(0.0),float2(2399.0,1799.0))).r;
  float a=0.26+0.5*smoothstep(0.38,0.74,m)+0.26*far;
  // Mist lies lowest and thickest over the water.
  a+=onWater*0.22*smoothstep(0.3,0.72,wisps);
  a=clamp(a*density,0.0,0.9);
  float3 color=mix(float3(0.84,0.87,0.88),float3(0.94,0.95,0.96),smoothstep(0.3,0.8,m));
  // Drawn after the night grade: at night the mist is the dark blue-grey of the night air.
  color=mix(color,float3(0.15,0.19,0.28)+float3(0.06,0.06,0.07)*m,night);
  // Thinner by night, so the lanterns still glow through it.
  a*=1.0-0.42*night;
  return half4(color*a,a);
}
`);

type SkyProps = {
  look: SharedValue<WeatherLook>; seconds: SharedValue<number>; travel: SharedValue<number>;
  cameraTransform: SharedValue<Transforms3d>; day: SharedValue<number>;
};

/** Cloud shadows passing over the Garden; only by day, when there is sun for clouds to block. */
export function CloudShadowLayer({ look, seconds, travel, cameraTransform, day }: SkyProps) {
  const uniforms = useDerivedValue(() => {
    const l = look.value;
    return {
      drift: [travel.value * WIND_DIR.x, travel.value * WIND_DIR.y],
      coverage: Math.min(1, l.clouds),
      // A closed, wet sky gives diffuse light: fewer distinct shadows, more of the moving rain bands.
      strength: l.clouds * (1 - 0.8 * l.wet) * day.value,
      bands: l.rain * (0.55 + 0.45 * day.value),
      seconds: seconds.value,
    };
  });
  if (!CLOUDS) return null;
  return <Group transform={cameraTransform}>
    <Rect rect={REGION} blendMode="multiply"><Shader source={CLOUDS} uniforms={uniforms} /></Rect>
  </Group>;
}

/** Mist in the air over the Garden. */
export function MistLayer({ look, seconds, travel, cameraTransform, night }: Omit<SkyProps, 'day'> & { night: SharedValue<number> }) {
  const mask = useImage(require('../water/assets/water-surface-mask.png'));
  const uniforms = useDerivedValue(() => ({
    drift: [travel.value * WIND_DIR.x, travel.value * WIND_DIR.y],
    density: look.value.fog,
    seconds: seconds.value,
    night: night.value,
  }));
  if (!MIST || !mask) return null;
  return <Group transform={cameraTransform}>
    <Rect rect={REGION}>
      <Shader source={MIST} uniforms={uniforms}>
        <ImageShader image={mask} fit="fill" rect={rect(0, 0, 2400, 1800)} />
      </Shader>
    </Rect>
  </Group>;
}
