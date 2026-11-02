import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { hookHarness } from './hookHarness.mjs';
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const plain = (value) => JSON.parse(JSON.stringify(value));
test('cross-origin AuthProvider hydrates and clears the same Firebase-backed session', async () => {
  const origin = 'https://petalpal-v2.onrender.com';
  const fixture = setup(user(), origin);
  const state = await fixture.ready();
  assert.equal(state.phase, 'signedIn');
  assert.ok(fixture.requests.some(r => r.path === `${origin}/auth/session`));
  assert.ok(fixture.requests.some(r => r.path === `${origin}/session?view=metadata`));
  assert.ok(fixture.requests.every(r => r.path.startsWith(origin + '/')));
  assert.ok(fixture.requests.every(r => r.options.headers.Authorization === 'Bearer synthetic-token-alice'));
  await state.logout();
  assert.equal((await fixture.hooks.flush()).phase, 'signedOut');
  assert.equal(await fixture.api.accessToken(), null);
});
function user(uid = 'alice', verified = true) {
  return { uid, email: `${uid}@example.test`, emailVerified: verified, reload: async () => {},
    getIdToken: async () => `synthetic-token-${uid}` };
}
function setup(initial = null, apiOrigin = '') {
  const hooks = hookHarness(); const requests = [], emails = [], tokens = [], writes = [], resets = [], links = [];
  const auth = { currentUser: initial, authStateReady: async () => {} };
  let changed, handler, emailError, customTokenError, linkError, loginError, signOutError, storageError, resetError;
  let needsProfile = false;
  const instrument = (value) => {
    if (!value || value.instrumented) return value;
    const token = value.getIdToken;
    value.getIdToken = async (force) => { tokens.push({ uid: value.uid, force: Boolean(force) }); return token(force); };
    value.instrumented = true; return value;
  };
  instrument(initial);
  function emit(next) { auth.currentUser = instrument(next); changed(); }
  const backendUser = () => ({ id: `owner-${auth.currentUser.uid}`, name: 'Petal', email: auth.currentUser.email, timezone: 'UTC' });
  const firebase = {
    onAuthStateChanged: (_auth, callback) => { changed = callback; return () => {}; },
    signInWithEmailAndPassword: async (_auth, email) => { if (loginError) throw loginError; emit(user(email.split('@')[0])); },
    signInWithCustomToken: async () => {
      if (customTokenError) throw customTokenError;
      const value = user('pass-new', false); value.email = null; emit(value); return { user: value };
    },
    EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
    linkWithCredential: async (value, credential) => {
      if (linkError) throw linkError;
      links.push([value.uid, credential.email, credential.password]); value.email = credential.email;
    },
    sendEmailVerification: async (value) => { emails.push(value.uid); if (emailError) throw emailError; },
    sendPasswordResetEmail: async (_auth, email) => { if (resetError) throw resetError; resets.push(email); },
    signOut: async () => { if (signOutError) throw signOutError; emit(null); },
  };
  const items = new Map();
  const storage = { getAllKeys: async () => [...items.keys()], getItem: async key => items.get(key) ?? null,
    setItem: async (key, value) => { writes.push({ key, value }); items.set(key, value); },
    removeItem: async key => { if (storageError) throw storageError; items.delete(key); } };
  const load = loadPlantingModules(undefined, hooks.react, storage, false, {
    env: { EXPO_PUBLIC_API_BASE_URL: apiOrigin },
    'firebase/auth': firebase, './firebase': { firebaseAuth: () => auth },
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (apiOrigin) path = path.replace(apiOrigin, '');
      if (handler) return handler(path, options);
      if (path === '/auth/register' || path === '/auth/password-login') return response({ signInToken: 'synthetic-pass' });
      if (path === '/auth/session') {
        const payload = JSON.parse(options.body);
        return response(needsProfile && payload.deferProfileCreation ? { user: null, needsProfile: true } : { user: backendUser() });
      }
      if (path === '/session?view=metadata') return response({ user: backendUser(), fairyState: {
        onboardingStep: 'MOOD_SELECTION', onboardingCompleted: false, unlockedFeatures: ['garden'] },
        todayCheckIn: { id: 'checkin', localDate: '2026-09-29', journal: { content: 'Synthetic private Journal' } },
        hasCheckedInToday: true, dailyGrowLimitEnabled: true, garden: { owner: { id: backendUser().id }, flowers: [] } });
      return response({ ok: true });
    },
  });
  const provider = load('../../../services/auth');
  hooks.mount(() => provider.AuthProvider({ children: 'app' }).props.value);
  return { hooks, auth, requests, emails, tokens, writes, items, emit, load, resets, links,
    api: load('../../../services/api'), storage: load('plantingPersistence'),
    setHandler: (value) => { handler = value; }, setNeedsProfile: () => { needsProfile = true; },
    setLoginError: (value) => { loginError = value; }, setResetError: (value) => { resetError = value; },
    setEmailError: (value) => { emailError = value; }, setCustomTokenError: (value) => { customTokenError = value; }, setLinkError: (value) => { linkError = value; },
    setStorageError: value => { storageError = value; },
    setSignOutError: (value) => { signOutError = value; },
    ready: async () => { emit(auth.currentUser); return hooks.flush(); } };
}

