import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// WaterfallEntity calls useImage once per frame of each sequence (useSequence). That is only a stable
// hook order if every sequence is a fixed array and the map and full sets have the same frame counts,
// so switching assetQuality never changes the number of hooks.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/components/garden/waterfallAssets.ts'), 'utf8');

const frameCounts = {};
for (const match of source.matchAll(/^const (\w+) = \[([\s\S]*?)^\];/gm)) {
  frameCounts[match[1]] = (match[2].match(/require\(/g) ?? []).length;
}

test('map and full waterfall sequences have the same frame counts', () => {
  const sequences = ['MAIN_BODY', 'MAIN_HIGHLIGHT', 'CREST', 'SECONDARY_BODY', 'SECONDARY_HIGHLIGHT', 'SPLASH_PARTICLES', 'MIST'];
  for (const name of sequences) {
    assert.ok(frameCounts[name] > 0, `${name} has frames`);
    assert.equal(frameCounts[`MAP_${name}`], frameCounts[name], `MAP_${name} matches ${name}`);
  }
});
