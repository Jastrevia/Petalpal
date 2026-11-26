import { type GardenLandLayout } from '../gardenMapLayout';
import {
  GARDEN_WORLD_HEIGHT,
  GARDEN_WORLD_WIDTH,
  MONTH_REGION_METAS,
  REGION_GRID_HEIGHT,
  REGION_GRID_SCALE,
  REGION_GRID_WIDTH,
  getRegionGrid,
} from './plantingRegionData';
import {
  getMonthMaskRefinement,
  isPointInMonthRefinedMaskWorld,
} from './plantingMaskRefinement';
import {
  type MonthRegionCalibration,
  PLANTING_REGION_CALIBRATION,
  getParentLand,
  worldToLandLocal,
  landLocalToWorld,
  landLocalToMaskLocal,
  maskLocalToLandLocal,
} from './plantingRegionGeometry';

export {
  type ParentLandAssetId,
  type MonthRegionCalibration,
  LAND_ASSET_ASPECT_RATIOS,
  getParentLand,
  getLandGeometry,
  worldToLandLocal,
  landLocalToWorld,
  landLocalToMaskLocal,
  maskLocalToLandLocal,
  PARENT_LAND_ASSET_BY_MONTH,
  PLANTING_REGION_CALIBRATION,
} from './plantingRegionGeometry';

const STORAGE_KEY = 'petalpal_planting_calibration_v1';

let activeCalibrationStore: Record<number, MonthRegionCalibration> = {
  ...PLANTING_REGION_CALIBRATION,
};

if (typeof localStorage !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        activeCalibrationStore = { ...PLANTING_REGION_CALIBRATION, ...parsed };
      }
    }
  } catch {
    // Ignore in non-browser environments
  }
}

export function worldToMaskLocal(
  worldX: number,
  worldY: number,
  month: number,
  calMap?: Record<number, MonthRegionCalibration>,
  layout?: GardenLandLayout
): { u: number; v: number; insideBBox: boolean } {
  const meta = MONTH_REGION_METAS[month];
  if (!meta) return { u: -1, v: -1, insideBBox: false };

  const cal = calMap?.[month] ?? activeCalibrationStore[month] ?? PLANTING_REGION_CALIBRATION[month];
  const land = getParentLand(cal.parentLandAsset, layout);
  const landLocal = worldToLandLocal(worldX, worldY, land);
  const maskLocal = landLocalToMaskLocal(landLocal.x, landLocal.y, cal, meta);

  const insideBBox =
    maskLocal.u >= 0 &&
    maskLocal.u <= meta.bbox.width &&
    maskLocal.v >= 0 &&
    maskLocal.v <= meta.bbox.height;

  return { u: maskLocal.u, v: maskLocal.v, insideBBox };
}

export function maskLocalToWorld(
  u: number,
  v: number,
  month: number,
  calMap?: Record<number, MonthRegionCalibration>,
  layout?: GardenLandLayout
): { x: number; y: number } {
  const meta = MONTH_REGION_METAS[month];
  const cal = calMap?.[month] ?? activeCalibrationStore[month] ?? PLANTING_REGION_CALIBRATION[month];
  const land = getParentLand(cal.parentLandAsset, layout);
  const landLocal = maskLocalToLandLocal(u, v, cal, meta);
  return landLocalToWorld(landLocal.x, landLocal.y, land);
}

export function getCalibratedCentroid(
  month: number,
  calMap?: Record<number, MonthRegionCalibration>,
  layout?: GardenLandLayout
): { x: number; y: number } {
  const meta = MONTH_REGION_METAS[month];
  if (!meta) return { x: 1200, y: 900 };

  const u = meta.centroid.x - meta.bbox.x;
  const v = meta.centroid.y - meta.bbox.y;
  return maskLocalToWorld(u, v, month, calMap, layout);
}

