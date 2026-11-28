import assert from "node:assert/strict";
import test from "node:test";
import { securityHeaders, privateResponse } from "../../lib/http-security.js";
import { app, server } from "../../server.js";

const request = { headers: { host: "petalpal.example" }, socket: {} };
test("production HTTPS security headers protect public responses", () => {
  const h = securityHeaders({ ...request, secure: true }, { NODE_ENV: "production" });
  assert.equal(h["Strict-Transport-Security"], "max-age=15552000");
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(h["Content-Security-Policy"], /frame-ancestors 'none'/);
});
test("responses do not name the framework", () => {
  assert.equal(app.get("x-powered-by"), false);
});
test("HSTS requires production HTTPS or the Render HTTPS ingress signal", () => {
  for (const env of [{ NODE_ENV: "development", RENDER: "true" }, { NODE_ENV: "production" }]) {
    assert.equal(securityHeaders({ ...request, headers: { ...request.headers, "x-forwarded-proto": "https" } }, env)["Strict-Transport-Security"], undefined);
  }
  const env = { NODE_ENV: "production", RENDER: "true" };
  assert.equal(securityHeaders(request, env)["Strict-Transport-Security"], undefined);
  assert.ok(securityHeaders({ ...request, headers: { ...request.headers, "x-forwarded-proto": "https" } }, env)["Strict-Transport-Security"]);
  assert.equal(securityHeaders({ ...request, secure: true }, { NODE_ENV: "development" })["Strict-Transport-Security"], undefined);
});
test("CSP supports current Firebase, local assets and same-origin WebSocket without eval or wildcard", () => {
  const csp = securityHeaders(request, { NODE_ENV: "production" })["Content-Security-Policy"];
  for (const source of ["https://apis.google.com", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://petalpal-b212c.firebaseapp.com", "wss://petalpal.example", "img-src 'self' data: blob:", "font-src 'self'", "style-src 'self' 'unsafe-inline'"]) assert.ok(csp.includes(source));
  assert.ok(!csp.includes("*"));
  assert.ok(!csp.includes("unsafe-eval"));
  assert.ok(!securityHeaders({ ...request, headers: { host: "bad;host" } }, { NODE_ENV: "production" })["Content-Security-Policy"].includes("wss://bad"));
  assert.ok(!csp.match(/script-src[^;]*unsafe-inline/));
  assert.equal(securityHeaders(request, { NODE_ENV: "development" })["Content-Security-Policy"], undefined);
});
test("CSP supports Web voice recording reads via connect-src blob: without widening other directives", () => {
  const firebase = "https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://apis.google.com https://petalpal-b212c.firebaseapp.com";
  const directives = (req) => Object.fromEntries(securityHeaders(req, { NODE_ENV: "production" })["Content-Security-Policy"]
    .split("; ").map(d => { const [name, ...sources] = d.split(" "); return [name, sources.join(" ")]; }));
  for (const [req, script] of [[{ ...request, method: "POST", path: "/speech/transcribe" }, "'self' https://apis.google.com"],
    [{ ...request, method: "GET", path: "/" }, "'self' 'wasm-unsafe-eval' https://apis.google.com"]]) {
    assert.deepEqual(directives(req), {
      "default-src": "'self'",
      "script-src": script,
      "style-src": "'self' 'unsafe-inline'",
      "img-src": "'self' data: blob: https://lh3.googleusercontent.com",
      "font-src": "'self'",
      "connect-src": `'self' blob: wss://petalpal.example ${firebase}`,
      "frame-src": "https://petalpal-b212c.firebaseapp.com",
      "object-src": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "frame-ancestors": "'none'"
    });
  }
  const invalidHost = directives({ ...request, headers: { host: "bad;host" } })["connect-src"];
  assert.equal(invalidHost, `'self' blob:  ${firebase}`);
  assert.equal(securityHeaders(request, { NODE_ENV: "development" })["Content-Security-Policy"], undefined);
});
test("private namespaces, dotted resource IDs and auth callback cannot escape no-store classification", () => {
  for (const path of ["/session", "/ai/memories/a.json", "/AI/memories/a.json", "/ai/reports", "/users/owner/garden", "/auth/session", "/speech/transcribe", "/internal/ai-jobs/dispatchable", "/finish-sign-in", "/unknown-private-route"]) {
    assert.ok(privateResponse({ path, method: "GET" }), path);
  }
  for (const path of ["/", "/favicon.svg", "/assets/index.js"]) assert.equal(privateResponse({ path, method: "GET" }), false);
});
test("actual HTTP app preserves public caching and marks anonymous/auth/CORS errors no-store", async (t) => {
  const keys = ["NODE_ENV", "RENDER", "CORS_ALLOWED_ORIGINS"];
  const previous = keys.map(k => process.env[k]);
  process.env.NODE_ENV = "production"; process.env.RENDER = "true";
  process.env.CORS_ALLOWED_ORIGINS = "https://petalpal.example";
  const listener = app.listen(0, "127.0.0.1");
  await new Promise(r => listener.once("listening", r));
  t.after(async () => { await new Promise(r => listener.close(r)); keys.forEach((k,i) => previous[i] === undefined ? delete process.env[k] : process.env[k] = previous[i]); });
  const base = `http://127.0.0.1:${listener.address().port}`;
  // Expo emits favicon.ico; exercise the actual generated static asset.
  for (const path of ["/", "/favicon.ico"]) {
    const response = await fetch(base + path, { headers: { "X-Forwarded-Proto": "https" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /public/);
    assert.equal(response.headers.get("strict-transport-security"), "max-age=15552000");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.ok(response.headers.get("content-security-policy"));
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    await response.arrayBuffer();
  }
  for (const path of ["/session", "/ai/reports", "/ai/memories/nonexistent", "/users/owner/garden", "/speech/transcribe"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    await response.arrayBuffer();
  }
  const denied = await fetch(base + "/session", { headers: { Origin: "https://untrusted.example" } });
  assert.equal(denied.status, 403); assert.equal(denied.headers.get("cache-control"), "no-store");
  const preflight = await fetch(base + "/auth/session", { method: "OPTIONS", headers: { Origin: "https://petalpal.example", "Access-Control-Request-Method": "POST" } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), "https://petalpal.example");
});
test("Socket.IO polling retains its transport/CORS contract and receives no-store headers", async (t) => {
  const previous = process.env.CORS_ALLOWED_ORIGINS;
  process.env.CORS_ALLOWED_ORIGINS = "https://petalpal.example";
  server.listen(0, "127.0.0.1"); await new Promise(r => server.once("listening", r));
  t.after(async () => { await new Promise(r => server.close(r)); previous === undefined ? delete process.env.CORS_ALLOWED_ORIGINS : process.env.CORS_ALLOWED_ORIGINS = previous; });
  const base = `http://127.0.0.1:${server.address().port}/socket.io/?EIO=4&transport=polling`;
  const response = await fetch(base, { headers: { Origin: "https://petalpal.example" } });
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://petalpal.example");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const packet = await response.text(); const sid = JSON.parse(packet.slice(1)).sid;
  await fetch(`${base}&sid=${sid}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "1" });
});
