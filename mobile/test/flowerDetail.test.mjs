import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const placementKey = 'petalpal_flower_placements_v1:visitor';
const placement = {
  id: 'placement-jan', flowerId: 'fl-jan-01', journalEntryId: 'entry-fl-jan-01',
  ownerUserId: 'owner', plantedDate: '2026-01-15T10:00:00.000Z', month: 1,
  landId: 'Land01', worldX: 100, worldY: 100, scale: 1, rotation: 0,
  placementVersion: 1, flowerName: 'pink', mood: 'Cached mood', supportCount: 2,
  notes: 'Cached memory', meaning: 'Cached meaning',
};
const supportState = {
  localDate: '2026-09-28', timezone: 'America/Vancouver', supportedToday: false,
  canSupport: true, isOwner: false,
};
const source = {
  id: placement.flowerId, userId: 'owner', name: 'Cherry Blossom', mood: 'Peaceful',
  event: 'Prototype memory', meaning: 'Hope and renewal', img: 'pink.png', supportCount: 7,
  journalEntryId: 'backend-journal',
  dailyCheckIn: { journal: { id: 'backend-journal', content: 'Existing journal reflection' } },
  messages: [
    { id: 'message-1', author: 'Petal', text: 'You are doing well' },
    { id: 'message-2', senderName: 'Bloom', text: 'Keep growing', pending: true },
  ],
  supportState,
};
const monthData = { MONTH_REGION_METAS: { 1: { monthName: 'January', landId: 'Land01' } } };
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  const reads = [], writes = [];
  return {
    items, reads, writes,
    get length() { return items.size; },
    key(index) { return [...items.keys()][index] ?? null; },
    getItem(key) { reads.push(key); return items.get(key) ?? null; },
    setItem(key, value) { writes.push({ key, value }); items.set(key, value); },
    removeItem(key) { writes.push({ key, removed: true }); items.delete(key); },
  };
}

