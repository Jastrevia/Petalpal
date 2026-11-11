import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { previewEventFlower } from '../../lib/event-flower.js';
import { speciesPoolForPrimary } from '../../lib/flower-variant-config.js';
import flowerDB from '../../data/flowerDB.js';

// The local preview's fake POST /events must grow the flower the real server would (it used to
// return Lavender for every mood). Same pools, same seeded pick, same recent-name rule.
const source = fs.readFileSync(new URL('../scripts/web-local/fixtures.js', import.meta.url), 'utf8');
const start = source.indexOf('  const POOLS = {');
const end = source.indexOf('return pool[Math.floor(fraction * pool.length)];', start);
assert.ok(start > 0 && end > start, 'fixtures.js declares POOLS and eventFlowerSpecies');
const block = source.slice(start, source.indexOf('\n  }\n', end) + 4);
const fixtureFor = (uid, ownFlowers) => new Function('uid', 'ownFlowers', `${block}\nreturn { POOLS, eventFlowerSpecies };`)(uid, ownFlowers);
const MOODS = ['SUNNY_BLOOM', 'GENTLE_BLOOM', 'QUIET_BLOOM', 'HEALING_BLOOM', 'FIRE_BLOOM', 'WONDER_BLOOM', 'DRIFTING_BLOOM', 'PEACEFUL_BLOOM'];

test('preview species pools are exactly the server pools for every Primary mood', () => {
  const { POOLS } = fixtureFor('u', []);
  for (const mood of MOODS) {
    assert.deepEqual(POOLS[mood].map(([code, name, meaning, img]) => ({ code, name, meaning, img })),
      speciesPoolForPrimary(mood, flowerDB).pool.map(f => ({ code: f.speciesCode, name: f.name, meaning: f.meaning, img: f.img })), mood);
  }
  assert.deepEqual(Object.keys(POOLS).sort(), [...MOODS].sort());
});

test('preview picks the same species as the server, including the recent-name rule', async () => {
  const uid = 'local-preview-owner';
  const recentSets = [[], ['Gerbera Daisy'], ['Heather', 'Bluebell'], ['Poppy', 'Chinese Violet Cress', 'Dandelion']];
  for (const localDate of ['2026-11-10', '2026-03-02', '2026-07-31']) for (const names of recentSets) for (const mood of MOODS) {
    const ownFlowers = names.map((name, i) => ({ name, createdAt: `2026-11-0${9 - i}T00:00:00Z` }));
    const fake = await fixtureFor(uid, ownFlowers).eventFlowerSpecies(mood, localDate);
    const real = previewEventFlower({ userId: uid, localDate, primaryGardenMood: mood, labels: [], recentFlowers: ownFlowers.map(f => ({ name: f.name })) });
    assert.equal(fake.speciesCode, real.speciesCode, `${mood} ${localDate} recent=${names}`);
  }
  // Lavender only ever comes from the Peaceful pool.
  for (const mood of MOODS.filter(mood => mood !== 'PEACEFUL_BLOOM')) {
    assert.equal(fixtureFor(uid, []).POOLS[mood].some(([code]) => code === 'LAVENDER'), false, mood);
  }
  assert.equal(await fixtureFor(uid, []).eventFlowerSpecies('NOT_A_MOOD', '2026-11-10'), null);
});
