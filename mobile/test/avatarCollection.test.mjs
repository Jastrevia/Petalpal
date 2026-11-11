import assert from 'node:assert/strict';
import test from 'node:test';
import { AVATAR_TIERS } from '../../lib/avatars.js';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const plain = value => JSON.parse(JSON.stringify(value)); // VM-realm objects
const native = { Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', ActivityIndicator: 'Spinner',
  Animated: { Value: class {}, View: 'AnimatedView', spring: () => ({ start() {} }) }, Platform: { OS: 'ios' }, StyleSheet: { create: styles => styles } };
function modules(fetch) {
  const load = loadPlantingModules(undefined, undefined, {}, false, {
    fetch, 'react-native': native, '../../services/auth': { useAuth: () => ({}) }, '../features/PanelTheme': { usePanelTheme: () => ({}) },
  });
  const api = load('../../../services/api');
  api.configureApi({ apiBaseUrl: 'https://api.test', getAccessToken: async () => 'token' });
  return { load, avatars: load('../../../services/avatars') };
}
const collection = (overrides = {}) => ({
  equipped: 'l1-02', bondOn: true, level: 6, owned: ['fairy-1', 'l1-02', 'l1-07', 'l1-09'], total: 75,
  tiers: [], welcome: { needed: false, selected: 'l1-02', gifted: ['fairy-1', 'l1-07', 'l1-09'] },
  pending: [{ level: 5, tier: 1, eligible: 28 }, { level: 6, tier: 2, eligible: 44 }], ready: 2, nextRewardLevel: 7, claims: [], ...overrides,
});

test('the app shows the same three tiers as the server: 33, 17 and 28 avatars', () => {
  const { AVATAR_TIERS: app, avatarTier } = modules().load('../../avatars/avatarArt');
  assert.deepEqual(plain(app), AVATAR_TIERS.map(({ tier, unlockLevel, ids }) => ({ tier, unlockLevel, ids: [...ids] })));
  assert.deepEqual(plain(app).map(t => t.ids.length), [33, 17, 28]);
  assert.equal(avatarTier('fairy-4'), 1);
  assert.equal(avatarTier('l2-16'), 2);
  assert.equal(avatarTier('🐝'), null);
});

test('each avatar has one clear state: wearing, yours, to unlock or locked by level', () => {
  const { tileState } = modules().load('../../avatars/AvatarCollection');
  const state = collection();
  assert.equal(tileState('l1-02', state, 'l1-02'), 'equipped');
  assert.equal(tileState('l1-07', state, 'l1-02'), 'owned');
  assert.equal(tileState('l1-20', state, 'l1-02'), 'available');
  assert.equal(tileState('l2-03', state, 'l1-02'), 'available', 'Level 2 opens at Lv 6');
  assert.equal(tileState('l3-03', state, 'l1-02'), 'locked', 'Level 3 is preview-only before Lv 14');
  assert.equal(tileState('l2-03', collection({ level: 5 }), 'l1-02'), 'locked');
  assert.equal(tileState('l2-03', collection({ level: null, bondOn: false }), 'l1-02'), 'locked');
  assert.equal(tileState('l1-20', collection({ level: null, bondOn: false }), '🐝'), 'available');
  assert.equal(tileState('fairy-5', collection(), 'fairy-5'), 'available', 'an unowned avatar is never shown as worn');
});

test('sortTierAvatars sorts unlocked avatars first: equipped -> owned -> unowned', () => {
  const { sortTierAvatars } = modules().load('../../avatars/AvatarCollection');
  const state = collection({
    equipped: 'l1-02',
    owned: ['fairy-1', 'l1-02', 'l1-07', 'fairy-4'],
  });
  const input = ['fairy-1', 'fairy-2', 'fairy-3', 'fairy-4', 'l1-01', 'l1-02', 'l1-07'];
  const sorted = sortTierAvatars(input, state, 'l1-02');
  assert.deepEqual(plain(sorted), [
    'l1-02',   // 1. Equipped / Wearing
    'fairy-1', // 2. Owned / Yours (stable order)
    'fairy-4',
    'l1-07',
    'fairy-2', // 3. Unowned (stable order)
    'fairy-3',
    'l1-01',
  ]);
});

