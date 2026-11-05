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
  assert.ok(Math.abs(hop - 45.3) < 1, 'one hop covers the ground its painted hop does');
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
  // A change of outfit mid-run: the chase ends where it is, and the next leg is the sit.
  const mid = chase.start + chase.lead + 0.5, stopped = visits.stopChase(chase, mid);
  assert.ok(Math.abs(stopped.start + stopped.duration - mid) < 1e-9 && stopped.chase);
  const held = visits.visitPose(stopped, mid + 3), there = visits.visitPose(chase, mid);
  assert.ok(Math.hypot(held.x - there.x, held.y - there.y) < 1e-6, 'stays where it stopped');
  const sitsDown = visits.planNextLeg({ visit: stopped, now: mid, network: WALK_NETWORK, edges, points, random: seeded(5) });
  assert.ok(sitsDown && sitsDown.sits && !sitsDown.chase);
  assert.equal(visits.stopChase(walking, 2), walking, 'only a run is stopped');
  // A walk after the sit is an ordinary one.
  const on = visits.planNextLeg({ visit: sitting, now: sitting.start + sitting.duration, network: WALK_NETWORK, edges, points, random: seeded(4) });
  assert.ok(on && !on.sits && !on.chase);
});

test('the puppy wears one painted look per outfit, one set at a time, and every look has its sheets', async () => {
  const fs = await import('node:fs');
  const looks = load('../critters/puppyLooks');
  const of = (hat, collar, pendant) => looks.puppyLookOf({ hat, collar, pendant });
  assert.equal(looks.puppyLookOf(null), 'bare');
  assert.equal(of(null, null, null), 'bare');
  // Set 1: a cape carries its own clasp, so a pendant shows only without one.
  assert.equal(of('lilac-beret', null, null), 'hat');
  assert.equal(of(null, null, 'compass-star'), 'necklace');
  assert.equal(of('lilac-beret', null, 'compass-star'), 'hat-necklace');
  assert.equal(of(null, 'lilac-cape', 'compass-star'), 'cape');
  assert.equal(of('lilac-beret', 'lilac-cape', null), 'cape-hat');
  // Set 2: the flower sprig, the petal capelet and the crystal drop.
  assert.equal(of('flower-sprig', null, null), 'hat2');
  assert.equal(of(null, null, 'crystal-drop'), 'necklace2');
  assert.equal(of('flower-sprig', null, 'crystal-drop'), 'hat-necklace2');
  assert.equal(of('flower-sprig', 'petal-capelet', 'crystal-drop'), 'cape2-hat');
  // Mixed sets: the cape's set wins, else the hat's; the other set's piece is left off.
  assert.equal(of('flower-sprig', 'lilac-cape', null), 'cape');
  assert.equal(of('lilac-beret', 'petal-capelet', null), 'cape2');
  assert.equal(of('flower-sprig', null, 'compass-star'), 'hat2');
  for (const [name, look] of Object.entries(looks.PUPPY_LOOKS)) {
    for (const source of [look.source, look.run.source, look.rest.source]) {
      assert.ok(fs.existsSync(new URL(`../${source.replace('@/', '')}`, import.meta.url)), `${name}: ${source}`);
    }
  }
  // Every clip can carry a step on into every other.
  for (const [from, to] of Object.entries(looks.MATCHING_FRAME))
    for (const [clip, frames] of Object.entries(to)) assert.equal(frames.length, Object.values(looks.PUPPY_LOOKS).find(l => l.clip === from).count, `${from} -> ${clip}`);
});

