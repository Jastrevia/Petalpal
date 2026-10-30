import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { hookHarness } from './hookHarness.mjs';

// Planting is: tap the lawn → a ghost with a ✓ under it → only ✓ saves the spot, once, for good.
const plain = value => JSON.parse(JSON.stringify(value));
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const flower = (id, extra = {}) => ({ id, userId: 'alice', name: 'Sunflower', speciesCode: 'SUNFLOWER',
  mood: 'SUNNY_BLOOM', img: 'sunflower.png', createdAt: '2026-09-29T01:00:00Z', supportCount: 0,
  sourceEventId: null, ...extra });

function server(rows) {
  const posts = [];
  const fetch = async (url, init = {}) => {
    if (init.method === 'POST') {
      const body = JSON.parse(init.body); posts.push([url, body]);
      const row = rows.find(item => url.includes(`/flowers/${item.id}/`));
      if (row.worldX != null && (row.worldX !== body.worldX || row.worldY !== body.worldY)) {
        return response({ error: 'This flower is already planted. Its spot can’t change.', code: 'PLACEMENT_LOCKED' }, 409);
      }
      Object.assign(row, { worldX: body.worldX, worldY: body.worldY, regionId: body.landId });
      return response({ flowerId: row.id, ...body }, 201);
    }
    return response({ owner: { id: 'alice' }, flowers: rows.map(row => ({ ...row })) });
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
  const rows = [flower('new')];
  const { fetch, posts } = server(rows);
  const { hooks, load } = provider(fetch);
  let current = await hooks.flush();
  const unplanted = current.placements.find(p => p.flowerId === 'new');
  assert.equal(unplanted.placementOrigin, 'FALLBACK');

  await current.startPlanting({ flowerId: 'new', month: 9, flowerName: 'Sunflower' });
  current = await hooks.flush();
  assert.equal(current.activeMode, 'planting');
  // No ghost is placed for the owner: it appears only where they tap.
  assert.equal(current.previewCoords, null); assert.equal(current.validationResult, null);
  assert.equal(await current.confirmPlacement(), false); current = await hooks.flush();

  // Its own not-yet-planted preview spot never blocks it.
  current.updatePreview(unplanted.worldX, unplanted.worldY); current = await hooks.flush();
  assert.equal(current.validationResult.isValid, true, current.validationResult.userFeedback);

  const spot = validSpot(load, [{ x: unplanted.worldX, y: unplanted.worldY }]);
  current.updatePreview(-10, -10); current = await hooks.flush();
  assert.equal(current.validationResult.isValid, false);
  assert.equal(await current.confirmPlacement(), false);
  current.updatePreview(spot.x, spot.y); current = await hooks.flush();
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
  assert.match(texts, /Tap the spot in the September garden/);
  assert.doesNotMatch(texts, /Plant Here/);

  view = controls({ ...base, previewCoords: { worldX: 1000, worldY: 600 },
    validationResult: { isValid: false, userFeedback: 'Choose a grassy spot.' } });
  let button = nodes(view.check).find(n => n.type === 'Pressable');
  assert.equal(button.props.disabled, true);
  assert.ok(button.props.style({ pressed: false }).flat().some(style => style && style.width >= 44));

  view = controls({ ...base, previewCoords: { worldX: 1000, worldY: 600 },
    validationResult: { isValid: true, userFeedback: 'Ready to plant!' } });
  button = nodes(view.check).find(n => n.type === 'Pressable');
  assert.equal(button.props.disabled, false); assert.equal(button.props.accessibilityLabel, 'Plant here');
  // Centred under the ghost's planting point in screen space (base + camera + world × fit × zoom).
  const [{ translateX }, { translateY }] = view.check.props.style[1].transform;
  assert.equal(translateX, 5 + 10 + 1000 * 0.5 * 2 - 24);
  assert.ok(translateY > 7 + 20 + 600 * 0.5 * 2);
  button.props.onPress(); await Promise.resolve();
  assert.equal(confirmed, 1);
});

test('while planting, the flower is drawn only as its ghost, never also at a preview spot', () => {
  const own = { id: 'f-new', flowerId: 'new', month: 9, flowerName: 'Sunflower', speciesCode: 'SUNFLOWER',
    worldX: 900, worldY: 500, placementOrigin: 'FALLBACK' };
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
  assert.deepEqual(render({ placements: [own, other], activeMode: 'planting', targetFlower: own, previewCoords: null }),
    [[['other', 950]]]);
  assert.deepEqual(render({ placements: [own, other], activeMode: 'planting', targetFlower: own,
    previewCoords: { worldX: 1000, worldY: 560 }, validationResult: { isValid: true } }),
    [[['other', 950]], [['new', 1000]]]);
});
