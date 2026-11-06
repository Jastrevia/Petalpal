import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimiter, rateLimiters } from "../../lib/rate-limit.js";

function run(middleware, request, finishStatus = 401) {
  return new Promise((resolve) => {
    const headers = {};
    const finishes = [];
    const response = {
      once(event, callback) { if (event === "finish") finishes.push(callback); },
      set(name, value) {
        if (typeof name === "object") Object.assign(headers, name);
        else headers[name] = value;
        return this;
      },
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ statusCode: this.statusCode, body, headers }); }
    };
    middleware(request, response, () => {
      response.statusCode = finishStatus;
      finishes.forEach(callback => callback());
      resolve({ statusCode: 200, headers });
    });
  });
}

test("rate limiter rejects requests over the limit and resets with headers", async () => {
  let timestamp = 1_000;
  const limiter = createRateLimiter({
    limit: 2,
    windowMs: 10_000,
    key: (req) => req.ip,
    now: () => timestamp
  });

  assert.equal((await run(limiter, { ip: "one" })).statusCode, 200);
  assert.equal((await run(limiter, { ip: "one" })).headers["RateLimit-Remaining"], "0");
  const blocked = await run(limiter, { ip: "one" });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["Retry-After"], "10");
  assert.equal((await run(limiter, { ip: "two" })).statusCode, 200);

  timestamp += 10_000;
  assert.equal((await run(limiter, { ip: "one" })).statusCode, 200);
});

test("configured limiters separate auth IP and authenticated user buckets", async () => {
  const { auth, general, ai } = rateLimiters({
    RATE_LIMIT_WINDOW_MS: "1000",
    RATE_LIMIT_GENERAL_MAX: "1",
    RATE_LIMIT_AUTH_MAX: "1",
    RATE_LIMIT_AI_MAX: "1"
  });
  const first = { ip: "shared", auth: { userId: "user-1" } };
  const second = { ip: "shared", auth: { userId: "user-2" } };

  assert.equal((await run(auth, first)).statusCode, 200);
  assert.equal((await run(auth, second)).statusCode, 429);
  assert.equal((await run(general, first)).statusCode, 200);
  assert.equal((await run(general, second)).statusCode, 200);
  assert.equal((await run(ai, first)).statusCode, 200);
  assert.equal((await run(ai, first)).statusCode, 429);
});


test("auth failures group IPv6 addresses and IPv4-mapped equivalents; forwarded input does not set the bucket", async () => {
  const { auth } = rateLimiters({ RATE_LIMIT_AUTH_MAX: "1" });
  assert.equal((await run(auth, { ip: "2001:db8:abcd:1200::1" })).statusCode, 200);
  assert.equal((await run(auth, { ip: "2001:db8:abcd:12ff::2" })).statusCode, 429);
  assert.equal((await run(auth, { ip: "2001:db8:abcd:1300::1" })).statusCode, 200);
  assert.equal((await run(auth, { ip: "192.0.2.1", headers: { "x-forwarded-for": "fake-one" } })).statusCode, 200);
  assert.equal((await run(auth, { ip: "::ffff:192.0.2.1", headers: { "x-forwarded-for": "fake-two" } })).statusCode, 429);
});

test("successful session setup does not exhaust the shared NAT failure budget", async () => {
  const { auth } = rateLimiters({ RATE_LIMIT_AUTH_MAX: "1" });
  for (let i = 0; i < 4; i++) assert.equal((await run(auth, { ip: "shared-nat" }, 200)).statusCode, 200);
  assert.equal((await run(auth, { ip: "shared-nat" }, 401)).statusCode, 200);
  assert.equal((await run(auth, { ip: "shared-nat" }, 200)).statusCode, 429);
});

test("verified UID session budget survives IP rotation without using submitted account fields", async () => {
  const { authAccount } = rateLimiters({ RATE_LIMIT_AUTH_ACCOUNT_MAX: "1" });
  const first = { ip: "one", firebase: { uid: "verified-one" }, body: { email: "victim@example.test", firebaseUid: "victim" } };
  assert.equal((await run(authAccount, first, 200)).statusCode, 200);
  assert.equal((await run(authAccount, { ...first, ip: "two" }, 200)).statusCode, 429);
  assert.equal((await run(authAccount, { ...first, firebase: { uid: "victim" } }, 200)).statusCode, 200);
});

