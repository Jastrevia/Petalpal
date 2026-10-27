import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(mobileRoot, 'package.json'));
const ts = require('typescript');
const source = fs.readFileSync(path.join(mobileRoot, 'src/components/fairy/reading/readingFairyController.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
const reading = { exports: {} };
vm.runInNewContext(`(function(exports, module) {\n${outputText}\n})`, { Math, Date, setTimeout, clearTimeout })(reading.exports, reading);
const {
  createReadingFairyController, pageTurnGap, readingFrameCues, resolveReadingFrame,
  READING_TIMING, READING_TIMING_FAST, PAGE_TURN_STATES,
} = reading.exports;

const MINUTE = 60_000;
const TURN = ['PAGE_PREPARATION', 'PAGE_LIFT', 'PAGE_TURN', 'PAGE_SETTLE', 'RETURN_TO_READING', 'READING'];

// A fake clock: timers fire in time order as the test advances it.
function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(callback, ms) { timers.set(++id, { at: now + ms, callback }); return id; },
    clearTimeout(handle) { timers.delete(handle); },
    pending: () => timers.size,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const entry of timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = end;
    },
  };
}

function harness({ timing = READING_TIMING, random = () => 0.5 } = {}) {
  const clock = fakeClock();
  const controller = createReadingFairyController({ timing, clock, random });
  const log = [];
  let maxPending = 0;
  controller.subscribe(() => {
    const { state, enteredAt, durationMs } = controller.getSnapshot();
    log.push({ state, at: enteredAt, durationMs });
    maxPending = Math.max(maxPending, clock.pending());
  });
  return { clock, controller, log, states: () => log.map(entry => entry.state), maxPending: () => maxPending };
}

test('production defaults: page turns every 45 s–5 min, a 1–1.5 s turn, thinking after 10–20 min for 4–8 s', () => {
  assert.equal(READING_TIMING.pageTurnGapMs.min, 45_000);
  assert.deepEqual([...READING_TIMING.pageTurnGapMs.typical], [90_000, 180_000]);
  assert.equal(READING_TIMING.pageTurnGapMs.max, 300_000);
  const { lift, turn } = READING_TIMING.phaseMs;
  assert.ok(lift + turn >= 1_000 && lift + turn <= 1_500);
  assert.deepEqual([...READING_TIMING.thinkingAfterMs], [10 * MINUTE, 20 * MINUTE]);
  assert.deepEqual([...READING_TIMING.thinkingHoldMs], [4_000, 8_000]);
  // The fast preview clock is separate; production values are not touched by it.
  assert.deepEqual([...READING_TIMING_FAST.thinkingAfterMs], [20_000, 20_000]);
});

test('page-turn gaps stay between the minimum and maximum and are mostly in the typical range', () => {
  const draws = Array.from({ length: 1000 }, (_, index) => pageTurnGap(READING_TIMING, () => index / 1000));
  assert.ok(draws.every(gap => gap >= 45_000 && gap <= 300_000));
  const typical = draws.filter(gap => gap >= 90_000 && gap <= 180_000).length;
  assert.ok(typical >= 790 && typical <= 810, `typical share ${typical}`);
  assert.ok(pageTurnGap(READING_TIMING, () => 1) > 299_990 && pageTurnGap(READING_TIMING, () => 1) <= 300_000);
});

test('she starts idle, reads when the session starts, and turns a page in order', () => {
  const { clock, controller, states, log } = harness();
  assert.equal(controller.getSnapshot().state, 'IDLE');
  controller.setSession('active');
  assert.deepEqual(states(), ['READING']);
  // random 0.5 → a 135 s gap: nothing happens before it.
  clock.advance(134_999);
  assert.deepEqual(states(), ['READING']);
  clock.advance(10_000);
  assert.deepEqual(states(), ['READING', ...TURN]);
  assert.equal(controller.getSnapshot().pagesTurned, 1);
  const lift = log.find(entry => entry.state === 'PAGE_LIFT'), settle = log.find(entry => entry.state === 'PAGE_SETTLE');
  assert.ok(settle.at - lift.at >= 1_000 && settle.at - lift.at <= 1_500, 'the visible turn takes about 1–1.5 s');
});

test('one timer at a time; re-rendering with the same session changes nothing', () => {
  const { clock, controller, states, maxPending } = harness({ random: () => 0 });
  controller.setSession('active');
  clock.advance(30_000);
  const before = controller.remaining();
  for (let i = 0; i < 5; i += 1) controller.setSession('active');
  assert.deepEqual(controller.remaining(), before);
  assert.deepEqual(states(), ['READING']);
  assert.equal(clock.pending(), 1);
  clock.advance(30 * MINUTE);
  assert.equal(maxPending(), 1);
  // Page-turn states only ever appear as one complete, unbroken sequence.
  const log = states();
  log.forEach((state, index) => {
    if (state === 'PAGE_PREPARATION') assert.deepEqual(log.slice(index, index + TURN.length), TURN);
  });
});

test('no thought before the eligible time; page turns do not reset it', () => {
  // random 0 → the first thought is due after exactly 10 minutes and pages turn every 45 s.
  const { clock, controller, log } = harness({ random: () => 0 });
  controller.setSession('active');
  clock.advance(10 * MINUTE - 1);
  assert.ok(!log.some(entry => entry.state === 'THINKING'));
  assert.ok(controller.getSnapshot().pagesTurned >= 10, 'several pages turned meanwhile');
  assert.ok(controller.remaining().thinkingInMs <= 1, 'turns did not push the thought back');
  clock.advance(10_000);
  const thought = log.find(entry => entry.state === 'THINKING');
  assert.ok(thought, 'she thinks once the time has come');
  assert.ok(thought.at >= 10 * MINUTE && thought.at <= 10 * MINUTE + 6_000);
});

