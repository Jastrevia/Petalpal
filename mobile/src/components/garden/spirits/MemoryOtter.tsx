import { ColorMatrix, Group, Image, Mask, Paint, Rect, useImage } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useAnimatedReaction, useDerivedValue, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import OtterWaterSpirit from './OtterWaterSpirit';
import type { LotusOccluder } from '../water/LotusLayer';
import { advanceSwim, createSwim, getSwimNetwork, OTTER_SPEED, type SwimNetwork } from './otterSwims';

const ART = require('@/assets/garden/spirits/otter-swim.webp');
const SWIM = { columns: 10, count: 62, fps: 12, w: 304, h: 180 };
const LENGTH = 150;
const NO_LOTUS: readonly LotusOccluder[] = [];
// Exact, lossless registered crops of the EXISTING infrastructure. These mask
// only the otter; they never redraw, recolor or move the bridges in the Garden.
const OCCLUDERS = [
  {source:require('@/assets/garden/runtime/infrastructure/final/B02_bridge.png'),x:1526,y:458,width:306,height:208},
  {source:require('@/assets/garden/runtime/infrastructure/final/B01_bridge.png'),x:1571,y:1236,width:317,height:263},
  {source:require('@/assets/garden/runtime/infrastructure/final/ST01_approved.png'),x:1401,y:758,width:506,height:377},
  {source:require('@/assets/garden/runtime/infrastructure/b02-land06-connection/b02-foreground-local-opening.png'),x:1499,y:476,width:363,height:202},
  {source:require('@/assets/garden/runtime/infrastructure/seams/B01_land08_occlusion.png'),x:1767,y:1247,width:127,height:127},
  {source:require('@/assets/garden/runtime/infrastructure/seams/ST01_feet_occlusion.png'),x:1361,y:731,width:609,height:429},
] as const;
const BLACK_ALPHA = [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,1,0];

// The same persistent explorer survives daylight and pauses. GardenScene still
// owns night visibility and camera projection; there is no route-end despawn.
export default memo(function MemoryOtter({clock,active,night,lotusOccluders}:{clock:SharedValue<number>;active:boolean;night:boolean;lotusOccluders?:readonly LotusOccluder[]}) {
  return <Otter clock={clock} active={active && night} visible={night} lotusOccluders={lotusOccluders} />;
});

export function Otter({clock,active=true,visible=true,network:provided,lotusOccluders=NO_LOTUS}:{
  clock:SharedValue<number>;active?:boolean;visible?:boolean;network?:SwimNetwork;lotusOccluders?:readonly LotusOccluder[];
}) {
  const network=useMemo(()=>provided ?? getSwimNetwork(),[provided]);
  const swimmer=useSharedValue(createSwim(network,Math.floor(Math.random()*4294967296)));
  const sheet=useImage(ART), b02=useImage(OCCLUDERS[0].source), b01=useImage(OCCLUDERS[1].source),
    st01=useImage(OCCLUDERS[2].source), b02Front=useImage(OCCLUDERS[3].source),
    b01Front=useImage(OCCLUDERS[4].source), st01Front=useImage(OCCLUDERS[5].source);
  const images=[b02,b01,st01,b02Front,b01Front,st01Front];
  const reduced=useReducedMotion(), ready=Boolean(sheet && images.every(Boolean));
  const bend=useSharedValue(0);
  // Persistent stroke/flow phase, independent of route legs and React renders.
  // Reduced motion keeps a calm moving stroke rather than a sliding frozen pose.
  const swimSeconds=useSharedValue(0);
  const motion=useDerivedValue(()=>Math.max(.12,Math.min(1,swimmer.value.speed/OTTER_SPEED)));
  useAnimatedReaction(()=>clock.value,(now,before)=>{
    if(!active || !ready || before===null) return;
    // Ignore a suspended frame's wall-time gap, retaining position on resume.
    const elapsed=Math.min(.1,Math.max(0,now-before));
    const previous=swimmer.value;
    const next=advanceSwim(network,previous,elapsed);
    swimmer.value=next;
    const distance=Math.hypot(next.x-previous.x,next.y-previous.y);
    if(elapsed>0 && distance>0) {
      const relativeSpeed=distance/(elapsed*OTTER_SPEED);
      const strokeRate=Math.max(.65,Math.min(1.15,.65+.35*relativeSpeed));
      swimSeconds.value+=elapsed*strokeRate*(reduced?.7:1);
    }
    const turn=elapsed>0?Math.max(-1,Math.min(1,(next.heading-previous.heading)/elapsed*.75)):0;
    bend.value+=(turn-bend.value)*(1-Math.exp(-elapsed*3));
  },[active,ready,network,reduced]);
  const scale=LENGTH/SWIM.w;
  const transform=useDerivedValue(()=>[
    {translateX:swimmer.value.x},{translateY:swimmer.value.y},{rotate:swimmer.value.heading},
    {scale},{translateX:-SWIM.w/2},{translateY:-SWIM.h*.55},
  ],[scale]);
  const frame=useDerivedValue(()=>Math.floor(swimSeconds.value*SWIM.fps)%SWIM.count);
  // Bound the offscreen mask to this one sprite, not the entire Garden canvas.
  const clip=useDerivedValue(()=>({x:swimmer.value.x-94,y:swimmer.value.y-94,width:188,height:188}));
  const mask=useMemo(()=><Group>
    <Rect x={0} y={-309} width={2400} height={2119} color="white" />
    {images.map((image,i)=>image?<Image key={i} image={image} x={OCCLUDERS[i].x} y={OCCLUDERS[i].y}
      width={OCCLUDERS[i].width} height={OCCLUDERS[i].height} fit="fill"><ColorMatrix matrix={BLACK_ALPHA}/></Image>:null)}
    {lotusOccluders.map(plant=><Group key={plant.id} transform={plant.transform}>
      <Image image={plant.image} x={0} y={0} width={plant.width} height={plant.height}
        opacity={plant.opacity} fit="fill"><ColorMatrix matrix={BLACK_ALPHA}/></Image>
    </Group>)}
  </Group>,[b02,b01,st01,b02Front,b01Front,st01Front,lotusOccluders]);
  if(!visible || !ready || !sheet) return null;
  // Mask restores its own offscreen layer with SrcOver and overrides child
  // paints with SrcIn. An inherited screen blend cannot affect that restore.
  // Composite the COMPLETED mask through an explicit screen layer instead;
  // the sprite's opaque black stays invisible and bridge mask paints stay SrcOver.
  // Clip first so both offscreen layers remain bounded to this one otter.
  return <Group clip={clip}><Group layer={<Paint blendMode="screen" />}>
    <Mask mode="luminance" clip={false} mask={mask}>
      <Group transform={transform}><OtterWaterSpirit sheet={sheet} frame={frame}
        seconds={swimSeconds} motion={motion} bend={bend} reduced={reduced}/></Group>
    </Mask>
  </Group></Group>;
}
