import { Group, Image, useImage } from '@shopify/react-native-skia';
import { type WaterTopPlacement } from '../waterTopPlacement';

// Byte-identical to the approved FIRST complete image, not a rebuilt composite.
// SHA-256: D76A9BB8FFA42402F04397481D828B86EDE72BF6099F4723C5CDC1A9BBE47B92
export const WATER_TOP_RAW_FINAL = require('@/assets/garden/water/water-top/water-top-raw-final.webp');
export const WATER_TOP_RAW_WIDTH = 1536;
export const WATER_TOP_RAW_HEIGHT = 1024;

export default function WaterTopRawFinal({ placement }: { placement: WaterTopPlacement }) {
  const image = useImage(WATER_TOP_RAW_FINAL);
  if (!image) return null;
  const center = {
    x: placement.x + WATER_TOP_RAW_WIDTH * placement.scale / 2,
    y: placement.y + WATER_TOP_RAW_HEIGHT * placement.scale / 2,
  };
  return <Group origin={center} transform={[{ rotate: placement.rotation * Math.PI / 180 }]}>
    <Group transform={[{ translateX: placement.x }, { translateY: placement.y }, { scale: placement.scale }]}>
      {/* Exact aspect ratio, full source rectangle, no mask, shader or split. */}
      <Image image={image} x={0} y={0} width={WATER_TOP_RAW_WIDTH}
        height={WATER_TOP_RAW_HEIGHT} fit="contain" />
    </Group>
  </Group>;
}
