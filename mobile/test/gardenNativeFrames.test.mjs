import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const load = loadPlantingModules(undefined, undefined, undefined, true, { 'react-native-reanimated': { runOnUI: run => run } });
const { createFrameGate } = load('../gardenNativeFrames');

const setup = () => {
  let time = 100_000; const queue = [], painted = [];
  const gate = createFrameGate(7, () => time, run => queue.push(run));
  const frame = name => { time += 16.7; queue.splice(0).forEach(run => run()); if (!gate.hold(7, () => painted.push(name))) painted.push(name); };
  return { gate, frame, painted, advance: ms => { time += ms; }, runQueued: () => queue.splice(0).forEach(run => run()), queue };
};

test('left alone the Garden paints every other frame; other canvases are never held', () => {
  const { gate, frame, painted, advance } = setup();
  advance(10_000);
  for (let i = 0; i < 60; i++) frame(i);
  assert.ok(painted.length >= 28 && painted.length <= 32, `painted ${painted.length} of 60`);
  assert.equal(gate.hold(8, () => {}), false);
});

test('a touch and the moments after it paint every frame', () => {
  const { gate, frame, painted, advance } = setup();
  advance(10_000);
  gate.touch(true);
  for (let i = 0; i < 30; i++) frame(i);
  assert.equal(painted.length, 30);
  gate.touch(false);
  for (let i = 30; i < 60; i++) frame(i);
  assert.equal(painted.length, 60);
});

test('a moving camera counts as touched', () => {
  const { gate, frame, painted, advance } = setup();
  advance(10_000);
  gate.moved();
  for (let i = 0; i < 30; i++) frame(i);
  assert.equal(painted.length, 30);
});

test('the last frame before everything stops is still painted', () => {
  const { gate, painted, advance, runQueued, queue } = setup();
  advance(10_000);
  assert.equal(gate.hold(7, () => painted.push('first')), false);
  advance(16);
  assert.equal(gate.hold(7, () => painted.push('last')), true);
  assert.deepEqual(painted, []);
  runQueued();
  assert.deepEqual(painted, [], 'still too soon');
  assert.equal(queue.length, 1);
  advance(20);
  runQueued();
  assert.deepEqual(painted, ['last']);
});