test("wrong current passwords are counted per signed-in account across IPs; successes and other accounts are free", async () => {
  const { passwordChange } = rateLimiters({ RATE_LIMIT_PASSWORD_CHANGE_MAX: "2" });
  const owner = { ip: "one", auth: { userId: "user-a" }, body: { login: "someone-else", currentPassword: "guess" } };
  for (let i = 0; i < 3; i++) assert.equal((await run(passwordChange, owner, 200)).statusCode, 200, "a saved password costs nothing");
  assert.equal((await run(passwordChange, owner, 403)).statusCode, 200);
  assert.equal((await run(passwordChange, { ...owner, ip: "two" }, 403)).statusCode, 200);
  assert.equal((await run(passwordChange, { ...owner, ip: "three" }, 403)).statusCode, 429, "a new IP does not reset the account's budget");
  assert.equal((await run(passwordChange, { ...owner, auth: { userId: "user-b" } }, 403)).statusCode, 200, "another account keeps its own budget");
});

test("capacity pressure cannot evict an active budget; expired buckets free capacity", async () => {
  let timestamp = 1000;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, key: req => req.ip, now: () => timestamp });
  await run(limiter, { ip: "attacker" }); await run(limiter, { ip: "other" });
  const rejected = await run(limiter, { ip: "new" });
  assert.equal(rejected.statusCode, 429); assert.equal(rejected.headers["Retry-After"], "1");
  assert.equal((await run(limiter, { ip: "attacker" })).statusCode, 429);
  timestamp = 2000;
  assert.equal((await run(limiter, { ip: "new" })).statusCode, 200);
});

test("admission counts successful shared-IP work independently of user/auth quotas", async () => {
  const { admission } = rateLimiters({ RATE_LIMIT_ADMISSION_MAX: "2", RATE_LIMIT_ADMISSION_WINDOW_MS: "5000" });
  const req = { ip: "192.0.2.50", auth: { userId: "one" } };
  assert.equal((await run(admission, req, 200)).statusCode, 200);
  assert.equal((await run(admission, { ...req, auth: { userId: "two" } }, 200)).statusCode, 200);
  const denied = await run(admission, { ...req, auth: { userId: "three" } });
  assert.equal(denied.statusCode, 429);
  assert.equal(denied.headers["Retry-After"], "5");
  assert.equal((await run(admission, { ip: "192.0.2.51" })).statusCode, 200);
});

test("admission uses normalized IPs, ignores submitted identity/headers and groups IPv6 /56", async () => {
  const { admission } = rateLimiters({ RATE_LIMIT_ADMISSION_MAX: "1" });
  assert.equal((await run(admission, { ip: "192.0.2.1" })).statusCode, 200);
  assert.equal((await run(admission, { ip: "::ffff:c000:201", headers: { "x-forwarded-for": "192.0.2.2" }, body: { userId: "other" } })).statusCode, 429);
  assert.equal((await run(admission, { ip: "2001:db8:abcd:1200::1" })).statusCode, 200);
  assert.equal((await run(admission, { ip: "2001:0db8:abcd:12ff:0000:0000:0000:0002" })).statusCode, 429);
  assert.equal((await run(admission, { ip: "2001:db8:abcd:1300::1" })).statusCode, 200);
});

test("admission defaults to 1200/minute independently of the existing quota window", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const { admission } = rateLimiters({ RATE_LIMIT_WINDOW_MS: "900000" });
  const first = await run(admission, { ip: "192.0.2.1" });
  assert.equal(first.headers["RateLimit-Limit"], "1200");
  assert.equal(first.headers["RateLimit-Reset"], "61");
  t.mock.timers.tick(60_000);
  assert.equal((await run(admission, { ip: "192.0.2.1" })).headers["RateLimit-Remaining"], "1199");
});

test("admission keeps at most 10000 active keys, retains budgets and reclaims expired capacity", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const { admission } = rateLimiters({ RATE_LIMIT_ADMISSION_MAX: "1", RATE_LIMIT_ADMISSION_WINDOW_MS: "1000" });
  for (let i = 0; i < 10_000; i++) {
    assert.equal((await run(admission, { ip: `10.0.${i >> 8}.${i & 255}` })).statusCode, 200);
  }
  assert.equal((await run(admission, { ip: "192.0.2.1" })).statusCode, 429);
  assert.equal((await run(admission, { ip: "10.0.0.0" })).statusCode, 429);
  t.mock.timers.tick(1000);
  assert.equal((await run(admission, { ip: "192.0.2.1" })).statusCode, 200);
  assert.equal((await run(admission, { ip: "10.0.0.0" })).statusCode, 200);
});

