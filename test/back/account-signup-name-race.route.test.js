// Its own file (its own process, so its own rate-limit budget): account-signup.route.test.js uses all of its.
import assert from "node:assert/strict";
import test from "node:test";

import prisma from "../../lib/prisma.js";
import { setFirebaseSignInTokenIssuerForTests } from "../../lib/auth.js";
import { app } from "../../server.js";
import { COMMUNITY_VERSION } from "../../lib/community-policy.js";

test("a name taken between the lookup and the create is refused by the unique index the same way", async t => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const originals = { create: prisma.user.create, raw: prisma.$queryRawUnsafe };
  t.after(() => { prisma.user.create = originals.create; prisma.$queryRawUnsafe = originals.raw; setFirebaseSignInTokenIssuerForTests(); });

  let lookups = 0;
  prisma.$queryRawUnsafe = async () => (++lookups === 1 ? [] : [{ id: "someone" }]);
  prisma.user.create = async () => { throw Object.assign(new Error("duplicate"), { code: "P2002" }); };
  setFirebaseSignInTokenIssuerForTests(async () => assert.fail("no sign-in for a refused name"));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Bloom_1", password: "garden123", avatar: "fairy-2", timezone: "UTC", preferredLocale: "en", communityTermsVersion: COMMUNITY_VERSION })
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "USERNAME_TAKEN");
  assert.equal(lookups, 2, "free while the password hashed, taken at the create");
});
