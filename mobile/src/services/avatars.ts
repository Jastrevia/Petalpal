import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { onClosenessChanged } from './fairyCloseness';

// The avatar collection (lib/avatar-collection.js): what the owner owns, the one-time welcome gift
// and one chosen avatar per Fairy Bond level reached. The server decides the level, which rewards
// are pending and what each may choose; the app only shows it and sends the choice.
export interface AvatarReward { level: number; tier: 1 | 2 | 3; eligible: number }
export interface AvatarCollection {
  equipped: string; bondOn: boolean; level: number | null;
  tiers: { tier: 1 | 2 | 3; unlockLevel: number; total: number; unlocked: boolean }[];
  owned: string[]; total: number;
  welcome: { needed: boolean; selected: string | null; gifted: string[] };
  pending: AvatarReward[]; ready: number; nextRewardLevel: number | null;
  claims: { level: number; avatar: string; claimedAt: string }[];
}
export type AvatarCollectionResult = AvatarCollection & { created: boolean };

const listeners = new Set<() => void>();
export function onAvatarsChanged(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const avatarsChanged = () => listeners.forEach(listener => listener());

export const loadAvatarCollection = () => apiRequest<AvatarCollection>('/api/avatars');
export async function receiveWelcomeAvatars(avatar: string) {
  const result = await apiRequest<AvatarCollectionResult>('/api/avatars/welcome', 'POST', { avatar });
  avatarsChanged();
  return result;
}
export async function claimAvatarReward(level: number, avatar: string) {
  const result = await apiRequest<AvatarCollectionResult & { avatar: string; level: number }>('/api/avatars/claim', 'POST', { level, avatar });
  avatarsChanged();
  return result;
}

// The reward a chosen avatar would use: the lowest waiting level whose tiers include it, so
// higher-level rewards stay free for higher-tier avatars.
export const rewardFor = (pending: AvatarReward[], tier: number | null) =>
  tier === null ? undefined : pending.find(reward => reward.eligible > 0 && reward.tier >= tier);

// The collection while `enabled`; reloads after a claim, the welcome gift or a closeness change.
export function useAvatarCollection(enabled: boolean, refreshKey?: unknown) {
  const [state, setState] = useState<{ collection: AvatarCollection | null; failed: boolean; error: Error | null }>({ collection: null, failed: false, error: null });
  const [changes, setChanges] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  useEffect(() => {
    const bump = () => setChanges(count => count + 1);
    const offAvatars = onAvatarsChanged(bump), offCloseness = onClosenessChanged(bump);
    return () => { offAvatars(); offCloseness(); };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState(current => (current.failed ? { ...current, failed: false, error: null } : current));
    loadAvatarCollection()
      .then(collection => { if (active) setState({ collection, failed: false, error: null }); })
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('[PetalPal Avatars] Failed to load avatar collection:', err);
        if (typeof window !== 'undefined') (window as any).__lastAvatarError = err;
        if (active) setState(current => ({ ...current, failed: true, error: err }));
      });
    return () => { active = false; };
  }, [enabled, refreshKey, changes, retryNonce]);
  return { ...state, retry: () => setRetryNonce(count => count + 1) };
}

// While a check-in keepsake reveal or avatar welcome is up, the Fairy Bond level-up
// celebration waits its turn.
let holds = 0;
const holdListeners = new Set<(held: boolean) => void>();
export function holdBondCelebration() {
  holds += 1; holdListeners.forEach(listener => listener(true));
  let released = false;
  return () => {
    if (released) return;
    released = true; holds -= 1;
    holdListeners.forEach(listener => listener(holds > 0));
  };
}
export const bondCelebrationHeld = () => holds > 0;
export function useBondCelebrationHeld() {
  const [held, setHeld] = useState(bondCelebrationHeld);
  useEffect(() => { holdListeners.add(setHeld); setHeld(bondCelebrationHeld()); return () => { holdListeners.delete(setHeld); }; }, []);
  return held;
}

// Sign-up gives the chosen avatar and three gifts in one go (Avatar System V1.0); the Garden then
// reveals the three once, right after the account is made. Remembered on the device too, so a reload
// before the Garden opens still shows it; another sign-in never does.
const GIFT_REVEAL_KEY = 'petalpal.avatarGiftReveal.v1';
let giftRevealPending = false;
const giftListeners = new Set<(pending: boolean) => void>();
const setGiftPending = (pending: boolean) => { giftRevealPending = pending; giftListeners.forEach(listener => listener(pending)); };
export function noteSignUpGift() { setGiftPending(true); AsyncStorage.setItem(GIFT_REVEAL_KEY, '1').catch(() => undefined); }
export const signUpGiftPending = () => giftRevealPending;
export async function loadSignUpGift() {
  if (!giftRevealPending && (await AsyncStorage.getItem(GIFT_REVEAL_KEY).catch(() => null)) === '1') setGiftPending(true);
  return giftRevealPending;
}
export function finishSignUpGift() { setGiftPending(false); AsyncStorage.removeItem(GIFT_REVEAL_KEY).catch(() => undefined); }
// Follows the pending gift, so a screen already open when the account is made still learns of it at once.
export function useSignUpGiftPending() {
  const [pending, setPending] = useState(giftRevealPending);
  useEffect(() => { giftListeners.add(setPending); setPending(giftRevealPending); return () => { giftListeners.delete(setPending); }; }, []);
  return pending;
}

// The welcome flow (choosing a first avatar, then revealing the three gifts) goes before
// daily check-in keepsake reveals and before any Fairy Bond level-up celebrations.
let welcomeActive = false;
const welcomeListeners = new Set<(active: boolean) => void>();
export function setWelcomeActive(active: boolean) {
  if (welcomeActive === active) return;
  welcomeActive = active;
  welcomeListeners.forEach(listener => listener(active));
}
export const isWelcomeActive = () => welcomeActive;
export function useWelcomeActive() {
  const [active, setActive] = useState(welcomeActive);
  // Read again once subscribed: a change between the first render and this effect is not missed.
  useEffect(() => { welcomeListeners.add(setActive); setActive(welcomeActive); return () => { welcomeListeners.delete(setActive); }; }, []);
  return active;
}