test('a tapped puppy sits where it is until let go, then gets up and walks on along its path', () => {
  const nodes = WALK_NETWORK.nodes, edge = edges[0];
  const a = nodes[edge.a], b = nodes[edge.b];
  const walking = { key: 1, id: 'puppy', path: [a, b], start: 0, lead: 0, fadeIn: false, walked: 5,
    speed: visits.CRITTERS.puppy.speed, rhythm: visits.RHYTHMS.puppy, duration: visits.travelSeconds(visits.pathLength([a, b]) / visits.CRITTERS.puppy.speed, visits.RHYTHMS.puppy) };
  const now = 1.5, there = visits.visitPose(walking, now);
  const held = visits.holdVisit(walking, now);
  assert.ok(held.held && held.sits && !held.chase && held.lead === visits.HOLD_SECONDS);
  assert.equal(visits.holdVisit(held, now + 1), held, 'holding twice changes nothing');
  for (const t of [now, now + 30, now + 600]) {
    const pose = visits.visitPose(held, t);
    assert.ok(Math.hypot(pose.x - there.x, pose.y - there.y) < 1e-6, 'stays where it was tapped');
  }
  assert.equal(Math.sign(visits.visitPose(held, now + 5).dx), Math.sign(there.dx), 'still faces the way it went');
  assert.ok(Math.abs(held.walked - (walking.walked + visits.visitDistance(walking, now))) < 1e-9, 'its stride carries on');
  assert.deepEqual(plain(held.path.at(-1)), plain(b), 'the rest of its path is kept');
  // Let go a while later: it gets up (rise seconds) and walks the rest of the way.
  const released = visits.releaseVisit(held, now + 20, 1.3, 1.25);
  assert.ok(!released.held && Math.abs(released.lead - (20 + 1.25)) < 1e-9);
  assert.ok(Math.abs(released.start + released.duration - (now + 21.25 + (held.duration - held.lead))) < 1e-9);
  const end = visits.visitPose(released, released.start + released.duration + 1);
  assert.ok(Math.hypot(end.x - b.x, end.y - b.y) < 1e-6);
  // Let go at once: it still finishes sitting down before it gets up.
  assert.ok(Math.abs(visits.releaseVisit(held, now + 0.2, 1.3, 1.25).lead - 2.55) < 1e-9);
  assert.equal(visits.releaseVisit(walking, now, 1, 1), walking, 'only a held pet is let go');
  // Tapped at the end of a leg, it sits on the path point it reached, and the next leg starts there.
  const done = visits.holdVisit(walking, walking.duration + 2);
  const next = visits.planNextLeg({ visit: visits.releaseVisit(done, walking.duration + 4, 1.3, 1.25), now: walking.duration + 9, network: WALK_NETWORK, edges, points, random: seeded(7) });
  assert.ok(next && Math.hypot(next.path[0].x - b.x, next.path[0].y - b.y) < 1e-6);
  // Sitting already (after a chase): it simply sits on.
  const sitting = { ...walking, sits: true, lead: 10, duration: 10 + walking.duration };
  const still = visits.holdVisit(sitting, 4);
  assert.ok(still.held && still.start === sitting.start && still.lead === 4 + visits.HOLD_SECONDS);
});

test('the pet ring is a 120° third of a ring beside the pet, whole on a phone screen', () => {
  const ring = load('../critters/petRing');
  const phone = { width: 375, height: 740 };
  for (const panel of [false, true]) {
    for (const pet of [{ x: 60, y: 400, body: 40 }, { x: 340, y: 300, body: 40 }, { x: 190, y: 90, body: 60 }, { x: 200, y: 720, body: 30 }]) {
      const layout = ring.ringLayout(pet, phone, panel);
      assert.equal(ring.RING_DEGREES, 120);
      assert.equal(ring.ringArc(layout).sweep, 120);
      // Its corners and its outer edge stay on screen, clear of the Garden's top buttons and tab bar.
      for (let t = -1; t <= 1; t += 0.25) for (const r of [layout.inner, layout.outer]) {
        const p = ring.ringPoint(layout, r, t);
        assert.ok(p.x >= 0 && p.x <= phone.width, `x ${p.x}`);
        assert.ok(p.y >= ring.TOP_CLEAR && p.y <= phone.height - ring.BOTTOM_CLEAR + 1e-9, `y ${p.y}`);
      }
      // Top to bottom: feed, pat, dress up.
      const spot = t => { const p = ring.ringPoint(layout, (layout.inner + layout.outer) / 2, t); return ring.ringSpot(layout, p.x, p.y); };
      assert.deepEqual([spot(-0.7).segment, spot(0).segment, spot(0.7).segment], [0, 1, 2]);
      assert.equal(ring.RING_ACTIONS.join(), 'feed,pat,dress');
      assert.equal(ring.ringSpot(layout, layout.cx, layout.cy), null, 'the pet itself is not part of the ring');
      assert.equal(ring.ringSpot(layout, layout.cx - layout.side * layout.outer * 0.8, layout.cy), null, 'nor the other side');
    }
  }
  // Room to its right: it opens to the right; at the right edge, to the left.
  // A press without a position (keyboard) is outside the ring, never an unknown segment.
  assert.equal(ring.ringSpot(ring.ringLayout({ x: 200, y: 400, body: 40 }, phone), undefined, undefined), null);
  assert.equal(ring.ringSpot(ring.ringLayout({ x: 200, y: 400, body: 40 }, phone), NaN, 400), null);
  assert.equal(ring.ringLayout({ x: 60, y: 400, body: 40 }, phone).side, 1);
  assert.equal(ring.ringLayout({ x: 340, y: 400, body: 40 }, phone).side, -1);
  const left = ring.ringLayout({ x: 340, y: 400, body: 40 }, phone), up = ring.ringPoint(left, left.outer, -1);
  assert.ok(up.y < left.cy && up.x < left.cx, 'on the left it still runs from top to bottom');
});

