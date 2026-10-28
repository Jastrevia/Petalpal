import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { hookHarness } from './flowerDetail.test.mjs';
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const featureNodes = tree => Array.isArray(tree) ? tree.flatMap(featureNodes)
  : tree && typeof tree === 'object' ? [tree, ...featureNodes(tree.props?.children)] : [];
const featureText = tree => Array.isArray(tree) ? tree.map(featureText).join('')
  : tree && typeof tree === 'object' ? (tree.props?.title || '') + featureText(tree.props?.children) : tree == null ? '' : String(tree);
function friendsHarness(fetch, initialSession = { user: { id: 'owner' } }, extras = {}) {
  const hooks = hookHarness(); let session = initialSession;
  const { api, load } = setup(fetch, {
    '../../services/auth': { useAuth: () => ({ session }) },
    'react-native': { ActivityIndicator: 'Spinner', Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', Text: 'Text', TextInput: 'Input', View: 'View',
      Platform: { OS: 'ios' }, StyleSheet: { create: styles => styles, absoluteFill: {} } },
    'expo-symbols': { SymbolView: 'Symbol' },
    'expo-router': { router: { push() {} } },
    './FeatureUI': { FEATURE_COLORS: {}, FeatureActionButton: 'Action', FeatureSection: 'Section', ui: {} },
    ...extras,
  }, hooks.react);
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  const { FriendsPanel } = load('../../features/FriendsPanel');
  let tree = hooks.mount(() => FriendsPanel({ addingFriend: true }));
  return {
    api, load,
    async flush() { tree = await hooks.flush(); return tree; },
    text: () => featureText(tree),
    nodes: () => featureNodes(tree),
    button: title => featureNodes(tree).find(node => (node.type === 'Action' && node.props.title === title) ||
      (node.type === 'Pressable' && node.props.accessibilityLabel === title)),
    async press(title) {
      const button = this.button(title); assert.ok(button, `Button exists: ${title}`);
      assert.equal(button.props.disabled, false, `Button enabled: ${title}`);
      button.props.onPress(); return this.flush();
    },
    async search(value) { featureNodes(tree).find(node => node.type === 'Input' && node.props.accessibilityLabel === 'Search by display name').props.onChangeText(value); await this.flush(); return this.press('Search'); },
    switchSession(next) { session = next; tree = hooks.render(); },
  };
}
function setup(fetch, extras = {}, react) {
  const load = loadPlantingModules(undefined, react, { getItem: async () => null, getAllKeys: async () => [], removeItem: async () => {} }, false, { fetch, '../../hooks/useEventVoiceInput': { useEventVoiceInput: () => ({ phase: 'idle', active: false }) }, ...extras });
  return { api: load('../../../services/api'), events: load('../../../services/events'), load };
}
test('authenticated requests refresh once on 401, preserve idempotency and reject anonymous requests', async () => {
  const calls = [], refreshes = [];
  const { api, events } = setup(async (url, options) => {
    calls.push({ url, options }); return response(calls.length === 1 ? { error: 'expired' } : { event: { id: 'event-1' } }, calls.length === 1 ? 401 : 201);
  });
  api.configureApi({ apiBaseUrl: 'https://petalpal.example/', getAccessToken: async (force) => {
    refreshes.push(force); return force ? 'fresh-test-token' : 'initial-test-token';
  } });
  await events.createEvent('  My own Event  ', 'FIRE_BLOOM', 'test-key');
  assert.deepEqual(refreshes, [false, true]);
  assert.equal(calls[1].url, 'https://petalpal.example/events');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fresh-test-token');
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[1].options.body), { content: 'My own Event', primaryGardenMood: 'FIRE_BLOOM' });
  api.configureApi(null);
  await assert.rejects(events.readEvent('event-1'), /Sign in/);
  assert.equal(calls.length, 2);
});
test('403 consent/ownership failures do not refresh or retry', async () => {
  let calls = 0;
  const { api, events } = setup(async () => { calls++; return response({ error: 'Consent required', code: 'CONSENT_REQUIRED' }, 403); });
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  await assert.rejects(events.readEvent('event-1'), (err) => err.status === 403 && err.code === 'CONSENT_REQUIRED');
  assert.equal(calls, 1);
});
test('logout discards a private response that was already in flight', async () => {
  let finish, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const { api, events } = setup(async () => { started(); return new Promise((resolve) => { finish = resolve; }); });
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  const pending = events.readEvent('event-1'); await ready;
  api.configureApi(null); finish(response({ content: 'Private owner content' }));
  await assert.rejects(pending, /session changed/);
});
test('garden reads only owner Event flowers; canonical species/modifiers survive layout adaptation', async () => {
  const flower = { id: 'flower-1', userId: 'owner', sourceEventId: 'event-1', speciesCode: 'SUNFLOWER',
    name: 'Sunflower', mood: 'SUNNY_BLOOM', img: 'sunflower.png', createdAt: '2026-10-01T01:00:00Z',
    colorAccent: 'WARM_GOLD', visualEffect: 'SUBTLE_MIST', event: 'Private text', supportCount: 3,
    sourceEvent: { secondaryEmotions: ['gratitude','fear'] } };
  const { api, events } = setup(async (url) => {
    assert.equal(url, '/users/owner/garden'); return response({ flowers: [flower, { id: 'journal-flower' }] });
  });
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  const flowers = await events.eventFlowers('owner'); assert.equal(flowers.length, 1);
  const record = events.plantingRecord(flowers[0], 'America/Vancouver');
  assert.equal(record.month, 9); assert.equal(record.speciesCode, 'SUNFLOWER');
  assert.equal(record.colorAccent, 'WARM_GOLD'); assert.equal(record.visualEffect, 'SUBTLE_MIST');
  assert.deepEqual(Array.from(record.secondaryEmotions), ['gratitude','fear']);
  assert.equal(record.notes, undefined); assert.equal(record.event, undefined);
  assert.equal(events.plantingRecord(flower, 'UTC', '2026-02-28').month, 2);
});
test('layout storage isolates accounts and rejects a save across an account switch', async () => {
  const items = new Map();
  let deferredRead = null;
  // Native AsyncStorage is injected, never stores a Firebase bearer token here.
  const nativeLoad = loadPlantingModules(undefined, undefined, {
    getItem: async (key) => deferredRead ? await deferredRead : items.get(key) || null,
    setItem: async (key, value) => items.set(key, value),
    getAllKeys: async () => [...items.keys()], removeItem: async key => items.delete(key),
  }, false);
  const storage = nativeLoad('plantingPersistence');
  await storage.scopeFlowerPlacements('alice'); await storage.saveFlowerPlacements([{ id: 'alice-flower', flowerId: 'a' }]);
  await storage.scopeFlowerPlacements('bob'); assert.equal((await storage.loadFlowerPlacements()).length, 0);
  await storage.scopeFlowerPlacements('alice'); assert.equal((await storage.loadFlowerPlacements()).length, 0, 'Returning to an account begins with a clean cache');
  let resolve; deferredRead = new Promise((done) => { resolve = done; });
  const saving = storage.addOrUpdateFlowerPlacement({ id: 'a2', flowerId: 'a2' });
  const switching = storage.scopeFlowerPlacements('bob'); resolve(null);
  assert.equal((await saving).length, 0, 'Stale save cannot cross account boundary'); await switching;
  assert.equal(items.has('petalpal_flower_placements_v1:bob'), false);
});
test('emotion pending, success and safe fallback remain distinct', () => {
  const { events } = setup(async () => response({}));
  assert.match(events.emotionMessage('PENDING'), /pending/);
  assert.match(events.emotionMessage('SUCCESS'), /ready/);
  assert.match(events.emotionMessage('FAILED'), /Event is saved/);
  assert.match(events.emotionMessage('SKIPPED'), /skipped/);
  assert.match(events.memoryMessage({ id: 'job', status: 'PENDING' }), /pending/);
  assert.match(events.memoryMessage({ id: 'job', status: 'SUCCEEDED' }), /completed/);
  assert.match(events.memoryMessage({ id: 'job', status: 'FAILED' }), /Event remains saved/);
  assert.match(events.memoryMessage(null), /No memory work/);
});
test('Firebase auth lifecycle syncs backend identity, signs out, and prevents late session restoration', async () => {
  const hooks = hookHarness();
  let changed, signedOut = false;
  const user = { uid: 'firebase-owner', emailVerified: true, reload: async () => {}, getIdToken: async () => 'firebase-test-token' };
  const auth = { currentUser: user, authStateReady: async () => {} };
  const firebase = {
    onAuthStateChanged: (_auth, cb) => { changed = cb; return () => {}; },
    signInWithEmailAndPassword: async () => { auth.currentUser = user; changed(); },
    signOut: async () => { signedOut = true; auth.currentUser = null; changed(); },
  };
  let calls = 0, finish, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const { load } = setup(async (url, options) => {
    if (url === '/session?view=metadata') return response({ user: { id: 'owner' }, fairyState: null });
    assert.equal(url, '/auth/session');
    assert.deepEqual(JSON.parse(options.body), { deferProfileCreation: true });
    if (++calls === 2) { started(); return new Promise((resolve) => { finish = resolve; }); }
    return response({ user: { id: 'owner' } });
  }, { 'firebase/auth': firebase, './firebase': { firebaseAuth: () => auth } }, hooks.react);
  const provider = load('../../../services/auth');
  hooks.mount(() => provider.AuthProvider({ children: null }).props.value);
  changed(); let state = await hooks.flush();
  assert.equal(state.session.user.id, 'owner');
  const syncing = state.retry(); await ready;
  await state.logout(); finish(response({ user: { id: "owner" } })); await syncing; state = await hooks.flush();
  assert.equal(signedOut, true); assert.equal(state.session, null);
});

