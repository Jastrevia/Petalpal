import { apiRequest } from './api';
import type { BackendFlower } from './events';

export type FlowerSource = 'EVENT' | 'DAILY' | 'HISTORICAL' | 'SOCIAL';
export interface GardenFlower extends BackendFlower {
  sourceType: FlowerSource;
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
  })[];
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
      // Planted position (server-owned, written once); null until the owner plants it.
      worldX: typeof flower.worldX === 'number' && Number.isFinite(flower.worldX) ? flower.worldX : null,
      worldY: typeof flower.worldY === 'number' && Number.isFinite(flower.worldY) ? flower.worldY : null,
      regionId: typeof flower.regionId === 'string' ? flower.regionId : null,
      sourceEventId: privateView ? flower.sourceEventId : undefined,
      dailyCheckInId: privateView ? flower.dailyCheckInId : undefined,
      sourceType: !privateView ? 'SOCIAL' : flower.sourceEventId ? 'EVENT'
        : flower.dailyCheckInId || flower.dailyCheckIn ? 'DAILY' : 'HISTORICAL',
      secondaryEmotions: privateView ? flowerSecondaryEmotions(flower) : [],
    };
  });
}

// Plants the owner's flower at its spot, once. The server refuses any later move (409).
export interface FlowerSpot { worldX: number; worldY: number; landId: string }
export async function plantFlowerSpot(ownerId: string, flowerId: string, spot: FlowerSpot): Promise<FlowerSpot> {
  const saved = await apiRequest<Partial<FlowerSpot>>(`/users/${encodeURIComponent(ownerId)}/flowers/${encodeURIComponent(flowerId)}/placement`,
    'POST', { worldX: spot.worldX, worldY: spot.worldY, landId: spot.landId });
  if (saved.worldX !== spot.worldX || saved.worldY !== spot.worldY || saved.landId !== spot.landId) throw new Error('Unable to save this flower’s spot. Try again.');
  return spot;
}

// Who came by the owner's Garden: the server keeps the latest 30 visit records with the
// owner's full Garden. Only these display fields are kept.
export interface GardenVisit { id: string; visitorId: string; visitorName: string; visitorAvatar?: string; action: string; createdAt: string }
export async function loadGardenVisits(ownerId: string): Promise<GardenVisit[]> {
  const data = await apiRequest<{ owner?: { id?: string }; visitRecords?: Partial<GardenVisit>[] }>(`/users/${encodeURIComponent(ownerId)}/garden`);
  if (data.owner?.id !== ownerId) throw new Error('Unable to load this Garden. Try again.');
  return (Array.isArray(data.visitRecords) ? data.visitRecords : [])
    .filter((r): r is GardenVisit => typeof r?.id === 'string' && typeof r.action === 'string' && typeof r.createdAt === 'string')
    .map(r => ({ id: r.id, visitorId: r.visitorId ?? '', visitorName: r.visitorName ?? '', visitorAvatar: r.visitorAvatar, action: r.action, createdAt: r.createdAt }));
}
