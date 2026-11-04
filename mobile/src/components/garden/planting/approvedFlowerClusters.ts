import { APPROVED_CLUSTER_ART } from './approvedFlowerClusterAssets';
import { getFlowerPlacementDefinition } from './flowerFootprintConfig';

// Approved flower clusters (Resources/flower-updated): one planting = one flower record =
// one complete single-species cluster image. Preview and planted art both come from
// clusterGeometry(), so image, ground anchor, scale, rotation and footprint are identical.

export type ClusterSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export interface ApprovedClusterArt {
  /** Bundled asset (require() result). */
  source: number | { uri: string } | string;
  width: number; height: number;
  /** Ground anchor in source pixels: bottom-centre of the solid body. */
  anchorX: number; anchorY: number;
  /** Solid-body bounds [x0, y0, x1, y1] in source pixels (alpha >= 128). */
  solid: readonly number[];
  /** Half the width of the lower solid body, in source pixels. */
  baseHalfWidth: number;
  /** Tap silhouette: hitRows[row] is a hex bit string, bit c = column c (alpha >= 96 in that cell). */
  hitCell: number; hitCols: number; hitRows: readonly string[];
}

/** Logical Land ID -> cluster size (owner-approved). Never derived from combined map asset names. */
export const LAND_CLUSTER_SIZE: Readonly<Record<string, ClusterSize>> = Object.freeze({
  Land01: 'SMALL', Land02: 'SMALL', Land03: 'SMALL', Land05: 'SMALL', Land06: 'SMALL',
  Land04: 'MEDIUM', Land07: 'MEDIUM', Land08: 'MEDIUM', Land09: 'MEDIUM',
  Land10: 'LARGE', Land11: 'LARGE', Land12: 'LARGE',
});
export function clusterSizeForLand(landId?: string | null): ClusterSize | null {
  return landId ? LAND_CLUSTER_SIZE[landId] ?? null : null;
}
/** Month N grows in LandNN (plantingRegionData MONTH_REGION_METAS). */
export function landIdForMonth(month?: number): string | undefined {
  return Number.isInteger(month) && month! >= 1 && month! <= 12 ? `Land${String(month).padStart(2, '0')}` : undefined;
}

/** World units per source pixel, shared by all 78 clusters so the art keeps its own S/M/L proportions. */
export const CLUSTER_WORLD_SCALE = 0.11;
/** Ground footprint: an ellipse across the cluster's base, sitting on the anchor. */
export const FOOTPRINT_WIDTH_FACTOR = 0.8;
export const FOOTPRINT_ASPECT = 0.42;

export function clusterSpeciesCode(speciesCode?: string, flowerName?: string): string | null {
  // Same precedence as resolveParentCollision: an explicit code is never reinterpreted.
  let code = (speciesCode || flowerName || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!speciesCode && ['ORANGE_TULIP', 'FEBRUARY_TULIP'].includes(code)) code = 'TULIP';
  return APPROVED_CLUSTER_ART[code] ? code : null;
}

export interface ClusterPose {
  worldX: number; worldY: number; scale?: number; rotation?: number;
  landId?: string; month?: number; speciesCode?: string; flowerName?: string;
}
export interface Footprint { cx: number; cy: number; rx: number; ry: number }
export interface ClusterGeometry {
  code: string; size: ClusterSize; landId: string; art: ApprovedClusterArt;
  /** World units per source pixel, including the record's scale. */
  k: number; rotationRadians: number;
  drawX: number; drawY: number; drawWidth: number; drawHeight: number;
  footprint: Footprint;
}

/** Geometry of a cluster at a pose. landId defaults to the record's Land, then its month's Land. */
export function clusterGeometry(pose: ClusterPose, landId = pose.landId ?? landIdForMonth(pose.month)): ClusterGeometry | null {
  const code = clusterSpeciesCode(pose.speciesCode, pose.flowerName);
  const size = clusterSizeForLand(landId);
  if (!code || !size || !Number.isFinite(pose.worldX) || !Number.isFinite(pose.worldY)) return null;
  const art = APPROVED_CLUSTER_ART[code][size];
  const scale = Number.isFinite(pose.scale) && pose.scale! > 0 ? pose.scale! : 1;
  const k = CLUSTER_WORLD_SCALE * scale;
  const rx = art.baseHalfWidth * k * FOOTPRINT_WIDTH_FACTOR, ry = rx * FOOTPRINT_ASPECT;
  return {
    code, size, landId: landId!, art, k,
    rotationRadians: Number.isFinite(pose.rotation) ? pose.rotation! * Math.PI / 180 : 0,
    drawX: pose.worldX - art.anchorX * k, drawY: pose.worldY - art.anchorY * k,
    drawWidth: art.width * k, drawHeight: art.height * k,
    footprint: { cx: pose.worldX, cy: pose.worldY - ry, rx, ry },
  };
}

