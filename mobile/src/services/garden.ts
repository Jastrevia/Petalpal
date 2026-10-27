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
      sourceEventId: privateView ? flower.sourceEventId : undefined,
      dailyCheckInId: privateView ? flower.dailyCheckInId : undefined,
      sourceType: !privateView ? 'SOCIAL' : flower.sourceEventId ? 'EVENT'
        : flower.dailyCheckInId || flower.dailyCheckIn ? 'DAILY' : 'HISTORICAL',
      secondaryEmotions: privateView ? flowerSecondaryEmotions(flower) : [],
    };
  });
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
