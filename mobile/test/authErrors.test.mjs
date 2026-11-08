import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

// services/auth/registrationValidation.ts authErrorMessage: what a failed sign-in or sign-up says,
// in the device's language, with the step the owner can take. Diagnostics never reach the screen.
class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }
const errors = loadPlantingModules(undefined, undefined, undefined, true, { '../api': { ApiError } })(
  '../../../services/auth/registrationValidation');
const { authErrorMessage, accountCreatedSignInFailed } = errors;
const coded = (code, message = 'private provider diagnostic') => Object.assign(new Error(message), { code });

test('an unreachable sign-in service (Google Firebase) says so and what to do, in both languages', () => {
  const en = authErrorMessage(coded('auth/network-request-failed'), false);
  assert.match(en, /sign-in service \(Google Firebase\)/);
  assert.match(en, /mainland China/);
  assert.match(en, /switch to another network/);
  const zh = authErrorMessage(coded('auth/network-request-failed'), true);
  assert.match(zh, /连不上登录服务（Google Firebase）/);
  assert.match(zh, /换一个网络/);
});

test('an account made by the server is never registered again when the sign-in after it fails', () => {
  const blocked = accountCreatedSignInFailed(coded('auth/network-request-failed'));
  assert.match(authErrorMessage(blocked, false), /^Your account was created, but signing in didn’t finish because the sign-in service/);
  assert.match(authErrorMessage(blocked, false), /Don’t create it again/);
  assert.match(authErrorMessage(blocked, true), /^账号已经创建好了/);
  assert.match(authErrorMessage(blocked, true), /请不要重新注册/);
  const other = accountCreatedSignInFailed(coded('auth/internal-error'));
  assert.doesNotMatch(authErrorMessage(other, false), /Google|diagnostic/);
});

test('PetalPal server: unreachable, waking or refusing each have their own message', () => {
  assert.match(authErrorMessage(new TypeError('Failed to fetch'), false), /Couldn’t reach the PetalPal server/);
  assert.match(authErrorMessage(new TypeError('Load failed'), true), /连不上 PetalPal 服务器/);
  assert.match(authErrorMessage(new ApiError('Bad gateway', 502), false), /starting up or busy\. Wait about 30 seconds/);
  assert.match(authErrorMessage(new ApiError('Bad gateway', 503), true), /等大约 30 秒/);
  assert.match(authErrorMessage(new ApiError('Check your name or PP number and password, then try again.', 400, 'LOGIN_FAILED'), true), /账号名\/PP 号和密码对不上/);
  assert.match(authErrorMessage(new ApiError('Too many requests. Try again later.', 429), true), /尝试次数太多/);
  assert.equal(authErrorMessage(new ApiError('Too many requests. Try again later.', 429), false), 'Too many requests. Try again later.');
  // A programming error is not presented as a network problem.
  assert.doesNotMatch(authErrorMessage(new TypeError('x is undefined'), false), /reach/);
});

test('Firebase refusals read the same in both languages and never echo provider text', () => {
  for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/user-disabled']) {
    assert.equal(authErrorMessage(coded(code), false), 'Check your email and password, then try again.');
    assert.equal(authErrorMessage(coded(code), true), '邮箱或密码不对，请检查后再试。');
  }
  assert.doesNotMatch(authErrorMessage(coded('auth/unknown'), false), /diagnostic/);
  assert.doesNotMatch(authErrorMessage(coded('auth/unknown'), true), /diagnostic/);
});
