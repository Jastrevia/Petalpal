import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { hashRedeemCode, listRedemptions, normalizeRedeemCode, redeemCode, REDEEM_BATCHES } from "../../lib/redeem-codes.js";
import { app } from "../../server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Test-only codes: a batch of their own, never the real hashes.
const CODE_A = "7K3MQ8ZT2PNV4XR9HC6B", CODE_B = "W5DGJ0YF1SAE8T3KQ2MN", CODE_C = "R4H9N2B6PXK0VZ7TQ3CM";
const batch = { id: "test-batch", reward: "test-gift", hashes: [CODE_A, CODE_B, CODE_C].map(hashRedeemCode) };
const batches = new Map(batch.hashes.map(hash => [hash, batch]));

test("codes: forgiving input, strict shape", () => {
  assert.equal(normalizeRedeemCode("7k3mq-8zt2p-nv4xr-9hc6b"), CODE_A);
  assert.equal(normalizeRedeemCode(" 7K3MQ 8ZT2P NV4XR 9HC6B "), CODE_A);
  assert.equal(normalizeRedeemCode("W5DGJOYFISAE8T3KQ2MN"), CODE_B, "O reads as 0 and I as 1");
  for (const bad of ["", "7K3MQ8ZT2PNV4XR9HC6", "7K3MQ8ZT2PNV4XR9HC6BX", "7K3MQ8ZT2PNV4XR9HC6U", "7K3MQ8ZT2PNV4XR9HC6!", null, 42, "A".repeat(80)]) {
    assert.equal(normalizeRedeemCode(bad), null, String(bad));
  }
});

test("the real batch: 100 distinct hashes, no codes in the repository", () => {
  const real = REDEEM_BATCHES.find(item => item.id === "beta-gift-2026-10");
  assert.equal(real.hashes.length, 100);
  assert.equal(new Set(real.hashes).size, 100);
  assert.ok(real.hashes.every(hash => /^[0-9a-f]{64}$/.test(hash)));
  assert.ok(!real.hashes.includes(hashRedeemCode(CODE_A)));
});

