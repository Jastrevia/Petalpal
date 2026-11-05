import { ImageShader, Rect, Shader, Skia, type SkImage } from '@shopify/react-native-skia';
import { memo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { OTTER_WATER_RECT, OTTER_WATER_SHADER } from './otterWaterEffect';
import SheetFrame from '../SheetFrame';

const EFFECT = Skia.RuntimeEffect.Make(OTTER_WATER_SHADER);

/** One bounded GPU pass: existing animation + tail fade + animated water.
 * The parent retains screen compositing, camera/heading, and plant/bridge masks. */
export default memo(function OtterWaterSpirit({sheet,frame,seconds,motion,bend,reduced}:{
  sheet:SkImage;frame:SharedValue<number>;seconds:SharedValue<number>;motion:SharedValue<number>;
  bend:SharedValue<number>;reduced:boolean;
}) {
  const uniforms=useDerivedValue(()=>({frame:frame.value,seconds:seconds.value,
    motion:reduced?0:motion.value,bend:bend.value*(reduced?.5:1)}),[reduced]);
  // Preserve the established appearance if this device cannot compile the effect.
  if(!EFFECT) return <SheetFrame sheet={sheet} frame={frame} columns={10} count={62} w={304} h={180}/>;
  return <Rect {...OTTER_WATER_RECT}><Shader source={EFFECT} uniforms={uniforms}>
    <ImageShader image={sheet} rect={{x:0,y:0,width:3040,height:1260}} fit="fill" tx="decal" ty="decal"/>
  </Shader></Rect>;
});