test("10000 saturated denials do not traverse the map before expiration", async t => {
  let timestamp = 1000, traversals = 0, events = 0;
  const iterator = Map.prototype[Symbol.iterator], values = Map.prototype.values;
  // Restore explicitly: Node 24.7's mock restoration mishandles this symbol.
  t.after(() => {
    Map.prototype[Symbol.iterator] = iterator;
    Map.prototype.values = values;
  });
  Map.prototype[Symbol.iterator] = function () {
    if (this.has("bucket-0")) traversals++;
    return iterator.call(this);
  };
  Map.prototype.values = function () {
    if (this.has("bucket-0")) traversals++;
    return values.call(this);
  };
  t.mock.method(console, "log", value => {
    assert.equal(JSON.parse(value).eventType, "rate_limit_exceeded");
    events++;
  });
  const limiter = createRateLimiter({ limit: 1, windowMs: 60000, key: req => req.ip, now: () => timestamp });
  for (let i = 0; i < 10000; i++) assert.equal((await run(limiter, { ip: `bucket-${i}` })).statusCode, 200);
  for (let i = 0; i < 10000; i++) {
    const denied = await run(limiter, { ip: `new-${i % 100}` });
    assert.equal(denied.statusCode, 429);
    assert.equal(denied.headers["Retry-After"], "60");
    assert.deepEqual(denied.body, { error: "Too many requests. Try again later." });
  }
  assert.equal(traversals, 0);
  assert.equal(events, 10000);
  assert.equal((await run(limiter, { ip: "bucket-0" })).statusCode, 429);
  timestamp = 61000;
  assert.equal((await run(limiter, { ip: "new" })).statusCode, 200);
  assert.equal(traversals, 1);
});

test("capacity Retry-After follows earliest bucket reset without evicting active budgets", async () => {
  let timestamp = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 10000, maxKeys: 2, key: req => req.ip, now: () => timestamp });
  await run(limiter, { ip: "first" });
  timestamp = 5000; await run(limiter, { ip: "second" });
  timestamp = 10000;
  assert.equal((await run(limiter, { ip: "first" })).statusCode, 200);
  assert.equal((await run(limiter, { ip: "new" })).headers["Retry-After"], "5");
  timestamp = 15000;
  assert.equal((await run(limiter, { ip: "new" })).statusCode, 200);
  assert.equal((await run(limiter, { ip: "first" })).statusCode, 429);
});

test("capacity expiration metadata handles successful deletion and stale finish callbacks", async () => {
  for (const resetBeforeFinish of [false, true]) {
    let timestamp = 0, finish;
    const limiter = createRateLimiter({ limit: 1, windowMs: 10000, maxKeys: 2, skipSuccessfulRequests: true, key: req => req.ip, now: () => timestamp });
    limiter({ ip: "first" }, { statusCode: 200, set() {}, once(_event, callback) { finish = callback; } }, () => {});
    timestamp = 5000; await run(limiter, { ip: "second" });
    timestamp = resetBeforeFinish ? 10000 : 6000;
    if (resetBeforeFinish) assert.equal((await run(limiter, { ip: "first" })).statusCode, 200);
    finish();
    if (resetBeforeFinish) assert.equal((await run(limiter, { ip: "first" })).statusCode, 429);
    else assert.equal((await run(limiter, { ip: "replacement" })).statusCode, 200);
    const denied = await run(limiter, { ip: "new" });
    assert.equal(denied.statusCode, 429);
    assert.equal(denied.headers["Retry-After"], resetBeforeFinish ? "5" : "9");
  }
});

test("capacity metadata follows backward and forward clock changes", async () => {
  let timestamp = 10000;
  const limiter = createRateLimiter({ limit: 1, windowMs: 10000, maxKeys: 2, key: req => req.ip, now: () => timestamp });
  await run(limiter, { ip: "later" });
  timestamp = 0; await run(limiter, { ip: "earlier" });
  timestamp = -1000;
  assert.equal((await run(limiter, { ip: "new" })).headers["Retry-After"], "11");
  timestamp = 10000;
  assert.equal((await run(limiter, { ip: "new" })).statusCode, 200);
  assert.equal((await run(limiter, { ip: "later" })).statusCode, 429);
  timestamp = 100000;
  assert.equal((await run(limiter, { ip: "after-jump" })).statusCode, 200);
});
