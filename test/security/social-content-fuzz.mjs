import assert from 'node:assert/strict';

export async function socialCorpus(t, { prisma, replace, send, rawSend }) {
  const writes = [];
  const users = Object.fromEntries(['alice', 'bob', 'carol', 'dave', 'off', 'content', 'headers'].map(id => [id, {
    id, name: id, accountId: id, communityTermsVersion: 'petalpal-community-2026-10-15', socialRestricted: false, avatar: '🦋', timezone: 'UTC', allowGardenVisits: id !== 'off',
    email: 'social-private-canary@example.test', garden: { id: 'garden-' + id, ownerId: id },
  }]));
  let friendships = [['bob', 'alice'], ['alice', 'bob'], ['off', 'alice'], ['alice', 'off']].map(([userId, friendId]) => ({ userId, friendId }));
  let pending = [
    { id: 'foreign', senderId: 'carol', receiverId: 'bob', status: 'pending' },
    { id: 'reject-me', senderId: 'carol', receiverId: 'alice', status: 'pending' },
    { id: 'header-request', senderId: 'carol', receiverId: 'content', status: 'pending' },
  ];
  const flower = { id: 'bob-flower', userId: 'bob', gardenId: 'garden-bob', supportCount: 0, messages: [],
    worldX: 1100, worldY: 900, regionId: 'Land09',
    event: 'social-private-canary', generationSeed: 'social-private-canary',
    dailyCheckIn: { journal: { content: 'social-private-canary' } } };
  const visits = [];
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(part => matches(row, part));
      if (key.endsWith('_friendId') || key === 'senderId_receiverId') return matches(row, value);
      if (value && typeof value === 'object') return Object.entries(value).every(([op, operand]) =>
        op === 'not' ? row[key] !== operand : op === 'in' ? operand.includes(row[key]) : op === 'contains' ? String(row[key]).toLowerCase().includes(operand.toLowerCase()) : op === 'mode');
      return value === undefined || row[key] === value;
    });
  }
  function project(row, select, include) {
    if (!row) return null;
    const out = select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : { ...row };
    for (const [key, spec] of Object.entries(include ?? {})) {
      const related = users[row[key + 'Id']];
      if (related) out[key] = project(related, spec.select, spec.include);
    }
    return out;
  }
  replace(prisma.user, 'findUnique', async ({ where, select, include }) => {
    const id = where.firebaseUid ?? where.id;
    if (where.firebaseUid && !users[id]) users[id] = { ...users.content, id, name: id };
    return project(users[id], select, include);
  });
  replace(prisma.userBlock, 'findFirst', async () => null);
  replace(prisma.userBlock, 'findMany', async () => []);
  replace(prisma.user, 'findFirst', async ({where,select}) => project(Object.values(users).find(row=>matches(row,where)),select));
  replace(prisma.user, 'findMany', async ({ where, select, take }) => Object.values(users).filter(row => matches(row, where)).slice(0, take).map(row => project(row, select)));
  replace(prisma.user, 'update', async ({ where, data, select }) => {
    writes.push({ model: 'user', where, data }); Object.assign(users[where.id], data); return project(users[where.id], select);
  });
  replace(prisma.friendship, 'findFirst', async ({ where }) => friendships.find(row => matches(row, where)) ?? null);
  replace(prisma.friendship, 'findUnique', async ({ where }) => friendships.find(row => matches(row, where)) ?? null);
  replace(prisma.friendship, 'findMany', async ({ where, include }) => friendships.filter(row => matches(row, where)).map(row => project(row, undefined, include)));
  replace(prisma.friendship, 'upsert', async ({ create }) => { writes.push({ model: 'friendship', data: create }); friendships.push({ ...create }); return create; });
  replace(prisma.friendship, 'deleteMany', async ({ where }) => { writes.push({ model: 'friendship-delete', where }); const old = friendships.length; friendships = friendships.filter(row => !matches(row, where)); return { count: old - friendships.length }; });
  replace(prisma.friendRequest, 'findUnique', async ({ where }) => pending.find(row => matches(row, where)) ?? null);
  replace(prisma.friendRequest, 'findFirst', async ({where}) => pending.find(row=>matches(row,where)) ?? null);
  replace(prisma.friendRequest, 'upsert', async ({where,create,update,include}) => {const row=pending.find(row=>matches(row,where));if(row){writes.push({model:'request',data:update});Object.assign(row,update);return project(row,undefined,include);}return prisma.friendRequest.create({data:create,include});});
  replace(prisma.friendRequest, 'findMany', async ({ where, include }) => pending.filter(row => matches(row, where)).map(row => project(row, undefined, include)));
  replace(prisma.friendRequest, 'create', async ({ data, include }) => { writes.push({ model: 'request', data }); const row = { id: 'created-' + writes.length, ...data }; pending.push(row); return project(row, undefined, include); });
  for (const method of ['delete', 'deleteMany']) replace(prisma.friendRequest, method, async ({ where }) => { writes.push({ model: 'request-delete', where }); pending = pending.filter(row => !matches(row, where)); return { count: 1 }; });
  replace(prisma, '$queryRawUnsafe', async (sql, ...ids) => {
    assert.ok(sql.includes("set_config('lock_timeout'") || sql.includes('FOR NO KEY UPDATE') || sql.includes('FROM "FriendRequest"'));
    return sql.includes('FOR NO KEY UPDATE') ? ids.filter(id => users[id]).map(id => ({ id })) : [];
  });
  replace(prisma, '$transaction', async work => Array.isArray(work) ? Promise.all(work) : work(prisma));
  replace(prisma.garden, 'findUnique', async ({ where, include }) => {
    const owner = Object.values(users).find(row => row.garden.id === where.id || row.id === where.ownerId);
    return owner ? { ...owner.garden, ...(include ? { flowers: owner.id === 'bob' ? [flower] : [], visitRecords: [] } : {}) } : null;
  });
  replace(prisma.flower, 'findFirst', async ({ where, select }) => matches(flower, where) ? project(flower, select) : null);
  replace(prisma.flower, 'findUnique', async () => flower);
  replace(prisma.flower, 'update', async ({ data }) => { writes.push({ model: 'flower', data }); flower.supportCount += data.supportCount.increment; return flower; });
  replace(prisma.visitRecord, 'findFirst', async ({ where }) => visits.find(row => matches(row, where)) ?? null);
  replace(prisma.visitRecord, 'findMany', async ({ where }) => visits.filter(row => matches(row, where)));
  replace(prisma.visitRecord, 'create', async ({ data }) => { writes.push({ model: 'visit', data }); const row = { id: 'visit-' + visits.length, ...data }; visits.push(row); return row; });
  replace(prisma.message, 'create', async ({ data }) => { writes.push({ model: 'message', data }); const row = { id: 'message-' + flower.messages.length, ...data }; flower.messages.push(row); return row; });
  const call = (path, options = {}) => send(path, { token: 'alice', ...options });
  const post = (path, body, expected, options = {}) => call(path, { method: 'POST', body, expected, ...options });
  async function denied(path, options) {
    const before = writes.length; const result = await call(path, options); assert.equal(writes.length, before, 'rejection cannot mutate fixture'); return result;
  }

  await t.test('social anonymous admission and malformed identifiers reject without mutations', async () => {
    const paths = [
      ['POST', '/friends/request'], ['POST', '/friends/requests/foreign/accept'], ['POST', '/friends/requests/foreign/reject'], ['POST', '/friends/remove'],
      ['GET', '/users/search?name=bob'], ['GET', '/users/alice/friends'], ['GET', '/friends/requests/alice'], ['GET', '/users/bob/garden'],
      ['POST', '/visit'], ['POST', '/visit/move'], ['PATCH', '/users/me/garden-privacy'], ['GET', '/users/bob/flowers/bob-flower'],
      ['POST', '/users/bob/flowers/bob-flower/support'], ['POST', '/users/bob/flowers/bob-flower/message'],
    ];
    for (const [method, path] of paths) await denied(path, { method, token: null, ...(method === 'GET' ? {} : { body: {} }), expected: 401 });
    for (const id of ['bad.id', '%ZZ', 'a'.repeat(129)]) {
      for (const action of ['accept', 'reject']) await denied(`/friends/requests/${id}/${action}`, { method: 'POST', token: 'ids', expected: 400 });
      await denied(`/users/bob/flowers/${id}/support`, { method: 'POST', token: 'ids', body: {}, expected: 400 });
    }
    for (const value of ['', {}, ['bob'], 'bad.id']) await denied('/friends/request', { method: 'POST', token: 'ids', body: { receiverId: value }, expected: 400 });
  });
  await t.test('friend lifecycle binds actors and request receivers; forged actors cannot modify third parties', async () => {
    for (const action of ['accept', 'reject']) await denied(`/friends/requests/foreign/${action}`, { method: 'POST', body: { userId: 'bob', receiverId: 'bob' }, expected: 403 });
    const sent = await post('/friends/request', { receiverId: 'dave', senderId: 'bob', userId: 'bob', role: 'admin' }, 201);
    assert.equal(sent.body.request.senderId, 'alice'); assert.equal(sent.body.request.receiverId, 'dave');
    await post('/friends/requests/' + sent.body.request.id + '/accept', undefined, 200, { token: 'dave' });
    assert.ok(friendships.some(row => row.userId === 'alice' && row.friendId === 'dave'));
    await denied('/friends/requests/' + sent.body.request.id + '/accept', { method: 'POST', token: 'dave', expected: 404 });
    await post('/friends/requests/reject-me/reject', undefined, 200);
    await post('/friends/remove', { friendId: 'dave', userId: 'bob', ownerId: 'bob' }, 200);
    assert.ok(!friendships.some(row => row.userId === 'alice' && row.friendId === 'dave'));
    assert.ok(friendships.some(row => row.userId === 'bob' && row.friendId === 'alice'));
    await denied('/users/dave/garden', { expected: 403 });
  });
  await t.test('friend search/list/request projections expose public summaries only and keep lists owner-only', async () => {
    for (const path of ['/users/bob/friends', '/friends/requests/bob']) await denied(path, { expected: 403 });
    for (const path of ['/users/search?name=bob', '/users/alice/friends', '/friends/requests/alice']) await call(path, { expected: 200 });
    for (const query of ['name=a&name=b', 'name[x]=bob', 'name=' + 'x'.repeat(81)]) await denied('/users/search?' + query, { expected: query.includes('xxx') ? 413 : 400 });
  });
  await t.test('privacy-off/nonfriend Garden and direct Flower read/support/message deny access', async () => {
    for (const token of ['carol', 'alice']) {
      users.bob.allowGardenVisits = token !== 'alice';
      for (const [method, path, body] of [
        ['GET', '/users/bob/garden'], ['GET', '/users/bob/flowers/bob-flower'],
        ['POST', '/visit', { hostUserId: 'bob', visitorUserId: 'bob' }],
        ['POST', '/visit/move', { hostUserId: 'bob', x: 1, y: 1 }],
        ['POST', '/users/bob/flowers/bob-flower/support', { visitorUserId: 'bob' }],
        ['POST', '/users/bob/flowers/bob-flower/message', { text: 'forged', visitorUserId: 'bob' }],
      ]) await denied(path, { method, token, body, expected: 403 });
    }
    users.bob.allowGardenVisits = true;
    await denied('/users/bob/garden?view=metadata', { expected: 403 });
    await denied('/users/off/garden', { expected: 403 });
  });
  await t.test('legitimate Garden visit, support and messages preserve sanitization and authenticated actors', async () => {
    users.bob.allowGardenVisits = true;
    await call('/users/bob/garden', { expected: 200 }); await call('/users/bob/flowers/bob-flower', { expected: 200 });
    const visit = await post('/visit', { hostUserId: 'bob', visitorUserId: 'carol' }, 200);
    assert.equal(visit.body.activeVisitors[0].visitorId, 'alice');
    await post('/visit/move', { hostUserId: 'bob', visitorUserId: 'carol', x: 2, y: 3 }, 200);
    await post('/users/bob/flowers/bob-flower/support', { visitorUserId: 'carol', userId: 'carol' }, 200);
    const count = writes.length;
    await post('/users/bob/flowers/bob-flower/support', {}, 200); assert.equal(writes.length, count, 'same-day support is idempotent');
    await post('/users/bob/flowers/bob-flower/message', { text: 'Hello Garden', visitorUserId: 'carol' }, 200);
    assert.equal(writes.find(row => row.model === 'message').data.userId, 'alice');
    assert.ok(writes.filter(row => row.model === 'visit').every(row => row.data.visitorId === 'alice'));
  });
  await t.test('actual privacy/friendship revocation blocks subsequent active movement and Flower writes', async () => {
    await call('/users/me/garden-privacy', { method: 'PATCH', token: 'bob', body: { allowGardenVisits: false }, expected: 200 });
    await denied('/visit/move', { method: 'POST', body: { hostUserId: 'bob', x: 2, y: 3 }, expected: 403 });
    await denied('/users/bob/flowers/bob-flower/message', { method: 'POST', body: { text: 'blocked' }, expected: 403 });
    await call('/users/me/garden-privacy', { method: 'PATCH', token: 'bob', body: { allowGardenVisits: true }, expected: 200 });
    await post('/friends/remove', { friendId: 'bob' }, 200);
    for (const path of ['/users/bob/garden', '/users/bob/flowers/bob-flower']) await denied(path, { expected: 403 });
    await denied('/users/bob/flowers/bob-flower/support', { method: 'POST', body: {}, expected: 403 });
    await denied('/users/bob/flowers/bob-flower/message', { method: 'POST', body: { text: 'blocked' }, expected: 403 });
  });
  await t.test('unsupported or missing media types cannot execute bodyless social actions', async () => {
    for (const contentType of [null, '', 'invalid', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=fixture', 'text/plain', 'application/json, text/plain']) {
      for (const action of ['accept', 'reject']) await denied('/friends/requests/header-request/' + action, { method: 'POST', token: 'content', raw: '{"userId":"bob"}', contentType, expected: 415 });
    }
    await denied('/speech/transcribe', { method: 'POST', token: 'early', raw: '{}', contentType: 'text/plain', expected: 415 });
    await denied('/users/early/journals/id/cover', { method: 'PUT', token: 'early', raw: '{}', contentType: 'text/plain', expected: 415 });
  });
  await t.test('JSON parameters/UTF-8 remain valid; unsupported charset/encoding and wrong shapes reject safely', async () => {
    for (const [i, contentType] of ['application/json; charset=utf-8', 'application/json; charset=UTF-8; profile=fixture'].entries()) {
      const result = await post('/friends/request', { receiverId: 'bob' }, 201, { token: 'format-' + i, contentType });
      assert.equal(result.body.request.senderId, 'format-' + i);
    }
    for (const [contentType, headers] of [['application/json; charset=iso-8859-1', {}], ['application/json', { 'Content-Encoding': 'unsupported' }]]) await denied('/friends/request', { method: 'POST', token: 'content', raw: '{}', contentType, headers, expected: 415 });
    for (const raw of ['{', '[]', 'null', '"text"']) await denied('/friends/request', { method: 'POST', token: 'content', raw, contentType: 'application/json; charset=utf-8', expected: 400 });
  });
  await t.test('conflicting raw headers and exact parser-size boundary fail closed', async () => {
    const before = writes.length;
    assert.equal(await rawSend('Content-Type: application/json\r\nContent-Type: text/plain\r\nContent-Length: 25', '{"allowGardenVisits":true}'), 400);
    for (const headers of ['Content-Type: application/json\r\nContent-Length: 2\r\nContent-Length: 3', 'Content-Type: application/json\r\nContent-Length: 2\r\nTransfer-Encoding: chunked']) assert.equal(await rawSend(headers), 400);
    const overhead = Buffer.byteLength(JSON.stringify({ padding: '' }));
    for (const size of [32768, 32769]) await denied('/users/me/garden-privacy', { method: 'PATCH', token: 'content', raw: JSON.stringify({ padding: 'x'.repeat(size - overhead) }), expected: size === 32768 ? 400 : 413 });
    assert.equal(writes.length, before);
  });
}
