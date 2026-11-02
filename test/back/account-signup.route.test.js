import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import prisma from "../../lib/prisma.js";
import { findUserByName, hashPassword, normalizeUsername, usernameProblem, verifyPassword } from "../../lib/accounts.js";
import { authenticateSocket, setFirebaseSignInTokenIssuerForTests, setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { AI_COST_ACTIONS } from "../../lib/ai-cost-gate.js";
import { createRateLimiter } from "../../lib/rate-limit.js";
import { app } from "../../server.js";
import { COMMUNITY_VERSION } from "../../lib/community-policy.js";

const MIGRATION = "prisma/migrations/202611020002_unique_names_account_passwords/migration.sql";

async function withServer(t) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
function mock(t, object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  t.after(() => { object[method] = original; });
}
const send = (url, path, method, body, token) => fetch(`${url}${path}`, {
  method,
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const profile = (extra = {}) => ({ name: "Bloom", avatar: "🦋", timezone: "UTC", preferredLocale: "en", communityTermsVersion: COMMUNITY_VERSION, ...extra });
const issueTokens = t => {
  setFirebaseSignInTokenIssuerForTests(async uid => `pass-for-${uid}`);
  t.after(() => setFirebaseSignInTokenIssuerForTests());
};
const signedIn = (t, claims) => {
  setFirebaseTokenVerifierForTests(async () => claims);
  t.after(() => setFirebaseTokenVerifierForTests());
};

test("names are the same name across case, width and spacing, in the database and in code", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "accountId" TEXT, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL, "firebaseUid" TEXT);`);
  await db.exec(`INSERT INTO "User" VALUES
    ('a', 'PP00000001', 'Anna', '2026-01-01'), ('b', 'PP00000002', 'anna', '2026-01-02'),
    ('c', 'PP00000003', 'ＡＮＮＡ', '2026-01-03'), ('d', 'PP00000004', '小花', '2026-01-04');`);
  await db.exec(readFileSync(MIGRATION, "utf8"));

  const names = (await db.query(`SELECT "id", "name" FROM "User" ORDER BY "id"`)).rows.map(row => row.name);
  assert.deepEqual(names, ["Anna", "anna_000002", "ＡＮＮＡ_000003", "小花"], "the oldest keeps the name, nothing is lost");
  for (const same of ["ANNA", " anna ", "ａｎｎａ", "小花"]) {
    await assert.rejects(db.query(`INSERT INTO "User" VALUES ('x', 'PP9', $1, now())`, [same]), /unique/i, same);
  }
  await assert.rejects(db.query(`INSERT INTO "User" VALUES ('x', 'PP9', 'New  Name', now())`).then(() =>
    db.query(`INSERT INTO "User" VALUES ('y', 'PP8', ' new name', now())`)), /unique/i);

  assert.equal(normalizeUsername("  ＡＮＮＡ   Lee "), "anna lee");
  const lookup = { $queryRawUnsafe: (sql, ...params) => db.query(sql.replace("/* account:name */", ""), params).then(result => result.rows) };
  assert.equal((await findUserByName(lookup, " ANNA_000002"))?.id, "b", "the lookup uses the index's own expression");
  assert.equal(await findUserByName(lookup, "nobody"), null);
});

test("a name cannot pose as a PP number or an email", () => {
  assert.ok(usernameProblem("PP12345678"));
  assert.ok(usernameProblem("ｐｐ123"));
  assert.ok(usernameProblem("me@example.com"));
  assert.equal(usernameProblem("PPL"), null);
  assert.equal(usernameProblem("小花仙"), null);
});

test("passwords are salted, verified and never stored as written", async () => {
  const [one, two] = await Promise.all([hashPassword("garden-gate"), hashPassword("garden-gate")]);
  assert.notEqual(one, two);
  assert.ok(!one.includes("garden-gate"));
  assert.equal(await verifyPassword("garden-gate", one), true);
  assert.equal(await verifyPassword("garden-gat", one), false);
  assert.equal(await verifyPassword(undefined, one), false);
  assert.equal(await verifyPassword("garden-gate", "not-a-hash"), false);
});

test("name and avatar alone make an account, with no email and AI off", async t => {
  issueTokens(t);
  const url = await withServer(t);
  let created;
  mock(t, prisma.user, "create", async ({ data }) => { created = data; return { id: data.id }; });

  const response = await send(url, "/auth/register", "POST", profile());
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(body.signInToken, `pass-for-${created.firebaseUid}`);
  assert.deepEqual(Object.keys(body), ["signInToken"]);
  assert.equal(created.email, null);
  assert.equal(created.emailVerifiedAt, null);
  assert.match(created.accountId, /^PP\d{8}$/);
  assert.equal(created.aiConsent.create.aiProcessing, false);
});

test("a taken name gets a clear refusal, and an id collision just draws again", async t => {
  issueTokens(t);
  const url = await withServer(t);
  const duplicate = () => Object.assign(new Error("duplicate"), { code: "P2002" });

  mock(t, prisma.user, "create", async () => { throw duplicate(); });
  mock(t, prisma, "$queryRawUnsafe", async () => [{ id: "someone" }]);
  const taken = await send(url, "/auth/register", "POST", profile());
  assert.equal(taken.status, 409);
  assert.equal((await taken.json()).code, "USERNAME_TAKEN");

  let tries = 0;
  const seen = [];
  prisma.user.create = async ({ data }) => { seen.push(data.accountId); if (++tries < 2) throw duplicate(); return { id: data.id }; };
  prisma.$queryRawUnsafe = async () => [];
  assert.equal((await send(url, "/auth/register", "POST", profile({ name: "Fresh" }))).status, 201);
  assert.equal(seen.length, 2);
});

test("registration refuses a bad profile and needs the Community Guidelines", async t => {
  issueTokens(t);
  const url = await withServer(t);
  mock(t, prisma.user, "create", async () => assert.fail("nothing is created"));
  assert.equal((await send(url, "/auth/register", "POST", profile({ name: " " }))).status, 400);
  assert.equal((await send(url, "/auth/register", "POST", profile({ name: "PP12345678" }))).status, 422);
  assert.equal((await send(url, "/auth/register", "POST", profile({ communityTermsVersion: undefined }))).status, 428);
  assert.equal((await send(url, "/auth/register", "POST", profile({ email: "a@b.co" }))).status, 400);
});

test("a stranger gets the same answer for a wrong password and an unknown name", async t => {
  issueTokens(t);
  const url = await withServer(t);
  const hash = await hashPassword("garden-gate");
  mock(t, prisma, "$queryRawUnsafe", async (_sql, name) => name === "Bloom" ? [{ id: "u1", firebaseUid: "fb1" }] : []);
  mock(t, prisma.user, "findUnique", async ({ where }) => where.accountId === "PP12345678" ? { id: "u1", firebaseUid: "fb1" } : null);
  mock(t, prisma.accountPassword, "findUnique", async ({ where }) => where.userId === "u1" ? { hash } : null);

  for (const login of ["Bloom", "PP12345678", "@pp12345678"]) {
    const good = await send(url, "/auth/password-login", "POST", { login, password: "garden-gate" });
    assert.equal(good.status, 200, login);
    assert.equal((await good.json()).signInToken, "pass-for-fb1");
  }
  const wrong = await send(url, "/auth/password-login", "POST", { login: "Bloom", password: "wrong-password" });
  const unknown = await send(url, "/auth/password-login", "POST", { login: "Nobody", password: "wrong-password" });
  assert.equal(wrong.status, 400);
  assert.equal(unknown.status, 400);
  assert.deepEqual(await wrong.json(), await unknown.json());
});

test("too many wrong passwords on one name are stopped", async () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, key: () => "bloom", skipSuccessfulRequests: true });
  const call = status => new Promise(resolve => {
    const handlers = {};
    const res = {
      statusCode: status, set() {}, once(event, handler) { handlers[event] = handler; },
      status(code) { this.statusCode = code; return this; }, json() { resolve(this.statusCode); }
    };
    limiter({ }, res, () => { handlers.finish?.(); resolve(status); });
  });
  assert.equal(await call(400), 400);
  assert.equal(await call(400), 400);
  assert.equal(await call(400), 429);
});

test("an account without email is let in over HTTP and sockets; an unverified address is never stored", async t => {
  const url = await withServer(t);
  signedIn(t, { uid: "fb1", email: "someone-else@example.com", email_verified: false, auth_time: 1 });
  let updates = 0;
  mock(t, prisma.user, "findUnique", async ({ where }) => where.firebaseUid === "fb1" ? { id: "u1", accountId: "PP1", name: "Bloom", email: null, emailVerifiedAt: null } : null);
  mock(t, prisma.user, "update", async () => { updates++; return {}; });
  mock(t, prisma.accountDeletion, "findUnique", async () => null);

  const session = await send(url, "/auth/session", "POST", { deferProfileCreation: true }, "token");
  assert.equal(session.status, 200);
  const { user } = await session.json();
  assert.equal(user.email, null);
  assert.equal(user.emailVerified, false);
  assert.equal(updates, 0);

  const socket = { handshake: { auth: { token: "token" }, headers: {} }, data: {} };
  const error = await new Promise(resolve => authenticateSocket(socket, resolve));
  assert.equal(error, undefined);
  assert.equal(socket.data.currentUserId, "u1");
});

test("an email joins the account only once verified, and an unverified one cannot claim an older account", async t => {
  const url = await withServer(t);
  const account = { id: "u1", accountId: "PP1", name: "Bloom", email: null, emailVerifiedAt: null };
  let saved = null, legacyLookups = 0;
  mock(t, prisma.accountDeletion, "findUnique", async () => null);
  mock(t, prisma.user, "findUnique", async ({ where }) => {
    if (where.email) { legacyLookups++; return null; }
    return where.firebaseUid === "fb1" ? account : null;
  });
  mock(t, prisma.user, "update", async ({ data }) => { saved = data; return { ...account, ...data }; });

  signedIn(t, { uid: "fb1", email: "Me@Example.com", email_verified: true });
  const verified = await (await send(url, "/auth/session", "POST", { deferProfileCreation: true }, "token")).json();
  assert.equal(saved.email, "me@example.com");
  assert.equal(verified.user.emailVerified, true);

  // A brand-new Firebase identity with an unverified address reaches the name step without any lookup by that address.
  setFirebaseTokenVerifierForTests(async () => ({ uid: "fb2", email: "victim@example.com", email_verified: false }));
  const fresh = await (await send(url, "/auth/session", "POST", { deferProfileCreation: true }, "token")).json();
  assert.equal(fresh.needsProfile, true);
  assert.equal(fresh.email, null);
  assert.equal(legacyLookups, 0);
});

test("replacing a password takes the old one; a first password does not", async t => {
  const url = await withServer(t);
  const now = Math.floor(Date.now() / 1000);
  signedIn(t, { uid: "fb1", firebase: { sign_in_provider: "custom" }, auth_time: now - 3600 });
  let hash = null, writes = 0;
  mock(t, prisma.user, "findUnique", async () => ({ id: "u1" }));
  mock(t, prisma.accountPassword, "findUnique", async () => hash ? { hash } : null);
  mock(t, prisma.accountPassword, "upsert", async ({ update }) => { hash = update.hash; writes++; });

  assert.equal((await send(url, "/auth/password", "PUT", { password: "short" }, "t")).status, 400);
  assert.equal((await send(url, "/auth/password", "PUT", { password: "first-password" }, "t")).status, 200);
  assert.equal((await send(url, "/auth/password", "PUT", { password: "second-password" }, "t")).status, 403);
  assert.equal((await send(url, "/auth/password", "PUT", { password: "second-password", currentPassword: "nope" }, "t")).status, 403);
  assert.equal(writes, 1);
  assert.equal((await send(url, "/auth/password", "PUT", { password: "second-password", currentPassword: "first-password" }, "t")).status, 200);
  assert.equal(await verifyPassword("second-password", hash), true);

  // Forgot it: the reset link, then a sign-in with the email just now, is the proof.
  setFirebaseTokenVerifierForTests(async () => ({ uid: "fb1", firebase: { sign_in_provider: "password" }, auth_time: now }));
  assert.equal((await send(url, "/auth/password", "PUT", { password: "third-password" }, "t")).status, 200);
});

test("the password endpoints need a session and recovery status never shows the hash", async t => {
  const url = await withServer(t);
  assert.equal((await send(url, "/auth/password", "PUT", { password: "first-password" })).status, 401);
  assert.equal((await send(url, "/auth/recovery", "GET")).status, 401);

  signedIn(t, { uid: "fb1" });
  mock(t, prisma.user, "findUnique", async ({ where }) => where.firebaseUid ? { id: "u1" } : { name: "Bloom", accountId: "PP1", email: "unverified@example.com", emailVerifiedAt: null });
  mock(t, prisma.accountPassword, "findUnique", async ({ select }) => { assert.equal(select.hash, undefined); return { userId: "u1" }; });
  const body = await (await send(url, "/auth/recovery", "GET", null, "t")).json();
  assert.deepEqual(body, { name: "Bloom", accountId: "PP1", email: null, hasPassword: true });
});

test("every AI action has a lower limit until an email is verified", () => {
  for (const [action, policy] of Object.entries(AI_COST_ACTIONS)) {
    assert.ok(policy.noEmail > 0 && policy.noEmail < policy.daily, action);
  }
});

test("deleting an account with no way back in does not ask for a fresh sign-in", async t => {
  const url = await withServer(t);
  signedIn(t, { uid: "fb1", auth_time: 1 });
  mock(t, prisma.user, "findUnique", async () => ({ id: "u1" }));
  mock(t, prisma.accountPassword, "findUnique", async () => ({ userId: "u1" }));
  const stale = await send(url, "/users/u1", "DELETE", null, "t");
  assert.equal(stale.status, 403, "with a password it can sign in again first");
  assert.equal((await stale.json()).code, "auth/requires-recent-login");

  prisma.accountPassword.findUnique = async () => null;
  const none = await send(url, "/users/u1", "DELETE", null, "t");
  assert.notEqual((await none.clone().json().catch(() => ({}))).code, "auth/requires-recent-login");
});
