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
export const loadOnboarding = () => apiRequest<OnboardingProgress>('/api/onboarding');
export const updateOnboarding = (update: OnboardingUpdate) =>
  apiRequest<OnboardingProgress>('/api/onboarding', 'PATCH', update);
