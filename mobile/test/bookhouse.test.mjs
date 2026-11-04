import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const load = loadPlantingModules();
const { daysInMonth, monthKey, journalYears } = load('../../../services/bookhouse');
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

test('private Journal edit and delete call the owner-scoped Journal routes', async () => {
  const calls = [];
  const loader = loadPlantingModules(undefined, undefined, undefined, false, { fetch: async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ id: 'j 1', content: 'Kinder', success: true }) };
  } });
  loader('../../../services/api').configureApi({ apiBaseUrl: 'http://localhost:3107', getAccessToken: async () => 'local-token' });
  const service = loader('../../../services/bookhouse');
  await service.updatePrivateJournal('owner', 'j 1', '  Kinder  ');
  await service.deletePrivateJournal('owner', 'j 1');
  assert.equal(calls[0].url, 'http://localhost:3107/users/owner/journals/j%201');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body), { content: 'Kinder' });
  assert.equal(calls[1].url, 'http://localhost:3107/users/owner/journals/j%201');
  assert.equal(calls[1].options.method, 'DELETE');
  assert.equal(calls[1].options.body, undefined);
  for (const call of calls) assert.equal(call.options.headers.Authorization, 'Bearer local-token');
});

const { monthEntries, journalCounts, journalPreview, journalLocked, formatLocalDate, weekdayOf, defaultShelfYear, todayLocalDate } = load('../../../services/bookhouse');
const entry = (id, localDate, content, extra = {}) => ({ id, localDate, createdAt: `${localDate}T1${id.length}:00:00.000Z`, journal: { id, content }, emotionResult: null, flower: null, ...extra });
test('a month lists only its saved journals, oldest first, using the stored local date', () => {
  const entries = [entry('b', '2026-04-18', 'Rainy'), entry('a', '2026-04-05', 'Calm'), entry('x', '2026-05-01', 'May'),
    { id: 'empty', localDate: '2026-04-02', createdAt: '2026-04-02T00:00:00Z', journal: null, emotionResult: null, flower: null },
    entry('c', '2026-04-30', 'Grateful'), entry('d', '2025-04-10', 'Last year')];
  assert.deepEqual(monthEntries(entries, 2026, 4).map(e => e.id), ['a', 'b', 'c']);
  assert.deepEqual(monthEntries(entries, 2026, 8), []);
  const counts = journalCounts(entries);
  assert.equal(counts.get('2026-04'), 3); assert.equal(counts.get('2025-04'), 1); assert.equal(counts.has('2026-08'), false);
  // An entry near midnight UTC stays on its owner's local day.
  assert.deepEqual(monthEntries([entry('late', '2026-04-30', 'Late', { createdAt: '2026-05-01T06:30:00.000Z' })], 2026, 4).map(e => e.id), ['late']);
});
test('cards and the reading header show real dates and the entry\'s own words', () => {
  assert.equal(formatLocalDate('2026-04-05'), 'Apr 5, 2026');
  assert.equal(weekdayOf('2026-04-05'), 'Sunday');
  assert.equal(weekdayOf('2028-02-29'), 'Tuesday');
  assert.equal(journalPreview('\n  A calm Sunday \nMore text'), 'A calm Sunday');
  assert.equal(journalPreview('word '.repeat(30), 20), 'word word word word…');
  assert.equal(journalPreview('今天下雨了，我在窗边喝茶，看着叶子慢慢变黄。', 10), '今天下雨了，我在窗边…');
  assert.equal(todayLocalDate('America/Vancouver', new Date('2026-10-29T03:00:00Z')), '2026-10-28');
  assert.equal(todayLocalDate('Not/AZone', new Date('2026-10-29T03:00:00Z')), '2026-10-29');
  assert.equal(defaultShelfYear([2025, 2026, 2027], '2026-10-28'), 2026);
  assert.equal(defaultShelfYear([2026, 2027], '2031-01-01'), 2027);
});
test('Daily Grow journals stay locked, including on servers that predate the locked flag', () => {
  assert.equal(journalLocked(entry('a', '2026-04-05', 'x')), false);
  assert.equal(journalLocked({ ...entry('a', '2026-04-05', 'x'), journal: { id: 'a', content: 'x', locked: true } }), true);
  assert.equal(journalLocked(entry('a', '2026-04-05', 'x', { flower: { id: 'f' } })), true);
  assert.equal(journalLocked(entry('a', '2026-04-05', 'x', { emotionResult: { label: 'QUIET_BLOOM' } })), true);
  assert.equal(journalLocked({ ...entry('a', '2026-04-05', 'x', { flower: { id: 'f' } }), journal: { id: 'a', content: 'x', locked: false } }), false);
});

