import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// app/index.tsx: the Garden leaves for the mailbox, treehouse or pavilion through one guard, so a
// double tap (or a tap on another place while leaving) never stacks a second heavy screen. The
// guard opens again once the Garden has focus.
const source = fs.readFileSync(new URL('../src/app/index.tsx', import.meta.url), 'utf8');

test('the Garden opens the mailbox, treehouse and pavilion through one re-entry guard', () => {
  assert.equal((source.match(/router\.push\(/g) || []).length, 1, 'only leaveTo pushes a route');
  assert.match(source, /if \(leaving\.current\) return;\s*leaving\.current = true;\s*router\.push\(path\);/);
  assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{[\s\S]{0,120}?leaving\.current = false;/);
  for (const name of ['openMailbox', 'openBookhouse']) assert.match(source, new RegExp(`const ${name} = useCallback\\(\\(\\) => leaveTo\\(`));
  // A Garden month sign opens the pavilion at its month through the same guard; the pavilion itself opens at no month.
  assert.match(source, /const openReflection = useCallback\(\(month\?: number\) =>\s*leaveTo\(month \? \{ pathname: '\/reflection', params: \{ month: String\(month\) \} \} : '\/reflection'\), \[leaveTo\]\);/);
  assert.match(source, /onOpenReflection=\{openReflection\}/);
  assert.doesNotMatch(source, /onOpenBookhouse=\{\(\) => router/);
  assert.doesNotMatch(source, /onOpenReflection=\{\(\) => router/);
});
