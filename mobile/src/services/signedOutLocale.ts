import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// The language chosen with the English | 中文 switch before there is an account (the create-account and sign-in
// pages, the guest Garden). English until someone picks 中文; the pick is remembered on this device (a language,
// no user data). A new account is created in it (preferredLocale); once signed in, the account's own language,
// changed in Me, decides instead.
export type ChosenLocale = 'en' | 'zh-Hans';
const KEY = 'petalpal.signedOutLocale';
let current: ChosenLocale = 'en';
let loading = false;
let picked = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const signedOutLocale = (): ChosenLocale => current;
export function setSignedOutLocale(next: ChosenLocale) {
  picked = true; // a pick made before the stored one arrives is never overwritten by it
  if (next === current) return;
  current = next;
  emit();
  Promise.resolve().then(() => AsyncStorage.setItem(KEY, next)).catch(() => undefined);
}
function loadOnce() {
  if (loading) return;
  loading = true;
  // Storage that cannot be read (a private window, a test double) just leaves English.
  Promise.resolve().then(() => AsyncStorage.getItem(KEY)).then(value => {
    if (!picked && (value === 'en' || value === 'zh-Hans') && value !== current) { current = value; emit(); }
  }).catch(() => undefined);
}
export function useSignedOutLocale(): ChosenLocale {
  loadOnce();
  const [, rerender] = useState(0);
  useEffect(() => subscribe(() => rerender(n => n + 1)), []);
  return current;
}
