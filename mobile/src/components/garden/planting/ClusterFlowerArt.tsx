import { Group, Image, useImage, type SkImage } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useState } from 'react';
import type { ClusterGeometry } from './approvedFlowerClusters';

export const clusterImageKey = (g: Pick<ClusterGeometry, 'code' | 'size'>) => `${g.code}:${g.size}`;

const ClusterImageLoader = memo(function ClusterImageLoader({ id, source, onLoad }: {
  id: string; source: ClusterGeometry['art']['source']; onLoad: (id: string, image: SkImage) => void;
}) {
  const image = useImage(source as Parameters<typeof useImage>[0]);
  useEffect(() => { if (image) onLoad(id, image); }, [id, image, onLoad]);
  return null;
});

/** Decodes each approved cluster PNG once, however many flowers draw it. */
export function useClusterImages(geometries: readonly (ClusterGeometry | null)[]) {
  const [images, setImages] = useState<Record<string, SkImage>>({});
  const onLoad = useCallback((id: string, image: SkImage) =>
    setImages(current => current[id] === image ? current : { ...current, [id]: image }), []);
  const sources = new Map<string, ClusterGeometry['art']['source']>();
  for (const g of geometries) if (g) sources.set(clusterImageKey(g), g.art.source);
  const loaders = [...sources].map(([id, source]) => <ClusterImageLoader key={id} id={id} source={source} onLoad={onLoad} />);
  return { images, loaders };
}

/** One complete cluster, drawn from its ground anchor. Preview and planted flowers both use this. */
export const ClusterFlower = memo(function ClusterFlower({ geometry, anchor, image, opacity = 1 }: {
  geometry: ClusterGeometry; anchor: { worldX: number; worldY: number }; image?: SkImage; opacity?: number;
}) {
  if (!image) return null;
  const turn = geometry.rotationRadians;
  return <Group opacity={opacity} transform={turn ? [{ translateX: anchor.worldX }, { translateY: anchor.worldY }, { rotate: turn },
    { translateX: -anchor.worldX }, { translateY: -anchor.worldY }] : undefined}>
    <Image image={image} x={geometry.drawX} y={geometry.drawY} width={geometry.drawWidth} height={geometry.drawHeight} fit="fill" />
  </Group>;
});
