import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

// Fail before importing dotenv/backend unless the credential-free runner is used.
assert.equal(process.env.PETALPAL_DAST_ISOLATED, '1', 'Use npm run test:dast');
assert.equal(process.env.DOTENV_CONFIG_PATH, '/dev/null');
assert.equal(process.env.DEV_DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:1/petalpal_test');

const socialOnly = process.env.PETALPAL_DAST_SCOPE === 'social';
let port, requests = 0, blockedNetwork = 0;
const connect = net.Socket.prototype.connect;
const realFetch = globalThis.fetch;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (!options || typeof options !== 'object' || options.host !== '127.0.0.1' || Number(options.port) !== port) {
    blockedNetwork++; throw new Error('DAST blocked non-fixture socket');
  }
  return connect.apply(this, args);
};
syncBuiltinESMExports();
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || Number(url.port) !== port) {
    blockedNetwork++; throw new Error('DAST blocked non-fixture fetch');
  }
  return realFetch(input, options);
};

const { default: prisma } = await import('../../lib/prisma.js');
const { setFirebaseTokenVerifierForTests } = await import('../../lib/auth.js');
const { app } = await import('../../server.js');
const unexpectedDb = [], mutations = [], reads = [], originals = [];
function replace(object, key, value) {
  originals.push(() => { object[key] = value; }); object[key] = value;
}
const failDb = name => async () => { unexpectedDb.push(name); throw new Error('Unexpected fixture database operation'); };
for (const [name, delegate] of Object.entries(prisma)) {
  if (!delegate || typeof delegate.findMany !== 'function') continue;
  for (const method of ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany']) {
    if (typeof delegate[method] === 'function') replace(delegate, method, failDb(name + '.' + method));
  }
}
for (const method of ['$transaction', '$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe', '$connect']) replace(prisma, method, failDb(method));
replace(prisma.accountDeletion, 'findUnique', async () => null);
replace(prisma.user, 'findUnique', async ({ where }) => ({ id: where.firebaseUid ?? where.id, name: 'Fixture', email: 'fixture@example.test' }));
const records = [{ id: 'owner-event', ownerId: 'owner', content: 'owner-private' }, { id: 'other-event', ownerId: 'other', content: 'other-private-canary' }];
const findPrivate = async ({ where }) => {
  reads.push(where); return records.find(row => Object.entries(where).every(([key, value]) => value === undefined || row[key] === value)) ?? null;
};
for (const name of ['event', 'eventMemory', 'weeklyReport', 'monthlyReport', 'yearlyReport']) replace(prisma[name], 'findFirst', findPrivate);
replace(prisma, '$transaction', async callback => { assert.equal(typeof callback, 'function'); return callback(prisma); });
replace(prisma, '$queryRawUnsafe', async (query, ownerId) => {
  assert.match(query, /^\s*SELECT/); assert.equal(typeof ownerId, 'string');
  return query.includes('"AiConsent"') ? [{ userId: ownerId, aiProcessing: ownerId !== 'revoked', personalization: true, memoryEnabled: true }] : [];
});
replace(prisma.user, 'update', async ({ where, data }) => { mutations.push({ where, data }); return { id: where.id, ...data }; });
replace(prisma.journal, 'create', async ({ data }) => { mutations.push({ data }); return { id: 'fixture-journal', ...data }; });
let verifications = 0;
setFirebaseTokenVerifierForTests(async token => {
  verifications++;
  if (token === 'invalid') throw Object.assign(new Error('Synthetic verification failure'), { code: 'auth/invalid-id-token' });
  // 'unverified' signed in with an email and password whose address was never verified: refused.
  // (A name or PP sign-in has no verified email and is let in; that is covered by the account route tests.)
  return { uid: token, email: 'fixture@example.test', email_verified: token !== 'unverified', auth_time: 1,
    ...(token === 'unverified' ? { firebase: { sign_in_provider: 'password' } } : {}) };
});

async function send(path, { method = 'GET', token = 'owner', body, raw, ip, expected, contentType = 'application/json', headers = {} } = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  assert.ok(++requests <= 512, 'finite request budget');
  const encoded = raw ?? (body === undefined ? undefined : JSON.stringify(body));
  assert.ok(encoded === undefined || Buffer.byteLength(encoded) <= 65536, 'finite payload budget');
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(3000),
    headers: { 'X-Forwarded-For': ip ?? `192.0.${2 + Math.floor((requests - 1) / 254)}.${(requests - 1) % 254 + 1}`, ...(token === null ? {} : { Authorization: 'Bearer ' + token }), ...(encoded === undefined || contentType === null ? {} : { 'Content-Type': contentType }), ...headers },
    ...(encoded === undefined ? {} : { body: Buffer.from(encoded) }),
  });
  const text = await response.text();
  assert.doesNotMatch(text, /social-private-canary|other-private-canary|Synthetic verification failure|Unexpected fixture|\bat .*server\.js|private_key|postgresql:\/\//);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  if (expected !== undefined) assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  assert.ok(response.status < 500, `${path}: unhandled/server error ${response.status}`);
  return { status: response.status, body: JSON.parse(text), response };
}


