import assert from 'node:assert/strict';
import test from 'node:test';
import prisma from '../../lib/prisma.js';
import { setFirebaseTokenVerifierForTests } from '../../lib/auth.js';
import { app } from '../../server.js';

// PATCH /users/:userId/flowers/:flowerId/placement persists a planted cluster's Garden position
// on the existing Flower columns (no migration); only the owner may write it.
test('flower placement is owner-only, allowlisted, validated and survives a Garden reload', async t => {
  const restore = [];
  const stub = (obj, key, fn) => { const old = obj[key]; restore.push(() => obj[key] = old); obj[key] = fn; };
  const flowers = new Map([
    ['mine', { id: 'mine', userId: 'owner', name: 'Poppy', speciesCode: 'POPPY', createdAt: '2026-08-12', left: 312.5, top: 588.1, regionId: null, scale: 1, rotation: 0, layoutVersion: 1 }],
    ['theirs', { id: 'theirs', userId: 'friend', name: 'Rose', speciesCode: 'ROSE', createdAt: '2026-08-12', left: 1, top: 2, regionId: null, scale: 1, rotation: 0, layoutVersion: 1 }],
  ]);
  const updates = [];
  setFirebaseTokenVerifierForTests(async () => ({ uid: 'firebase-owner', email_verified: true }));
  stub(prisma.user, 'findUnique', async () => ({ id: 'owner', name: 'Owner', timezone: 'UTC' }));
  stub(prisma.flower, 'updateMany', async ({ where, data }) => {
    updates.push({ where, data });
    const flower = flowers.get(where.id);
    if (!flower || flower.userId !== where.userId) return { count: 0 };
    Object.assign(flower, data); return { count: 1 };
  });
  stub(prisma.flower, 'findMany', async ({ where }) => [...flowers.values()].filter(f => f.userId === where.userId));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { restore.reverse().forEach(fn => fn()); setFirebaseTokenVerifierForTests(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const patch = (path, body, auth = true) => fetch(base + path, { method: 'PATCH', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test' } : {}) } });
  const good = { worldX: 1990, worldY: 1370, landId: 'Land08', scale: 1, rotation: 0 };

  assert.equal((await patch('/users/owner/flowers/mine/placement', good, false)).status, 401);
  assert.equal((await patch('/users/friend/flowers/theirs/placement', good)).status, 403, 'another owner path is refused');
  for (const body of [{ ...good, userId: 'friend' }, { ...good, layoutVersion: 2 }, { ...good, left: 1 }])
    assert.equal((await patch('/users/owner/flowers/mine/placement', body)).status, 400, `unexpected field ${Object.keys(body).pop()}`);
  for (const bad of [{ worldX: -1 }, { worldX: 2400 }, { worldY: 1800 }, { worldX: '10' }, { landId: 'Land13' }, { landId: 'Land02_03' },
    { landId: 'land08' }, { scale: 0 }, { scale: 9 }, { rotation: 400 }])
    assert.equal((await patch('/users/owner/flowers/mine/placement', { ...good, ...bad })).status, 400, JSON.stringify(bad));
  assert.equal(updates.length, 0, 'nothing is written for rejected requests');

  assert.equal((await patch('/users/owner/flowers/theirs/placement', good)).status, 404, "another user's Flower id is not found");
  assert.deepEqual(updates.pop().where, { id: 'theirs', userId: 'owner' }, 'the update is scoped to the authenticated owner');
  assert.equal(flowers.get('theirs').left, 1);

  const saved = await patch('/users/owner/flowers/mine/placement', good);
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { id: 'mine', ...good });
  assert.deepEqual(updates.pop(), { where: { id: 'mine', userId: 'owner' },
    data: { left: 1990, top: 1370, regionId: 'Land08', scale: 1, rotation: 0, layoutVersion: 2 } });

  // Reload / sign-in: the owner's Garden metadata carries the saved position for hydration.
  const reload = await fetch(`${base}/users/owner/garden?view=metadata`, { headers: { Authorization: 'Bearer test' } });
  assert.equal(reload.status, 200);
  const { flowers: listed } = await reload.json();
  const mine = listed.find(f => f.id === 'mine');
  assert.deepEqual([mine.left, mine.top, mine.regionId, mine.scale, mine.rotation, mine.layoutVersion], [1990, 1370, 'Land08', 1, 0, 2]);
  assert.equal(listed.length, 1, 'no duplicate or foreign Flower records');
});
