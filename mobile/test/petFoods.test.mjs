import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { PET_FOODS } from '../../lib/garden-pets.js';

const art = fs.readFileSync(new URL('../src/components/garden/critters/foodArt.ts', import.meta.url), 'utf8');
const block = name => art.slice(art.indexOf(`export const ${name}`), art.indexOf('};', art.indexOf(`export const ${name}`)));
const keys = name => [...block(name).matchAll(/^\s{2}([a-z-]+):/gm)].map(match => match[1]);

test('every food the server gives has a painted icon and a serving tip in both languages', () => {
  const ids = PET_FOODS.map(food => food.id);
  assert.deepEqual(keys('FOOD_ICONS'), ids);
  assert.deepEqual(keys('FOOD_TIPS'), ids);
  for (const [, file] of block('FOOD_ICONS').matchAll(/require\('@\/(assets\/[^']+)'\)/g)) {
    assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${file} exists`);
    assert.ok(fs.statSync(new URL(`../${file}`, import.meta.url)).size < 50 * 1024, `${file} is small`);
  }
  for (const line of block('FOOD_TIPS').split('\n').filter(l => /^\s{2}[a-z]/.test(l))) assert.match(line, /en: '.+', 'zh-Hans': '.+'/);
});

test('the never-feed card lists the dangerous foods and says to call a vet', () => {
  const never = art.slice(art.indexOf('export const NEVER_FEED:'), art.indexOf('];', art.indexOf('export const NEVER_FEED:')));
  for (const word of ['Chocolate', 'Grapes', 'Onion', 'Xylitol', 'Macadamia', 'Alcohol', 'Coffee', 'dough', 'bones', 'pits']) assert.ok(never.includes(word), word);
  assert.ok(art.includes('call a vet') && art.includes('兽医'));
  // None of the foods offered is on it.
  for (const food of PET_FOODS) assert.ok(!never.toLowerCase().includes(food.name.en.toLowerCase()), food.id);
});
