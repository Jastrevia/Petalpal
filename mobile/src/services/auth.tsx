import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { apiBaseUrl, apiRequest, configureApi } from './api';
import { firebaseAuth } from './firebase';
import { loadSessionExperience, type SessionExperience, type SessionUser } from './sessionExperience';
import { authErrorMessage, PASSWORD_RESET_SENT, profileError, registrationError, type ProfileInput } from './auth/registrationValidation';
import { scopeFlowerPlacements, setNativeSecurityExpectedOwner } from '../components/garden/planting/plantingPersistence';
import { recordNativeLogoutWitness } from './nativeSecurityLogoutWitness';
import type { FlowerSession } from '../components/garden/planting/flowerDetailApi';
import { DEFAULT_AVATAR } from '../components/avatars/avatarArt';

export type AuthPhase = 'initializing' | 'signedOut' | 'registering' | 'verificationPending' | 'profileRequired' | 'signedIn';
interface AuthSnapshot {
  phase: AuthPhase;
  session: FlowerSession | null;
  experience: SessionExperience | null;
  identity: { uid: string; email: string } | null;
  error: string;
  message: string;
}
interface AuthState extends AuthSnapshot {
  loading: boolean;
  needsProfile: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, confirmation: string) => Promise<void>;
  /** Firebase emails a link to set a new password; the reply never says whether the email has an account. */
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  checkVerification: () => Promise<void>;
  completeProfile: (profile: ProfileInput | string) => Promise<void>;
  /** Saves a library avatar (components/avatars) for the signed-in owner. */
  updateAvatar: (avatar: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  retry: () => Promise<void>;
}
const emptyState = (phase: AuthPhase = 'initializing', error = ''): AuthSnapshot => ({
  phase, session: null, experience: null, identity: null, error, message: '',
});
const Context = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider required');
  return value;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthSnapshot>(() => emptyState());
  useEffect(() => { setNativeSecurityExpectedOwner(state.session?.user.id || null); }, [state.session?.user.id]);
  const version = useRef(0);
  const invalidatedUid = useRef<string | null>(null);
  const signedOutError = useRef('');

  function clearAccount(phase: AuthPhase = 'initializing', error = '') {
    version.current++;
    configureApi(null);
    const cleanup = scopeFlowerPlacements(null);
    setState(emptyState(phase, error));
    return cleanup;
  }
  const isCurrent = (user: User, generation: number) =>
    generation === version.current && firebaseAuth().currentUser?.uid === user.uid;

  async function logout(error = '') {
    const auth = firebaseAuth();
    // Reject late requests immediately, even if Firebase sign-out is delayed or
    // fails. That same identity cannot restore a backend-rejected session.
    invalidatedUid.current = auth.currentUser?.uid || null;
    signedOutError.current = error;
    const cleanup = clearAccount('initializing');
    const generation = version.current;
    try { await signOut(auth); }
    catch { signedOutError.current = 'Your session is closed. Please try signing out again before signing in.'; }
    const erased = await cleanup;
    await recordNativeLogoutWitness(erased);
    if (!erased) signedOutError.current = 'Your session is closed. Private device cache cleanup failed; please sign in again to retry.';
    if (!firebaseAuth().currentUser || generation === version.current) setState(emptyState('signedOut', signedOutError.current));
  }

  async function deleteAccount() {
    const user = firebaseAuth().currentUser;
    const owner = state.session?.user.id;
    const generation = version.current;
    if (!user || !owner || state.identity?.uid !== user.uid || !isCurrent(user, generation)) throw new Error('Sign in to delete your account.');
    // Backend owns remote/Firebase deletion. Failure must not claim deletion.
    const result = await apiRequest<{ success: boolean; pending?: boolean; dataDeleted?: boolean; message?: string }>(`/users/${encodeURIComponent(owner)}`, 'DELETE');
    if (!result.success && !result.dataDeleted) throw new Error(result.message || 'Account deletion was not confirmed.');
    if (isCurrent(user, generation)) await logout(result.pending ? result.message || 'Identity deletion is pending. Contact support.' : 'Your account was deleted.');
  }

  async function sync(profile?: ProfileInput) {
    const cleanup = clearAccount();
    const generation = version.current;
    let user: User | null = null;
    try {
      const auth = firebaseAuth();
      await auth.authStateReady();
      if (generation !== version.current) return;
      user = auth.currentUser;
      if (!user || invalidatedUid.current === user.uid) {
        if (!await cleanup) signedOutError.current = 'Private device cache cleanup failed. Please retry.';
        if (generation !== version.current) return;
        setState(emptyState('signedOut', signedOutError.current));
        return;
      }
      const identity = { uid: user.uid, email: user.email || '' };
      if (!user.emailVerified) {
        try { await user.reload(); }
        catch (error) {
          if (isCurrent(user, generation)) setState({ ...emptyState('verificationPending', authErrorMessage(error)), identity });
          return;
        }
        if (!isCurrent(user, generation)) return;
        if (!user.emailVerified) {
          setState({ ...emptyState('verificationPending'), identity });
          return; // Never call the backend with an unverified identity.
        }
      }
      // Reload recovery can discover verification completed in another tab.
      // Refresh claims before the backend verifies email_verified.
      await user.getIdToken(true);
      if (!isCurrent(user, generation)) return;
      const capturedUser = user;
      configureApi({ apiBaseUrl: apiBaseUrl(),
        getAccessToken: async (force) => {
          await auth.authStateReady();
          if (!isCurrent(capturedUser, generation)) return null;
          return capturedUser.getIdToken(force);
        },
        onUnauthorized: () => { if (isCurrent(capturedUser, generation)) void logout('Your session expired. Please sign in again.'); },
      });
      const result = await apiRequest<{ user: SessionUser | null; needsProfile?: boolean }>('/auth/session', 'POST', profile
        ? { name: profile.name.trim(), avatar: profile.avatar || DEFAULT_AVATAR,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          preferredLocale: profile.preferredLocale || 'en', communityTermsVersion: profile.communityTermsVersion, aiConsent: profile.aiConsent === true }
        : { deferProfileCreation: true });
      if (!isCurrent(user, generation)) return;
      if (result.needsProfile) {
        setState({ ...emptyState('profileRequired'), identity });
        return;
      }
      if (!result.user?.id) throw new Error('Missing backend profile');
      const experience = await loadSessionExperience();
      if (!isCurrent(user, generation)) return;
      if (experience.user.id !== result.user.id) throw new Error('Backend identity changed');
      if (!await scopeFlowerPlacements(experience.user.id)) throw new Error('Private device cache cleanup failed. Please retry.');
      if (!isCurrent(user, generation)) return;
      setState({ ...emptyState('signedIn'), identity, experience, session: { user: experience.user } });
    } catch (error) {
      if (generation !== version.current) return;
      configureApi(null); scopeFlowerPlacements(null);
      setState({ ...emptyState('signedOut', authErrorMessage(error)),
        identity: user ? { uid: user.uid, email: user.email || '' } : null });
    }
  }

  useEffect(() => {
    try {
      // Firebase's existing persisted identity is sufficient pending-registration
      // recovery. No extra email marker, password, token or profile cache is stored.
      const unsubscribe = onAuthStateChanged(firebaseAuth(), () => { void sync(); });
      return () => { version.current++; unsubscribe(); configureApi(null); scopeFlowerPlacements(null); };
    } catch (error) { setState(emptyState('signedOut', authErrorMessage(error))); }
  }, []);

  async function login(email: string, password: string) {
    invalidatedUid.current = null; signedOutError.current = '';
    clearAccount();
    const generation = version.current;
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      // Firebase need not emit a UID change when retrying the same identity.
      if (generation === version.current) await sync();
    }
    catch (error) { if (generation === version.current) setState(emptyState('signedOut', authErrorMessage(error))); }
    // The Firebase identity observer performs the one session initialization.
  }
  async function register(email: string, password: string, confirmation: string) {
    const validation = registrationError(email, password, confirmation);
    if (validation) { setState((current) => ({ ...current, error: validation, message: '' })); return; }
    invalidatedUid.current = null; signedOutError.current = '';
    clearAccount('registering');
    const generation = version.current;
    try {
      const { user } = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      // Identity observer owns recovery; only this newly created user receives
      // the email and feedback. A switch/logout while sending cannot alter it.
      if (firebaseAuth().currentUser?.uid !== user.uid) return;
      const sendingGeneration = version.current;
      try {
        await sendEmailVerification(user);
        if (isCurrent(user, sendingGeneration)) setState((current) => ({ ...current,
          message: 'Verification email sent. Check your inbox and spam folder.' }));
      } catch (error) {
        if (isCurrent(user, sendingGeneration)) setState((current) => ({ ...current, error: authErrorMessage(error) }));
      }
    } catch (error) { if (generation === version.current) setState(emptyState('signedOut', authErrorMessage(error))); }
  }
  async function resetPassword(email: string) {
    const address = email.trim();
    if (!address) { setState((current) => ({ ...current, error: 'Enter your email address first.', message: '' })); return; }
    setState((current) => ({ ...current, error: '', message: '' }));
    try {
      await sendPasswordResetEmail(firebaseAuth(), address);
      setState((current) => ({ ...current, error: '', message: PASSWORD_RESET_SENT(address) }));
    } catch (error) { setState((current) => ({ ...current, error: authErrorMessage(error), message: '' })); }
  }
  async function verification(resend: boolean) {
    if (state.phase !== 'verificationPending') return;
    const user = firebaseAuth().currentUser;
    if (!user || state.identity?.uid !== user.uid || invalidatedUid.current === user.uid) return;
    const generation = version.current;
    setState((current) => ({ ...current, error: '', message: '' }));
    try {
      await user.reload();
      if (!isCurrent(user, generation)) return;
      if (user.emailVerified) {
        await user.getIdToken(true); // The backend must see the refreshed email_verified claim.
        if (isCurrent(user, generation)) await sync();
      } else if (resend) {
        await sendEmailVerification(user);
        if (isCurrent(user, generation)) setState((current) => ({ ...current,
          message: 'Verification email sent. Check your inbox and spam folder.' }));
      } else {
        setState((current) => ({ ...current, message: 'Your email isn’t verified yet. Open the link in your inbox, then check again.' }));
      }
    } catch (error) { if (isCurrent(user, generation)) setState((current) => ({ ...current, error: authErrorMessage(error) })); }
  }
  const value: AuthState = { ...state,
    loading: state.phase === 'initializing' || state.phase === 'registering',
    needsProfile: state.phase === 'profileRequired',
    login, register, resetPassword, resendVerification: () => verification(true), checkVerification: () => verification(false),
    completeProfile: async (input) => {
      if (state.phase !== 'profileRequired' || state.identity?.uid !== firebaseAuth().currentUser?.uid) return;
      const profile = typeof input === 'string' ? { name: input } : input;
      const error = profileError(profile);
      if (error) { setState((current) => ({ ...current, error })); return; }
      await sync(profile);
    },
    updateAvatar: async (avatar) => {
      const owner = state.session?.user.id;
      if (state.phase !== 'signedIn' || !owner) throw new Error('Sign in to change your avatar.');
      const saved = await apiRequest<{ id: string; avatar: string }>('/users/avatar', 'PUT', { avatar });
      setState(current => current.session?.user.id !== owner || saved.id !== owner ? current : {
        ...current,
        session: { ...current.session, user: { ...current.session.user, avatar: saved.avatar } },
        experience: current.experience && { ...current.experience, user: { ...current.experience.user, avatar: saved.avatar } },
      });
    },
    logout: () => logout(), deleteAccount, retry: () => sync(),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
