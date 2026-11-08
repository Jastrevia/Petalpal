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

export async function loadOnboarding(userId?: string, existingCompleted?: boolean): Promise<OnboardingProgress> {
  const ownerId = userId || currentUserId;
  try {
    const progress = await apiRequest<OnboardingProgress>('/api/onboarding');
    if (ownerId && progress) {
      try {
        await AsyncStorage.setItem(userStorageKey(ownerId), JSON.stringify(progress));
      } catch {}
    }
    return progress;
  } catch (err: any) {
    if (ownerId) {
      try {
        const raw = await AsyncStorage.getItem(userStorageKey(ownerId));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return parsed as OnboardingProgress;
          }
        }
      } catch {}

      if (existingCompleted) {
        const completedProgress: OnboardingProgress = {
          status: 'completed',
          step: 'done',
          fairyName: null,
          fairyNamed: true,
          firstEventId: null,
          firstFlowerId: null,
          flowerPlanted: true,
        };
        try {
          await AsyncStorage.setItem(userStorageKey(ownerId), JSON.stringify(completedProgress));
        } catch {}
        return completedProgress;
      }

      // Brand-new account: automatically start at intro.name
      const initialProgress: OnboardingProgress = {
        status: 'active',
        step: 'intro.name',
        fairyName: null,
        fairyNamed: false,
        firstEventId: null,
        firstFlowerId: null,
        flowerPlanted: false,
      };
      return initialProgress;
    }
    throw err;
  }
}

export async function updateOnboarding(update: OnboardingUpdate, userId?: string): Promise<OnboardingProgress> {
  const ownerId = userId || currentUserId;
  let serverProgress: OnboardingProgress | null = null;
  let serverErr: unknown = null;
  try {
    serverProgress = await apiRequest<OnboardingProgress>('/api/onboarding', 'PATCH', update);
  } catch (err) {
    serverErr = err;
  }

  if (ownerId) {
    let current: OnboardingProgress = {
      status: 'active',
      step: 'intro.name',
      fairyName: null,
      fairyNamed: false,
      firstEventId: null,
      firstFlowerId: null,
      flowerPlanted: false,
    };
    try {
      const raw = await AsyncStorage.getItem(userStorageKey(ownerId));
      if (raw) current = { ...current, ...JSON.parse(raw) };
    } catch {}

    const next: OnboardingProgress = {
      ...current,
      ...(serverProgress || {}),
      ...(update.step ? { step: update.step } : {}),
      ...(update.fairyName ? { fairyName: update.fairyName, fairyNamed: true } : {}),
      ...(update.firstEventId ? { firstEventId: update.firstEventId } : {}),
      ...(update.firstFlowerId ? { firstFlowerId: update.firstFlowerId } : {}),
      ...(update.flowerPlanted ? { flowerPlanted: true } : {}),
      ...(update.complete ? { status: 'completed', step: 'done' } : {}),
    };
    try {
      await AsyncStorage.setItem(userStorageKey(ownerId), JSON.stringify(next));
    } catch {}

    if (serverErr && update.complete) {
      throw serverErr;
    }
    return serverProgress || next;
  }

  if (serverProgress) return serverProgress;
  throw serverErr || new Error('Failed to update onboarding');
}
