import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { hookHarness } from './flowerDetail.test.mjs';
const plain = value => JSON.parse(JSON.stringify(value));
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const flower = (id, extra = {}) => ({ id, userId: 'alice', name: 'Sunflower', speciesCode: 'SUNFLOWER',
  mood: 'SUNNY_BLOOM', img: 'sunflower.png', createdAt: '2026-09-29T01:00:00Z', supportCount: 2,
  colorAccent: 'WARM_GOLD', visualEffect: 'SUBTLE_MIST', ...extra });
function setup(fetch, react, dependencies = {}, storage = { getItem: () => null, setItem() {} }) {
  const load = loadPlantingModules(storage, react, undefined, true, { fetch, ...dependencies });
  const api = load('../../../services/api');
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'fixture-token' });
  return { load, api, garden: load('../../../services/garden'), hydration: load('gardenHydration') };
}
const fixture = () => ({ owner: { id: 'alice' }, flowers: [
  flower('event', { sourceEventId: 'event-source', sourceEvent: { secondaryEmotions: ['gratitude'] },
    variant: 'standard', rarity: 'rare', growthState: 'BLOOMED', season: 'AUTUMN', event: 'Private Event text' }),
  flower('daily', { dailyCheckInId: 'daily-source', dailyCheckIn: { journal: { content: 'Private Journal text' },
    emotionResult: { secondaryEmotions: ['fear', 'love'] } } }),
  flower('historical', { sourceEventId: null }),
] });