test('Event panel controller requires a user-selected Primary and retries a failed save without duplicating its key', async () => {
  const hooks = hookHarness(); const calls = [];
  const eventSession = { user: { id: 'owner' } }; let gardenRefreshes = 0;
  const fakeEvent = { id: 'event-ui', primaryGardenMood: 'SUNNY_BLOOM', secondaryEmotions: [], emotionStatus: 'FAILED' };
  const { load } = setup(async () => response({}), {
    'react-native': { ActivityIndicator: 'ActivityIndicator', Button: 'Button', Image: 'Image', Pressable: 'Pressable',
      ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (styles) => styles } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: { push() {}, navigate() {}, dismissTo() {} }, useFocusEffect() {} },
    '../services/auth': { useAuth: () => ({ session: eventSession }) },
    '../services/events': {
      eventFlowers: async () => [],
      createEvent: async (content, mood, key) => {
        calls.push({ content, mood, key }); if (calls.length === 1) throw new Error('Temporary network failure');
        return { event: fakeEvent, flower: null, memoryJob: { id: 'job-ui', status: 'PENDING' } };
      },
    },
    '../components/garden/planting/flowerDetailApi': { sourceFlowerImageUri: (path) => path },
  }, hooks.react);
  const { useEventJournal } = load('../../../hooks/useEventJournal');
  let state = hooks.mount(() => useEventJournal(() => { gardenRefreshes++; }));
  state.setContent('Explicit owner Event'); state = await hooks.flush();
  await state.saveEvent(); assert.equal(calls.length, 0);
  state.setMood('SUNNY_BLOOM'); state = await hooks.flush();
  await state.saveEvent(); state = await hooks.flush();
  assert.equal(state.error, 'Temporary network failure');
  await state.saveEvent(); state = await hooks.flush();
  assert.equal(calls.length, 2); assert.equal(calls[0].key, calls[1].key);
  assert.equal(calls[1].mood, 'SUNNY_BLOOM'); assert.equal(calls[1].content, 'Explicit owner Event');
  assert.equal(state.content, ''); assert.equal(state.result.event.emotionStatus, 'FAILED');
  assert.equal(gardenRefreshes, 1);

});

