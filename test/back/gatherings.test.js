import assert from "node:assert/strict";
import test from "node:test";
import { cancelGathering, createGathering, gardenVisitorLimit, listGatherings, respondToGathering, GATHERING_RULES } from "../../lib/gatherings.js";

const NOW = new Date("2026-11-18T20:00:00Z");
const soon = new Date(NOW.getTime() + 3_600_000).toISOString();
const HOST = "user_1", A = "user_2", B = "user_3", STRANGER = "user_9";

function fakeDb({ visits = true, friends = [A, B], blocked = [] } = {}) {
  const gatherings = [];
  let ids = 0;
  const users = { [HOST]: { id: HOST, name: "Host", avatar: "🌷" }, [A]: { id: A, name: "Ann", avatar: "🦋" }, [B]: { id: B, name: "Ben", avatar: "🐝" } };
  const view = row => ({ ...row, host: users[row.hostId], invites: row.invites.map(invite => ({ ...invite, user: users[invite.userId] })) });
  const db = {
    gatherings,
    $queryRaw: async () => [{ locked: "" }],
    user: {
      findUnique: async ({ where }) => where.id === HOST ? { allowGardenVisits: visits } : null,
      findFirst: async () => null
    },
    userBlock: { findFirst: async ({ where }) => where.OR.some(pair => blocked.includes(pair.blockerId) || blocked.includes(pair.blockedId)) ? { blockerId: "x" } : null },
    friendship: { findUnique: async ({ where }) => friends.includes(where.userId_friendId.friendId) ? { id: "f" } : null },
    gathering: {
      count: async ({ where }) => gatherings.filter(row => row.hostId === where.hostId && row.status === where.status && row.endsAt > where.endsAt.gt).length,
      create: async ({ data }) => {
        const row = { id: `g${String(++ids).padStart(10, "0")}`, ...data, invites: data.invites.create, createdAt: NOW };
        gatherings.push(row); return view(row);
      },
      findMany: async ({ where }) => gatherings.filter(row => row.endsAt > where.endsAt.gt &&
        (row.hostId === where.OR[0].hostId || row.invites.some(invite => invite.userId === where.OR[1].invites.some.userId))).map(view),
      findUnique: async ({ where }) => { const row = gatherings.find(item => item.id === where.id); return row ? view(row) : null; },
      update: async ({ where, data }) => Object.assign(gatherings.find(item => item.id === where.id), data)
    },
    gatheringInvite: {
      update: async ({ where, data }) => Object.assign(gatherings.find(item => item.id === where.gatheringId_userId.gatheringId)
        .invites.find(invite => invite.userId === where.gatheringId_userId.userId), data)
    }
  };
  db.$transaction = fn => fn(db);
  return db;
}

test("visitor limit comes from GARDEN_VISITOR_LIMIT (1-20), default 6", () => {
  assert.equal(gardenVisitorLimit({}), 6);
  assert.equal(gardenVisitorLimit({ GARDEN_VISITOR_LIMIT: "4" }), 4);
  assert.equal(gardenVisitorLimit({ GARDEN_VISITOR_LIMIT: "99" }), 6);
});

test("a host invites friends to a one-hour gathering; guests answer; the host cancels", async () => {
  const db = fakeDb(), texts = [];
  const created = await createGathering(db, HOST, { kind: "DINNER", title: "  Garden   dinner ", startsAt: soon, guestIds: [A, B, A] },
    { now: NOW, assertText: text => texts.push(text) });
  assert.equal(created.title, "Garden dinner"); assert.deepEqual(texts, ["Garden dinner"]);
  assert.equal(created.endsAt, new Date(Date.parse(soon) + GATHERING_RULES.durationMs).toISOString());
  assert.deepEqual(created.guests.map(guest => [guest.name, guest.status]), [["Ann", "INVITED"], ["Ben", "INVITED"]]);
  assert.equal(created.youAreHost, true); assert.equal(created.live, false);

  const answered = await respondToGathering(db, A, created.id, { accept: true }, { now: NOW });
  assert.equal(answered.yourInvite, "ACCEPTED");
  await assert.rejects(respondToGathering(db, STRANGER, created.id, { accept: true }, { now: NOW }), { code: "GATHERING_NOT_FOUND" });
  await assert.rejects(respondToGathering(db, A, created.id, { accept: "yes" }, { now: NOW }), { code: "GATHERING_INVALID" });

  const during = new Date(Date.parse(soon) + 60_000);
  const [listed] = await listGatherings(db, B, { now: during });
  assert.equal(listed.live, true); assert.equal(listed.yourInvite, "INVITED"); assert.equal(listed.youAreHost, false);
  assert.deepEqual(await listGatherings(db, STRANGER, { now: during }), []);

  await assert.rejects(cancelGathering(db, A, created.id, { now: NOW }), { code: "GATHERING_NOT_FOUND" }, "only the host cancels");
  assert.equal((await cancelGathering(db, HOST, created.id, { now: NOW })).status, "CANCELED");
  await assert.rejects(respondToGathering(db, B, created.id, { accept: true }, { now: NOW }), { code: "GATHERING_CLOSED" });
});

test("gathering rules: friends only, not blocked, visits on, within 30 days, guest and upcoming limits", async () => {
  const body = { kind: "PICNIC", startsAt: soon, guestIds: [A] };
  await assert.rejects(createGathering(fakeDb(), HOST, { ...body, guestIds: [STRANGER] }, { now: NOW }), { code: "NOT_FRIENDS" });
  await assert.rejects(createGathering(fakeDb({ blocked: [A] }), HOST, body, { now: NOW }), { code: "NOT_FRIENDS" });
  await assert.rejects(createGathering(fakeDb({ visits: false }), HOST, body, { now: NOW }), { code: "VISITS_OFF" });
  await assert.rejects(createGathering(fakeDb(), HOST, { ...body, startsAt: new Date(NOW.getTime() + 31 * 86_400_000).toISOString() }, { now: NOW }), { code: "GATHERING_INVALID" });
  await assert.rejects(createGathering(fakeDb(), HOST, { ...body, kind: "RAVE" }, { now: NOW }), { code: "GATHERING_INVALID" });
  await assert.rejects(createGathering(fakeDb(), HOST, { ...body, guestIds: [HOST] }, { now: NOW }), { code: "GATHERING_INVALID" });
  await assert.rejects(createGathering(fakeDb(), HOST, { ...body, guestIds: ["a", "b", "c"] }, { now: NOW, env: { GARDEN_VISITOR_LIMIT: "2" } }), { code: "GATHERING_INVALID" });
  await assert.rejects(createGathering(fakeDb(), HOST, { ...body, hostId: STRANGER }, { now: NOW }), { code: "GATHERING_INVALID" });
  const db = fakeDb();
  for (let i = 0; i < GATHERING_RULES.maxUpcoming; i++) await createGathering(db, HOST, body, { now: NOW });
  await assert.rejects(createGathering(db, HOST, body, { now: NOW }), { code: "GATHERING_LIMIT" });
});
