import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hookHarness } from './hookHarness.mjs';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
// Storage that fails the test if anything tries to remove or clear what is saved.
const keptStorage = () => ({ getItem: () => null, setItem() {}, removeItem() { throw Error('refresh removed saved data'); },
  clear() { throw Error('refresh cleared saved data'); } });

test('web Refresh is the browser reload and leaves stored data alone', () => {
  let reloads = 0;
  const storage = keptStorage();
  const load = loadPlantingModules(storage, undefined, undefined, true, {
    'react-native': { Platform: { OS: 'web' } },
    runtimeGlobals: { window: { localStorage: storage, location: { reload: () => { reloads++; } } } },
  });
  const { reloadApp } = load('../../../services/appReload');
  reloadApp();
  assert.equal(reloads, 1);
});

test('native Refresh starts the navigator again instead of reloading a page', () => {
  let subscribed, reloads = 0;
  const react = { useSyncExternalStore: (subscribe, get) => { subscribed ??= subscribe; return get(); } };
  const load = loadPlantingModules(keptStorage(), react, undefined, false, {
    'react-native': { Platform: { OS: 'ios' } },
    runtimeGlobals: { window: { location: { reload: () => { reloads++; } } } },
  });
  const { reloadApp, useAppReloadKey } = load('../../../services/appReload');
  const first = useAppReloadKey();
  let heard = 0; const stop = subscribed(() => { heard++; });
  reloadApp();
  assert.equal(heard, 1); assert.equal(useAppReloadKey(), first + 1); assert.equal(reloads, 0);
  stop(); reloadApp(); assert.equal(heard, 1, 'an unmounted navigator is no longer told');
  // The key goes on the navigators themselves, below sign-in, the theme and the splash.
  const layout = read('../src/app/_layout.tsx');
  assert.match(layout, /<Stack key=\{reloadKey\}>/); assert.match(layout, /<AppTabs key=\{reloadKey\} \/>/);
  assert.doesNotMatch(layout, /<(AuthProvider|PanelThemeProvider|DevLoginEntranceHost|AnimatedSplashOverlay)[^>]*reloadKey/);
});

function mountButton(insets = { top: 0, bottom: 0, left: 0, right: 0 }) {
  const hooks = hookHarness(); let reloads = 0, focus; const timers = [];
  const load = loadPlantingModules(keptStorage(), hooks.react, undefined, true, {
    'react-native': { Platform: { OS: 'web' }, Pressable: 'Pressable', View: 'View', StyleSheet: { create: styles => styles } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => insets },
    'expo-router': { useFocusEffect: fn => { focus = fn; } },
    '../../services/appReload': { reloadApp: () => { reloads++; } },
    runtimeGlobals: { setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout() {} },
  });
  const { GardenRefreshButton } = load('../GardenRefreshButton');
  const tree = hooks.mount(() => GardenRefreshButton({ chinese: false }));
  return { hooks, tree, timers, reloads: () => reloads, focus: () => focus };
}

test('Refresh Garden: labelled, a 44-point target above the zoom row, one reload per tap burst', async () => {
  const { hooks, tree, timers, reloads } = mountButton();
  assert.equal(tree.type, 'Pressable'); assert.equal(tree.props.testID, 'garden-refresh');
  assert.equal(tree.props.accessibilityLabel, 'Refresh Garden'); assert.equal(tree.props.accessibilityRole, 'button');
  const [target, place] = tree.props.style;
  assert.equal(target.width, 44); assert.equal(target.height, 44);
  // The zoom row ends 130 points up (bottom 90, 40 high); the target starts 12 points above it.
  assert.equal(place.bottom, 142 - 4); assert.equal(place.left, 12 - 4);
  tree.props.onPress(); tree.props.onPress();
  assert.equal(reloads(), 1, 'a double tap reloads once');
  const after = await hooks.flush();
  assert.equal(after.props.disabled, true); assert.equal(after.props.accessibilityState.busy, true);
  // If the page stays (a "Leave site?" answered Stay), the button works again a few seconds later.
  assert.equal(timers.length, 1); assert.ok(timers[0].ms >= 2000);
  timers[0].fn(); const again = await hooks.flush();
  assert.equal(again.props.disabled, false); again.props.onPress(); assert.equal(reloads(), 2);
});

test('Refresh Garden keeps clear of the safe area and leaves when another screen is in front', async () => {
  const { place } = { place: mountButton({ top: 0, bottom: 200, left: 30, right: 0 }).tree.props.style[1] };
  assert.equal(place.bottom, 212 - 4); assert.equal(place.left, 42 - 4);
  const { hooks, focus } = mountButton();
  const blur = focus()();
  blur(); assert.equal(await hooks.flush(), null);
});

test('Refresh lives in the Garden HUD (outside the canvas) and steps aside for panels, cards and saves', () => {
  const hud = read('../src/components/garden/GardenHud.tsx'), scene = read('../src/components/garden/GardenScene.tsx');
  assert.match(hud, /!openFeature && !entryOpen && !bondOpen && !momentsOpen && !avatarsOpen && !isSaving \? <GardenRefreshButton/);
  // The HUD already disappears while a flower is open, planted or moved.
  assert.match(hud, /if \(activeMode !== 'normal' \|\| selectedFlower\) return null;/);
  assert.doesNotMatch(scene, /GardenRefreshButton/);
  assert.doesNotMatch(read('../src/app/visit/[ownerId].tsx'), /GardenRefreshButton/);
  assert.doesNotMatch(read('../src/components/garden/GuestGardenHud.tsx'), /GardenRefreshButton/);
});
