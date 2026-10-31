import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const { scheduleAction, scheduleRest, wanderTarget, wanderPause, USER_HOLD_MS, RETRY_MS, WANDER_PAUSE_MS } = load('../fairy/fairySchedule');
const { FairyNavigation } = load('../fairy/FairyNavigation');
const { WALK_NETWORK, WALK_START, distance } = load('../fairy/walkNetwork');
const { mailboxApproachAnchor } = load('../fairy/mailboxDestination');
const { treehouseInteriorAnchor } = load('../fairy/treehouseDestination');

const plain = value => JSON.parse(JSON.stringify(value)); // VM-realm objects
const base = { navState: 'idle', placed: true, now: 1_000_000,
  userAt: 0, idleSince: 1_000_000, pauseMs: 10_000, retryAt: 0 };
const act = (rest, change = {}) => scheduleAction({ ...base, rest, ...change });

test('every server state maps to a place in the Garden', () => {
  assert.deepEqual(['TEA_TIME', 'SWINGING', 'SLEEPING', 'IN_TREEHOUSE', 'AT_MAILBOX', 'IDLE'].map(scheduleRest),
    ['tea', 'swing', 'moon', 'path', 'path', 'path'], 'she never goes into the treehouse or to the mailbox by herself');
  assert.equal(scheduleRest('SOMETHING_NEW'), null);
  assert.equal(scheduleRest(undefined), null);
});

test('opening the Garden places her; later changes send her there; settled means wait', () => {
  assert.equal(act('tea', { placed: false }), 'place');
  assert.equal(act('tea'), 'go');
  assert.equal(act('tea', { navState: 'drinkingTea' }), 'wait');
  assert.equal(act('swing', { navState: 'drinkingTea' }), 'go');
  assert.equal(act('moon', { navState: 'sleepingOnMoonBed' }), 'wait');
});

test('travel, letters and a recent tap are never interrupted', () => {
  for (const navState of ['walking', 'flyingToTea', 'aligningToSwing', 'enteringTreehouse', 'movingToMailbox', 'presentingMail', 'mailboxTransition']) {
    assert.equal(act('swing', { navState }), 'wait', navState);
  }
  assert.equal(act('tea', { userAt: base.now - USER_HOLD_MS + 1 }), 'wait');
  assert.equal(act('tea', { userAt: base.now - USER_HOLD_MS }), 'go');
  assert.equal(act('tea', { retryAt: base.now + RETRY_MS }), 'wait');
  // Even the first placement waits for a tap's minute to pass.
  assert.equal(act('tea', { placed: false, userAt: base.now }), 'place');
});

test('on a walk she pauses, then strolls; from a seat she sets off at once', () => {
  assert.equal(act('path'), 'wait');
  assert.equal(act('path', { idleSince: base.now - base.pauseMs }), 'wander');
  assert.equal(act('path', { navState: 'sittingOnSwing' }), 'wander');
  const random = (() => { let i = 0; return () => [0.1, 0.5, 0.9][i++ % 3]; })();
  for (let i = 0; i < 6; i++) {
    const target = wanderTarget(WALK_NETWORK.nodes, WALK_START, random);
    assert.ok(WALK_NETWORK.nodes.includes(target) && distance(target, WALK_START) >= 120);
  }
  assert.equal(wanderTarget([WALK_START], WALK_START, Math.random), null);
  // Strolls stay within walking distance whenever such a point exists, and she walks there.
  for (const [i, from] of WALK_NETWORK.nodes.entries()) {
    const target = wanderTarget(WALK_NETWORK.nodes, from, () => (i * 0.37) % 1);
    const near = WALK_NETWORK.nodes.some(node => distance(node, from) >= 120 && distance(node, from) <= 450);
    if (near) assert.ok(distance(target, from) <= 450, `node ${i}`);
  }
  const walker = new FairyNavigation(); walker.place('path', WALK_NETWORK.nodes[3]);
  const stroll = wanderTarget(WALK_NETWORK.nodes, walker.position, () => 0.5);
  assert.equal(walker.move(stroll, () => false), true);
  assert.equal(walker.state, 'walking');
  for (let i = 0; i < 2000 && walker.state !== 'idle'; i++) walker.update(50, () => false);
  assert.equal(walker.state, 'idle');
  assert.ok(distance(walker.position, stroll) < 1, 'she arrives and stands still for her next pause');
  for (const r of [0, 0.5, 0.999]) {
    const pause = wanderPause(() => r);
    assert.ok(pause >= WANDER_PAUSE_MS[0] && pause <= WANDER_PAUSE_MS[1]);
  }
});