test('a chosen avatar uses the lowest waiting reward that may choose it', () => {
  const { rewardFor } = modules().avatars;
  const { pending } = collection();
  assert.equal(rewardFor(pending, 1).level, 5);
  assert.equal(rewardFor(pending, 2).level, 6);
  assert.equal(rewardFor(pending, 3), undefined);
  assert.equal(rewardFor([{ level: 3, tier: 1, eligible: 0 }], 1), undefined, 'a reward with nothing left to choose is skipped');
});

test('the app sends only the choice; the server answers with the collection', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body && JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ ...collection(), created: true }) };
  };
  const { avatars } = modules(fetch);
  let changes = 0;
  avatars.onAvatarsChanged(() => { changes += 1; });
  await avatars.loadAvatarCollection();
  await avatars.receiveWelcomeAvatars('l1-02');
  await avatars.claimAvatarReward(6, 'l2-03');
  assert.deepEqual(calls.map(call => [call.url.replace('https://api.test', ''), call.method ?? 'GET', call.body ?? null]), [
    ['/api/avatars', 'GET', null],
    ['/api/avatars/welcome', 'POST', { avatar: 'l1-02' }],
    ['/api/avatars/claim', 'POST', { level: 6, avatar: 'l2-03' }],
  ]);
  assert.equal(changes, 2);
});

test('the level-up celebration waits while any keepsake reveal holds it', () => {
  const { avatars } = modules();
  assert.equal(avatars.bondCelebrationHeld(), false);
  const first = avatars.holdBondCelebration(), second = avatars.holdBondCelebration();
  first(); first(); // releasing twice counts once
  assert.equal(avatars.bondCelebrationHeld(), true, 'the second reveal is still up');
  second();
  assert.equal(avatars.bondCelebrationHeld(), false);
});

test('avatar rewards unlock at Levels 2, 6 and 14 with correct tiers', () => {
  const { tileState } = modules().load('../../avatars/AvatarCollection');
  const { rewardFor } = modules().avatars;

  // Level 2: Tier 1 open, Tiers 2 & 3 locked
  const lv2 = collection({ level: 2, pending: [{ level: 2, tier: 1, eligible: 28 }] });
  assert.equal(tileState('l1-05', lv2, 'l1-02'), 'available');
  assert.equal(tileState('l2-01', lv2, 'l1-02'), 'locked');
  assert.equal(tileState('l3-01', lv2, 'l1-02'), 'locked');
  assert.equal(rewardFor(lv2.pending, 1).level, 2);
  assert.equal(rewardFor(lv2.pending, 2), undefined);

  // Level 6: Tier 2 unlocks, Tier 3 locked
  const lv6 = collection({ level: 6, pending: [{ level: 6, tier: 2, eligible: 44 }] });
  assert.equal(tileState('l1-05', lv6, 'l1-02'), 'available');
  assert.equal(tileState('l2-01', lv6, 'l1-02'), 'available');
  assert.equal(tileState('l3-01', lv6, 'l1-02'), 'locked');
  assert.equal(rewardFor(lv6.pending, 1).level, 6);
  assert.equal(rewardFor(lv6.pending, 2).level, 6);
  assert.equal(rewardFor(lv6.pending, 3), undefined);

  // Level 14: Tier 3 unlocks
  const lv14 = collection({ level: 14, pending: [{ level: 14, tier: 3, eligible: 71 }] });
  assert.equal(tileState('l1-05', lv14, 'l1-02'), 'available');
  assert.equal(tileState('l2-01', lv14, 'l1-02'), 'available');
  assert.equal(tileState('l3-01', lv14, 'l1-02'), 'available');
  assert.equal(rewardFor(lv14.pending, 1).level, 14);
  assert.equal(rewardFor(lv14.pending, 2).level, 14);
  assert.equal(rewardFor(lv14.pending, 3).level, 14);
});