test('Phase 1 existing login hydrates owner experience only after both backend requests succeed', async () => {
  const s = setup(); let state = await s.ready();
  assert.equal(state.phase, 'signedOut');
  await state.login('alice@example.test', 'synthetic password'); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn'); assert.equal(state.session.user.id, 'owner-alice');
  assert.equal(state.experience.gardenOwnerId, 'owner-alice');
  assert.equal(state.experience.hasCheckedInToday, true);
  assert.equal(state.experience.fairyState.onboardingStep, 'MOOD_SELECTION');
  assert.deepEqual(plain(state.experience.todayCheckIn), { id: 'checkin', localDate: '2026-09-29' });
  assert.deepEqual(s.requests.map((r) => r.path).slice(0, 2), ['/auth/session', '/session?view=metadata']);
  assert.deepEqual(s.writes, []); // App auth stores no password, token, user or pending-registration cache.
});
test('Phase 1 refresh-first transport succeeds after one 401 without invalidation', async () => {
  const s = setup(user()); await s.ready(); const calls = [], refreshed = []; let invalidations = 0;
  s.api.configureApi({ apiBaseUrl: '', getAccessToken: async (force) => { refreshed.push(force); return 'synthetic-token'; },
    onUnauthorized: () => invalidations++ });
  s.setHandler(async (path) => { calls.push(path); return response({ ok: true }, calls.length === 1 ? 401 : 200); });
  await s.api.apiRequest('/owner');
  assert.deepEqual(refreshed, [false, true]); assert.equal(calls.length, 2); assert.equal(invalidations, 0);
});
test('Phase 1 terminal 401 clears provider, experience, placement scope and Firebase session with no retry loop', async () => {
  const s = setup(user()); const state = await s.ready();
  await s.storage.saveFlowerPlacements([{ id: 'private-layout' }]);
  s.setHandler(async () => response({ error: 'synthetic rejection' }, 401));
  await assert.rejects(s.api.apiRequest('/owner'), (error) => error.status === 401);
  const signedOut = await s.hooks.flush();
  assert.equal(signedOut.phase, 'signedOut'); assert.equal(signedOut.session, null); assert.equal(signedOut.experience, null);
  assert.equal(s.auth.currentUser, null); assert.equal((await s.storage.loadFlowerPlacements()).length, 0);
  assert.equal(s.requests.filter((r) => r.path === '/owner').length, 2);
  assert.equal(s.writes.length, 1); // Erasure removes durable layout without writing other private data.
  assert.equal(s.items.size, 0);
  assert.equal(state.session.user.id, 'owner-alice');
  await assert.rejects(s.api.apiRequest('/owner'), /Sign in/);
  assert.equal(s.requests.filter((r) => r.path === '/owner').length, 2);
});
test('Phase 1 concurrent terminal responses invalidate once and cannot affect a newer account', async () => {
  const s = setup(user()); await s.ready(); const late = deferred();
  s.setHandler(async () => late.promise);
  const pending = s.api.apiRequest('/old-owner');
  await s.hooks.flush();
  s.setHandler(null); s.emit(user('bob')); let state = await s.hooks.flush();
  assert.equal(state.session.user.id, 'owner-bob');
  late.resolve(response({ error: 'old rejection' }, 401));
  await assert.rejects(pending, /session changed/); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn'); assert.equal(state.session.user.id, 'owner-bob');
  assert.equal(s.auth.currentUser.uid, 'bob');
});
test('Phase 1 failed credential refresh invalidates, while refresh network failure preserves the session', async () => {
  for (const [code, shouldInvalidate] of [['auth/user-token-expired', true], ['auth/network-request-failed', false]]) {
    const s = setup(); let invalidations = 0;
    s.api.configureApi({ apiBaseUrl: '', getAccessToken: async (force) => {
      if (force) throw Object.assign(new Error('synthetic failure'), { code }); return 'synthetic-token';
    }, onUnauthorized: () => invalidations++ });
    s.setHandler(async () => response({}, 401));
    await assert.rejects(s.api.apiRequest('/owner'));
    assert.equal(invalidations, shouldInvalidate ? 1 : 0); assert.equal(s.requests.length, 1);
  }
});
test('Name and avatar make the account: no email, no password, and the session opens at once', async () => {
  const s = setup(); let state = await s.ready();
  await state.register({ name: '  ', avatar: '🐝' }); state = await s.hooks.flush();
  assert.match(state.error, /Enter a name/); assert.equal(s.requests.length, 0);
  await state.register({ name: '  New Petal  ', avatar: '🐝', communityTermsVersion: 'v1' }); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn');
  const made = s.requests.find(r => r.path === '/auth/register');
  assert.equal(made.options.headers.Authorization, undefined, 'it comes before any account');
  const body = JSON.parse(made.options.body);
  assert.equal(body.name, 'New Petal'); assert.equal(body.avatar, '🐝'); assert.equal(body.communityTermsVersion, 'v1');
  assert.equal(body.email, undefined); assert.equal(body.password, undefined);
  assert.equal(s.auth.currentUser.uid, 'pass-new'); assert.deepEqual(s.emails, []); assert.deepEqual(s.writes, []);
});
test('A taken name comes back as its message, with nobody signed in and the name page still there', async () => {
  const s = setup(); let state = await s.ready();
  s.setHandler(async () => response({ error: 'That name is taken. Try another one.', code: 'USERNAME_TAKEN' }, 409));
  await state.register({ name: 'Bloom' }); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedOut'); assert.equal(state.error, 'That name is taken. Try another one.');
  assert.equal(s.auth.currentUser, null);
});
test('A taken name on the profile step of an existing identity stays on that step', async () => {
  const s = setup(user('new', false)); s.setNeedsProfile(); let state = await s.ready();
  assert.equal(state.phase, 'profileRequired');
  s.setHandler(async () => response({ error: 'That name is taken. Try another one.', code: 'USERNAME_TAKEN' }, 409));
  await state.completeProfile({ name: 'Bloom' }); state = await s.hooks.flush();
  assert.equal(state.phase, 'profileRequired'); assert.match(state.error, /taken/); assert.equal(s.auth.currentUser.uid, 'new');
});
test('Registration errors are readable and create no session', async () => {
  for (const code of ['auth/internal-error', undefined]) {
    const s = setup(); const state = await s.ready();
    s.setCustomTokenError(Object.assign(new Error('private@example.test provider diagnostic'), { code }));
    await state.register({ name: 'Bloom' });
    const result = await s.hooks.flush();
    assert.equal(result.phase, 'signedOut');
    assert.equal(result.error, 'We couldn’t connect to your account. Please try again.');
    assert.doesNotMatch(result.error, /private@example.test|provider diagnostic/);
    assert.equal(result.identity, null); assert.equal(result.session, null); assert.equal(s.auth.currentUser, null);
  }
});
test('A name or PP number signs in through the server; an email through Firebase, which then keeps the password in step', async () => {
  const s = setup(); let state = await s.ready();
  await state.login(' Bloom ', 'synthetic password'); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn');
  const asked = s.requests.find(r => r.path === '/auth/password-login');
  assert.deepEqual(JSON.parse(asked.options.body), { login: 'Bloom', password: 'synthetic password' });
  assert.equal(s.requests.some(r => r.path === '/auth/password'), false);
  await state.logout(); state = await s.hooks.flush();

  const e = setup(); state = await e.ready();
  await state.login('alice@example.test', 'synthetic password'); state = await e.hooks.flush();
  assert.equal(state.phase, 'signedIn');
  assert.equal(e.requests.some(r => r.path === '/auth/password-login'), false);
  assert.deepEqual(JSON.parse(e.requests.find(r => r.path === '/auth/password').options.body), { password: 'synthetic password' });
});
test('A wrong password shows the one failure message and signs nobody in', async () => {
  const s = setup(); let state = await s.ready();
  s.setHandler(async () => response({ error: 'Check your name or PP number and password, then try again.', code: 'LOGIN_FAILED' }, 400));
  await state.login('Bloom', 'wrong password'); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedOut'); assert.match(state.error, /Check your name/); assert.equal(s.auth.currentUser, null);
});
test('An identity without a verified email goes straight in, and the app never waits on verification', async () => {
  const s = setup(user('new', false)); const state = await s.ready();
  assert.equal(state.phase, 'signedIn'); assert.deepEqual(s.emails, []);
  assert.ok(s.tokens.some(token => token.force));
});
test('An email filled in on the sign-up page is connected once the account exists, keeping its uid', async () => {
  const s = setup(); let state = await s.ready();
  await state.register({ name: 'Bloom' }, { email: ' me@example.test ', password: 'synthetic password' }); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn'); assert.equal(s.auth.currentUser.uid, 'pass-new');
  assert.deepEqual(s.links, [['pass-new', 'me@example.test', 'synthetic password']]);
  assert.deepEqual(s.emails, ['pass-new']);
  assert.deepEqual(JSON.parse(s.requests.find(r => r.path === '/auth/password').options.body), { password: 'synthetic password', currentPassword: 'synthetic password' });
  assert.match(state.message, /Verification email sent to me@example.test/);
});
test('Connecting an email that belongs to another account keeps this account and says what to do', async () => {
  const s = setup(); let state = await s.ready();
  await state.register({ name: 'Bloom' }); state = await s.hooks.flush();
  s.setLinkError(Object.assign(new Error('provider diagnostic'), { code: 'auth/email-already-in-use' }));
  await assert.rejects(state.connectEmail('taken@example.test', 'synthetic password'), /already has a PetalPal account/);
  assert.equal(s.auth.currentUser.uid, 'pass-new'); assert.deepEqual(s.emails, []);
  await assert.rejects(state.connectEmail('not-an-email', 'synthetic password'), /valid email/);
  await assert.rejects(state.connectEmail('me@example.test', 'short'), /at least 8/);
});
test('Opening the link is checked on request: the server is told only with refreshed claims', async () => {
  const s = setup(user('new', false)); let state = await s.ready();
  const before = s.requests.length;
  assert.equal(await state.checkEmailVerified(), false); assert.equal(s.requests.length, before);
  s.auth.currentUser.emailVerified = true; s.tokens.length = 0;
  assert.equal(await state.checkEmailVerified(), true);
  assert.ok(s.tokens.some(token => token.force));
  assert.deepEqual(JSON.parse(s.requests.at(-1).options.body), { deferProfileCreation: true });
  await state.resendEmailVerification(); assert.deepEqual(s.emails, ['new']);
  assert.deepEqual(plain(state.connectedEmail()), { email: 'new@example.test', verified: true });
});
test('A stale control cannot connect or resend for another account', async () => {
  const s = setup(user('alice', false)); const previous = await s.ready();
  s.emit(user('bob', false)); await s.hooks.flush();
  await assert.rejects(previous.resendEmailVerification());
  await assert.rejects(previous.connectEmail('me@example.test', 'synthetic password'));
  assert.deepEqual(s.emails, []); assert.deepEqual(s.links, []);
});
test('Profile completion keeps safe consent and accepts only explicit initial AI consent', async () => {
  const s = setup(user('new')); s.setNeedsProfile(); let state = await s.ready();
  assert.equal(state.phase, 'profileRequired');
  await state.completeProfile({ name: '  New Petal  ', avatar: '🐝' }); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn');
  const payload = JSON.parse(s.requests.find((r) => r.path === '/auth/session' && !JSON.parse(r.options.body).deferProfileCreation).options.body);
  assert.equal(payload.name, 'New Petal'); assert.equal(payload.avatar, '🐝'); assert.equal(payload.aiConsent, false);
  assert.equal(payload.preferredLocale, 'en'); assert.equal(payload.memoryEnabled, undefined);
  assert.deepEqual(s.writes, []);
});
test('Phase 1 stale hydration after account switching or logout never restores private experience', async () => {
  for (const switchAccount of [true, false]) {
    const s = setup(user()); const hydration = deferred();
    s.setHandler(async (path) => path === '/session?view=metadata' ? hydration.promise : response({ user: { id: 'owner-alice' } }));
    s.emit(s.auth.currentUser); let state = await s.hooks.flush();
    assert.equal(state.phase, 'initializing'); assert.equal(state.session, null);
    s.setHandler(null);
    if (switchAccount) s.emit(user('bob')); else await state.logout();
    state = await s.hooks.flush();
    hydration.resolve(response({ user: { id: 'owner-alice' }, fairyState: { onboardingCompleted: true } }));
    state = await s.hooks.flush();
    assert.equal(state.phase, switchAccount ? 'signedIn' : 'signedOut');
    assert.equal(state.session?.user.id || null, switchAccount ? 'owner-bob' : null);
    assert.equal(state.experience?.user.id || null, switchAccount ? 'owner-bob' : null);
  }
});
test('Phase 1 session hydration failure keeps app gated and retry hydrates the same Firebase account', async () => {
  const s = setup(user());
  s.setHandler(async (path) => path === '/session?view=metadata' ? response({ error: 'synthetic outage' }, 503) : response({ user: { id: 'owner-alice' } }));
  let state = await s.ready(); assert.equal(state.phase, 'signedOut'); assert.equal(state.session, null);
  s.setHandler(null); await state.retry(); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn'); assert.equal(state.experience.user.id, 'owner-alice');
});
test('Phase 1 explicit logout clears owner state and reload remains signed out', async () => {
  const s = setup(user()); let state = await s.ready(); await state.logout(); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedOut'); assert.equal(state.experience, null);
  const restored = setup(s.auth.currentUser); state = await restored.ready();
  assert.equal(state.phase, 'signedOut'); assert.equal(restored.requests.length, 0);
});
test('Phase 1 failed Firebase sign-out cannot restore a terminally invalidated account', async () => {
  const s = setup(user()); await s.ready(); s.setSignOutError(new Error('synthetic outage'));
  s.setHandler(async () => response({}, 401)); await assert.rejects(s.api.apiRequest('/owner'));
  let state = await s.hooks.flush(); assert.equal(state.phase, 'signedOut');
  s.emit(s.auth.currentUser); state = await s.hooks.flush(); assert.equal(state.phase, 'signedOut'); assert.equal(state.session, null);
});

