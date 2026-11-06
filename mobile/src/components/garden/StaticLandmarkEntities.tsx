import { Image, useImage } from '@shopify/react-native-skia';

export const GARDEN_ARCH_WIDTH = 1312;
export const GARDEN_ARCH_HEIGHT = 1199;
export const PAVILION_WIDTH = 1214;
export const PAVILION_HEIGHT = 1295;

type Props = { x: number; y: number; scale: number };

export function GardenArchEntity({ x, y, scale }: Props) {
  const image = useImage(require('@/assets/garden/landmarks/garden-arch.webp'));
  if (!image) return null;
  return <Image image={image} x={x} y={y}
    width={GARDEN_ARCH_WIDTH * scale} height={GARDEN_ARCH_HEIGHT * scale} fit="fill" />;
}

export function PavilionEntity({ x, y, scale }: Props) {
  const image = useImage(require('@/assets/garden/landmarks/pavilion.webp'));
  if (!image) return null;
  return <Image image={image} x={x} y={y}
    width={PAVILION_WIDTH * scale} height={PAVILION_HEIGHT * scale} fit="fill" />;
}
