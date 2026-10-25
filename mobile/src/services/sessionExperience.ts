import { apiRequest } from './api';
import type { FlowerSession } from '../components/garden/planting/flowerDetailApi';

export type SessionUser = FlowerSession['user'] & {
  email?: string;
  accountId?: string;
  preferredLocale?: string;
  betaTester?: boolean; // joined during the beta (server: lib/beta-cohort.js)
};
export interface SessionExperience {
  user: SessionUser;
  fairyState: { onboardingStep: string; onboardingCompleted: boolean; lastEvent?: string;
    unlockedFeatures?: string[] } | null;
  todayCheckIn: { id: string; localDate: string } | null;
  hasCheckedInToday: boolean;
  dailyGrowLimitEnabled: boolean;
  gardenOwnerId: string | null;
}
interface SessionResponse extends Omit<SessionExperience, 'gardenOwnerId'> {
  garden?: { owner?: { id: string } };
}
export async function loadSessionExperience(): Promise<SessionExperience> {
  const data = await apiRequest<SessionResponse>('/session?view=metadata');
  if (!data.user?.id) throw new Error('Missing authenticated profile');
  // Keep only the experience metadata needed by the app. No Journal text,
  // flowers or visitor records become an additional auth cache.
  return {
    user: data.user,
    fairyState: data.fairyState ? {
      onboardingStep: data.fairyState.onboardingStep,
      onboardingCompleted: Boolean(data.fairyState.onboardingCompleted),
      lastEvent: data.fairyState.lastEvent,
      unlockedFeatures: data.fairyState.unlockedFeatures,
    } : null,
    todayCheckIn: data.todayCheckIn ? { id: data.todayCheckIn.id, localDate: data.todayCheckIn.localDate } : null,
    hasCheckedInToday: Boolean(data.hasCheckedInToday),
    dailyGrowLimitEnabled: data.dailyGrowLimitEnabled !== false,
    gardenOwnerId: data.garden?.owner?.id || null,
  };
}