test('Phase 1 auth gate separates loading, signed-out, name and avatar, sign-in and authenticated controls', async () => {
  let auth = { phase: 'initializing', loading: true, session: null, identity: null, error: '', message: '' };
  const replaced = [];
  const hooks = hookHarness(); const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.children)] : [];
  const text = (tree) => nodes(tree).filter((n) => n.type === 'Text').map((n) => n.props.children).flat().join(' ');
  const load = loadPlantingModules(undefined, hooks.react, {}, false, {
    '../services/auth': { useAuth: () => auth },
    './auth/LoginPreviewPage': { LoginPreviewPage: 'LoginPreviewPage' },
    './features/AccountRecovery': { ConnectEmailScreen: 'ConnectEmailScreen' },
    '../constants/theme': { Fonts: { sans: 'sans', rounded: 'rounded' }, Spacing: { two: 8, three: 16, four: 24 } },
    'expo-splash-screen': { hideAsync: async () => {} },
    'expo-router': { router: { replace: (path) => replaced.push(path) }, usePathname: () => '/' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) },
    '../services/guest': { GuestContext: { Provider: 'GuestProvider' } },
    '../services/deviceReset': { devVariant: false }, './features/DeviceReset': { DeviceResetButton: 'DeviceResetButton' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', Modal: 'Modal',
      Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: (styles) => styles, absoluteFill: {} } },
  });
  const gate = load('../../../components/AuthGate'); let tree = hooks.mount(() => gate.AuthGate({ children: 'real-app' }));
  assert.equal(nodes(tree).filter((n) => n.type === 'TextInput').length, 0); assert.doesNotMatch(text(tree), /Sign in|Sign out/i);
  // Signed out: guest mode shows the app itself (the Garden) with no sign-in form, until an account is asked for.
  const logins = [];
  auth = { ...auth, phase: 'signedOut', loading: false, login: async (...values) => { logins.push(values); } }; tree = hooks.render();
  const guest = nodes(tree).find((n) => n.type === 'GuestProvider');
  assert.ok(guest); assert.equal(nodes(tree).some((n) => n.type === 'LoginPreviewPage'), false);
  assert.equal(nodes(tree).filter((n) => n.type === 'TextInput').length, 0);
  guest.props.value.requestAccount(); tree = hooks.render();
  // Then the name and avatar card lies over the still-mounted app: no email or password on it, one way to connect an email.
  assert.ok(nodes(tree).includes('real-app') || JSON.stringify(tree).includes('real-app'), 'the Garden stays mounted underneath');
  assert.ok(nodes(tree).find((n) => n.props?.accessibilityLabel === 'Back to the Garden'));
  assert.equal(nodes(tree).some((n) => n.type === 'LoginPreviewPage'), false);
  assert.equal(nodes(tree).find((n) => n.props.testID === 'auth-card').props.style.maxWidth, 440);
  assert.equal(nodes(tree).filter((n) => n.type === 'TextInput').length, 1);
  assert.equal(nodes(tree).filter((n) => n.props?.secureTextEntry).length, 0);
  assert.ok(nodes(tree).some((n) => n.props?.accessibilityRole === 'radio'));
  assert.equal(nodes(tree).find((n) => n.props.accessibilityRole === 'checkbox').props.accessibilityState.checked, false);
  nodes(tree).find((n) => n.props.accessibilityRole === 'checkbox').props.onPress(); tree = hooks.render();
  assert.equal(nodes(tree).find((n) => n.props.accessibilityRole === 'checkbox').props.accessibilityState.checked, true);
  // The guidelines and the notes stay folded until asked for.
  assert.doesNotMatch(text(tree), /Be kind|lives on this phone|AI stays off/);
  nodes(tree).find((n) => n.props?.accessibilityRole === 'link' && text(n).includes('Community Guidelines')).props.onPress(); tree = hooks.render();
  assert.match(text(nodes(tree).find((n) => n.props.testID === 'community-guidelines')), /Be kind/);
  nodes(tree).find((n) => n.type === 'Modal').props.onRequestClose(); tree = hooks.render();
  assert.equal(nodes(tree).some((n) => n.type === 'Modal'), false);
  nodes(tree).find((n) => n.props?.accessibilityRole === 'button' && text(n).includes('Good to know')).props.onPress(); tree = hooks.render();
  assert.match(text(tree), /lives on this phone/); assert.match(text(tree), /AI stays off/);
  nodes(tree).find((n) => n.props?.accessibilityLabel === 'Connect to your email?').props.onPress(); tree = hooks.render();
  const connect = nodes(tree).find((n) => n.type === 'ConnectEmailScreen');
  assert.ok(connect, 'it opens its own screen');
  connect.props.onSave({ email: 'me@example.test', password: 'synthetic password' }); tree = hooks.render();
  assert.equal(nodes(tree).some((n) => n.type === 'ConnectEmailScreen'), false);
  assert.ok(nodes(tree).find((n) => n.props?.accessibilityLabel === 'me@example.test'), 'the corner shows what was filled in');
  // Coming back to an account is the invitation page, which signs in through the real auth provider and keeps the policy links.
  nodes(tree).find((n) => n.props?.accessibilityRole === 'button' && text(n).includes('Already have an account')).props.onPress(); tree = hooks.render();
  const invitation = nodes(tree).find((n) => n.type === 'LoginPreviewPage');
  assert.ok(invitation); assert.ok(invitation.props.footer); assert.doesNotMatch(text(tree), /Sign out/i);
  await invitation.props.onSignIn('Bloom', 'synthetic password');
  assert.deepEqual(logins, [['Bloom', 'synthetic password']]);
  invitation.props.onCreateAccount(); tree = hooks.render();
  assert.equal(nodes(tree).some((n) => n.type === 'LoginPreviewPage'), false);
  // An identity that never finished its profile finishes it on the same card, and can leave it.
  auth = { ...auth, phase: 'profileRequired', identity: { uid: 'new', email: 'new@example.test' } }; tree = hooks.render();
  assert.equal(nodes(tree).filter((n) => n.type === 'TextInput').length, 1);
  assert.equal(nodes(tree).some((n) => n.props?.accessibilityLabel === 'Connect to your email?'), false, 'it already has an address');
  auth = { ...auth, phase: 'signedIn', session: { user: { id: 'owner-new' } } }; tree = hooks.render();
  assert.equal(tree.props.children, 'real-app');
});

