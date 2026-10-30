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
  const hooks = hookHarness(); const requests = [], emails = [], tokens = [], writes = [], resets = [];
  const auth = { currentUser: initial, authStateReady: async () => {} };
  let changed, handler, emailError, registrationError, loginError, signOutError, storageError, resetError;
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
    createUserWithEmailAndPassword: async (_auth, email) => {
      if (registrationError) throw registrationError;
      const value = user(email.split('@')[0], false); emit(value); return { user: value };
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
  return { hooks, auth, requests, emails, tokens, writes, items, emit, load, resets,
    api: load('../../../services/api'), storage: load('plantingPersistence'),
    setHandler: (value) => { handler = value; }, setNeedsProfile: () => { needsProfile = true; },
    setLoginError: (value) => { loginError = value; }, setResetError: (value) => { resetError = value; },
    setEmailError: (value) => { emailError = value; }, setRegistrationError: (value) => { registrationError = value; },
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
  assert.deepEqual(s.requests.map((r) => r.path), ['/auth/session', '/session?view=metadata']);
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
test('Phase 1 registration validates confirmation/minimum before Firebase and sends verification without backend access', async () => {
  const s = setup(); let state = await s.ready();
  await state.register('new@example.test', 'short', 'short'); state = await s.hooks.flush();
  assert.match(state.error, /at least 6/); assert.equal(s.auth.currentUser, null);
  await state.register('new@example.test', 'synthetic password', 'different'); state = await s.hooks.flush();
  assert.match(state.error, /do not match/);
  await state.register('new@example.test', 'synthetic password', 'synthetic password'); state = await s.hooks.flush();
  assert.equal(state.phase, 'verificationPending'); assert.equal(state.identity.uid, 'new');
  assert.deepEqual(s.emails, ['new']); assert.equal(s.requests.length, 0); assert.deepEqual(s.writes, []);
});
test('Phase 1 registration errors are readable and create no backend session', async () => {
  for (const code of ['auth/internal-error', undefined]) {
    const s = setup(); const state = await s.ready();
    s.setRegistrationError(Object.assign(new Error('EMAIL_EXISTS private@example.test provider diagnostic'), { code }));
    await state.register('known@example.test', 'synthetic password', 'synthetic password');
    const result = await s.hooks.flush();
    assert.equal(result.phase, 'signedOut');
    assert.equal(result.error, 'We couldn’t connect to your account. Please try again.');
    assert.doesNotMatch(result.error, /EMAIL_EXISTS|private@example.test|provider diagnostic/);
    assert.equal(result.identity, null); assert.equal(result.session, null); assert.equal(result.message, '');
    assert.equal(s.auth.currentUser, null); assert.equal(s.requests.length, 0); assert.equal(s.emails.length, 0);
  }
});
test('Phase 1 reload recovers unverified registration solely from the current Firebase identity', async () => {
  const first = setup(user('new', false)); let state = await first.ready();
  assert.equal(state.phase, 'verificationPending'); assert.equal(first.requests.length, 0);
  const restored = setup(first.auth.currentUser); state = await restored.ready();
  assert.equal(state.phase, 'verificationPending'); assert.equal(state.identity.email, 'new@example.test');
  restored.emit(user('other', false)); state = await restored.hooks.flush();
  assert.equal(state.identity.email, 'other@example.test'); assert.deepEqual(restored.writes, []);
});
test('Phase 1 verification resend handles success, rate limits, and recheck without restarting registration', async () => {
  const s = setup(user('new', false)); let state = await s.ready();
  await state.resendVerification(); state = await s.hooks.flush(); assert.match(state.message, /email sent/);
  s.setEmailError(Object.assign(new Error('synthetic'), { code: 'auth/too-many-requests' }));
  await state.resendVerification(); state = await s.hooks.flush(); assert.match(state.error, /wait/);
  await state.checkVerification(); state = await s.hooks.flush(); assert.match(state.message, /isn’t verified yet/);
  assert.equal(state.phase, 'verificationPending'); assert.equal(s.requests.length, 0);
});
test('Phase 1 verified email refreshes claims, then resumes into profile completion with safe consent', async () => {
  const s = setup(user('new', false)); s.setNeedsProfile(); let state = await s.ready();
  s.auth.currentUser.emailVerified = true;
  await state.checkVerification(); state = await s.hooks.flush();
  assert.equal(state.phase, 'profileRequired'); assert.equal(state.session, null);
  assert.ok(s.tokens.some((token) => token.force));
  await state.completeProfile({ name: '  New Petal  ', avatar: '🐝' }); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn');
  const payload = JSON.parse(s.requests.find((r) => r.path === '/auth/session' && !JSON.parse(r.options.body).deferProfileCreation).options.body);
  assert.equal(payload.name, 'New Petal'); assert.equal(payload.avatar, '🐝'); assert.equal(payload.aiConsent, false);
  assert.equal(payload.preferredLocale, 'en');
});
test('Phase 1 verified registration reload resumes profile and accepts only explicit initial AI consent', async () => {
  const s = setup(user('new')); s.setNeedsProfile(); let state = await s.ready();
  assert.equal(state.phase, 'profileRequired');
  await state.completeProfile({ name: 'Petal', aiConsent: true, preferredLocale: 'zh' }); state = await s.hooks.flush();
  const body = JSON.parse(s.requests.find((r) => r.path === '/auth/session' && !JSON.parse(r.options.body).deferProfileCreation).options.body);
  assert.equal(body.aiConsent, true); assert.equal(body.preferredLocale, 'zh'); assert.equal(body.memoryEnabled, undefined);
  assert.equal(state.phase, 'signedIn'); assert.deepEqual(s.writes, []);
});
test('Phase 1 already-verified resend resumes instead of sending another verification email', async () => {
  const s = setup(user('new', false)); let state = await s.ready(); s.auth.currentUser.emailVerified = true;
  await state.resendVerification(); state = await s.hooks.flush();
  assert.equal(state.phase, 'signedIn'); assert.equal(s.emails.length, 0);
});
test('Phase 1 delayed verification cannot publish state or authenticate the wrong account', async () => {
  const s = setup(user('alice', false)); let state = await s.ready(); const reload = deferred();
  s.auth.currentUser.reload = () => reload.promise;
  const pending = state.checkVerification();
  s.emit(user('bob', false)); state = await s.hooks.flush();
  reload.resolve(); await pending; state = await s.hooks.flush();
  assert.equal(state.identity.uid, 'bob'); assert.equal(state.phase, 'verificationPending');
  assert.equal(state.message, ''); assert.equal(s.requests.length, 0);
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

test('Phase 1 auth gate separates loading, signed-out, verification, profile and authenticated controls', async () => {
  let auth = { phase: 'initializing', loading: true, session: null, identity: null, error: '', message: '' };
  const replaced = [];
  const hooks = hookHarness(); const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.children)] : [];
  const text = (tree) => nodes(tree).filter((n) => n.type === 'Text').map((n) => n.props.children).flat().join(' ');
  const load = loadPlantingModules(undefined, hooks.react, {}, false, {
    '../services/auth': { useAuth: () => auth },
    './auth/LoginPreviewPage': { LoginPreviewPage: 'LoginPreviewPage' },
    '../constants/theme': { Fonts: { sans: 'sans', rounded: 'rounded' }, Spacing: { two: 8, three: 16, four: 24 } },
    'expo-splash-screen': { hideAsync: async () => {} },
    'expo-router': { router: { replace: (path) => replaced.push(path) }, usePathname: () => '/' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) },
    '../services/guest': { GuestContext: { Provider: 'GuestProvider' } },
    'react-native': { ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
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
  // Then the invitation page lies over the still-mounted app, signs in through the real auth provider and keeps the policy links.
  assert.ok(nodes(tree).includes('real-app') || JSON.stringify(tree).includes('real-app'), 'the Garden stays mounted underneath');
  const back = nodes(tree).find((n) => n.props?.accessibilityLabel === 'Back to the Garden');
  assert.ok(back);
  const invitation = nodes(tree).find((n) => n.type === 'LoginPreviewPage');
  assert.ok(invitation); assert.ok(invitation.props.footer); assert.doesNotMatch(text(tree), /Sign out/i);
  await invitation.props.onSignIn('fixture@example.test', 'synthetic password');
  assert.deepEqual(logins, [['fixture@example.test', 'synthetic password']]);
  invitation.props.onCreateAccount(); tree = hooks.render();
  assert.match(text(tree), /Create your PetalPal account/); assert.equal(nodes(tree).some((n) => n.type === 'LoginPreviewPage'), false);
  assert.equal(nodes(tree).find((n) => n.props.testID === 'auth-card').props.style.maxWidth, 440);
  auth = { ...auth, phase: 'verificationPending', identity: { uid: 'new', email: 'new@example.test' } }; tree = hooks.render();
  assert.match(text(tree), /Verify your email/); assert.equal(nodes(tree).filter((n) => n.type === 'TextInput').length, 0);
  auth = { ...auth, phase: 'profileRequired' }; tree = hooks.render();
  assert.equal(nodes(tree).find((n) => n.props.accessibilityRole === 'checkbox').props.accessibilityState.checked, false);
  auth = { ...auth, phase: 'signedIn', session: { user: { id: 'owner-new' } } }; tree = hooks.render();
  assert.equal(tree.props.children, 'real-app');
});

test('Phase 1 pending reload detects verification completed elsewhere and refreshes claims automatically', async () => {
  const value = user('new', false); value.reload = async () => { value.emailVerified = true; };
  const s = setup(value); const state = await s.ready();
  assert.equal(state.phase, 'signedIn'); assert.equal(s.tokens[0].force, true);
});
test('Phase 1 first verification email failure retains the newly created Firebase identity for resend', async () => {
  const s = setup(); let state = await s.ready(); s.setEmailError(new Error('synthetic delivery failure'));
  await state.register('new@example.test', 'synthetic password', 'synthetic password'); state = await s.hooks.flush();
  assert.equal(state.phase, 'verificationPending'); assert.equal(state.identity.uid, 'new'); assert.ok(state.error);
  s.setEmailError(null); await state.resendVerification(); state = await s.hooks.flush();
  assert.match(state.message, /email sent/); assert.equal(s.requests.length, 0);
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

test('Phase 1 delayed verification after logout cannot restore identity or experience', async () => {
  const s = setup(user('alice', false)); let state = await s.ready();
  const reload = deferred(); const previous = s.auth.currentUser;
  previous.reload = () => reload.promise;
  const checking = state.checkVerification();
  await state.logout(); state = await s.hooks.flush();
  previous.emailVerified = true; reload.resolve(); await checking; state = await s.hooks.flush();
  assert.equal(state.phase, 'signedOut'); assert.equal(state.identity, null);
  assert.equal(state.session, null); assert.equal(state.experience, null); assert.equal(s.requests.length, 0);
});
test('Phase 1 stale verification control cannot send email for another account', async () => {
  const s = setup(user('alice', false)); const previous = await s.ready();
  s.emit(user('bob', false)); await s.hooks.flush();
  await previous.resendVerification();
  assert.equal(s.emails.length, 0);
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

test('an email from an earlier version is told to sign in or reset, never shown provider details', async () => {
  const s = setup(); const state = await s.ready();
  s.setRegistrationError(Object.assign(new Error('EMAIL_EXISTS private@example.test provider diagnostic'), { code: 'auth/email-already-in-use' }));
  await state.register('known@example.test', 'synthetic password', 'synthetic password');
  const result = await s.hooks.flush();
  assert.equal(result.phase, 'signedOut');
  assert.equal(result.error, 'This email already has a PetalPal account. Sign in instead, or tap “Forgot password?” to set a new one.');
  assert.equal(s.auth.currentUser, null); assert.equal(s.requests.length, 0); assert.equal(s.emails.length, 0);
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
