import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

function lighting(enabled, reduced = false) {
  const transitions = [], active = [];
  const react = { useState: value => [value, next => active.push(next)], useEffect: fn => fn() };
  const animation = {
    useReducedMotion: () => reduced, useSharedValue: value => ({ value }),
    useDerivedValue: fn => ({ value: fn() }), cancelAnimation: () => {}, runOnJS: fn => fn,
    withTiming: (target, options, complete) => { transitions.push({ target, ...options }); complete(true); return target; },
  };
  const load = loadPlantingModules(undefined, react, undefined, true, { 'react-native-reanimated': animation });
  const module = load('../lanterns/nightLighting');
  return { ...module.useNightLighting(enabled), matrixAt: module.nightColorMatrix, transitions, active };
}

test('day is the exact identity grade; midnight retains alpha and blue water visibility', () => {
  const { matrixAt } = lighting(false);
  assert.deepEqual(Array.from(matrixAt(0)), [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0]);
  const night = Array.from(matrixAt(1));
  assert.deepEqual(night.slice(15), [0,0,0,1,0]);
  const water = [.3,.65,.75];
  const rgb = [0,1,2].map(row => night[row*5+4] + water.reduce((sum,c,i) => sum+c*night[row*5+i],0));
  assert.ok(rgb[2] > rgb[1] && rgb[1] > rgb[0]);
  assert.ok(rgb[1] > .2, 'water remains readable');
});

test('one shared amount turns all emission and grade on/off with Swing fade durations', () => {
  const on = lighting(true), off = lighting(false), reduced = lighting(true,true);
  assert.deepEqual(on.transitions, [{ target: 1, duration: 1000 }]);
  assert.deepEqual(off.transitions, [{ target: 0, duration: 800 }]);
  assert.deepEqual(reduced.transitions, [{ target: 1, duration: 0 }]);
  assert.equal(on.amount.value, 1);
  assert.equal(off.amount.value, 0);
  assert.deepEqual(off.active, [false], 'completed daytime transition releases the scene layer');
});