test('the wardrobe shows every piece, sends the whole outfit, and only opened pieces can be chosen', () => {
  const ring = load('../critters/petRing');
  const piece = (id, row, unlocked = true) => ({ id, row, collection: 'c', name: id, unlocked, unlockedAtLevel: unlocked ? 4 : null });
  const pieces = [piece('lilac-beret', 'hat'), piece('flower-sprig', 'hat'), piece('lilac-cape', 'collar', false), piece('compass-star', 'pendant')];
  assert.deepEqual(ring.shelfOf(pieces, 'hat').map(p => p.id), ['lilac-beret', 'flower-sprig']);
  assert.equal(ring.shelfOf(pieces, 'collar').length, 1, 'a piece not opened yet still shows');
  const worn = { hat: null, collar: null, pendant: 'compass-star' };
  assert.deepEqual(plain(ring.outfitWith(worn, pieces[0])), { hat: 'lilac-beret', collar: null, pendant: 'compass-star' }, 'all three slots');
  assert.deepEqual(plain(ring.outfitWith(null, pieces[1])), { hat: 'flower-sprig', collar: null, pendant: null });
  assert.deepEqual(plain(ring.outfitWith(worn, pieces[3])), { hat: null, collar: null, pendant: null }, 'a worn piece comes off');
  assert.equal(ring.outfitWith(worn, pieces[2]), null, 'locked');
  assert.ok(ring.isWorn(worn, pieces[3]) && !ring.isWorn(worn, pieces[0]));
  // Worn but not shown: the other set's hat under a cape, and a pendant under any cape.
  assert.deepEqual([...ring.puppyHiddenPieces({ hat: 'flower-sprig', collar: 'lilac-cape', pendant: 'compass-star' })].sort(), ['compass-star', 'flower-sprig']);
  assert.deepEqual([...ring.puppyHiddenPieces({ hat: 'flower-sprig', collar: null, pendant: 'compass-star' })], ['compass-star']);
  assert.equal(ring.puppyHiddenPieces({ hat: 'lilac-beret', collar: null, pendant: 'compass-star' }).size, 0);
});

test('every catalog piece has its wardrobe icon', async () => {
  const fs = await import('node:fs');
  const { PET_ACCESSORIES } = await import('../../lib/garden-pets.js');
  const icons = load('../critters/accessoryIcons').ACCESSORY_ICONS;
  assert.equal(Object.keys(icons).length, PET_ACCESSORIES.length);
  for (const { id } of PET_ACCESSORIES) {
    assert.ok(icons[id], id);
    assert.ok(fs.existsSync(new URL(`../${icons[id].replace('@/', '')}`, import.meta.url)), id);
  }
});

test('the Maltese comes only with the puppy and follows it, sitting beside it once close', () => {
  const random = seeded(3);
  assert.equal(visits.planFriendVisit({ key: 1, now: 0, active: [], network: WALK_NETWORK, edges, random }), null);
  const puppy = visits.planVisit({ key: 2, now: 0, active: [], network: WALK_NETWORK, edges, points, random: seeded(5), excluded: ['rabbit', 'hedgehog'] });
  assert.equal(puppy.id, 'puppy');
  const friend = visits.planFriendVisit({ key: 3, now: 0, active: [puppy], network: WALK_NETWORK, edges, random });
  assert.equal(friend.id, 'maltese');
  assert.equal(visits.planFriendVisit({ key: 4, now: 0, active: [puppy, friend], network: WALK_NETWORK, edges, random }), null);
  // Close by: it sits down facing the puppy.
  const here = { x: 100, y: 100 };
  const sit = visits.planFollow({ visit: friend, now: 10, here, leader: { x: 190, y: 100 }, path: null, random });
  assert.equal(sit.sits, true);
  assert.ok(sit.path[1].x > sit.path[0].x, 'faces the puppy');
  // Far: it goes a stretch of the way, stopping short of the puppy, faster when far behind.
  const far = visits.planFollow({ visit: friend, now: 10, here, leader: { x: 700, y: 100 }, path: [here, { x: 400, y: 100 }, { x: 700, y: 100 }], random });
  assert.equal(far.sits, false);
  assert.ok(visits.pathLength(far.path) <= 160 + 1e-6);
  assert.ok(far.speed > visits.CRITTERS.maltese.speed);
  // It stops short, never on top of the puppy.
  const end = far.path.at(-1);
  assert.ok(700 - end.x >= visits.APART, `stops ${700 - end.x} short`);
  // Too close: it steps aside first, then sits.
  const aside = visits.asideFrom(here, { x: 120, y: 100 }, () => false);
  assert.ok(Math.abs(aside.x - 120) >= visits.APART - 1e-6);
  const step = visits.planFollow({ visit: friend, now: 10, here, leader: { x: 120, y: 100 }, path: null, random, aside });
  assert.equal(step.sits, false);
  assert.deepEqual(step.path.at(-1), aside);
});

