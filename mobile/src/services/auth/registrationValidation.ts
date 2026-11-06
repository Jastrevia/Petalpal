import { ApiError } from '../api';

// The server checks all of these too (lib/accounts.js); here they only answer before a round trip.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 16;
export const ACCOUNT_NAME_PATTERN = /^[A-Za-z0-9_]{4,20}$/;
export const MAX_FAIRY_NAME_LENGTH = 20;
export function passwordError(password: string, chinese = false): string {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return chinese ? `密码需要 ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 位，同时包含字母和数字。` : `Use ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters with letters and numbers.`;
  }
  return '';
}
export function accountNameError(name: string, chinese = false): string {
  if (!ACCOUNT_NAME_PATTERN.test(name)) return chinese ? '账号名需要 4–20 位，只能用字母、数字或下划线。' : 'Use 4–20 letters, numbers or underscores.';
  if (/^pp\d+$/i.test(name)) return chinese ? '账号名不能像 PP 号。' : 'An account name can’t look like a PP number.';
  return '';
}
export function connectEmailError(email: string, password: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  return '';
}

export interface ProfileInput {
  name: string;
  /** A new account's password (its way back in) and its Garden Fairy's name. */
  password?: string;
  fairyName?: string;
  avatar?: string;
  preferredLocale?: string;
  aiConsent?: boolean;
  communityTermsVersion?: string;
}
export function profileError(profile: ProfileInput): string {
  if (!profile.name.trim()) return 'Enter a name.';
  if (profile.name.trim().length > 80) return 'Use a display name with at most 80 characters.';
  if (profile.password !== undefined) {
    const problem = accountNameError(profile.name.trim()) || passwordError(profile.password);
    if (problem) return problem;
  }
  if ((profile.fairyName || '').trim().length > MAX_FAIRY_NAME_LENGTH) return `Give your fairy a name of ${MAX_FAIRY_NAME_LENGTH} characters or fewer.`;
  return '';
}

export const PASSWORD_RESET_SENT = (email: string) =>
  `If ${email} has a PetalPal account, a link to set a new password is on its way. Check your inbox and spam folder.`;

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  // Firebase already answers EMAIL_EXISTS to any sign-up call, so saying it here hides nothing
  // and tells someone from an earlier version how to get back in.
  if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
    return 'This email already has a PetalPal account. Sign in instead, or tap “Forgot password?” to set a new one.';
  }
  if (code === 'petalpal/email-unverified') {
    return 'This email isn’t verified yet. Open the link we sent to it, or sign in with your account name or PP number.';
  }
  if (code === 'auth/missing-email') return 'Enter your email address first.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/weak-password') return 'Choose a stronger password and try again.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/user-disabled'].includes(code || '')) {
    return 'Check your email and password, then try again.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait before trying again.';
  if (code === 'auth/network-request-failed') return 'Check your connection and try again.';
  // PetalPal's own refusals (verify your email, deleted account, too many requests) are written for
  // people; server and gateway failures (5xx, e.g. a sleeping server) keep the general message.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.message) return error.message;
  return 'We couldn’t connect to your account. Please try again.';
}