function fakeDatabase() {
  const claims = [];
  const db = {
    claims,
    redeemCodeClaim: {
      findUnique: async ({ where }) => claims.find(row => row.codeHash === where.codeHash) || null,
      findFirst: async ({ where }) => claims.find(row => row.userId === where.userId && row.batch === where.batch) || null,
      findMany: async ({ where }) => claims.filter(row => row.userId === where.userId),
      create: async ({ data }) => {
        if (claims.some(row => row.codeHash === data.codeHash)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const row = { id: `c${claims.length + 1}`, rewardStatus: "pending", createdAt: new Date(0), grantedAt: null, ...data };
        claims.push(row); return row;
      }
    },
    $queryRaw: async () => [{ locked: "" }]
  };
  db.$transaction = async fn => fn(db);
  return db;
}

test("a code works once; an account redeems one per batch; the reward waits as pending", async () => {
  const db = fakeDatabase();
  const first = await redeemCode(db, { userId: "u1", code: "7k3mq-8zt2p-nv4xr-9hc6b", batches });
  assert.deepEqual({ ...first, redeemedAt: undefined }, { created: true, batch: "test-batch", reward: "test-gift", status: "pending", redeemedAt: undefined });
  assert.ok(db.claims.every(row => !JSON.stringify(row).includes(CODE_A)), "only the hash is stored");

  const again = await redeemCode(db, { userId: "u1", code: CODE_A, batches });
  assert.equal(again.created, false, "the owner retrying their own code just sees it again");
  await assert.rejects(redeemCode(db, { userId: "u2", code: CODE_A, batches }), { code: "CODE_USED", status: 409 });
  await assert.rejects(redeemCode(db, { userId: "u1", code: CODE_B, batches }), { code: "ALREADY_REDEEMED", status: 409 });
  await assert.rejects(redeemCode(db, { userId: "u1", code: "ZZZZZZZZZZZZZZZZZZZZ", batches }), { code: "INVALID_CODE", status: 400 });
  await assert.rejects(redeemCode(db, { userId: "u1", code: "nope", batches }), { code: "INVALID_CODE" });

  assert.equal((await redeemCode(db, { userId: "u2", code: CODE_B, batches })).created, true);
  assert.deepEqual((await listRedemptions(db, { userId: "u1" })).map(item => item.reward), ["test-gift"]);
  assert.deepEqual(await listRedemptions(db, { userId: "u3" }), []);
});

test("a race for the same code: the second claim is told it is used", async () => {
  const db = fakeDatabase();
  db.redeemCodeClaim.findUnique = async () => null; // both see it free
  await redeemCode(db, { userId: "u1", code: CODE_C, batches });
  await assert.rejects(redeemCode(db, { userId: "u2", code: CODE_C, batches }), { code: "CODE_USED" });
});

test("migration: one claim per code and per account and batch; a deleted account's code stays spent", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    const names = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
      .filter(item => item.isDirectory()).map(item => item.name).sort();
    for (const name of names) await db.exec(await readFile(path.join(root, "prisma/migrations", name, "migration.sql"), "utf8"));
    await db.exec(`INSERT INTO "User" (id, name) VALUES ('a', 'A'), ('b', 'B');
      INSERT INTO "RedeemCodeClaim" (id, "codeHash", batch, reward, "userId") VALUES ('c1', 'h1', 'x', 'gift', 'a');`);
    const claim = (id, hash, user) => db.exec(`INSERT INTO "RedeemCodeClaim" (id, "codeHash", batch, reward, "userId") VALUES ('${id}', '${hash}', 'x', 'gift', '${user}')`);
    await assert.rejects(claim("c2", "h1", "b"), /unique/i);
    await assert.rejects(claim("c3", "h2", "a"), /unique/i);
    assert.equal((await db.query(`SELECT "rewardStatus" FROM "RedeemCodeClaim" WHERE id = 'c1'`)).rows[0].rewardStatus, "pending");
    await db.exec(`DELETE FROM "User" WHERE id = 'a'`);
    const rows = (await db.query(`SELECT "codeHash", "userId" FROM "RedeemCodeClaim"`)).rows;
    assert.deepEqual(rows, [{ codeHash: "h1", userId: null }]);
    await assert.rejects(claim("c4", "h1", "b"), /unique/i);
  } finally { await db.close(); }
});

test("redeem routes", async (t) => {
  const db = fakeDatabase();
  const restore = [];
  const stub = (target, method, fn) => { const original = target[method]; restore.push(() => { target[method] = original; }); target[method] = fn; };
  stub(prisma, "$transaction", async fn => fn(db));
  stub(prisma.user, "findUnique", async args => (args.where?.firebaseUid === "owner-uid"
    ? { id: "owner-1", firebaseUid: "owner-uid", timezone: "UTC" } : null));
  stub(prisma.redeemCodeClaim, "findMany", db.redeemCodeClaim.findMany);
  setFirebaseTokenVerifierForTests(async () => ({ uid: "owner-uid", email: "owner@example.test", email_verified: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    restore.forEach(fn => fn());
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const call = async (urlPath, method = "GET", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${urlPath}`, {
      method, headers: { Authorization: "Bearer owner-token", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };
  assert.deepEqual((await call("/api/redeem")).body, { redemptions: [] });
  for (const body of [{}, { code: 5 }, { code: CODE_A, userId: "someone" }]) {
    assert.equal((await call("/api/redeem", "POST", body)).status, 400, JSON.stringify(body));
  }
  const wrong = await call("/api/redeem", "POST", { code: CODE_A }); // a test code is not a real one
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.code, "INVALID_CODE");
  // Ten wrong guesses an hour; the eleventh is refused before it is checked.
  let last;
  for (let i = 0; i < 10; i++) last = await call("/api/redeem", "POST", { code: CODE_B });
  assert.equal(last.status, 429);
});
