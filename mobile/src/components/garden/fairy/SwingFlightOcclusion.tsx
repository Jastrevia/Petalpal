import { Group, Image, useImage } from '@shopify/react-native-skia';
import { SWING_MAP_X as x, SWING_MAP_Y as y, SWING_MAP_SCALE as scale, SWING_MAP_ROTATION } from '../swingMapPlacement';

// Repaint the existing unoccupied backrest above the approaching flyer. This
// uses precisely SwingEntity's registration: no new art or landmark transform.
// Once seated, SwingEntity owns the sprite and the animated backrest together.
export default function SwingFlightOcclusion(){
  const image=useImage(require('@/assets/garden/landmarks/swing/swing-moving-front.webp'));
  return image?<Group origin={{x:x+656*scale,y:y+599.5*scale}} transform={[{rotate:SWING_MAP_ROTATION*Math.PI/180}]}>
    <Image image={image} x={x+350*scale} y={y+569*scale}
      width={1495*.36*scale} height={1052*.36*scale} fit="fill"/>
  </Group>:null;
}