test('the Maltese leads about seven walks in ten; a game of chase ends with the puppy catching up', () => {
  const random = seeded(11);
  let maltese = 0;
  for (let i = 0; i < 2000; i++) if (visits.pickLeader(random) === 'maltese') maltese++;
  assert.ok(Math.abs(maltese / 2000 - visits.MALTESE_LEADS) < 0.04, `${maltese / 2000}`);
  const puppy = visits.planVisit({ key: 2, now: 0, active: [], network: WALK_NETWORK, edges, points, random: seeded(5), excluded: ['rabbit', 'hedgehog'] });
  const friend = visits.planFriendVisit({ key: 3, now: 0, active: [puppy], network: WALK_NETWORK, edges, random });
  const dash = [{ x: 100, y: 100 }, { x: 300, y: 100 }], chase = [{ x: 60, y: 100 }, { x: 100, y: 100 }];
  const game = visits.planPlay({ maltese: friend, puppy, now: 50, dash, chase });
  assert.ok(game);
  assert.equal(game.maltese.play, true);
  assert.equal(game.puppy.chase, true);
  assert.ok(game.puppy.speed <= visits.RUN_SPEED + 1e-6);
  const stops = game.maltese.start + game.maltese.duration, caught = game.puppy.start + game.puppy.duration;
  assert.ok(Math.abs(caught - stops) < 0.6, `caught ${caught.toFixed(2)} vs stops ${stops.toFixed(2)}`);
  // Never through the Maltese: at every moment of the run it keeps at least a body length behind.
  // (They start close: it only waits until the Maltese is a body length ahead, and never closes in again.)
  let apart = false;
  for (let t = 50; t <= stops; t += 0.05) {
    const m = visits.visitPose(game.maltese, t), p = visits.visitPose(game.puppy, t), gap = Math.hypot(m.x - p.x, m.y - p.y);
    if (gap >= visits.APART) apart = true;
    if (apart) assert.ok(gap >= visits.APART - 1, `at ${t.toFixed(2)}: ${gap.toFixed(1)}`);
    else assert.equal(visits.visitDistance(game.puppy, t), 0, 'it waits while the Maltese is close');
  }
  assert.ok(apart);
  assert.ok(game.ends >= caught);
  // It pulls up beside the Maltese, not on top of it.
  const sat = game.puppy.path.at(-1), stopped = game.maltese.path.at(-1);
  assert.ok(Math.hypot(sat.x - stopped.x, sat.y - stopped.y) > 40);
  // A puppy on its ring menu (held) does not play.
  assert.equal(visits.planPlay({ maltese: friend, puppy: { ...puppy, held: true }, now: 50, dash, chase }), null);
});

test('pair scenes: the Maltese walks up beside the puppy, both stay for the clip, then it is over', () => {
  const random = seeded(4);
  const puppy = visits.planVisit({ key: 2, now: 0, active: [], network: WALK_NETWORK, edges, points, random: seeded(5), excluded: ['rabbit', 'hedgehog'] });
  const friend = visits.planFriendVisit({ key: 3, now: 0, active: [puppy], network: WALK_NETWORK, edges, random });
  for (const kind of ['tug', 'hug']) {
    const pAt = { x: 500, y: 400 }, mAt = { x: 620, y: 400 }, spot = { x: 500 + visits.SCENE_SPECS[kind].apart, y: 400 };
    const s = visits.planScene({ key: 9, kind, maltese: friend, puppy, now: 10, mAt, pAt, approach: [mAt, spot] });
    assert.ok(s);
    assert.equal(s.scene.dir, 1);
    const end = s.maltese.path.at(-1);
    assert.ok(Math.abs(end.x - spot.x) < 1, `${kind}: walks to its place`);
    assert.ok(s.maltese.start + s.maltese.duration <= s.scene.start, `${kind}: there before the clip`);
    assert.ok(s.puppy.start + s.puppy.duration >= s.scene.end, `${kind}: the puppy stays for it`);
    assert.equal(visits.sceneShown(s.scene, s.scene.start + 1), 1);
    assert.equal(visits.sceneShown(s.scene, s.scene.end + 0.1), 0);
  }
  // The puppy can run and the Maltese chase it.
  const g = visits.planPlay({ maltese: friend, puppy, now: 50, dash: [{ x: 100, y: 100 }, { x: 320, y: 100 }], chase: [{ x: 60, y: 100 }, { x: 100, y: 100 }], runner: 'puppy' });
  assert.ok(g);
  assert.equal(g.puppy.chase, true);
  assert.equal(g.maltese.running, true);
});

