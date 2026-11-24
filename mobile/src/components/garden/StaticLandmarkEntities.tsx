import { Blur, Group, Image, Path, Skia, useImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';

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

export const DOG_HOUSE_WIDTH = 900;
export const DOG_HOUSE_HEIGHT = 887;

// Where the house's floor meets the ground, as fractions of the painting (front-left, front-right,
// back-right, back-left corners): a dark contact band hugs this footprint and a soft cast shadow
// falls away to the lower right, as the garden's light comes from the upper left.
const DOG_HOUSE_FOOTPRINT = [[0.27, 0.845], [0.725, 0.985], [0.93, 0.88], [0.475, 0.74]] as const;

function footprint(x: number, y: number, w: number, h: number, dx = 0, dy = 0, grow = 1) {
  const cx = DOG_HOUSE_FOOTPRINT.reduce((a, [u]) => a + u, 0) / 4, cy = DOG_HOUSE_FOOTPRINT.reduce((a, [, v]) => a + v, 0) / 4;
  const path = Skia.Path.Make();
  DOG_HOUSE_FOOTPRINT.forEach(([u, v], i) => {
    const px = x + (cx + (u - cx) * grow) * w + dx, py = y + (cy + (v - cy) * grow) * h + dy;
    if (i === 0) path.moveTo(px, py); else path.lineTo(px, py);
  });
  path.close();
  return path;
}

/** The dogs' shared house, grounded by its own contact and cast shadows (the painting has none). */
export function DogHouseEntity({ x, y, scale }: Props) {
  const image = useImage(require('@/assets/garden/landmarks/dog-house/dog-house.webp'));
  const w = DOG_HOUSE_WIDTH * scale, h = DOG_HOUSE_HEIGHT * scale;
  const shadows = useMemo(() => ({
    // The house's shadow thrown well out to the lower right (light from the upper left), so it shows
    // on the paving beside the house rather than hiding underneath it.
    cast: footprint(x, y, w, h, w * 0.17, h * 0.07, 1.25),
    // A dark band where the floor meets the ground, just showing below the front and right edges.
    contact: footprint(x, y, w, h, w * 0.006, h * 0.014, 1.05),
  }), [x, y, w, h]);
  if (!image) return null;
  return <Group>
    <Path path={shadows.cast} color="rgba(22,30,26,0.34)"><Blur blur={w * 0.035} /></Path>
    <Path path={shadows.contact} color="rgba(16,20,16,0.70)"><Blur blur={w * 0.012} /></Path>
    <Image image={image} x={x} y={y} width={w} height={h} fit="fill" />
  </Group>;
}
