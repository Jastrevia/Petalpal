import { Group, Image, useImage } from '@shopify/react-native-skia';
import { SIGN_ANCHOR, SIGN_SIZE, type SignPlacement } from './signPlacement';
const SOURCES = [
  require('@/assets/garden/month-signs/month-sign-01-jan.webp'),
  require('@/assets/garden/month-signs/month-sign-02-feb.webp'),
  require('@/assets/garden/month-signs/month-sign-03-mar.webp'),
  require('@/assets/garden/month-signs/month-sign-04-apr.webp'),
  require('@/assets/garden/month-signs/month-sign-05-may.webp'),
  require('@/assets/garden/month-signs/month-sign-06-jun.webp'),
  require('@/assets/garden/month-signs/month-sign-07-jul.webp'),
  require('@/assets/garden/month-signs/month-sign-08-aug.webp'),
  require('@/assets/garden/month-signs/month-sign-09-sep.webp'),
  require('@/assets/garden/month-signs/month-sign-10-oct.webp'),
  require('@/assets/garden/month-signs/month-sign-11-nov.webp'),
  require('@/assets/garden/month-signs/month-sign-12-dec.webp'),
 ];
function Sign({placement:p}:{placement:SignPlacement}) {
  const image=useImage(SOURCES[p.month-1]);const size=SIGN_SIZE*p.scale;
  return image?<Image image={image} x={p.x-size*SIGN_ANCHOR.x} y={p.y-size*SIGN_ANCHOR.y} width={size} height={size} fit="fill"/>:null;
}
export default function MonthlySignLayer({placements}:{placements:SignPlacement[]}) {
 return <Group>{[...placements].sort((a,b)=>a.y-b.y).map(p=><Sign key={p.month} placement={p}/>)}</Group>;
}
