import { ApiError } from '../api';
import { signedOutLocale } from '../signedOutLocale';

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

// Sign-in happens before the owner's language is known: the English | 中文 switch decides (like AuthGate),
// English until 中文 is picked.
export const deviceChinese = () => signedOutLocale() === 'zh-Hans';

/** /auth/register made the account, then the Firebase sign-in after it failed: never register again. */
export const ACCOUNT_CREATED_SIGN_IN_FAILED = 'petalpal/account-created-sign-in-failed';
export function accountCreatedSignInFailed(cause: unknown) {
  return Object.assign(new Error('account created; sign-in failed'), { code: ACCOUNT_CREATED_SIGN_IN_FAILED, cause });
}

// Each message says what happened and what to do next, in the device's language. Provider and
// server diagnostics never reach the screen.
export function authErrorMessage(error: unknown, chinese = deviceChinese()): string {
  const code = (error as { code?: string })?.code;
  const say = (en: string, zh: string) => chinese ? zh : en;
  if (code === ACCOUNT_CREATED_SIGN_IN_FAILED) {
    // Only a reason the owner can act on is added (the sign-in service unreachable).
    const blocked = (error as { cause?: { code?: string } }).cause?.code === 'auth/network-request-failed';
    return say(`Your account was created, but signing in didn’t finish${blocked ? ' because the sign-in service (Google Firebase) couldn’t be reached' : ''}. Don’t create it again: tap “Already have an account?” and sign in with your account name and password${blocked ? ' on a network that can reach Google services' : ''}.`,
      `账号已经创建好了，但${blocked ? '连不上登录服务（Google Firebase），' : ''}登录没有完成。请不要重新注册：点“已有账号？”，用账号名和密码登录${blocked ? '（需要能访问 Google 服务的网络）' : ''}。`);
  }
  // Firebase already answers EMAIL_EXISTS to any sign-up call, so saying it here hides nothing
  // and tells someone from an earlier version how to get back in.
  if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') {
    return say('This email already has a PetalPal account. Sign in instead, or tap “Forgot password?” to set a new one.',
      '这个邮箱已经有 PetalPal 账号了。请直接登录，或点“忘记密码？”重新设置密码。');
  }
  if (code === 'petalpal/email-unverified') {
    return say('This email isn’t verified yet. Open the link we sent to it, or sign in with your account name or PP number.',
      '这个邮箱还没有验证。请打开我们发到邮箱里的链接，或者用账号名或 PP 号登录。');
  }
  if (code === 'auth/missing-email') return say('Enter your email address first.', '请先填写邮箱地址。');
  if (code === 'auth/invalid-email') return say('Enter a valid email address.', '请填写有效的邮箱地址。');
  if (code === 'auth/weak-password') return say('Choose a stronger password and try again.', '请换一个更安全的密码再试。');
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/user-disabled'].includes(code || '')) {
    return say('Check your email and password, then try again.', '邮箱或密码不对，请检查后再试。');
  }
  if (code === 'auth/too-many-requests') return say('Too many attempts. Please wait before trying again.', '尝试次数太多了，请等一会儿再试。');
  // Firebase's sign-in servers (Google) could not be reached. Common where Google services are
  // blocked, e.g. mainland China; another network is the only thing the owner can change.
  if (code === 'auth/network-request-failed') {
    return say('Couldn’t reach the sign-in service (Google Firebase). Check your connection. On a network that blocks Google services (for example in mainland China), sign-in can’t finish: switch to another network, then try again.',
      '连不上登录服务（Google Firebase）。请检查网络。如果你所在的网络屏蔽了 Google 服务（比如中国大陆），登录无法完成，请换一个网络后再试。');
  }
  if (code === 'LOGIN_FAILED') {
    return say('That account name or PP number and password don’t match. Check capital letters and spaces. Forgot them? Use “Forgot your password?” or “Forgot your username?” (needs a verified email).',
      '账号名/PP 号和密码对不上。请注意大小写和空格。忘了的话，点“忘记密码？”或“忘记用户名？”（需要已验证的邮箱）。');
  }
  if (code === 'USERNAME_TAKEN') return say('That name is taken. Try another one.', '这个名字已经被用了，换一个试试。');
  if (code === 'ACCOUNT_DELETED') return say('This account has been deleted, or its deletion is in progress.', '这个账号已经删除，或正在删除中。');
  // PetalPal's own server could not be reached at all (the request never got an answer).
  // (Chrome: “Failed to fetch”, Safari: “Load failed”, React Native: “Network request failed”.)
  if ((error as Error)?.name === 'TypeError' && /fetch|network|load failed/i.test((error as Error).message)) {
    return say('Couldn’t reach the PetalPal server. Check your connection and try again in a moment.',
      '连不上 PetalPal 服务器。请检查网络，稍等一会儿再试。');
  }
  if (error instanceof ApiError) {
    if (error.status === 429) return chinese ? '尝试次数太多了，请过一会儿再试。' : error.message || 'Too many attempts. Please wait before trying again.';
    // A sleeping or restarting server (Render free plan) answers 502/503/504 for up to a minute.
    if (error.status >= 500) {
      return say('The PetalPal server is starting up or busy. Wait about 30 seconds, then try again.',
        'PetalPal 服务器正在启动或繁忙，请等大约 30 秒再试。');
    }
    // PetalPal's own refusals (verify your email, deleted account, invalid name) are written for people.
    if (error.status >= 400 && error.message) return error.message;
  }
  return say('We couldn’t connect to your account. Please try again. If it keeps happening, tell us the time and what you tapped.',
    '没能连上你的账号，请再试一次。如果一直这样，请告诉我们发生的时间和你点了什么。');
}
