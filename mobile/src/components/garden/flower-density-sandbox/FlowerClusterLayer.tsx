import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlphaType, Circle, ColorType, Group, Image, Oval, Skia, useImage,
  type SkImage, type SkPath,
} from '@shopify/react-native-skia';
import {
  sortByGroundY,
  type ClassTuning,
  type DensityFlower,
  type FlowerClass,
} from './flowerDensityModel';
import {
  CLUSTER_VARIANTS, CLUSTER_VISUALS, LEGACY_CLUSTER_VISUALS, SOURCE_PIECES, getClusterVariantIndex,
  type ClusterVariant, type SourcePieceName,
} from './flowerClusterVariants';

export { CLUSTER_VISUALS, LEGACY_CLUSTER_VISUALS } from './flowerClusterVariants';

export const CLUSTER_MATTE_NOTE = 'Original artwork has a baked checkerboard. This sandbox removes it in memory; pale edge detail needs visual review.';

const SOURCE_ANCHORS = { S: { x: 0.5, y: 0.94 }, M: { x: 0.5, y: 0.95 }, L: { x: 0.5, y: 0.96 } };
const matteCache = new WeakMap<SkImage, SkImage | null>();

/**
 * The source PNGs are RGB with a flattened gray checkerboard. Keep their RGB
 * pixels intact and derive alpha only in memory, once for each decoded image.
 * Border-connected neutral regions are background. Small enclosed neutral
 * highlights are retained; larger enclosed regions require both checker tones.
 * This conservative matte cannot recover the original artist's exact alpha.
 */
function transparentArtwork(source: SkImage | null, name: string): SkImage | null {
  if (!source) return null;
  if (matteCache.has(source)) return matteCache.get(source) ?? null;
  try {
    const width = source.width();
    const height = source.height();
    const info = { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };
    const read = source.readPixels(0, 0, info);
    if (!read || !(read instanceof Uint8Array)) throw new Error('RGBA pixel read unavailable');
    const pixels = new Uint8Array(read);
    const count = width * height;
    const neutral = new Uint8Array(count);
    const queue = new Int32Array(count);
    for (let index = 0; index < count; index += 1) {
      const byte = index * 4;
      const low = Math.min(pixels[byte], pixels[byte + 1], pixels[byte + 2]);
      const high = Math.max(pixels[byte], pixels[byte + 1], pixels[byte + 2]);
      neutral[index] = low >= 226 && high - low <= 12 ? 1 : 0;
    }
    for (let start = 0; start < count; start += 1) {
      if (neutral[start] !== 1) continue;
      let head = 0;
      let tail = 1;
      let reachesBorder = false;
      let grayPixels = 0;
      let whitePixels = 0;
      queue[0] = start;
      neutral[start] = 2;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        reachesBorder ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
        const shade = pixels[index * 4];
        if (shade < 247) grayPixels += 1;
        if (shade >= 250) whitePixels += 1;
        if (x > 0 && neutral[index - 1] === 1) { neutral[index - 1] = 2; queue[tail++] = index - 1; }
        if (x + 1 < width && neutral[index + 1] === 1) { neutral[index + 1] = 2; queue[tail++] = index + 1; }
        if (y > 0 && neutral[index - width] === 1) { neutral[index - width] = 2; queue[tail++] = index - width; }
        if (y + 1 < height && neutral[index + width] === 1) { neutral[index + width] = 2; queue[tail++] = index + width; }
      }
      const enclosedChecker = tail > 192 && grayPixels > 24 && whitePixels > 24;
      if (reachesBorder || enclosedChecker) {
        for (let index = 0; index < tail; index += 1) pixels[queue[index] * 4 + 3] = 0;
      }
    }
    const image = Skia.Image.MakeImage(info, Skia.Data.fromBytes(pixels), width * 4);
    if (!image) throw new Error('RGBA image creation unavailable');
    matteCache.set(source, image);
    return image;
  } catch (error) {
    // Hide a failed cutout rather than silently showing a square checker sticker.
    console.warn(`[Flower Density Sandbox] ${name} artwork could not be matted`, error);
    matteCache.set(source, null);
    return null;
  }
}

function polygon(points: ReadonlyArray<readonly [number, number]>): SkPath {
  const path = Skia.Path.Make();
  path.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) path.lineTo(points[index][0], points[index][1]);
  path.close();
  return path;
}

interface ArtworkProps {
  flowerClass: FlowerClass;
  image: SkImage;
  chamomileClip: SkPath;
  hydrangeaHeadClip: SkPath;
  hydrangeaBaseClip: SkPath;
}

