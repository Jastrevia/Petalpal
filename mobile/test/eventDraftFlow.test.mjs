import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { hookHarness } from './hookHarness.mjs';

// Leaving the Event / planting flow on purpose keeps an unfinished Event as a draft; the next time
// the Event flow opens it asks Continue or Discard. A draft is never a planted flower.
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const plain = value => JSON.parse(JSON.stringify(value));

function backend() {
  const events = new Map(), flowers = [], calls = [];
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET'; calls.push([method, url]);
    if (method === 'POST' && url === '/events') {
      const body = JSON.parse(init.body), id = `event-${events.size + 1}`;
      const event = { id, content: body.content, primaryGardenMood: body.primaryGardenMood, localDate: '2026-09-29',
        secondaryEmotions: [], emotionStatus: 'SKIPPED', occurredAt: '2026-09-29T18:00:00Z' };
      const flower = { id: `flower-${id}`, userId: 'owner', sourceEventId: id, name: 'Sunflower', speciesCode: 'SUNFLOWER',
        mood: body.primaryGardenMood, img: 'sunflower.png', createdAt: `2026-09-29T18:00:0${events.size}Z`, supportCount: 0, worldX: null, worldY: null, regionId: null };
      events.set(id, event); flowers.push(flower);
      return response({ event, flower: { ...flower }, emotion: { status: 'SKIPPED', labels: [] }, memoryJob: null }, 201);
    }
    if (method === 'GET' && url === '/users/owner/garden') return response({ owner: { id: 'owner' }, flowers: flowers.map(f => ({ ...f })) });
    if (method === 'GET' && url === '/api/flowers/today') return response({ localDate: '2026-09-29', limit: null, planted: null, remaining: null });
    const event = /^\/events\/([^/]+)$/.exec(url);
    if (event && method === 'GET') return events.has(event[1]) ? response(events.get(event[1])) : response({ error: 'Event not found' }, 404);
    if (event && method === 'DELETE') {
      events.delete(event[1]);
      const index = flowers.findIndex(f => f.sourceEventId === event[1]);
      if (index >= 0) flowers.splice(index, 1); // The Flower cascades with its Event on the server.
      return response({ success: true });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };
  return { fetch, events, flowers, calls };
}

// Each "open" is a fresh Event flow (a newly mounted panel); the app session's draft store and
// the server are shared, as they are in the app.
function opener(server, draftModule = loadPlantingModules()('../../../services/eventDraft')) {
  const navigations = [];
  const session = { user: { id: 'owner', timezone: 'UTC' } };
  return { draftModule, navigations, async open() {
    const hooks = hookHarness();
    const load = loadPlantingModules(undefined, hooks.react, undefined, true, {
      fetch: server.fetch,
      '../services/auth': { useAuth: () => ({ session }) },
      'expo-router': { router: { navigate: route => navigations.push(route) }, usePathname: () => '/' },
      '../services/eventDraft': draftModule,
    });
    load('../../../services/api').configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
    const { useEventJournal } = load('../../../hooks/useEventJournal');
    hooks.mount(() => useEventJournal());
    return { hooks, state: await hooks.flush() };
  } };
}

test('acceptance 6: leaving before Save keeps the text and mood; reopening asks, and Continue restores them', async () => {
  const server = backend(); const app = opener(server);
  let { hooks, state } = await app.open();
  assert.equal(state.draftPrompt, null, 'Nothing unfinished yet');
  state.setContent('A small moment, half written'); state.setMood('GENTLE_BLOOM'); state = await hooks.flush();
  // Closed on purpose (the panel unmounts). Reopen the Event flow:
  ({ hooks, state } = await app.open());
  assert.deepEqual(plain(state.draftPrompt), { step: 'editing', content: 'A small moment, half written', mood: 'GENTLE_BLOOM' });
  assert.equal(state.content, '', 'Nothing starts until the owner chooses');
  const resumed = await state.continueDraft(); state = await hooks.flush();
  assert.equal(resumed.step, 'editing');
  assert.equal(state.draftPrompt, null);
  assert.equal(state.content, 'A small moment, half written'); assert.equal(state.mood, 'GENTLE_BLOOM');
  assert.equal(server.events.size, 0, 'A draft saves nothing on the server');
});

test('acceptance 7: leaving after choosing a spot but before Plant resumes planting; the flower is still unplanted', async () => {
  const server = backend(); const app = opener(server);
  let { hooks, state } = await app.open();
  state.setContent('Saved, not planted'); state.setMood('SUNNY_BLOOM'); state = await hooks.flush();
  await state.saveEvent(); state = await hooks.flush();
  const flower = state.flowers[0];
  assert.equal(flower.worldX, null);
  state.placeFlower(flower); state = await hooks.flush();
  assert.equal(app.navigations.at(-1).params.mode, 'plant');
  // In the Garden the owner chose a valid spot, then pressed Cancel (PlantingContext remembers it).
  app.draftModule.rememberPlantingPreview('owner', flower.id, { worldX: 1000, worldY: 900 });

  ({ hooks, state } = await app.open());
  assert.equal(state.draftPrompt.step, 'placing');
  assert.equal(state.draftPrompt.flowerId, flower.id);
  const resumed = await state.continueDraft(); state = await hooks.flush();
  assert.equal(resumed.step, 'placing'); assert.equal(resumed.flower.id, flower.id);
  assert.equal(state.result.event.id, flower.sourceEventId);
  assert.deepEqual(plain(app.draftModule.plantingPreview('owner', flower.id)), { worldX: 1000, worldY: 900 });
  // Still not planted: no placement was ever sent, and the server flower has no spot.
  assert.equal(server.calls.some(([, url]) => url.includes('/placement')), false);
  assert.equal(server.flowers[0].worldX, null);
});

