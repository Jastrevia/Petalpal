import assert from "node:assert/strict";
import test from "node:test";
import { featurePaused, installAppConfig, readAppConfig } from "../../lib/app-config.js";
import { petalCardsEnabledFor } from "../../lib/petal-cards.js";
import { scrubServerEvent } from "../../lib/monitoring.js";

test("app config: nothing set means no notice, no minimum version, nothing paused", () => {
  assert.deepEqual(readAppConfig({}), { maintenance: null, minimumVersion: { ios: null, android: null }, paused: [] });
});

test("app config: maintenance notice, blocking flag, versions and known paused features only", () => {
  const config = readAppConfig({ APP_MAINTENANCE_EN: " Back at 10 pm ", APP_MAINTENANCE_ZH: "晚上十点回来", APP_MAINTENANCE_BLOCKING: "1",
    APP_MIN_VERSION_IOS: "1.0.1", APP_MIN_VERSION_ANDROID: "not-a-version", APP_PAUSED_FEATURES: "petalTarot, friendMessages,unknown" });
  assert.deepEqual(config.maintenance, { blocking: true, message: { en: "Back at 10 pm", "zh-Hans": "晚上十点回来" } });
  assert.deepEqual(config.minimumVersion, { ios: "1.0.1", android: null });
  assert.deepEqual(config.paused, ["friendMessages", "petalTarot"]);
  // One language alone still shows a notice in both.
  assert.deepEqual(readAppConfig({ APP_MAINTENANCE_ZH: "维护中" }).maintenance.message, { en: "维护中", "zh-Hans": "维护中" });
});

test("pausing petalTarot turns petal cards off for every owner, even one on the opt-in list", () => {
  const env = { PETAL_CARDS_OWNER_IDS: "*" };
  assert.equal(petalCardsEnabledFor(env, "u1"), true);
  assert.equal(petalCardsEnabledFor({ ...env, APP_PAUSED_FEATURES: "petalTarot" }, "u1"), false);
  assert.equal(featurePaused({ APP_PAUSED_FEATURES: "friendMessages" }, "petalTarot"), false);
});

function fakeApp() {
  const routes = new Map();
  return { routes, get: (path, handler) => routes.set(path, handler) };
}
function fakeResponse() {
  return { statusCode: 200, headers: {}, body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

test("/app-config answers without signing in and /healthz reports the database, reusing its answer briefly", async () => {
  const app = fakeApp();
  let queries = 0, up = true, clock = 0;
  const database = { $queryRaw: async () => { queries++; if (!up) throw new Error("down"); return [{ "?column?": 1 }]; } };
  installAppConfig(app, database, { env: { APP_PAUSED_FEATURES: "friendMessages" }, now: () => clock });
  const config = fakeResponse();
  app.routes.get("/app-config")({}, config);
  assert.deepEqual(config.body.paused, ["friendMessages"]);
  assert.match(config.headers["Cache-Control"], /max-age=60/);

  const first = fakeResponse(); await app.routes.get("/healthz")({}, first);
  const again = fakeResponse(); await app.routes.get("/healthz")({}, again);
  assert.equal(first.statusCode, 200); assert.equal(again.statusCode, 200); assert.equal(queries, 1);
  up = false; clock += 11_000;
  const down = fakeResponse(); await app.routes.get("/healthz")({}, down);
  assert.equal(down.statusCode, 503); assert.deepEqual(down.body, { ok: false });
});

test("server error reports carry no request, user, breadcrumbs or uncaught error messages", () => {
  const event = scrubServerEvent({ request: { data: "secret journal" }, user: { id: "u1" }, extra: { body: "x" }, breadcrumbs: [{ message: "x" }],
    exception: { values: [{ type: "PrismaClientKnownRequestError", value: "Unique constraint failed on value 'alice'" }] } });
  assert.equal(event.request, undefined); assert.equal(event.user, undefined); assert.equal(event.extra, undefined);
  assert.deepEqual(event.breadcrumbs, []);
  assert.equal(event.exception.values[0].value, "[message withheld]");
  assert.equal(event.exception.values[0].type, "PrismaClientKnownRequestError");
  // A report written by reportServerError keeps its own fixed message (the route).
  const routed = scrubServerEvent({ tags: { route: "POST /events error" }, exception: { values: [{ type: "Error", value: "POST /events error" }] } });
  assert.equal(routed.exception.values[0].value, "POST /events error");
});
