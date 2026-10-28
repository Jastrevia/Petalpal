import { MONTH_REGION_METAS } from './plantingRegionData';

/** Painted flower clusters, one picture per planted flower. Land size picks the cluster:
 * lands 1, 2, 3, 5, 6 small; 4, 7, 8, 9 medium; 10, 11, 12 large (land = month).
 * Footprint radii must match lib/flower-placement.js on the server. */
export type ClusterSize = 'S' | 'M' | 'L';
export const LAND_CLUSTER_SIZE: Readonly<Record<number, ClusterSize>> = {
  1: 'S', 2: 'S', 3: 'S', 5: 'S', 6: 'S', 4: 'M', 7: 'M', 8: 'M', 9: 'M', 10: 'L', 11: 'L', 12: 'L',
};
/** Logical planting circle. Two clusters on a land never come closer than two radii, so their
 * leaves only just meet and never pile up. */
export const CLUSTER_FOOTPRINT_RADIUS = { S: 14, M: 18, L: 22 } as const;
/** Drawn width in Garden world units. */
export const CLUSTER_WORLD_WIDTH = { S: 40, M: 50, L: 62 } as const;
/** The cluster's soil line sits this far down its picture, at the planting point. */
const BASE = 0.94;

// [source, height / width] per species and size.
const CLUSTER_ART: Readonly<Record<string, Record<ClusterSize, readonly [number, number]>>> = {
  ANEMONE: { S: [require('@/assets/garden/flower-clusters/anemone-s.webp'), 0.908], M: [require('@/assets/garden/flower-clusters/anemone-m.webp'), 0.782], L: [require('@/assets/garden/flower-clusters/anemone-l.webp'), 0.771] },
  ASTER: { S: [require('@/assets/garden/flower-clusters/aster-s.webp'), 0.833], M: [require('@/assets/garden/flower-clusters/aster-m.webp'), 0.845], L: [require('@/assets/garden/flower-clusters/aster-l.webp'), 0.8] },
  BIRD_OF_PARADISE: { S: [require('@/assets/garden/flower-clusters/bird-of-paradise-s.webp'), 0.914], M: [require('@/assets/garden/flower-clusters/bird-of-paradise-m.webp'), 1.027], L: [require('@/assets/garden/flower-clusters/bird-of-paradise-l.webp'), 0.85] },
  BLUEBELL: { S: [require('@/assets/garden/flower-clusters/bluebell-s.webp'), 0.861], M: [require('@/assets/garden/flower-clusters/bluebell-m.webp'), 0.918], L: [require('@/assets/garden/flower-clusters/bluebell-l.webp'), 0.819] },
  CHAMOMILE: { S: [require('@/assets/garden/flower-clusters/chamomile-s.webp'), 1.044], M: [require('@/assets/garden/flower-clusters/chamomile-m.webp'), 0.957], L: [require('@/assets/garden/flower-clusters/chamomile-l.webp'), 0.771] },
  CHINESE_VIOLET_CRESS: { S: [require('@/assets/garden/flower-clusters/chinese-violet-cress-s.webp'), 1.089], M: [require('@/assets/garden/flower-clusters/chinese-violet-cress-m.webp'), 1.011], L: [require('@/assets/garden/flower-clusters/chinese-violet-cress-l.webp'), 0.94] },
  COREOPSIS: { S: [require('@/assets/garden/flower-clusters/coreopsis-s.webp'), 0.969], M: [require('@/assets/garden/flower-clusters/coreopsis-m.webp'), 1.07], L: [require('@/assets/garden/flower-clusters/coreopsis-l.webp'), 0.862] },
  DAISY: { S: [require('@/assets/garden/flower-clusters/daisy-s.webp'), 0.928], M: [require('@/assets/garden/flower-clusters/daisy-m.webp'), 1.016], L: [require('@/assets/garden/flower-clusters/daisy-l.webp'), 0.781] },
  DANDELION: { S: [require('@/assets/garden/flower-clusters/dandelion-s.webp'), 1.253], M: [require('@/assets/garden/flower-clusters/dandelion-m.webp'), 1.239], L: [require('@/assets/garden/flower-clusters/dandelion-l.webp'), 1.21] },
  GENTIAN: { S: [require('@/assets/garden/flower-clusters/gentian-s.webp'), 0.869], M: [require('@/assets/garden/flower-clusters/gentian-m.webp'), 0.825], L: [require('@/assets/garden/flower-clusters/gentian-l.webp'), 0.812] },
  GERBERA_DAISY: { S: [require('@/assets/garden/flower-clusters/gerbera-daisy-s.webp'), 0.989], M: [require('@/assets/garden/flower-clusters/gerbera-daisy-m.webp'), 1.002], L: [require('@/assets/garden/flower-clusters/gerbera-daisy-l.webp'), 0.829] },
  HEATHER: { S: [require('@/assets/garden/flower-clusters/heather-s.webp'), 0.989], M: [require('@/assets/garden/flower-clusters/heather-m.webp'), 0.855], L: [require('@/assets/garden/flower-clusters/heather-l.webp'), 0.813] },
  HYDRANGEA: { S: [require('@/assets/garden/flower-clusters/hydrangea-s.webp'), 0.908], M: [require('@/assets/garden/flower-clusters/hydrangea-m.webp'), 0.936], L: [require('@/assets/garden/flower-clusters/hydrangea-l.webp'), 0.962] },
  LAVENDER: { S: [require('@/assets/garden/flower-clusters/lavender-s.webp'), 1.153], M: [require('@/assets/garden/flower-clusters/lavender-m.webp'), 1.057], L: [require('@/assets/garden/flower-clusters/lavender-l.webp'), 0.946] },
  OLIVE: { S: [require('@/assets/garden/flower-clusters/olive-s.webp'), 1.042], M: [require('@/assets/garden/flower-clusters/olive-m.webp'), 0.977], L: [require('@/assets/garden/flower-clusters/olive-l.webp'), 0.783] },
  PETUNIA: { S: [require('@/assets/garden/flower-clusters/petunia-s.webp'), 0.881], M: [require('@/assets/garden/flower-clusters/petunia-m.webp'), 0.884], L: [require('@/assets/garden/flower-clusters/petunia-l.webp'), 0.812] },
  POPPY: { S: [require('@/assets/garden/flower-clusters/poppy-s.webp'), 0.939], M: [require('@/assets/garden/flower-clusters/poppy-m.webp'), 0.964], L: [require('@/assets/garden/flower-clusters/poppy-l.webp'), 0.848] },
  SNOWDROP: { S: [require('@/assets/garden/flower-clusters/snowdrop-s.webp'), 1.0], M: [require('@/assets/garden/flower-clusters/snowdrop-m.webp'), 1.02], L: [require('@/assets/garden/flower-clusters/snowdrop-l.webp'), 0.804] },
  SUNFLOWER: { S: [require('@/assets/garden/flower-clusters/sunflower-s.webp'), 1.161], M: [require('@/assets/garden/flower-clusters/sunflower-m.webp'), 1.073], L: [require('@/assets/garden/flower-clusters/sunflower-l.webp'), 0.95] },
  TULIP: { S: [require('@/assets/garden/flower-clusters/tulip-s.webp'), 0.922], M: [require('@/assets/garden/flower-clusters/tulip-m.webp'), 0.914], L: [require('@/assets/garden/flower-clusters/tulip-l.webp'), 0.862] },
  WHITE_ROSE: { S: [require('@/assets/garden/flower-clusters/white-rose-s.webp'), 0.833], M: [require('@/assets/garden/flower-clusters/white-rose-m.webp'), 0.816], L: [require('@/assets/garden/flower-clusters/white-rose-l.webp'), 0.827] },
  YELLOW_DAFFODIL: { S: [require('@/assets/garden/flower-clusters/yellow-daffodil-s.webp'), 0.944], M: [require('@/assets/garden/flower-clusters/yellow-daffodil-m.webp'), 0.886], L: [require('@/assets/garden/flower-clusters/yellow-daffodil-l.webp'), 0.754] },
  YELLOW_RAPESEED_FLOWER: { S: [require('@/assets/garden/flower-clusters/yellow-rapeseed-flower-s.webp'), 1.374], M: [require('@/assets/garden/flower-clusters/yellow-rapeseed-flower-m.webp'), 1.448], L: [require('@/assets/garden/flower-clusters/yellow-rapeseed-flower-l.webp'), 1.235] },
};