test('current Event displays only its canonical Flower, retains old pending flowers, and refreshes without creating duplicates', async () => {
  const hooks = hookHarness();
  const session = { user: { id: 'owner' } };
  const event = { id: 'event-new', primaryGardenMood: 'FIRE_BLOOM', localDate: '2026-09-30',
    secondaryEmotions: ['fear', 'disappointment'], emotionStatus: 'SUCCESS' };
  const flower = { id: 'flower-new', userId: 'owner', sourceEventId: event.id, name: 'Tulip',
    mood: 'FIRE_BLOOM', speciesCode: 'TULIP', img: '🌷', createdAt: '2026-09-30T12:00:00Z', supportCount: 0 };
  const canonical = { ...flower, sourceEvent: { secondaryEmotions: event.secondaryEmotions } };
  const oldPending = { ...canonical, id: 'flower-old-pending', sourceEventId: 'event-old',
    sourceEvent: { secondaryEmotions: [] } };
  const storedFlowers = [oldPending];
  const oldSnapshot = JSON.stringify(oldPending);
  let posts = 0, failRefresh = false;
  let gardenReads = 0, reconcile, reconciliationStarted;
  const started = new Promise(resolve => { reconciliationStarted = resolve; });
  const { api, load } = setup(async (url, options) => {
    if (url === '/events') {
      posts++;
      assert.equal(JSON.parse(options.body).primaryGardenMood, 'FIRE_BLOOM');
      storedFlowers.push(canonical);
      return response({ event, flower, memoryJob: null }, 201);
    }
    if (url === `/events/${event.id}`) return response(event);
    assert.equal(url, '/users/owner/garden');
    if (failRefresh) throw new Error('Temporary Garden failure');
    if (++gardenReads === 1) return response({ flowers: [...storedFlowers] });
    if (gardenReads === 2) {
      reconciliationStarted();
      return new Promise(resolve => { reconcile = () => resolve(response({ flowers: [...storedFlowers] })); });
    }
    return response({ flowers: [...storedFlowers].reverse() });
  }, {
    '../services/auth': { useAuth: () => ({ session }) },
    'expo-router': { router: { navigate() {} } },
  }, hooks.react);
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  const { useEventJournal } = load('../../../hooks/useEventJournal');
  let state = hooks.mount(() => useEventJournal());
  state = await hooks.flush();
  assert.equal(state.flowers.length, 0, 'An old pending flower is not a current Event result');
  state.setContent('Synthetic verification Event'); state.setMood('FIRE_BLOOM');
  state = await hooks.flush();
  const saving = state.saveEvent(); await started;
  state = await hooks.flush();
  assert.equal(state.result.event.secondaryEmotions.join(', '), 'fear, disappointment');
  assert.equal(state.flowers.length, 0, 'Do not insert the incomplete POST Flower as None');
  reconcile(); await saving; state = await hooks.flush();
  assert.equal(gardenReads, 2, 'Canonical reconciliation is automatic, without manual Refresh');
  assert.deepEqual(Array.from(state.flowers, item => item.id), [flower.id]);
  assert.equal(state.flowers[0].sourceEvent.secondaryEmotions.join(', '), 'fear, disappointment');
  assert.equal(storedFlowers.length, 2);
  assert.equal(JSON.stringify(storedFlowers[0]), oldSnapshot, 'Old unplanted flower remains stored unchanged');

  const panelHooks = hookHarness();
  const { load: panelLoad } = setup(async () => { throw Error('Unexpected artwork request'); }, {
    '../../hooks/useEventJournal': { useEventJournal: () => state },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable',
      Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: styles => styles } },
    './FeatureUI': { FEATURE_COLORS: {}, FeatureActionButton: 'Action', FeatureSection: 'Section', ui: {} },
  }, panelHooks.react);
  const panel = panelHooks.mount(() => panelLoad('../../features/EventsPanel').EventsPanel({ onClose() {} }));
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') { nodes.push(node); visit(node.props?.children); }
  }
  visit(panel);
  const labels = nodes.filter(node => node.type === 'Text' && Array.isArray(node.props.children) &&
    node.props.children[0] === 'AI emotion suggestions (not a diagnosis): ').map(node => node.props.children[1]);
  assert.deepEqual(labels, ['fear, disappointment', 'fear, disappointment']);
  assert.equal(nodes.some(node => node.type === 'Image' && node.props.source?.uri), false, 'Backend emoji is artwork, not a URL');
  assert.equal(nodes.some(node => node.type === 'Text' && node.props.children === '🌷'), true);
  assert.equal(nodes.some(node => node.type === 'Text' && node.props.children === 'Your flower'), true);
  assert.deepEqual(nodes.filter(node => node.type?.name === 'EventSection' && node.key).map(node => node.key), [flower.id]);

  await state.refresh(); state = await hooks.flush();
  assert.deepEqual(Array.from(state.flowers, item => item.id), [flower.id], 'Garden ordering cannot change the current result');
  assert.equal(state.flowers[0].sourceEvent.secondaryEmotions.join(', '), labels[1], 'Later Garden refresh stays consistent');
  await state.refreshEventStatus(); state = await hooks.flush();
  assert.deepEqual(Array.from(state.flowers, item => item.id), [flower.id], 'Event status refresh retains the same flower');
  failRefresh = true;
  await state.refresh(); state = await hooks.flush();
  assert.equal(state.error, 'Temporary Garden failure');
  assert.equal(state.loading, false);
  assert.deepEqual(Array.from(state.flowers, item => item.id), [flower.id], 'A failed refresh preserves the current flower');
  failRefresh = false;
  await state.refresh(); state = await hooks.flush();
  assert.equal(state.error, '');
  assert.deepEqual(Array.from(state.flowers, item => item.id), [flower.id]);
  assert.equal(posts, 1, 'Refreshing does not create another Event or Flower');
  assert.equal(storedFlowers.length, 2);
  assert.equal(JSON.stringify(storedFlowers[0]), oldSnapshot);
});

