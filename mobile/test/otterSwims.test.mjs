import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const otter = load('../spirits/otterSwims');
const { gardenGroundKind } = load('../fairy/gardenGround');
const isWater = p => gardenGroundKind(p) === 'water';
const bounds = { minX: 60, minY: 40, maxX: 2340, maxY: 1620 };
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

test('Memory Otter swims only open water, near level, and surfaces near where it dived', () => {
  const random = seeded(7);
  let swim = otter.planSwim({ from: null, now: 0, isWater, bounds, random });
  assert.ok(swim, 'finds open water');
  for (let i = 0; i < 40; i++) {
    const { a, b } = swim, length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = 0; s <= length; s += 10) {
      const p = { x: a.x + (b.x - a.x) * s / length, y: a.y + (b.y - a.y) * s / length };
      assert.ok(otter.isOpenWater(p, isWater), `swim ${i} keeps clear of the shore at ${Math.round(p.x)}, ${Math.round(p.y)}`);
    }
    assert.ok(Math.abs(Math.atan2(b.y - a.y, Math.abs(b.x - a.x))) <= 0.41, `swim ${i} stays near level`);
    for (const p of [a, b]) assert.ok(p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY, `swim ${i} stays where it can be seen`);
    const next = otter.planSwim({ from: b, now: otter.swimEnd(swim), isWater, bounds, random });
    if (!next) break;
    assert.ok(Math.hypot(next.a.x - b.x, next.a.y - b.y) <= 400 + 1e-6, `swim ${i + 1} surfaces near where it dived`);
    swim = next;
  }
});

test('it rises, swims and dives smoothly, then stays hidden until the next swim', () => {
  const swim = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, start: 10, swim: 300 / otter.OTTER_SPEED, under: 2 };
  assert.equal(otter.swimPose(swim, 10).opacity, 0);
  const mid = otter.swimPose(swim, 10 + otter.OTTER_FADE + swim.swim / 2);
  assert.equal(mid.opacity, 1); assert.ok(Math.abs(mid.x - 150) < 1e-6);
  assert.equal(otter.swimPose(swim, 10 + otter.OTTER_FADE * 2 + swim.swim).opacity, 0, 'under after diving');
  let previous = 0;
  for (let t = 10; t <= 10 + otter.OTTER_FADE; t += 0.05) {
    const o = otter.swimPose(swim, t).opacity; assert.ok(o >= previous - 1e-9, 'fades in, never pops'); previous = o;
  }
  assert.equal(otter.swimPose({ ...swim, b: { x: -300, y: 0 } }, 12).facing, -1, 'faces the way it swims');
});
