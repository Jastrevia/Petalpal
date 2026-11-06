import assert from 'node:assert/strict';
import test from 'node:test';
import prisma from '../../lib/prisma.js';
import { setFirebaseTokenVerifierForTests } from '../../lib/auth.js';
import { app } from '../../server.js';

test('session endpoints reject unauthenticated known/unknown probes before profile lookup', async (t) => {
  const original = prisma.user.findUnique;
  let lookups = 0;
  prisma.user.findUnique = async () => { lookups++; throw new Error('Unexpected profile lookup'); };
  setFirebaseTokenVerifierForTests(async () => { throw Object.assign(new Error('private provider diagnostic'), { code: 'auth/user-not-found' }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    prisma.user.findUnique = original;
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/auth/session', '/session?view=metadata']) {
    for (const invalid of [false, true]) {
      const responses = [];
      for (const email of ['known@example.test', 'unknown@example.test']) {
        const post = path === '/auth/session';
        const response = await fetch(base + path + (post ? '' : '&email=' + email), {
          method: post ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', ...(invalid ? { Authorization: 'Bearer invalid-synthetic-token' } : {}) },
          ...(post ? { body: JSON.stringify({ email, deferProfileCreation: true }) } : {})
        });
        responses.push({ status: response.status, body: await response.json() });
      }
      assert.deepEqual(responses[0], responses[1]);
      assert.deepEqual(responses[0], { status: 401, body: { error: invalid ? 'Invalid or expired Firebase token' : 'Authentication required' } });
    }
  }
  assert.equal(lookups, 0);
});

test('session setup preserves own profile recovery and legacy linking; an unverified address never looks up an account', async (t) => {
  const originalFind = prisma.user.findUnique, originalUpdate = prisma.user.update, originalDeletion = prisma.accountDeletion.findUnique;
  prisma.accountDeletion.findUnique = async () => null;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    prisma.user.findUnique = originalFind; prisma.user.update = originalUpdate; prisma.accountDeletion.findUnique = originalDeletion;
    setFirebaseTokenVerifierForTests();
    await new Promise(resolve => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = { id: 'own-profile', email: 'owner@example.test', firebaseUid: 'owner-firebase', name: 'Owner' };
  for (const mode of ['unverified', 'existing', 'new', 'legacy']) {
    setFirebaseTokenVerifierForTests(async () => ({ uid: 'owner-firebase', email: profile.email, email_verified: mode !== 'unverified' }));
    let lookups = 0, updates = 0;
    prisma.user.findUnique = async ({ where }) => {
      lookups++;
      if (where.firebaseUid) {
        assert.equal(where.firebaseUid, 'owner-firebase');
        return mode === 'existing' ? profile : null;
      }
      assert.equal(where.email, profile.email);
      return mode === 'legacy' ? { ...profile, firebaseUid: null } : null;
    };
    prisma.user.update = async ({ where, data }) => {
      updates++; assert.equal(where.id, profile.id); assert.equal(data.firebaseUid, 'owner-firebase');
      return profile;
    };
    const response = await fetch(base + '/auth/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer verified-synthetic-token' },
      body: JSON.stringify({ email: 'other@example.test', firebaseUid: 'other-firebase', deferProfileCreation: true })
    });
    const body = await response.json();
    if (mode === 'unverified') {
      assert.equal(response.status, 200); assert.equal(body.needsProfile, true); assert.equal(body.email, null);
      assert.equal(lookups, 1, 'by uid only, never by the unverified address');
    } else {
      assert.equal(response.status, 200);
      if (mode === 'new') { assert.equal(body.needsProfile, true); assert.equal(body.email, profile.email); }
      else { assert.equal(body.user.id, profile.id); assert.equal(body.user.email, profile.email); }
    }
    assert.equal(updates, mode === 'legacy' ? 1 : 0);
  }
});