test('native Friends loads existing data and supports search, send, accept, reject and confirmed removal using authenticated APIs', async () => {
  const bob = { id: 'bob', name: 'Bob', avatar: '🐦' }, cara = { id: 'cara', name: 'Cara' };
  const dan = { id: 'dan', name: 'Dan' }, erin = { id: 'erin', name: 'Erin' }, frank = { id: 'frank', name: 'Frank' };
  let friends = [bob], incoming = [cara, dan].map(user => ({ id: `request-${user.id}`, senderId: user.id,
    receiverId: 'owner', status: 'pending', sender: user }));
  const outgoing = [{ id: 'request-erin', senderId: 'owner', receiverId: erin.id, status: 'pending', receiver: erin }];
  const calls = [];
  const panel = friendsHarness(async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url === '/users/owner/friends') return response([...friends]);
    if (url === '/friends/requests/owner') return response({ incoming: [...incoming], outgoing: [...outgoing] });
    if (url.startsWith('/users/') && url.endsWith('/garden')) return response({ owner: { id: url.split('/')[2] }, flowers: [] });
    if (url === '/users/search?name=Frank%20%26%20friends') return response([{ id: 'owner', name: 'Self' }, bob, cara, erin, frank]);
    if (url === '/friends/request') {
      assert.deepEqual(JSON.parse(options.body), { receiverId: frank.id });
      const request = { id: 'request-frank', senderId: 'owner', receiverId: frank.id, status: 'pending', receiver: frank };
      outgoing.push(request); return response({ request, message: 'Friend request sent' }, 201);
    }
    if (url === '/friends/requests/request-cara/accept') {
      assert.deepEqual(JSON.parse(options.body), {});
      friends.push(cara); incoming = incoming.filter(item => item.senderId !== cara.id);
      return response({ message: 'Friend request accepted' });
    }
    if (url === '/friends/requests/request-dan/reject') {
      incoming = incoming.filter(item => item.senderId !== dan.id);
      return response({ message: 'Friend request rejected' });
    }
    if (url === '/friends/remove') {
      assert.deepEqual(JSON.parse(options.body), { friendId: bob.id });
      friends = friends.filter(friend => friend.id !== bob.id); return response({ message: 'Friend removed successfully' });
    }
    throw Error(`Unexpected Friends request: ${url}`);
  });
  await panel.flush();
  // Add Friends opens on Requests → Received; Sent lists what the owner asked for.
  assert.match(panel.text(), /Cara/); assert.match(panel.text(), /Dan/); assert.doesNotMatch(panel.text(), /Erin/);
  await panel.press('Sent'); assert.match(panel.text(), /Erin/); await panel.press('Received');
  await panel.search('  Frank & friends  ');
  assert.doesNotMatch(panel.text(), /Self/);
  for (const label of ['Already Friends', 'Incoming Request', 'Request Sent']) assert.equal(panel.button(label).props.disabled, true);
  const add = panel.button('Send request to Frank'); add.props.onPress(); add.props.onPress(); await panel.flush();
  assert.equal(calls.filter(call => call.url === '/friends/request').length, 1, 'Double press sends only one request');
  assert.equal(panel.nodes().filter(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Request Sent').length, 2);
  assert.match(panel.text(), /Friend request sent.*Frank/); await panel.press('OK'); assert.doesNotMatch(panel.text(), /Friend request sent/);
  await panel.press('Back'); assert.match(panel.text(), /Cara/);
  await panel.press('Accept Cara'); assert.equal(incoming.length, 1);
  await panel.press('Reject Dan'); assert.equal(incoming.length, 0);
  await panel.press('My friends'); assert.ok(panel.nodes().find(node => node.props?.testID === 'friend-cara'));
  assert.equal(panel.button('Remove Bob'), undefined, 'Remove only appears after Delete friends');
  await panel.press('Delete friends');
  await panel.press('Remove Bob'); assert.equal(calls.filter(call => call.url === '/friends/remove').length, 0);
  await panel.press('Cancel removal'); assert.equal(panel.button('Confirm removal'), undefined);
  await panel.press('Remove Bob'); await panel.press('Confirm removal');
  assert.equal(panel.button('Remove Bob'), undefined); assert.ok(panel.button('Remove Cara'));
  assert.equal(calls.filter(call => call.method === 'POST').length, 4);
  assert.ok(calls.filter(call => call.method === 'POST').every(call => !('userId' in call.body) && !('senderId' in call.body)));
});

test('native Friends preserves data after failed actions and allows loading/search retries', async () => {
  let failLoad = true, failSearch = true;
  const friend = { id: 'bob', name: 'Bob' };
  const panel = friendsHarness(async (url) => {
    if (url === '/users/owner/friends') return failLoad ? response({ error: 'Friends unavailable' }, 503) : response([friend]);
    if (url === '/friends/requests/owner') return response({ incoming: [], outgoing: [] });
    if (url.startsWith('/users/search')) return failSearch ? response({ error: 'Search unavailable' }, 503) : response([]);
    if (url === '/friends/remove') return response({ error: 'Removal failed' }, 503);
    throw Error(`Unexpected request: ${url}`);
  });
  await panel.flush(); assert.match(panel.text(), /Friends unavailable/);
  assert.equal(panel.button('Refresh Friends').props.disabled, false);
  failLoad = false; await panel.press('Refresh Friends');
  assert.equal(panel.button('Refresh Friends'), undefined, 'Refresh only shows after a failed load');
  await panel.press('My friends'); assert.ok(panel.nodes().find(node => node.props?.testID === 'friend-bob'));
  await panel.press('Requests');
  await panel.search('Nobody'); assert.match(panel.text(), /Search unavailable/);
  failSearch = false; await panel.press('Search'); assert.match(panel.text(), /No matching users found/);
  await panel.press('Back'); await panel.press('My friends');
  await panel.press('Delete friends'); await panel.press('Remove Bob'); await panel.press('Confirm removal');
  assert.match(panel.text(), /Removal failed/); assert.ok(panel.button('Remove Bob'));
  assert.equal(panel.button('Confirm removal').props.disabled, false);
});

test('native Friends discards old account responses and rejects stale actions after an account switch', async () => {
  let finishSearch, started;
  const ready = new Promise(resolve => { started = resolve; });
  const calls = [];
  const panel = friendsHarness(async url => {
    calls.push(url);
    if (url === '/users/owner/friends') return response([{ id: 'old-friend', name: 'Old Friend' }]);
    if (url === '/users/new-owner/friends') return response([{ id: 'new-friend', name: 'New Friend' }]);
    if (url.startsWith('/friends/requests/')) return response({ incoming: [], outgoing: [] });
    if (url.startsWith('/users/search')) { started(); return new Promise(resolve => { finishSearch = resolve; }); }
    throw Error(`Unexpected request: ${url}`);
  });
  await panel.flush();
  const searching = panel.search('Private result'); await ready;
  const oldSearch = panel.button('Search');
  panel.switchSession({ user: { id: 'new-owner' } }); await panel.flush();
  finishSearch(response([{ id: 'private-result', name: 'Old private result' }])); await searching; await panel.flush();
  assert.doesNotMatch(panel.text(), /Old private result/);
  await panel.press('My friends');
  assert.match(panel.text(), /New Friend/); assert.doesNotMatch(panel.text(), /Old Friend|Old private result/);
  const count = calls.length; oldSearch.props.onPress(); await panel.flush(); assert.equal(calls.length, count);
  panel.switchSession(null); await panel.flush(); assert.match(panel.text(), /Sign in/); assert.equal(calls.length, count);
});

