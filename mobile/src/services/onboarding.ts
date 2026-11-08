import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';

// Owner-scoped first-time tour progress (server: lib/onboarding-tutorial.js).
export interface OnboardingProgress {
  status: 'active' | 'completed';
  step: string;
  fairyName: string | null;
  fairyNamed: boolean;
  firstEventId: string | null;
  firstFlowerId: string | null;
  flowerPlanted: boolean;
}
export interface OnboardingUpdate {
  step?: string;
  fairyName?: string;
  firstEventId?: string;
  firstFlowerId?: string;
  flowerPlanted?: true;
  complete?: true;
}

const userStorageKey = (userId: string) => `petalpal_onboarding_progress_v1:${encodeURIComponent(userId)}`;

let currentUserId: string | null = null;
export function setOnboardingUser(userId: string | null) {
  currentUserId = userId;
}

const readCache = async (ownerId: string): Promise<OnboardingProgress | null> => {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(userStorageKey(ownerId))) || 'null');
    return parsed && typeof parsed === 'object' && typeof parsed.step === 'string' ? parsed as OnboardingProgress : null;
  } catch { return null; }
};
const writeCache = async (ownerId: string | null | undefined, progress: OnboardingProgress) => {
  if (!ownerId) return;
  try { await AsyncStorage.setItem(userStorageKey(ownerId), JSON.stringify(progress)); } catch {}
};

/** The server is the record (GET /api/onboarding); this device only keeps a copy. Offline, a copy
 * that says the tour is finished keeps it closed; nothing else starts the tour without the server,
 * so an existing owner never sees it because of a network failure. */
export async function loadOnboarding(userId?: string): Promise<OnboardingProgress> {
  const ownerId = userId || currentUserId;
  try {
    const progress = await apiRequest<OnboardingProgress>('/api/onboarding');
    await writeCache(ownerId, progress);
    return progress;
  } catch (error) {
    const cached = ownerId ? await readCache(ownerId) : null;
    if (cached?.status === 'completed') return cached;
    throw error;
  }
}

/** One owner-scoped update; the server's answer (never an optimistic guess) is what is kept. */
export async function updateOnboarding(update: OnboardingUpdate, userId?: string): Promise<OnboardingProgress> {
  const ownerId = userId || currentUserId;
  const progress = await apiRequest<OnboardingProgress>('/api/onboarding', 'PATCH', update);
  await writeCache(ownerId, progress);
  return progress;
}