const { monthLocked, yearLocked } = load('../../../services/bookhouse');
test('months and years that have not arrived are locked, compared numerically in the account calendar', () => {
  const today = '2026-10-28';
  for (let month = 1; month <= 10; month++) assert.equal(monthLocked(2026, month, today), false, `2026-${month}`);
  assert.equal(monthLocked(2026, 11, today), true);
  assert.equal(monthLocked(2026, 12, today), true);
  for (let month = 1; month <= 12; month++) { assert.equal(monthLocked(2027, month, today), true); assert.equal(monthLocked(2025, month, today), false); }
  assert.equal(monthLocked(2026, 12, '2026-12-01'), false);
  assert.equal(monthLocked(2027, 1, '2026-12-31'), true);
  assert.equal(monthLocked(2027, 1, '2027-01-01'), false);
  assert.equal(yearLocked(2026, today), false); assert.equal(yearLocked(2025, today), false);
  assert.equal(yearLocked(2027, today), true); assert.equal(yearLocked(2030, today), true);
  // A saved journal always keeps its month and year reachable (e.g. after a timezone or clock difference).
  assert.equal(monthLocked(2026, 11, today, 1), false);
  assert.equal(yearLocked(2027, today, 2), false);
});
// The lock uses the account timezone's day, so a Vancouver evening on Oct 31 is still October there.
test('the lock boundary follows the account timezone, not UTC', () => {
  const { todayLocalDate } = load('../../../services/bookhouse');
  const vancouver = todayLocalDate('America/Vancouver', new Date('2026-11-01T03:00:00Z'));
  assert.equal(vancouver, '2026-10-31');
  assert.equal(monthLocked(2026, 11, vancouver), true);
  assert.equal(monthLocked(2026, 11, todayLocalDate('UTC', new Date('2026-11-01T03:00:00Z'))), false);
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

const book3d = load('../../bookhouse/book3d/motion');
const math = load('../../bookhouse/book3d/math');
const PHONES = [[360, 740, 24, 0], [390, 844, 47, 34], [430, 932, 59, 34], [768, 1024, 24, 20]];
// Every board corner of the book in a frame, on screen.
function corners(frame) {
  const { W, H, T, board } = math.SPEC;
  const world = math.poseMatrix(frame.pose), slab = math.mul(world, math.slabMatrix(frame.state));
  const out = [];
  for (const x of [0, W]) for (const y of [0, H]) {
    for (const z of [-T / 2, -T / 2 + board]) out.push(math.project(frame.cam, math.apply(world, [x, y, z])));
    for (const z of [T / 2 - board, T / 2]) out.push(math.project(frame.cam, math.apply(slab, [x, y, z])));
  }
  return out;
}
function shelfOrigin(width, height) {
  const slotH = height * .19, slotW = slotH * math.SPINE_RATIO;
  const slot = { x: width / 2 + slotW + 6, y: height * .62, width: slotW, height: slotH };
  return { slot, origin: { cam: { cx: width / 2, cy: height * .45, d: height * 2.4 }, x: slot.x + slotW / 2, bottom: slot.y + slotH, height: slotH } };
}
test('the 3D book starts exactly where the shelf drew it and ends in the reading pose', () => {
  for (const [width, height, top, bottom] of PHONES) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const { origin } = shelfOrigin(width, height);
    const start = book3d.openingFrame(0, origin, L);
    const shelf = math.shelfPose(origin.x, origin.bottom, origin.height);
    // Same camera and the same projected book (re-pivoted about its centre, not moved).
    assert.deepEqual(JSON.parse(JSON.stringify(start.cam)), origin.cam);
    for (const p of [[0, 0, -145], [680, 1000, 145], [0, 500, 0], [340, 1000, -145]]) {
      const a = math.project(origin.cam, math.apply(math.poseMatrix(shelf), p)), b = math.project(start.cam, math.apply(math.poseMatrix(start.pose), p));
      assert.ok(Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6, `${width}: shelf point ${p}`);
    }
    assert.equal(start.state.phi, 0); assert.equal(start.state.turns.length, 0); assert.equal(start.dim, 0);
    // Spine crown in the screen plane, the slot's width wide: the spine on the shelf is the spine of this book.
    const crown = math.apply(math.poseMatrix(shelf), [-math.spineSag(), 1000, 0]);
    assert.ok(Math.abs(crown[2]) < 1e-9 && Math.abs(crown[0] - origin.x) < 1e-9);
    const end = book3d.openingFrame(1, origin, L), read = book3d.readingFrame(L, 0, 0, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(end.pose)), JSON.parse(JSON.stringify(read.pose)));
    assert.deepEqual(JSON.parse(JSON.stringify(end.cam)), JSON.parse(JSON.stringify(read.cam)));
    assert.deepEqual([end.state.phi, end.state.split, end.state.curl, end.state.turns.length], [read.state.phi, read.state.split, read.state.curl, 0]);
  }
});
test('the opening is continuous and keeps the whole book on a portrait screen once it floats', () => {
  for (const [width, height, top, bottom] of PHONES) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const { origin } = shelfOrigin(width, height);
    let previous = corners(book3d.openingFrame(0, origin, L));
    for (let i = 1; i <= 1000; i++) {
      const t = i / 1000, frame = book3d.openingFrame(t, origin, L), now = corners(frame);
      const jump = Math.max(...now.map((p, k) => Math.hypot(p[0] - previous[k][0], p[1] - previous[k][1])));
      assert.ok(jump < 14, `${width}: jump of ${jump.toFixed(1)}px at t=${t}`);
      if (t >= .4) for (const [x, y] of now) assert.ok(x >= 0 && x <= width && y >= top && y <= height - bottom, `${width}: off screen at t=${t} (${x.toFixed(0)}, ${y.toFixed(0)})`);
      previous = now;
    }
    // Phases: cover shut while it floats and settles on the desk, open by 0.82, flyleaf over by 0.92.
    assert.equal(book3d.openingFrame(.55, origin, L).state.phi, 0);
    assert.ok(book3d.openingFrame(.7, origin, L).state.phi > .5);
    assert.equal(book3d.openingFrame(.84, origin, L).state.phi, book3d.OPEN_PHI);
    assert.ok(book3d.openingFrame(.84, origin, L).state.turns[0].p > 0, 'flyleaf turning');
    // It settles on the desk lying exactly as it then opens (same pitch as the open spread).
    assert.equal(book3d.openingFrame(.56, origin, L).pose.pitch, L.read.pitch);
    assert.equal(book3d.openingFrame(.95, origin, L).state.turns.length, 0);
  }
});
test('the reading spread, its bookmarks and the leaned-in page fit the screen', () => {
  for (const [width, height, top, bottom] of PHONES) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const spread = corners(book3d.readingFrame(L, 0, 0, 0));
    for (const [x, y] of spread) assert.ok(x >= 4 && x <= L.tabLeft + 4 && y >= top + 100 && y <= height - bottom - 60, `${width}: spread corner ${x}, ${y}`);
    assert.ok(L.tabLeft + 36 <= width - 2, `${width}: bookmarks visible`);
    assert.ok(L.tabHeight > 120, `${width}: bookmark column`);
    // The bookmark rail lies within the book's own height (its top and bottom), clear of the date controls below it.
    // (The book's full outline on screen runs from deskEdge + 12 to `below`; the controls lie under it.)
    assert.ok(L.tabTop >= L.deskEdge + 12 && L.tabTop + L.tabHeight <= L.below, `${width}: rail within the book (${L.tabTop.toFixed(0)}–${(L.tabTop + L.tabHeight).toFixed(0)})`);
    assert.ok(L.page.x >= 0 && L.page.x + L.page.width <= width && L.page.y >= top + 44 && L.page.y + L.page.height <= height - bottom - 50, `${width}: lean page`);
    assert.ok(L.page.width >= 320 || L.page.width >= width - 20, `${width}: readable lean page ${L.page.width}`);
    // Leaned in, the right page lies flat in the screen plane exactly on the overlay rectangle.
    const lean = book3d.readingFrame(L, 1, 0, 0);
    assert.equal(lean.pose.pitch, 0); assert.equal(lean.pose.yaw, 0);
    const { W, H, over, gap } = math.SPEC;
    const tl = book3d.projectPoint(lean.cam, lean.pose, [gap, over, L.read.pz]), br = book3d.projectPoint(lean.cam, lean.pose, [W - over, H - over, L.read.pz]);
    assert.ok(Math.abs(tl[0] - L.page.x) < 1e-6 && Math.abs(tl[1] - L.page.y) < 1e-6 && Math.abs(br[0] - L.page.x - L.page.width) < 1e-6 && Math.abs(br[1] - L.page.y - L.page.height) < 1e-6);
  }
});
test('a leaf lifts from its outer edge, crosses the spine and settles on the other page, both ways', () => {
  const n = 21, outer = n - 1;
  const at = (p, dir) => Array.from(math.leafAngles(p, dir, n));
  // At rest it lies flat on the page it leaves; it ends flat on the other one.
  assert.ok(at(0, 1).every(a => a === 0) && at(1, 1).every(a => Math.abs(a - Math.PI) < 1e-9));
  assert.ok(at(0, -1).every(a => Math.abs(a - Math.PI) < 1e-9) && at(1, -1).every(a => Math.abs(a) < 1e-9));
  // Early on the outer edge rises and curls toward the binding while the part at the spine stays down.
  const early = at(.12, 1);
  assert.ok(early[outer] > .9 && early[0] < .05, `outer edge lifts first (${early[outer].toFixed(2)}, ${early[0].toFixed(2)})`);
  // Midway the root has swung up and the free edge trails behind it (a curved leaf, not a flat card).
  const mid = at(.55, 1);
  assert.ok(mid[0] > 1 && mid[outer] < mid[0] - .3, 'free edge trails in a curve');
  // Backward is the mirror image.
  at(.3, 1).forEach((a, i) => assert.ok(Math.abs(at(.3, -1)[i] - (Math.PI - a)) < 1e-9));
  // The leaf never dips through the pages.
  for (let p = 0; p <= 1; p += .01) assert.ok(at(p, 1).every(a => a >= 0 && a <= Math.PI));
});
test('page turns move only the leaves: the book keeps its pose, and riffles stay short', () => {
  const L = book3d.bookLayout(390, 844, { top: 47, bottom: 34 });
  const rest = book3d.readingFrame(L, 0, 0, 0);
  assert.equal(rest.state.turns.length, 0);
  for (const t of [0, .3, .7, 1]) {
    const f = book3d.readingFrame(L, 0, t, -1, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(f.pose)), JSON.parse(JSON.stringify(rest.pose)), 'book pose unchanged while turning');
    assert.ok(f.state.turns.every(turn => turn.dir === -1));
  }
  // Leaves of a riffle start one after another and all land by the end.
  assert.deepEqual(Array.from(book3d.riffle(0, 3)), [0, 0, 0]);
  const mid = Array.from(book3d.riffle(.4, 3));
  assert.ok(mid[0] > mid[1] && mid[1] > mid[2]);
  assert.deepEqual(Array.from(book3d.riffle(1, 3)), [1, 1, 1]);
  // Which pages a jump lifts: at most three, the page being left first; backward, the target lands last.
  assert.deepEqual(Array.from(book3d.turnPages(3, 4)), [3]);
  assert.deepEqual(Array.from(book3d.turnPages(0, 3)), [0, 1, 2]);
  assert.deepEqual(Array.from(book3d.turnPages(0, 9)), [0, 4, 8]);
  assert.deepEqual(Array.from(book3d.turnPages(3, 2)), [2]);
  assert.deepEqual(Array.from(book3d.turnPages(9, 0)), [8, 4, 0]);
});
test('preview and reading arrangements never show their text at full strength together', () => {
  const L = book3d.bookLayout(390, 844, { top: 47, bottom: 34 });
  for (let lean = 0; lean <= 1.0001; lean += .01) {
    const f = book3d.readingFrame(L, lean, 0, 0);
    assert.ok(Math.min(f.previewMix, f.rightMix) < 1e-9, `both arrangements visible at lean ${lean.toFixed(2)}`);
  }
  assert.equal(book3d.readingFrame(L, 0, 0, 0).previewMix, 1);
  assert.equal(book3d.readingFrame(L, 1, 0, 0).rightMix, 1);
});
test('the reading arrangement reflows at a comfortable size and keeps every word of the entry', () => {
  const { readingMetrics, entryParts } = load('../../bookhouse/book3d/readingLayout');
  for (const [w, h] of [[340, 505], [374, 556], [414, 615], [544, 808]]) {
    const m = readingMetrics(w, h);
    assert.ok(m.body.size >= 16.5 && m.body.size <= 20 && m.body.line >= m.body.size * 1.5, `${w}: body ${m.body.size}/${m.body.line}`);
    assert.ok(w - m.padLeft - m.padRight >= 260, `${w}: measure`);
  }
  assert.deepEqual({ ...entryParts('Rainy thoughts\n\nThe rain kept tapping.') }, { title: 'Rainy thoughts', body: 'The rain kept tapping.' });
  assert.deepEqual({ ...entryParts('A slow morning with tea and the window open.') }, { title: 'A slow morning with tea and the window open.', body: '' });
  const long = 'Walked home the long way through the park and noticed how the golden light made everything feel softer today.';
  const parts = entryParts(long);
  assert.ok(parts.title.endsWith('…') && parts.title.length <= 61 && parts.body === long, 'a shortened title keeps the full text in the body');
  assert.deepEqual({ ...entryParts('  \n ') }, { title: '', body: '' });
});
test('date bookmarks follow diary order and keep same-day journals separate', () => {
  const { bookmarkLabels } = load('../../../services/bookhouse');
  const e = (id, localDate) => ({ id, localDate, createdAt: localDate, journal: { id, content: id }, emotionResult: null, flower: null });
  assert.deepEqual(Array.from(bookmarkLabels([e('a', '2026-10-16'), e('b', '2026-10-19'), e('c', '2026-10-19'), e('d', '2026-10-25')])),
    ['Oct 16', 'Oct 19 · 1', 'Oct 19 · 2', 'Oct 25']);
  assert.deepEqual(Array.from(bookmarkLabels([])), []);
});

