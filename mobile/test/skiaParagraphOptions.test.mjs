import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Native Skia throws on a present-but-undefined paragraph option ("Value is undefined, expected a String"), which
// aborts the iOS app; the web build ignores it, so only a phone shows it. Opening a Treehouse book crashed this way.
test('the painted book pages never pass an undefined option to Skia paragraphs', () => {
  const source = fs.readFileSync(new URL('../src/components/bookhouse/book3d/pages.ts', import.meta.url), 'utf8');
  const calls = [...source.matchAll(/(?:ParagraphBuilder\.Make|pushStyle)\(\{[\s\S]*?\}\s*(?:,\s*fonts)?\)/g)].map(m => m[0]);
  assert.ok(calls.length >= 4, 'found the paragraph calls');
  for (const call of calls) {
    assert.doesNotMatch(call, /:\s*undefined\b|\?\s*'…'\s*:/, call);
    // A possibly-unset value goes in only behind a guard: `...(o.line === undefined ? {} : { heightMultiplier: o.line })`.
    assert.doesNotMatch(call, /(?<!\{ )(maxLines|heightMultiplier):\s*o\.(maxLines|line)\b/, call);
  }
});
