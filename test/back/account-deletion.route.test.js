import assert from "node:assert/strict";
import test from "node:test";

import prisma from "../../lib/prisma.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { app, setFirebaseUserDeleterForTests } from "../../server.js";

function deletionTransaction() {
  const state = {
    user: true,
    friendships: 2,
    friendRequests: 2,
    flowers: 1,
    flowerMessages: 1,
    gardenVisits: 1,
    garden: true,
    userVisits: 1,
    userMessages: 1
  };
  const tx = {
    $queryRawUnsafe: async () => [],
    report: { deleteMany: async () => ({count:0}) },
    accountDeletion: {
      findUnique: async () => state.deletionRecord || null,
      create: async ({data}) => { state.deletionRecord = {...data,completedAt:null}; return state.deletionRecord; }
    },
    user: {
      findUnique: async () => state.user
        ? { id: "owner-1", firebaseUid: "firebase-owner" }
        : null,
      delete: async () => { state.user = false; }
    },
    friendship: { deleteMany: async () => { state.friendships = 0; } },
    friendRequest: { deleteMany: async () => { state.friendRequests = 0; } },
    garden: {
      findUnique: async () => state.garden ? { id: "garden-1" } : null,
      delete: async () => { state.garden = false; }
    },
    flower: {
      findMany: async () => state.flowers ? [{ id: "flower-1" }] : [],
      deleteMany: async () => { state.flowers = 0; }
    },
    message: {
      deleteMany: async ({ where }) => {
        if (where.flowerId) state.flowerMessages = 0;
        if (where.userId) state.userMessages = 0;
      }
    },
    visitRecord: {
      deleteMany: async ({ where }) => {
        if (where.gardenId) state.gardenVisits = 0;
        if (where.visitorId) state.userVisits = 0;
      }
    }
  };
  return { state, tx };
}

