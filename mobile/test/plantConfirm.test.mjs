import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { hookHarness } from './hookHarness.mjs';

// Planting is: tap the lawn → a ghost with a ✓ under it → only ✓ saves the spot, once, for good.
const plain = value => JSON.parse(JSON.stringify(value));
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const flower = (id, extra = {}) => ({ id, userId: 'alice', name: 'Sunflower', speciesCode: 'SUNFLOWER',
  mood: 'SUNNY_BLOOM', img: 'sunflower.png', createdAt: '2026-09-29T01:00:00Z', supportCount: 0,
  sourceEventId: null, ...extra });

function server(rows, options = {}) {
  const posts = [];
  const fetch = async (url, init = {}) => {
    if (init.method === 'POST') {
      const body = JSON.parse(init.body); posts.push([url, body]);
      if (options.failPosts?.length && options.failPosts.shift()) return response({ error: 'Failed to plant flower' }, 500);
      const row = rows.find(item => url.includes(`/flowers/${item.id}/`));
      if (row.worldX != null && (row.worldX !== body.worldX || row.worldY !== body.worldY)) {
        return response({ error: 'This flower is already planted. Its spot can’t change.', code: 'PLACEMENT_LOCKED' }, 409);
      }
      Object.assign(row, { worldX: body.worldX, worldY: body.worldY, regionId: body.landId });
      return response({ flowerId: row.id, ...body }, 201);
    }
    if (url.startsWith('/events/')) return response({ id: url.slice(8), localDate: '2026-09-29', secondaryEmotions: [], emotionStatus: 'SUCCESS' });
    // Like the server: the owner's metadata view has every flower; a visitor gets planted ones only.
    const visitor = !url.includes('view=metadata');
    return response({ owner: { id: 'alice' }, flowers: rows.filter(row => !visitor || row.worldX != null).map(row => ({ ...row })) });
  };
  return { fetch, posts };
}

function provider(fetch) {
  const hooks = hookHarness();
  const items = new Map();
  const load = loadPlantingModules({ getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value) },
    hooks.react, undefined, true, {
      fetch,
      './flowerDetailApi': { loadFlowerSession: async () => null, subscribeToFlowerUpdates: () => () => {},
        loadFlowerSource: async () => null, deleteSourceFlower: async () => {} },
    });
  load('../../../services/api').configureApi({ apiBaseUrl: '', getAccessToken: async () => 'fixture-token' });
  const Provider = load('PlantingContext').PlantingProvider;
  const props = { children: null, backendMode: true, session: { user: { id: 'alice', timezone: 'UTC' } } };
  hooks.mount(() => { const wrapper = Provider(props); return wrapper.type(wrapper.props).props.value; });
  return { hooks, load };
}

// A spot on September's real lawn where the Sunflower's whole footprint fits.
function validSpot(load, avoid = []) {
  const masks = load('approvedPlantingMasks'), validator = load('placementValidator');
  const c = masks.getApprovedMonthCentroid(9);
  for (let ring = 0; ring < 30; ring++) for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
    const point = { x: c.x + dx * 12, y: c.y + dy * 12 };
    if (avoid.some(a => Math.hypot(a.x - point.x, a.y - point.y) < 80)) continue;
    if (validator.validateFlowerPlacement({ flowerId: 'probe', month: 9, worldX: point.x, worldY: point.y,
      existingPlacements: [], flowerName: 'Sunflower', speciesCode: 'SUNFLOWER' }).isValid) return point;
  }
  throw new Error('No valid September spot found');
}

