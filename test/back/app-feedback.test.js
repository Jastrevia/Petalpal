import assert from "node:assert/strict";
import test from "node:test";
import { createFeedback, FeedbackError, listFeedback, parseFeedback, updateFeedback } from "../../lib/app-feedback.js";
import { notifyStaff, staffNotice } from "../../lib/staff-notify.js";

const NOW = new Date("2026-11-18T20:00:00Z");

function fakeDb() {
  const rows = [];
  let ids = 0;
  return {
    rows,
    appFeedback: {
      count: async ({ where }) => rows.filter(r => r.userId === where.userId && r.createdAt >= where.createdAt.gte).length,
      create: async ({ data }) => { const row = { id: `fb${String(++ids).padStart(10, "0")}`, status: "NEW", createdAt: NOW, ...data }; rows.push(row); return row; },
      findMany: async ({ where, take }) => rows.filter(r => !where.status || r.status === where.status)
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, take).map(r => ({ ...r, user: { name: "Lily", accountId: "PP12345678" } })),
      groupBy: async () => ["NEW", "READ", "DONE"].map(status => ({ status, _count: { _all: rows.filter(r => r.status === status).length } })),
      updateMany: async ({ where, data }) => {
        const row = rows.find(r => r.id === where.id);
        if (!row) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      }
    }
  };
}

test("feedback fields: the app's categories, length limits, optional reply email, nothing else", () => {
  assert.deepEqual(parseFeedback({ category: "bug", subject: " Crash ", message: " The garden froze \r\n twice ", email: "a@b.co",
    route: "/journal", clientVersion: "1.0.3", platform: "ios" }),
  { kind: "BUG", subject: "Crash", message: "The garden froze \n twice", replyEmail: "a@b.co", route: "/journal", appVersion: "1.0.3", platform: "ios" });
  assert.deepEqual(parseFeedback({ category: "ai_concern", message: "x", email: "" }),
    { kind: "AI_CONCERN", subject: null, message: "x", replyEmail: null, route: null, appVersion: null, platform: null });
  for (const body of [{ message: "x" }, { category: "spam", message: "x" }, { category: "bug", message: "  " },
    { category: "bug", message: "x".repeat(2001) }, { category: "bug", message: "x", email: "nope" },
    { category: "bug", message: "x", userId: "user_1" }, { category: "bug", message: "x", route: "https://evil" },
    { category: "bug", message: "x", platform: "tv" }, null]) {
    assert.throws(() => parseFeedback(body), FeedbackError, JSON.stringify(body));
  }
});

test("feedback is saved for the signed-in owner, 5 a day, and only its category is sent to the team channel", async () => {
  const db = fakeDb(), notices = [];
  const notify = (kind, category) => { notices.push([kind, category]); return Promise.resolve(true); };
  for (let i = 0; i < 5; i++) await createFeedback(db, "user_1", { category: "feature", message: `idea ${i} with private words` }, { now: NOW, notify });
  await assert.rejects(createFeedback(db, "user_1", { category: "feature", message: "sixth" }, { now: NOW, notify }), { status: 429 });
  await createFeedback(db, "user_2", { category: "bug", message: "other person" }, { now: NOW, notify });
  assert.equal(db.rows.length, 6);
  assert.equal(db.rows[0].userId, "user_1");
  assert.deepEqual(notices.at(-1), ["FEEDBACK", "BUG"]);
});

test("staff list and status updates", async () => {
  const db = fakeDb();
  await createFeedback(db, "user_1", { category: "bug", message: "a" }, { now: NOW, notify: async () => true });
  const page = await listFeedback(db, {});
  assert.equal(page.items.length, 1);
  assert.deepEqual(page.items[0].user, { name: "Lily", accountId: "PP12345678" });
  assert.deepEqual(page.counts, { NEW: 1, READ: 0, DONE: 0 });
  assert.equal(page.nextBefore, null);
  await assert.rejects(listFeedback(db, { status: "LOST" }), { status: 400 });
  await assert.rejects(listFeedback(db, { sort: "x" }), { status: 400 });
  const id = page.items[0].id;
  assert.deepEqual(await updateFeedback(db, id, { status: "DONE", staffNote: " fixed in 1.0.4 " }, { now: NOW }), { success: true });
  assert.equal(db.rows[0].status, "DONE");
  assert.deepEqual(db.rows[0].reviewedAt, NOW);
  assert.equal(db.rows[0].staffNote, "fixed in 1.0.4");
  await assert.rejects(updateFeedback(db, id, { status: "GONE" }), { status: 400 });
  await assert.rejects(updateFeedback(db, id, { message: "rewrite" }), { status: 400 });
  await assert.rejects(updateFeedback(db, "fb9999999999", { status: "READ" }), { status: 404 });
});

test("team-channel notices carry only the kind and category, over https", async () => {
  assert.equal(staffNotice("FEEDBACK", "BUG"), "新反馈 / New feedback · BUG — PetalPal staff page");
  assert.equal(staffNotice("REPORT", "my secret text"), "新举报 / New report — PetalPal staff page");
  assert.equal(staffNotice("UNKNOWN"), null);
  const sent = [];
  const fetchImpl = async (url, options) => { sent.push({ url: String(url), body: JSON.parse(options.body) }); return new Response(null, { status: 204 }); };
  assert.equal(await notifyStaff("REPORT", "HARASSMENT", { env: {}, fetchImpl }), false, "unset sends nothing");
  assert.equal(await notifyStaff("REPORT", "HARASSMENT", { env: { STAFF_NOTIFY_WEBHOOK_URL: "http://hooks.example/x" }, fetchImpl }), false, "https only");
  assert.equal(await notifyStaff("REPORT", "HARASSMENT", { env: { STAFF_NOTIFY_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc" }, fetchImpl }), true);
  assert.deepEqual(sent, [{ url: "https://discord.com/api/webhooks/1/abc",
    body: { content: "新举报 / New report · HARASSMENT — PetalPal staff page", text: "新举报 / New report · HARASSMENT — PetalPal staff page" } }]);
  assert.equal(await notifyStaff("FEEDBACK", "BUG", { env: { STAFF_NOTIFY_WEBHOOK_URL: "https://discord.com/api/webhooks/1/abc" },
    fetchImpl: async () => { throw new Error("down"); } }), false, "a failed notice never throws");
});
