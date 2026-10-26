import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const load = loadPlantingModules();
const { daysInMonth, monthKey, journalYears, openableMonths } = load('../../../services/bookhouse');
test('Bookhouse calendar handles leap years and year boundaries without timezone conversion', () => {
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2027, 2), 28);
  assert.equal(daysInMonth(2100, 2), 28);
  assert.equal(daysInMonth(2026, 12), 31);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(monthKey(2026, 9), '2026-09');
});
test('shelves preserve older real journals and do not add rows for empty check-ins', () => {
  assert.deepEqual(Array.from(journalYears([{ localDate: '2024-01-01', journal: { content: 'private' } }, { localDate: '2023-01-01', journal: null }])), [2024, 2026, 2027, 2028, 2029, 2030]);
});
test('the current month book always opens; other months need a saved private journal', () => {
  const entries = [{ localDate: '2026-09-12', journal: { content: 'private' } }, { localDate: '2026-08-02', journal: null }];
  assert.deepEqual([...openableMonths(entries, new Date(2026, 9, 26, 12))].sort(), ['2026-09', '2026-10']);
  assert.deepEqual([...openableMonths([], new Date(2026, 9, 26, 12))], ['2026-10']);
  // The device clock decides the current month, across a year boundary too.
  assert.deepEqual([...openableMonths([], new Date(2026, 11, 31, 23, 59))], ['2026-12']);
  assert.deepEqual([...openableMonths([], new Date(2027, 0, 1, 0, 1))], ['2027-01']);
});
test('private Journal uses only the authenticated standalone Journal contract, never Events or AI', async () => {
  const calls = [];
  const loader = loadPlantingModules(undefined, undefined, undefined, false, { fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 201, json: async () => options.method === 'GET' ? ({ journals: [], nextCursor: null }) : ({ id: 'flower' }) };
  } });
  loader('../../../services/api').configureApi({ apiBaseUrl: 'http://localhost:3107', getAccessToken: async () => 'local-token' });
  const service = loader('../../../services/bookhouse');
  await service.savePrivateJournal('owner', '  A quiet moment  ');
  await service.readJournals('owner');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://localhost:3107/users/owner/journals');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer local-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { content: 'A quiet moment' });
  assert.equal(calls[1].url, 'http://localhost:3107/users/owner/journals?view=page&limit=50');
});

const { focusCamera, boundCamera, zoomCamera } = load('../../bookhouse/shelfCamera');
const bounds = { width: 390, height: 440, contentWidth: 390, contentHeight: 440 };
test('shelf focus centers the chosen left, middle, right and lower regions', () => {
  for (const point of [{ x: 95, y: 95 }, { x: 195, y: 220 }, { x: 295, y: 340 }]) {
    const camera = focusCamera(point, 2.5, bounds);
    assert.equal(camera.x + point.x * camera.scale, 195);
    assert.equal(camera.y + point.y * camera.scale, 220);
  }
  assert.ok(focusCamera({ x: 295, y: 95 }, 2.5, bounds).x < focusCamera({ x: 95, y: 95 }, 2.5, bounds).x);
});
test('pan clamps all four edges while allowing the last month and bottom shelf into view', () => {
  const end = boundCamera({ scale: 2.5, x: -9999, y: -9999 }, bounds);
  assert.equal(end.x, 390 - 390 * 2.5);
  assert.equal(end.y, 440 - 440 * 2.5);
  const start = boundCamera({ scale: 2.5, x: 9999, y: 9999 }, bounds);
  assert.equal(start.x, 0); assert.equal(start.y, 0);
  assert.equal(end.x + 390 * end.scale, 390);
});
test('pinch preserves the content point beneath the fingers and overview restores identity', () => {
  const current = { scale: 2, x: -150, y: -200 }, focal = { x: 150, y: 180 };
  const next = zoomCamera(current, focal, 2.8, bounds);
  assert.equal((focal.x - current.x) / current.scale, (focal.x - next.x) / next.scale);
  assert.equal((focal.y - current.y) / current.scale, (focal.y - next.y) / next.scale);
  assert.deepEqual(JSON.parse(JSON.stringify(boundCamera({ scale: 1, x: -500, y: 90 }, bounds))), { scale: 1, x: 0, y: 0 });
});