test('Friends sidebar opens the native panel, deep links reuse it, and Return to Garden preserves Event/planting navigation', async () => {
  const hooks = hookHarness(); const navigation = []; let params = {}; let focused = 0;
  const planting = { activeMode: 'normal', selectedFlower: null, refreshGarden() {} };
  const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: styles => styles, absoluteFill: {} };
  let dimensions = { width: 400, height: 800 };
  native.Platform = { OS: 'ios' }; native.useWindowDimensions = () => dimensions;
  const { load } = setup(async () => { throw Error('Navigation must not call an API'); }, {
    'react-native': native, 'expo-symbols': { SymbolView: 'Symbol' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'expo-router': { router: { push: route => navigation.push(route), setParams: value => { params = { ...params, ...value }; } },
      useLocalSearchParams: () => params, Redirect: 'Redirect' },
    './planting/PlantingContext': { usePlanting: () => planting },
    '../../services/auth': { useAuth: () => ({ session: { user: { id: 'owner' } } }) },
    './EventsPanel': { EventsPanel: 'EventsPanel' },
    '../garden-test': { __esModule: true, default: 'FairyScreen' },
  }, hooks.react);
  const { GardenHud } = load('../GardenHud');
  const onFocusFairy = () => { focused++; };
  let hud = hooks.mount(() => GardenHud({ onFocusFairy }));
  for (const [width, height, mobile] of [[390, 844, true], [844, 390, true], [768, 1024, false], [1440, 900, false]]) {
    dimensions = { width, height }; hud = hooks.render();
    const bar = featureNodes(hud).find(node => node.props?.testID === 'main-navigation');
    assert.ok(bar);
    assert.equal(featureNodes(hud).some(node => node.props?.testID?.startsWith('desktop-navigation')), false);
    if (bar) assert.deepEqual(featureNodes(bar).filter(node => node.type === 'Pressable').map(node => node.props.testID),
      ['hud-events', 'hud-friends', 'hud-fairy', 'hud-profile']);
    for (const id of ['events', 'friends', 'profile']) {
      featureNodes(hud).find(node => node.props?.testID === `hud-${id}`).props.onPress();
      hud = await hooks.flush();
      const current = featureNodes(hud).find(node => node.type?.name === 'FeatureOverlay');
      assert.equal(current.props.feature?.id, id);
    }
  }
  featureNodes(hud).find(node => node.type?.name === 'FeatureOverlay').props.onOpenSettings();
  hud = await hooks.flush();
  assert.equal(featureNodes(hud).find(node => node.type?.name === 'FeatureOverlay').props.feature.id, 'settings');
  dimensions = { width: 400, height: 800 }; hud = hooks.render();
  featureNodes(hud).find(node => node.props?.testID === 'hud-friends').props.onPress(); hud = await hooks.flush();
  const overlay = featureNodes(hud).find(node => typeof node.type === 'function' && node.type.name === 'FeatureOverlay');
  assert.equal(overlay.props.feature.id, 'friends'); assert.equal(overlay.props.feature.status, 'REAL');
  const contentHooks = hookHarness();
  const { load: contentLoad } = setup(async () => response({}), {
    'react-native': native, 'expo-symbols': { SymbolView: 'Symbol' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../services/auth': { useAuth: () => ({ session: { user: { id: 'owner' } } }) },
  }, contentHooks.react);
  const Overlay = contentLoad('../../features/FeatureOverlay').FeatureOverlay;
  let panel = contentHooks.mount(() => Overlay(overlay.props));
  panel = await contentHooks.flush();
  featureNodes(panel).find(node => typeof node.type === 'function' && node.type.name === 'FeatureContent').props.onAddFriend();
  panel = await contentHooks.flush();
  const nativeContent = featureNodes(panel).find(node => typeof node.type === 'function' && node.type.name === 'FeatureContent');
  assert.equal(nativeContent.props.addingFriend, true, 'Friends action opens user search');
  const statelessReact = { ...contentHooks.react, useState: initial => [initial, () => {}], useEffect() {} };
  const statelessLoad = loadPlantingModules(undefined, statelessReact, undefined, false, {
    '../../hooks/useEventVoiceInput': { useEventVoiceInput: () => ({ phase: 'idle', active: false }) },
    'react-native': native, 'expo-symbols': { SymbolView: 'Symbol' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../services/auth': { useAuth: () => ({ session: { user: { id: 'owner' } } }) },
  });
  const staticPanel = statelessLoad('../../features/FeatureOverlay').FeatureOverlay(overlay.props);
  const staticContent = featureNodes(staticPanel).find(node => typeof node.type === 'function' && node.type.name === 'FeatureContent');
  const destination = staticContent.type(nativeContent.props);
  assert.equal(destination.type.name, 'FriendsPanel'); assert.equal(destination.key, 'owner');
  featureNodes(panel).find(node => node.props?.title === 'Return to Garden' || node.props?.accessibilityLabel === 'Return to Garden').props.onPress(); hud = await hooks.flush();
  assert.equal(featureNodes(hud).find(node => node.type === overlay.type).props.feature, undefined);
  assert.equal(navigation.length, 0, 'Garden stays on its existing route');
  featureNodes(hud).find(node => node.props?.testID === 'hud-events').props.onPress(); hud = await hooks.flush();
  assert.equal(featureNodes(hud).find(node => node.type === overlay.type).props.feature.id, 'events');
  assert.equal(featureNodes(hud).find(node => node.type === overlay.type).props.onGardenChanged, planting.refreshGarden);
  planting.activeMode = 'plant'; assert.equal(hooks.render(), null);
  planting.activeMode = 'normal'; params = { feature: 'friends' }; hud = hooks.render(); hud = await hooks.flush();
  assert.equal(featureNodes(hud).find(node => node.type === overlay.type).props.feature.id, 'friends');
  assert.equal(params.feature, undefined);
  params = { feature: 'friends' };
  assert.equal(load('../../../app/feature/[feature]').default().props.href.params.feature, 'friends');
  params = { feature: 'fairy' };
  assert.equal(load('../../../app/feature/[feature]').default().props.href.params.feature, 'fairy');
  params = {}; hud = hooks.render();
  featureNodes(hud).find(node => node.props?.testID === 'hud-fairy').props.onPress();
  hud = await hooks.flush();
  assert.deepEqual(navigation, []); assert.equal(focused, 1);
  assert.equal(featureNodes(hud).find(node => node.type === overlay.type).props.feature, undefined);
  params = { feature: 'fairy' }; hooks.render(); await hooks.flush();
  assert.deepEqual(navigation, []); assert.equal(focused, 2);
  assert.equal(params.feature, undefined);
});

test('confirmed Friends retain visible Home icons and use persisted privacy metadata without probing Garden contents', async () => {
  const navigation = [], calls = []; let closes = 0, alexAllowed = true;
  const friendsApi = async url => {
    calls.push(url);
    if (url === '/users/owner/friends') return response([
      { id: 'alex', name: 'Alex Chen', accountId: 'alex', allowGardenVisits: alexAllowed }, { id: 'jenny', name: 'Jenny Li', accountId: 'jenny', allowGardenVisits: false },
      { id: 'offline', name: 'Offline Friend' },
    ]);
    if (url === '/friends/requests/owner') return response({ incoming: [], outgoing: [] });
    throw Error(`Unexpected permission call: ${url}`);
  };
  const extras = { 'expo-router': { router: { push: route => { navigation.push(route); closes++; } } } };
  const panel = friendsHarness(friendsApi, undefined, extras);
  await panel.flush(); await panel.press('My friends');
  assert.match(panel.text(), /@alex/); assert.match(panel.text(), /@jenny/);
  for (const id of ['alex', 'jenny', 'offline']) {
    const home = panel.nodes().find(node => node.props?.testID === `visit-${id}`);
    assert.ok(home); assert.ok(featureNodes(home).some(node => node.type === 'Image' && node.props.source.endsWith('garden-house.png')));
    assert.equal(home.props.disabled, id !== 'alex');
    if (id !== 'alex') assert.equal(home.props.onPress, undefined, 'Disabled homes have no click handler');
  }
  await panel.press("Visit Alex Chen's Garden");
  assert.deepEqual(JSON.parse(JSON.stringify(navigation)), [{ pathname: '/visit/[ownerId]', params: { ownerId: 'alex' } }]);
  assert.equal(closes, 1);
  // The list reloads each time Friends opens, so a friend who closed their Garden shows on the next open.
  alexAllowed = false; const reopened = friendsHarness(friendsApi, undefined, extras); await reopened.flush(); await reopened.press('My friends');
  const disabledHome = reopened.nodes().find(node => node.props?.testID === 'visit-alex');
  assert.equal(disabledHome.props.disabled, true); assert.equal(disabledHome.props.onPress, undefined);
  assert.ok(calls.every(url => !url.includes('/garden')), 'The list makes no Garden content or per-friend access probes');
  const filter = panel.nodes().find(node => node.props?.accessibilityLabel === 'Search friends');
  filter.props.onChangeText('jenny'); await panel.flush();
  assert.ok(panel.nodes().find(node => node.props?.testID === 'friend-jenny'));
  assert.equal(panel.nodes().find(node => node.props?.testID === 'friend-alex'), undefined);
});

test('Friends: Delete friends swaps Homes for remove and report, and Visitors shows the Garden visit log', async () => {
  const calls = [];
  const panel = friendsHarness(async url => {
    calls.push(url);
    if (url === '/users/owner/friends') return response([{ id: 'luna', name: 'Luna', accountId: 'PP1', allowGardenVisits: true }]);
    if (url === '/friends/requests/owner') return response({ incoming: [], outgoing: [] });
    throw Error(`Unexpected request: ${url}`);
  });
  await panel.flush(); await panel.press('My friends');
  const has = id => Boolean(panel.nodes().find(node => node.props?.testID === id));
  // The ⚠ circle is SafetyActions' trigger for that friend.
  const report = () => panel.nodes().find(node => node.props?.userId === 'luna' && typeof node.props.trigger === 'function');
  assert.ok(has('visit-luna')); assert.equal(panel.button('Remove Luna'), undefined); assert.equal(report(), undefined);
  await panel.press('Delete friends');
  assert.equal(has('visit-luna'), false); assert.ok(panel.button('Remove Luna')); assert.ok(report());
  await panel.press('Done'); assert.ok(has('visit-luna'));
  assert.ok(calls.every(url => !url.includes('/garden')), 'Visitors load only when that tab opens');
  panel.nodes().find(node => node.props?.accessibilityRole === 'tab' && featureText(node).includes('Visitors')).props.onPress();
  await panel.flush();
  const log = panel.nodes().find(node => node.type?.name === 'GardenVisitLog');
  assert.ok(log); assert.equal(log.props.ownerId, 'owner'); assert.equal(has('friend-luna'), false);
});

test('Garden visit route rechecks access, uses the existing visitor contract and returns to My Garden', async () => {
  const hooks = hookHarness(); let ownerId = 'alex', allow = true;
  const calls = [], navigation = [];
  const native = { ActivityIndicator: 'Spinner', Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles } };
  const { api, load } = setup(async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (url === '/users/alex/garden-access') return allow ? response({ canVisit: true }) : response({ error: 'Private' }, 403);
    if (url === '/users/jenny/garden-access') return response({ error: 'Private' }, 403);
    if (url === '/visit' || url === '/leave') return response({ success: true });
    throw Error(`Unexpected visit call: ${url}`);
  }, {
    'react-native': native, 'react-native-gesture-handler': { GestureHandlerRootView: 'Root' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    'expo-router': { router: { dismissTo: route => navigation.push(route) }, useLocalSearchParams: () => ({ ownerId }) },
    '../../services/auth': { useAuth: () => ({ session: { user: { id: 'owner' } } }) },
    '../../components/garden/GardenScene': { __esModule: true, default: 'GardenScene' },
    '../../components/features/FeatureUI': { FEATURE_COLORS: {}, FeatureActionButton: 'Action', ui: {} },
  }, hooks.react);
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  const Screen = load('../../../app/visit/[ownerId]').default;
  let tree = hooks.mount(Screen); tree = await hooks.flush();
  const garden = featureNodes(tree).find(node => node.type === 'GardenScene');
  assert.ok(garden); assert.equal(garden.props.gardenOwnerUserId, 'alex');
  assert.equal(garden.props.session.user.id, 'owner'); assert.equal(garden.props.readOnly, true);
  assert.equal(garden.props.backendMode, true);
  assert.deepEqual(calls.slice(0, 2).map(call => call.url), ['/users/alex/garden-access', '/visit']);
  assert.deepEqual(calls[1].body, { hostUserId: 'alex' });
  const home = featureNodes(tree).find(node => node.props?.testID === 'visitor-return-home');
  assert.equal(home.props.accessibilityLabel, 'Return to My Garden');
  assert.ok(featureNodes(home).some(node => node.type === 'Image' && node.props.source.endsWith('visitor-home-transparent.png')));
  assert.doesNotMatch(featureText(tree), /Visiting a friend|Read only/);
  home.props.onPress();
  assert.deepEqual(navigation, ['/']);
  ownerId = 'jenny'; tree = hooks.render(); tree = await hooks.flush();
  assert.ok(calls.some(call => call.url === '/leave' && call.body.hostUserId === 'alex'));
  assert.equal(featureNodes(tree).find(node => node.type === 'GardenScene'), undefined);
  assert.match(featureText(tree), /private or unavailable/);
  assert.equal(featureNodes(tree).find(node => node.props?.testID === 'visitor-return-home'), undefined);
  assert.equal(calls.filter(call => call.url === '/visit').length, 1, 'Denied route never starts a visit');
  ownerId = 'alex'; allow = false; hooks.render(); tree = await hooks.flush();
  assert.equal(featureNodes(tree).find(node => node.type === 'GardenScene'), undefined);
  assert.equal(calls.filter(call => call.url === '/visit').length, 1, 'A previously allowed Garden is rechecked on entry');
});

test('visitor Garden projection strips private Event and Journal data without using owner placements', async () => {
  const { api, load } = setup(async () => response({ owner: { id: 'alex' }, flowers: [{
    id: 'flower-alex', userId: 'alex', name: 'Tulip', mood: 'FIRE_BLOOM', sourceEventId: 'private-event',
    sourceEvent: { secondaryEmotions: ['fear'] }, event: 'Private text', dailyCheckInId: 'private-checkin',
  }] }));
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  const flowers = await load('../../../services/garden').loadGarden('alex', 'owner');
  assert.equal(flowers[0].sourceType, 'SOCIAL'); assert.equal(flowers[0].sourceEventId, undefined);
  assert.equal(flowers[0].dailyCheckInId, undefined); assert.equal(flowers[0].event, undefined);
  assert.equal(flowers[0].secondaryEmotions.length, 0);
});

test('Settings exposes persisted Garden privacy, preserves failed saves and prevents duplicate or stale updates', async () => {
  const hooks = hookHarness(), calls = []; let ownerId = 'owner', allowed = true, failSave = false;
  const { api, load } = setup(async (url, options) => {
    calls.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
    assert.equal(url, '/users/me/garden-privacy');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (options.method === 'PATCH') {
      if (failSave) return response({ error: 'Save unavailable' }, 503);
      assert.deepEqual(Object.keys(JSON.parse(options.body)), ['allowGardenVisits']);
      allowed = JSON.parse(options.body).allowGardenVisits;
    }
    return response({ allowGardenVisits: allowed });
  }, {
    'react-native': { ActivityIndicator: 'Spinner', Switch: 'Switch', Text: 'Text', View: 'View' },
    '../../services/auth': { useAuth: () => ({ session: { user: { id: ownerId } } }) },
    './FeatureUI': { FEATURE_COLORS: {}, FeatureActionButton: 'Action', FeatureSection: 'Section', ui: {} },
  }, hooks.react);
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  const Settings = load('../../features/GardenPrivacySettings').GardenPrivacySettings;
  let tree = hooks.mount(Settings); tree = await hooks.flush();
  const toggle = () => featureNodes(tree).find(node => node.type === 'Switch');
  assert.equal(toggle().props.accessibilityLabel, 'Allow friends to visit my garden');
  assert.equal(toggle().props.value, true);
  toggle().props.onValueChange(false); toggle().props.onValueChange(false); tree = await hooks.flush();
  assert.equal(toggle().props.value, false);
  assert.equal(calls.filter(call => call.method === 'PATCH').length, 1);
  toggle().props.onValueChange(true); tree = await hooks.flush(); assert.equal(toggle().props.value, true);
  failSave = true; toggle().props.onValueChange(false); tree = await hooks.flush();
  assert.equal(toggle().props.value, true, 'Failed save keeps the persisted ON state');
  assert.match(featureText(tree), /Save unavailable/);
  const staleToggle = toggle(); ownerId = 'other'; tree = hooks.render();
  const before = calls.length; staleToggle.props.onValueChange(false);
  assert.equal(calls.length, before, 'Account switch rejects callbacks from the previous account');
  tree = await hooks.flush();
});

test('the existing Settings panel contains the account-scoped Garden privacy control', () => {
  const react = { ...hookHarness().react, useState: initial => [initial, () => {}], useEffect() {} };
  const { load } = setup(async () => assert.fail('Rendering the overlay does not read an API'), {
    'react-native': { Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      StyleSheet: { create: styles => styles }, useWindowDimensions: () => ({ width: 400, height: 800 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-symbols': { SymbolView: 'Symbol' },
    './EventsPanel': { EventsPanel: 'EventsPanel' },
    '../../services/auth': { useAuth: () => ({ session: { user: { id: 'owner', name: 'Alex Chen' } } }) },
  }, react);
  const feature = load('../../../services/featureCatalog').gardenFeature('settings');
  const tree = load('../../features/FeatureOverlay').FeatureOverlay({ feature, onClose() {} });
  const content = featureNodes(tree).find(node => node.type?.name === 'FeatureContent');
  const settings = featureNodes(content.type(content.props)).find(node => node.type?.name === 'GardenPrivacySettings');
  assert.ok(settings); assert.equal(settings.key, 'owner');
});

test('Flower artwork adapter rejects emoji URLs while preserving public image paths without auth material', () => {
  const { api, load } = setup(async () => { throw Error('Artwork must not request a private API'); });
  api.configureApi({ apiBaseUrl: 'http://localhost:3107', getAccessToken: async () => 'test-token' });
  const { sourceFlowerImageUri } = load('flowerDetailApi');
  for (const image of ['🌷', '🥀', '🪻', '🌻', '🌼', '🌸', '🪷', '']) assert.equal(sourceFlowerImageUri(image), null);
  assert.equal(sourceFlowerImageUri('/flowers/tulip.png'), 'http://localhost:3107/flowers/tulip.png');
  assert.equal(sourceFlowerImageUri('https://art.example/tulip.webp'), 'https://art.example/tulip.webp');
  assert.equal(sourceFlowerImageUri('data:image/png;base64,test'), 'data:image/png;base64,test');
});

test('unsupported explicit species are safely unplantable without being reinterpreted', () => {
  const { load } = setup(async () => response({}));
  const collision = load('parentCollision').resolveParentCollision('UNAPPROVED_SPECIES', 'Sunflower');
  assert.equal(collision.status, 'UNRESOLVED'); assert.equal(collision.speciesCode, 'UNAPPROVED_SPECIES');
  const result = load('placementValidator').validateFlowerPlacement({ flowerId: 'unknown', month: 9,
    worldX: 100, worldY: 100, speciesCode: 'UNAPPROVED_SPECIES', existingPlacements: [] });
  assert.equal(result.isValid, false); assert.equal(result.reason, 'COLLISION_CLASS_UNRESOLVED');
});
test('missing artwork for unsupported species renders a safe placeholder', () => {
  const { load } = setup(async () => response({}), { '@shopify/react-native-skia': {
    Circle: 'Circle', Group: 'Group', Image: 'Image', useImage: () => null,
  } });
  const art = load('CanonicalFlowerArt');
  const rendered = art.CanonicalFlowerArt({ flower: { id: 'unknown', speciesCode: 'UNAPPROVED_SPECIES',
    worldX: 100, worldY: 100, flowerName: 'Unknown', supportCount: 0 } });
  assert.equal(rendered.props.children[0].type, 'Circle');
  assert.equal(art.CanonicalFlowerEffects({ flower: { worldX: 100, worldY: 100 } }), null);
});

test('panel background defaults dark, persists per account, reloads light and rolls back failed writes', async () => {
  const items = new Map(); let fail = false;
  const storage = { getItem: async key => items.get(key) ?? null, setItem: async (key, value) => {
    if (fail) throw Error('storage unavailable'); items.set(key, value);
  } };
  const mount = userId => {
    const hooks = hookHarness();
    const load = loadPlantingModules({}, hooks.react, storage);
    const module = load('../../features/PanelTheme');
    hooks.mount(() => module.PanelThemeProvider({ userId, children: null }));
    return { hooks, module, state: async () => (await hooks.flush()).props.value };
  };
  const owner = mount('owner'); let value = await owner.state();
  assert.equal(value.light, false); assert.equal(value.theme.background, '#103431');
  await value.setLight(true); value = await owner.state();
  assert.equal(value.theme.background, '#FAF5E8');
  assert.equal(items.get(owner.module.panelThemeStorageKey('owner')), 'light');
  assert.equal((await mount('owner').state()).light, true);
  assert.equal((await mount('other').state()).light, false);
  fail = true; await value.setLight(false); value = await owner.state();
  assert.equal(value.light, true); assert.match(value.error, /Unable to save/);
  fail = false; await value.setLight(false);
  assert.equal((await mount('owner').state()).light, false);
});

test('Event microphone follows both themes without affecting Save & Analyze', () => {
  const { load: themeLoad } = setup(async () => response({}));
  const { PANEL_THEMES } = themeLoad('../../features/PanelTheme');
  for (const theme of Object.values(PANEL_THEMES)) {
    const hooks = hookHarness();
    let saves = 0, voices = 0;
    const voice = { active: false, phase: 'idle', start: () => { voices++; } };
    const journal = { content: 'A little moment', mood: 'SUNNY_BLOOM', busy: false,
      flowers: [], placements: [], loading: false, saveEvent: () => { saves++; } };
    const { load } = setup(async () => { throw Error('Unexpected backend request'); }, {
      '../../hooks/useEventJournal': { useEventJournal: () => journal },
      './PanelTheme': { usePanelTheme: () => ({ theme }) },
      '../../hooks/useEventVoiceInput': { useEventVoiceInput: () => voice },
      'react-native': { ActivityIndicator: 'Spinner', Image: 'Image', Pressable: 'Pressable',
        Text: 'Text', TextInput: 'Input', View: 'View', StyleSheet: { create: styles => styles },
        Alert: { alert: () => {} } },
      './FeatureUI': { ui: {} },
    }, hooks.react);
    const { EventsPanel } = load('../../features/EventsPanel');
    const render = (props = {}) => featureNodes(hooks.mount(() => EventsPanel({ onClose() {}, ...props })));
    let nodes = render();
    const microphone = () => nodes.find(node => node.props?.accessibilityLabel === 'Voice input');
    const input = nodes.find(node => node.type === 'Input');
    const style = microphone().props.style({ pressed: false })[0];
    assert.equal(style.backgroundColor, theme.surface); assert.equal(style.borderColor, theme.gold);
    assert.ok(style.width >= 44 && style.height >= 44);
    assert.ok(input.props.style.paddingRight >= style.width + style.right);
    microphone().props.onPress(); assert.equal(voices, 1); assert.equal(saves, 0);
    assert.equal(journal.content, 'A little moment'); assert.equal(journal.mood, 'SUNNY_BLOOM');
    nodes = render();
    const save = nodes.find(node => node.props?.title === 'Save & Analyze');
    assert.equal(save.props.disabled, false); save.props.onPress(); assert.equal(saves, 1);
    voice.active = true; nodes = render();
    assert.equal(nodes.find(node => node.props?.title === 'Save & Analyze').props.disabled, true);
    journal.busy = true; nodes = render();
    assert.equal(microphone().props.disabled, true);
    assert.equal(voices, 1); assert.equal(saves, 1);
  }
});
