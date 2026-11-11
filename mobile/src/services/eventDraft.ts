import type { PrimaryMood } from './events';

/**
 * An unfinished Event: what the owner had done before leaving the Event / planting flow on purpose
 * (closing Events, Cancel while planting). A draft is never a planted flower: a flower is planted
 * only when Plant succeeds and the server keeps its spot (lib/flower-placement.js).
 *
 * - editing: Event text and mood, not saved yet.
 * - review:  Event saved with Save & Analyze; its flower exists but has no spot.
 * - placing: the owner was choosing the flower's spot.
 *
 * Kept in memory for the signed-in owner only and dropped on any account change
 * (plantingPersistence.scopeFlowerPlacements). Unsaved Event text never touches device storage.
 * After a restart, a saved Event whose flower has no spot is found again from the server.
 */
export type EventDraftStep = 'editing' | 'review' | 'placing';
export interface EventDraft {
  step: EventDraftStep;
  content: string;
  mood: PrimaryMood | null;
  eventId?: string;
  flowerId?: string;
}
export interface DraftSpot { worldX: number; worldY: number }

let owner: string | null = null;
let draft: EventDraft | null = null;
// The valid preview spot chosen for a flower before Plant, by flower id.
const previews = new Map<string, DraftSpot>();

export function scopeEventDraft(next: string | null) {
  if (next === owner) return;
  owner = next; draft = null; previews.clear();
}
const mine = (ownerId: string | null | undefined) => Boolean(ownerId) && ownerId === owner;

export function loadEventDraft(ownerId: string | null | undefined): EventDraft | null {
  return mine(ownerId) && draft ? { ...draft } : null;
}
export function saveEventDraft(ownerId: string | null | undefined, next: EventDraft) {
  if (!ownerId) return;
  if (ownerId !== owner) scopeEventDraft(ownerId);
  draft = { ...next };
}
export function clearEventDraft(ownerId: string | null | undefined) {
  if (!mine(ownerId)) return;
  if (draft?.flowerId) previews.delete(draft.flowerId);
  draft = null;
}

export function rememberPlantingPreview(ownerId: string | null | undefined, flowerId: string, spot: DraftSpot | null) {
  if (!ownerId) return;
  if (ownerId !== owner) scopeEventDraft(ownerId);
  if (spot && Number.isFinite(spot.worldX) && Number.isFinite(spot.worldY)) previews.set(flowerId, { worldX: spot.worldX, worldY: spot.worldY });
  else previews.delete(flowerId);
}
export function plantingPreview(ownerId: string | null | undefined, flowerId: string): DraftSpot | null {
  const spot = mine(ownerId) ? previews.get(flowerId) : undefined;
  return spot ? { ...spot } : null;
}
/** The flower was planted (or deleted): nothing about it is a draft any more. */
export function settleDraftFlower(ownerId: string | null | undefined, flowerId: string) {
  if (!mine(ownerId)) return;
  previews.delete(flowerId);
  if (draft?.flowerId === flowerId) draft = null;
}

/** The latest saved Event whose flower has no spot yet: an unfinished Event found on the server. */
export function unfinishedEventFlower<T extends { id: string; sourceEventId?: string; createdAt: string; worldX?: number | null }>(flowers: readonly T[]): T | null {
  return [...flowers].filter(flower => flower.sourceEventId && (flower.worldX === null || flower.worldX === undefined))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
