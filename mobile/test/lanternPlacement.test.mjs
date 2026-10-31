import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const { INITIAL_LANTERNS: initial, validLanternPlacement: valid, parseLanternPlacements: parse } = load('../lanterns/lanternPlacement');
const plain = x => JSON.parse(JSON.stringify(x));

test('the Garden configuration exactly matches the owner export backup', () => {
  const backup = JSON.parse(fs.readFileSync(new URL('../src/components/garden/lanterns/approved-placements.backup.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  assert.deepEqual(plain(initial), backup);
});

test('normal Garden ignores stale editor storage and rejects transform writes', () => {
  let reads = 0, writes = 0;
  const react = { useState: value => [value, () => {}], useEffect: effect => effect() };
  const storage = { getItem: () => { reads++; throw new Error('must not read'); }, setItem: () => { writes++; } };
  const loadHook = loadPlantingModules(undefined, react, storage, true, {}, true);
  const { useLanternPlacements } = loadHook('../lanterns/useLanternPlacements');
  const result = useLanternPlacements(false);
  assert.deepEqual(plain(result.placements), plain(initial));
  result.update({ ...initial[0], x: initial[0].x + 1 });
  result.save();
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test('fixed roster has twelve grounded lanterns and four floating lotus pads', () => {
  assert.equal(initial.length, 16);
  assert.equal(new Set(initial.map(p => p.id)).size, 16);
  for (const [kind, count] of [['ground', 12], ['lotus', 4]]) {
    assert.deepEqual(plain(initial.filter(p => p.kind === kind).map(p => p.id)),
      Array.from({ length: count }, (_, i) => `${kind}-lantern-${String(i + 1).padStart(2, '0')}`));
  }
  for (const p of initial) assert.ok(valid(p), p.id);
});

test('each transform round-trips with stable identity and no redistribution', () => {
  for (let i = 0; i < initial.length; i++) {
    const changed = plain(initial);
    changed[i].scale = .6;
    changed[i].rotation = 5;
    assert.ok(valid(changed[i]));
    assert.deepEqual(plain(parse(JSON.stringify(changed))), changed);
  }
});

test('reject water/land mismatch, out of world, unsafe scale and malformed storage', () => {
  const ground = initial[0], lotus = initial[12];
  assert.equal(valid({ ...ground, x: lotus.x, y: lotus.y }), false);
  assert.equal(valid({ ...lotus, x: ground.x, y: ground.y }), false);
  for (const patch of [{ x: -10 }, { y: 9999 }, { scale: 0 }, { scale: 20 }, { rotation: Infinity }, { x: NaN }])
    assert.equal(valid({ ...ground, ...patch }), false);
  for (const raw of ['bad', '{}', 'null', JSON.stringify(initial.slice(1)),
    JSON.stringify([...initial.slice(0, 15), initial[0]])]) assert.equal(parse(raw), null);
});
