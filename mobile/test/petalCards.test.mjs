import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { PETAL_CARDS } from '../../lib/petal-cards.js';

const ts = createRequire(import.meta.url)('typescript');
// Transpile one TS module and run it with injected imports.
function load(relative, imports) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, { exports, require: imports });
  return exports;
}

// Every card the server can deal (all 78, heavy ones too) has bundled art, and nothing else is bundled.
const required = [];
const art = load('components/petalCards/petalCardArt.ts', path => { required.push(path); return path; });
assert.deepEqual(Object.keys(art.PETAL_CARD_ART).sort(), PETAL_CARDS.map(card => card.id).sort());
assert.equal(art.petalCardArt('major-17'), '@/assets/petal-cards/major-17.webp');
assert.equal(art.petalCardArt(null), undefined);
for (const path of required) assert.ok(fs.existsSync(new URL(`../assets/${path.replace('@/assets/', '')}`, import.meta.url)), path);
const files = fs.readdirSync(new URL('../assets/petal-cards/', import.meta.url));
assert.deepEqual(files.sort(), PETAL_CARDS.map(card => `${card.id}.webp`).sort());
console.log('petalCards tests passed');
