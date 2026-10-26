import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
test('Reflection discovers metadata then reads the selected report through existing authenticated GET', async () => {
  const calls = [];
  const load = loadPlantingModules(undefined, undefined, undefined, false, { fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ reports: [], nextCursor: null }) };
  } });
  load('../../../services/api').configureApi({ apiBaseUrl: 'http://localhost:3107', getAccessToken: async () => 'test-token' });
  const service = load('../../../services/reflections');
  await service.listReflections();
  await service.listReflections('next-cursor');
  await service.readReflection({ type: 'weekly', id: 'weekly-1' });
  await service.readReflection({ type: 'monthly', id: 'monthly-2' });
  assert.deepEqual(calls.map(call => call.url), [
    'http://localhost:3107/ai/reports?limit=20', 'http://localhost:3107/ai/reports?limit=20&cursor=next-cursor',
    'http://localhost:3107/ai/reports/weekly/weekly-1', 'http://localhost:3107/ai/reports/monthly/monthly-2',
  ]);
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.body, undefined);
    assert.equal(call.options.headers.Authorization, 'Bearer test-token');
  }
});

test('Create last week POSTs an empty body to the owner-scoped Weekly trigger and maps every outcome', async () => {
  const calls = []; let reply = { ok: true, status: 200, body: {} };
  const load = loadPlantingModules(undefined, undefined, undefined, false, { fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: reply.ok, status: reply.status, json: async () => reply.body };
  } });
  const api = load('../../../services/api');
  api.configureApi({ apiBaseUrl: 'http://localhost:3107', getAccessToken: async () => 'test-token' });
  const service = load('../../../services/reflections');
  const ready = { periodKey: '2026-10-12', execution: 'COMPLETED', job: { status: 'SUCCEEDED' },
    report: { id: 'weekly-9', periodKey: '2026-10-12', narrativeStatus: 'GENERATED' } };
  reply = { ok: true, status: 200, body: ready };
  assert.deepEqual(await service.createLastWeekReflection(), ready);
  assert.equal(calls[0].url, 'http://localhost:3107/ai/reports/weekly/trigger');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, '{}', 'the server chooses the last closed week; the client never names a period');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');

  const outcome = service.weeklyTriggerOutcome;
  assert.deepEqual({ ...outcome(ready) }, { kind: 'ready', message: 'Last week’s reflection is ready.', periodKey: '2026-10-12' });
  assert.equal(outcome({ ...ready, execution: 'ALREADY_FINALIZED' }).kind, 'ready');
  assert.equal(outcome({ ...ready, report: { ...ready.report, narrativeStatus: 'NOT_GENERATED' } }).kind, 'empty');
  for (const pending of [{ ...ready, execution: 'QUEUED', job: { status: 'PENDING' }, report: null },
    { ...ready, execution: 'PENDING_DISPATCH', job: { status: 'PENDING' }, report: null },
    { ...ready, execution: 'ALREADY_RUNNING_OR_FINALIZED', job: { status: 'RUNNING' }, report: null }]) assert.equal(outcome(pending).kind, 'pending');

  for (const [status, kind] of [[403, 'consent'], [409, 'paused'], [429, 'paused'], [503, 'paused'], [502, 'failed'], [500, 'failed']]) {
    reply = { ok: false, status, body: { error: 'synthetic server message' } };
    const error = await service.createLastWeekReflection().then(() => null, e => e);
    assert.ok(error instanceof api.ApiError); assert.equal(error.status, status);
    assert.equal(outcome(undefined, error).kind, kind, String(status));
  }
  assert.equal(outcome(undefined, new Error('Network request failed')).message, 'Network request failed');
});

test('Weekly reflections are named by week of month and the last closed week is the previous Monday', () => {
  const load = loadPlantingModules(undefined, undefined, undefined, false, { fetch: async () => { throw Error('no network'); } });
  const service = load('../../../services/reflections');
  assert.equal(service.lastClosedWeekKey(new Date(2026, 9, 19, 10)), '2026-10-12', 'Monday: the week that just ended');
  assert.equal(service.lastClosedWeekKey(new Date(2026, 9, 18, 23)), '2026-10-05', 'Sunday: the current week is still open');
  assert.equal(service.lastClosedWeekKey(new Date(2026, 10, 2, 0, 5)), '2026-10-26');
  assert.deepEqual({ ...service.weekLabel('2026-10-12') }, { title: 'October · Week 2', chip: 'Oct · Week 2', range: 'Oct 12 – 18' });
  assert.deepEqual({ ...service.weekLabel('2026-09-28') }, { title: 'September · Week 4', chip: 'Sep · Week 4', range: 'Sep 28 – Oct 4' });
  assert.equal(service.weekLabel('2026-10-05').title, 'October · Week 1');
  assert.equal(service.weekLabel('2026-03-30').title, 'March · Week 5');
  assert.equal(service.weekLabel('not-a-date').title, 'not-a-date');
});

test('Create last month POSTs an empty body to the Monthly trigger and words outcomes by month', async () => {
  const calls = [];
  const ready = { periodKey: '2026-09', execution: 'COMPLETED', job: { status: 'SUCCEEDED' },
    report: { id: 'monthly-3', periodKey: '2026-09', narrativeStatus: 'GENERATED' } };
  const load = loadPlantingModules(undefined, undefined, undefined, false, { fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 200, json: async () => ready };
  } });
  load('../../../services/api').configureApi({ apiBaseUrl: 'http://localhost:3107', getAccessToken: async () => 'test-token' });
  const service = load('../../../services/reflections');
  assert.deepEqual(await service.createLastMonthReflection(), ready);
  assert.equal(calls[0].url, 'http://localhost:3107/ai/reports/monthly/trigger');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, '{}', 'the server chooses the last closed month');
  assert.equal(service.weeklyTriggerOutcome(ready, undefined, 'month').message, 'Last month’s reflection is ready.');
  assert.equal(service.weeklyTriggerOutcome({ ...ready, report: null }, undefined, 'month').message,
    'Last month didn’t have enough moments for a written reflection.');
  assert.equal(service.weeklyTriggerOutcome(ready).message, 'Last week’s reflection is ready.', 'Weekly wording is unchanged');
  assert.equal(service.lastClosedMonthKey(new Date(2026, 9, 26)), '2026-09');
  assert.equal(service.lastClosedMonthKey(new Date(2027, 0, 1, 0, 5)), '2026-12');
});