test('acceptance 8: Discard removes the saved Event and its unplanted flower, then starts clean', async () => {
  const server = backend(); const app = opener(server);
  let { hooks, state } = await app.open();
  state.setContent('Discard me'); state.setMood('QUIET_BLOOM'); state = await hooks.flush();
  await state.saveEvent(); state = await hooks.flush();
  const flower = state.flowers[0];
  app.draftModule.rememberPlantingPreview('owner', flower.id, { worldX: 10, worldY: 20 });

  ({ hooks, state } = await app.open());
  assert.equal(state.draftPrompt.step, 'review');
  assert.equal(await state.discardDraft(), true); state = await hooks.flush();
  assert.deepEqual(server.calls.filter(([method]) => method === 'DELETE'), [['DELETE', `/events/${flower.sourceEventId}`]]);
  assert.equal(server.events.size, 0); assert.equal(server.flowers.length, 0, 'No hidden flower or spot is left');
  assert.equal(state.draftPrompt, null); assert.equal(state.result, null); assert.equal(state.content, ''); assert.equal(state.mood, null);
  assert.equal(app.draftModule.loadEventDraft('owner'), null);
  assert.equal(app.draftModule.plantingPreview('owner', flower.id), null);
  // A clean Event flow next time.
  ({ state } = await app.open());
  assert.equal(state.draftPrompt, null);
});

test('after a restart an unplanted Event flower is found on the server; a planted one is never discarded', async () => {
  const server = backend();
  let app = opener(server);
  let { hooks, state } = await app.open();
  state.setContent('Before a restart'); state.setMood('FIRE_BLOOM'); state = await hooks.flush();
  await state.saveEvent(); state = await hooks.flush();
  // A restart forgets the in-memory draft; the server still has the unplanted flower.
  app = opener(server);
  ({ hooks, state } = await app.open());
  assert.equal(state.draftPrompt.step, 'review');
  assert.equal(state.draftPrompt.eventId, server.flowers[0].sourceEventId);
  // Planted meanwhile (another device): Discard deletes nothing.
  Object.assign(server.flowers[0], { worldX: 1000, worldY: 900, regionId: 'Land09' });
  assert.equal(await state.discardDraft(), false); state = await hooks.flush();
  assert.equal(server.events.size, 1); assert.equal(server.flowers.length, 1);
  assert.equal(server.calls.some(([method]) => method === 'DELETE'), false);
  ({ state } = await app.open());
  assert.equal(state.draftPrompt, null, 'A planted flower is not unfinished');
});

test('analysis that stays pending ends in an explicit timed-out state; Check again only re-reads the Event', async () => {
  const server = backend();
  const originalFetch = server.fetch;
  let status = 'PENDING';
  server.fetch = async (url, init = {}) => {
    const reply = await originalFetch(url, init);
    if (!/^\/events(\/|$)/.test(url)) return reply;
    const body = await reply.json();
    if (body.event) body.event.emotionStatus = status; else if (body.id) body.emotionStatus = status;
    return response(body, reply.status);
  };
  const timers = [];
  const runtimeGlobals = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} };
  const hooks = hookHarness();
  const session = { user: { id: 'owner', timezone: 'UTC' } };
  const load = loadPlantingModules(undefined, hooks.react, undefined, true, {
    fetch: server.fetch, runtimeGlobals,
    '../services/auth': { useAuth: () => ({ session }) },
    'expo-router': { router: { navigate() {} }, usePathname: () => '/' },
  });
  load('../../../services/api').configureApi({ apiBaseUrl: '', getAccessToken: async () => 'test-token' });
  hooks.mount(() => load('../../../hooks/useEventJournal').useEventJournal());
  let state = await hooks.flush();
  state.setContent('I had an amazing day and received wonderful news.'); state.setMood('SUNNY_BLOOM'); state = await hooks.flush();
  await state.saveEvent(); state = await hooks.flush();
  assert.equal(state.result.event.emotionStatus, 'PENDING'); assert.equal(state.analysisTimedOut, false);
  for (let check = 0; check < 6; check++) {
    const next = timers.shift(); assert.ok(next, `poll ${check + 1} scheduled`);
    await next.fn(); state = await hooks.flush();
  }
  assert.equal(timers.length, 0, 'Polling stops after the last check');
  assert.equal(state.analysisTimedOut, true);
  const eventReads = server.calls.filter(([method, url]) => method === 'GET' && url.startsWith('/events/')).length;
  assert.equal(eventReads, 6);
  assert.equal(server.calls.filter(([method, url]) => method === 'POST' && url === '/events').length, 1, 'AI is never re-run');
  // The analysis finished later: Check again picks up the persisted result.
  status = 'SUCCESS';
  await state.refreshEventStatus(); state = await hooks.flush();
  assert.equal(state.result.event.emotionStatus, 'SUCCESS'); assert.equal(state.analysisTimedOut, false);
  assert.equal(server.calls.filter(([method, url]) => method === 'POST' && url === '/events').length, 1);
});
