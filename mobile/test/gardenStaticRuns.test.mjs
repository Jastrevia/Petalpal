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

// The native snapshot's reach (GardenStaticRun.tsx). Camera here is the scene transform: zoom is the full scale.
const { planSnapshotReach, snapshotReachAt, snapshotStillBest, SNAPSHOT_SCREENS } = load('../gardenStaticRuns');
const BOUNDS = { x: 0, y: -309, width: 2400, height: 2119 };
const range = (width, height, zoom) => ({ minX: width - (BOUNDS.x + BOUNDS.width) * zoom, maxX: -BOUNDS.x * zoom,
  minY: height - (BOUNDS.y + BOUNDS.height) * zoom, maxY: -BOUNDS.y * zoom });

test('at the widest view one snapshot covers every place a phone can drag to, within its pixel budget', () => {
  for (const [width, height] of [[393, 852], [430, 932], [375, 667], [852, 393]]) {
    const zoom = Math.max(width / BOUNDS.width, height / BOUNDS.height), r = range(width, height, zoom);
    for (const x of [r.minX, (r.minX + r.maxX) / 2 + .37, r.maxX]) for (const y of [r.minY, r.maxY]) {
      const taken = { x, y, zoom }, reach = planSnapshotReach(taken, width, height, BOUNDS);
      assert.ok((width + reach.left + reach.right) * (height + reach.top + reach.bottom) <= SNAPSHOT_SCREENS * width * height);
      for (const value of Object.values(reach)) assert.ok(Number.isInteger(value) && value >= 0);
      for (const to of [r.minX, r.maxX, Math.min(r.maxX, x + 60.25)]) for (const toY of [r.minY, r.maxY]) {
        const left = snapshotReachAt(taken, reach, { x: to, y: toY, zoom });
        assert.ok(left, `${width}x${height}: still covered`);
        // Having slid there, the same snapshot is as good as a new one: nothing is taken again.
        assert.ok(snapshotStillBest(left, planSnapshotReach({ x: to, y: toY, zoom }, width, height, BOUNDS)));
      }
    }
  }
});

test('zoomed in, the budget is kept and shared around the screen, more on the side with room', () => {
  const width = 393, height = 852, zoom = 1.2, r = range(width, height, zoom);
  const middle = planSnapshotReach({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2, zoom }, width, height, BOUNDS);
  assert.ok((width + middle.left + middle.right) * (height + middle.top + middle.bottom) <= SNAPSHOT_SCREENS * width * height);
  assert.ok(middle.left >= width * .2 && middle.top >= height * .2, 'no less than the old fifth of a screen');
  assert.ok(Math.abs(middle.left - middle.right) <= 1 && Math.abs(middle.top - middle.bottom) <= 1);
  const corner = planSnapshotReach({ x: r.maxX, y: r.maxY, zoom }, width, height, BOUNDS);
  assert.ok(corner.left <= 1 && corner.top <= 1 && corner.right > middle.right && corner.bottom > middle.bottom);
});

test('a snapshot stops covering past its reach or at another zoom, and is then taken again', () => {
  const taken = { x: -100, y: -50, zoom: 1.2 }, reach = { left: 80, right: 80, top: 100, bottom: 100 };
  assert.ok(snapshotReachAt(taken, reach, { x: -20.5, y: -50, zoom: 1.2 }));
  assert.equal(snapshotReachAt(taken, reach, { x: -20.4, y: -50, zoom: 1.2 }), null);
  assert.equal(snapshotReachAt(taken, reach, { x: -100, y: 51, zoom: 1.2 }), null);
  assert.equal(snapshotReachAt(taken, reach, { ...taken, zoom: 1.21 }), null);
  assert.equal(snapshotStillBest(null, reach), false);
  assert.equal(snapshotStillBest(snapshotReachAt(taken, reach, { x: -60, y: -50, zoom: 1.2 }), reach), false, 'off centre: taken again at rest');
});
