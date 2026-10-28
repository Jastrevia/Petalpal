import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const visits = load('../critters/critterVisits');
const { WALK_NETWORK, safeSegment } = load('../fairy/walkNetwork');
const { isGardenGroundBlocked } = load('../fairy/gardenGround');
const plain = value => JSON.parse(JSON.stringify(value));
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const edges = visits.walkableEdges(WALK_NETWORK, isGardenGroundBlocked, (a, b) => safeSegment(a, b, isGardenGroundBlocked));
const points = WALK_NETWORK.nodes.filter(node => !isGardenGroundBlocked(node));

test('walkers only use connected dry paths and never stand in the pond', () => {
  assert.ok(edges.length > 10, 'the Garden has dry paths to walk');
  const connected = new Set(edges.flatMap(edge => [`${edge.a}-${edge.b}`, `${edge.b}-${edge.a}`]));
  const index = point => WALK_NETWORK.nodes.indexOf(point);
  for (let seed = 1; seed <= 60; seed++) {
    const path = visits.planWalk(WALK_NETWORK, edges, seeded(seed));
    assert.ok(path.length >= 2);
    for (let i = 1; i < path.length; i++) {
      assert.ok(connected.has(`${index(path[i - 1])}-${index(path[i])}`), 'each step follows a dry path segment');
      assert.ok(safeSegment(path[i - 1], path[i], isGardenGroundBlocked));
    }
  }
});

test('flyers hop between dry path points, high above them', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const spec = visits.CRITTERS.butterfly;
    const path = visits.planFlight(points, spec, seeded(seed));
    assert.ok(path.length >= 3);
    for (const stop of path) {
      const under = points.find(point => point.x === stop.x && point.y - stop.y >= spec.altitude[0] - 1e-9 && point.y - stop.y <= spec.altitude[1] + 1e-9);
      assert.ok(under, 'every stop is above a dry path point within the altitude band');
    }
  }
});

test('at most two visitors, never the same one twice at once', () => {
  const random = seeded(7);
  const active = [];
  for (let key = 1; key <= 5; key++) {
    const visit = visits.planVisit({ key, now: 0, active, network: WALK_NETWORK, edges, points, random });
    if (active.length >= visits.MAX_VISITORS) assert.equal(visit, null);
    else { assert.ok(visit); assert.ok(!active.some(item => item.id === visit.id)); active.push(visit); }
  }
  assert.equal(active.length, 2);
});

test('a visit fades in, travels its whole path in its rhythm, and fades out', () => {
  for (const id of visits.CRITTER_IDS) {
    let visit = null;
    for (let seed = 1; !visit || visit.id !== id; seed++) visit = visits.planVisit({ key: 1, now: 100, active: [], network: WALK_NETWORK, edges, points, random: seeded(seed) });
    const start = plain(visits.visitPose(visit, 100)), mid = plain(visits.visitPose(visit, 100 + visit.duration / 2));
    const end = plain(visits.visitPose(visit, 100 + visit.duration));
    assert.equal(start.opacity, 0, `${id} starts invisible`);
    assert.equal(mid.opacity, 1, `${id} is fully visible mid-visit`);
    assert.ok(end.opacity < 1e-9, `${id} ends invisible`);
    const last = visit.path.at(-1);
    assert.ok(Math.hypot(end.x - last.x, end.y - last.y) < 1e-6, `${id} reaches the end of its path`);
    // Travel never goes backwards.
    let previous = -1;
    for (let s = 0; s <= visit.duration; s += 0.05) {
      const moved = visits.travelled(s, visit.rhythm);
      assert.ok(moved >= previous - 1e-9); previous = moved;
    }
  }
});

test('rhythms: steady flyers glide, hoppers and darters move in bursts', () => {
  const steady = visits.RHYTHMS.bluebird, hop = visits.RHYTHMS.rabbit;
  assert.equal(visits.travelled(2, steady), 2);
  // A rabbit is still for the second half of each 0.9 s hop.
  assert.equal(visits.travelled(0.9 * 0.5, hop), visits.travelled(0.9 * 0.99, hop));
  assert.ok(visits.travelled(0.9 * 0.25, hop) > 0);
});
