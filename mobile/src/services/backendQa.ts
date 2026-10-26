import { loadGarden } from './garden';
import { loadSessionExperience } from './sessionExperience';

export const BACKEND_QA_FEATURES = [
  ['Auth / Session', 'REAL'], ['Events / Flowers', 'REAL'], ['Garden', 'REAL'],
  ['Daily Check-in', 'PREVIEW'], ['Profile / Avatar', 'PREVIEW'],
  ['AI Consent / Settings', 'PREVIEW'], ['Friends', 'PREVIEW'],
  ['Friend Requests', 'PREVIEW'], ['Visit Friend Garden', 'PREVIEW'],
  ['Support / Flower interaction', 'REAL'], ['Realtime updates', 'PREVIEW'],
  ['Fairy / Memory', 'PREVIEW'], ['Weekly', 'PREVIEW'],
  ['Monthly', 'PREVIEW'],
] as const;

export interface BackendQaSummary {
  ownerId: string;
  flowers: number;
  eventFlowers: number;
  historicalOrDailyFlowers: number;
  flowersWithSecondaryEmotions: number;
  checkedInToday: boolean;
}

// Reuse authenticated services; retain only owner identity and aggregate results.
export async function loadBackendQaSummary(ownerId: string): Promise<BackendQaSummary> {
  const session = await loadSessionExperience();
  if (session.user.id !== ownerId) throw new Error('Session changed');
  const flowers = await loadGarden(ownerId, ownerId);
  return {
    ownerId, flowers: flowers.length,
    eventFlowers: flowers.filter(flower => flower.sourceType === 'EVENT').length,
    historicalOrDailyFlowers: flowers.filter(flower => flower.sourceType === 'HISTORICAL' || flower.sourceType === 'DAILY').length,
    flowersWithSecondaryEmotions: flowers.filter(flower => flower.secondaryEmotions.length > 0).length,
    checkedInToday: session.hasCheckedInToday,
  };
}