export function clusterSpeciesCode(speciesCode?: string, flowerName?: string) {
  return (speciesCode || flowerName || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}
export const hasClusterArt = (speciesCode?: string, flowerName?: string) =>
  Boolean(CLUSTER_ART[clusterSpeciesCode(speciesCode, flowerName)]);
export const clusterSizeForMonth = (month: number): ClusterSize => LAND_CLUSTER_SIZE[month] ?? 'S';
export const clusterFootprintRadius = (month: number) => CLUSTER_FOOTPRINT_RADIUS[clusterSizeForMonth(month)];
export const landIdForMonth = (month: number) => MONTH_REGION_METAS[month]?.landId;

/** The cluster picture for a flower outside the Garden (lists, Events); medium unless a land says otherwise. */
export function clusterPicture(speciesCode?: string, flowerName?: string, size: ClusterSize = 'M') {
  const art = CLUSTER_ART[clusterSpeciesCode(speciesCode, flowerName)];
  return art ? { source: art[size][0], ratio: art[size][1] } : null;
}

export interface ClusterDrawing { source: number; size: ClusterSize; x: number; y: number; width: number; height: number }
/** Where one planted flower's cluster is drawn, or null when its species has no cluster art. */
export function clusterDrawing(flower: { worldX: number; worldY: number; month: number; speciesCode?: string; flowerName?: string }): ClusterDrawing | null {
  const art = CLUSTER_ART[clusterSpeciesCode(flower.speciesCode, flower.flowerName)];
  if (!art) return null;
  const size = clusterSizeForMonth(flower.month), [source, ratio] = art[size];
  const width = CLUSTER_WORLD_WIDTH[size], height = width * ratio;
  return { source, size, x: flower.worldX - width / 2, y: flower.worldY - height * BASE, width, height };
}
/** The front-most planted cluster under a tap (pictures lower on screen are drawn in front). */
export function hitCluster<T extends { id: string; worldX: number; worldY: number; month: number; speciesCode?: string; flowerName?: string }>(
  flowers: readonly T[], x: number, y: number): T | null {
  const front = [...flowers].sort((a, b) => b.worldY - a.worldY || b.id.localeCompare(a.id));
  for (const flower of front) {
    const drawn = clusterDrawing(flower);
    if (drawn ? x >= drawn.x + drawn.width * .1 && x <= drawn.x + drawn.width * .9 && y >= drawn.y + drawn.height * .08 && y <= flower.worldY + 4
      : Math.hypot(x - flower.worldX, y - flower.worldY) <= clusterFootprintRadius(flower.month)) return flower;
  }
  return null;
}