function Artwork({ flowerClass, image, chamomileClip, hydrangeaHeadClip, hydrangeaBaseClip }: ArtworkProps) {
  if (flowerClass === 'S') {
    // Anchor the original stem base (612,1160); omit only the sixth, far-left head.
    return (
      <Group transform={[{ scaleX: 36 / 847 }, { scaleY: (46 * 0.94) / 1082 }, { translateX: -612 }, { translateY: -1160 }]}>
        <Group clip={chamomileClip}><Image image={image} x={0} y={0} width={1254} height={1254} fit="fill" /></Group>
      </Group>
    );
  }
  if (flowerClass === 'M') {
    // The supplied artwork already contains exactly two tulip stems.
    return (
      <Group transform={[{ scaleX: 34 / 735 }, { scaleY: (50 * 0.95) / 1125 }, { translateX: -615 }, { translateY: -1194 }]}>
        <Image image={image} x={0} y={0} width={1254} height={1254} fit="fill" />
      </Group>
    );
  }
  return (
    <Group>
      {/* Existing lower foliage/stems form the short base; no botanical geometry is drawn. */}
      <Group transform={[{ scaleX: 29 / 372 }, { scaleY: 21 / 428 }, { translateX: -610 }, { translateY: -1173 }]}>
        <Group clip={hydrangeaBaseClip}><Image image={image} x={0} y={0} width={1254} height={1254} fit="fill" /></Group>
      </Group>
      {/* Isolate the main head from the source's seven-head shrub. */}
      <Group transform={[{ translateY: -46.08 }, { scaleX: 48 / 450 }, { scaleY: 33 / 356 }, { translateX: -610 }, { translateY: -204 }]}>
        <Group clip={hydrangeaHeadClip}><Image image={image} x={0} y={0} width={1254} height={1254} fit="fill" /></Group>
      </Group>
    </Group>
  );
}

function VariantArtwork({ image, variant, clips }: {
  image: SkImage;
  variant: ClusterVariant;
  clips: Record<SourcePieceName, SkPath>;
}) {
  return (
    <Group>
      {variant.components.map((branch, branchIndex) => (
        <Group key={branchIndex} transform={[{ translateX: branch.x }, { translateY: branch.y },
          { rotate: branch.rotationDegrees * Math.PI / 180 }, { scaleX: branch.mirror ? -1 : 1 }]}>
          {branch.pieces.map((placement, pieceIndex) => {
            const source = SOURCE_PIECES[placement.source];
            return (
              <Group key={pieceIndex} transform={[{ translateX: placement.x }, { translateY: placement.y },
                { scaleX: placement.width / source.width }, { scaleY: placement.height / source.height },
                { translateX: -source.anchorX }, { translateY: -source.anchorY }]}>
                <Group clip={clips[placement.source]}>
                  <Image image={image} x={0} y={0} width={1254} height={1254} fit="fill" />
                </Group>
              </Group>
            );
          })}
        </Group>
      ))}
    </Group>
  );
}

export interface ArtworkStatus {
  ready: number;
  total: number;
  error?: string;
}

export interface FlowerClusterLayerProps {
  flowers: readonly DensityFlower[];
  tuning: Record<FlowerClass, ClassTuning>;
  showFootprints: boolean;
  showAnchors: boolean;
  variantsEnabled?: boolean;
  onArtworkStatus?: (status: ArtworkStatus) => void;
}