test("account deletion is owner-only, deletes all related data and retains a durable retry after Firebase failure", async (t) => {
  const originalFindUnique = prisma.user.findUnique;
  const originalDeletionUpdate = prisma.accountDeletion.update;
  const originalAuditCreate = prisma.auditEvent.create;
  const originalTransaction = prisma.$transaction;
  let current = deletionTransaction();
  prisma.accountDeletion.update = async ({data}) => Object.assign(current.state.deletionRecord,data);
  let firebaseUid = null;
  let audits = 0, transactions = 0;
  prisma.auditEvent.create = async () => { audits++; return { id: "audit-1" }; };

  prisma.user.findUnique = async ({ where }) => ({
    id: where.firebaseUid === "firebase-owner" ? "owner-1" : "other-1"
  });
  prisma.$transaction = async (callback) => {
    transactions++;
    const snapshot = structuredClone(current.state);
    try {
      return await callback(current.tx);
    } catch (error) {
      for (const key of Object.keys(current.state)) delete current.state[key];
      Object.assign(current.state, snapshot);
      throw error;
    }
  };
  setFirebaseTokenVerifierForTests(async (token) => ({
    uid: token === "other-token" ? "firebase-other" : "firebase-owner",
    email_verified: true,
    iat: Math.floor(Date.now()/1000),
    auth_time: token === "stale-token" ? Math.floor(Date.now()/1000)-600
      : token === "missing-time" ? undefined : token === "bad-time" ? "bad"
      : token === "future-time" ? Math.floor(Date.now()/1000)+60 : Math.floor(Date.now()/1000)
  }));
  setFirebaseUserDeleterForTests(async (uid) => { firebaseUid = uid; });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    prisma.user.findUnique = originalFindUnique;
    prisma.accountDeletion.update = originalDeletionUpdate;
    prisma.auditEvent.create = originalAuditCreate;
    prisma.$transaction = originalTransaction;
    setFirebaseTokenVerifierForTests();
    setFirebaseUserDeleterForTests();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/users/owner-1`;
  const remove = (token) => fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ auth_time: Math.floor(Date.now()/1000) })
  });

  const forbidden = await remove("other-token");
  assert.equal(forbidden.status, 403);
  assert.equal(current.state.user, true);

  for (const token of ["stale-token", "missing-time", "bad-time", "future-time"]) {
    const rejected = await remove(token);
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).code, "auth/requires-recent-login");
    assert.equal(audits, 0); assert.equal(transactions, 0); assert.equal(firebaseUid, null);
    assert.deepEqual(current.state, deletionTransaction().state);
  }

  const deleted = await remove("owner-token");
  assert.equal(deleted.status, 200);
  assert.equal(firebaseUid, "firebase-owner");
  assert.deepEqual(current.state, {
    user: false,
    friendships: 0,
    friendRequests: 0,
    flowers: 0,
    flowerMessages: 0,
    gardenVisits: 0,
    garden: false,
    userVisits: 0,
    userMessages: 0,
    deletionRecord: {userId:"owner-1",firebaseUid:"firebase-owner",completedAt:current.state.deletionRecord.completedAt}
  });
  assert.ok(current.state.deletionRecord.completedAt);

  current = deletionTransaction();
  setFirebaseUserDeleterForTests(async () => { throw new Error("Firebase unavailable"); });
  const failed = await remove("owner-token");
  assert.equal(failed.status, 202);
  assert.equal((await failed.json()).dataDeleted, true);
  assert.equal(current.state.user,false);
  assert.equal(current.state.deletionRecord.completedAt,null);
  const erased=structuredClone(current.state);
  setFirebaseUserDeleterForTests(async () => {});
  const recovered=await remove("owner-token");assert.equal(recovered.status,200);
  assert.ok(current.state.deletionRecord.completedAt);
  assert.deepEqual({...current.state,deletionRecord:erased.deletionRecord},erased);
  current = deletionTransaction();
  current.tx.report.deleteMany = async()=>{throw new Error("Injected database failure");};
  const rolledBack=await remove("owner-token");assert.equal(rolledBack.status,500);
  assert.deepEqual(current.state,deletionTransaction().state);
});

// Not signed in within the last few minutes: a name-and-password account confirms with its password in the
// delete dialog instead of signing out and in again. Without it, or with a wrong one, nothing is deleted.
test("a password account not signed in recently deletes only after confirming its password", async (t) => {
  const { hashPassword } = await import("../../lib/accounts.js");
  const hash = await hashPassword("garden-pass-1");
  const originals = { user: prisma.user.findUnique, password: prisma.accountPassword.findUnique, update: prisma.accountDeletion.update,
    audit: prisma.auditEvent.create, transaction: prisma.$transaction };
  const current = deletionTransaction();
  let transactions = 0, deletedUid = null;
  prisma.user.findUnique = async () => ({ id: "owner-1" });
  prisma.accountPassword.findUnique = async ({ where }) => where.userId === "owner-1" ? { hash } : null;
  prisma.accountDeletion.update = async ({ data }) => Object.assign(current.state.deletionRecord, data);
  prisma.auditEvent.create = async () => ({ id: "audit-1" });
  prisma.$transaction = async (callback) => { transactions++; return callback(current.tx); };
  setFirebaseTokenVerifierForTests(async () => ({ uid: "firebase-owner", email_verified: false,
    iat: Math.floor(Date.now() / 1000), auth_time: Math.floor(Date.now() / 1000) - 3600 }));
  setFirebaseUserDeleterForTests(async (uid) => { deletedUid = uid; });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    prisma.user.findUnique = originals.user; prisma.accountPassword.findUnique = originals.password;
    prisma.accountDeletion.update = originals.update; prisma.auditEvent.create = originals.audit; prisma.$transaction = originals.transaction;
    setFirebaseTokenVerifierForTests(); setFirebaseUserDeleterForTests();
    await new Promise((resolve) => server.close(resolve));
  });
  const remove = (body) => fetch(`http://127.0.0.1:${server.address().port}/users/owner-1`, {
    method: "DELETE", headers: { Authorization: "Bearer stale-owner", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });

  const ask = await remove();
  assert.equal(ask.status, 403);
  assert.equal((await ask.json()).code, "PASSWORD_CONFIRMATION_REQUIRED");
  const wrong = await remove({ password: "not-the-one-1" });
  assert.equal(wrong.status, 403);
  assert.equal((await wrong.json()).code, "PASSWORD_INCORRECT");
  assert.equal(transactions, 0); assert.equal(deletedUid, null);
  assert.deepEqual(current.state, deletionTransaction().state, "nothing is deleted without the right password");

  const confirmed = await remove({ password: "garden-pass-1" });
  assert.equal(confirmed.status, 200);
  assert.equal(deletedUid, "firebase-owner");
  assert.equal(current.state.user, false);
  assert.ok(current.state.deletionRecord.completedAt);
});