test('planting shows nothing until a tap, and nothing is saved until ✓', async () => {
  const rows = [flower('new', { sourceEventId: 'event-new' })];
  const { fetch, posts } = server(rows);
  const { hooks, load } = provider(fetch);
  let current = await hooks.flush();
  // An Event flower not planted yet: no position at all, and not among the flowers any Garden layer draws.
  assert.equal(current.placements.some(p => p.flowerId === 'new'), false);
  const unplanted = current.unplantedFlowers.find(p => p.flowerId === 'new');
  assert.equal(unplanted.placementOrigin, 'UNPLANTED');
  assert.equal(Number.isFinite(unplanted.worldX), false);

  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' });
  current = await hooks.flush();
  assert.equal(current.activeMode, 'planting');
  // No ghost and no default position: it appears only where the owner taps.
  assert.equal(current.previewCoords, null); assert.equal(current.validationResult, null);
  assert.equal(Number.isFinite(current.targetFlower.worldX), false);
  assert.equal(await current.confirmPlacement(), false); current = await hooks.flush();

  const spot = validSpot(load);
  current.updatePreview(-10, -10); current = await hooks.flush();
  assert.equal(current.previewCoords, null, 'An invalid tap is never a preview');
  assert.equal(current.placementNotice.message, load('PlantingContext').PLANTING_AREA_MESSAGE);
  assert.equal(await current.confirmPlacement(), false);
  current.updatePreview(spot.x, spot.y); current = await hooks.flush();
  assert.equal(current.placementNotice, null);
  assert.deepEqual(plain(current.previewCoords), { worldX: spot.x, worldY: spot.y });
  assert.equal(current.validationResult.isValid, true);
  // Moving the ghost around writes nothing.
  assert.deepEqual(posts, []);
  assert.equal(current.activeMode, 'planting');

  assert.equal(await current.confirmPlacement(), true); current = await hooks.flush();
  assert.deepEqual(plain(posts), [['/users/alice/flowers/new/placement', { worldX: spot.x, worldY: spot.y, landId: 'Land09' }]]);
  assert.equal(current.activeMode, 'normal'); assert.equal(current.previewCoords, null);
  const planted = current.placements.find(p => p.flowerId === 'new');
  assert.deepEqual([planted.worldX, planted.worldY, planted.placementOrigin], [spot.x, spot.y, 'SERVER']);
});

test('a planted flower keeps its saved spot on every refresh and cannot be planted again', async () => {
  const rows = [flower('new'), flower('other')];
  const { fetch, posts } = server(rows);
  const { hooks, load } = provider(fetch);
  let current = await hooks.flush();
  const spot = validSpot(load, current.placements.filter(p => p.flowerId === 'other').map(p => ({ x: p.worldX, y: p.worldY })));
  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' }); current = await hooks.flush();
  current.updatePreview(spot.x, spot.y); current = await hooks.flush();
  assert.equal(await current.confirmPlacement(), true);

  for (let i = 0; i < 3; i++) {
    await current.refreshGarden(); current = await hooks.flush();
    const planted = current.placements.find(p => p.flowerId === 'new');
    assert.deepEqual([planted.worldX, planted.worldY, planted.landId, planted.placementOrigin], [spot.x, spot.y, 'Land09', 'SERVER']);
  }

  // Trying to plant it again elsewhere writes nothing and leaves it where it is.
  const elsewhere = validSpot(load, [{ x: spot.x, y: spot.y }]);
  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' }); current = await hooks.flush();
  current.updatePreview(elsewhere.x, elsewhere.y); current = await hooks.flush();
  assert.equal(await current.confirmPlacement(), false);
  current.cancelPlacement(); current = await hooks.flush();
  assert.equal(posts.length, 1);
  await current.refreshGarden(); current = await hooks.flush();
  const kept = current.placements.find(p => p.flowerId === 'new');
  assert.deepEqual([kept.worldX, kept.worldY], [spot.x, spot.y]);
});

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object'
  ? [tree, ...nodes(tree.props?.children)] : [];
const shared = value => ({ value });

function controls(planting) {
  const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'Text', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: styles => styles, absoluteFill: {} };
  const load = loadPlantingModules(undefined, undefined, undefined, true, {
    'react-native': native,
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, useAnimatedStyle: fn => fn() },
    './PlantingContext': { usePlanting: () => planting },
    '../../../services/locale': { useAppLocale: () => 'en' },
  });
  const Controls = load('PlantingPlacementControls').default;
  const camera = { x: shared(10), y: shared(20), zoom: shared(2), baseX: 5, baseY: 7, fit: 0.5 };
  const tree = Controls({ camera });
  // Expand the ✓ (a plain function component) in place.
  const check = nodes(tree).find(n => typeof n.type === 'function');
  return { tree, check: check ? check.type(check.props) : null };
}

