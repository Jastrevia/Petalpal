import assert from 'node:assert/strict';
import test from 'node:test';

import { layoutClassFor, sizeClassFor } from '../src/hooks/layoutClass.ts';

test('size class boundaries: compact < 600, medium 600–1024, expanded > 1024', () => {
  assert.equal(sizeClassFor(375), 'compact');
  assert.equal(sizeClassFor(599), 'compact');
  assert.equal(sizeClassFor(600), 'medium');
  assert.equal(sizeClassFor(1024), 'medium');
  assert.equal(sizeClassFor(1025), 'expanded');
});

test('device matrix maps to the expected classes', () => {
  const cases = [
    [375, 667, 'compact', 'portrait'], [440, 956, 'compact', 'portrait'], [956, 440, 'medium', 'landscape'],
    [744, 1133, 'medium', 'portrait'], [1180, 820, 'expanded', 'landscape'], [375, 1032, 'compact', 'portrait'],
    [1032, 1376, 'expanded', 'portrait'], [1440, 900, 'expanded', 'landscape'],
  ];
  for (const [w, h, sizeClass, orientation] of cases) {
    const layout = layoutClassFor(w, h);
    assert.equal(layout.sizeClass, sizeClass, `${w}×${h}`);
    assert.equal(layout.orientation, orientation, `${w}×${h}`);
  }
});

test('usable size subtracts safe-area insets and never goes negative', () => {
  const layout = layoutClassFor(440, 956, { top: 62, right: 0, bottom: 34, left: 0 });
  assert.equal(layout.usableWidth, 440);
  assert.equal(layout.usableHeight, 860);
  assert.equal(layoutClassFor(10, 10, { top: 20, right: 20, bottom: 0, left: 0 }).usableWidth, 0);
});

test('phone chrome keeps the old Garden HUD / dock rule: width < 600, or under 500 tall and under 900 wide', () => {
  const old = (w, h) => w < 600 || (w < 900 && h < 500);
  for (const [w, h] of [[375, 667], [440, 956], [844, 390], [956, 440], [744, 1133], [375, 1032], [1180, 820], [1440, 480]]) {
    assert.equal(layoutClassFor(w, h).phoneChrome, old(w, h), `${w}×${h}`);
  }
});
