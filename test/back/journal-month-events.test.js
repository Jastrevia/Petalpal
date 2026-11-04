import assert from 'node:assert/strict';
import test from 'node:test';
import prisma from '../../lib/prisma.js';
import { setFirebaseTokenVerifierForTests } from '../../lib/auth.js';
import { app } from '../../server.js';

test('Treehouse month Events are owner-only, read-only, filtered by stored local date and never written', async t => {
  const originals = [];
  const stub = (object, key, fn) => { originals.push([object, key, object[key]]); object[key] = fn; };
  // A locally generated client can predate the Event model; the route only needs findMany.
  const addedEvent = !prisma.event;
  if (addedEvent) prisma.event = {};
  const writes = [];
  for (const model of ['event', 'flower', 'journal', 'dailyCheckIn', 'eventMemory', 'emotionResult']) {
    for (const method of ['create', 'update', 'upsert', 'delete', 'deleteMany', 'updateMany', 'createMany']) {
      if (prisma[model]?.[method]) stub(prisma[model], method, async () => { writes.push(`${model}.${method}`); throw Error('Forbidden write'); });
    }
  }
  setFirebaseTokenVerifierForTests(async token => ({ uid: token === 'other-token' ? 'other-firebase' : 'owner-firebase', email_verified: true }));
  stub(prisma.user, 'findUnique', async ({ where }) => where.firebaseUid === 'other-firebase' ? { id: 'other' } : { id: 'owner' });
  const queries = [];
  stub(prisma.event, 'findMany', async query => {
    queries.push(query);
    return [{ id: 'e1', content: 'Planted a new marigold in the garden.', localDate: '2026-10-23', occurredAt: new Date('2026-10-24T03:30:00Z'),
      primaryGardenMood: 'SUNNY_BLOOM', secondaryEmotions: ['calm'], emotionStatus: 'SUCCEEDED', emotionOutcome: 'CLASSIFIED', flower: null }];
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    originals.reverse().forEach(([object, key, fn]) => { object[key] = fn; });
    if (addedEvent) delete prisma.event;
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const get = (path, token = 'owner-token') => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  assert.equal((await get('/users/owner/events?month=2026-10', null)).status, 401);
  assert.equal((await get('/users/owner/events?month=2026-10', 'other-token')).status, 403);
  for (const bad of ['', '?month=2026-13', '?month=2026-1', '?month=2026-10-01', '?month=2026-10&ownerId=other']) {
    assert.equal((await get(`/users/owner/events${bad}`)).status, 400, bad);
  }
  assert.equal(queries.length, 0, 'rejected requests never query');

  const response = await get('/users/owner/events?month=2026-10');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].localDate, '2026-10-23', 'the stored local date, not the UTC timestamp, decides the day');
  // The query is scoped to the authenticated owner and the month's local dates, and selects no owner identifiers.
  assert.deepEqual(queries[0].where, { ownerId: 'owner', localDate: { gte: '2026-10-01', lte: '2026-10-31' } });
  assert.equal(queries[0].select.ownerId, undefined);
  assert.equal(queries[0].take, 500);
  assert.deepEqual(writes, []);
});
