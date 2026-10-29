import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const bird = load('../spirits/bluebirdPerch');
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

test('the bluebird sits on a perch, flies to a different one, and lands exactly on it', () => {
  const random = seeded(3);
  let from = 0, facing = 1, now = 0;
  for (let i = 0; i < 30; i++) {
    const hop = bird.planHop(from, facing, now, random);
    assert.notEqual(hop.to, hop.from, 'always a different perch');
    const before = bird.hopPose(hop, now - 1), after = bird.hopPose(hop, now + bird.hopSeconds(hop) + 1);
    assert.deepEqual([before.x, before.y, before.cell], [bird.PERCHES[from].x, bird.PERCHES[from].y, 0], 'perched before');
    assert.deepEqual([after.x, after.y, after.cell], [bird.PERCHES[hop.to].x, bird.PERCHES[hop.to].y, 0], 'perched after');
    assert.equal(before.facing, facing, 'still facing the way it landed');
    from = hop.to; facing = after.facing; now += bird.hopSeconds(hop) + bird.nextPerchWait(random);
  }
});

test('in the air it never turns round, never leaves frames unplayed, and lands with take-off backwards', () => {
  const hop = bird.planHop(1, 1, 0, seeded(9));
  const end = bird.hopSeconds(hop);
  let previousX = null, sawFly = false;
  for (let t = 0.31; t < end; t += 1 / 24) {
    const p = bird.hopPose(hop, t);
    assert.equal(p.facing, hop.facing, 'one heading for the whole flight');
    if (previousX !== null) assert.ok((p.x - previousX) * hop.facing >= -1e-9, 'never doubles back');
    previousX = p.x;
    assert.ok(p.cell >= 0 && p.cell < bird.TAKEOFF.count + bird.FLY.count);
    // In the air: past the perched cells (take-off's own flapping, or the wingbeat loop).
    if (p.cell > bird.TAKEOFF.lift + 10) sawFly = true;
  }
  assert.ok(sawFly, 'beats its wings on the way');
  assert.ok(bird.hopPose(hop, end - 0.05).cell < bird.TAKEOFF.lift, 'ends perched, take-off played backwards');
});

test('it waits about a minute between flights', () => {
  const random = seeded(5);
  for (let i = 0; i < 50; i++) { const w = bird.nextPerchWait(random); assert.ok(w >= 50 && w <= 70); }
});
