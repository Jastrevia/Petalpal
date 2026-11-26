import { ImageShader, Rect, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import scenic from './terrain/upper-right-scenic.json';

// Shared with bakeGardenGround.py: a local, irregular opening above the tea
// island. Foreground islands/paths still draw above this decorative scenery.
const c = scenic.cutout;
const n = (value: number) => value.toFixed(4);
const OPENING = `
float scenicCoverage(float2 p) {
  float bottom = ${n(c.bottomBase)} + ${n(c.bottomWaveAmplitude)}
    * sin((p.x - ${n(c.bottomWaveOriginX)}) / ${n(c.bottomWaveScale)})
    + max(0.0, p.x - ${n(c.rightRiseStartX)}) * ${n(c.rightRiseSlope)};
  return smoothstep(${n(c.leftStart)}, ${n(c.leftEnd)}, p.x)
    * (1.0 - smoothstep(bottom - ${n(c.bottomFeather)}, bottom + ${n(c.bottomFeather)}, p.y));
}
`;
const EXCLUDE = Skia.RuntimeEffect.Make(`
uniform shader originalTerrain;
${OPENING}
half4 main(float2 p) { return originalTerrain.eval(p) * (1.0 - scenicCoverage(p)); }
`);
const SCENERY = Skia.RuntimeEffect.Make(`
uniform shader painting;
${OPENING}
half4 main(float2 p) { return painting.eval(p) * scenicCoverage(p); }
`);
export function ScenicExclusion({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled && EXCLUDE ? <Shader source={EXCLUDE}>{children}</Shader> : <>{children}</>;
}

export default function GardenUpperRightScenery({ image }: { image: SkImage }) {
  return <>
    {SCENERY && <Rect {...scenic.bounds}><Shader source={SCENERY}>
      <ImageShader image={image} rect={scenic.bounds} fit="fill" tx="decal" ty="decal" />
    </Shader></Rect>}
  </>;
}
