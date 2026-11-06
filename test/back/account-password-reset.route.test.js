import assert from "node:assert/strict";
import test from "node:test";

import prisma from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/accounts.js";
import { setFirebaseTokenVerifierForTests } from "../../lib/auth.js";
import { app } from "../../server.js";

// A forgotten password is set again only through the account's email: a reset link, then a
// sign-in with that email just now. The email must be verified: an unverified address could be anyone's.
test("a forgotten password is reset only by a fresh sign-in with a verified email", async t => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const now = Math.floor(Date.now() / 1000);
  let hash = await hashPassword("before123");
  const originals = { user: prisma.user.findUnique, find: prisma.accountPassword.findUnique, upsert: prisma.accountPassword.upsert };
  prisma.user.findUnique = async () => ({ id: "u1" });
  prisma.accountPassword.findUnique = async () => ({ hash });
  prisma.accountPassword.upsert = async ({ update }) => { hash = update.hash; };
  t.after(() => {
    prisma.user.findUnique = originals.user; prisma.accountPassword.findUnique = originals.find; prisma.accountPassword.upsert = originals.upsert;
    setFirebaseTokenVerifierForTests();
  });
  const reset = () => fetch(`${url}/auth/password`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    body: JSON.stringify({ password: "after123" }) });
  const signedIn = claims => setFirebaseTokenVerifierForTests(async () => ({ uid: "fb1", email: "a@b.co", ...claims }));

  signedIn({ firebase: { sign_in_provider: "password" }, email_verified: false, auth_time: now });
  assert.equal((await reset()).status, 403, "an unverified email");
  signedIn({ firebase: { sign_in_provider: "password" }, email_verified: true, auth_time: now - 3600 });
  assert.equal((await reset()).status, 403, "a sign-in an hour ago");
  signedIn({ firebase: { sign_in_provider: "custom" }, email_verified: true, auth_time: now });
  assert.equal((await reset()).status, 403, "a name-and-password sign-in needs the current password");
  assert.equal(await verifyPassword("before123", hash), true);
  signedIn({ firebase: { sign_in_provider: "password" }, email_verified: true, auth_time: now });
  assert.equal((await reset()).status, 200);
  assert.equal(await verifyPassword("after123", hash), true);
});

// An email connected but never verified could be anyone's (and Firebase mails a reset link to any address
// on file), so signing in with it opens nothing; the account name or PP number (a custom token) still does.
test("an email-and-password sign-in with an unverified address opens no account", async t => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({ id: "u1", name: "Bloom_22", accountId: "PP12345678", email: null, emailVerifiedAt: null });
  t.after(() => { prisma.user.findUnique = original; setFirebaseTokenVerifierForTests(); });
  const recovery = () => fetch(`${url}/auth/recovery`, { headers: { Authorization: "Bearer t" } });
  setFirebaseTokenVerifierForTests(async () => ({ uid: "fb1", email: "a@b.co", email_verified: false, firebase: { sign_in_provider: "password" } }));
  const refused = await recovery();
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).code, "EMAIL_UNVERIFIED");
  setFirebaseTokenVerifierForTests(async () => ({ uid: "fb1", email: "a@b.co", email_verified: true, firebase: { sign_in_provider: "password" } }));
  assert.notEqual((await recovery()).status, 403, "a verified email signs in");
  setFirebaseTokenVerifierForTests(async () => ({ uid: "fb1", firebase: { sign_in_provider: "custom" } }));
  assert.notEqual((await recovery()).status, 403, "the account name or PP number signs in");
});
