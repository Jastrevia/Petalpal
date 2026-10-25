// node scripts/checkTreehouseEntry.cjs (or GARDEN_MOBILE_ROOT=/path/to/mobile node this-file)
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const localMobile = path.resolve(__dirname, '..');
const mobileRoot = process.env.GARDEN_MOBILE_ROOT ||
  (fs.existsSync(path.join(localMobile, 'src/components/garden/fairy/FairyNavigation.ts'))
    ? localMobile : 'C:/Users/cjysu/Documents/Petalpal/mobile');
const ts = require(require.resolve('typescript', { paths: [mobileRoot] }));
const cache = {};

function load(file) {
  file = path.resolve(file);
  if (file.endsWith('.png')) return file;
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cache[file]) return cache[file].exports;
  const module = { exports: {} };
  cache[file] = module;
  const requireLocal = request => request.startsWith('@/assets/') ? request
    : load(path.resolve(path.dirname(file), request + (path.extname(request) ? '' : '.ts')));
  new Function('require', 'exports', 'module', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText)(requireLocal, module.exports, module);
  return module.exports;
}

const root = path.resolve(mobileRoot, 'src/components/garden');
const { FairyNavigation, WALK_SPEED } = load(root + '/fairy/FairyNavigation.ts');
const { isGardenGroundBlocked: blocked } = load(root + '/fairy/gardenGround.ts');
const { walkVisualHeight } = load(root + '/fairy/fairyMetrics.ts');
const { distance, WALK_START } = load(root + '/fairy/walkNetwork.ts');
const {
  treehouseApproachAnchor: approach,
  treehouseDoorAnchor: door,
  treehouseInteriorAnchor: interior,
  hitsTreehouse,
} = load(root + '/fairy/treehouseDestination.ts');
const { TREEHOUSE_MAP_X: x, TREEHOUSE_MAP_Y: y, TREEHOUSE_MAP_SCALE: scale }
  = load(root + '/treehouseMapPlacement.ts');
const nearStart = { x: approach.x, y: approach.y + 50 };
const sourcePoint = (sx, sy) => ({ x: x + sx * scale, y: y + sy * scale });
const epsilon = 1e-6;
const exteriorLength = distance(approach, door);
const interiorLength = distance(door, interior);
const entryLength = exteriorLength + interiorLength;
let completedEntries = 0;
let completedExits = 0;
let checkedTransitionFrames = 0;

for (const [name, point] of Object.entries({ approach, door, interior, nearStart })) {
  assert.equal(blocked(point), false, name + ' is valid dry ground');
}
assert.ok(approach.x > door.x && door.x > interior.x, 'entry moves toward the left-facing doorway');
assert.ok(approach.y > door.y && door.y > interior.y, 'entry moves inward/up the stairs');
for (const point of [approach, door, sourcePoint(710, 365), sourcePoint(860, 745)]) {
  assert.equal(hitsTreehouse(point), true, 'painted treehouse/entrance is tappable');
}
for (const point of [sourcePoint(-100, 365), sourcePoint(1600, 745), { x: 1189, y: 710 }, { x: 1950, y: 650 }]) {
  assert.equal(hitsTreehouse(point), false, 'hitbox does not capture neighboring landmarks/outside treehouse');
}
// Just beside the mailbox (inside the trunk region) is a miss, not a trip indoors.
for (const point of [sourcePoint(1068, 802), sourcePoint(908, 802)]) {
  assert.equal(hitsTreehouse(point), false, 'the ring around the mailbox never opens the treehouse');
}
const alternatePlacement = { x: 400, y: 100, scale: .4 };
assert.equal(hitsTreehouse({ x: 400 + 860 * .4, y: 100 + 745 * .4 }, alternatePlacement), true,
  'hit testing honors the supplied landmark transform');