test('Garden hydration loads every source, preserves canonical data, and retains no private text', async () => {
  const calls = [];
  const { garden, hydration } = setup(async url => { calls.push(url); return response(fixture()); });
  const flowers = await garden.loadGarden('alice', 'alice');
  assert.equal(flowers.length, 3); assert.deepEqual(calls, ['/users/alice/garden']);
  assert.deepEqual(plain(flowers.map(f => [f.sourceType, f.secondaryEmotions])),
    [['EVENT', ['gratitude']], ['DAILY', ['fear', 'love']], ['HISTORICAL', []]]);
  const records = hydration.hydrateGardenPlacements(flowers, [], 'alice', 'alice', 'America/Vancouver');
  assert.equal(records.length, 3);
  const event = records.find(f => f.flowerId === 'event');
  assert.equal(event.sourceEventId, 'event-source'); assert.equal(event.plantedDate, fixture().flowers[0].createdAt);
  for (const field of ['speciesCode', 'mood', 'colorAccent', 'visualEffect', 'variant', 'rarity', 'growthState', 'season'])
    assert.equal(event[field], fixture().flowers[0][field]);
  assert.equal(records.find(f => f.flowerId === 'daily').dailyCheckInId, 'daily-source');
  assert.equal(JSON.stringify(records).includes('Private'), false);
});
test('Garden hydration safely guards malformed secondary labels and honors Event source precedence', () => {
  const { garden } = setup(async () => response({}));
  assert.deepEqual(plain(garden.flowerSecondaryEmotions(flower('a', { sourceEventId: 'e',
    sourceEvent: { secondaryEmotions: null }, dailyCheckIn: { emotionResult: { secondaryEmotions: ['fear'] } } }))), []);
  assert.deepEqual(plain(garden.flowerSecondaryEmotions(flower('a', {
    dailyCheckIn: { emotionResult: { secondaryEmotions: ['love', null, 3] } } }))), ['love']);
});
test('Garden hydration fallback is deterministic, safe for every month, and never writes coordinates', async () => {
  let writes = 0;
  const { garden, hydration, load } = setup(async () => response(fixture()), undefined, {},
    { getItem: () => null, setItem() { writes++; } });
  const flowers = await garden.loadGarden('alice', 'alice');
  const first = hydration.hydrateGardenPlacements(flowers, [], 'alice', 'alice');
  const reordered = hydration.hydrateGardenPlacements([...flowers].reverse(), [], 'alice', 'alice');
  assert.deepEqual(plain(first), plain(reordered));
  assert.equal(new Set(first.map(p => `${p.worldX},${p.worldY}`)).size, first.length);
  const masks = load('approvedPlantingMasks');
  for (let month = 1; month <= 12; month++) {
    const item = { ...flowers[0], createdAt: `2026-${String(month).padStart(2, '0')}-15T12:00:00Z` };
    const [record] = hydration.hydrateGardenPlacements([item], [], 'alice', 'alice');
    assert.equal(record.placementOrigin, 'FALLBACK');
    assert.equal(masks.isFootprintInApprovedMonthMaskWorld(month, record.worldX, record.worldY, 16), true);
  }
  const beforeReload = await hydration.loadGardenPlacements('alice', 'alice');
  const afterReload = await hydration.loadGardenPlacements('alice', 'alice');
  assert.deepEqual(plain(beforeReload), plain(afterReload)); assert.equal(writes, 0);
});
test('Garden hydration preserves only matched owner coordinates; canonical data supersedes stale local data', async () => {
  const { garden, hydration } = setup(async () => response(fixture()));
  const flowers = await garden.loadGarden('alice', 'alice');
  const local = [{ flowerId: 'event', ownerUserId: 'alice', worldX: 100, worldY: 200, scale: 1.1, rotation: .2,
    landId: 'local-land', mood: 'FIRE_BLOOM', speciesCode: 'WRONG', notes: 'Private stale cache' },
    { flowerId: 'daily', ownerUserId: 'bob', worldX: 300, worldY: 400 },
    { flowerId: 'orphan', worldX: 300, worldY: 400 }];
  const records = hydration.hydrateGardenPlacements(flowers, local, 'alice', 'alice');
  const event = records.find(p => p.flowerId === 'event');
  assert.equal(event.placementOrigin, 'LOCAL'); assert.equal(event.worldX, 100); assert.equal(event.worldY, 200);
  assert.equal(event.scale, 1.1); assert.equal(event.rotation, .2); assert.equal(event.mood, 'SUNNY_BLOOM');
  assert.equal(event.speciesCode, 'SUNFLOWER'); assert.equal(event.notes, undefined);
  assert.equal(records.find(p => p.flowerId === 'daily').placementOrigin, 'FALLBACK');
  assert.equal(records.some(p => p.flowerId === 'orphan'), false);
});
test('Garden hydration visitor reads strip private fields and never use another owner device layout', async () => {
  let localReads = 0;
  const { garden, hydration } = setup(async () => response(fixture()), undefined, {},
    { getItem() { localReads++; throw new Error('Must not read owner layout'); }, setItem() {} });
  const flowers = await garden.loadGarden('alice', 'bob');
  for (const f of flowers) {
    assert.equal(f.sourceType, 'SOCIAL'); assert.equal(f.sourceEventId, undefined);
    assert.equal(f.dailyCheckInId, undefined); assert.deepEqual(plain(f.secondaryEmotions), []);
  }
  const records = await hydration.loadGardenPlacements('alice', 'bob');
  assert.equal(records.length, 3); assert.equal(localReads, 0);
  assert.throws(() => hydration.hydrateGardenPlacements([{ ...flowers[0], userId: 'bob' }], [], 'alice', 'alice'), /another Garden/);
});
test('Garden hydration rejects mismatched owner responses and drops in-flight data on account change', async () => {
  let resolve, ready;
  const started = new Promise(done => { ready = done; });
  const { garden, api } = setup(async () => { ready(); return await new Promise(done => { resolve = done; }); });
  const pending = garden.loadGarden('alice', 'alice'); await started;
  api.configureApi({ apiBaseUrl: '', getAccessToken: async () => 'bob-fixture-token' });
  resolve(response(fixture())); await assert.rejects(pending, /session changed/);
  const wrong = setup(async () => response({ ...fixture(), owner: { id: 'bob' } }));
  await assert.rejects(wrong.garden.loadGarden('alice', 'alice'), /load this Garden/);
});
function providerSetup(fetch, storage) {
  const hooks = hookHarness();
  const { load } = setup(fetch, hooks.react, {
    './flowerDetailApi': { loadFlowerSession: async () => null, subscribeToFlowerUpdates: () => () => {},
      loadFlowerSource: async () => fixture().flowers[0], deleteSourceFlower: async () => {} },
    './placementValidator': { validateFlowerPlacement: () => ({ isValid: true }) },
  }, storage);
  const Provider = load('PlantingContext').PlantingProvider;
  let props = { children: null, backendMode: true, session: { user: { id: 'alice', timezone: 'UTC' } } };
  hooks.mount(() => { const wrapper = Provider(props); return wrapper.type(wrapper.props).props.value; });
  return { hooks, load, change(next) { props = { ...props, ...next }; hooks.render(); } };
}
test('Garden hydration provider ignores late focus/account responses and refreshes all sources', async () => {
  let resolve, count = 0;
  const state = providerSetup(async url => {
    if (++count === 1) return await new Promise(done => { resolve = done; });
    return response({ owner: { id: 'bob' }, flowers: [flower('bob-flower', { userId: 'bob' })] });
  });
  await state.hooks.flush();
  state.change({ session: { user: { id: 'bob' } } });
  let current = await state.hooks.flush();
  assert.deepEqual(plain(current.placements.map(p => p.flowerId)), ['bob-flower']);
  resolve(response(fixture())); current = await state.hooks.flush();
  assert.deepEqual(plain(current.placements.map(p => p.flowerId)), ['bob-flower']);
  await current.refreshGarden(); current = await state.hooks.flush(); assert.equal(current.placements.length, 1);
});
test('Garden hydration saves and deletes one flower without dropping unplaced backend flowers or seeding demos', async () => {
  const items = new Map();
  const state = providerSetup(async () => response(fixture()),
    { getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value) });
  let current = await state.hooks.flush(); assert.equal(current.placements.length, 3);
  await current.resetAllPlacements(); current = await state.hooks.flush(); assert.equal(current.placements.length, 3);
  const daily = current.placements.find(p => p.flowerId === 'daily');
  current.startAdjusting(daily); current = await state.hooks.flush();
  assert.equal(await current.confirmPlacement(), true); current = await state.hooks.flush();
  assert.equal(current.placements.length, 3);
  assert.equal(current.placements.find(p => p.flowerId === 'daily').placementOrigin, 'LOCAL');
  const saved = JSON.parse([...items.values()][0]); assert.equal(saved.length, 1); assert.equal(saved[0].flowerId, 'daily');
  current.openFlowerDetail(current.placements.find(p => p.flowerId === 'event')); current = await state.hooks.flush();
  assert.equal(await current.deleteSelectedFlower(), true); current = await state.hooks.flush();
  assert.deepEqual(plain(current.placements.map(p => p.flowerId)), ['daily', 'historical']);
});
test('Garden HUD opens local overlays without navigation/refresh and closes to the same Garden', async () => {
  const hooks = hookHarness();
  let planting = { activeMode: 'normal', selectedFlower: null, isGardenLoading: false, gardenError: '', refreshGarden() { calls.push('refresh'); } };
  const calls = []; let focused = 0;
  const onFocusFairy = () => { focused++; };
  const load = loadPlantingModules(undefined, hooks.react, undefined, true, {
    'expo-router': { router: { push: route => calls.push(route), setParams: params => calls.push(params) }, useLocalSearchParams: () => ({}) },
    'expo-symbols': { SymbolView: 'Symbol' },
    '../features/FeatureOverlay': { FeatureOverlay: 'FeatureOverlay' },
    '../features/FeatureUI': { FEATURE_COLORS: { ink: '#253C40' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'react-native': { Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 1280, height: 800 }), View: 'View', Pressable: 'Pressable', Text: 'Text', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: x => x, absoluteFill: {} } },
    './planting/PlantingContext': { usePlanting: () => planting },
  });
  const { GardenHud } = load('../GardenHud');
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.children)] : [];
  let tree = hooks.mount(() => GardenHud({ onFocusFairy }));
  const buttons = nodes(tree).filter(n => n.props?.testID?.startsWith('hud-'));
  assert.equal(buttons.length, 5);
  assert.equal(buttons[0].props.accessibilityLabel, 'Garden, REAL');
  assert.equal(buttons[1].props.accessibilityLabel, 'Events / Flowers, REAL');
  for (const button of buttons.slice(1).filter(button => button.props.testID !== 'hud-fairy')) {
    button.props.onPress(); tree = await hooks.flush();
    const overlay = nodes(tree).find(n => n.type === 'FeatureOverlay');
    assert.equal(overlay.props.feature.id, button.props.testID.replace('hud-', ''));
    overlay.props.onClose(); tree = await hooks.flush();
    assert.equal(nodes(tree).find(n => n.type === 'FeatureOverlay').props.feature, undefined);
  }
  buttons.find(button => button.props.testID === 'hud-fairy').props.onPress(); await hooks.flush(); assert.equal(focused, 1);
  buttons[0].props.onPress(); await hooks.flush(); assert.deepEqual(calls, []);
  planting = { ...planting, activeMode: 'planting' }; assert.equal(hooks.render(), null);
  planting = { ...planting, activeMode: 'normal', selectedFlower: {} }; assert.equal(hooks.render(), null);
});

