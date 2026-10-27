import { momentLocale, type MomentLocale } from '../components/moments/momentFormat';
import { useAuth } from './auth';

// The app language: the owner's preferredLocale ('en' or 'zh-Hans'), chosen in Me. Every screen
// shows one language, never a mix.
export type AppLocale = MomentLocale;
export function useAppLocale(): AppLocale {
  // Outside the signed-in app (or an isolated test render) there is no account: English.
  try { return momentLocale(useAuth().experience?.user.preferredLocale); } catch { return 'en'; }
}