/** Occupied ground of a placement: its cluster footprint, or the legacy parent circle. */
export function placementFootprint(p: ClusterPose): Footprint {
  const cluster = clusterGeometry(p);
  if (cluster) return cluster.footprint;
  const r = getFlowerPlacementDefinition(p.flowerName, p.speciesCode).footprintRadius;
  return { cx: p.worldX, cy: p.worldY, rx: r, ry: r };
}

/** Nearest point to `start` (rings `step` world units apart) that `accept`s, or null. */
export function nearestAcceptedPoint(start: { x: number; y: number }, accept: (x: number, y: number) => boolean,
  maxRadius = 260, step = 8): { worldX: number; worldY: number } | null {
  for (let radius = 0; radius <= maxRadius; radius += step) {
    const count = radius ? Math.ceil((2 * Math.PI * radius) / step) : 1;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const worldX = start.x + Math.cos(angle) * radius, worldY = start.y + Math.sin(angle) * radius;
      if (accept(worldX, worldY)) return { worldX, worldY };
    }
  }
  return null;
}

/** Centre plus evenly spaced boundary points of a footprint (containment checks). */
export function footprintPoints(f: Footprint, count = 24): { x: number; y: number }[] {
  const points = [{ x: f.cx, y: f.cy }];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    points.push({ x: f.cx + Math.cos(a) * f.rx, y: f.cy + Math.sin(a) * f.ry });
  }
  return points;
}
function radiusToward(f: Footprint, angle: number) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return (f.rx * f.ry) / Math.sqrt((f.ry * c) ** 2 + (f.rx * s) ** 2);
}
/** Footprints (ellipses or legacy circles) overlap along the line between their centres. */
export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
  if (d === 0) return true;
  const angle = Math.atan2(dy, dx);
  return d < radiusToward(a, angle) + radiusToward(b, angle);
}

const grids = new WeakMap<ApprovedClusterArt, Uint8Array>();
function hitGrid(art: ApprovedClusterArt): Uint8Array {
  let grid = grids.get(art);
  if (grid) return grid;
  grid = new Uint8Array(art.hitRows.length * art.hitCols);
  art.hitRows.forEach((hex, row) => {
    for (let col = 0; col < art.hitCols; col++) {
      const digit = hex.length - 1 - (col >> 2);
      if (digit >= 0 && (parseInt(hex[digit], 16) >> (col & 3)) & 1) grid![row * art.hitCols + col] = 1;
    }
  });
  grids.set(art, grid);
  return grid;
}

/** True when (x, y) lies on the cluster's visible silhouette, within tolerance (world units).
 * Transparent margins of the PNG are never a target. */
export function hitsCluster(g: ClusterGeometry, anchor: { worldX: number; worldY: number }, x: number, y: number, tolerance = 0): boolean {
  let dx = x - anchor.worldX, dy = y - anchor.worldY;
  if (g.rotationRadians) {
    const c = Math.cos(-g.rotationRadians), s = Math.sin(-g.rotationRadians);
    [dx, dy] = [dx * c - dy * s, dx * s + dy * c];
  }
  const { art } = g, cell = art.hitCell, grid = hitGrid(art);
  const px = art.anchorX + dx / g.k, py = art.anchorY + dy / g.k, tol = Math.max(0, tolerance / g.k);
  const rows = art.hitRows.length;
  for (let row = Math.max(0, Math.floor((py - tol) / cell)); row <= Math.min(rows - 1, Math.floor((py + tol) / cell)); row++) {
    for (let col = Math.max(0, Math.floor((px - tol) / cell)); col <= Math.min(art.hitCols - 1, Math.floor((px + tol) / cell)); col++) {
      if (!grid[row * art.hitCols + col]) continue;
      const nx = Math.max(col * cell, Math.min(px, (col + 1) * cell));
      const ny = Math.max(row * cell, Math.min(py, (row + 1) * cell));
      if (Math.hypot(px - nx, py - ny) <= tol) return true;
    }
  }
  return false;
}

/** Front-most flower under a tap. Exact silhouette hits win over tolerance hits, so a
 * neighbour's touch margin never steals a tap that lands on another cluster's petals.
 * Records without cluster art use the supplied legacy test. */
export function hitClusterFlower<T extends ClusterPose & { id: string }>(placements: readonly T[], x: number, y: number,
  tolerance: number, legacyHit: (placement: T) => boolean = () => false): T | null {
  const front = [...placements].sort((a, b) => b.worldY - a.worldY || b.id.localeCompare(a.id));
  for (const pass of [0, tolerance]) {
    for (const p of front) {
      const g = clusterGeometry(p);
      if (g ? hitsCluster(g, p, x, y, pass) : pass === 0 && legacyHit(p)) return p;
    }
  }
  return null;
}