test('Phase 1 simultaneous terminal 401s invoke the invalidation callback once', async () => {
  const s = setup(); let invalidations = 0; const final = deferred(); let attempts = 0;
  s.api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'synthetic-token', onUnauthorized: () => invalidations++ });
  s.setHandler(async () => ++attempts <= 2 ? response({}, 401) : final.promise);
  const first = s.api.apiRequest('/one'); const second = s.api.apiRequest('/two');
  await s.hooks.flush(); final.resolve(response({}, 401));
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every((result) => result.status === 'rejected'));
  assert.equal(attempts, 4); assert.equal(invalidations, 1);
});

test('DELTA-P2-2 logout erases durable private cache, preserves globals/SDK and reloads empty', async () => {
  const s = setup(user()); let state = await s.ready();
  s.items.set('theme', 'dark'); s.items.set('firebase:authUser:synthetic', 'SDK-owned');
  await s.storage.saveFlowerPlacements([{ id: 'private' }]);
  await state.logout(); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedOut');
  assert.deepEqual([...s.items.keys()].sort(), ['firebase:authUser:synthetic', 'theme']);
  const reloaded = loadPlantingModules(undefined, undefined, { getAllKeys: async () => [...s.items.keys()],
    removeItem: async key => s.items.delete(key), getItem: async key => s.items.get(key) ?? null }, false)('plantingPersistence');
  await reloaded.scopeFlowerPlacements('owner-alice'); assert.equal((await reloaded.loadFlowerPlacements()).length, 0);
});
test('DELTA-P2-2 confirmed account deletion erases cache; failed deletion preserves current session/cache', async () => {
  for (const success of [true, false]) {
    const s = setup(user()); const state = await s.ready();
    await s.storage.saveFlowerPlacements([{ id: 'private' }]);
    s.setHandler(async (path, options) => {
      assert.equal(path, '/users/owner-alice'); assert.equal(options.method, 'DELETE'); return response({ success });
    });
    if (success) await state.deleteAccount(); else await assert.rejects(state.deleteAccount(), /not confirmed/);
    const result = await s.hooks.flush();
    assert.equal(result.phase, success ? 'signedOut' : 'signedIn');
    assert.equal(s.items.has('petalpal_flower_placements_v1:owner-alice'), !success);
  }
});
test('DELTA-P2-2 stale deletion control cannot delete the new account', async () => {
  const s = setup(user()); const old = await s.ready(); s.emit(user('bob')); await s.hooks.flush();
  await assert.rejects(old.deleteAccount(), /Sign in/);
  assert.equal(s.requests.filter(r => r.options.method === 'DELETE').length, 0);
});
test('DELTA-P2-2 account switch erases A and late placement writes cannot pollute B', async () => {
  const s = setup(user()); await s.ready(); const old = s.storage.capturePlacementSession();
  await s.storage.saveFlowerPlacements([{ id: 'private' }], old);
  s.emit(user('bob')); const state = await s.hooks.flush();
  await s.storage.saveFlowerPlacements([{ id: 'late' }], old);
  assert.equal(state.session.user.id, 'owner-bob'); assert.equal(s.items.size, 0);
});
test('DELTA-P2-2 cleanup failure closes auth and API; retry erases retained owner cache', async () => {
  const s = setup(user()); let state = await s.ready();
  await s.storage.saveFlowerPlacements([{ id: 'private' }]); s.setStorageError(new Error('private payload'));
  await state.logout(); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedOut'); assert.equal(state.session, null); assert.equal(state.experience, null);
  assert.match(state.error, /cache cleanup failed/); assert.doesNotMatch(state.error, /private payload/);
  await assert.rejects(s.api.apiRequest('/owner'), /Sign in/);
  s.setStorageError(null); await state.login('bob@example.test', 'synthetic password'); state = await s.hooks.flush();
  assert.equal(state.session.user.id, 'owner-bob'); assert.equal(s.items.size, 0);
});

