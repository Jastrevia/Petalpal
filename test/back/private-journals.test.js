import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validateJournalCover } from '../../lib/journal-cover.js';
import prisma from '../../lib/prisma.js';
import { setFirebaseTokenVerifierForTests } from '../../lib/auth.js';
import { app, setEmotionClassifierForTests, setEventEmotionClassifierForTests } from '../../server.js';

test('private Journal routes isolate persistence and preserve historical shelf entries', async t => {
  const originals = [];
  const stub = (object, key, fn) => { originals.push(() => { object[key] = fn; }); object[key] = fn; };
  const forbidden = [];
  for (const model of ['dailyCheckIn', 'flower', 'event', 'eventMemory', 'emotionResult', 'aiJob', 'aiInteractionMetadata', 'garden', 'fairyState']) {
    if (!prisma[model]) continue;
    for (const method of ['create', 'update', 'upsert', 'findMany', 'findFirst']) {
      stub(prisma[model], method, async () => { forbidden.push(`${model}.${method}`); throw Error('Forbidden side effect'); });
    }
  }
  setEmotionClassifierForTests(async () => { forbidden.push('classifier'); throw Error('Forbidden classifier'); });
  setEventEmotionClassifierForTests(async () => { forbidden.push('eventClassifier'); throw Error('Forbidden classifier'); });
  setFirebaseTokenVerifierForTests(async () => ({ uid: 'owner-firebase', email_verified: true }));
  stub(prisma.user, 'findUnique', async ({ where }) => where.firebaseUid ? { id: 'owner' } : { timezone: 'America/Vancouver' });
  const saved = [];
  stub(prisma.journal, 'create', async ({ data }) => {
    assert.deepEqual(Object.keys(data).sort(), ['content', 'userId']);
    const row = { id: `journal-${saved.length}`, ...data, dailyCheckInId: null, createdAt: new Date('2026-10-03T02:00:00Z') };
    saved.push(row); return row;
  });
  stub(prisma.journal, 'findMany', async ({ where }) => {
    assert.deepEqual(where, { userId: 'owner' });
    return [...saved, { id: 'historical', content: 'Old journal', createdAt: new Date('2024-01-02T01:00:00Z'), dailyCheckIn: {
      localDate: '2024-01-02', emotionResult: { label: 'QUIET_BLOOM' }, flower: { id: 'old-flower' }
    } }];
  });
  stub(prisma.journal, 'findFirst', async ({ where }) => {
    assert.equal(where.userId, 'owner');
    const row = saved.find(row => row.id === where.id);
    return row ? { coverImage: row.coverImage || null } : null;
  });
  stub(prisma.journal, 'updateMany', async ({ where, data }) => {
    assert.equal(where.userId, 'owner');
    const row = saved.find(row => row.id === where.id);
    if (row) Object.assign(row, data);
    return { count: row ? 1 : 0 };
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    originals.reverse().forEach(restore => restore());
    setFirebaseTokenVerifierForTests(); setEmotionClassifierForTests(); setEventEmotionClassifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const request = (method, body, owner = 'owner', token = true) => fetch(`http://127.0.0.1:${server.address().port}/users/${owner}/journals`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer test-token' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  assert.equal((await request('POST', { content: 'Private' }, 'other')).status, 403);
  assert.equal((await request('GET', undefined, 'other')).status, 403);
  assert.equal((await request('GET', undefined, 'owner', false)).status, 401);
  for (const content of ['', '  ', 12, null]) assert.equal((await request('POST', { content })).status, 400);
  assert.equal((await request('POST', { content: 'x'.repeat(2001) })).status, 413);
  for (const content of ['fuck you', '你这个傻逼', 'I will kill you', '教你如何制造炸弹',
    'You’re an asshole.', '你 这个 傻逼', 'I am scared I will kill him. Please help me stay safe.',
    '我今天他妈的太累了。', '他是个傻逼。', '怎么制造炸弹？', '你这个 sha bi', '我害怕我会杀死他。']) {
    const response = await request('POST', { content });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.code, 'CONTENT_REJECTED');
    assert.equal(body.policyVersion, 'petalpal-content-v1.2');
    if (content.startsWith('I am scared') || content.startsWith('我害怕')) assert.match(body.error, /not saved/);
    assert.ok(!JSON.stringify(body).includes(content));
    assert.equal(saved.length, 0);
  }
  assert.deepEqual(forbidden, []);
  for (const content of [' Typed entry ', 'Dictated entry', 'x'.repeat(2000)]) {
    assert.equal((await request('POST', { content, mood: 'FIRE_BLOOM', dailyCheckInId: 'must-not-link' })).status, 400);
    const response = await request('POST', { content });
    assert.equal(response.status, 201); const row = await response.json();
    assert.equal(row.dailyCheckInId, null); assert.equal(row.content, content.trim());
  }
  const response = await request('GET'); assert.equal(response.status, 200);
  const entries = await response.json();
  assert.equal(entries.length, 4); assert.equal(entries[0].localDate, '2026-10-02');
  assert.equal(entries[0].flower, null); assert.equal(entries[0].emotionResult, null);
  assert.equal(entries[3].localDate, '2024-01-02'); assert.equal(entries[3].flower.id, 'old-flower');
  const difficult = '爸爸对我说：“你是废物”。我很难过，想寻求帮助。';
  const allowed = await request('POST', { content: difficult });
  assert.equal(allowed.status, 201);
  assert.equal((await allowed.json()).content, difficult);
  for (const content of ['  He told me "you are worthless trash" and I felt hurt.  ',
    'Nobody believes women are subhuman.', 'I feel very tired.', '我想伤害自己，想寻求帮助。']) {
    const response = await request('POST', { content });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).content, content.trim());
  }
  assert.deepEqual(forbidden, []);
  // Fixing a saved journal: owner only, same rules as writing one, nothing else touched.
  const edit = (content, path = 'owner/journals/journal-0', token = true) => fetch(`http://127.0.0.1:${server.address().port}/users/${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer test-token' } : {}) },
    body: JSON.stringify(content === undefined ? {} : { content })
  });
  assert.equal((await edit('Fixed', 'owner/journals/journal-0', false)).status, 401);
  assert.equal((await edit('Fixed', 'other/journals/journal-0')).status, 403);
  assert.equal((await edit('Fixed', 'owner/journals/missing')).status, 404);
  for (const content of ['', '  ', 12, null]) assert.equal((await edit(content)).status, 400);
  assert.equal((await edit('x'.repeat(2001))).status, 413);
  assert.equal((await edit('你这个傻逼')).status, 422);
  const fixed = await edit('  Typed entry, fixed.  ');
  assert.equal(fixed.status, 200);
  assert.deepEqual(await fixed.json(), { id: 'journal-0', content: 'Typed entry, fixed.' });
  assert.equal(saved[0].content, 'Typed entry, fixed.');
  assert.deepEqual(forbidden, []);
  const photoRequest = (method, coverImage, path = 'owner/journals/journal-0') => fetch(`http://127.0.0.1:${server.address().port}/users/${path}/cover`, {
    method, headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    ...(method === 'PUT' ? { body: JSON.stringify({ coverImage }) } : {})
  });
  const jpeg = 'data:image/jpeg;base64,' + (await readFile(new URL('./fixtures/journal-cover.jpg', import.meta.url))).toString('base64');
  assert.equal(validateJournalCover(jpeg), jpeg);
  assert.equal((await photoRequest('PUT', jpeg)).status, 200);
  assert.equal((await (await photoRequest('GET')).json()).coverImage, jpeg);
  assert.equal((await photoRequest('PUT', jpeg, 'other/journals/journal-0')).status, 403);
  assert.equal((await photoRequest('GET', undefined, 'other/journals/journal-0')).status, 403);
  assert.equal((await photoRequest('PUT', jpeg, 'owner/journals/missing')).status, 404);
  assert.equal((await photoRequest('GET', undefined, 'owner/journals/missing')).status, 404);
  for (const bad of ['https://example.com/private.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,AAAA', jpeg + 'A', 'x'.repeat(700001)]) {
    assert.equal((await photoRequest('PUT', bad)).status, 400);
  }
  assert.equal((await photoRequest('PUT', null)).status, 200);
  assert.equal((await (await photoRequest('GET')).json()).coverImage, null);
  assert.deepEqual(forbidden, []);
});