test('placing her needs no travel and leaves her able to move on', () => {
  const blocked = () => false;
  const expected = { tea: 'drinkingTea', swing: 'sittingOnSwing', moon: 'sleepingOnMoonBed', treehouse: 'insideTreehouse', mailbox: 'idle', path: 'idle' };
  for (const [rest, state] of Object.entries(expected)) {
    const nav = new FairyNavigation();
    assert.equal(nav.place(rest, WALK_NETWORK.nodes[5]), true);
    assert.equal(nav.state, state, rest);
    assert.deepEqual(plain([nav.remaining.length, nav.lift, nav.airborne]), [0, 0, false], rest);
  }
  const inside = new FairyNavigation(); inside.place('treehouse');
  assert.deepEqual(plain([inside.position, inside.treehouseDepth]), plain([treehouseInteriorAnchor, 1]));
  assert.equal(inside.returnFromTreehouse(), true, 'she can come out of the treehouse');
  const seated = new FairyNavigation(); seated.place('swing');
  assert.equal(seated.move(WALK_NETWORK.nodes[10], blocked), true, 'she can leave the swing');
  assert.equal(seated.state === 'sittingOnSwing', false);
  const path = new FairyNavigation(); path.place('path', WALK_NETWORK.nodes[7]);
  assert.deepEqual(plain(path.position), plain(WALK_NETWORK.nodes[7]));
  const mailbox = new FairyNavigation(); mailbox.place('mailbox');
  assert.deepEqual(plain(mailbox.position), plain(mailboxApproachAnchor));
});

test('on her own she only ever stands on dry ground: never the pond stepping stones or the flower beds', () => {
  const { standableNodes } = load('../fairy/fairySchedule');
  const { gardenGroundKind, isGardenGroundBlocked } = load('../fairy/gardenGround');
  const standable = standableNodes(WALK_NETWORK.nodes, isGardenGroundBlocked);
  const off = WALK_NETWORK.nodes.filter(node => gardenGroundKind(node) !== 'ground');
  assert.ok(off.length > 0, 'the walk network does reach a few points off dry ground');
  assert.equal(standable.length, WALK_NETWORK.nodes.length - off.length);
  assert.ok(standable.every(node => gardenGroundKind(node) === 'ground'));
  for (let i = 0; i < 400; i++) {
    const pick = wanderTarget(standable, { x: -1e9, y: -1e9 }, () => (i * 0.6180339) % 1, [0, Infinity]);
    assert.equal(gardenGroundKind(pick), 'ground');
  }
  const source = fs.readFileSync(new URL('../src/components/garden/fairy/useFairySchedule.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /wanderTarget\(WALK_NETWORK\.nodes/, 'the schedule never picks from the unfiltered network');
});

test('a tap on the treehouse or the mailbox opens it straight away, and she stays out of it', () => {
  const scene = fs.readFileSync(new URL('../src/components/garden/GardenScene.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(scene, /call her out|叫她出来|fairy-treehouse-hint|\? \(\) => fairyRef\.current\?\.visitMailbox|bookhouseOnEntry/);
  assert.match(scene, /tapMailbox\.current = \(\) => \{ if \(!readOnly\) onMailboxOpened\?\.\(\); \}/);
  assert.match(scene, /tapTreehouse\.current = \(\) => \{ if \(!readOnly\) onOpenBookhouse\?\.\(\); \}/);
});

test('with no day from the server she still strolls, and soon', () => {
  const { FIRST_STROLL_MS, RUNTIME_WAIT_MS } = load('../fairy/fairySchedule');
  assert.ok(FIRST_STROLL_MS <= 3000 && RUNTIME_WAIT_MS <= 5000);
  const source = fs.readFileSync(new URL('../src/components/garden/fairy/useFairySchedule.ts', import.meta.url), 'utf8');
  assert.match(source, /scheduleRest\(runtime\.currentState\)\) \|\| 'path'/);
  assert.equal(act('path', { idleSince: base.now - FIRST_STROLL_MS, pauseMs: FIRST_STROLL_MS }), 'wander');
});

test('she walks twice as fast, and settling onto a seat is as fast as her flight', () => {
  const { WALK_SPEED, FLIGHT_SPEED } = load('../fairy/FairyNavigation');
  assert.equal(WALK_SPEED, 0.22);
  const nav = new FairyNavigation();
  assert.equal(nav.move({ x: 0, y: 0 }, () => false, true), true);
  for (let i = 0; i < 4000 && nav.state !== 'aligningToSwing'; i++) nav.update(16, () => false);
  assert.equal(nav.state, 'aligningToSwing');
  const path = nav.alignment.reduce((sum, p, i, all) => i ? sum + distance(all[i - 1], p) : 0, 0);
  assert.ok(nav.duration <= Math.max(300, path / FLIGHT_SPEED) + 1);
});

test('she flies across the Garden quickly (owner feedback: flights felt slow)', () => {
  const { FLIGHT_SPEED, MIN_FLIGHT_MS } = load('../fairy/FairyNavigation');
  assert.ok(FLIGHT_SPEED > 0.3 && MIN_FLIGHT_MS <= 700);
  const fairy = new FairyNavigation();
  assert.equal(fairy.move({ x: 0, y: 0 }, () => false, true), true);
  assert.equal(fairy.state, 'flyingToSwing');
  assert.ok(fairy.duration <= Math.max(MIN_FLIGHT_MS, fairy.flight.reduce((sum, p, i, all) => i ? sum + distance(all[i - 1], p) : 0, 0) / FLIGHT_SPEED) + 1);
});