// ---------- the writing desk ----------
const desk = load('../../bookhouse/book3d/desk');
const plain = v => JSON.parse(JSON.stringify(v));
const restFor = (width, height, top, bottom) => {
  // As bookhouse.tsx lays out the shelf at rest.
  const column = Math.min(width, 560), sceneHeight = Math.max(height, 640);
  const cabinetTop = top + 52 + 52, cabinetBottom = sceneHeight - bottom - 8 - 46 - 8;
  const scale = (cabinetBottom - cabinetTop) / (desk.SHELF.bottom - desk.SHELF.top);
  const width0 = Math.min(column, (desk.SHELF.x1 - desk.SHELF.x0) * scale);
  return { column, rest: { width: width0, cabinetTop, cabinetBottom, scale, sceneHeight } };
};
test('the camera pulls back from the shelf as one rigid picture: a single uniform scale, proportions kept', () => {
  for (const [width, height, top, bottom] of PHONES) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const { rest } = restFor(width, height, top, bottom);
    const g = desk.pullTarget(rest, width, L.deskEdge, 0);
    // At rest nothing moves; the desk waits below the frame.
    const start = desk.pullAt(0, g);
    assert.equal(start.k, 1);
    assert.ok(start.deskTop >= height - 1e-9, `${width}: desk hidden at rest`);
    assert.deepEqual(plain(desk.pullPoint(123, 456, start, g)), [123, 456]);
    // Any two points of the shelf keep their direction and their distance ratio: x and y scale by the same k.
    const pts = [[0, 0], [rest.width, 0], [rest.width * .3, rest.cabinetTop], [rest.width * .8, rest.cabinetBottom], [12, rest.sceneHeight]];
    for (let i = 1; i <= 100; i++) {
      const s = desk.pullAt(i / 100, g);
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
        const [ax, ay] = desk.pullPoint(...pts[a], s, g), [bx, by] = desk.pullPoint(...pts[b], s, g);
        const dx0 = pts[b][0] - pts[a][0], dy0 = pts[b][1] - pts[a][1];
        assert.ok(Math.abs((bx - ax) - dx0 * s.k) < 1e-9 && Math.abs((by - ay) - dy0 * s.k) < 1e-9, `${width}: uniform at ${i}`);
      }
    }
    // Pulled back: smaller, centred on the same top centre; the desk's back edge sits just above the journal's head,
    // and the desk's top edge covers the shelf's bottom edge all the way (no gap under the shelf).
    const end = desk.pullAt(1, g);
    assert.ok(end.k < 1 && end.k > .3, `${width}: pulled back to ${end.k}`);
    assert.ok(Math.abs(end.deskTop + desk.DESK_BAND * g.deskScale - L.deskEdge) < 1e-6, `${width}: desk edge`);
    let previous = start;
    for (let i = 1; i <= 1000; i++) {
      const s = desk.pullAt(i / 1000, g);
      assert.ok(s.deskTop <= rest.sceneHeight * s.k + 1e-9, `${width}: desk under the shelf at ${i}`);
      assert.ok(Math.abs(s.k - previous.k) < .005 && s.deskTop <= previous.deskTop + 1e-9, `${width}: continuous at ${i}`);
      previous = s;
    }
  }
});
test('the book leaves exactly the slot the receding shelf shows, without a jump', () => {
  const [width, height, top, bottom] = PHONES[1];
  const L = book3d.bookLayout(width, height, { top, bottom });
  const { rest } = restFor(width, height, top, bottom);
  const g = desk.pullTarget(rest, width, L.deskEdge, 0);
  const { origin } = shelfOrigin(width, height);
  const rootX = (width - rest.width) / 2;
  assert.deepEqual(plain(desk.pullOrigin(origin, desk.pullAt(0, g), g, rootX, 0)), plain(origin));
  // Mid-pull the slot is the rest slot under the same uniform scale.
  const mid = desk.pullAt(.5, g), moved = desk.pullOrigin(origin, mid, g, rootX, 0);
  assert.ok(Math.abs(moved.height - origin.height * mid.k) < 1e-9 && Math.abs(moved.cam.d - origin.cam.d * mid.k) < 1e-9);
  let previous = corners(book3d.openingFrame(0, origin, L));
  for (let i = 1; i <= 1000; i++) {
    const t = i / 1000, p = book3d.pullOf(t);
    const at = desk.pullOrigin(origin, p > 0 ? desk.pullAt(p, g) : null, g, rootX, 0);
    const now = corners(book3d.openingFrame(t, at, L));
    const jump = Math.max(...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])));
    assert.ok(jump < 14, `jump of ${jump.toFixed(1)}px at t=${t}`);
    previous = now;
  }
});
test('the scene switch names a known Treehouse layout, and the rejected room artwork stays off', () => {
  const scene = load('../../bookhouse/book3d/scene');
  assert.equal(typeof scene.ROOM_SCENE, 'boolean');
  assert.ok(['reference', 'portrait', 'composed', 'composed-v1', 'walls'].includes(scene.ROOM_LAYOUT));
  assert.equal(scene.ROOM_ARTWORK, false);
});
const composedFor = (width, height, top = 0, bottom = 0) => {
  const composed = load('../../bookhouse/book3d/composed');
  const L = book3d.bookLayout(width, height, { top, bottom });
  const column = Math.min(width, 560), sceneHeight = Math.max(height, 640);
  const cabinetTop = top + 52 + 52, cabinetBottom = sceneHeight - bottom - 8 - 46 - 8;
  const scale = (cabinetBottom - cabinetTop) / (desk.SHELF.bottom - desk.SHELF.top);
  const shelfWidth = Math.min(column, (desk.SHELF.x1 - desk.SHELF.x0) * scale);
  const { slices } = desk.compositeSlices(shelfWidth, scale);
  const rootX = (width - shelfWidth) / 2;
  const r = { width: shelfWidth, scale, cabinetTop, sceneHeight, rootX, slices };
  const title = { top: top + 52, safeTop: top + 52 };
  return { composed, L, r, title, rootX, g: composed.composedTarget(r, { width, height }, L.deskEdge, 0, title) };
};
test('composed scene: one uniform pull-back frames the sign, all four rows of books and the desk; the room and the desk fill the width', () => {
  for (const [width, height, top, bottom] of [[390, 844, 0, 0], [375, 812, 0, 0], [360, 800, 0, 0], [390, 844, 47, 34], [430, 932, 59, 34]]) {
    const { composed, L, r, title, g } = composedFor(width, height, top, bottom);
    const id = `${width}×${height}`;
    // At rest nothing moves; all the way, x and y scale by the same k.
    assert.deepEqual(plain(composed.composedPoint(10, 20, composed.composedAt(0, g), g)), [r.rootX + 10, 20]);
    for (let i = 1; i <= 50; i++) {
      const s = composed.composedAt(i / 50, g);
      const [ax, ay] = composed.composedPoint(0, 0, s, g), [bx, by] = composed.composedPoint(r.width, r.sceneHeight, s, g);
      assert.ok(Math.abs((bx - ax) - r.width * s.k) < 1e-9 && Math.abs((by - ay) - r.sceneHeight * s.k) < 1e-9, `${id}: uniform at ${i}`);
    }
    const end = composed.composedAt(1, g), f = r.scale * end.k;
    // The sign at safeTop (under the top controls); the bookcase's last plank resting on the desk's back edge, so every
    // row of books (Jan–Mar … Oct–Dec) stands between them.
    const [, sign] = composed.composedPoint(0, title.top, end, g);
    assert.ok(Math.abs(sign - title.safeTop) < 1e-6, `${id}: sign`);
    const rowY = row => composed.paintingRowY(row, end, g);
    assert.ok(Math.abs(rowY(composed.BOTTOM_ROW) - L.deskEdge) < 1e-6, `${id}: bottom plank on the desk`);
    assert.ok(rowY(desk.SHELF.rows[0].top) > sign + 50 * end.k - 2 && rowY(desk.SHELF.rows[3].base) < L.deskEdge, `${id}: four rows on screen`);
    // The shelf stays centred and substantial.
    const [x0] = composed.composedPoint(0, 0, end, g), [x1] = composed.composedPoint(r.width, 0, end, g);
    assert.ok(Math.abs(x0 + x1 - width) < 1e-6 && (x1 - x0) / width > .55, `${id}: shelf ${(x1 - x0).toFixed(0)} wide`);
    // Room: the painting and its side walls reach both edges of the window.
    assert.ok(x0 - composed.WALLS.left * f <= 0 && x1 + (1024 - g.xEnd) * f + (composed.WALLS.rightTo - 1024) * f >= width, `${id}: room covers the width`);
    // Desk: nearer, spanning the width (never smaller than the painting's own scale), its edge at deskEdge; it starts below
    // the window and never lets anything below the room's rows show on the way.
    const d1 = composed.composedDesk(end, g);
    // V2: at the painting's own scale and registration; with its boards carried on (DESK_CUT.pad) it reaches both edges.
    const pad = composed.DESK_CUT.pad * d1.scale;
    assert.ok(Math.abs(d1.scale - f / composed.CS.K) < 1e-9 && d1.x - pad <= 1e-6 && d1.x + d1.width * d1.scale + pad >= width - 1e-6 && Math.abs(d1.edge - L.deskEdge) < 1e-6, `${id}: desk`);
    // V1 (fallback): scaled up to span the window by itself.
    const g1 = composed.composedTarget(r, { width, height }, L.deskEdge, 0, title, 'v1'), v1 = composed.composedDesk(composed.composedAt(1, g1), g1);
    assert.ok(v1.x <= 1e-6 && v1.x + v1.width * v1.scale >= width - 1e-6, `${id}: v1 desk spans`);
    assert.ok(composed.composedDesk(composed.composedAt(1e-4, g), g).edge >= height, `${id}: desk below the window at first`);
    for (let i = 1; i <= 100; i++) {
      const s = composed.composedAt(i / 100, g);
      assert.ok(composed.composedDesk(s, g).edge <= composed.paintingRowY(composed.ROOM_ROWS, s, g) + 1e-9, `${id}: room never runs out at ${i}`);
    }
  }
});
test('portrait scene: the original bookshelf above (four rows, sign under the top controls), the desk and the whole journal below, within the portrait column', () => {
  for (const [width, height] of [[390, 844], [375, 812], [360, 800]]) {
    const { composed, L, r, title } = composedFor(width, height);
    const g = composed.composedTarget(r, { width, height }, L.deskEdge, 0, title, 'portrait');
    const end = composed.composedAt(1, g);
    const id = `${width}×${height}`;
    // One uniform scale; the shelf centred in the column, its sign under the top controls, its bottom plank on the desk.
    const [x0, sign] = composed.composedPoint(0, title.top, end, g), [x1] = composed.composedPoint(r.width, 0, end, g);
    assert.ok(Math.abs(x0 + x1 - width) < 1e-6 && Math.abs(sign - title.safeTop) < 1e-6, `${id}: shelf placed`);
    assert.ok(Math.abs(composed.paintingRowY(composed.BOTTOM_ROW, end, g) - L.deskEdge) < 1e-6, `${id}: four rows above the desk`);
    // The shelf takes roughly the upper half of the screen, the desk and journal the lower half.
    assert.ok(L.deskEdge / height > .5 && L.deskEdge / height < .7, `${id}: split at ${(L.deskEdge / height).toFixed(2)}`);
    // The desk at the painting's own scale reaches both edges of the column (with its own boards), and the whole journal,
    // its bookmarks and the date controls sit below the shelf, on screen.
    const d = composed.composedDesk(end, g), pad = composed.DESK_CUT.pad * d.scale;
    assert.ok(d.x - pad <= 0 && d.x + d.width * d.scale + pad >= width, `${id}: desk spans the column`);
    assert.ok(L.tabTop >= L.deskEdge + 12 && L.tabTop + L.tabHeight <= L.below && L.below + 56 <= height, `${id}: journal and controls`);
  }
});
test('portrait scene: the bookcase seen from the desk is as wide as the desk, at the same uniform scale, and its edges line up with the desk', () => {
  const shelfLayout = (column, cabinetTop, cabinetBottom, fill) => {
    // TreehouseShelf.shelfLayout's width rule (the composite itself is desk.compositeSlices).
    const scale = (cabinetBottom - cabinetTop) / (desk.SHELF.bottom - desk.SHELF.top);
    const width = fill ? Math.min(column, (desk.SHELF.x1 - desk.SHELF.x0) * scale) : null;
    return { scale, width, slices: desk.compositeSlices(width, scale).slices };
  };
  for (const [width, height] of [[390, 844], [375, 812], [360, 800]]) {
    const { composed, L, r, title } = composedFor(width, height);
    const g = composed.composedTarget(r, { width, height }, L.deskEdge, 0, title, 'portrait');
    const frame = composed.deskShelfFrame(g, { cabinetTop: r.cabinetTop, cabinetBottom: r.cabinetTop + (desk.SHELF.bottom - desk.SHELF.top) * r.scale, railBottom: height - 6 });
    const wide = shelfLayout(Math.min(width, 560), frame.cabinetTop, frame.cabinetBottom, true);
    const end = composed.composedAt(1, g);
    const id = `${width}×${height}`;
    // The same painting scale as the receding shelf once pulled back (no stretching: one scale for x and y).
    assert.ok(Math.abs(wide.scale - r.scale * end.k) < 1e-9, `${id}: same scale`);
    // As wide as the window's portrait column, centred: no dark gaps beside it.
    assert.ok(Math.abs(wide.width - Math.min(width, 560)) < 1e-6, `${id}: full width (${wide.width.toFixed(1)})`);
    g.deskShelf = { width: wide.width, scale: wide.scale, slices: wide.slices, x: (width - wide.width) / 2, ...frame };
    // The desk, cut to the same slices and at the painting's own scale, spans exactly the same edges.
    const d = composed.composedDesk(end, g);
    // (The desk is drawn clipped to the portrait column, so what shows spans the column, as the bookcase does.)
    const col = [(width - Math.min(width, 560)) / 2, (width + Math.min(width, 560)) / 2];
    assert.ok(Math.abs(d.x - g.deskShelf.x) < 1e-6 && d.x <= col[0] + 1e-6 && d.x + d.width * d.scale >= col[1] - 1e-6, `${id}: desk ${d.x.toFixed(1)}–${(d.x + d.width * d.scale).toFixed(1)}`);
    assert.ok(Math.abs(g.deskShelf.x - col[0]) < 1e-6 && Math.abs(g.deskShelf.x + wide.width - col[1]) < 1e-6, `${id}: bookcase spans the column`);
    // Its rows are the receding shelf's rows: the bottom plank on the desk's edge, the sign under the top controls.
    const rowY = row => frame.cabinetTop + (row - desk.SHELF.top) * wide.scale;
    assert.ok(Math.abs(rowY(composed.BOTTOM_ROW) - L.deskEdge) < 1e-6, `${id}: bottom plank on the desk`);
  }
});
test('switching months at the desk: a slot in the desk-view bookcase maps back to its place on the bookshelf, and the switch is quicker than the full pull-back', () => {
  for (const [width, height] of [[390, 844], [375, 812], [360, 800]]) {
    const { composed, L, r, title } = composedFor(width, height);
    for (const scrollY of [0, 37]) {
      const g = composed.composedTarget(r, { width, height }, L.deskEdge, scrollY, title, 'portrait');
      const end = composed.composedAt(1, g);
      const id = `${width}×${height} scroll ${scrollY}`;
      // A book's slot on the shelf at rest (window coordinates, with the shelf camera) …
      const rest = { x: r.rootX + 120, y: 260 - scrollY, width: 34, height: 118, camera: { cx: r.rootX + 150, cy: 330 - scrollY, d: 1900 } };
      // … where it is once pulled back (exactly as the book's opening computes it) …
      const o = composed.composedOrigin({ cam: rest.camera, x: rest.x + rest.width / 2, bottom: rest.y + rest.height, height: rest.height }, end, g, r.rootX, scrollY);
      const desk = { x: o.x - rest.width * end.k / 2, y: o.bottom - o.height, width: rest.width * end.k, height: o.height, camera: o.cam };
      // … and back: the book opened from the desk closes all the way into the same slot on the bookshelf.
      const back = composed.composedRestRect(desk, g);
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(back[key] - rest[key]) < 1e-6, `${id}: ${key} ${back[key]} vs ${rest[key]}`);
      for (const key of ['cx', 'cy', 'd']) assert.ok(Math.abs(back.camera[key] - rest.camera[key]) < 1e-6, `${id}: camera ${key}`);
    }
  }
  assert.ok(book3d.DESK_OPEN_MS < book3d.OPEN_MS && book3d.DESK_CLOSE_MS < book3d.CLOSE_MS);
});
test('close up, a swipe pans the book sideways from one page to the other: each live page lies on its 3D page all the way across', () => {
  for (const [width, height] of [[390, 844], [375, 812], [360, 800]]) {
    const L = book3d.bookLayout(width, height, { top: 0, bottom: 0 });
    const id = `${width}×${height}`;
    // At rest on either page, that page's live page lies exactly on L.page (the existing close-ups, unchanged).
    const [rdx, rdy] = book3d.focusOffsets(L, 1), left = book3d.focusOffsets(L, -1);
    assert.ok(Math.abs(rdx) < 1e-6 && Math.abs(rdy) < 1e-6 && Math.abs(left[2]) < 1e-6 && Math.abs(left[3]) < 1e-6, `${id}: rest`);
    assert.deepEqual(book3d.focusPose(L, 1), L.lean); assert.deepEqual(book3d.focusPose(L, -1), L.leanLeft);
    // Panning moves both pages steadily sideways together (no vertical drift, never back), one page width apart, and the
    // page off to the side lies past the screen's edge on a phone.
    // (Toward the journal page the book slides left: both pages' offsets only ever decrease.)
    let prevR = Infinity, prevL = Infinity;
    for (let k = 0; k <= 40; k++) {
      const side = -1 + k / 20, o = book3d.focusOffsets(L, side);
      assert.ok(o[0] <= prevR + 1e-9 && o[2] <= prevL + 1e-9, `${id}: monotone`); prevR = o[0]; prevL = o[2];
      assert.ok(Math.abs(o[1]) < 3 && Math.abs(o[3]) < 3, `${id}: level (${o[1].toFixed(2)}, ${o[3].toFixed(2)})`);
      const gap = o[0] - o[2];
      assert.ok(gap > L.page.width && gap < L.page.width * 1.15, `${id}: one page apart (${gap.toFixed(1)})`);
    }
    assert.ok(L.page.x + book3d.focusOffsets(L, -1)[0] >= width - 12, `${id}: the journal page waits off the right edge`);
    assert.ok(L.page.x + L.page.width + book3d.focusOffsets(L, 1)[2] <= 12, `${id}: the records page waits off the left edge`);
    // The reading frame at full lean is the pan pose itself (the same picture the live pages follow).
    const f = book3d.readingFrame(L, 1, 0, 0, 1, .3);
    assert.deepEqual(f.pose, book3d.focusPose(L, .3));
  }
});
test('a tap off the open book closes it: the book, its bookmarks and its date controls never count as off the book', () => {
  for (const [width, height] of [[390, 844], [375, 812], [360, 800]]) {
    const L = book3d.bookLayout(width, height, { top: 0, bottom: 0 }, 0, Infinity, 46);
    const id = `${width}×${height}`;
    const zone = (x, y) => book3d.inOpenBookZone(L, x, y);
    // On the pages, the spine, the bookmarks and the controls row: never closes.
    assert.ok(zone(L.page.x + 20, L.deskEdge + 60) && zone(width / 2 - 20, (L.deskEdge + L.below) / 2), `${id}: the book`);
    assert.ok(zone(L.tabLeft + 10, L.tabTop + 10), `${id}: bookmarks`);
    assert.ok(zone(width / 2, L.below + 30), `${id}: date controls`);
    // The desk under the controls and the bookcase above the book: a tap there closes it.
    assert.ok(!zone(width / 2, height - 8) && !zone(width / 2, L.deskEdge - 30) && !zone(width * .8, 120), `${id}: desk and bookcase`);
  }
});
test('book timing: each stage takes its target time, the time curves are smooth and monotone, and a switch at the desk takes about 1.2–1.6 s', () => {
  const { OPEN_STAGES: o, CLOSE_STAGES: c, STAGE_T } = book3d;
  const within = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what}: ${v} ms`);
  within(o.extract, 350, 450, 'extraction from the shelf');
  within(o.fly + o.land, 400, 500, 'flying to the desk');
  within(o.open, 350, 450, 'opening on the desk');
  within(c.settle + c.close, 300, 400, 'closing');
  within(c.lift + c.fly + c.slot, 400, 500, 'returning to the shelf');
  const curves = [
    [book3d.openTiming(o), [0, o.extract, o.fly, o.land, o.open, o.settle], STAGE_T],
    [book3d.closeTiming(c), [0, c.settle, c.close, c.lift, c.fly, c.slot], [...STAGE_T].reverse().map(t => 1 - t)],
    [book3d.openTiming(book3d.DESK_OPEN_STAGES), [0, ...Object.values(book3d.DESK_OPEN_STAGES)], STAGE_T],
    [book3d.closeTiming(book3d.DESK_CLOSE_STAGES), [0, ...Object.values(book3d.DESK_CLOSE_STAGES)], [...STAGE_T].reverse().map(t => 1 - t)],
  ];
  for (const [f, stages, ts] of curves) {
    const total = stages.reduce((a, b) => a + b, 0);
    // Each stage boundary of the book's path is reached exactly at its time.
    let at = 0;
    stages.forEach((ms, i) => { at += ms; assert.ok(Math.abs(f(at / total) - ts[i]) < 1e-9, `stage ${i}`); });
    // Monotone (never backs up), within 0..1, and its speed changes smoothly (no jump between stages).
    let prev = f(0), prevSpeed = null, maxJump = 0;
    const N = 4000;
    for (let k = 1; k <= N; k++) {
      const v = f(k / N);
      assert.ok(v >= prev - 1e-12 && v >= -1e-9 && v <= 1 + 1e-9, 'monotone in range');
      const speed = (v - prev) * N;
      if (prevSpeed !== null) maxJump = Math.max(maxJump, Math.abs(speed - prevSpeed));
      prev = v; prevSpeed = speed;
    }
    assert.ok(maxJump < .05, `speed continuous (largest step ${maxJump.toFixed(4)})`);
  }
  // A switch at the desk: the open book closes; the chosen one starts out once that one is nearly home (DESK_HANDOFF_T).
  const close = book3d.closeTiming(book3d.DESK_CLOSE_STAGES);
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (1 - close(mid) > book3d.DESK_HANDOFF_T) lo = mid; else hi = mid; }
  const handoff = hi * book3d.DESK_CLOSE_MS;
  within(Math.round(handoff + book3d.DESK_OPEN_MS), 1200, 1600, 'switch at the desk');
  // The two books overlap only briefly (the closed one sliding home as the next slides out of a different slot).
  within(Math.round(book3d.DESK_CLOSE_MS - handoff), 60, 250, 'overlap');
});
test('illustrated scene: the live bookcase covers exactly the illustration\'s, at one uniform scale; its desk holds the journal and its date controls', () => {
  const composed = load('../../bookhouse/book3d/composed');
  for (const [width, height] of [[390, 844], [375, 812], [360, 800], [768, 1024], [1200, 800]]) {
    const top = 0, bottom = 0, column = Math.min(width, 560), sceneHeight = Math.max(height, 640);
    const cabinetTop = top + 104, cabinetBottom = sceneHeight - bottom - 62;
    const scale = (cabinetBottom - cabinetTop) / (desk.SHELF.bottom - desk.SHELF.top);
    const shelfWidth = Math.min(column, (desk.SHELF.x1 - desk.SHELF.x0) * scale);
    const rest = { width: shelfWidth, scale, cabinetTop, sceneHeight, rootX: (width - shelfWidth) / 2, slices: desk.compositeSlices(shelfWidth, scale).slices };
    const title = { top: top + 52, safeTop: top + 52 };
    const c = composed.referenceColumn({ width, height }, { top, bottom }, rest, title);
    const L = book3d.bookLayout(width, height, { top, bottom }, 0, c, composed.PORTRAIT_FOOTER);
    const g = composed.composedTarget(rest, { width, height }, L.deskEdge - composed.REF.room, 0, title, 'reference');
    const id = `${width}×${height}`;
    const sr = composed.referenceScale(g), end = composed.composedAt(1, g);
    const art = composed.referenceAt(end, g);
    // The illustration's bookcase lies exactly where the live one is: centred, as wide, its desk edge under the last plank.
    const W = composed.referenceShelfWidth(g);
    assert.ok(Math.abs(art.x + composed.REF.shelfX0 * art.k - (width - W) / 2) < 1e-6, `${id}: left edge`);
    assert.ok(Math.abs(art.y + composed.REF.edge * art.k - g.deskEdge) < 1e-6, `${id}: desk edge`);
    assert.ok(Math.abs(art.k - sr) < 1e-9, `${id}: art scale`);
    // One uniform scale for the live shelf (no stretching), and the shelf's last plank (REF.bottomRow) on the desk edge.
    const rowY = row => composed.composedPoint(0, cabinetTop + (row - desk.SHELF.top) * scale, end, g)[1];
    assert.ok(Math.abs(rowY(composed.REF.bottomRow) - g.deskEdge) < 1e-6, `${id}: plank on the desk`);
    // The desk band above the journal (its quill, ink and teacup), the journal and its date controls on the desk, and the
    // art reaching the bottom of the window.
    assert.ok(Math.abs(L.deskEdge - composed.REF.room - g.deskEdge) < 1e-9, `${id}: desk band`);
    const front = art.y + composed.REF.front * art.k;
    if (width < 700) assert.ok(front >= L.below + 8 + 44 - 1, `${id}: the desk's front edge (${front.toFixed(0)}) below the controls (${(L.below + 52).toFixed(0)})`);
    assert.ok(art.y + composed.REF.height * art.k >= height - 1, `${id}: the art reaches the bottom`);
    // The journal lies on the illustrated desk, with a little of it beside the journal.
    assert.ok(composed.REF.width * art.k >= Math.min(width, c + 48) - .01, `${id}: desk spans the journal`);
    // The phone's shelf scale (about 85% of the plain portrait scene's): the books are smaller but every row is there.
    if (width === 390) {
      const pc = composed.portraitColumn({ width, height }, { top, bottom }, rest, title);
      const Lp = book3d.bookLayout(width, height, { top, bottom }, 0, pc, composed.PORTRAIT_FOOTER);
      const gp = composed.composedTarget(rest, { width, height }, Lp.deskEdge, 0, title, 'portrait');
      const ratio = g.k1 / gp.k1;
      assert.ok(ratio > .8 && ratio < .9, `${id}: shelf scale ${ratio.toFixed(3)} of the plain scene`);
    }
  }
});
test('portrait scene on any window: the bookcase, the desk and the journal share one column the bookcase fills (no gaps beside it)', () => {
  const composed = load('../../bookhouse/book3d/composed');
  for (const [width, height] of [[360, 800], [375, 812], [390, 844], [430, 932], [744, 837], [768, 1024], [1200, 800], [1400, 900]]) {
    const top = 0, bottom = 0, column = Math.min(width, 560), sceneHeight = Math.max(height, 640);
    const cabinetTop = top + 104, cabinetBottom = sceneHeight - bottom - 62;
    const scale = (cabinetBottom - cabinetTop) / (desk.SHELF.bottom - desk.SHELF.top);
    const shelfWidth = Math.min(column, (desk.SHELF.x1 - desk.SHELF.x0) * scale);
    const rest = { width: shelfWidth, scale, cabinetTop, sceneHeight, rootX: (width - shelfWidth) / 2, slices: desk.compositeSlices(shelfWidth, scale).slices };
    const title = { top: top + 52, safeTop: top + 52 };
    const c = composed.portraitColumn({ width, height }, { top, bottom }, rest, title);
    const L = book3d.bookLayout(width, height, { top, bottom }, 0, c, composed.PORTRAIT_FOOTER);
    const g = composed.composedTarget(rest, { width, height }, L.deskEdge, 0, title, 'portrait');
    const painting = (desk.SHELF.x1 - desk.SHELF.x0) * scale * g.k1;
    const id = `${width}×${height}`;
    // The bookcase (the painting at its pulled-back scale) is at least as wide as the column: it fills it.
    assert.ok(painting >= c - .5 && c <= column, `${id}: column ${c}, bookcase ${painting.toFixed(1)}`);
    // Phones use their whole width; nothing narrower than needed.
    if (width <= 430) assert.equal(c, column, `${id}: full width`);
    else assert.ok(c === column || painting - c < 6, `${id}: as wide as the bookcase allows (${c} of ${painting.toFixed(1)})`);
    // The journal lies in that column, and everything still fits the screen.
    const spread = corners(book3d.readingFrame(L, 0, 0, 0));
    const xs = spread.map(q => q[0]);
    assert.ok(Math.min(...xs) >= (width - c) / 2 - 1 && L.tabLeft + 30 <= (width + c) / 2 + 30 && L.below + 60 + 38 <= height, `${id}: journal, date controls and Flower History on screen`);
  }
});
test('composed scene: the title, the top row, the whole open journal, its bookmarks and the date controls fit one screen together', () => {
  const composed = load('../../bookhouse/book3d/composed');
  const sizes = [];
  for (const width of [360, 375, 390, 430, 555, 700, 744, 900, 1200]) for (const height of [600, 625, 700, 800, 812, 837, 844, 932, 1024, 1400]) sizes.push([width, height]);
  for (const [width, height] of sizes) for (const [top, bottom] of [[0, 0], [47, 34]]) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const column = Math.min(width, 560), sceneHeight = Math.max(height, 640);
    const cabinetTop = top + 52 + 52, cabinetBottom = sceneHeight - bottom - 8 - 46 - 8;
    const scale = (cabinetBottom - cabinetTop) / (desk.SHELF.bottom - desk.SHELF.top);
    const shelfWidth = Math.min(column, (desk.SHELF.x1 - desk.SHELF.x0) * scale);
    const { slices } = desk.compositeSlices(shelfWidth, scale);
    const title = { top: top + 52, safeTop: top + 52 };
    const g = composed.composedTarget({ width: shelfWidth, scale, cabinetTop, sceneHeight, rootX: (width - shelfWidth) / 2, slices }, { width, height }, L.deskEdge, 0, title);
    const end = composed.composedAt(1, g);
    const id = `${width}×${height} (insets ${top}/${bottom})`;
    // All four rows of books stand above the desk's back edge.
    assert.ok(composed.paintingRowY(desk.SHELF.rows[3].base, end, g) <= L.deskEdge + 1e-6, `${id}: fourth row above the desk`);
    // Top: the title sign (50 tall) below the safe area, and the first row of books below it.
    const [, signTop] = composed.composedPoint(0, title.top, end, g);
    assert.ok(signTop >= title.safeTop - 1e-6, `${id}: title at ${signTop.toFixed(1)}`);
    assert.ok(composed.paintingRowY(desk.SHELF.rows[0].top, end, g) >= signTop + 50 * end.k - 2, `${id}: first row at ${composed.paintingRowY(desk.SHELF.rows[0].top, end, g).toFixed(1)}, sign ${signTop.toFixed(1)}–${(signTop + 50 * end.k).toFixed(1)}`);
    // Bottom: the whole open journal (its outline, covers and page block), then the controls row (48 tall at below + 8).
    const spread = corners(book3d.readingFrame(L, 0, 0, 0));
    assert.ok(Math.min(...spread.map(q => q[1])) >= L.deskEdge && L.below <= height - bottom, `${id}: journal on screen`);
    assert.ok(L.below + 8 + 48 <= height - bottom, `${id}: controls at ${(L.below + 56).toFixed(0)} of ${height - bottom}`);
    // The bookmarks inside the book's height; the journal below the shelf's top row.
    assert.ok(L.tabTop >= L.deskEdge + 12 && L.tabTop + L.tabHeight <= L.below, `${id}: bookmarks within the book`);
    assert.ok(L.deskEdge > signTop + 50 * end.k, `${id}: journal below the title`);
  }
});
test('composed scene: the book leaves exactly the slot the receding shelf shows, without a jump', () => {
  const composed = load('../../bookhouse/book3d/composed');
  const [width, height, top, bottom] = PHONES[1];
  const L = book3d.bookLayout(width, height, { top, bottom });
  const { rest } = restFor(width, height, top, bottom);
  const { slices } = desk.compositeSlices(rest.width, rest.scale);
  const rootX = (width - rest.width) / 2;
  const g = composed.composedTarget({ width: rest.width, scale: rest.scale, cabinetTop: rest.cabinetTop, sceneHeight: rest.sceneHeight, rootX, slices }, { width, height }, L.deskEdge, 0, { top: top + 52, safeTop: top + 52 });
  const { origin } = shelfOrigin(width, height);
  assert.deepEqual(plain(composed.composedOrigin(origin, composed.composedAt(0, g), g, rootX, 0)), plain(origin));
  let previous = corners(book3d.openingFrame(0, origin, L));
  for (let i = 1; i <= 1000; i++) {
    const t = i / 1000, p = book3d.pullOf(t);
    const at = composed.composedOrigin(origin, p > 0 ? composed.composedAt(p, g) : null, g, rootX, 0);
    const now = corners(book3d.openingFrame(t, at, L));
    const jump = Math.max(...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])));
    assert.ok(jump < 14, `jump of ${jump.toFixed(1)}px at t=${t}`);
    previous = now;
  }
});
test('the Treehouse walls continue the shelf painting at its own scale, joined to both of its ends', () => {
  const walls = load('../../bookhouse/book3d/walls');
  for (const [width, height, top, bottom] of PHONES) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const { rest } = restFor(width, height, top, bottom);
    const g0 = desk.pullTarget(rest, width, L.deskEdge, 0);
    const { slices } = desk.compositeSlices(rest.width, rest.scale);
    const xEnd = walls.compositeEnd({ scale: rest.scale, width: rest.width, slices });
    // Phones show the painting up to its shelf's right end (SHELF.x1): the right wall begins with what lies beyond.
    assert.ok(Math.abs(xEnd - desk.SHELF.x1) < 1e-6, `${width}: composite ends at ${xEnd}`);
    const rootX = (width - rest.width) / 2;
    const g = { ...g0, rest: { width: rest.width, scale: rest.scale, cabinetTop: rest.cabinetTop, rootX, xEnd } };
    for (const p of [.05, .3, .6, 1]) {
      const s = desk.pullAt(p, g), w = walls.wallRects(s, g);
      const [lx, ly] = desk.pullPoint(0, rest.cabinetTop - desk.SHELF.top * rest.scale, s, g), [rx] = desk.pullPoint(rest.width, 0, s, g);
      // Joined edge to edge, on the painting's own rows, at the shelf's painting scale × k (one uniform scale).
      assert.ok(Math.abs(w.left.x + w.left.width - (lx + rootX)) < 1e-9 && Math.abs(w.right.x - (rx + rootX)) < 1e-9, `${width}: joined at ${p}`);
      assert.ok(Math.abs(w.left.y - ly) < 1e-9 && Math.abs(w.right.y - ly) < 1e-9, `${width}: same rows at ${p}`);
      assert.ok(Math.abs(w.f - rest.scale * s.k) < 1e-12, `${width}: scale at ${p}`);
      assert.ok(Math.abs(w.left.width / w.left.height - walls.WALLS.left.width / walls.WALLS.height) < 1e-9, `${width}: left wall not stretched`);
      assert.ok(Math.abs(w.right.width / w.right.height - (walls.WALLS.right.width - w.skip) / walls.WALLS.height) < 1e-9, `${width}: right wall not stretched`);
    }
    // Pulled back on a phone, the walls reach the window's edges on both sides, from its top down to the desk.
    // (Tablets show more room than the painting holds: beyond the walls the existing softened backdrop remains.)
    const end = desk.pullAt(1, g), w = walls.wallRects(end, g);
    if (width < 500) assert.ok(w.left.x <= 0 && w.right.x + w.right.width >= width, `${width}: walls reach the edges (${w.left.x}, ${w.right.x + w.right.width})`);
    assert.ok(w.left.y <= 0 && w.left.y + w.left.height >= end.deskTop + 20, `${width}: walls span top to desk`);
  }
});
test('the desk is nearer than the shelf: during the pull-back it shrinks a little more, by one uniform scale, and arrives at exactly its own size', () => {
  const walls = load('../../bookhouse/book3d/walls');
  for (const [width, height, top, bottom] of PHONES) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const { rest } = restFor(width, height, top, bottom);
    const g = desk.pullTarget(rest, width, L.deskEdge, 0);
    assert.equal(desk.deskParallax(desk.pullAt(1, g), g, walls.DESK_DEPTH), 1, `${width}: exact size once pulled back`);
    assert.equal(desk.deskParallax(desk.pullAt(.4, g), g, 0), 1, `${width}: no parallax in the painted scene`);
    let previous = Infinity;
    for (let i = 1; i <= 100; i++) {
      const m = desk.deskParallax(desk.pullAt(i / 100, g), g, walls.DESK_DEPTH);
      assert.ok(m >= 1 && m <= 1 + walls.DESK_DEPTH + 1e-9 && m <= previous + 1e-12, `${width}: shrinking smoothly at ${i}`);
      previous = m;
    }
  }
});
test('the book lands: its shadow follows it down (lift 1 in the air, 0 on the desk) and stays grounded while reading', () => {
  const [width, height, top, bottom] = PHONES[1];
  const L = book3d.bookLayout(width, height, { top, bottom });
  const { origin } = shelfOrigin(width, height);
  let previous = 1;
  for (let i = 0; i <= 100; i++) {
    const f = book3d.openingFrame(i / 100, origin, L);
    assert.ok(f.lift >= 0 && f.lift <= 1 && f.lift <= previous + 1e-12, `lift never rises again (${i})`);
    previous = f.lift;
  }
  assert.equal(book3d.openingFrame(.3, origin, L).lift, 1);
  assert.equal(book3d.openingFrame(1, origin, L).lift, 0);
  assert.equal(book3d.readingFrame(L, .5, 0, 0).lift, 0);
});
// ---------- the room scene (assets/bookhouse/room; kept for replacement artwork) ----------
const room = load('../../bookhouse/book3d/roomDesk');
const geometryFor = (width, height, top, bottom) => {
  const L = book3d.bookLayout(width, height, { top, bottom });
  const { rest } = restFor(width, height, top, bottom);
  return { L, rest, g: room.pullTarget(rest, { width, height }, L.deskEdge + 12, top, 0) };
};
test('room scene (disabled until matched artwork): the camera pulls back from the shelf as one rigid picture: a single uniform scale, proportions kept', () => {
  for (const [width, height, top, bottom] of PHONES) {
    const { rest, g } = geometryFor(width, height, top, bottom);
    // At rest nothing moves, and the desk waits below the frame.
    const start = room.pullAt(0, g);
    assert.equal(start.k, 1); assert.equal(start.ty, 0); assert.equal(start.rise, 0);
    assert.deepEqual(plain(room.pullPoint(123, 456, start, g)), [123, 456]);
    // Any two points of the shelf keep their direction and their distance ratio: x and y scale by the same k.
    const pts = [[0, 0], [rest.width, 0], [rest.width * .3, rest.cabinetTop], [rest.width * .8, rest.cabinetBottom], [12, rest.sceneHeight]];
    for (let i = 1; i <= 100; i++) {
      const s = room.pullAt(i / 100, g);
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
        const [ax, ay] = room.pullPoint(...pts[a], s, g), [bx, by] = room.pullPoint(...pts[b], s, g);
        const dx0 = pts[b][0] - pts[a][0], dy0 = pts[b][1] - pts[a][1];
        assert.ok(Math.abs((bx - ax) - dx0 * s.k) < 1e-9 && Math.abs((by - ay) - dy0 * s.k) < 1e-9, `${width}: uniform at ${i}`);
      }
    }
    const end = room.pullAt(1, g);
    assert.ok(end.k < 1 && end.k > .3, `${width}: pulled back to ${end.k}`);
    // The bookcase's foot stands just behind the desk's top edge; it stays centred.
    const [, foot] = room.pullPoint(0, g.bookcase.bottom, end, g);
    assert.ok(Math.abs(foot - (g.deskEdge + 8)) < 1e-6, `${width}: foot ${foot} vs desk ${g.deskEdge}`);
    let previous = start;
    for (let i = 1; i <= 1000; i++) {
      const s = room.pullAt(i / 1000, g);
      assert.ok(Math.abs(s.k - previous.k) < .005 && Math.abs(s.ty - previous.ty) < 2 && s.rise >= previous.rise, `${width}: continuous at ${i}`);
      previous = s;
    }
  }
});
test('room scene (disabled until matched artwork): the room layers share one uniform canvas scale with the shelf; the frame sweeps in from beyond the screen', () => {
  for (const [width, height, top, bottom] of PHONES) {
    const { g } = geometryFor(width, height, top, bottom);
    const { ROOM } = room;
    // Pulled back, the frame lies exactly on the back wall (same mapping), and the canvas covers the window's width.
    const end = room.pullAt(1, g);
    const back = room.roomMapping(end, g), front = room.roomMapping(end, g, 2.6);
    for (const key of ['c', 'ox', 'oy']) assert.ok(Math.abs(back[key] - front[key]) < 1e-9, `${width}: ${key}`);
    assert.ok(back.ox <= 1e-9 && back.ox + ROOM.width * back.c >= width - 1e-9 && back.oy <= 1e-9, `${width}: room covers the width`);
    // Throughout, the back wall stays registered to the shelf: a shelf point and its room point move together.
    for (let i = 1; i <= 50; i++) {
      const s = room.pullAt(i / 50, g), m = room.roomMapping(s, g);
      const [sx, sy] = room.pullPoint(g.ax + 40, g.bookcase.top, s, g);
      const m1 = room.roomMapping(end, g);
      const [ex, ey] = room.pullPoint(g.ax + 40, g.bookcase.top, end, g);
      // The same room point (under the shelf point at the end) is under it now.
      const qx = (ex + g.rootX - m1.ox) / m1.c, qy = (ey - g.scrollY - m1.oy) / m1.c;
      assert.ok(Math.abs(m.ox + qx * m.c - (sx + g.rootX)) < 1e-6 && Math.abs(m.oy + qy * m.c - (sy - g.scrollY)) < 1e-6, `${width}: registered at ${i}`);
    }
    // At rest the frame's opening (canvas x 340–1776, below y 480) contains the whole window: none of it shows yet.
    const f0 = room.roomMapping(room.pullAt(1e-6, g), g, 2.6);
    assert.ok(f0.ox + 340 * f0.c <= 0 && f0.ox + 1776 * f0.c >= width && f0.oy + 480 * f0.c <= 0 && f0.oy + 2400 * f0.c >= height, `${width}: frame off screen at rest`);
    // The title sign and the first year label sit below the frame's hanging wisteria.
    const [, signY] = room.pullPoint(0, g.bookcase.top, end, g);
    assert.ok(signY - g.scrollY >= 232 * back.c + back.oy, `${width}: title sign clear`);
    // The desk covers the window's bottom, and starts below it.
    assert.ok(g.desk.oy + ROOM.height * g.desk.c >= height - 1e-6, `${width}: desk reaches the bottom`);
    assert.ok(g.desk.oy + g.deskDrop + ROOM.deskProps * g.desk.c >= height, `${width}: desk starts below the window`);
  }
});
test('room scene (disabled until matched artwork): the book leaves exactly the slot the receding shelf shows, without a jump', () => {
  const [width, height, top, bottom] = PHONES[1];
  const { L, rest, g } = geometryFor(width, height, top, bottom);
  const { origin } = shelfOrigin(width, height);
  const rootX = (width - rest.width) / 2;
  assert.deepEqual(plain(room.pullOrigin(origin, room.pullAt(0, g), g, rootX, 0)), plain(origin));
  // Mid-pull the slot is the rest slot under the same uniform scale.
  const mid = room.pullAt(.5, g), moved = room.pullOrigin(origin, mid, g, rootX, 0);
  assert.ok(Math.abs(moved.height - origin.height * mid.k) < 1e-9 && Math.abs(moved.cam.d - origin.cam.d * mid.k) < 1e-9);
  let previous = corners(book3d.openingFrame(0, origin, L));
  for (let i = 1; i <= 1000; i++) {
    const t = i / 1000, p = book3d.pullOf(t);
    const at = room.pullOrigin(origin, p > 0 ? room.pullAt(p, g) : null, g, rootX, 0);
    const now = corners(book3d.openingFrame(t, at, L));
    const jump = Math.max(...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])));
    assert.ok(jump < 14, `jump of ${jump.toFixed(1)}px at t=${t}`);
    previous = now;
  }
});
test('either page brought close lies flat on the same on-screen rectangle', () => {
  const { W, H, over, gap } = math.SPEC;
  for (const [width, height, top, bottom] of PHONES) {
    const L = book3d.bookLayout(width, height, { top, bottom });
    const f = book3d.readingFrame(L, 1, 0, 0, 1, -1);
    // The left page lies on the front board, turned over the spine: book space through the slab.
    const state = { ...f.state };
    const slab = math.mul(math.poseMatrix(f.pose), math.slabMatrix(state));
    const zh = math.hingeZ(state);
    const tl = math.project(f.cam, math.apply(slab, [W - over, over, zh])), br = math.project(f.cam, math.apply(slab, [gap, H - over, zh]));
    assert.ok(Math.abs(tl[0] - L.page.x) < 1e-6 && Math.abs(tl[1] - L.page.y) < 1e-6, `${width}: left page top-left ${tl}`);
    assert.ok(Math.abs(br[0] - L.page.x - L.page.width) < 1e-6 && Math.abs(br[1] - L.page.y - L.page.height) < 1e-6, `${width}: left page bottom-right ${br}`);
  }
});
test('a month\'s days: journals, Daily Grow check-ins and Events by their stored local date, plus today; nothing in the future', () => {
  const { monthDays, dayRecords, moodTitle } = load('../../../services/bookhouse');
  const journals = [entry('j1', '2026-10-16', 'Walked home.'), entry('j2', '2026-10-16', 'And again.'), entry('j3', '2026-09-30', 'Other month.'),
    entry('j4', '2026-10-19', 'Daily Grow words', { journal: { id: 'j4', content: 'Daily Grow words', locked: true },
      emotionResult: { label: 'QUIET_BLOOM', secondaryEmotions: ['tender'] }, flower: { id: 'f4', name: 'Bluebell', speciesCode: 'BLUEBELL', img: '', mood: 'QUIET_BLOOM', meaning: 'Constancy' } })];
  const checkIns = [{ id: 'c4', localDate: '2026-10-19', journal: { id: 'j4', content: 'Daily Grow words' }, emotionResult: { label: 'QUIET_BLOOM', secondaryEmotions: ['tender'] },
      flower: { id: 'f4', name: 'Bluebell', speciesCode: 'BLUEBELL', img: '', mood: 'QUIET_BLOOM', meaning: 'Constancy' } },
    { id: 'c7', localDate: '2026-10-21', journal: null, emotionResult: { label: 'SUNNY_BLOOM', secondaryEmotions: ['calm'] }, flower: { id: 'f7', name: 'Sunflower', speciesCode: 'SUNFLOWER', img: '', mood: 'SUNNY_BLOOM' } },
    { id: 'c9', localDate: '2026-11-02', journal: null, emotionResult: null, flower: null }];
  const events = [{ id: 'e1', localDate: '2026-10-21', occurredAt: '2026-10-22T02:00:00Z', content: ' Planted a marigold. ', primaryGardenMood: 'SUNNY_BLOOM', secondaryEmotions: ['hopeful'], flower: null },
    { id: 'e2', localDate: '2026-10-29', occurredAt: '2026-10-29T10:00:00Z', content: 'Tomorrow?', primaryGardenMood: null, secondaryEmotions: null, flower: null }];
  const days = monthDays(2026, 10, journals, checkIns, events, '2026-10-28');
  assert.deepEqual(plain(days.map(d => d.localDate)), ['2026-10-16', '2026-10-19', '2026-10-21', '2026-10-28']);
  // Several journals on one day stay separate, oldest first, on one spread.
  assert.deepEqual(plain(days[0].journals.map(j => j.id)), ['j1', 'j2']);
  // A day with Daily Grow records but no journal is still a page; today is always there to write on.
  assert.equal(days[2].journals.length, 0); assert.equal(days[3].journals.length + days[3].checkIns.length + days[3].events.length, 0);
  // The Event's UTC timestamp (already the 22nd) does not move it: its stored local date decides.
  assert.deepEqual(plain(days[2].events.map(e => e.id)), ['e1']);
  const grown = dayRecords(days[1]);
  assert.deepEqual(plain(grown.flowers.map(f => [f.name, f.source])), [['Bluebell', 'Daily Grow']], 'one flower, not counted twice');
  assert.deepEqual(plain(grown.moods.map(m => m.label)), ['QUIET_BLOOM']);
  const mixed = dayRecords(days[2]);
  assert.deepEqual(plain(mixed.flowers.map(f => f.name)), ['Sunflower']);
  assert.deepEqual(plain(mixed.events), ['Planted a marigold.']);
  assert.deepEqual(plain(mixed.moods.map(m => [m.label, m.source])), [['SUNNY_BLOOM', 'Daily Grow'], ['SUNNY_BLOOM', 'Event']]);
  // A plain journal day records nothing it did not have.
  assert.deepEqual(plain(dayRecords(days[0])), { flowers: [], events: [], moods: [] });
  assert.equal(moodTitle('PEACEFUL_BLOOM'), 'Peaceful bloom'); assert.equal(moodTitle('calm'), 'Calm');
  // Stored JSON that is not a list of text labels (older rows) is left out rather than breaking the page.
  const odd = dayRecords({ localDate: '2026-10-21', journals: [], events: [{ id: 'e', localDate: '2026-10-21', content: 'x', primaryGardenMood: 'CALM_BLOOM', secondaryEmotions: { a: 1 }, flower: null }],
    checkIns: [{ id: 'c', localDate: '2026-10-21', journal: null, emotionResult: { label: 'SUNNY_BLOOM', secondaryEmotions: [{ label: 'calm' }, 'grateful', null] }, flower: null }] });
  assert.deepEqual(plain(odd.moods.map(m => m.secondary)), [['grateful'], []]);
  assert.equal(moodTitle(undefined), '');
  // A past month has no today page; a month with nothing is empty.
  assert.deepEqual(plain(monthDays(2026, 2, journals, checkIns, events, '2026-10-28')), []);
});
test('a journal\'s title and body round-trip through the stored text without losing words', () => {
  const { splitJournal, joinJournal } = load('../../bookhouse/book3d/readingLayout');
  const cases = ['Rainy thoughts\n\nThe rain kept tapping.\n\nLater it cleared.', 'Just one line.', '', 'Title\nbody right under it',
    `${'A very long opening sentence that keeps going well past any sensible title length'} and then more.\n\nSecond paragraph.`];
  for (const content of cases) {
    const d = splitJournal(content);
    assert.equal(joinJournal(d).replace(/\n\n/g, '\n'), content.trim().replace(/\n\n/g, '\n'), content);
  }
  assert.deepEqual(plain(splitJournal('Rainy thoughts\n\nThe rain.')), { title: 'Rainy thoughts', body: 'The rain.' });
  assert.equal(splitJournal('x'.repeat(61) + '\nmore').title, '');
  assert.equal(joinJournal({ title: '  A  title ', body: '' }), 'A title');
  assert.equal(joinJournal({ title: '', body: ' words ' }), 'words');
  assert.equal(joinJournal({ title: 'T', body: 'B' }), 'T\n\nB');
});