test('an email that already has an account is told to sign in or reset, never shown provider details', async () => {
  const s = setup(); let state = await s.ready();
  await state.register({ name: 'Bloom' }); state = await s.hooks.flush();
  s.setLinkError(Object.assign(new Error('EMAIL_EXISTS private@example.test provider diagnostic'), { code: 'auth/email-already-in-use' }));
  await assert.rejects(state.connectEmail('known@example.test', 'synthetic password'), (error) => {
    assert.equal(error.message, 'This email already has a PetalPal account. Sign in instead, or tap “Forgot password?” to set a new one.');
    return true;
  });
  assert.equal(s.emails.length, 0);
});
test('Forgot password sends a Firebase reset email with the same reply for every address', async () => {
  const s = setup(); let state = await s.ready();
  await state.resetPassword('  '); state = await s.hooks.flush();
  assert.equal(state.error, 'Enter your email address first.'); assert.deepEqual(s.resets, []);
  for (const email of ['known@example.test', 'unknown@example.test']) {
    await state.resetPassword(` ${email} `); state = await s.hooks.flush();
    assert.equal(state.error, '');
    assert.equal(state.message, `If ${email} has a PetalPal account, a link to set a new password is on its way. Check your inbox and spam folder.`);
  }
  assert.deepEqual(s.resets, ['known@example.test', 'unknown@example.test']);
  assert.equal(state.phase, 'signedOut'); assert.equal(s.requests.length, 0); assert.equal(s.auth.currentUser, null);
  s.setResetError(Object.assign(new Error('private provider throttle'), { code: 'auth/too-many-requests' }));
  await state.resetPassword('known@example.test'); state = await s.hooks.flush();
  assert.equal(state.error, 'Too many attempts. Please wait before trying again.'); assert.equal(state.message, '');
});
test('PetalPal refusals show their reason; server failures keep the general message', async () => {
  for (const [status, body, expected] of [
    [403, { error: 'Account deletion is pending or complete', code: 'ACCOUNT_DELETED' }, 'Account deletion is pending or complete'],
    [429, { error: 'Too many requests. Try again later.' }, 'Too many requests. Try again later.'],
    [500, { error: 'Unable to create PetalPal session' }, 'We couldn’t connect to your account. Please try again.'],
    [503, { error: 'synthetic outage' }, 'We couldn’t connect to your account. Please try again.'],
  ]) {
    const s = setup(user());
    s.setHandler(async (path) => path === '/auth/session' ? response(body, status) : response({ ok: true }));
    const state = await s.ready();
    assert.equal(state.phase, 'signedOut'); assert.equal(state.session, null);
    assert.equal(state.error, expected, String(status));
  }
});
test('Account enumeration: unknown, wrong-password and disabled login share safe feedback', async () => {
  const errors = [];
  for (const [email, code] of [['unknown@example.test', 'auth/user-not-found'], ['alice@example.test', 'auth/wrong-password'], ['alice@example.test', 'auth/invalid-credential'], ['disabled@example.test', 'auth/user-disabled']]) {
    const s = setup(); const state = await s.ready();
    s.setLoginError(Object.assign(new Error('private provider diagnostic ' + email), { code }));
    await state.login(email, 'wrong password'); const result = await s.hooks.flush();
    errors.push(result.error); assert.equal(result.phase, 'signedOut');
    assert.equal(s.requests.length, 0); assert.equal(s.auth.currentUser, null);
  }
  assert.deepEqual(errors, Array(4).fill('Check your email and password, then try again.'));
});

