import { Image, useImage } from '@shopify/react-native-skia';
import circulation from '@/assets/garden/bridges/approved-circulation/manifest.json';

// Only the main entrance road remains. Standalone bridge/stair/landing
// overlays were retired for the bridge-main placement sandbox.
export default function GardenConnectionLayer() {
  const image = useImage(require('@/assets/garden/bridges/approved-circulation/main-road-connected.webp'));
  const road = circulation.pieces.find(piece => piece.id === 'main-road-connected')!;
  return image ? <Image image={image} x={road.x} y={road.y}
    width={road.width} height={road.height} fit="fill" /> : null;
}
