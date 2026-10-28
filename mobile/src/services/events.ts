import { apiRequest } from './api';
import type { FlowerPlacementRecord } from '../components/garden/planting/plantingPersistence';
export type PrimaryMood = 'SUNNY_BLOOM' | 'GENTLE_BLOOM' | 'QUIET_BLOOM' | 'HEALING_BLOOM' | 'FIRE_BLOOM' | 'WONDER_BLOOM' | 'DRIFTING_BLOOM' | 'PEACEFUL_BLOOM';
// Selection choices only: inference, redundancy filtering and species selection stay on the backend.
export const PRIMARY_MOODS: PrimaryMood[] = ['SUNNY_BLOOM','GENTLE_BLOOM','QUIET_BLOOM','HEALING_BLOOM','FIRE_BLOOM','WONDER_BLOOM','DRIFTING_BLOOM','PEACEFUL_BLOOM'];
export interface BackendEvent {
  id: string; content: string; occurredAt: string; localDate: string; primaryGardenMood: PrimaryMood | null;
  secondaryEmotions: string[]; emotionStatus: string; memoryProcessingAllowed: boolean;
}
export interface BackendFlower {
  id: string; userId: string; sourceEventId?: string; name: string; speciesCode: string;
  mood: string; img: string; createdAt: string; event?: string; meaning?: string;
  supportCount: number; colorAccent?: string; visualEffect?: string;
  sourceEvent?: { secondaryEmotions: string[] };
  /** Garden spot, set once when the owner plants it (null until then). regionId is its land. */
  worldX?: number | null; worldY?: number | null; regionId?: string | null;
}
export interface EventResponse {
  event: BackendEvent; flower: BackendFlower | null;
  emotion: { status: string; labels: string[]; fallbackReason?: string };
  memoryJob: { id: string; status: string } | null;
  dailyFlowers?: { limit: number; planted: number; limitReached: boolean };
}
// New flowers today (server limit: 2 per account-local day; deleting one does not give it back).
// `limit` is null when the server lifts the limit for TEST runs.
export interface FlowersToday { localDate: string; limit: number | null; planted: number | null; remaining: number | null }
export const loadFlowersToday = () => apiRequest<FlowersToday>('/api/flowers/today');
export const createEvent = (content: string, primaryGardenMood: PrimaryMood, idempotencyKey: string) =>
  apiRequest<EventResponse>('/events', 'POST', { content: content.trim(), primaryGardenMood },
    { headers: { 'Idempotency-Key': idempotencyKey } });
export const readEvent = (id: string) => apiRequest<BackendEvent>(`/events/${encodeURIComponent(id)}`);
export async function eventFlowers(userId: string) {
  const garden = await apiRequest<{ flowers: BackendFlower[] }>(`/users/${encodeURIComponent(userId)}/garden`);
  return garden.flowers.filter((flower) => flower.sourceEventId);
}
export function plantingRecord(flower: BackendFlower, timezone = 'UTC', localDate?: string): FlowerPlacementRecord {
  const month = localDate ? Number(localDate.slice(5, 7))
    : Number(new Intl.DateTimeFormat('en', { timeZone: timezone, month: 'numeric' }).format(new Date(flower.createdAt)));
  return { id: flower.id, flowerId: flower.id, journalEntryId: '', sourceEventId: flower.sourceEventId,
    ownerUserId: flower.userId, plantedDate: flower.createdAt, month, worldX: 0, worldY: 0,
    scale: 1, rotation: 0, placementVersion: 1, flowerName: flower.name, speciesCode: flower.speciesCode,
    mood: flower.mood, supportCount: flower.supportCount, image: flower.img, meaning: flower.meaning,
    colorAccent: flower.colorAccent, visualEffect: flower.visualEffect,
    secondaryEmotions: flower.sourceEvent?.secondaryEmotions || [], };
}
export function emotionMessage(status: string) {
  if (status === 'PENDING' || status === 'RUNNING') return 'Emotion details are pending.';
  if (status === 'SUCCESS') return 'Emotion details are ready.';
  if (status === 'FAILED') return 'Emotion details are unavailable. Your Event is saved and your Primary Mood stays selected.';
  return 'Your Event is saved. Secondary emotion processing was skipped.';
}
export function memoryMessage(job: EventResponse['memoryJob']) {
  if (!job) return 'No memory work was queued for this Event.';
  if (job.status === 'SUCCEEDED') return 'Memory processing completed.';
  if (job.status === 'FAILED') return 'Memory processing failed. Your Event remains saved.';
  if (job.status === 'CANCELLED') return 'Memory processing was cancelled. Your Event remains saved.';
  return 'Memory processing is pending. Your Event is saved.';
}
