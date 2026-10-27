import assert from "node:assert/strict";
import test from "node:test";
import { createPresence } from "../../lib/presence.js";

function harness() {
  const changes = [], timers = [];
  const presence = createPresence({ offlineDelayMs: 15_000, onChange: (id, online) => changes.push([id, online]),
    setTimer: fn => { const timer = { fn, cleared: false }; timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; } });
  const fire = () => timers.filter(t => !t.cleared && !t.fired).forEach(t => { t.fired = true; t.fn(); });
  return { presence, changes, fire };
}

test("online with any socket; one announcement per transition", () => {
  const { presence, changes, fire } = harness();
  presence.join("a", "s1"); presence.join("a", "s2");
  assert.deepEqual(changes, [["a", true]]);
  presence.leave("a", "s1");
  assert.equal(presence.isOnline("a"), true); fire();
  assert.deepEqual(changes, [["a", true]], "a second tab keeps her online");
  presence.leave("a", "s2"); fire();
  assert.deepEqual(changes, [["a", true], ["a", false]]);
  assert.equal(presence.isOnline("a"), false);
});

test("a quick reconnect inside the grace period never shows offline", () => {
  const { presence, changes, fire } = harness();
  presence.join("a", "s1"); presence.leave("a", "s1");
  assert.equal(presence.isOnline("a"), true);
  presence.join("a", "s2"); fire();
  assert.deepEqual(changes, [["a", true]]);
  presence.leave("b", "never-joined");
  assert.deepEqual(changes, [["a", true]]);
});