test('Brute force: provider throttling shows safe wait feedback and creates no backend session', async () => {
  const s = setup(); const state = await s.ready();
  s.setLoginError(Object.assign(new Error('private provider throttle'), { code: 'auth/too-many-requests' }));
  await state.login('known@example.test', 'synthetic-password');
  const result = await s.hooks.flush();
  assert.equal(result.error, 'Too many attempts. Please wait before trying again.');
  assert.equal(result.phase, 'signedOut'); assert.equal(s.auth.currentUser, null); assert.equal(s.requests.length, 0);
});
test('Brute force: backend 429 does not retry, refresh credentials or close an authenticated session', async () => {
  const s = setup(user()); await s.ready();
  const beforeRequests = s.requests.length, beforeTokens = s.tokens.length;
  s.setHandler(async () => response({ error: 'Too many requests. Try again later.' }, 429));
  await assert.rejects(s.api.apiRequest('/session?view=metadata'), error => error.status === 429);
  const state = await s.hooks.flush();
  assert.equal(s.requests.length, beforeRequests + 1); assert.equal(s.tokens.length, beforeTokens + 1);
  assert.equal(s.tokens.at(-1).force, false);
  assert.equal(state.phase, 'signedIn'); assert.equal(state.session.user.id, 'owner-alice');
  assert.equal(s.auth.currentUser.uid, 'alice');
});

