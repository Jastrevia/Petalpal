import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');
const src = new URL('../src/', import.meta.url);
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
function load(relative, imports = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(relative, src), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, { exports, Date, Math, Number, String, JSON, Set, Promise, setInterval, clearInterval, require: ref => {
    if (ref in imports) return imports[ref];
    throw Error(`unexpected import ${ref}`);
  } });
  return exports;
}

// Collection's red dot: today's keepsakes until the keepsake book is opened, and a choosable avatar
// reward until the avatar collection has been seen (a newly reached level lights it again).
const alerts = load('services/collectionAlerts.ts', {
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } },
  react: { useEffect() {}, useSyncExternalStore: (_, get) => get() },
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  './avatars': { loadAvatarCollection: async () => null, onAvatarsChanged: () => () => {} },
  './fairyCloseness': { loadCheckInMonth: async () => null, onClosenessChanged: () => () => {} },
});
const month = (keepsakes) => ({ today: '2026-11-06', days: [
  { localDate: '2026-11-05', keepsakes: [{ id: 'dewdrop' }] },
  ...(keepsakes ? [{ localDate: '2026-11-06', keepsakes: keepsakes.map(id => ({ id })) }] : []),
] });
const avatars = (levels, bondOn = true, gifted = []) => ({ bondOn, welcome: { gifted }, pending: levels.map(([level, eligible]) => ({ level, tier: 1, eligible })) });
const none = { keepsakes: '', avatars: '', gifts: '' };

same(alerts.todayKeepsakes(month(null)), null, 'no check-in keepsake today: nothing new');
same(alerts.todayKeepsakes(month(['acorn-teacup', 'acorn-teacup', 'crocus-brooch'])), { date: '2026-11-06', ids: ['acorn-teacup', 'crocus-brooch'] });
same(alerts.collectionAlerts(month(['acorn-teacup']), null, none), { newKeepsakes: ['acorn-teacup'], keepsakes: true, reward: false, newAvatars: [], avatars: false });
const seenToday = { ...none, keepsakes: alerts.keepsakeMark(alerts.todayKeepsakes(month(['acorn-teacup']))) };
assert.equal(alerts.collectionAlerts(month(['acorn-teacup']), null, seenToday).keepsakes, false, 'opening the keepsake book clears it');
assert.equal(alerts.collectionAlerts(month(['acorn-teacup', 'star-candy-jar']), null, seenToday).keepsakes, true, 'another keepsake later today lights it again');

assert.equal(alerts.collectionAlerts(null, avatars([[2, 30]]), none).avatars, true, 'a choosable reward lights the dot');
assert.equal(alerts.collectionAlerts(null, avatars([[2, 0]]), none).avatars, false, 'a reward with nothing left to choose does not');
assert.equal(alerts.collectionAlerts(null, avatars([[2, 30]], false), none).avatars, false, 'no rewards while Fairy Bond is off');
const seenLv2 = { ...none, avatars: alerts.avatarMark(avatars([[2, 30]])) };
assert.equal(alerts.collectionAlerts(null, avatars([[2, 30]]), seenLv2).avatars, false, 'seeing the avatars clears it without choosing');
assert.equal(alerts.collectionAlerts(null, avatars([[2, 30], [3, 29]]), seenLv2).avatars, true, 'a newly reached level lights it again');

// The three Level 1 avatars given at sign-up read New, and light the dot, until the avatars are seen once.
const welcome = avatars([], true, ['l1-07', 'l1-02', 'l1-19']);
same(alerts.collectionAlerts(null, welcome, none), { newKeepsakes: [], keepsakes: false, reward: false, newAvatars: ['l1-07', 'l1-02', 'l1-19'], avatars: true });
const seenGifts = { ...none, gifts: alerts.giftMark(welcome) };
same(alerts.collectionAlerts(null, welcome, seenGifts).newAvatars, [], 'seeing the avatars clears the New marks');
assert.equal(alerts.collectionAlerts(null, welcome, seenGifts).avatars, false, 'and the red dot');
assert.equal(alerts.collectionAlerts(null, avatars([[2, 30]], true, ['l1-07', 'l1-02', 'l1-19']), seenGifts).avatars, true, 'a later reward still lights it');
assert.equal(alerts.collectionAlerts(null, avatars([], true, []), none).avatars, false, 'an older account without gifts has nothing new');

// The first half hour: only foreground time between normal ticks counts toward it.
const newcomer = load('services/newcomerTime.ts', {
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } },
  react: { useEffect() {}, useState: value => [value, () => {}] },
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }), currentState: 'active' } },
});
assert.equal(newcomer.NEWCOMER_MS, 30 * 60_000);
assert.equal(newcomer.countedStep(15_000), 15_000);
assert.equal(newcomer.countedStep(0), 0);
assert.equal(newcomer.countedStep(-5), 0, 'a clock moved back adds nothing');
assert.equal(newcomer.countedStep(10 * 60_000), 0, 'a sleeping phone or paused tab adds nothing');

console.log('collection tests passed');
