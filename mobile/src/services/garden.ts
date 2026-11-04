import { apiRequest } from './api';
import type { BackendFlower } from './events';

export type FlowerSource = 'EVENT' | 'DAILY' | 'HISTORICAL' | 'SOCIAL';
/** A saved Garden position (world coordinates + logical Land), from layoutVersion 2 Flowers only. */
export interface GardenPlacement { worldX: number; worldY: number; landId: string; scale: number; rotation: number }
export const WORLD_LAYOUT_VERSION = 2;
export interface GardenFlower extends BackendFlower {
  sourceType: FlowerSource;
  placement?: GardenPlacement;
  dailyCheckInId?: string;
  secondaryEmotions: string[];
  variant?: string;
  rarity?: string;
  growthState?: string;
  season?: string;
}
interface GardenResponse {
  owner: { id: string };
  flowers: (BackendFlower & {
    dailyCheckInId?: string;
    dailyCheckIn?: { emotionResult?: { secondaryEmotions?: unknown } };
    variant?: string; rarity?: string; growthState?: string; season?: string;
    left?: number; top?: number; regionId?: string | null; scale?: number; rotation?: number; layoutVersion?: number;
  })[];
}
// Legacy Flowers keep random coordinates from the old web Garden (layoutVersion 1); they are never positions.
export function gardenPlacement(flower: GardenResponse['flowers'][number]): GardenPlacement | undefined {
  const { left, top, regionId, scale, rotation } = flower;
  if (flower.layoutVersion !== WORLD_LAYOUT_VERSION || typeof left !== 'number' || typeof top !== 'number'
    || !Number.isFinite(left) || !Number.isFinite(top) || typeof regionId !== 'string' || !/^Land(0[1-9]|1[0-2])$/.test(regionId)) return undefined;
  return { worldX: left, worldY: top, landId: regionId,
    scale: typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : 1,
    rotation: typeof rotation === 'number' && Number.isFinite(rotation) ? rotation : 0 };
}
// React Garden's historical mapping, without presentation or Journal content.
export function flowerSecondaryEmotions(flower: GardenResponse['flowers'][number]): string[] {
  const labels = flower.sourceEventId ? flower.sourceEvent?.secondaryEmotions
    : flower.dailyCheckIn?.emotionResult?.secondaryEmotions;
  return Array.isArray(labels) ? labels.filter((label): label is string => typeof label === 'string') : [];
}
export async function loadGarden(ownerId: string, viewerId: string): Promise<GardenFlower[]> {
  if (!ownerId || !viewerId) throw new Error('Sign in to load your Garden.');
  const data = await apiRequest<GardenResponse>(`/users/${encodeURIComponent(ownerId)}/garden${ownerId === viewerId ? "?view=metadata" : ""}`);
  if (data.owner?.id !== ownerId || !Array.isArray(data.flowers)) throw new Error('Unable to load this Garden. Try again.');
  const privateView = ownerId === viewerId;
  return data.flowers.map((flower) => {
    if (!flower.id || (flower.userId && flower.userId !== ownerId)) throw new Error('Unable to verify this Garden flower.');
    // Explicit allowlist: never retain raw Event/Journal text, visitor records or legacy coordinates.
    return {
      id: flower.id, userId: ownerId, name: flower.name, speciesCode: flower.speciesCode,
      mood: flower.mood, img: flower.img, createdAt: flower.createdAt, meaning: flower.meaning,
      supportCount: flower.supportCount, colorAccent: flower.colorAccent, visualEffect: flower.visualEffect,
      variant: flower.variant, rarity: flower.rarity, growthState: flower.growthState, season: flower.season,
      sourceEventId: privateView ? flower.sourceEventId : undefined,
      dailyCheckInId: privateView ? flower.dailyCheckInId : undefined,
      sourceType: !privateView ? 'SOCIAL' : flower.sourceEventId ? 'EVENT'
        : flower.dailyCheckInId || flower.dailyCheckIn ? 'DAILY' : 'HISTORICAL',
      secondaryEmotions: privateView ? flowerSecondaryEmotions(flower) : [],
      placement: gardenPlacement(flower),
    };
  });
}
