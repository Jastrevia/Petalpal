import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const load = loadPlantingModules(undefined, undefined, undefined, true, {});
const { createStaticRunHost, sameCamera, SETTLE_MS } = load('../gardenStaticRuns');

const makeRun = (camera, picture = 'world') => {
  const run = { camera: () => run.at, at: camera, picture: () => picture, shot: null, captures: 0,
    snapshotCamera: () => run.shot, capture(_, seen) { run.shot = seen; run.captures++; },
    invalidate() { const had = !!run.shot; run.shot = null; return had; } };
  return run;
};
const camera = { x: 1, y: 2, zoom: .5 };

test('a snapshot is taken only once the camera has rested, and only once', () => {
  const host = createStaticRunHost(), run = makeRun(camera);
  host.add(run);
  host.step(0); host.step(SETTLE_MS - 1);
  assert.equal(run.captures, 0);
  host.step(SETTLE_MS);
  assert.equal(run.captures, 1);
  host.step(SETTLE_MS + 500);
  assert.equal(run.captures, 1);
});

test('a moving camera never takes one, and a new resting place takes a new one', () => {
  const host = createStaticRunHost(), run = makeRun(camera);
  host.add(run);
  for (let now = 0; now < 2000; now += 16) { run.at = { ...camera, x: now }; host.step(now); }
  assert.equal(run.captures, 0);
  host.step(2000); host.step(2000 + SETTLE_MS);
  assert.equal(run.captures, 1);
  assert.ok(sameCamera(run.shot, run.at));
});

test('at most one snapshot per frame, so taking them never adds up', () => {
  const host = createStaticRunHost(), runs = [makeRun(camera), makeRun(camera), makeRun(camera)];
  runs.forEach(run => host.add(run));
  host.step(0);
  host.step(SETTLE_MS);
  assert.deepEqual(runs.map(run => run.captures), [1, 0, 0]);
  host.step(SETTLE_MS + 16);
  assert.deepEqual(runs.map(run => run.captures), [1, 1, 0]);
  host.step(SETTLE_MS + 32);
  assert.deepEqual(runs.map(run => run.captures), [1, 1, 1]);
});

test('layers still loading wait, and a replaced surface drops every snapshot', () => {
  const host = createStaticRunHost(), waiting = makeRun(camera, null), ready = makeRun(camera);
  host.add(waiting); host.add(ready);
  assert.equal(host.invalidateAll(), false, 'nothing showing, so no frame has to wait');
  host.step(0); host.step(SETTLE_MS);
  assert.equal(waiting.captures, 0);
  assert.equal(ready.captures, 1);
  assert.equal(host.invalidateAll(), true, 'the frame must be recorded anew before painting');
  assert.equal(ready.shot, null);
  host.step(SETTLE_MS + 16);
  assert.equal(ready.captures, 2);
});
