import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sources = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? sources(path.join(dir, entry.name)) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []);

test('the app turns between portrait and landscape', () => {
  assert.equal(JSON.parse(read('app.json')).expo.orientation, 'default');
});

// iOS shows a <Modal> in portrait only unless the Modal lists more: over a sideways screen the sheet
// would come up a quarter turn away from it.
test('every Modal says which way it may turn', () => {
  const modals = sources('src').flatMap(file => [...read(file).matchAll(/<Modal\b[^>]*>/g)].map(match => ({ file, tag: match[0] })));
  assert.ok(modals.length > 20);
  for (const { file, tag } of modals) assert.match(tag, /supportedOrientations=\{(PORTRAIT_)?MODAL_ORIENTATIONS\}/, `${file}: ${tag.slice(0, 60)}`);
  const lists = read('src/constants/orientation.ts');
  assert.match(lists, /MODAL_ORIENTATIONS[^=]*= \['portrait', 'portrait-upside-down', 'landscape'\]/);
});

test('the Treehouse and its sheets stay upright', () => {
  assert.match(read('src/app/_layout.tsx'), /name="bookhouse" options=\{\{[^}]*orientation: 'portrait_up'/);
  for (const file of ['src/app/bookhouse.tsx', 'src/components/bookhouse/JournalActions.tsx'])
    assert.match(read(file), /<Modal supportedOrientations=\{PORTRAIT_MODAL_ORIENTATIONS\}/, file);
});

test('the loading screen recommends landscape only on a phone held upright', () => {
  const loading = read('src/components/loading/PigeonLoadingExperience.tsx');
  const rule = new Function(`${loading.match(/function shouldShowRotateHint\([^)]*\) \{[^}]*\}/)[0].replace(/: (string|boolean|number)/g, '')}; return shouldShowRotateHint;`)();
  assert.equal(rule('ios', false, 393, 852), true, 'iPhone upright');
  assert.equal(rule('android', false, 412, 915), true, 'Android phone upright');
  assert.equal(rule('ios', false, 852, 393), false, 'already sideways');
  assert.equal(rule('ios', true, 834, 1194), false, 'iPad');
  assert.equal(rule('android', false, 800, 1280), false, 'Android tablet');
  assert.equal(rule('web', false, 393, 852), false, 'a browser');
  // Both languages, no touches, a still version for reduced motion.
  assert.match(loading, /ROTATE_COPY = \{ en: 'Landscape recommended', 'zh-Hans': '推荐横屏' \}/);
  assert.match(loading, /testID="pigeon-loading-rotate-hint" pointerEvents="none"/);
  assert.match(loading, /if \(reduced\) \{ turn\.setValue\(1\); appear\.setValue\(1\); return; \}/);
});

// A phone held sideways (wide, short): the pavilion's open book takes nearly the whole height, stays
// on the screen and clears the home indicator.
const { pavilionScene } = loadPlantingModules()('../../bookhouse/pavilionMotion');
for (const [width, height] of [[852, 393], [932, 430], [667, 375]]) {
  test(`the pavilion's open book fills a sideways phone (${width} × ${height})`, () => {
    const { table } = pavilionScene(width, height, undefined, 21);
    assert.ok(table.height > height * .8, 'a readable page');
    assert.ok(table.x >= 0 && table.x + table.width <= width);
    assert.ok(table.y >= 0 && table.y + table.height <= height - 21, 'above the home indicator');
  });
}
test('upright phones and wide screens keep the pavilion book they had', () => {
  for (const [width, height] of [[390, 844], [1440, 900], [1024, 768]]) {
    const { table } = pavilionScene(width, height);
    assert.ok(table.height <= height * .63 + .01, `${width} × ${height}`);
  }
});
