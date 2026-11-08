import assert from "node:assert/strict";
import test from "node:test";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { app } from "../../server.js";

const originals = {
  userFindUnique: prisma.user.findUnique,
  userFairyFindUnique: prisma.userFairy?.findUnique,
  userFairyFindFirst: prisma.userFairy?.findFirst,
  userFairyCreate: prisma.userFairy?.create,
  userFairyUpdate: prisma.userFairy?.update,
  fairyRuntimeUpsert: prisma.fairyRuntime?.upsert,
  fairyRuntimeCreate: prisma.fairyRuntime?.create,
  fairyStateFindUnique: prisma.fairyState?.findUnique,
  fairyStateUpsert: prisma.fairyState?.upsert,
  transaction: prisma.$transaction,
  queryRaw: prisma.$queryRaw,
};

test("onboarding persistence contract: cross-device skip, user isolation, and finale persistence", async (t) => {
  // In-memory test store isolated per user
  const users = new Map([
    ["firebase-alice", { id: "user-alice", email: "alice@example.com" }],
    ["firebase-bob", { id: "user-bob", email: "bob@example.com" }],
    ["firebase-existing", { id: "user-existing", email: "existing@example.com" }]
  ]);

  const fairyStates = new Map([
    ["user-existing", {
      userId: "user-existing",
      onboardingCompleted: true,
      onboardingStep: "GARDEN_UNLOCKED",
      unlockedFeatures: []
    }]
  ]);

  const userFairies = new Map();

  // Stub Token Verifier for multiple users
  setFirebaseTokenVerifierForTests(async (token) => {
    if (token === "token-alice") return { uid: "firebase-alice", email: "alice@example.com", email_verified: true };
    if (token === "token-bob") return { uid: "firebase-bob", email: "bob@example.com", email_verified: true };
    if (token === "token-existing") return { uid: "firebase-existing", email: "existing@example.com", email_verified: true };
    throw new Error("Invalid token");
  });

  // Prisma Stubs
  prisma.user.findUnique = async ({ where }) => {
    if (where.firebaseUid) {
      const user = users.get(where.firebaseUid);
      return user ? { id: user.id, email: user.email } : null;
    }
    if (where.id) {
      for (const u of users.values()) if (u.id === where.id) return { id: u.id, email: u.email };
    }
    return null;
  };

  prisma.fairyState.findUnique = async ({ where }) => {
    return fairyStates.get(where.userId) || null;
  };

  prisma.fairyState.upsert = async ({ where, update, create }) => {
    const existing = fairyStates.get(where.userId);
    const updated = existing ? { ...existing, ...update } : { userId: where.userId, ...create };
    fairyStates.set(where.userId, updated);
    return updated;
  };

  prisma.userFairy = {
    findUnique: async ({ where }) => {
      if (where.userId_fairyType) {
        return userFairies.get(`${where.userId_fairyType.userId}:${where.userId_fairyType.fairyType}`) || null;
      }
      return null;
    },
    findFirst: async ({ where }) => {
      for (const f of userFairies.values()) {
        if (f.userId === where.userId && (where.isActive === undefined || f.isActive === where.isActive)) {
          return f;
        }
      }
      return null;
    },
    create: async ({ data }) => {
      const record = { id: `uf-${Date.now()}-${Math.random()}`, ...data };
      userFairies.set(`${data.userId}:${data.fairyType}`, record);
      return record;
    },
    update: async ({ where, data }) => {
      for (const [key, f] of userFairies.entries()) {
        if (f.id === where.id) {
          const updated = { ...f, ...data };
          userFairies.set(key, updated);
          return updated;
        }
      }
      return null;
    }
  };

  prisma.fairyRuntime = {
    upsert: async ({ where, create, update }) => ({ id: "rt-1", ...where, ...create, ...update }),
    create: async ({ data }) => ({ id: "rt-1", ...data })
  };

  prisma.$queryRaw = async () => [{ locked: "ok" }];

  prisma.$transaction = async (fn) => {
    const tx = {
      ...prisma,
      $queryRaw: async () => [{ locked: "ok" }]
    };
    return fn(tx);
  };

  const httpServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => httpServer.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  t.after(async () => {
    prisma.user.findUnique = originals.userFindUnique;
    if (originals.userFairyFindUnique) prisma.userFairy.findUnique = originals.userFairyFindUnique;
    if (originals.userFairyFindFirst) prisma.userFairy.findFirst = originals.userFairyFindFirst;
    if (originals.userFairyCreate) prisma.userFairy.create = originals.userFairyCreate;
    if (originals.userFairyUpdate) prisma.userFairy.update = originals.userFairyUpdate;
    if (originals.fairyRuntimeUpsert) prisma.fairyRuntime.upsert = originals.fairyRuntimeUpsert;
    if (originals.fairyRuntimeCreate) prisma.fairyRuntime.create = originals.fairyRuntimeCreate;
    prisma.fairyState.findUnique = originals.fairyStateFindUnique;
    prisma.fairyState.upsert = originals.fairyStateUpsert;
    prisma.$transaction = originals.transaction;
    prisma.$queryRaw = originals.queryRaw;
    setFirebaseTokenVerifierForTests();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  const get = async (token, path) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const patch = async (token, path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  await t.test("A. New account starts onboarding automatically", async () => {
    const res = await get("token-alice", "/api/onboarding");
    assert.equal(res.status, 404);
    assert.equal(res.body.status, "active");
    assert.equal(res.body.step, "intro.name");
  });

  await t.test("B. Complete Finale persists onboardingCompleted = true in the database", async () => {
    // 1. Name the fairy first
    const nameRes = await patch("token-alice", "/api/onboarding", { fairyName: "小花" });
    assert.equal(nameRes.status, 200);
    assert.equal(nameRes.body.fairyName, "小花");
    assert.equal(nameRes.body.fairyNamed, true);

    // 2. Complete Finale
    const finaleRes = await patch("token-alice", "/api/onboarding", { complete: true });
    assert.equal(finaleRes.status, 200);
    assert.equal(finaleRes.body.status, "completed");
    assert.equal(finaleRes.body.step, "done");
    assert.equal(finaleRes.body.flowerPlanted, true);

    // 3. Verify in database
    const dbState = fairyStates.get("user-alice");
    assert.ok(dbState, "FairyState must exist in DB");
    assert.equal(dbState.onboardingCompleted, true, "onboardingCompleted must be true in DB");
    assert.equal(dbState.onboardingStep, "GARDEN_UNLOCKED", "onboardingStep must be GARDEN_UNLOCKED");
  });

  await t.test("C. Log out and back in on same account skips onboarding", async () => {
    const res = await get("token-alice", "/api/onboarding");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "completed");
    assert.equal(res.body.step, "done");
    assert.equal(res.body.fairyName, "小花");
  });

  await t.test("D. Log in on another device with same account skips onboarding", async () => {
    // Simulate a fresh device: no local storage, fresh GET /api/onboarding
    const res = await get("token-alice", "/api/onboarding");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "completed");
    assert.equal(res.body.step, "done");
  });

  await t.test("E. Existing completed user skips onboarding", async () => {
    const res = await get("token-existing", "/api/onboarding");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "completed");
    assert.equal(res.body.step, "done");
  });

  await t.test("F. Completion update is idempotent and cannot rewind", async () => {
    // Calling complete again
    const res1 = await patch("token-alice", "/api/onboarding", { complete: true });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.status, "completed");

    // Subsequent intermediate step cannot un-complete
    const res2 = await patch("token-alice", "/api/onboarding", { step: "intro.name" });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.status, "completed");
    assert.equal(res2.body.step, "done");

    const dbState = fairyStates.get("user-alice");
    assert.equal(dbState.onboardingCompleted, true);
  });

  await t.test("G. Different users cannot read or update each other's completion records", async () => {
    // Bob is a fresh user
    const bobInitial = await get("token-bob", "/api/onboarding");
    assert.equal(bobInitial.status, 404);
    assert.equal(bobInitial.body.status, "active");

    // Bob cannot complete Alice's onboarding or affect Alice's record
    const bobComplete = await patch("token-bob", "/api/onboarding", { complete: true });
    assert.equal(bobComplete.status, 200);

    const bobDb = fairyStates.get("user-bob");
    assert.equal(bobDb.onboardingCompleted, true);
    assert.equal(bobDb.userId, "user-bob");

    // Alice's record is completely separate
    const aliceDb = fairyStates.get("user-alice");
    assert.equal(aliceDb.userId, "user-alice");
    assert.equal(aliceDb.onboardingCompleted, true);
  });
});
