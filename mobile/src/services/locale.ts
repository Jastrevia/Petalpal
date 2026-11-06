import { useState, useEffect } from 'react';
import { momentLocale, type MomentLocale } from '../components/moments/momentFormat';
import { useAuth } from './auth';

// The app language: the owner's preferredLocale ('en' or 'zh-Hans'), chosen in Me. Every screen
// shows one language, never a mix.
export type AppLocale = MomentLocale;
export function useAppLocale(): AppLocale {
  let authLocale: AppLocale = 'en';
  try {
    authLocale = momentLocale(useAuth().experience?.user.preferredLocale);
  } catch {
    authLocale = 'en';
  }

  const [devLocale, setDevLocale] = useState<AppLocale | null>(() => {
    if (__DEV__ && typeof window !== 'undefined') {
      return (window as any).__localeOverride || null;
    }
    return null;
  });

  useEffect(() => {
    // Development-only language switch for the web preview; native has no window events.
    if (__DEV__ && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const handler = () => {
        setDevLocale((window as any).__localeOverride || null);
      };
      window.addEventListener('petalpal-locale-change', handler);
      return () => window.removeEventListener('petalpal-locale-change', handler);
    }
  }, []);

  if (__DEV__ && devLocale) return devLocale;
  return authLocale;
}