test('the ✓ appears only under a tapped ghost, follows it, and is the only way to plant', async () => {
  let confirmed = 0;
  const base = { activeMode: 'planting', targetFlower: { flowerId: 'new', month: 9, flowerName: 'Sunflower' },
    isSaving: false, showPlacementDebug: false, cancelPlacement() {}, confirmPlacement: async () => { confirmed++; return true; } };

  let view = controls({ ...base, previewCoords: null, validationResult: null });
  assert.equal(view.check, null);
  const texts = nodes(view.tree).filter(n => n.type === 'Text').flatMap(n => [n.props.children].flat()).join(' ');
  assert.match(texts, /Tap the spot in the glowing September bed/);
  assert.doesNotMatch(texts, /Plant Here/);

  view = controls({ ...base, previewCoords: { worldX: 1000, worldY: 600 },
    validationResult: { isValid: false, userFeedback: 'Choose a grassy spot.' } });
  let button = nodes(view.check).find(n => n.type === 'Pressable');
  assert.equal(button.props.disabled, true);
  // A small 36pt circle whose touch area still reaches at least 44pt.
  const small = button.props.style({ pressed: false }).flat().find(style => style && style.width);
  assert.ok(small.width <= 40 && small.width + 2 * button.props.hitSlop >= 44);

  view = controls({ ...base, previewCoords: { worldX: 1000, worldY: 600 },
    validationResult: { isValid: true, userFeedback: 'Ready to plant!' } });
  button = nodes(view.check).find(n => n.type === 'Pressable');
  const circle = button.props.style({ pressed: false }).flat().find(style => style && style.width);
  assert.equal(button.props.disabled, false); assert.equal(button.props.accessibilityLabel, 'Plant here');
  // Centred under the ghost's planting point in screen space (base + camera + world × fit × zoom).
  const [{ translateX }, { translateY }] = view.check.props.style[1].transform;
  assert.equal(translateX, 5 + 10 + 1000 * 0.5 * 2 - circle.width / 2);
  assert.ok(translateY > 7 + 20 + 600 * 0.5 * 2);
  button.props.onPress(); await Promise.resolve();
  assert.equal(confirmed, 1);
});

test('while planting, the flower is drawn only as its ghost; an unplanted flower is never drawn', () => {
  const own = { id: 'f-new', flowerId: 'new', month: 9, flowerName: 'Sunflower', speciesCode: 'SUNFLOWER',
    worldX: 900, worldY: 500, placementOrigin: 'SERVER' };
  const other = { ...own, id: 'f-other', flowerId: 'other', worldX: 950, worldY: 520, placementOrigin: 'SERVER' };
  const render = planting => {
    const load = loadPlantingModules(undefined, { useMemo: fn => fn(), useCallback: fn => fn, useState: v => [v, () => {}],
      useEffect: () => {}, memo: fn => fn }, undefined, true, {
      '@shopify/react-native-skia': { Group: 'Group', Circle: 'Circle', Image: 'Image', Oval: 'Oval', BlurMask: 'BlurMask', useImage: () => null },
      './PlantingContext': { usePlanting: () => planting },
      './CanonicalFlowerArt': { CanonicalFlowerArt: 'CanonicalArt' },
      '../flower-mood-effects/GardenMoodEffects': { GardenMoodEffectsLayer: 'MoodEffects' },
      '../GardenStaticPicture': 'StaticPicture',
    });
    const beds = nodes(load('ProductionPlantedFlowers').ProductionPlantedFlowers({}))
      .filter(n => typeof n.type === 'function' && n.props.flowers);
    return plain(beds.map(bed => bed.props.flowers.map(f => [f.flowerId, f.worldX])));
  };
  assert.deepEqual(render({ placements: [own, other], activeMode: 'normal', targetFlower: null, previewCoords: null }),
    [[['new', 900], ['other', 950]]]);
  // Even if one slipped through, an unplanted flower (any source) is not drawn.
  const event = { ...own, id: 'f-event', flowerId: 'event', sourceType: 'EVENT', worldX: Number.NaN, placementOrigin: 'UNPLANTED' };
  const daily = { ...own, id: 'f-daily', flowerId: 'daily', sourceType: 'DAILY', worldX: Number.NaN, placementOrigin: 'UNPLANTED' };
  assert.deepEqual(render({ placements: [event, daily, other], activeMode: 'normal', targetFlower: null, previewCoords: null }),
    [[['other', 950]]]);
  const target = { ...own, worldX: Number.NaN, worldY: Number.NaN, placementOrigin: 'UNPLANTED' };
  assert.deepEqual(render({ placements: [other], activeMode: 'planting', targetFlower: target, previewCoords: null }),
    [[['other', 950]]]);
  assert.deepEqual(render({ placements: [other], activeMode: 'planting', targetFlower: target,
    previewCoords: { worldX: 1000, worldY: 560 }, validationResult: { isValid: true } }),
    [[['other', 950]], [['new', 1000]]]);
});

