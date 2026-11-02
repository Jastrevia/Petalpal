import { ApiError } from '../api';

export const MIN_PASSWORD_LENGTH = 8; // The server checks this too (lib/accounts.js).
export function connectEmailError(email: string, password: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  return '';
}

export interface ProfileInput {
  name: string;
  avatar?: string;
  preferredLocale?: string;
  aiConsent?: boolean;
  communityTermsVersion?: string;
}
export function profileError(profile: ProfileInput): string {
  if (!profile.name.trim()) return 'Enter a name.';
  if (profile.name.trim().length > 80) return 'Use a display name with at most 80 characters.';
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
