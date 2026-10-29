import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const fly = load('../critters/butterflyStones');
const sky = load('../critters/gardenResidents');
const { isOnMonthLawn } = load('../fairy/gardenGround');
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const lawns = fly.STONES.map((_, i) => fly.stoneLawn(i, isOnMonthLawn));

test('every stone belongs to a lawn', () => {
  lawns.forEach((lawn, i) => assert.ok(lawn !== null, `stone ${i} is on a lawn`));
});

test('the butterfly rests on stones and flutters to another, never onto the rabbit\'s lawn', () => {
  const random = seeded(4);
  let from = 0, now = 0;
  for (let i = 0; i < 40; i++) {
    const avoid = [lawns[(i * 5) % lawns.length]];
    const f = fly.planFlutter(from, now, random, s => lawns[s], avoid);
    assert.ok(f, 'finds a stone');
    assert.notEqual(f.to, f.from);
    assert.ok(!avoid.includes(lawns[f.to]), 'not on the avoided lawn');
    const before = fly.flutterPose(f, now - 1), after = fly.flutterPose(f, now + f.seconds + 1);
    assert.deepEqual([before.x, before.y, before.flying], [fly.STONES[from].x, fly.STONES[from].y, 0]);
    assert.deepEqual([after.x, after.y, after.flying], [fly.STONES[f.to].x, fly.STONES[f.to].y, 0]);
    from = f.to; now += f.seconds + fly.perchSeconds(random);
  }
});

test('the bluebird and the butterfly never share the sky', () => {
  sky.residents.bird = { start: 10, end: 20, to: { x: 0, y: 0 } };
  sky.residents.butterfly = null;
  assert.equal(sky.skyTaken('butterfly', 15), true, 'butterfly waits while the bird flies');
  assert.equal(sky.skyTaken('butterfly', 21), false);
  sky.residents.bird = null;
  sky.residents.butterfly = { start: 30, end: 36, to: { x: 0, y: 0 } };
  assert.equal(sky.skyTaken('bird', 33), true, 'bird waits while the butterfly flies');
  assert.equal(sky.skyTaken('bird', 37), false);
});
