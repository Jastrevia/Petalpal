import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { CANONICAL_PRIMARY_GARDEN_MOODS, PRIMARY_GARDEN_MOOD_CONFIG, speciesCodeForName } from '../../lib/flower-variant-config.js';
import flowerDB from '../../data/flowerDB.js';

// The waking screen's flower cards (components/loading/flowerFacts.ts): one card for every flower an
// Event can grow, each drawn with that flower's Garden art and named and explained as the Garden does.
const load = loadPlantingModules();
const { FLOWER_FACTS, factAt } = load('../../loading/flowerFacts');
const { flowerNameText, flowerMeaningText } = load('../../../services/flowerNames');
const { clusterPicture } = load('flowerClusters');
const eventSpecies = [...new Set(CANONICAL_PRIMARY_GARDEN_MOODS.flatMap(mood => PRIMARY_GARDEN_MOOD_CONFIG[mood].speciesPool))];

test('one card for every flower an Event grows, and no other', () => {
  assert.equal(FLOWER_FACTS.length, eventSpecies.length);
  assert.deepEqual(JSON.parse(JSON.stringify(FLOWER_FACTS.map(fact => fact.species).sort())), [...eventSpecies].sort());
});

test("each card's picture, name and meaning are that flower's own", () => {
  for (const fact of FLOWER_FACTS) {
    const garden = flowerDB.canonical.find(flower => speciesCodeForName(flower.name) === fact.species);
    assert.ok(garden, fact.species);
    assert.ok(clusterPicture(fact.species, garden.name), `${fact.species} has Garden art`);
    assert.equal(fact.flower.en, garden.name);
    assert.equal(fact.flower['zh-Hans'], flowerNameText(garden.name, 'zh-Hans'));
    assert.ok(fact.text.en.toLowerCase().includes(garden.meaning.toLowerCase()), `${fact.species} English meaning`);
    assert.ok(fact.text['zh-Hans'].includes(`「${flowerMeaningText(garden.meaning, 'zh-Hans')}」`), `${fact.species} Chinese meaning`);
    assert.doesNotMatch(fact.text['zh-Hans'], /小仙女/);
  }
});

test('the cards go round from any start', () => {
  assert.equal(factAt(0, FLOWER_FACTS.length), FLOWER_FACTS[0]);
  assert.equal(factAt(5, 1), FLOWER_FACTS[6]);
});