test('a thought that comes due mid-turn waits for the turn to finish, then a short reading beat', () => {
  const timing = { ...READING_TIMING, pageTurnGapMs: { min: 10_000, typical: [10_000, 10_000], max: 10_000 },
    thinkingAfterMs: [10_500, 10_500] };
  const { clock, controller, states, log } = harness({ timing });
  controller.setSession('active');
  clock.advance(20_000);
  assert.deepEqual(states().slice(0, 8), ['READING', ...TURN, 'THINKING']);
  const back = log.findLast(entry => entry.state === 'READING' && entry.at < log.find(e => e.state === 'THINKING').at);
  const thought = log.find(entry => entry.state === 'THINKING');
  assert.equal(thought.at - back.at, timing.thinkingBeatMs);
});

test('thinking lasts 4–8 s, returns to reading, and the next thought is drawn afresh (10–20 min later)', () => {
  const draws = [0.5, 0, 0.5, 0.25];
  let index = 0;
  const { clock, controller, log } = harness({ random: () => draws[index++ % draws.length] });
  controller.setSession('active');
  clock.advance(25 * MINUTE);
  const thoughts = log.filter(entry => entry.state === 'THINKING');
  assert.ok(thoughts.length >= 1);
  for (const thought of thoughts) {
    assert.ok(thought.durationMs >= 4_000 && thought.durationMs <= 8_000);
    const next = log[log.indexOf(thought) + 1], after = log[log.indexOf(thought) + 2];
    assert.equal(next.state, 'RETURN_TO_READING');
    assert.equal(after.state, 'READING');
  }
  if (thoughts.length > 1) assert.ok(thoughts[1].at - thoughts[0].at >= 10 * MINUTE);
  assert.ok(log.filter(entry => entry.state === 'THINKING').every((entry, i, all) => i === 0 || entry.at - all[i - 1].at >= 10 * MINUTE));
});

test('pause keeps active progress, schedules nothing, and resume continues from the remaining time', () => {
  const { clock, controller, log } = harness({ random: () => 0 });
  controller.setSession('active');
  clock.advance(5 * MINUTE);
  controller.setSession('paused');
  assert.equal(controller.getSnapshot().state, 'PAUSED');
  assert.equal(clock.pending(), 0);
  const kept = controller.remaining().thinkingInMs;
  assert.equal(kept, 5 * MINUTE);
  const entries = log.length;
  clock.advance(60 * MINUTE);
  assert.equal(log.length, entries, 'nothing fires while paused');
  controller.setSession('active');
  assert.equal(controller.getSnapshot().state, 'READING');
  assert.equal(controller.remaining().thinkingInMs, kept);
  clock.advance(5 * MINUTE + 6_000);
  const thought = log.find(entry => entry.state === 'THINKING');
  assert.ok(thought && thought.at >= 65 * MINUTE + 5 * MINUTE, 'paused time did not count');
});

test('pausing mid-turn does not replay the turn, and its timers cannot fire later', () => {
  const { clock, controller, states } = harness();
  controller.setSession('active');
  clock.advance(135_000 + 600);
  assert.ok(PAGE_TURN_STATES.includes(controller.getSnapshot().state));
  controller.setSession('paused');
  assert.equal(clock.pending(), 0);
  clock.advance(MINUTE);
  controller.setSession('active');
  assert.equal(controller.getSnapshot().state, 'READING');
  const resumedAt = states().length;
  clock.advance(44_000);
  assert.deepEqual(states().slice(resumedAt), [], 'no leftover turn steps after resuming');
});

test('ending the session or unmounting clears every timer; a new session starts fresh', () => {
  const { clock, controller } = harness();
  controller.setSession('active');
  clock.advance(140_000);
  assert.equal(controller.getSnapshot().pagesTurned, 1);
  controller.setSession('idle');
  assert.equal(controller.getSnapshot().state, 'IDLE');
  assert.equal(clock.pending(), 0);
  controller.setSession('paused');
  assert.equal(controller.getSnapshot().state, 'IDLE', 'a session that never started cannot pause');
  controller.setSession('active');
  assert.equal(controller.getSnapshot().pagesTurned, 0);
  controller.dispose();
  assert.equal(clock.pending(), 0);
  const snapshot = controller.getSnapshot();
  clock.advance(30 * MINUTE);
  assert.equal(controller.getSnapshot(), snapshot, 'nothing runs after dispose');
  // React StrictMode remounts: dispose, then the session effect runs again.
  controller.setSession('active');
  assert.equal(controller.getSnapshot().state, 'READING');
  assert.equal(clock.pending(), 1);
});

test('every state maps to storyboard poses in order, and missing art falls back safely', () => {
  const frames = state => [...readingFrameCues(state, 800).map(cue => cue.frame)];
  assert.deepEqual(['READING', 'PAGE_PREPARATION', 'PAGE_LIFT', 'PAGE_TURN', 'PAGE_SETTLE', 'RETURN_TO_READING'].flatMap(frames),
    [0, 1, 2, 3, 4, 5, 0]);
  assert.deepEqual([...readingFrameCues('PAGE_TURN', 800).map(cue => cue.atMs)], [0, 400]);
  assert.deepEqual(frames('THINKING'), [1]);
  assert.deepEqual(frames('PAUSED'), [0]);
  assert.deepEqual(frames('IDLE'), [0]);
  const art = ['r1', 'r2', 'r3', undefined, 'r5', 'r6'];
  assert.equal(resolveReadingFrame(3, art), 0);
  assert.equal(resolveReadingFrame(4, art), 4);
  assert.equal(resolveReadingFrame(9, art), 0);
  assert.equal(resolveReadingFrame(2, []), null);
});