function assertNear(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} vs ${expected}`);
}

function expectedPoint(covered) {
  const inside = covered >= exteriorLength;
  const a = inside ? door : approach;
  const b = inside ? interior : door;
  const t = Math.max(0, Math.min(1, (covered - (inside ? exteriorLength : 0)) /
    (inside ? interiorLength : exteriorLength)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function assertRoutePosition(nav, label) {
  const inside = nav.position.y < door.y;
  const covered = inside ? exteriorLength + distance(door, nav.position) : distance(approach, nav.position);
  const expected = expectedPoint(covered);
  assertNear(nav.position.x, expected.x, label + ' x follows the dedicated doorway route');
  assertNear(nav.position.y, expected.y, label + ' y follows the dedicated doorway route');
  const depth = Math.max(0, Math.min(1, (covered - exteriorLength) / interiorLength));
  assertNear(nav.treehouseDepth, depth, label + ' depth depends on doorway crossing, not a fade clock');
  assert.ok(nav.treehouseScale >= .84 - epsilon && nav.treehouseScale <= 1 + epsilon,
    label + ' perspective stays within the doorway fit range');
  if (covered >= exteriorLength) assertNear(nav.treehouseScale, .84, label + ' fits inside the aperture');
  if (covered < epsilon) assertNear(nav.treehouseScale, 1, label + ' restores normal exterior scale');
  assert.equal(nav.lift, 0, label + ' stays grounded');
  assert.equal(nav.airborne, false, label + ' uses walking, not flight');
  assert.equal(nav.remaining.length, 0, label + ' does not invoke ordinary ground routing');
  checkedTransitionFrames++;
}

function approachTreehouse(start, expectedMode, dt) {
  const nav = new FairyNavigation(start);
  assert.equal(nav.returnFromTreehouse(), false, 'return is unavailable outside the treehouse');
  assert.equal(nav.visitTreehouse(blocked, walkVisualHeight()), true);
  assert.equal(nav.decision.mode, expectedMode);
  assert.equal(nav.state, expectedMode === 'WALK' ? 'walking' : 'flyingToTreehouse');
  assert.deepEqual(nav.position, start, 'tap does not teleport the fairy');
  assert.deepEqual(nav.target, approach);
  if (expectedMode === 'WALK') {
    assert.ok(nav.decision.walkReachable);
    assert.ok(nav.remaining.length);
  } else {
    assert.ok(nav.flight.length > 2, 'flight has a continuous aerial trajectory');
  }
  let frames = 0;
  while (nav.state !== 'enteringTreehouse' && frames++ < 10000) {
    const previous = { ...nav.position };
    nav.update(dt, blocked);
    assert.equal(nav.treehouseEntryCount, 0, 'travel cannot fire the entry event');
    assert.equal(nav.treehouseExitCount, 0, 'travel cannot fire the exit event');
    assert.equal(nav.treehouseDepth, 0, 'ordinary travel is never doorway-clipped');
    assert.ok(distance(previous, nav.position) <= .6 * dt + epsilon, 'travel is continuous');
    if (expectedMode === 'WALK') {
      assert.equal(nav.lift, 0, 'walking to the stairs remains grounded');
      assert.equal(blocked(nav.position), false, 'walking respects valid ground');
    }
  }
  assert.ok(frames < 10000, 'travel reaches the entrance');
  assert.deepEqual(nav.position, approach, 'entry begins at the exact approach anchor');
  assert.equal(nav.treehouseEntryProgress, 0);
  assertRoutePosition(nav, 'entry begins');
  return nav;
}

function completeEntry(nav, dt) {
  const entryCount = nav.treehouseEntryCount;
  const exitCount = nav.treehouseExitCount;
  let frames = 0, sawPartialDepth = false;
  while (nav.state === 'enteringTreehouse' && frames++ < 10000) {
    const previous = { ...nav.position };
    const previousProgress = nav.treehouseEntryProgress;
    const previousDepth = nav.treehouseDepth;
    nav.update(dt, blocked);
    assertRoutePosition(nav, 'entry');
    assert.ok(nav.treehouseEntryProgress >= previousProgress, 'entry progresses monotonically');
    assert.ok(nav.treehouseDepth >= previousDepth, 'foreground coverage progresses monotonically');
    assert.ok(nav.position.x <= previous.x + epsilon && nav.position.y <= previous.y + epsilon,
      'entry steps move up/left into the doorway, never reverse');
    assert.ok(distance(previous, nav.position) <= WALK_SPEED * dt + epsilon,
      'entry uses the actual walking speed without teleporting');
    if (nav.treehouseDepth > 0 && nav.treehouseDepth < 1) sawPartialDepth = true;
    if (nav.state === 'enteringTreehouse') assert.equal(nav.treehouseEntryCount, entryCount);
    assert.equal(nav.treehouseExitCount, exitCount, 'entry cannot emit an exit');
  }
  assert.ok(frames < 10000, 'short entry sequence completes');
  assert.ok(sawPartialDepth, 'entry includes a partially occluded state');
  assert.equal(nav.state, 'insideTreehouse');
  assert.deepEqual(nav.position, interior);
  assert.equal(nav.treehouseEntryProgress, 1);
  assert.equal(nav.treehouseDepth, 1, 'fully inside is completely covered');
  assert.equal(nav.treehouseEntryCount, entryCount + 1, 'one completed entry signal');
  assert.equal(nav.target, null);
  for (let i = 0; i < 50; i++) nav.update(50, blocked);
  assert.equal(nav.treehouseEntryCount, entryCount + 1, 'repeated updates cannot emit another entry signal');
  assert.deepEqual(nav.position, interior);
  completedEntries++;
}

function assertLocked(nav, expectedState) {
  const before = {
    position: { ...nav.position }, depth: nav.treehouseDepth,
    entries: nav.treehouseEntryCount, exits: nav.treehouseExitCount,
  };
  assert.equal(nav.move(WALK_START, blocked), false, 'ordinary taps cannot cancel a doorway sequence');
  assert.equal(nav.visitTreehouse(blocked), false, 'duplicate entry taps cannot restart a doorway sequence');
  assert.equal(nav.move(WALK_START, blocked, true), false, 'swing tap cannot steal doorway control');
  assert.equal(nav.move(WALK_START, blocked, false, walkVisualHeight(), true), false,
    'moon-bed tap cannot steal doorway control');
  assert.equal(nav.move(WALK_START, blocked, false, walkVisualHeight(), false, true), false,
    'tea tap cannot steal doorway control');
  nav.stop();
  nav.update(0, blocked);
  assert.equal(nav.state, expectedState);
  assert.deepEqual(nav.position, before.position);
  assert.equal(nav.treehouseDepth, before.depth);
  assert.equal(nav.treehouseEntryCount, before.entries);
  assert.equal(nav.treehouseExitCount, before.exits);
}

function completeExit(nav, dt, testLocks = false) {
  const entryCount = nav.treehouseEntryCount;
  const exitCount = nav.treehouseExitCount;
  const beforeReturn = { ...nav.position };
  assert.equal(nav.returnFromTreehouse(), true, 'interior controller can request the return');
  assert.equal(nav.state, 'exitingTreehouse');
  assert.deepEqual(nav.position, beforeReturn, 'return begins inside, never teleports to the path');
  assert.equal(nav.treehouseDepth, 1, 'return starts fully behind the foreground');
  assert.equal(nav.returnFromTreehouse(), false, 'duplicate return request does not restart exit');
  let frames = 0, sawPartialDepth = false, sawExterior = false;
  while (nav.state === 'exitingTreehouse' && frames++ < 10000) {
    const previous = { ...nav.position };
    const previousDepth = nav.treehouseDepth;
    nav.update(dt, blocked);
    assertRoutePosition(nav, 'exit');
    assert.ok(nav.treehouseDepth <= previousDepth, 'exit gradually reveals the fairy');
    assert.ok(nav.position.x >= previous.x - epsilon && nav.position.y >= previous.y - epsilon,
      'exit walks outward/down the stairs, never reverses');
    assert.ok(distance(previous, nav.position) <= WALK_SPEED * dt + epsilon,
      'exit uses the actual walking speed without teleporting');
    if (nav.treehouseDepth > 0 && nav.treehouseDepth < 1) sawPartialDepth = true;
    if (nav.treehouseDepth === 0 && nav.state === 'exitingTreehouse') sawExterior = true;
    assert.equal(nav.treehouseEntryCount, entryCount, 'exit never emits another entry callback');
    if (nav.state === 'exitingTreehouse') {
      assert.equal(nav.treehouseExitCount, exitCount, 'exit callback waits until fully outside');
      if (testLocks) {
        assertLocked(nav, 'exitingTreehouse');
        assert.equal(nav.returnFromTreehouse(), false, 'duplicate return remains a no-op in mid-exit');
      }
    }
  }
  assert.ok(frames < 10000, 'exit completes');
  assert.ok(sawPartialDepth, 'exit includes gradual partial emergence');
  assert.ok(sawExterior, 'the fairy becomes fully visible before finishing the outer steps');
  assert.equal(nav.state, 'idle');
  assert.deepEqual(nav.position, approach);
  assert.equal(nav.treehouseDepth, 0);
  assert.equal(nav.treehouseExitCount, exitCount + 1, 'one completed exit signal');
  assert.equal(nav.target, null);
  assert.equal(nav.returnFromTreehouse(), false, 'return cannot be requested again outside');
  for (let i = 0; i < 50; i++) nav.update(50, blocked);
  assert.equal(nav.treehouseExitCount, exitCount + 1, 'idle updates cannot emit another exit');
  assert.deepEqual(nav.position, approach);
  completedExits++;
}

const frameIntervals = [7, 16, 33, 50];
for (const dt of frameIntervals) {
  for (const [start, mode] of [[nearStart, 'WALK'], [WALK_START, 'FLY']]) {
    const nav = approachTreehouse(start, mode, dt);
    assert.equal(nav.returnFromTreehouse(), false, 'cannot request return during entry');
    completeEntry(nav, dt);
    assertLocked(nav, 'insideTreehouse');
    completeExit(nav, dt);
    assert.equal(nav.move(nearStart, blocked), true, 'ordinary ground movement resumes after exit');
    assert.equal(nav.decision.mode, 'WALK');
    let frames = 0;
    while (nav.state === 'walking' && frames++ < 10000) {
      nav.update(dt, blocked);
      assert.equal(nav.lift, 0);
      assert.equal(blocked(nav.position), false);
      assert.equal(nav.treehouseDepth, 0, 'normal movement has no stale doorway mask');
    }
    assert.ok(frames < 10000);
    assert.equal(nav.state, 'idle');
    assert.deepEqual(nav.position, nearStart);
  }
}

// Entry, inside, and exit own the character until the Garden return finishes.
const locked = approachTreehouse(nearStart, 'WALK', 16);
locked.update(160, blocked);
assertLocked(locked, 'enteringTreehouse');
completeEntry(locked, 16);
assertLocked(locked, 'insideTreehouse');
completeExit(locked, 16, true);

// The handoff remains reusable rather than a one-shot event.
assert.equal(locked.visitTreehouse(blocked), true);
if (locked.state === 'walking') locked.update(1, blocked); // Existing router may retain a zero-length last waypoint.
assert.equal(locked.state, 'enteringTreehouse', 'reentry from exact approach requires no teleport');
assert.deepEqual(locked.position, approach);
completeEntry(locked, 33);
assert.equal(locked.treehouseEntryCount, 2);
completeExit(locked, 33);
assert.equal(locked.treehouseExitCount, 2);

// Dedicated exit sampling must be the precise spatial reverse of entry,
// including the gently eased inner steps and doorway perspective.
const symmetryFractions = [.03, .15, .3, .5, .67, .8, .9, .97];
for (const fraction of symmetryFractions) {
  const inward = new FairyNavigation(approach);
  const outward = new FairyNavigation(approach);
  assert.equal(inward.visitTreehouse(blocked), true);
  assert.equal(outward.visitTreehouse(blocked), true);
  if (inward.state === 'walking') inward.update(1, blocked);
  if (outward.state === 'walking') outward.update(1, blocked);
  assert.equal(inward.state, 'enteringTreehouse');
  const duration = inward.duration;
  assert.ok(duration >= entryLength / WALK_SPEED, 'entry never rushes beyond the normal walking pace');
  inward.update(duration * fraction, blocked);
  outward.update(duration, blocked);
  assert.equal(outward.state, 'insideTreehouse');
  assert.equal(outward.returnFromTreehouse(), true);
  assertNear(outward.duration, duration, 'entry and exit use the same duration');
  outward.update(duration * (1 - fraction), blocked);
  assertNear(outward.position.x, inward.position.x, 'mirrored entry/exit x');
  assertNear(outward.position.y, inward.position.y, 'mirrored entry/exit y');
  assertNear(outward.treehouseDepth, inward.treehouseDepth, 'mirrored foreground occlusion depth');
  assertNear(outward.treehouseScale, inward.treehouseScale, 'mirrored doorway perspective');
  assert.equal(outward.state, 'exitingTreehouse');
  assert.equal(outward.treehouseEntryCount, 1);
  assert.equal(outward.treehouseExitCount, 0);
}

// Retargeting while still travelling cancels entry, for both travel modes.
for (const start of [nearStart, WALK_START]) {
  const nav = new FairyNavigation(start);
  assert.equal(nav.visitTreehouse(blocked), true);
  nav.update(150, blocked);
  assert.notEqual(nav.state, 'enteringTreehouse');
  assert.equal(nav.move(start, blocked), true);
  let frames = 0;
  while ((nav.airborne || nav.remaining.length) && frames++ < 10000) {
    nav.update(16, blocked);
    assert.notEqual(nav.state, 'enteringTreehouse');
    assert.notEqual(nav.state, 'insideTreehouse');
    assert.equal(nav.treehouseEntryCount, 0);
    assert.equal(nav.treehouseExitCount, 0);
  }
  assert.ok(frames < 10000);
  assert.equal(nav.state, 'idle');
  assert.deepEqual(nav.position, start);
  nav.update(5000, blocked);
  assert.equal(nav.treehouseEntryCount, 0, 'canceled travel never emits an entry signal');
}

const stopped = new FairyNavigation(nearStart);
assert.equal(stopped.visitTreehouse(blocked), true);
stopped.update(100, blocked);
stopped.stop();
const stoppedAt = { ...stopped.position };
stopped.update(5000, blocked);
assert.equal(stopped.state, 'idle');
assert.deepEqual(stopped.position, stoppedAt);
assert.equal(stopped.treehouseEntryCount, 0);
assert.equal(stopped.treehouseExitCount, 0);

console.log(JSON.stringify({
  status: 'PASS',
  anchors: { approach, door, interior },
  completedEntries,
  completedExits,
  checkedTransitionFrames,
  frameIntervals,
  symmetryFractions,
  checks: [
    'valid dry anchors and treehouse hitbox',
    'nearby WALK and far FLY using existing travel rules',
    'continuous grounded dedicated doorway route at actual WALK_SPEED in both directions',
    'depth remains zero before doorway and increases only inside; exact reverse on exit',
    'mirrored-time samples match entry/exit positions, mask depth, and doorway perspective',
    'entry and exit completion counters fire exactly once and support reentry',
    'entry/inside/exit controls cannot reset or teleport the fairy',
    'return rejected outside, during entry, and during an already running exit',
    'normal grounded movement resumes after exit without stale masking',
    'retargeted walking/flight and stopped walking do not emit entry',
  ],
}, null, 2));
