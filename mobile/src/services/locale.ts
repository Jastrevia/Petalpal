import { useState, useEffect } from 'react';
import { momentLocale, type MomentLocale } from '../components/moments/momentFormat';
import { useAuth } from './auth';
import { useSignedOutLocale } from './signedOutLocale';

// The app language: the owner's preferredLocale ('en' or 'zh-Hans'), chosen in Me; before there is an account
// (signed out, the guest Garden), the English | 中文 switch on the create-account page (signedOutLocale). Every
// screen shows one language, never a mix; what people wrote stays in the language they wrote it in.
export type AppLocale = MomentLocale;
export function useAppLocale(): AppLocale {
  const chosen = useSignedOutLocale();
  let authLocale: AppLocale = chosen;
  try {
    const preferred = useAuth().experience?.user.preferredLocale;
    authLocale = preferred ? momentLocale(preferred) : chosen;
  } catch {
    authLocale = chosen;
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