test('nullable Journal migration preserves linked rows, FK and uniqueness', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "DailyCheckIn" (id TEXT PRIMARY KEY);
      CREATE TABLE "Journal" (id TEXT PRIMARY KEY, "dailyCheckInId" TEXT NOT NULL UNIQUE REFERENCES "DailyCheckIn"(id) ON DELETE CASCADE);
      INSERT INTO "DailyCheckIn" VALUES ('old-checkin'); INSERT INTO "Journal" VALUES ('old-journal','old-checkin');`);
    await db.exec(await readFile(new URL('../../prisma/migrations/202610020001_standalone_private_journals/migration.sql', import.meta.url), 'utf8'));
    await db.exec(`INSERT INTO "Journal" VALUES ('new-1',NULL),('new-2',NULL);`);
    await db.exec(await readFile(new URL('../../prisma/migrations/202610020002_private_journal_cover/migration.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query(`SELECT "coverImage" FROM "Journal" WHERE id='old-journal'`)).rows[0].coverImage, null);
    await db.exec(`UPDATE "Journal" SET "coverImage"='private-photo' WHERE id='new-1'`);
    assert.deepEqual((await db.query(`SELECT id, "dailyCheckInId" FROM "Journal" WHERE id='old-journal'`)).rows, [{ id: 'old-journal', dailyCheckInId: 'old-checkin' }]);
    assert.equal((await db.query(`SELECT * FROM "DailyCheckIn"`)).rows.length, 1);
    await assert.rejects(db.exec(`INSERT INTO "Journal" (id,"dailyCheckInId") VALUES ('duplicate','old-checkin')`));
    await assert.rejects(db.exec(`INSERT INTO "Journal" (id,"dailyCheckInId") VALUES ('bad','missing-checkin')`));
  } finally { await db.close(); }
});