/** Canvas children only: this layer has no storage, production placement, or Canvas style semantics. */
export function FlowerClusterLayer({ flowers, tuning, showFootprints, showAnchors, variantsEnabled = true, onArtworkStatus }: FlowerClusterLayerProps) {
  const [loadError, setLoadError] = useState<string>();
  const onLoadError = useCallback((error: Error) => setLoadError(error.message), []);
  const chamomileSource = useImage(require('../../../../assets/garden/flower-density-sandbox/chamomile.webp'), onLoadError);
  const tulipSource = useImage(require('../../../../assets/garden/flower-density-sandbox/tulip.webp'), onLoadError);
  const hydrangeaSource = useImage(require('../../../../assets/garden/flower-density-sandbox/hydrangea.webp'), onLoadError);
  const chamomile = useMemo(() => transparentArtwork(chamomileSource, 'Chamomile'), [chamomileSource]);
  const tulip = useMemo(() => transparentArtwork(tulipSource, 'Tulip'), [tulipSource]);
  const hydrangea = useMemo(() => transparentArtwork(hydrangeaSource, 'Hydrangea'), [hydrangeaSource]);
  const ready = Number(Boolean(chamomile)) + Number(Boolean(tulip)) + Number(Boolean(hydrangea));
  const failed = [chamomileSource && !chamomile ? 'Chamomile' : '', tulipSource && !tulip ? 'Tulip' : '',
    hydrangeaSource && !hydrangea ? 'Hydrangea' : ''].filter(Boolean);
  const error = loadError || (failed.length ? `Artwork transparency unavailable: ${failed.join(', ')}.` : undefined);
  useEffect(() => { onArtworkStatus?.({ ready, total: 3, error }); }, [ready, error, onArtworkStatus]);
  const images = { S: chamomile, M: tulip, L: hydrangea };
  const ordered = useMemo(() => sortByGroundY(flowers), [flowers]);
  const variantClips = useMemo(() => Object.fromEntries(Object.entries(SOURCE_PIECES)
    .map(([name, source]) => [name, polygon(source.clip)])) as Record<SourcePieceName, SkPath>, []);
  const chamomileClip = useMemo(() => polygon([
    [190, 70], [1050, 70], [1050, 1180], [190, 1180], [190, 585], [300, 585], [300, 476], [190, 476],
  ]), []);
  const hydrangeaHeadClip = useMemo(() => polygon([
    [405, 255], [448, 245], [457, 219], [545, 204], [603, 211], [661, 225], [694, 258],
    [734, 254], [781, 277], [786, 312], [817, 326], [835, 380], [828, 435], [805, 477],
    [772, 499], [708, 520], [690, 548], [602, 559], [541, 549], [506, 560], [469, 532],
    [444, 501], [410, 485], [391, 434], [396, 403], [385, 364], [389, 323],
  ]), []);
  const hydrangeaBaseClip = useMemo(() => polygon([
    [525, 760], [597, 745], [657, 758], [718, 786], [768, 833], [716, 912], [706, 983],
    [828, 1060], [837, 1155], [677, 1110], [655, 1173], [591, 1173], [571, 1099],
    [467, 1143], [465, 1076], [526, 1004], [541, 942], [494, 864],
  ]), []);
  return (
    <Group>
      {/* Every contact shadow precedes every flower, so shadows never cover front petals. */}
      {ordered.map(flower => (
        <Oval key={`shadow-${flower.id}`} x={flower.worldX - flower.footprintRadius * 0.76}
          y={flower.worldY - flower.footprintRadius * 0.22}
          width={flower.footprintRadius * 1.52} height={flower.footprintRadius * 0.44}
          color="rgba(35, 59, 34, 0.17)" />
      ))}
      {ordered.map(flower => {
        const image = images[flower.flowerClass];
        if (!image) return null;
        const controls = tuning[flower.flowerClass];
        const base = (variantsEnabled ? CLUSTER_VISUALS : LEGACY_CLUSTER_VISUALS)[flower.flowerClass];
        const sourceAnchor = SOURCE_ANCHORS[flower.flowerClass];
        const scale = controls.visualScale * flower.scaleVariation;
        const mirror = !variantsEnabled && flower.compositionVariant === 1 ? -1 : 1;
        const widthVariation = !variantsEnabled && flower.compositionVariant === 2 ? 0.93 : 1;
        return (
          <Group key={flower.id} transform={[{ translateX: flower.worldX }, { translateY: flower.worldY },
            { rotate: flower.rotationDegrees * Math.PI / 180 }, { scaleX: scale * mirror * widthVariation }, { scaleY: scale }]}>
            <Group transform={[{ translateX: (sourceAnchor.x - controls.anchorX) * base.width },
              { translateY: (sourceAnchor.y - controls.anchorY) * base.height }]}>
              {variantsEnabled
                ? <VariantArtwork image={image} variant={CLUSTER_VARIANTS[flower.flowerClass][getClusterVariantIndex(flower.id)]} clips={variantClips} />
                : <Artwork flowerClass={flower.flowerClass} image={image} chamomileClip={chamomileClip}
                  hydrangeaHeadClip={hydrangeaHeadClip} hydrangeaBaseClip={hydrangeaBaseClip} />}
            </Group>
          </Group>
        );
      })}
      {showFootprints && ordered.map(flower => (
        <Circle key={`footprint-${flower.id}`} cx={flower.worldX} cy={flower.worldY} r={flower.footprintRadius}
          color={flower.flowerClass === 'S' ? '#238b63' : flower.flowerClass === 'M' ? '#b8671e' : '#7457ae'}
          style="stroke" strokeWidth={0.8} opacity={0.8} />
      ))}
      {showAnchors && ordered.map(flower => (
        <Group key={`anchor-${flower.id}`}>
          <Circle cx={flower.worldX} cy={flower.worldY} r={2.2} color="#ffffff" />
          <Circle cx={flower.worldX} cy={flower.worldY} r={1.2} color="#ce245a" />
        </Group>
      ))}
    </Group>
  );
}