// Stable hooks execute source callbacks and effect cleanup without a native renderer.
export { hookHarness } from './hookHarness.mjs';
import { hookHarness } from './hookHarness.mjs';

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}
function textContent(tree) {
  if (Array.isArray(tree)) return tree.map(textContent).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree && typeof tree === 'object' ? textContent(tree.props?.children) : '';
}
function button(tree, label) {
  return elements(tree).find((element) => element.type === 'Pressable' && textContent(element) === label);
}
function modalHarness(overrides = {}, events = { readEvent: async () => { throw new Error('readEvent not expected'); } }, locale = 'en') {
  const calls = { close: 0, support: [], messages: [], deletes: 0 };
  const value = {
    selectedFlower: placement, selectedFlowerIsOwner: false, currentUserId: 'visitor',
    flowerDetailSource: source, isDetailLoading: false, isDetailWorking: false, detailError: '',
    closeFlowerDetail: () => { calls.close++; },
    supportFlower: (id) => { calls.support.push(id); },
    leaveMessage: async (text) => { calls.messages.push(text); return true; },
    deleteSelectedFlower: async () => { calls.deletes++; return true; },
    ...overrides,
  };
  const hooks = hookHarness(() => value);
  const native = Object.fromEntries(['Image', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View']
    .map((name) => [name, name]));
  native.StyleSheet = { create: (styles) => styles, absoluteFill: {} };
  const load = loadPlantingModules(undefined, hooks.react, undefined, true, {
    './PlantingContext': { usePlanting: () => value }, 'react-native': native,
    './plantingRegionData': monthData, '../../../services/events': events,
    '../../../services/locale': { useAppLocale: () => locale },
  });
  const Modal = load('FlowerDetailModal').default;
  hooks.mount(() => Modal());
  return { calls, value, hooks, load };
}

async function providerHarness({ userId = 'visitor', flower = placement, api = {} } = {}) {
  const storage = memoryStorage({ [placementKey]: JSON.stringify([flower]) });
  const hooks = hookHarness();
  const calls = { load: [], support: [], messages: [], deletes: [] };
  const apiStub = {
    loadFlowerSession: async () => null,
    loadFlowerSource: async (...args) => { calls.load.push(args); return source; },
    giveFlowerSupport: async (...args) => { calls.support.push(args); return source; },
    leaveFlowerMessage: async (...args) => { calls.messages.push(args); return source; },
    deleteSourceFlower: async (...args) => { calls.deletes.push(args); },
    subscribeToFlowerUpdates: () => () => {},
    ...api,
  };
  const load = loadPlantingModules(storage, hooks.react, undefined, true, {
    './flowerDetailApi': apiStub,
    './approvedPlantingMasks': { getApprovedMonthCentroid: () => ({ x: 100, y: 100 }) },
    './placementValidator': { validateFlowerPlacement: () => ({ isValid: true }) },
    './plantingRegionData': monthData,
  });
  const persistence = load('plantingPersistence');
  await persistence.scopeFlowerPlacements(userId);
  if (userId) await persistence.saveFlowerPlacements([flower]);
  storage.reads.length = 0; storage.writes.length = 0;
  const Provider = load('PlantingContext').PlantingProvider;
  const props = {
    children: null, gardenOwnerUserId: 'owner',
    ...(userId ? { session: { user: { id: userId, name: 'Visitor' } } } : {}),
  };
  hooks.mount(() => {
    const wrapper = Provider(props);
    return wrapper.type(wrapper.props).props.value;
  });
  await hooks.flush();
  return { hooks, calls, storage, persistence, props };
}

test('detail data resolves the existing journal and legacy journal ID without inventing content', () => {
  const data = loadPlantingModules()('flowerDetailData');
  const local = data.resolveFlowerDetail(placement);
  assert.equal(local.journalEntryId, 'entry-jan-01');
  assert.equal(local.memory, 'A quiet morning reflection in the January meadow. Calm and focused.');
  assert.equal(local.mood, 'Peaceful');
  assert.equal(local.meaning, 'Cached meaning');
  const remote = data.resolveFlowerDetail(placement, source);
  assert.equal(remote.memory, 'Existing journal reflection');
  assert.equal(remote.journalEntryId, 'backend-journal');
  assert.equal(remote.name, 'Cherry Blossom');
  assert.equal(remote.meaning, 'Hope and renewal');
  assert.equal(remote.supportCount, 7);
  assert.deepEqual(plain(remote.messages), source.messages);
  assert.equal(data.resolveFlowerDetail(placement, { ...source, dailyCheckIn: null }).memory, 'Prototype memory');
  assert.equal(data.resolveFlowerDetail(placement, { ...source, id: 'another-flower' }).name, 'pink');
});

test('source merges keep received counts monotonic and personal daily state out of broadcasts', () => {
  const { mergeFlowerSource } = loadPlantingModules()('flowerDetailData');
  const received = mergeFlowerSource(source, { ...source, supportCount: 12,
    supportState: { ...supportState, supportedToday: true, canSupport: false } }, 'broadcast');
  assert.equal(received.supportCount, 12);
  assert.equal(received.supportState.supportedToday, false);
  assert.equal(received.supportState.canSupport, true);
  const supported = { ...received, supportState: { ...supportState, supportedToday: true, canSupport: false } };
  const stale = mergeFlowerSource(supported, source, 'refresh');
  assert.equal(stale.supportCount, 12);
  assert.equal(stale.supportState.supportedToday, true);
  assert.equal(stale.supportState.canSupport, false);
  const nextDay = mergeFlowerSource(supported,
    { ...source, supportState: { ...supportState, localDate: '2026-09-29' } }, 'refresh');
  assert.equal(nextDay.supportState.supportedToday, false);
  assert.equal(nextDay.supportState.localDate, '2026-09-29');
  assert.equal(mergeFlowerSource(null, source, 'broadcast').supportState, undefined);
});

test('ownership trusts explicit flower identity and never grants visitors the local editing fallback', () => {
  const { ownsFlower } = loadPlantingModules()('flowerDetailData');
  assert.equal(ownsFlower(placement, { currentUserId: 'owner', localOwner: false }), true);
  assert.equal(ownsFlower(placement, { currentUserId: 'visitor', localOwner: true }), false);
  const legacy = { ...placement, ownerUserId: undefined };
  assert.equal(ownsFlower(legacy, { gardenOwnerUserId: 'owner', currentUserId: 'visitor', localOwner: false }), false);
  assert.equal(ownsFlower(legacy, { localOwner: true }), true);
  assert.equal(ownsFlower(legacy, { localOwner: false }), false);
});

test('owner modal shows received Support, Memory, Meaning and messages with Delete only; no Adjust', async () => {
  const { calls, hooks, load } = modalHarness({ selectedFlowerIsOwner: true, currentUserId: 'owner' });
  const { DeleteFlowerDialog } = load('DeleteFlowerDialog');
  const dialog = (tree) => elements(tree).find((node) => node.type === DeleteFlowerDialog);
  let tree = hooks.render();
  const content = textContent(tree);
  for (const text of ['CHERRY BLOSSOM', 'January Garden • Land01', 'Mood: Peaceful',
    'Memory', 'Existing journal reflection', 'Meaning', 'Hope and renewal',
    '♥ Support received: 7', 'Petal: You are doing well', 'Bloom: Keep growing (sending...)']) {
    assert.ok(content.includes(text), text);
  }
  assert.equal(button(tree, 'Give Support 💗'), undefined);
  assert.equal(elements(tree).some((node) => node.type === 'TextInput'), false);
  // A planted flower never moves: there is no Adjust or move control.
  assert.equal(elements(tree).some((node) => /adjust|move/i.test(textContent(node)) && node.type === 'Pressable'), false);
  assert.equal(dialog(tree).props.visible, false);
  button(tree, 'Delete Flower').props.onPress();
  tree = await hooks.flush();
  assert.equal(dialog(tree).props.visible, true);
  assert.equal(dialog(tree).props.flowerName, 'Cherry Blossom');
  dialog(tree).props.onCancel();
  tree = await hooks.flush();
  assert.equal(calls.deletes, 0);
  assert.equal(dialog(tree).props.visible, false);
  button(tree, 'Delete Flower').props.onPress();
  tree = await hooks.flush();
  await dialog(tree).props.onDelete();
  assert.equal(calls.deletes, 1);
  tree = await hooks.flush();
  assert.equal(dialog(tree).props.visible, false);
  tree = await hooks.flush();
  elements(tree).find((node) => node.type === 'Modal').props.onRequestClose();
  assert.equal(calls.close, 1);
});

for (const locale of ['en', 'zh-Hans']) test(`Delete Flower warns (permanent, no planting back) and needs DELETE typed: ${locale}`, async () => {
  const hooks = hookHarness();
  const native = Object.fromEntries(['Modal', 'Pressable', 'Text', 'TextInput', 'View'].map((name) => [name, name]));
  native.StyleSheet = { create: (styles) => styles, absoluteFill: {} };
  const load = loadPlantingModules(undefined, hooks.react, undefined, true, {
    'react-native': native, '../../../services/locale': { useAppLocale: () => locale } });
  const { DeleteFlowerDialog, DELETE_FLOWER_COPY } = load('DeleteFlowerDialog');
  const { FeatureActionButton } = load('../../features/FeatureUI');
  const copy = DELETE_FLOWER_COPY[locale];
  let deletes = 0, cancels = 0;
  hooks.mount(() => DeleteFlowerDialog({ visible: true, flowerName: 'Tulip', busy: false,
    onCancel: () => { cancels++; }, onDelete: () => { deletes++; } }));
  let tree = hooks.render();
  const text = textContent(tree);
  const final = (current) => elements(current).find((node) => node.type === FeatureActionButton && node.props.title === copy.delete);
  for (const line of [copy.warning, copy.quota, copy.typeLabel]) assert.ok(text.includes(line), line);
  if (locale === 'zh-Hans') {
    assert.match(copy.warning, /永久删除/); assert.match(copy.quota, /不会退还种花次数/);
    // Fully Chinese apart from the English phrase the owner types.
    for (const line of [copy.title, copy.warning, copy.quota, copy.what, copy.keep, copy.delete]) assert.doesNotMatch(line, /[A-Za-z]/, line);
    assert.match(copy.typeLabel, /DELETE/);
  } else {
    assert.match(copy.warning, /permanently deleted/); assert.match(copy.quota, /does not give back a planting/);
  }
  const input = elements(tree).find((node) => node.type === 'TextInput');
  assert.equal(input.props.placeholder, 'DELETE');
  assert.equal(final(tree).props.disabled, true);
  final(tree).props.onPress(); assert.equal(deletes, 0);
  for (const typed of ['delete', 'DELET', 'DELETE NOW']) {
    input.props.onChangeText(typed); tree = await hooks.flush();
    assert.equal(final(tree).props.disabled, true, typed);
  }
  elements(tree).find((node) => node.type === 'TextInput').props.onChangeText(' DELETE ');
  tree = await hooks.flush();
  assert.equal(final(tree).props.disabled, false);
  final(tree).props.onPress(); assert.equal(deletes, 1);
  elements(tree).find((node) => node.type === FeatureActionButton && node.props.title === copy.keep).props.onPress();
  assert.equal(cancels, 1);
});

test('visitor modal has Support/message controls, loaded daily state, and the existing 300-character form', async () => {
  const { calls, value, hooks, load } = modalHarness();
  const { DeleteFlowerDialog } = load('DeleteFlowerDialog');
  const dialog = (tree) => elements(tree).find((node) => node.type === DeleteFlowerDialog);
  let tree = hooks.render();
  assert.equal(button(tree, 'Give Support 💗').props.disabled, false);
  button(tree, 'Give Support 💗').props.onPress();
  assert.deepEqual(calls.support, [placement.flowerId]);
  assert.equal(button(tree, 'Delete Flower'), undefined);
  assert.equal(dialog(tree).props.visible, false);
  const input = elements(tree).find((node) => node.type === 'TextInput');
  assert.equal(input.props.maxLength, 300);
  assert.equal(input.props.multiline, true);
  assert.equal(input.props.placeholder, 'Leave a kind message...');
  assert.equal(button(tree, 'Leave Message').props.disabled, true);
  input.props.onChangeText('  A kind message  ');
  tree = await hooks.flush();
  await button(tree, 'Leave Message').props.onPress();
  tree = await hooks.flush();
  assert.deepEqual(calls.messages, ['A kind message']);
  assert.equal(elements(tree).find((node) => node.type === 'TextInput').props.value, '');
  value.flowerDetailSource = { ...source, supportState: { ...supportState, supportedToday: true, canSupport: false } };
  tree = hooks.render();
  assert.equal(button(tree, 'Supported today ✓').props.disabled, true);
  assert.equal(button(tree, 'Supported today ✓').props.accessibilityState.disabled, true);
  value.currentUserId = undefined;
  value.flowerDetailSource = source;
  tree = hooks.render();
  assert.equal(button(tree, 'Give Support 💗').props.disabled, true);
  assert.equal(elements(tree).find((node) => node.type === 'TextInput').props.editable, false);
  assert.ok(textContent(tree).includes('Sign in to interact with this flower.'));
});

test('modal displays actionable errors and restores a failed message draft', async () => {
  const { hooks } = modalHarness({
    detailError: 'The message could not be sent', leaveMessage: async () => false,
  });
  let tree = hooks.render();
  assert.ok(elements(tree).some((node) => node.props?.accessibilityRole === 'alert' &&
    textContent(node) === 'The message could not be sent'));
  elements(tree).find((node) => node.type === 'TextInput').props.onChangeText('  Please keep growing  ');
  tree = await hooks.flush();
  await button(tree, 'Leave Message').props.onPress();
  tree = await hooks.flush();
  assert.equal(elements(tree).find((node) => node.type === 'TextInput').props.value, 'Please keep growing');
});

test('API reuses the existing token and sends no caller supporter/date or local count on Support', async () => {
  const storage = memoryStorage({ petalPalAccessToken: 'existing-session-token' });
  const requests = [];
  const api = loadPlantingModules(storage, undefined, undefined, true, {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => source };
    },
  })('flowerDetailApi');
  api.configureFlowerSession({ apiBaseUrl: '', getAccessToken: async () => 'existing-session-token' });
  await api.giveFlowerSupport('owner /1', 'flower/2', { supporterUserId: 'forged', localDate: '1900-01-01' });
  assert.equal(requests[0].url, '/users/owner%20%2F1/flowers/flower%2F2/support');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer existing-session-token');
  assert.equal(requests[0].options.body, undefined);
  assert.equal(storage.reads.includes('petalPalAccessToken'), false);
  assert.deepEqual(storage.writes, []);
  await api.loadFlowerSource('owner', placement.flowerId);
  assert.equal(requests[1].options.method, 'GET');
  await api.leaveFlowerMessage('owner', placement.flowerId, '  Kindness  ');
  assert.deepEqual(JSON.parse(requests[2].options.body), { text: 'Kindness' });
  assert.throws(() => api.leaveFlowerMessage('owner', placement.flowerId, ' '), /empty/);
  assert.throws(() => api.leaveFlowerMessage('owner', placement.flowerId, 'x'.repeat(301)), /300/);
  api.configureFlowerSession({ apiBaseUrl: 'https://petalpal.example/', getAccessToken: async () => 'refreshed-token' });
  await api.loadFlowerSession();
  assert.equal(requests[3].url, 'https://petalpal.example/session?view=metadata');
  assert.equal(requests[3].options.headers.Authorization, 'Bearer refreshed-token');
});