export function getCalibratedRegionAtWorld(
  worldX: number,
  worldY: number,
  targetMonth?: number,
  calMap?: Record<number, MonthRegionCalibration>,
  layout?: GardenLandLayout
): number {
  if (
    worldX < 0 ||
    worldX >= GARDEN_WORLD_WIDTH ||
    worldY < 0 ||
    worldY >= GARDEN_WORLD_HEIGHT
  ) {
    return 0;
  }

  const grid = getRegionGrid();

  if (targetMonth && targetMonth >= 1 && targetMonth <= 12) {
    const savedRefinement = getMonthMaskRefinement(targetMonth);
    if (savedRefinement && savedRefinement.strokes.length > 0) {
      if (isPointInMonthRefinedMaskWorld(targetMonth, worldX, worldY, undefined, calMap, layout)) {
        return targetMonth;
      }
    } else {
      const { u, v, insideBBox } = worldToMaskLocal(worldX, worldY, targetMonth, calMap, layout);
      if (insideBBox) {
        const meta = MONTH_REGION_METAS[targetMonth];
        const uncalWorldX = meta.bbox.x + u;
        const uncalWorldY = meta.bbox.y + v;
        const gx = Math.floor(uncalWorldX / REGION_GRID_SCALE);
        const gy = Math.floor(uncalWorldY / REGION_GRID_SCALE);
        if (gx >= 0 && gx < REGION_GRID_WIDTH && gy >= 0 && gy < REGION_GRID_HEIGHT) {
          const val = grid[gy * REGION_GRID_WIDTH + gx];
          if (val === targetMonth) {
            return targetMonth;
          }
        }
      }
    }
  }

  for (let m = 1; m <= 12; m++) {
    if (m === targetMonth) continue;
    const savedRefinement = getMonthMaskRefinement(m);
    if (savedRefinement && savedRefinement.strokes.length > 0) {
      if (isPointInMonthRefinedMaskWorld(m, worldX, worldY, undefined, calMap, layout)) {
        return m;
      }
    } else {
      const { u, v, insideBBox } = worldToMaskLocal(worldX, worldY, m, calMap, layout);
      if (insideBBox) {
        const meta = MONTH_REGION_METAS[m];
        const uncalWorldX = meta.bbox.x + u;
        const uncalWorldY = meta.bbox.y + v;
        const gx = Math.floor(uncalWorldX / REGION_GRID_SCALE);
        const gy = Math.floor(uncalWorldY / REGION_GRID_SCALE);
        if (gx >= 0 && gx < REGION_GRID_WIDTH && gy >= 0 && gy < REGION_GRID_HEIGHT) {
          const val = grid[gy * REGION_GRID_WIDTH + gx];
          if (val === m) {
            return m;
          }
        }
      }
    }
  }

  return 0;
}

export function getActiveCalibration(): Record<number, MonthRegionCalibration> {
  return activeCalibrationStore;
}

export function setActiveCalibration(cal: Record<number, MonthRegionCalibration>): void {
  activeCalibrationStore = { ...cal };
}

export function loadCalibrationFromStorage(): Record<number, MonthRegionCalibration> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          activeCalibrationStore = { ...PLANTING_REGION_CALIBRATION, ...parsed };
          return activeCalibrationStore;
        }
      }
    }
  } catch (err) {
    console.warn('[Calibration] Failed to load from localStorage:', err);
  }
  return { ...PLANTING_REGION_CALIBRATION };
}

export function saveCalibrationToStorage(
  cal: Record<number, MonthRegionCalibration>
): void {
  activeCalibrationStore = { ...cal };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cal));
    }
  } catch (err) {
    console.warn('[Calibration] Failed to save to localStorage:', err);
  }
}

export function resetCalibrationStorage(): void {
  activeCalibrationStore = { ...PLANTING_REGION_CALIBRATION };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[Calibration] Failed to clear localStorage:', err);
  }
}

export function exportCalibrationSource(
  cal: Record<number, MonthRegionCalibration>
): string {
  return `export const PLANTING_REGION_CALIBRATION: Record<number, MonthRegionCalibration> = ${JSON.stringify(cal, null, 2)};\n`;
}
