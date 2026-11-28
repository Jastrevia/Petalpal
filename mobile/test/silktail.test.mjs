import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const days = load('../critters/silktailDays');
const visits = load('../critters/critterVisits');
const { WALK_NETWORK, safeSegment } = load('../fairy/walkNetwork');
const { isGardenGroundBlocked } = load('../fairy/gardenGround');
const plain = value => JSON.parse(JSON.stringify(value));
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const edges = visits.walkableEdges(WALK_NETWORK, isGardenGroundBlocked, (a, b) => safeSegment(a, b, isGardenGroundBlocked));
const state = (over = {}) => ({ eventDays: 14, nextIn: 14, milestone: 14, milestoneDate: '2026-11-30', today: '2026-11-30', visiting: true, ...over });

test('holidays: the fixed ones every year, the lunar ones from the checked table (Hong Kong Observatory)', () => {
  for (const year of [2026, 2031, 2035]) {
    assert.equal(days.holidayOn(`${year}-01-01`), 'newYear');
    assert.equal(days.holidayOn(`${year}-02-14`), 'valentines');
    assert.equal(days.holidayOn(`${year}-10-31`), 'halloween');
    assert.equal(days.holidayOn(`${year}-12-25`), 'christmas');
  }
  assert.equal(days.holidayOn('2026-02-17'), 'springFestival');
  assert.equal(days.holidayOn('2026-09-25'), 'midAutumn');
  // The four dates ICU's Chinese calendar gets a day late (new moons just before Beijing midnight).
  assert.equal(days.holidayOn('2027-02-06'), 'springFestival'); assert.equal(days.holidayOn('2027-02-07'), null);
  assert.equal(days.holidayOn('2027-02-20'), 'lantern');
  assert.equal(days.holidayOn('2030-02-03'), 'springFestival'); assert.equal(days.holidayOn('2030-02-02'), null);
  assert.equal(days.holidayOn('2030-02-17'), 'lantern');
  assert.equal(days.holidayOn('2026-11-23'), null);
  for (const [id, dates] of Object.entries(days.LUNAR_HOLIDAYS)) {
    assert.equal(dates.length, 10, `${id}: 2026-2035`);
    dates.forEach((date, i) => assert.equal(date.slice(0, 4), String(2026 + i), `${id} ${date}`));
  }
  // Lantern Festival is always 14 days after Spring Festival.
  days.LUNAR_HOLIDAYS.springFestival.forEach((date, i) => {
    const lantern = new Date(`${date}T00:00:00Z`); lantern.setUTCDate(lantern.getUTCDate() + 14);
    assert.equal(days.LUNAR_HOLIDAYS.lantern[i], lantern.toISOString().slice(0, 10));
  });
});

test('why the fox comes: the milestone day first, else a holiday, else not at all', () => {
  assert.deepEqual(plain(days.foxReason(state(), '2026-11-30')), { kind: 'milestone', days: 14 });
  assert.deepEqual(plain(days.foxReason(state({ milestoneDate: '2026-12-25', today: '2026-12-25', milestone: 28 }), '2026-12-25')), { kind: 'milestone', days: 28 });
  assert.deepEqual(plain(days.foxReason(state({ visiting: false }), '2026-12-25')), { kind: 'holiday', holiday: 'christmas' });
  assert.deepEqual(plain(days.foxReason(null, '2027-02-06')), { kind: 'holiday', holiday: 'springFestival' });
  assert.equal(days.foxReason(state({ visiting: false }), '2026-12-01'), null);
  assert.equal(days.foxReason(null, '2026-12-01'), null);
  assert.equal(days.localDateOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.notEqual(days.foxVisitKey({ kind: 'milestone', days: 14 }, '2026-11-30'), days.foxVisitKey({ kind: 'milestone', days: 28 }, '2026-11-30'));
});

test('the fox says why it came, short, in both languages', () => {
  const reasons = [{ kind: 'milestone', days: 28 }, ...['newYear', 'valentines', 'halloween', 'christmas', 'springFestival', 'lantern', 'dragonBoat', 'qixi', 'midAutumn'].map(holiday => ({ kind: 'holiday', holiday }))];
  for (const reason of reasons) {
    const zh = days.foxMessage(reason, 'zh-Hans'), en = days.foxMessage(reason, 'en');
    assert.ok(zh.includes('绢尾狐') && /[一-鿿]/.test(zh), zh);
    assert.ok(en.includes('Silktail Fox'), en);
    assert.ok(zh.length <= 40 && en.length <= 110, `short: ${zh} / ${en}`);
  }
  assert.ok(days.foxMessage({ kind: 'milestone', days: 28 }, 'zh-Hans').includes('28'));
  assert.ok(days.foxMessage({ kind: 'milestone', days: 14 }, 'en').includes('14 days'));
});

test('the fox arrives on a path crossing clear of the others, takes shape, sits, then walks on', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const others = [{ x: 600, y: 500 }, { x: 900, y: 700 }];
    const fox = visits.planFoxArrival({ key: 1, now: 50, network: WALK_NETWORK, edges, random: seeded(seed), others });
    assert.ok(fox && fox.id === 'silktail' && fox.path.length >= 2);
    assert.equal(fox.arrive, visits.FOX_ARRIVE_SECONDS);
    assert.ok(Math.abs(visits.FOX_ARRIVE_SECONDS - 62 / 12) < 1e-9, 'its clip: 62 frames at 12 a second');
    assert.ok(fox.lead >= fox.arrive + visits.FOX_SITS_AFTER[0] && fox.lead <= fox.arrive + visits.FOX_SITS_AFTER[1]);
    assert.equal(fox.fadeIn, false, 'its clip is the arrival, not a fade');
    for (const other of others) assert.ok(Math.hypot(fox.path[0].x - other.x, fox.path[0].y - other.y) >= visits.FOX_CLEARANCE);
    // It never stands in the pond: every step follows a dry path.
    for (let i = 1; i < fox.path.length; i++) assert.ok(safeSegment(fox.path[i - 1], fox.path[i], isGardenGroundBlocked));
    // Later legs and fading out play no arrival again.
    const next = visits.planNextLeg({ visit: fox, now: fox.start + fox.duration + 0.1, network: WALK_NETWORK, edges, points: [], random: seeded(seed + 1) });
    assert.ok(next); assert.equal(next.arrive, undefined);
    assert.equal(visits.leaveVisit(fox, fox.start + 3).arrive, undefined);
  }
  assert.ok(!visits.CRITTER_IDS.includes('silktail'), 'never a random visitor');
});