test('API fails closed without a token and preserves backend errors and native token use', async () => {
  let requests = 0;
  const anonymousApi = loadPlantingModules(memoryStorage(), undefined, undefined, true, {
    fetch: async () => { requests++; throw new Error('must not fetch'); },
  })('flowerDetailApi');
  assert.equal(await anonymousApi.loadFlowerSession(), null);
  await assert.rejects(anonymousApi.giveFlowerSupport('owner', placement.flowerId), /Sign in/);
  await assert.rejects(anonymousApi.leaveFlowerMessage('owner', placement.flowerId, 'Hello'), /Sign in/);
  await assert.rejects(anonymousApi.deleteSourceFlower('owner', placement.flowerId), /Sign in/);
  assert.equal(requests, 0);
  const nativeKeys = [];
  const nativeApi = loadPlantingModules(undefined, undefined, {
    getItem: async (key) => { nativeKeys.push(key); return 'native-session-token'; },
  }, false, {
    fetch: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer native-session-token');
      return { ok: false, json: async () => ({ error: 'The server rejected this Support' }) };
    },
  })('flowerDetailApi');
  nativeApi.configureFlowerSession({ apiBaseUrl: '', getAccessToken: async () => 'native-session-token' });
  await assert.rejects(nativeApi.giveFlowerSupport('owner', placement.flowerId), /server rejected/);
  assert.deepEqual(nativeKeys, []);
});

