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

test('at most MAX_VISITORS visitors, never the same one twice at once', () => {
  const random = seeded(7);
  const active = [];
  for (let key = 1; key <= 5; key++) {
    const visit = visits.planVisit({ key, now: 0, active, network: WALK_NETWORK, edges, points, random });
    if (active.length >= visits.MAX_VISITORS) assert.equal(visit, null);
    else { assert.ok(visit); assert.ok(!active.some(item => item.id === visit.id)); active.push(visit); }
  }
  assert.equal(active.length, visits.MAX_VISITORS);
});

test('a visitor fades in, travels its whole path in its rhythm, and stays in sight', () => {
  for (const id of visits.CRITTER_IDS) {
    let visit = null;
    for (let seed = 1; !visit || visit.id !== id; seed++) visit = visits.planVisit({ key: 1, now: 100, active: [], network: WALK_NETWORK, edges, points, random: seeded(seed) });
    const start = plain(visits.visitPose(visit, 100)), mid = plain(visits.visitPose(visit, 100 + visit.duration / 2));
    const end = plain(visits.visitPose(visit, 100 + visit.duration));
    assert.equal(start.opacity, 0, `${id} starts invisible`);
    assert.equal(mid.opacity, 1, `${id} is fully visible mid-visit`);
    assert.equal(end.opacity, 1, `${id} does not fade out: it stays`);
    const length = visits.pathLength(visit.path), burst = visit.rhythm.cycle * visit.rhythm.moving * visit.speed;
    const gone = visits.visitDistance(visit, 100 + visit.duration);
    assert.ok(gone <= length + 1e-6 && gone >= length - (burst || 1e-6) - 1e-6, `${id} ends on its path, at most one burst short of the end`);
    // Travel never goes backwards.
    let previous = -1;
    for (let s = 0; s <= visit.duration; s += 0.05) {
      const moved = visits.travelled(s, visit.rhythm);
      assert.ok(moved >= previous - 1e-9); previous = moved;
    }
  }
});

test('rhythms: steady flyers glide, the rabbit moves in hops', () => {
  const steady = visits.RHYTHMS.bluebird, hop = visits.RHYTHMS.rabbit;
  assert.equal(visits.travelled(2, steady), 2);
  // A rabbit is still for the second half of each hop cycle.
  assert.equal(visits.travelled(hop.cycle * 0.5, hop), visits.travelled(hop.cycle * 0.99, hop));
  assert.ok(visits.travelled(hop.cycle * 0.25, hop) > 0);
});

test('distance along the path grows with travel and stops at the end', () => {
  const visit = { key: 1, id: 'puppy', path: [{ x: 0, y: 0 }, { x: 300, y: 0 }], start: 10, duration: 0, speed: 62, rhythm: visits.RHYTHMS.puppy, lead: visits.FADE_SECONDS, fadeIn: true, walked: 0 };
  visit.duration = visits.FADE_SECONDS + visits.travelSeconds(visits.pathLength(visit.path) / visit.speed, visit.rhythm);
  assert.equal(visits.visitDistance(visit, 10), 0);
  let previous = 0;
  for (let s = 10; s <= 10 + visit.duration; s += 0.1) {
    const d = visits.visitDistance(visit, s);
    assert.ok(d >= previous - 1e-9); previous = d;
  }
  const end = visits.visitDistance(visit, 10 + visit.duration + 5);
  assert.ok(end <= 300 && end > 300 - 62 * 7 * 0.8, 'stops on the path, short of the end by less than one burst');
});

test('every rabbit pause lands on a whole hop, so its painted frames show it sitting', () => {
  const hop = visits.burstLength('rabbit'), rhythm = visits.RHYTHMS.rabbit;
  assert.ok(Math.abs(hop - 75.7) < 1, 'one hop covers the ground its painted hop does');
  const visit = { key: 1, id: 'rabbit', path: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], start: 0, duration: 0, speed: visits.CRITTERS.rabbit.speed, rhythm, lead: visits.FADE_SECONDS, fadeIn: true, walked: 0 };
  visit.duration = visits.FADE_SECONDS + visits.travelSeconds(visits.pathLength(visit.path) / visit.speed, rhythm);
  for (let burst = 1; burst * rhythm.cycle < visit.duration - visits.FADE_SECONDS; burst++) {
    // Mid-pause, after this burst.
    const d = visits.visitDistance(visit, visits.FADE_SECONDS + (burst - 0.25) * rhythm.cycle);
    assert.ok(Math.abs(d - burst * hop) < 1e-6, `pause ${burst} at ${d.toFixed(2)}, not ${(burst * hop).toFixed(2)}`);
  }
});