test('Garden hydration failure is retryable without substituting mock flowers', async () => {
  let fail = true;
  const state = providerSetup(async () => fail ? response({ error: 'Unreachable' }, 503) : response(fixture()));
  let current = await state.hooks.flush();
  assert.equal(current.isGardenLoading, false); assert.match(current.gardenError, /try again/);
  assert.equal(current.placements.length, 0);
  fail = false; await current.refreshGarden(); current = await state.hooks.flush();
  assert.equal(current.gardenError, ''); assert.equal(current.placements.length, 3);
});
test('Garden hydration historical flowers can enter planting, and a concurrent refresh does not cancel it', async () => {
  let count = 0, resolve;
  const state = providerSetup(async () => {
    if (++count === 2) return await new Promise(done => { resolve = done; });
    return response(fixture());
  });
  let current = await state.hooks.flush();
  const pending = current.startPlanting(current.placements.find(p => p.flowerId === 'historical'));
  await state.hooks.flush();
  await current.refreshGarden();
  resolve(response(fixture())); await pending; current = await state.hooks.flush();
  assert.equal(current.activeMode, 'planting'); assert.equal(current.targetFlower.flowerId, 'historical');
  assert.equal(current.targetFlower.sourceType, 'HISTORICAL');
});
test('Garden hydration renderers draw canonical historical art without sourceEventId, including release unresolved species', () => {
  const record = { id: 'old-flower', flowerId: 'old-flower', sourceType: 'HISTORICAL', month: 9,
    speciesCode: 'UNSUPPORTED_CANONICAL', flowerName: 'Historical flower', image: 'real-backend-image.png', worldX: 100, worldY: 100 };
  const load = loadPlantingModules(undefined, { useMemo: fn => fn() }, undefined, true, {
    '@shopify/react-native-skia': { Group: 'Group', Circle: 'Circle', Image: 'Image', useImage: () => 'image' },
    './PlantingContext': { usePlanting: () => ({ placements: [record], activeMode: 'normal', targetFlower: null, previewCoords: null }) },
    './CanonicalFlowerArt': { CanonicalFlowerArt: 'CanonicalArt', CanonicalFlowerEffects: 'CanonicalEffects' },
    '../flower-mood-effects/GardenMoodEffects': { GardenMoodEffectsLayer: 'MoodEffects' },
    './ProductionGrowthLayer': { ProductionGrowthLayer: 'GrowthLayer' },
    './productionGrowth': { gardenSpecies: () => null,
      productionGrowth: parents => [{ month: 9, growth: {}, unresolved: parents }] },
  });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
    ? [tree, ...nodes(tree.props?.children)] : [];
  const legacy = load('PlantedFlowerLayer').LegacyPlantedFlowerLayer({});
  const growth = load('ProductionPlantedFlowers').ProductionPlantedFlowers({});
  for (const tree of [legacy, growth]) {
    const canonical = nodes(tree).filter(n => n.type === 'CanonicalArt');
    assert.equal(canonical.length, 1); assert.equal(canonical[0].props.flower.image, 'real-backend-image.png');
  }
});
test('Garden hydration canonical historical detail never borrows sample Journal text or mood', () => {
  const load = loadPlantingModules();
  const details = load('flowerDetailData');
  const record = { id: 'real-flower', flowerId: 'fl-jan-01', journalEntryId: '', sourceType: 'HISTORICAL',
    flowerName: 'Canonical Rose', mood: 'FIRE_BLOOM', supportCount: 0 };
  const detail = details.resolveFlowerDetail(record);
  assert.equal(detail.name, 'Canonical Rose'); assert.equal(detail.mood, 'FIRE_BLOOM');
  assert.equal(detail.memory, '');
});
test('the server keeps planted spots: its spot wins, and a device-only spot is saved there once', async () => {
  const posts = [];
  let rows = [flower('server', { worldX: 1200, worldY: 560, regionId: 'Land09' }), flower('device'), flower('unplanted')];
  const { garden, hydration } = setup(async (url, init = {}) => {
    if (init.method === 'POST') {
      const body = JSON.parse(init.body); posts.push([url, body]);
      const row = rows.find(item => url.includes(`/flowers/${item.id}/`));
      if (row.worldX != null && (row.worldX !== body.worldX || row.worldY !== body.worldY)) {
        return response({ error: 'This flower is already planted. Its spot can’t change.', code: 'PLACEMENT_LOCKED' }, 409);
      }
      rows = rows.map(row => url.includes(`/flowers/${row.id}/`) ? { ...row, ...body, regionId: body.landId } : row);
      return response({ flowerId: 'device', ...body }, 201);
    }
    return response({ owner: { id: 'alice' }, flowers: rows });
  });
  const flowers = await garden.loadGarden('alice', 'alice');
  // A stale device cache can never move a flower the server already placed.
  const cached = [{ flowerId: 'server', ownerUserId: 'alice', worldX: 5, worldY: 5 },
    { flowerId: 'device', ownerUserId: 'alice', worldX: 1100, worldY: 900 }];
  const records = hydration.hydrateGardenPlacements(flowers, cached, 'alice', 'alice', 'UTC');
  const byId = id => records.find(record => record.flowerId === id);
  assert.deepEqual([byId('server').worldX, byId('server').worldY, byId('server').landId, byId('server').placementOrigin], [1200, 560, 'Land09', 'SERVER']);
  assert.equal(byId('device').placementOrigin, 'LOCAL');
  assert.equal(byId('unplanted').placementOrigin, 'FALLBACK');
  // A visiting friend sees the owner's real spot, never their own device cache.
  const visit = hydration.hydrateGardenPlacements(flowers, cached, 'alice', 'bob', 'UTC');
  assert.equal(visit.find(record => record.flowerId === 'server').worldX, 1200);
  assert.equal(visit.find(record => record.flowerId === 'device').placementOrigin, 'FALLBACK');
  assert.deepEqual(posts, []);
  await garden.plantFlowerSpot('alice', 'device', { worldX: 1100, worldY: 900, landId: 'Land09' });
  assert.deepEqual(plain(posts), [['/users/alice/flowers/device/placement', { worldX: 1100, worldY: 900, landId: 'Land09' }]]);
  // Moving it later is refused by the server.
  await assert.rejects(garden.plantFlowerSpot('alice', 'device', { worldX: 1, worldY: 2, landId: 'Land09' }), /can’t change/);
});