test('authenticated socket subscription filters owner/flower events and disconnects on cleanup', async () => {
  const events = {}, emitted = [], connections = [], received = [];
  let disconnected = 0;
  const api = loadPlantingModules(memoryStorage({ petalPalAccessToken: 'existing-token' }),
    undefined, undefined, true, {
      'socket.io-client': {
        io: (url, options) => {
          connections.push({ url, options });
          return {
            on: (name, fn) => { events[name] = fn; },
            emit: (...args) => emitted.push(args),
            disconnect: () => { disconnected++; },
          };
        },
      },
    })('flowerDetailApi');
  api.configureFlowerSession({ apiBaseUrl: '', getAccessToken: async () => 'existing-token' });
  const unsubscribe = api.subscribeToFlowerUpdates('owner', placement.flowerId, (flower) => received.push(flower));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connections.length, 1);
  let handshake; connections[0].options.auth((value) => { handshake = value; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(handshake.token, 'existing-token');
  events.connect();
  assert.deepEqual(emitted, [['join-garden', 'owner']]);
  events.supportUpdated({ gardenOwnerId: 'somebody-else', flowerId: placement.flowerId, flower: source });
  events.messageAdded({ gardenOwnerId: 'owner', flowerId: 'another-flower', flower: source });
  assert.equal(received.length, 0);
  events.supportUpdated({ gardenOwnerId: 'owner', flowerId: placement.flowerId, flower: source });
  assert.equal(received[0], source);
  unsubscribe();
  assert.equal(disconnected, 1);
});

test('provider rejects self Support and visitor Delete without API calls or placement writes; there is no Adjust', async () => {
  const owner = await providerHarness({ userId: 'owner', api: {
    loadFlowerSource: async () => ({ ...source, supportState: { ...supportState, isOwner: true, canSupport: false } }),
  } });
  let flow = owner.hooks.render();
  flow.openFlowerDetail(placement); flow = await owner.hooks.flush();
  assert.equal(flow.selectedFlowerIsOwner, true);
  await flow.supportFlower(placement.flowerId); flow = await owner.hooks.flush();
  assert.match(flow.detailError, /own flower/);
  assert.deepEqual(owner.calls.support, []);
  assert.deepEqual(owner.storage.writes, []);
  const visitor = await providerHarness();
  flow = visitor.hooks.render();
  flow.openFlowerDetail(placement); flow = await visitor.hooks.flush();
  assert.equal(flow.selectedFlowerIsOwner, false);
  assert.equal(flow.startAdjusting, undefined);
  assert.equal(flow.activeMode, 'normal');
  assert.equal(flow.targetFlower, null);
  assert.equal(await flow.deleteSelectedFlower(), false);
  assert.deepEqual(visitor.calls.deletes, []);
  assert.deepEqual(visitor.storage.writes, []);
});

test('provider loads real daily state, applies authoritative Support, and never writes a local Support count', async () => {
  const pending = deferred();
  const provider = await providerHarness({ api: {
    giveFlowerSupport: async (...args) => { provider.calls.support.push(args); return pending.promise; },
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  assert.deepEqual(provider.calls.load, [['owner', placement.flowerId]]);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, false);
  const request = flow.supportFlower(placement.flowerId);
  flow = await provider.hooks.flush();
  assert.equal(flow.isDetailWorking, true);
  assert.equal(flow.flowerDetailSource.supportCount, 7);
  assert.equal(flow.placements[0].supportCount, 2);
  pending.resolve({ ...source, supportCount: 19,
    supportState: { ...supportState, supportedToday: true, canSupport: false } });
  await request; flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.supportCount, 19);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, true);
  assert.equal(flow.placements[0].supportCount, 19);
  assert.deepEqual(provider.storage.writes, []);
  assert.equal(JSON.parse(provider.storage.items.get(placementKey))[0].supportCount, 2);
});

test('provider leaves counts and saved records intact when Support fails', async () => {
  const provider = await providerHarness({ api: {
    giveFlowerSupport: async () => { throw new Error('Support failed'); },
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  await flow.supportFlower(placement.flowerId); flow = await provider.hooks.flush();
  assert.ok(flow.detailError);
  assert.equal(flow.isDetailWorking, false);
  assert.equal(flow.flowerDetailSource.supportCount, 7);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, false);
  assert.equal(flow.placements[0].supportCount, 2);
  assert.deepEqual(provider.storage.writes, []);
});

test('provider broadcast updates public fields without borrowing another viewer\'s Support eligibility', async () => {
  let broadcast;
  const provider = await providerHarness({ api: {
    subscribeToFlowerUpdates: (_owner, _flower, fn) => { broadcast = fn; return () => {}; },
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  broadcast({ ...source, supportCount: 14,
    supportState: { ...supportState, supportedToday: true, canSupport: false },
    messages: [...source.messages, { id: 'new-message', author: 'Another visitor', text: 'Bloom well' }] });
  flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.supportCount, 14);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, false);
  assert.equal(flow.flowerDetailSource.supportState.canSupport, true);
  assert.equal(flow.flowerDetailSource.messages.at(-1).text, 'Bloom well');
  assert.deepEqual(provider.storage.writes, []);
});

test('provider restores failed messages and retains viewer Support state on authoritative message responses', async () => {
  let fail = true;
  const provider = await providerHarness({ api: {
    loadFlowerSource: async () => ({ ...source, supportState: { ...supportState, supportedToday: true, canSupport: false } }),
    leaveFlowerMessage: async (_owner, _flower, text) => {
      if (fail) throw new Error('Message request failed');
      return { ...source, supportState: undefined, messages: [{ id: 'real-message', author: 'Visitor', text }] };
    },
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  assert.equal(await flow.leaveMessage('  Keep blooming  '), false);
  flow = await provider.hooks.flush();
  assert.ok(flow.detailError);
  assert.deepEqual(plain(flow.flowerDetailSource.messages), source.messages);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, true);
  fail = false;
  assert.equal(await flow.leaveMessage('  Keep blooming  '), true);
  flow = await provider.hooks.flush();
  assert.equal(flow.detailError, '');
  const sent = flow.flowerDetailSource.messages.find((message) => message.id === 'real-message');
  assert.equal(sent.text, 'Keep blooming');
  assert.equal(sent.pending, undefined);
  assert.equal(flow.flowerDetailSource.messages.some((message) => message.pending), false);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, true);
  assert.deepEqual(provider.storage.writes, []);
});

test('closing details discards a late Support response instead of restoring a closed selection', async () => {
  const pending = deferred();
  const provider = await providerHarness({ api: { giveFlowerSupport: async () => pending.promise } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  const request = flow.supportFlower(placement.flowerId);
  flow = await provider.hooks.flush();
  flow.closeFlowerDetail(); flow = await provider.hooks.flush();
  assert.equal(flow.selectedFlower, null);
  pending.resolve({ ...source, supportCount: 8, supportState: { ...supportState, supportedToday: true } });
  await request; flow = await provider.hooks.flush();
  assert.equal(flow.selectedFlower, null);
  assert.equal(flow.flowerDetailSource, null);
  assert.equal(flow.detailError, '');
  assert.deepEqual(provider.storage.writes, []);
});

test('switching flowers discards a late message response and keeps the new flower source', async () => {
  const pending = deferred();
  const other = { ...placement, id: 'placement-other', flowerId: 'flower-other', journalEntryId: 'journal-other' };
  const otherSource = { ...source, id: other.flowerId, name: 'Sunflower', messages: [] };
  const provider = await providerHarness({ api: {
    loadFlowerSource: async (_owner, id) => id === other.flowerId ? otherSource : source,
    leaveFlowerMessage: async () => pending.promise,
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  const request = flow.leaveMessage('A message for the first flower');
  flow = await provider.hooks.flush();
  flow.openFlowerDetail(other); flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.id, other.flowerId);
  pending.resolve({ ...source, messages: [{ id: 'late', author: 'Visitor', text: 'Late message' }] });
  await request; flow = await provider.hooks.flush();
  assert.equal(flow.selectedFlower.flowerId, other.flowerId);
  assert.equal(flow.flowerDetailSource.id, other.flowerId);
  assert.equal(flow.flowerDetailSource.name, 'Sunflower');
  assert.deepEqual(provider.storage.writes, []);
});

test('switching selection discards a late detail GET without replacing the new flower\'s content', async () => {
  const pending = deferred();
  const other = { ...placement, id: 'placement-other', flowerId: 'flower-other' };
  const otherSource = { ...source, id: other.flowerId, name: 'Sunflower' };
  const provider = await providerHarness({ api: {
    loadFlowerSource: async (_owner, id) => id === other.flowerId ? otherSource : pending.promise,
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  assert.equal(flow.isDetailLoading, true);
  flow.openFlowerDetail(other); flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.name, 'Sunflower');
  pending.resolve(source); flow = await provider.hooks.flush();
  assert.equal(flow.selectedFlower.flowerId, other.flowerId);
  assert.equal(flow.flowerDetailSource.id, other.flowerId);
  assert.equal(flow.flowerDetailSource.name, 'Sunflower');
  assert.equal(flow.isDetailLoading, false);
});

test('known owner Delete calls the backend after a failed GET and does not remove locally on remote error', async () => {
  let remoteDeletes = 0;
  const provider = await providerHarness({ userId: 'owner', api: {
    loadFlowerSource: async () => { throw new Error('Detail unavailable'); },
    deleteSourceFlower: async (ownerId, flowerId) => {
      assert.equal(ownerId, 'owner'); assert.equal(flowerId, placement.flowerId);
      remoteDeletes++; throw new Error('Remote Delete unavailable');
    },
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  assert.equal(flow.selectedFlowerIsOwner, true);
  assert.equal(flow.flowerDetailSource, null);
  assert.equal(await flow.deleteSelectedFlower(), false);
  flow = await provider.hooks.flush();
  assert.equal(remoteDeletes, 1);
  assert.equal(flow.placements.length, 1);
  assert.equal(flow.selectedFlower.flowerId, placement.flowerId);
  assert.ok(flow.detailError);
  assert.deepEqual(provider.storage.writes, []);
});

test('later GET and Support responses retain live messages, dedupe existing IDs, and keep the live received count', async () => {
  const detailRequest = deferred(), supportRequest = deferred();
  let broadcast;
  const initialMessages = [source.messages[0],
    { createdAt: '2026-09-28T12:00:00Z', author: 'Dawn', text: 'A timestamped message' },
    { author: 'Friend', text: 'A message without an ID' }];
  const initialSource = { ...source, messages: initialMessages };
  const firstLive = { id: 'live-first', author: 'Blossom', text: 'Arrived while GET was pending' };
  const secondLive = { id: 'live-second', author: 'Leaf', text: 'Arrived while Support was pending' };
  const provider = await providerHarness({ api: {
    loadFlowerSource: async () => detailRequest.promise,
    giveFlowerSupport: async () => supportRequest.promise,
    subscribeToFlowerUpdates: (_owner, _flower, fn) => { broadcast = fn; return () => {}; },
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement);
  flow = provider.hooks.render();
  assert.equal(flow.isDetailLoading, true);
  broadcast({ ...initialSource, supportCount: 10, messages: [...initialMessages, firstLive],
    supportState: { ...supportState, supportedToday: true, canSupport: false } });
  flow = await provider.hooks.flush();
  detailRequest.resolve(initialSource); flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.supportCount, 10);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, false);
  assert.equal(flow.flowerDetailSource.messages.length, 4);
  assert.ok(flow.flowerDetailSource.messages.some((message) => message.id === 'live-first'));
  const support = flow.supportFlower(placement.flowerId);
  flow = await provider.hooks.flush();
  broadcast({ ...initialSource, supportCount: 15, messages: [...initialMessages, firstLive, secondLive] });
  flow = await provider.hooks.flush();
  supportRequest.resolve({ ...initialSource, supportCount: 11,
    supportState: { ...supportState, supportedToday: true, canSupport: false } });
  await support; flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.supportCount, 15);
  assert.equal(flow.placements[0].supportCount, 15);
  assert.equal(flow.flowerDetailSource.supportState.supportedToday, true);
  assert.equal(flow.flowerDetailSource.messages.length, 5);
  assert.ok(flow.flowerDetailSource.messages.some((message) => message.id === 'live-first'));
  assert.ok(flow.flowerDetailSource.messages.some((message) => message.id === 'live-second'));
  assert.deepEqual(provider.storage.writes, []);
});

test('a failed message removes only its own pending item and preserves live socket count/messages', async () => {
  const messageRequest = deferred();
  let broadcast;
  const provider = await providerHarness({ api: {
    leaveFlowerMessage: async () => messageRequest.promise,
    subscribeToFlowerUpdates: (_owner, _flower, fn) => { broadcast = fn; return () => {}; },
  } });
  let flow = provider.hooks.render();
  flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  const sending = flow.leaveMessage('My pending message');
  flow = await provider.hooks.flush();
  const ownPending = flow.flowerDetailSource.messages.find((message) => message.text === 'My pending message');
  assert.equal(ownPending.pending, true);
  const liveMessage = { id: 'live-during-send', author: 'Another visitor', text: 'A real live message' };
  broadcast({ ...source, supportCount: 21, messages: [...source.messages, liveMessage] });
  flow = await provider.hooks.flush();
  assert.ok(flow.flowerDetailSource.messages.some((message) => message.id === ownPending.id));
  messageRequest.reject(new Error('The pending message failed'));
  assert.equal(await sending, false); flow = await provider.hooks.flush();
  assert.equal(flow.isDetailWorking, false);
  assert.ok(flow.detailError);
  assert.equal(flow.flowerDetailSource.supportCount, 21);
  assert.equal(flow.placements[0].supportCount, 21);
  assert.equal(flow.flowerDetailSource.messages.some((message) => message.id === ownPending.id), false);
  assert.ok(flow.flowerDetailSource.messages.some((message) => message.id === 'live-during-send'));
  assert.ok(flow.flowerDetailSource.messages.some((message) => message.id === 'message-2' && message.pending));
  assert.deepEqual(provider.storage.writes, []);
});

test('DELTA-P2-2 delayed provider Delete cannot remove the next account cache', async () => {
  const pending = deferred();
  const provider = await providerHarness({ userId: 'owner', api: { deleteSourceFlower: () => pending.promise } });
  let flow = provider.hooks.render(); flow.openFlowerDetail(placement); flow = await provider.hooks.flush();
  const deleting = flow.deleteSelectedFlower();
  await provider.persistence.scopeFlowerPlacements('bob');
  await provider.persistence.saveFlowerPlacements([{ ...placement, id: 'bob-placement' }]);
  pending.resolve(); await deleting;
  assert.equal(JSON.parse(provider.storage.items.get('petalpal_flower_placements_v1:bob'))[0].id, 'bob-placement');
  assert.equal(provider.storage.items.has('petalpal_flower_placements_v1:owner'), false);
});


test('message refresh safety: author deletion across Gardens replaces stale membership and retains pending work', () => {
  const { mergeFlowerSource } = loadPlantingModules()('flowerDetailData');
  const deleted = { id: 'deleted-author', text: 'Removed with author account' };
  const kept = { id: 'retained', text: 'Still on server' };
  const pending = { id: 'local-pending', text: 'Sending', pending: true };
  for (const id of ['flower-in-garden-a', 'flower-in-garden-b']) {
    const current = { ...source, id, messages: [deleted, kept, pending] };
    const incoming = { ...source, id, messages: [kept] };
    const result = mergeFlowerSource(current, incoming, 'refresh');
    assert.deepEqual(plain(result.messages), [kept, pending]);
    assert.deepEqual(plain(mergeFlowerSource(current, { ...incoming, messages: undefined }, 'refresh').messages), [deleted, kept, pending]);
    assert.deepEqual(plain(mergeFlowerSource(current, { ...incoming, messages: [] }, 'refresh').messages), [pending]);
  }
});

test('message refresh safety: pending and post-start arrivals survive complete replacement without old server rows', () => {
  const { mergeFlowerSource } = loadPlantingModules()('flowerDetailData');
  const old = { id: 'old', text: 'Deleted' }, live = { id: 'live', text: 'New arrival' };
  const pending = { id: 'pending', text: 'Sending', pending: true };
  const base = { ...source, messages: [old] };
  const current = { ...source, messages: [old, live, pending] };
  const refreshed = mergeFlowerSource(current, { ...source, messages: [] }, 'refresh', base);
  assert.deepEqual(plain(refreshed.messages), [live, pending]);
  assert.deepEqual(plain(mergeFlowerSource(refreshed, { ...source, messages: [] }, 'refresh', refreshed).messages), [pending]);
});

test('message refresh safety: failed fetch leaves current messages and reports error', async () => {
  const request = deferred(); let broadcast;
  const provider = await providerHarness({ api: {
    loadFlowerSource: () => request.promise,
    subscribeToFlowerUpdates: (_owner, _flower, fn) => { broadcast = fn; return () => {}; },
  } });
  provider.hooks.render().openFlowerDetail(placement); await provider.hooks.flush();
  broadcast(source); await provider.hooks.flush();
  request.reject(new Error('Refresh unavailable'));
  const flow = await provider.hooks.flush();
  assert.deepEqual(plain(flow.flowerDetailSource.messages), source.messages);
  assert.equal(flow.detailError, 'Refresh unavailable');
  assert.equal(flow.isDetailLoading, false);
});

test('message refresh safety: account switch cancels late GET and message action publication', async () => {
  const get = deferred(), send = deferred(); let calls = 0;
  const provider = await providerHarness({ api: {
    loadFlowerSource: () => ++calls === 1 ? Promise.resolve(source) : get.promise,
    leaveFlowerMessage: () => send.promise,
  } });
  provider.hooks.render().openFlowerDetail(placement); let flow = await provider.hooks.flush();
  const sending = flow.leaveMessage('Pending for previous account'); await provider.hooks.flush();
  // Same-account session refresh starts another complete GET.
  provider.props.session = { user: { id: 'visitor', name: 'Visitor refreshed' } };
  provider.hooks.render(); await provider.hooks.flush();
  assert.equal(calls, 2);
  provider.props.session = { user: { id: 'next-account' } };
  provider.hooks.render(); flow = await provider.hooks.flush();
  assert.equal(flow.selectedFlower, null); assert.equal(flow.flowerDetailSource, null);
  get.resolve(source); send.resolve(source); await sending; flow = await provider.hooks.flush();
  assert.equal(flow.currentUserId, 'next-account');
  assert.equal(flow.flowerDetailSource, null); assert.equal(flow.detailError, '');
});

test('message refresh safety: complete provider refresh removes deleted rows while preserving a local send', async () => {
  const refresh = deferred(), send = deferred(); let calls = 0;
  const provider = await providerHarness({ api: {
    loadFlowerSource: () => ++calls === 1 ? Promise.resolve(source) : refresh.promise,
    leaveFlowerMessage: () => send.promise,
  } });
  provider.hooks.render().openFlowerDetail(placement); let flow = await provider.hooks.flush();
  provider.props.session = { user: { id: 'visitor', name: 'Visitor refreshed' } };
  provider.hooks.render(); flow = await provider.hooks.flush();
  const sending = flow.leaveMessage('Legitimate local send'); await provider.hooks.flush();
  refresh.resolve({ ...source, messages: [] }); flow = await provider.hooks.flush();
  assert.ok(!flow.flowerDetailSource.messages.some(m => m.id === 'message-1'));
  assert.ok(flow.flowerDetailSource.messages.some(m => m.text === 'Legitimate local send' && m.pending));
  send.reject(new Error('Send failed')); await sending; flow = await provider.hooks.flush();
  assert.ok(!flow.flowerDetailSource.messages.some(m => m.text === 'Legitimate local send'));
});

test('message refresh safety: superseded complete fetch and owner switch cannot republish old messages', async () => {
  const old = deferred(), latest = deferred(); let calls = 0;
  const provider = await providerHarness({ api: {
    loadFlowerSource: () => ++calls === 1 ? Promise.resolve(source) : calls === 2 ? old.promise : latest.promise,
  } });
  provider.hooks.render().openFlowerDetail(placement); await provider.hooks.flush();
  provider.props.session = { user: { id: 'visitor', name: 'refresh one' } };
  provider.hooks.render(); await provider.hooks.flush();
  provider.props.session = { user: { id: 'visitor', name: 'refresh two' } };
  provider.hooks.render(); await provider.hooks.flush();
  latest.resolve({ ...source, messages: [] }); let flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.messages.some(m => m.id === 'message-1'), false);
  old.resolve(source); flow = await provider.hooks.flush();
  assert.equal(flow.flowerDetailSource.messages.some(m => m.id === 'message-1'), false);
  provider.props.gardenOwnerUserId = 'another-owner'; provider.hooks.render(); flow = await provider.hooks.flush();
  assert.equal(flow.selectedFlower, null); assert.equal(flow.flowerDetailSource, null);
});

// An Event-grown flower stores no memory text of its own; the owner can open its Event.
const eventFlower = { ...placement, sourceEventId: 'event-9', notes: '' };
const eventSource = { ...source, event: '', dailyCheckIn: null };

test('owner can open the Event a flower grew from; it loads only on tap', async () => {
  const reads = [];
  const { hooks } = modalHarness({ selectedFlowerIsOwner: true, currentUserId: 'owner', selectedFlower: eventFlower, flowerDetailSource: eventSource },
    { readEvent: async (id) => { reads.push(id); return { id, content: 'Walked to the river after work.' }; } });
  let tree = hooks.render();
  assert.equal(reads.length, 0);
  assert.equal(textContent(tree).includes('Walked to the river'), false);
  button(tree, 'View Event ▾').props.onPress();
  await hooks.flush(); tree = hooks.render();
  assert.deepEqual(reads, ['event-9']);
  assert.ok(textContent(tree).includes('Walked to the river after work.'));
  button(tree, 'Hide Event ▴').props.onPress();
  await hooks.flush(); tree = hooks.render();
  assert.equal(textContent(tree).includes('Walked to the river'), false);
});

test('a visitor never sees or loads the Event behind a friend\'s flower', async () => {
  const { hooks } = modalHarness({ selectedFlowerIsOwner: false, selectedFlower: eventFlower, flowerDetailSource: eventSource });
  const tree = hooks.render();
  assert.equal(button(tree, 'View Event ▾'), undefined);
  assert.equal(textContent(tree).includes('View Event'), false);
});

test('an Event that cannot be read shows a short note instead of failing', async () => {
  const { hooks } = modalHarness({ selectedFlowerIsOwner: true, currentUserId: 'owner', selectedFlower: eventFlower, flowerDetailSource: eventSource },
    { readEvent: async () => { throw new Error('404'); } });
  button(hooks.render(), 'View Event ▾').props.onPress();
  await hooks.flush();
  assert.ok(textContent(hooks.render()).includes('This Event can’t be opened right now.'));
});