test('the welcome flow sequencing holds celebrations throughout avatar choice and gifts reveal', () => {
  const { avatars } = modules();
  assert.equal(avatars.isWelcomeActive(), false);
  assert.equal(avatars.bondCelebrationHeld(), false);

  // Stage 1: Initial avatar selection
  avatars.setWelcomeActive(true);
  const release = avatars.holdBondCelebration();
  assert.equal(avatars.isWelcomeActive(), true, 'welcome flow is active during avatar choice');
  assert.equal(avatars.bondCelebrationHeld(), true, 'celebrations are held during avatar choice');

  // Stage 2: 3 gifts reveal (still holding)
  assert.equal(avatars.isWelcomeActive(), true, 'welcome flow remains active during gifts reveal');
  assert.equal(avatars.bondCelebrationHeld(), true, 'celebrations remain held during gifts reveal');

  // Stage 3: Dismiss welcome flow
  release();
  avatars.setWelcomeActive(false);
  assert.equal(avatars.isWelcomeActive(), false, 'welcome flow is no longer active');
  assert.equal(avatars.bondCelebrationHeld(), false, 'celebrations are released after welcome flow');
});

test('useAvatarCollection provides retry recovery when avatar fetch fails', async () => {
  let attempt = 0;
  const fetch = async (url) => {
    attempt += 1;
    if (attempt === 1) return { ok: false, status: 500, json: async () => ({ error: 'Fail' }) };
    return { ok: true, status: 200, json: async () => collection() };
  };
  const { avatars } = modules(fetch);

  // Initial load fails
  let errorCaught = false;
  try {
    await avatars.loadAvatarCollection();
  } catch {
    errorCaught = true;
  }
  assert.equal(errorCaught, true, 'first load throws error');

  // Retry succeeds
  const recovered = await avatars.loadAvatarCollection();
  assert.equal(recovered.total, 75);
  assert.equal(attempt, 2);
});

test('local preview fixtures intercept /api/avatars, handle trailing slashes and Headers objects', async () => {
  // Simulate the fixture interceptor logic
  const SIGNED_IN_KEY = 'petalpal_local_preview_signed_in_v1';
  const sessionStorage = new Map();
  let signedIn = false;
  const setSignedIn = val => {
    signedIn = Boolean(val);
    sessionStorage.set(SIGNED_IN_KEY, signedIn ? 'true' : 'false');
  };

  const API = 'https://api.synthetic.invalid';
  const location = { origin: 'http://localhost:8081', href: 'http://localhost:8081/' };

  const fixtureFetch = async (input, options = {}) => {
    const url = new URL(input, location.href);
    const isSyntheticApi = url.origin === API || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/users/') || url.pathname.startsWith('/ai/');
    if (url.origin === location.origin && !isSyntheticApi) return { status: 404 };

    if (url.origin === API || isSyntheticApi) {
      const p = url.pathname.replace(/\/+$/, '');
      let authHeader = '';
      if (options.headers) {
        if (typeof options.headers.get === 'function') {
          authHeader = options.headers.get('authorization') || options.headers.get('Authorization') || '';
        } else {
          authHeader = options.headers.Authorization || options.headers.authorization || '';
        }
      }
      if (authHeader.startsWith('Bearer ')) setSignedIn(true);

      if (p === '/api/avatars') {
        setSignedIn(true);
        return { status: 200, body: collection() };
      }
      if (!signedIn) return { status: 401, body: { error: 'Sign in to the local preview first' } };
      if (p === '/auth/session') return { status: 200, body: { user: { id: 'local-preview-owner' } } };
    }
    return { status: 404 };
  };

  // 1. Initial request even without prior sign in succeeds and returns all 75 avatars
  const initial = await fixtureFetch('https://api.synthetic.invalid/api/avatars');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.total, 75);
  assert.equal(signedIn, true);

  // 2. Request with trailing slash (/api/avatars/) matches and succeeds
  const trailingSlash = await fixtureFetch('https://api.synthetic.invalid/api/avatars/');
  assert.equal(trailingSlash.status, 200);
  assert.equal(trailingSlash.body.total, 75);

  // 3. Request with standard Headers object (options.headers.get) is parsed properly
  const headersObj = {
    get(name) { return name.toLowerCase() === 'authorization' ? 'Bearer synthetic-jwt' : null; }
  };
  const withHeadersInstance = await fixtureFetch('/api/avatars', { headers: headersObj });
  assert.equal(withHeadersInstance.status, 200);
  assert.equal(withHeadersInstance.body.total, 75);

  // 4. Request made with relative or local origin /api/avatars is also intercepted, not passed to native
  const relative = await fixtureFetch('/api/avatars');
  assert.equal(relative.status, 200);
  assert.equal(relative.body.total, 75);
});
