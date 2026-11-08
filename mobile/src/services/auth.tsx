import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { EmailAuthProvider, linkWithCredential, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithCustomToken, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { apiBaseUrl, apiRequest, configureApi, publicApiRequest } from './api';
import { forgetFairyName } from './fairyName';
import { noteSignUpGift } from './avatars';
import { firebaseAuth } from './firebase';
import { loadSessionExperience, type SessionExperience, type SessionUser } from './sessionExperience';
import { accountCreatedSignInFailed, authErrorMessage, connectEmailError, PASSWORD_RESET_SENT, profileError, type ProfileInput } from './auth/registrationValidation';
import { scopeFlowerPlacements, setNativeSecurityExpectedOwner } from '../components/garden/planting/plantingPersistence';
import { recordNativeLogoutWitness } from './nativeSecurityLogoutWitness';
import type { FlowerSession } from '../components/garden/planting/flowerDetailApi';
import { DEFAULT_AVATAR } from '../components/avatars/avatarArt';

export type AuthPhase = 'initializing' | 'signedOut' | 'registering' | 'profileRequired' | 'signedIn';
/** What brings this account back on another phone; the email counts once verified. */
export interface AccountRecovery { name: string; accountId: string; email: string | null; hasPassword: boolean }
export interface EmailToConnect { email: string; password: string }
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
  /** The name, PP number or connected email, with the account's password. */
  login: (login: string, password: string) => Promise<void>;
  /** Name and avatar make the account; an email filled in beforehand is connected as soon as it exists. */
  register: (profile: ProfileInput, connect?: EmailToConnect | null) => Promise<void>;
  /** Firebase emails a link to set a new password; the reply never says whether the email has an account. */
  resetPassword: (email: string) => Promise<void>;
  completeProfile: (profile: ProfileInput | string, connect?: EmailToConnect | null) => Promise<void>;
  /** Adds the email to this account and sends the verification link. Throws what to show the owner. */
  connectEmail: (email: string, password: string) => Promise<void>;
  /** The address waiting on, or holding, verification (the account keeps its uid). */
  connectedEmail: () => { email: string; verified: boolean } | null;
  resendEmailVerification: () => Promise<void>;
  /** True once the link has been opened; the server then records the email. */
  checkEmailVerified: () => Promise<boolean>;
  loadRecovery: () => Promise<AccountRecovery>;
  setPassword: (password: string, currentPassword?: string) => Promise<void>;
  clearMessage: () => void;
  /** Saves a library avatar (components/avatars) for the signed-in owner. */
  updateAvatar: (avatar: string) => Promise<void>;
  /** Shows an avatar the server has already saved (the welcome gift) without another request. */
  rememberAvatar: (avatar: string) => void;
  /** Saves the app language (also the Weekly reflection language) and switches the app to it. */
  updateLocale: (locale: 'en' | 'zh-Hans') => Promise<void>;
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
const profileBody = (profile: ProfileInput) => ({
  name: profile.name.trim(), avatar: profile.avatar || DEFAULT_AVATAR,
  ...(profile.password !== undefined ? { password: profile.password } : {}),
  ...(profile.fairyName?.trim() ? { fairyName: profile.fairyName.trim() } : {}),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  preferredLocale: profile.preferredLocale || 'en', communityTermsVersion: profile.communityTermsVersion,
});
/** DEV-only: a signed-in synthetic owner for local previews. No Firebase, no Render, no real account. */
export function PreviewAuthProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [avatar, setAvatar] = useState(user.avatar);
  if (!__DEV__) throw new Error('Preview accounts are development-only');
  const owner = { ...user, avatar };
  const idle = async () => {};
  const value: AuthState = {
    phase: 'signedIn', session: { user: owner }, identity: { uid: owner.id, email: owner.email || '' }, error: '', message: '',
    experience: { user: owner, fairyState: null, todayCheckIn: null, hasCheckedInToday: false, dailyGrowLimitEnabled: true, gardenOwnerId: owner.id },
    loading: false, needsProfile: false, login: idle, register: idle, resetPassword: idle, completeProfile: idle,
    connectEmail: idle, connectedEmail: () => null, resendEmailVerification: idle, checkEmailVerified: async () => false,
    loadRecovery: async () => ({ name: owner.name || '', accountId: owner.id, email: null, hasPassword: true }),
    setPassword: idle, clearMessage: () => {},
    updateAvatar: async next => setAvatar(next), rememberAvatar: next => setAvatar(next), updateLocale: idle, logout: idle, deleteAccount: idle, retry: idle,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthSnapshot>(() => emptyState());
  useEffect(() => { setNativeSecurityExpectedOwner(state.session?.user.id || null); }, [state.session?.user.id]);
  const version = useRef(0);
  const invalidatedUid = useRef<string | null>(null);
  const signedOutError = useRef('');
  // Runs once the account is open (it needs the API connection). Holds a password only until then.
  const afterSignIn = useRef<(() => Promise<void>) | null>(null);

  async function addEmail(user: User, email: string, password: string) {
    // The one password of the account: refused here if it already has a different one.
    await apiRequest('/auth/password', 'PUT', { password, currentPassword: password });
    if (!user.email) await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password));
    await sendEmailVerification(user);
  }
  const connectAfterSignIn = (connect?: EmailToConnect | null) => {
    afterSignIn.current = connect ? async () => {
      const user = firebaseAuth().currentUser;
      if (user) await addEmail(user, connect.email, connect.password);
      setState((current) => ({ ...current, message: `Verification email sent to ${connect.email.trim()}. Check your inbox and spam folder.` }));
    } : null;
  };

  function clearAccount(phase: AuthPhase = 'initializing', error = '') {
    version.current++;
    configureApi(null);
    forgetFairyName();
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
      // A verification completed in another app reaches the backend through fresh claims.
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
        ? { ...profileBody(profile), aiConsent: profile.aiConsent === true }
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
      const then = afterSignIn.current;
      afterSignIn.current = null;
      if (then) void then().catch((error) => setState((current) => ({ ...current, message: authErrorMessage(error) })));
    } catch (error) {
      if (generation !== version.current) return;
      afterSignIn.current = null;
      if (profile && user && (error as { code?: string }).code === 'USERNAME_TAKEN') {
        setState({ ...emptyState('profileRequired', authErrorMessage(error)), identity: { uid: user.uid, email: user.email || '' } });
        return;
      }
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

  async function login(login: string, password: string) {
    invalidatedUid.current = null; signedOutError.current = '';
    clearAccount();
    const generation = version.current;
    try {
      if (/^[^\s@]+@[^\s@]+$/.test(login.trim())) {
        // The email's password is the account's: a name or PP number now works with it too,
        // including right after a reset link changed it.
        afterSignIn.current = async () => { await apiRequest('/auth/password', 'PUT', { password }); };
        const { user } = await signInWithEmailAndPassword(firebaseAuth(), login.trim(), password);
        // Only a verified email is a way back in (a forgotten name or password); until then, the name or PP number.
        if (!user.emailVerified) {
          afterSignIn.current = null;
          const unverified = Object.assign(new Error('email not verified'), { code: 'petalpal/email-unverified' });
          // The sign-out below reloads the signed-out page: it keeps this reason on it.
          signedOutError.current = authErrorMessage(unverified);
          await signOut(firebaseAuth());
          throw unverified;
        }
      } else {
        const { signInToken } = await publicApiRequest<{ signInToken: string }>('/auth/password-login', { login: login.trim(), password });
        await signInWithCustomToken(firebaseAuth(), signInToken);
      }
      // Firebase need not emit a UID change when retrying the same identity.
      if (generation === version.current) await sync();
    }
    catch (error) { afterSignIn.current = null; if (generation === version.current) setState(emptyState('signedOut', authErrorMessage(error))); }
    // The Firebase identity observer performs the one session initialization.
  }
  async function register(profile: ProfileInput, connect?: EmailToConnect | null) {
    const validation = profileError(profile);
    if (validation) { setState((current) => ({ ...current, error: validation, message: '' })); return; }
    invalidatedUid.current = null; signedOutError.current = '';
    clearAccount('registering');
    const generation = version.current;
    try {
      const { signInToken } = await publicApiRequest<{ signInToken: string }>('/auth/register', profileBody(profile));
      noteSignUpGift();
      connectAfterSignIn(connect);
      // The account exists from here on: if Firebase's sign-in cannot finish (e.g. Google blocked),
      // the owner must sign in with the new name and password, never make the account again.
      try { await signInWithCustomToken(firebaseAuth(), signInToken); }
      catch (error) { throw accountCreatedSignInFailed(error); }
      if (generation === version.current) await sync();
    } catch (error) { afterSignIn.current = null; if (generation === version.current) setState(emptyState('signedOut', authErrorMessage(error))); }
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
  // Throws when another account has signed in meanwhile: nothing here may act on the wrong one.
  function ownUser() {
    const user = firebaseAuth().currentUser;
    if (!user || state.phase !== 'signedIn' || state.identity?.uid !== user.uid) throw new Error('Sign in to connect your email.');
    return user;
  }
  const value: AuthState = { ...state,
    loading: state.phase === 'initializing' || state.phase === 'registering',
    needsProfile: state.phase === 'profileRequired',
    login, register, resetPassword,
    completeProfile: async (input, connect) => {
      if (state.phase !== 'profileRequired' || state.identity?.uid !== firebaseAuth().currentUser?.uid) return;
      const profile = typeof input === 'string' ? { name: input } : input;
      const error = profileError(profile);
      if (error) { setState((current) => ({ ...current, error })); return; }
      connectAfterSignIn(connect);
      // A taken name is refused here too: back to this same screen with the message, still signed in.
      await sync(profile);
    },
    connectEmail: async (email, password) => {
      const problem = connectEmailError(email, password);
      if (problem) throw new Error(problem);
      try { await addEmail(ownUser(), email, password); }
      catch (error) { throw new Error(error instanceof Error && !(error as { code?: string }).code && !(error as { status?: number }).status ? error.message : authErrorMessage(error)); }
    },
    connectedEmail: () => {
      const user = firebaseAuth().currentUser;
      return user?.email ? { email: user.email, verified: user.emailVerified } : null;
    },
    resendEmailVerification: async () => {
      try { await sendEmailVerification(ownUser()); }
      catch (error) { throw new Error(authErrorMessage(error)); }
    },
    checkEmailVerified: async () => {
      const user = ownUser();
      try {
        await user.reload();
        if (!user.emailVerified) return false;
        await user.getIdToken(true); // The backend reads the refreshed email_verified claim.
        await apiRequest('/auth/session', 'POST', { deferProfileCreation: true });
        return true;
      } catch (error) { throw new Error(authErrorMessage(error)); }
    },
    loadRecovery: () => apiRequest<AccountRecovery>('/auth/recovery'),
    setPassword: async (password, currentPassword) => {
      await apiRequest('/auth/password', 'PUT', { password, ...(currentPassword ? { currentPassword } : {}) });
    },
    clearMessage: () => setState((current) => ({ ...current, message: '' })),
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
    rememberAvatar: (avatar) => {
      const owner = state.session?.user.id;
      setState(current => !owner || current.session?.user.id !== owner ? current : {
        ...current,
        session: { ...current.session, user: { ...current.session.user, avatar } },
        experience: current.experience && { ...current.experience, user: { ...current.experience.user, avatar } },
      });
    },
    updateLocale: async (locale) => {
      const owner = state.session?.user.id;
      if (state.phase !== 'signedIn' || !owner) throw new Error('Sign in to change the language.');
      const saved = await apiRequest<{ user?: { preferredLocale?: string } }>(`/users/${owner}/profile`, 'PUT', { preferredLocale: locale });
      const preferredLocale = saved.user?.preferredLocale ?? locale;
      setState(current => current.session?.user.id !== owner || !current.experience ? current : {
        ...current, experience: { ...current.experience, user: { ...current.experience.user, preferredLocale } },
      });
    },
    logout: () => logout(), deleteAccount, retry: () => sync(),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