test('an Event flower without a spot waits for its owner; nothing plants it by default', () => {
  const load = loadPlantingModules();
  const { awaitsPlanting } = load('plantingPersistence');
  assert.equal(awaitsPlanting({ placementOrigin: 'UNPLANTED', sourceType: 'EVENT' }), true);
  for (const placementOrigin of ['SERVER', 'LOCAL', 'FALLBACK']) assert.equal(awaitsPlanting({ placementOrigin, sourceType: 'EVENT' }), false);
  // An Event flower without a spot is UNPLANTED before any preview spot is considered; only older non-Event
  // flowers keep a preview spot (FALLBACK), so existing Gardens look as they did.
  const read = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  assert.match(read('components/garden/planting/gardenHydration.ts'),
    /canonical\.sourceType === 'EVENT'[\s\S]*placementOrigin: 'UNPLANTED'[\s\S]*monthFallbackPoints\(canonical\.month\)/);
  assert.doesNotMatch(read('components/garden/planting/PlantingContext.tsx'), /getApprovedMonthCentroid|centroid\.x/);
  // A tap off the lawn only shows a message; it never leaves planting.
  assert.doesNotMatch(read('components/garden/GardenScene.tsx'), /nearLawn|\{ cancelPlacement\(\); return; \}/);
});

// A spot of the Garden whose validation for a September Sunflower fails for `reason`.
function invalidSpot(load, reason) {
  const validator = load('placementValidator');
  for (let x = 20; x < 2400; x += 40) for (let y = 20; y < 1800; y += 40) {
    const result = validator.validateFlowerPlacement({ flowerId: 'probe', month: 9, worldX: x, worldY: y,
      existingPlacements: [], flowerName: 'Sunflower', speciesCode: 'SUNFLOWER' });
    if (result.reason === reason) return { x, y };
  }
  throw new Error(`No ${reason} spot found`);
}

test('acceptance 2–5: road, another month and repeated invalid taps never leave planting, save or move a valid preview', async () => {
  const rows = [flower('new', { sourceEventId: 'event-new' })];
  const { fetch, posts } = server(rows);
  const { hooks, load } = provider(fetch);
  const message = load('PlantingContext').PLANTING_AREA_MESSAGE;
  const road = invalidSpot(load, 'NOT_PLANTABLE_GRASS');
  const otherMonth = invalidSpot(load, 'WRONG_MONTH_REGION');
  let current = await hooks.flush();
  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' }); current = await hooks.flush();

  // Test 2 / 3 / 4: road, another month's grass, outside the Garden, again and again.
  for (const tap of [road, otherMonth, { x: -5, y: -5 }, road, otherMonth, road]) {
    current.updatePreview(tap.x, tap.y); current = await hooks.flush();
    assert.equal(current.activeMode, 'planting');
    assert.equal(current.targetFlower.flowerId, 'new');
    assert.equal(current.previewCoords, null);
    assert.equal(current.placementNotice.message, message);
  }
  assert.deepEqual(posts, [], 'No flower or spot was saved');
  assert.equal(rows[0].worldX, undefined);

  // Test 5: a valid preview, then invalid taps: the preview stays exactly where it was.
  const spot = validSpot(load);
  current.updatePreview(spot.x, spot.y); current = await hooks.flush();
  assert.deepEqual(plain(current.previewCoords), { worldX: spot.x, worldY: spot.y });
  for (const tap of [road, otherMonth]) {
    current.updatePreview(tap.x, tap.y); current = await hooks.flush();
    assert.equal(current.activeMode, 'planting');
    assert.deepEqual(plain(current.previewCoords), { worldX: spot.x, worldY: spot.y });
    assert.equal(current.validationResult.isValid, true, 'Plant stays available for the valid preview');
    assert.equal(current.placementNotice.message, message);
  }
  assert.deepEqual(posts, []);
  // The owner can carry on normally: Plant saves the valid preview, nothing else.
  assert.equal(await current.confirmPlacement(), true); current = await hooks.flush();
  assert.deepEqual(plain(posts), [['/users/alice/flowers/new/placement', { worldX: spot.x, worldY: spot.y, landId: 'Land09' }]]);
});