test('visitors stay: each leg rests where the last one stopped, then sets off on dry paths', () => {
  const walkable = new Set(edges.map(edge => `${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`));
  for (const id of visits.CRITTER_IDS) {
    let visit = null;
    for (let seed = 1; !visit || visit.id !== id; seed++) visit = visits.planVisit({ key: 7, now: 0, active: [], network: WALK_NETWORK, edges, points, random: seeded(seed) });
    const random = seeded(99);
    for (let leg = 0; leg < 12; leg++) {
      const end = visit.start + visit.duration, stop = plain(visits.visitPose(visit, end));
      const walked = visit.walked + visits.visitDistance(visit, end);
      const next = visits.planNextLeg({ visit, now: end + 0.1, network: WALK_NETWORK, edges, points, random });
      assert.ok(next, `${id} finds a way on after leg ${leg}`);
      const rest = plain(visits.visitPose(next, end + 0.1)), [low, high] = visits.REST[id];
      assert.ok(Math.hypot(rest.x - stop.x, rest.y - stop.y) < 1e-6, `${id} leg ${leg + 1} starts where leg ${leg} stopped`);
      assert.equal(rest.opacity, 1, `${id} does not fade between legs`);
      assert.equal(next.key, visit.key, 'the same visitor');
      assert.ok(next.lead >= low && next.lead <= high, `${id} rests ${next.lead.toFixed(2)} s`);
      assert.ok(Math.abs(next.walked - walked) < 1e-6, `${id} strides carry on from the ground already covered`);
      if (visits.CRITTERS[id].kind === 'walker') {
        // After the stretch to the node ahead, only dry path segments.
        const nodes = next.path.map(point => WALK_NETWORK.nodes.indexOf(point));
        for (let i = 2; i < nodes.length; i++) assert.ok(walkable.has(`${Math.min(nodes[i - 1], nodes[i])}-${Math.max(nodes[i - 1], nodes[i])}`), `${id} leg ${leg + 1} keeps to dry paths`);
        assert.ok(nodes[1] >= 0 && nodes.slice(1).every(n => n >= 0), `${id} heads for path points`);
      }
      visit = next;
    }
  }
});

test('visitors go home only after the Garden has been away a good while', () => {
  assert.ok(visits.AWAY_SECONDS >= 5 * 60);
});

const ground = load('../fairy/gardenGround');
const lawnsWith = (unplanted, taken = () => []) => ({ unplanted, taken, isOn: ground.isOnMonthLawn, bounds: ground.monthLawnBounds });

test('the rabbit and the hedgehog stroll only inside an unplanted lawn, clear of its edge', () => {
  for (let month = 1; month <= 12; month++) {
    const lawns = lawnsWith([month]);
    const path = visits.planLawnWalk(month, lawns, seeded(month));
    assert.ok(path, `a stroll fits on lawn ${month}`);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      for (let s = 0; s <= d; s += 4) {
        const p = { x: a.x + (b.x - a.x) * s / d, y: a.y + (b.y - a.y) * s / d };
        assert.ok(ground.isOnMonthLawn(month, p), `lawn ${month} stroll stays on the lawn`);
      }
    }
  }
});

