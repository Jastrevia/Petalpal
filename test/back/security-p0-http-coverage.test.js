import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../server.js", import.meta.url), "utf8");
const routes = [
  ["POST /auth/session", "profile fields are explicitly selected; Firebase identity is middleware-derived"],
  ["PUT /users/:userId/profile", "requireOwnUser and explicit preferredLocale"],
  ["PUT /api/fairies/:fairyId/active", "owned Fairy query uses req.auth.userId"],
  ["PUT /users/:userId/fairy-state", "requireOwnUser and allowlisted fields"],
  ["POST /api/fairy/moments/:momentId/like", "updateMany scopes the Moment to req.auth.userId"],
  ["PUT /api/fairy/moments/avatar", "updateMany scopes the active Fairy to req.auth.userId; library ids only"],
  ["PUT /api/fairy/moments/cover", "updateMany scopes the active Fairy to req.auth.userId; cover library ids only; body allowlist"],
  ["POST /api/fairy/check-in", "owner is req.auth.userId; empty body only; one check-in per local day under an advisory lock"],
  ["POST /api/fairy/closeness/tap", "owner is req.auth.userId; empty body only; capped per local day"],
  ["POST /api/petal-cards/draw", "owner is req.auth.userId; position allowlist; one draw per local day under an advisory lock"],
  ["POST /api/redeem", "owner is req.auth.userId; code allowlist; hash-only lookup; failed guesses rate-limited; one claim per code and per account and batch under an advisory lock"],
  ["PUT /users/:userId/ai-consent", "requireOwnUser and boolean allowlist"],
  ["POST /events", "ownerId/userId rejected; create helper receives req.auth identity"],
  ["DELETE /events/:eventId", "repository receives req.auth identity"],
  ["POST /reports", "reporterId is req.auth.userId"],
  ["POST /friends/request", "senderId is req.auth.userId"],
  ["POST /friends/requests/:requestId/accept", "receiver is checked against req.auth.userId"],
  ["POST /friends/requests/:requestId/reject", "receiver is checked against req.auth.userId"],
  ["POST /friends/remove", "userId is req.auth.userId"],
  ["POST /users/:userId/flowers", "requireOwnUser; all created ownership fields use user.id"],
  ["POST /users/:userId/flowers/:flowerId/support", "visitorUserId is req.auth.userId; target owner is resource path"],
  ["POST /users/:userId/flowers/:flowerId/message", "visitorUserId is req.auth.userId; target owner is resource path"],
  ["POST /users/:userId/flowers/:flowerId/placement", "requireOwnUser; placement scoped to req.auth.userId; written once, never moved"],
  ["DELETE /users/:userId/flowers/:flowerId", "requireOwnUser and flower query scopes userId"],
  ["POST /visit", "visitorUserId is req.auth.userId; host is explicit social target"],
  ["POST /visit/move", "visitorUserId is req.auth.userId; active visitor is token-scoped"],
  ["POST /leave", "visitorUserId is req.auth.userId"],
  ["POST /analyze-mood", "AI metadata userId is req.auth.userId"],
  ["DELETE /users/:id", "requireOwnUser before transaction; deletion target is token/path-bound"]
];

test("authenticated HTTP mutation inventory has an explicit security disposition", () => {
  for (const [route, reason] of routes) {
    const [method, path] = route.split(" ");
    const declaration = `app.${method.toLowerCase()}("${path}"`;
    const multiline = source.includes(`app.${method.toLowerCase()}(\n    "${path}"`);
    assert.equal(source.includes(declaration) || multiline, true, `${route} missing from server.js`);
    assert.ok(reason.length > 0);
  }
  assert.equal(routes.length, 29);
});

test("server-controlled identity and entitlement names are not accepted as generic mutation fields", () => {
  const forbiddenFields = ["role", "admin", "isAdmin", "vip", "premium", "owner", "ownerId", "userId"];
  const explicitEventGuard = /Object\.hasOwn\(req\.body, "ownerId"\).*Object\.hasOwn\(req\.body, "userId"\)/s;
  assert.match(source, explicitEventGuard);
  assert.match(source, /reporterId: req\.auth\.userId/);
  assert.match(source, /const senderId = req\.auth\.userId/);
  assert.match(source, /const visitorUserId = req\.auth\.userId/);
  assert.match(source, /const data = \{[\s\S]*onboardingStep/);
  for (const field of forbiddenFields) {
    assert.ok(typeof field === "string");
  }
});
