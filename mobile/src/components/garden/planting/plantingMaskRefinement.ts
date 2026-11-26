import { type GardenLandLayout } from '../gardenMapLayout';
import {
  GARDEN_WORLD_HEIGHT,
  GARDEN_WORLD_WIDTH,
  MONTH_REGION_METAS,
  MonthRegionMeta,
  REGION_GRID_HEIGHT,
  REGION_GRID_SCALE,
  REGION_GRID_WIDTH,
  getRegionGrid,
} from './plantingRegionData';
import {
  type MonthRegionCalibration,
  type ParentLandAssetId,
  PLANTING_REGION_CALIBRATION,
  getParentLand,
  landLocalToMaskLocal,
  worldToLandLocal,
} from './plantingRegionGeometry';

export type MaskTool = 'add' | 'remove';

export interface MaskPoint {
  x: number; // Refinement-local coordinates (land-local minus the month offset)
  y: number;
}

export interface MaskOffset {
  offsetX: number; // Translation in parent-land pixels, after mask calibration
  offsetY: number;
}

export interface MaskStroke {
  id: string;
  tool: MaskTool;
  radius: number; // Land-local pixels (radius = diameter / 2)
  points: MaskPoint[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface MonthMaskRefinement {
  version: 1;
  month: number;
  landId: string;
  parentLandAsset: ParentLandAssetId;
  strokes: MaskStroke[];
  offsetX?: number; // Optional for compatibility with existing version 1 saves
  offsetY?: number;
  savedAt: string;
}

export interface MaskEditState extends MaskOffset {
  strokes: MaskStroke[];
}

export interface MaskEditHistory {
  current: MaskEditState;
  undo: MaskEditState[];
  redo: MaskEditState[];
}

export function getMaskRefinementOffset(offset?: Partial<MaskOffset> | null): MaskOffset {
  const offsetX = offset?.offsetX ?? 0;
  const offsetY = offset?.offsetY ?? 0;
  return {
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
  };
}

export function landLocalToRefinementLocal(point: MaskPoint, offset: MaskOffset): MaskPoint {
  return { x: point.x - offset.offsetX, y: point.y - offset.offsetY };
}

export function createMaskEditHistory(refinement?: MonthMaskRefinement | null): MaskEditHistory {
  return {
    current: { strokes: [...(refinement?.strokes ?? [])], ...getMaskRefinementOffset(refinement) },
    undo: [],
    redo: [],
  };
}

// Each history entry is a whole immutable edit state. Drag/paint previews replace
// current only; commit once per gesture so Undo restores both position and shape.
export function commitMaskEdit(history: MaskEditHistory, current: MaskEditState): MaskEditHistory {
  if (current.strokes === history.current.strokes &&
      current.offsetX === history.current.offsetX && current.offsetY === history.current.offsetY) {
    return history;
  }
  return { current, undo: [...history.undo, history.current], redo: [] };
}

export function undoMaskEdit(history: MaskEditHistory): MaskEditHistory {
  if (history.undo.length === 0) return history;
  return {
    current: history.undo[history.undo.length - 1],
    undo: history.undo.slice(0, -1),
    redo: [...history.redo, history.current],
  };
}

export function redoMaskEdit(history: MaskEditHistory): MaskEditHistory {
  if (history.redo.length === 0) return history;
  return {
    current: history.redo[history.redo.length - 1],
    undo: [...history.undo, history.current],
    redo: history.redo.slice(0, -1),
  };
}

export function resetMaskEditToLockedBase(history: MaskEditHistory): MaskEditHistory {
  // Reset is a preview edit until Save; Cancel can still restore the saved mask.
  return commitMaskEdit(history, { strokes: [], offsetX: 0, offsetY: 0 });
}

const STORAGE_KEY_PREFIX = 'petalpal_planting_mask_refinement_v1_month_';

// In-memory cache of active refinements per month
const activeRefinements: Record<number, MonthMaskRefinement | null> = {};
let isStorageLoaded = false;

export function loadAllMaskRefinementsFromStorage(): Record<number, MonthMaskRefinement | null> {
  if (typeof localStorage === 'undefined') return activeRefinements;
  try {
    for (let m = 1; m <= 12; m++) {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${m}`);
      if (raw) {
        const parsed = JSON.parse(raw) as MonthMaskRefinement;
        if (parsed && parsed.version === 1 && parsed.month === m) {
          activeRefinements[m] = { ...parsed, ...getMaskRefinementOffset(parsed) };
        }
      }
    }
  } catch (err) {
    console.warn('[MaskRefinement] Failed to load from localStorage:', err);
  }
  isStorageLoaded = true;
  return activeRefinements;
}

export function getMonthMaskRefinement(month: number): MonthMaskRefinement | null {
  if (!isStorageLoaded) {
    loadAllMaskRefinementsFromStorage();
  }
  return activeRefinements[month] ?? null;
}

export const loadMonthMaskRefinement = getMonthMaskRefinement;

export function saveMonthMaskRefinement(
  month: number,
  strokes: MaskStroke[],
  landId: string,
  parentLandAsset: ParentLandAssetId,
  offset?: MaskOffset
): MonthMaskRefinement {
  const refinement: MonthMaskRefinement = {
    version: 1,
    month,
    landId,
    parentLandAsset,
    strokes: [...strokes],
    ...getMaskRefinementOffset(offset),
    savedAt: new Date().toISOString(),
  };

  activeRefinements[month] = refinement;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${month}`, JSON.stringify(refinement));
    }
  } catch (err) {
    console.warn(`[MaskRefinement] Failed to save month ${month} to localStorage:`, err);
  }

  return refinement;
}

export function resetMonthMaskRefinement(month: number): void {
  activeRefinements[month] = null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${month}`);
    }
  } catch (err) {
    console.warn(`[MaskRefinement] Failed to clear month ${month} from localStorage:`, err);
  }
}

export function createMaskStroke(tool: MaskTool, radius: number, points: MaskPoint[]): MaskStroke {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    if (pt.x - radius < minX) minX = pt.x - radius;
    if (pt.y - radius < minY) minY = pt.y - radius;
    if (pt.x + radius > maxX) maxX = pt.x + radius;
    if (pt.y + radius > maxY) maxY = pt.y + radius;
  }

  return {
    id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    tool,
    radius,
    points: [...points],
    bbox: { minX, minY, maxX, maxY },
  };
}

/**
 * Returns distance squared from point (px, py) to line segment (x1, y1)-(x2, y2).
 */
function distSqToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) {
    const dx = px - x1;
    const dy = py - y1;
    return dx * dx + dy * dy;
  }
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  const dx = px - projX;
  const dy = py - projY;
  return dx * dx + dy * dy;
}

/**
 * Proves containment of the whole circular footprint, including small interior
 * holes that perimeter/ring samples miss. Cells are classified conservatively:
 * a stroke distance bound covers every point of a cell; the base uses all grid
 * cells under its inverse calibration. Uncertain boundary cells are subdivided,
 * never accepted by a center sample. This does not alter the approved mask.
 */
export function isCircleInRefinedMaskLandLocal(
  month: number,
  landX: number,
  landY: number,
  radius: number,
  strokes: MaskStroke[],
  cal: MonthRegionCalibration,
  meta: MonthRegionMeta,
  offset: MaskOffset
): boolean {
  const center = landLocalToRefinementLocal({ x: landX, y: landY }, offset);
  if (!Number.isFinite(radius) || radius < 0) return false;
  if (radius === 0) return isPointInRefinedMaskLandLocal(month, landX, landY, strokes, cal, meta, offset);
  const grid = getRegionGrid();
  const relevant = strokes.filter((s) => s.points.length > 0 &&
    s.bbox.minX <= center.x + radius && s.bbox.maxX >= center.x - radius &&
    s.bbox.minY <= center.y + radius && s.bbox.maxY >= center.y - radius);
  function classify(x: number, y: number, half: number): -1 | 0 | 1 {
    const diagonal = half * Math.SQRT2;
    let partialAdd = false;
    let partialRemove = false;
    const resolve = (status: -1 | 0 | 1): -1 | 0 | 1 =>
      status === 1 && !partialRemove ? 1 : status === -1 && !partialAdd ? -1 : 0;
    for (let i = relevant.length - 1; i >= 0; i--) {
      const s = relevant[i];
      if (x + half < s.bbox.minX || x - half > s.bbox.maxX ||
          y + half < s.bbox.minY || y - half > s.bbox.maxY) continue;
      let distanceSq = Infinity;
      if (s.points.length === 1) {
        distanceSq = (x - s.points[0].x) ** 2 + (y - s.points[0].y) ** 2;
      } else {
        for (let j = 1; j < s.points.length; j++) {
          distanceSq = Math.min(distanceSq, distSqToSegment(x, y,
            s.points[j - 1].x, s.points[j - 1].y, s.points[j].x, s.points[j].y));
        }
      }
      const distance = Math.sqrt(distanceSq);
      if (distance - diagonal > s.radius) continue;
      if (distance + diagonal <= s.radius) return resolve(s.tool === 'add' ? 1 : -1);
      // A partial Add cannot invalidate an already-covered cell, and a partial
      // Remove cannot make an empty cell plantable. Keep inspecting older coverage
      // so filled-over holes do not leave false boundaries in the containment proof.
      if (s.tool === 'add') partialAdd = true;
      else partialRemove = true;
    }
    const corners = [
      landLocalToMaskLocal(x - half, y - half, cal, meta),
      landLocalToMaskLocal(x + half, y - half, cal, meta),
      landLocalToMaskLocal(x - half, y + half, cal, meta),
      landLocalToMaskLocal(x + half, y + half, cal, meta),
    ];
    const minU = Math.min(...corners.map((p) => p.u));
    const maxU = Math.max(...corners.map((p) => p.u));
    const minV = Math.min(...corners.map((p) => p.v));
    const maxV = Math.max(...corners.map((p) => p.v));
    if (maxU < 0 || maxV < 0 || minU > meta.bbox.width || minV > meta.bbox.height) return resolve(-1);
    let inside = false;
    let outside = minU < 0 || minV < 0 || maxU > meta.bbox.width || maxV > meta.bbox.height;
    const minGX = Math.floor((meta.bbox.x + Math.max(0, minU)) / REGION_GRID_SCALE);
    const maxGX = Math.floor((meta.bbox.x + Math.min(meta.bbox.width, maxU)) / REGION_GRID_SCALE);
    const minGY = Math.floor((meta.bbox.y + Math.max(0, minV)) / REGION_GRID_SCALE);
    const maxGY = Math.floor((meta.bbox.y + Math.min(meta.bbox.height, maxV)) / REGION_GRID_SCALE);
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const plantable = gx >= 0 && gy >= 0 && gx < REGION_GRID_WIDTH && gy < REGION_GRID_HEIGHT &&
          grid[gy * REGION_GRID_WIDTH + gx] === month;
        inside ||= plantable;
        outside ||= !plantable;
        if (inside && outside) return 0;
      }
    }
    return resolve(inside ? 1 : -1);
  }
  let remainingCells = 100000;
  function covered(x: number, y: number, half: number): boolean {
    const dx = Math.max(Math.abs(x - center.x) - half, 0);
    const dy = Math.max(Math.abs(y - center.y) - half, 0);
    if (dx * dx + dy * dy > radius * radius) return true; // Entire cell is outside the footprint.
    const status = classify(x, y, half);
    if (status !== 0) return status === 1;
    // Numerical/work limits fail closed; no unproved portion of a footprint is accepted.
    if (half <= 1 / 1024 || --remainingCells <= 0) return false;
    const h = half / 2;
    return covered(x - h, y - h, h) && covered(x + h, y - h, h) &&
      covered(x - h, y + h, h) && covered(x + h, y + h, h);
  }
  return covered(center.x, center.y, radius);
}

/**
 * Checks if point (lx, ly) in Land-local coordinates falls within a stroke.
 */
export function isPointInStroke(lx: number, ly: number, stroke: MaskStroke): boolean {
  const { bbox, radius, points } = stroke;
  if (lx < bbox.minX || lx > bbox.maxX || ly < bbox.minY || ly > bbox.maxY) {
    return false;
  }

  const rSq = radius * radius;
  if (points.length === 1) {
    const dx = lx - points[0].x;
    const dy = ly - points[0].y;
    return dx * dx + dy * dy <= rSq;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (distSqToSegment(lx, ly, p1.x, p1.y, p2.x, p2.y) <= rSq) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether (lx, ly) in Land-local coordinates hits the locked Base Mask.
 */
export function isPointInBaseMask(
  month: number,
  landX: number,
  landY: number,
  cal: MonthRegionCalibration,
  meta: MonthRegionMeta
): boolean {
  const maskLocal = landLocalToMaskLocal(landX, landY, cal, meta);
  if (
    maskLocal.u < 0 ||
    maskLocal.u > meta.bbox.width ||
    maskLocal.v < 0 ||
    maskLocal.v > meta.bbox.height
  ) {
    return false;
  }

  const grid = getRegionGrid();
  const uncalX = meta.bbox.x + maskLocal.u;
  const uncalY = meta.bbox.y + maskLocal.v;
  const gx = Math.floor(uncalX / REGION_GRID_SCALE);
  const gy = Math.floor(uncalY / REGION_GRID_SCALE);

  if (gx >= 0 && gx < REGION_GRID_WIDTH && gy >= 0 && gy < REGION_GRID_HEIGHT) {
    return grid[gy * REGION_GRID_WIDTH + gx] === month;
  }

  return false;
}

/**
 * Evaluates plantability of a Land-local point (lx, ly) using:
 * FINAL MASK = LOCKED BASE MASK + ADD STROKES - REMOVE STROKES
 * Evaluated in reverse chronological order for accurate sequential editing.
 */
export function isPointInRefinedMaskLandLocal(
  month: number,
  landX: number,
  landY: number,
  strokes: MaskStroke[],
  cal: MonthRegionCalibration,
  meta: MonthRegionMeta,
  offset: MaskOffset = { offsetX: 0, offsetY: 0 }
): boolean {
  const local = landLocalToRefinementLocal({ x: landX, y: landY }, offset);
  // Check strokes in reverse chronological order (newest stroke takes precedence)
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (isPointInStroke(local.x, local.y, stroke)) {
      return stroke.tool === 'add';
    }
  }

  // If no manual stroke covered this point, fall back to the locked base mask
  return isPointInBaseMask(month, local.x, local.y, cal, meta);
}

/**
 * Evaluates plantability of a Garden world coordinate (worldX, worldY).
 * Returns true if plantable in Month m.
 */
export function isPointInMonthRefinedMaskWorld(
  month: number,
  worldX: number,
  worldY: number,
  strokes?: MaskStroke[],
  calMap?: Record<number, MonthRegionCalibration>,
  layout?: GardenLandLayout
): boolean {
  if (
    worldX < 0 ||
    worldX >= GARDEN_WORLD_WIDTH ||
    worldY < 0 ||
    worldY >= GARDEN_WORLD_HEIGHT
  ) {
    return false;
  }

  const meta = MONTH_REGION_METAS[month];
  if (!meta) return false;

  const cal = calMap?.[month] ?? PLANTING_REGION_CALIBRATION[month];
  const land = getParentLand(cal.parentLandAsset, layout);
  const landLocal = worldToLandLocal(worldX, worldY, land);

  // If explicit strokes provided (e.g. active editing session), use them
  if (strokes) {
    return isPointInRefinedMaskLandLocal(month, landLocal.x, landLocal.y, strokes, cal, meta);
  }

  // Otherwise check if a saved refinement exists for this month
  const savedRefinement = getMonthMaskRefinement(month);
  if (savedRefinement) {
    return isPointInRefinedMaskLandLocal(
      month,
      landLocal.x,
      landLocal.y,
      savedRefinement.strokes,
      cal,
      meta,
      getMaskRefinementOffset(savedRefinement)
    );
  }

  // Fall back to locked base mask
  return isPointInBaseMask(month, landLocal.x, landLocal.y, cal, meta);
}

/**
 * Converts stroke points to SVG path format for Skia <Path>.
 */
export function strokeToSvgPath(points: MaskPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}