test('one animal to a lawn; planted lawns are off limits; with none left they walk the paths', () => {
  const taken = { rabbit: [], hedgehog: [] };
  const lawns = lawnsWith([3, 7], id => (id === 'rabbit' ? taken.hedgehog : taken.rabbit));
  const random = seeded(11);
  const active = [];
  for (let key = 1; key <= 6 && active.length < visits.MAX_VISITORS; key++) {
    const visit = visits.planVisit({ key, now: 0, active, network: WALK_NETWORK, edges, points, random, lawns });
    if (!visit) continue;
    active.push(visit);
    if (visit.id === 'rabbit' || visit.id === 'hedgehog') {
      assert.ok([3, 7].includes(visit.lawn), `${visit.id} is on an unplanted lawn`);
      taken[visit.id] = [visit.lawn];
    }
  }
  const rabbit = active.find(v => v.id === 'rabbit'), hedgehog = active.find(v => v.id === 'hedgehog');
  if (rabbit && hedgehog) assert.notEqual(rabbit.lawn, hedgehog.lawn, 'never the same lawn');
  // Every lawn planted: a lawn animal walks the paths instead.
  let onPaths = null;
  for (let seed = 1; !onPaths; seed++) {
    const v = visits.planVisit({ key: 1, now: 0, active: [], network: WALK_NETWORK, edges, points, random: seeded(seed), lawns: lawnsWith([]) });
    if (v && v.id === 'rabbit') onPaths = v;
  }
  assert.equal(onPaths.lawn, undefined);
  // Only one free lawn, already taken: the other lawn animal stays away.
  const full = lawnsWith([5], () => [5]);
  for (let seed = 1; seed < 40; seed++) {
    const v = visits.planVisit({ key: 1, now: 0, active: [], network: WALK_NETWORK, edges, points, random: seeded(seed), lawns: full });
    assert.ok(!v || (v.id !== 'rabbit' && v.id !== 'hedgehog'), 'no lawn for it, so it does not come');
  }
});

test('a lawn animal whose lawn gets flowers fades out where it stands', () => {
  const lawns = lawnsWith([4]);
  const path = visits.planLawnWalk(4, lawns, seeded(2));
  const visit = { key: 1, id: 'rabbit', path, start: 0, duration: 20, speed: 138, rhythm: visits.RHYTHMS.rabbit, lead: 0.8, fadeIn: true, walked: 0, lawn: 4 };
  const at = plain(visits.visitPose(visit, 5)), gone = visits.leaveVisit(visit, 5);
  const start = plain(visits.visitPose(gone, 5)), end = plain(visits.visitPose(gone, 5 + visits.FADE_SECONDS));
  assert.ok(Math.hypot(start.x - at.x, start.y - at.y) < 1e-6 && start.opacity === 1, 'fades from where it was');
  assert.ok(end.opacity < 1e-9, 'gone after the fade');
});

test('the puppy chases the bluebird at a run, sits where it caught up, then strolls on', () => {
  const nodes = WALK_NETWORK.nodes, edge = edges[0];
  const a = nodes[edge.a], b = nodes[edge.b];
  const walking = { key: 1, id: 'puppy', path: [a, b], start: 0, lead: 0, fadeIn: false, walked: 0, duration: 100,
    speed: visits.CRITTERS.puppy.speed, rhythm: visits.RHYTHMS.puppy };
  assert.equal(visits.planChase({ visit: walking, now: 1, path: [a, { x: a.x + 10, y: a.y }] }), null, 'too short a run is not worth it');
  const chase = visits.planChase({ visit: walking, now: 1, path: [a, b] });
  assert.ok(chase.chase && !chase.rising && chase.speed === visits.RUN_SPEED);
  assert.ok(Math.abs(chase.duration - (chase.lead + visits.pathLength([a, b]) / visits.RUN_SPEED)) < 1e-9);
  // Caught up: it sits a while, then walks on at its own pace.
  const sitting = visits.planNextLeg({ visit: chase, now: chase.start + chase.duration, network: WALK_NETWORK, edges, points, random: seeded(3) });
  assert.ok(sitting && sitting.sits && !sitting.chase);
  assert.ok(sitting.lead >= visits.SIT_SECONDS[0] && sitting.lead <= visits.SIT_SECONDS[1]);
  assert.equal(sitting.speed, visits.CRITTERS.puppy.speed);
  // Off again while sitting: it gets up first.
  const again = visits.planChase({ visit: sitting, now: sitting.start + 2, path: [sitting.path[0], b] });
  if (again) assert.ok(again.rising && again.lead === visits.RISE_SECONDS);
  // A walk after the sit is an ordinary one.
  const on = visits.planNextLeg({ visit: sitting, now: sitting.start + sitting.duration, network: WALK_NETWORK, edges, points, random: seeded(4) });
  assert.ok(on && !on.sits && !on.chase);
});
