import { Group, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import SheetFrame from '../SheetFrame';

// Her flight in painted frames: about a second of a generated flying clip (wings beating, petal
// dress rippling, a little bob), cut back to her original glide canvas (112 × 150 at -78, -135)
// and cross-faded at the seam (scripts/critters/video-frames.py --blend). 12 frames, 225 × 300
// each, played in time; with reduced motion she holds the first.
const FLY = { columns: 6, count: 12, fps: 12, w: 225, h: 300 };
const TRANSFORM = [{ translateX: -78 }, { translateY: -135 }, { scaleX: 112 / FLY.w }, { scaleY: 150 / FLY.h }];

export default function FlyingFairy({seconds,blend}:{seconds:SharedValue<number>;blend:SharedValue<number>}){
  const sheet=useImage(require('@/assets/garden/fairy/fly-video-v1/fly.webp'));
  const reducedMotion=useReducedMotion();
  const frame=useDerivedValue(()=>(reducedMotion?0:Math.floor(seconds.value*FLY.fps)%FLY.count),[reducedMotion]);
  if(!sheet)return null;
  return <Group opacity={blend}>
    <Group transform={TRANSFORM}>
      <SheetFrame sheet={sheet} frame={frame} columns={FLY.columns} count={FLY.count} w={FLY.w} h={FLY.h}/>
    </Group>
  </Group>;
}