test('acceptance 9: a failed save stays in planting with the same valid preview, and Plant can be retried', async () => {
  const rows = [flower('new', { sourceEventId: 'event-new' })];
  const { fetch, posts } = server(rows, { failPosts: [true] });
  const { hooks, load } = provider(fetch);
  let current = await hooks.flush();
  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' }); current = await hooks.flush();
  const spot = validSpot(load);
  current.updatePreview(spot.x, spot.y); current = await hooks.flush();
  assert.equal(await current.confirmPlacement(), false); current = await hooks.flush();
  assert.equal(current.activeMode, 'planting');
  assert.deepEqual(plain(current.previewCoords), { worldX: spot.x, worldY: spot.y });
  assert.equal(current.validationResult.isValid, true, 'Plant stays enabled to retry');
  assert.equal(current.placementNotice.kind, 'error');
  assert.equal(current.isSaving, false);
  assert.equal(rows[0].worldX, undefined, 'No spot was kept and no default spot was used');
  assert.equal(current.placements.some(p => p.flowerId === 'new'), false, 'Not planted');
  // Retry with Plant: the same spot is saved.
  assert.equal(await current.confirmPlacement(), true); current = await hooks.flush();
  assert.equal(posts.length, 2);
  assert.deepEqual(plain(posts[1][1]), { worldX: spot.x, worldY: spot.y, landId: 'Land09' });
  assert.equal(current.activeMode, 'normal');
});

test('acceptance 1 & 10: after Plant the owner, a friend and every reload read the same persisted spot', async () => {
  // Created late on Sep 30 UTC: a friend far ahead in time (UTC+14) would call it October.
  const rows = [flower('new', { sourceEventId: 'event-new', createdAt: '2026-09-30T23:30:00Z' })];
  const { fetch } = server(rows);
  const { hooks, load } = provider(fetch);
  const hydration = load('gardenHydration');
  let current = await hooks.flush();
  // Friend view before Plant: nothing.
  assert.deepEqual(plain(await hydration.loadGardenPlacements('alice', 'bob', 'Pacific/Kiritimati')), []);
  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' }); current = await hooks.flush();
  const spot = validSpot(load);
  current.updatePreview(spot.x, spot.y); current = await hooks.flush();
  assert.equal(await current.confirmPlacement(), true); current = await hooks.flush();
  const pick = record => plain([record.flowerId, record.worldX, record.worldY, record.landId, record.month, record.scale, record.rotation, record.speciesCode]);
  const expected = ['new', spot.x, spot.y, 'Land09', 9, 1, 0, 'SUNFLOWER'];
  assert.deepEqual(pick(current.placements.find(p => p.flowerId === 'new')), expected);
  assert.deepEqual([rows[0].worldX, rows[0].worldY, rows[0].regionId], [spot.x, spot.y, 'Land09']);
  for (let reload = 0; reload < 3; reload++) {
    await current.refreshGarden(); current = await hooks.flush();
    assert.deepEqual(pick(current.placements.find(p => p.flowerId === 'new')), expected, 'Owner reload');
    const friend = await hydration.loadGardenPlacements('alice', 'bob', 'Pacific/Kiritimati');
    assert.deepEqual(plain(friend.map(pick)), [expected], 'Friend reload, other timezone');
  }
});

test('acceptance 7: Cancel with a valid preview keeps it as a draft; it is restored, still unplanted, and friends see nothing', async () => {
  const rows = [flower('new', { sourceEventId: 'event-new' })];
  const { fetch, posts } = server(rows);
  const { hooks, load } = provider(fetch);
  let current = await hooks.flush();
  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' }); current = await hooks.flush();
  const spot = validSpot(load);
  current.updatePreview(spot.x, spot.y); current = await hooks.flush();
  current.cancelPlacement(); current = await hooks.flush();
  assert.equal(current.activeMode, 'normal');
  assert.deepEqual(posts, []);
  assert.deepEqual(plain(await load('gardenHydration').loadGardenPlacements('alice', 'bob', 'UTC')), []);
  assert.equal(current.placements.some(p => p.flowerId === 'new'), false);
  // Back to planting: the same valid preview returns, and only Plant plants it.
  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' }); current = await hooks.flush();
  assert.deepEqual(plain(current.previewCoords), { worldX: spot.x, worldY: spot.y });
  assert.equal(current.validationResult.isValid, true);
  assert.deepEqual(posts, []);
  assert.equal(await current.confirmPlacement(), true); current = await hooks.flush();
  assert.equal(posts.length, 1);
  // Once planted, nothing about it is a draft any more.
  assert.equal(load('../../../services/eventDraft').plantingPreview('alice', 'new'), null);
});