test('Recent-login rejection preserves the account/session/cache until explicit new sign-in and deletion retry', async () => {
  const s = setup(user()); const state = await s.ready();
  await s.storage.saveFlowerPlacements([{ id: 'private' }]);
  const before = s.requests.length;
  s.setHandler(async () => response({ error: 'Sign out and sign in again before deleting your account.', code: 'auth/requires-recent-login' }, 403));
  await assert.rejects(state.deleteAccount(), error => error.status === 403 && error.code === 'auth/requires-recent-login' && /Sign out and sign in again/.test(error.message));
  const retained = await s.hooks.flush();
  assert.equal(s.requests.length, before + 1); assert.equal(retained.phase, 'signedIn');
  assert.equal(s.auth.currentUser.uid, 'alice'); assert.equal((await s.storage.loadFlowerPlacements()).length, 1);
  await retained.logout(); const signedOut = await s.hooks.flush(); s.setHandler(null);
  await signedOut.login('alice@example.test', 'synthetic-password');
  const fresh = await s.hooks.flush();
  s.setHandler(async () => response({ success: true }));
  await fresh.deleteAccount(); const deleted = await s.hooks.flush();
  assert.equal(deleted.phase, 'signedOut'); assert.equal((await s.storage.loadFlowerPlacements()).length, 0);
});