async function rawSend(headers, body = '{}') {
  assert.ok(++requests <= 512);
  const wire = `PATCH /users/me/garden-privacy HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer headers\r\nConnection: close\r\n${headers}\r\n\r\n${body}`;
  assert.ok(Buffer.byteLength(wire) <= 65536);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }); let text = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('Raw fixture deadline')));
    socket.on('connect', () => socket.write(wire));
    socket.on('data', chunk => { text += chunk; }); socket.on('error', reject);
    socket.on('end', () => {
      try { assert.doesNotMatch(text, /social-private-canary/); resolve(Number(text.match(/^HTTP\/1\.1 (\d+)/)?.[1])); } catch (error) { reject(error); }
    });
  });
}

// Real Express middleware/router/parsers; only identity and persistence are mocks.
test('bounded isolated API DAST corpus', { timeout: 25000 }, async t => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); port = server.address().port;
  t.after(async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    setFirebaseTokenVerifierForTests(); originals.reverse().forEach(restore => restore());
    net.Socket.prototype.connect = connect; globalThis.fetch = realFetch; syncBuiltinESMExports();
    assert.equal(blockedNetwork, 0); assert.deepEqual(unexpectedDb, []);
    assert.deepEqual(mutations, socialOnly ? [] : [{ where: { id: 'owner' }, data: { preferredLocale: 'en' } }, { data: { userId: 'owner', content: 'constructor prototype __proto__ are text' } }]);
    console.log(`DAST corpus: ${requests} loopback requests; zero external attempts/unexpected DB calls`);
  });
  if (!socialOnly) {
  await t.test('anonymous and invalid credentials cannot reach private/dotted resources or service jobs', async () => {
    const paths = ['/session', '/users/other/journals', '/events/other-event', '/events/other-event.json', '/ai/memories/other-event', '/ai/memories/other-event.json', '/ai/reports/weekly/other-event.json', '/users/other/garden.json', '/internal/ai-jobs/dispatchable'];
    for (const token of [null, 'invalid']) for (const path of paths) await send(path, { token, expected: 401 });
    for (const [method, path] of [['POST', '/auth/session'], ['POST', '/events'], ['POST', '/speech/transcribe'], ['POST', '/internal/ai-jobs/job-fixture/execute'], ['PUT', '/users/owner/profile'], ['POST', '/users/owner/journals'], ['PUT', '/users/owner/ai-consent'], ['DELETE', '/users/owner/flowers/id'], ['DELETE', '/users/owner']]) await send(path, { method, token: null, body: {}, expected: 401 });
    await send('/events/other-event', { token: 'unverified', expected: 403 });
    assert.equal(mutations.length, 0);
  });
  await t.test('forged owner paths/fields and cross-owner resources fail without writes or disclosure', async () => {
    for (const [path, method] of [['/users/other/profile', 'PUT'], ['/users/other/journals', 'POST'], ['/users/other/journals/id/cover', 'PUT'], ['/users/other/ai-consent', 'PUT'], ['/users/other/flowers/id', 'DELETE'], ['/users/other', 'DELETE']]) await send(path, { method, body: { content: 'forged' }, expected: 403 });
    for (const path of ['/events/other-event', '/ai/memories/other-event', '/ai/reports/weekly/other-event', '/ai/reports/monthly/other-event', '/ai/reports/yearly/other-event']) await send(path, { expected: 404 });
    await send('/events/other-event', { method: 'DELETE', expected: 404 });
    for (const body of [{ ownerId: 'other' }, { userId: 'other' }]) await send('/events', { method: 'POST', token: 'forged-event', body, expected: 400 });
    for (const field of ['ownerId', 'userId', 'role', 'admin']) await send('/users/owner/profile', { method: 'PUT', body: { preferredLocale: 'en', [field]: 'other' }, expected: 400 });
    assert.equal(mutations.length, 0); assert.ok(reads.every(where => where.ownerId === 'owner'));
    const before = reads.length;
    for (const path of ['/ai/memories/owner-event', '/ai/reports/weekly/owner-event']) await send(path, { token: 'revoked', expected: 403 });
    assert.equal(reads.length, before, 'revoked consent stops reads before private data');
    await send('/users/owner', { method: 'DELETE', expected: 403 });
  });
  await t.test('malformed JSON, dangerous nested/escaped keys and non-object bodies fail closed', async () => {
    const corpus = ['{', '{"content":}', 'null', '[]', '"text"', 'true', '1', '{"__proto__":{"polluted":true}}', '{"nested":[{"constructor":{"prototype":{"polluted":true}}}]}', '{"\\u005f\\u005fproto__":true}', '{"prototype":true}'];
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    for (const raw of corpus) await send('/users/json/profile', { method: 'PUT', token: 'json', raw, expected: 400 });
    for (const path of ['/auth/session', '/events', '/speech/transcribe', '/users/json/journals/id/cover']) await send(path, { method: path.includes('/cover') ? 'PUT' : 'POST', token: 'json', raw: '{"nested":{"prototype":true}}', expected: 400 });
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before); assert.equal(mutations.length, 0);
  });
  await t.test('byte, depth, key and array payload budgets reject bounded bombs before mutations', async () => {
    let deep = {}; for (let i = 0; i < 21; i++) deep = { nested: deep };
    const corpus = [{ preferredLocale: 'x'.repeat(32768) }, { preferredLocale: 'x'.repeat(64000) }, deep, { items: Array(1001).fill({}) }, Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`key${i}`, true]))];
    for (const body of corpus) await send('/users/bounds/profile', { method: 'PUT', token: 'bounds', body, expected: 413 });
    assert.equal(mutations.length, 0);
  });
  await t.test('invalid queries, prototype report types and malformed route encodings return safe client errors', async () => {
    for (const query of ['limit=0', 'limit=51', 'limit=-1', 'limit=1.5', 'limit=NaN', 'limit=%FF', 'limit=1&limit=2', 'ownerId=other', 'limit[gte]=1', 'cursor=%FF', 'cursor=' + 'a'.repeat(513), 'cursor=' + Buffer.from('{"type":"weekly","id":"id","start":"invalid"}').toString('base64url')]) await send('/ai/reports?' + query, { token: 'queries', expected: 400 });
    for (const type of ['__proto__', 'constructor', 'toString', 'unknown']) await send('/ai/reports/' + type + '/other-event', { token: 'queries', expected: 400 });
    for (const query of ['view=unknown', 'view=metadata&view=metadata', 'view=metadata&ownerId=other']) await send('/session?' + query, { token: 'queries', expected: 400 });
    for (const path of ['/events/%ZZ', '/events/%E0%A4%A']) await send(path, { token: 'queries', expected: 400 });
    assert.equal(mutations.length, 0);
  });
  await t.test('general, AI, auth IP and verified-account limits enforce exact boundaries before work', async () => {
    for (let i = 0; i < 40; i++) await send('/users/rate/profile', { method: 'PUT', token: 'rate', body: { preferredLocale: '' }, expected: 400 });
    const blocked = await send('/users/rate/profile', { method: 'PUT', token: 'rate', body: { preferredLocale: 'en' }, expected: 429 });
    assert.ok(Number(blocked.response.headers.get('retry-after')) > 0);
    for (let i = 0; i < 2; i++) await send('/events', { method: 'POST', token: 'rate-ai', body: { ownerId: 'other' }, expected: 400 });
    await send('/events', { method: 'POST', token: 'rate-ai', body: {}, expected: 429 });
    for (let i = 0; i < 8; i++) await send('/session', { token: 'invalid', ip: '198.51.100.1', expected: 401 });
    const before = verifications;
    await send('/session', { token: 'invalid', ip: '198.51.100.1', expected: 429 }); assert.equal(verifications, before);
    for (let i = 0; i < 8; i++) await send('/auth/session', { method: 'POST', token: 'rate-account', body: { deferProfileCreation: true }, expected: 200 });
    await send('/auth/session', { method: 'POST', token: 'rate-account', body: { deferProfileCreation: true }, expected: 429 });
    assert.equal(mutations.length, 0);
  });
  await t.test('valid owner controls preserve profile/journal writes and private Event access', async () => {
    await send('/users/owner/profile', { method: 'PUT', body: { preferredLocale: 'en' }, expected: 200 });
    await send('/users/owner/journals', { method: 'POST', body: { content: 'constructor prototype __proto__ are text' }, expected: 201 });
    for (const path of ['/events/owner-event', '/ai/memories/owner-event', '/ai/reports/weekly/owner-event', '/ai/reports/monthly/owner-event', '/ai/reports/yearly/owner-event']) {
      const result = await send(path, { expected: 200 }); assert.equal(result.body.content, 'owner-private');
    }
  });
  }
  const { socialCorpus } = await import('./social-content-fuzz.mjs');
  await socialCorpus(t, { prisma, replace, send, rawSend });
});
