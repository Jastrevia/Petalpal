import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const hud = read('../src/components/garden/GardenHud.tsx');
const scene = read('../src/components/garden/GardenScene.tsx');

test('the bottom navigation layer stays above every Garden overlay', () => {
  const layer = Number(hud.match(/layer: \{ zIndex: (\d+) \}/)?.[1]);
  assert.ok(layer > 0, 'GardenHud declares its layer');
  assert.match(hud, /pointerEvents="box-none" style=\{\[StyleSheet\.absoluteFill, styles\.layer\]\}/);
  // The DEV-only floating toggle (9999) never ships; every released overlay must sit below the HUD.
  const overlays = [...scene.matchAll(/zIndex: ?(\d+)/g)].map(match => Number(match[1])).filter(z => z !== 9999);
  assert.ok(overlays.length > 0);
  for (const z of overlays) assert.ok(z < layer, `scene overlay zIndex ${z} must stay below the HUD (${layer})`);
});

test('leaving Reflection returns to the existing Garden instead of mounting another', () => {
  const reflection = read('../src/app/reflection.tsx');
  assert.doesNotMatch(reflection, /router\.replace\(/);
  assert.match(reflection, /router\.canGoBack\(\) \? router\.back\(\) : router\.dismissTo\('\/'\)/);
});