test('the puppy eats and is patted in every look: each has both painted sheets, on the sit cells', async () => {
  const fs = await import('node:fs');
  const looks = load('../critters/puppyLooks');
  for (const look of Object.keys(looks.PUPPY_LOOKS)) {
    const actions = looks.PUPPY_ACTIONS[look];
    assert.ok(actions, `${look} has eat and pat`);
    for (const kind of ['eat', 'pat']) {
      const frames = actions[kind];
      assert.ok(fs.existsSync(new URL(`../${frames.source.replace('@/', '')}`, import.meta.url)), `${look} ${kind}: ${frames.source}`);
      assert.equal(frames.anchorX, 209, 'the clip lies over the sitting puppy');
      assert.ok(looks.actionSeconds(frames) > 5 && looks.actionSeconds(frames) < 7);
    }
  }
});

test('the Maltese walks, sits and runs in every look, about half the puppy\'s size', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../src/components/garden/critters/GardenCritters.tsx', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const MALTESE_LOOKS'), source.indexOf('const ART:'));
  for (const look of ['bare', 'hat', 'necklace', 'hat-necklace', 'cape', 'cape-hat', 'cape-necklace', 'petal']) {
    const at = block.search(new RegExp(`\\n  '?${look}'?: `));
    assert.ok(at >= 0, `${look} is drawn`);
    const sheets = [...block.slice(at).matchAll(/require\('@\/(assets\/garden\/critters\/[^']+)'\)/g)].slice(0, 3).map(m => m[1]);
    assert.equal(sheets.length, 3, `${look}: walk, sit and run`);
    for (const sheet of sheets) assert.ok(fs.existsSync(new URL(`../${sheet}`, import.meta.url)), sheet);
  }
  const ratio = visits.CRITTERS.maltese.size / visits.CRITTERS.puppy.size;
  assert.ok(ratio > 0.4 && ratio < 0.5, `${ratio}`);
});

test('the Maltese wears the kinds of piece its friend wears: hat, necklace, cape, any of them together', () => {
  const { malteseLookOf, malteseLookOfOutfit, PUPPY_LOOKS } = load('../critters/puppyLooks');
  const outfit = (hat, collar, pendant) => ({ hat, collar, pendant });
  assert.equal(malteseLookOfOutfit(null), 'bare');
  assert.equal(malteseLookOfOutfit(outfit(null, null, null)), 'bare');
  assert.equal(malteseLookOfOutfit(outfit('flower-sprig', null, null)), 'hat');
  assert.equal(malteseLookOfOutfit(outfit(null, null, 'crystal-drop')), 'necklace');
  assert.equal(malteseLookOfOutfit(outfit('a', null, 'b')), 'hat-necklace');
  assert.equal(malteseLookOfOutfit(outfit(null, 'petal-capelet', null)), 'cape');
  assert.equal(malteseLookOfOutfit(outfit('a', 'b', null)), 'cape-hat');
  assert.equal(malteseLookOfOutfit(outfit(null, 'b', 'c')), 'cape-necklace');
  assert.equal(malteseLookOfOutfit(outfit('a', 'b', 'c')), 'petal');
  // From a puppy look alone (the preview), what the puppy shows: its cape hides a necklace.
  const expected = { bare: 'bare', hat: 'hat', hat2: 'hat', necklace: 'necklace', necklace2: 'necklace', 'hat-necklace': 'hat-necklace',
    'hat-necklace2': 'hat-necklace', cape: 'cape', 'cape-hat': 'cape-hat', cape2: 'cape', 'cape2-hat': 'cape-hat' };
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(PUPPY_LOOKS).sort());
  for (const [look, maltese] of Object.entries(expected)) assert.equal(malteseLookOf(look), maltese, look);
});
