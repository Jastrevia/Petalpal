import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const load = loadPlantingModules();
const { FIREFLIES, DEFAULT_FIREFLIES, fireflyAt, fireflyDisplacement5s } = load('../fireflies/fireflyMotion');

test('default composition has 48 free-flying fireflies with compact core/halo and region-bounded trajectories', () => {
  assert.equal(DEFAULT_FIREFLIES.count, 48);
  assert.equal(DEFAULT_FIREFLIES.motionDiagnostic, false);
  assert.equal(DEFAULT_FIREFLIES.showTrails, false);
  assert.equal(FIREFLIES.length, 48);
  assert.ok(DEFAULT_FIREFLIES.coreSize >= 1.5 && DEFAULT_FIREFLIES.coreSize <= 3.2, 'tiny core size');
  assert.ok(DEFAULT_FIREFLIES.haloRadius >= 4.5 && DEFAULT_FIREFLIES.haloRadius <= 9.0, 'compact halo radius');
  assert.ok(DEFAULT_FIREFLIES.haloOpacity >= .15 && DEFAULT_FIREFLIES.haloOpacity <= .85, 'restrained halo opacity');

  const allDisplacements5s = [];
  for (const fly of FIREFLIES) {
    assert.ok(fly.cycle >= 4 && fly.cycle <= 8, 'cycle within 4s..8s');
    assert.notEqual(fly.glowPhase, fly.phase, 'independent glow and movement phases');
    let minScale = Infinity, maxScale = -Infinity;
    let maxFiveSecPx = 0;
    for (let t = 0; t < 360; t += .2) {
      const p = fireflyAt(fly, t);
      assert.ok(p.x > 0 && p.x < 2400 && p.y > 0 && p.y < 1800, 'inside world bounds');
      // Loose association with natural Garden region bounds (plus gentle air-current margin)
      assert.ok(
        p.x >= fly.bounds.minX - 18 && p.x <= fly.bounds.maxX + 18 &&
        p.y >= fly.bounds.minY - 18 && p.y <= fly.bounds.maxY + 18,
        `firefly #${fly.id} stays within its natural Garden region`,
      );
      assert.ok(p.opacity >= .018 && p.opacity <= 1.0);
      assert.ok(p.sizeScale >= 1.0 && p.sizeScale <= 1.10001, 'sizeScale within 1.0x..1.1x baseline');
      minScale = Math.min(minScale, p.sizeScale);
      maxScale = Math.max(maxScale, p.sizeScale);
      const next = fireflyAt(fly, t + .016);
      assert.ok(Math.hypot(next.x - p.x, next.y - p.y) / .016 < 26, 'smooth free-flying motion without jumps or teleportation');
      assert.ok(Math.abs(next.opacity - p.opacity) < .028, 'no flashing');
      assert.ok(Math.abs(next.sizeScale - p.sizeScale) < .024, 'smooth size breathing');
    }
    for (let t0 = 5; t0 <= 120; t0 += 5) {
      const d = fireflyDisplacement5s(fly, t0, 0.6);
      allDisplacements5s.push(d.distScreenPx);
      maxFiveSecPx = Math.max(maxFiveSecPx, d.distScreenPx);
    }
    assert.ok(maxFiveSecPx >= 18, `firefly #${fly.id} visibly travels across the air (max 5s disp=${maxFiveSecPx.toFixed(1)}px)`);
    assert.ok(minScale <= 1.02, 'reaches ~1.0x baseline size at minimum brightness');
    assert.ok(maxScale >= 1.09, 'reaches ~1.1x baseline size at maximum brightness');
  }

  allDisplacements5s.sort((a, b) => a - b);
  const p25 = allDisplacements5s[Math.floor(allDisplacements5s.length * 0.25)];
  const median = allDisplacements5s[Math.floor(allDisplacements5s.length * 0.50)];
  const p75 = allDisplacements5s[Math.floor(allDisplacements5s.length * 0.75)];
  assert.ok(median >= 18 && median <= 32, `typical 5s screen displacement median (${median.toFixed(1)}px) within 15-35px target`);
  assert.ok(p25 >= 14 && p75 <= 36, `IQR (${p25.toFixed(1)}..${p75.toFixed(1)}px) centered on 15-35px target`);
});

test('insects breathe and fly independently, with no shared cycle reset', () => {
  const active = FIREFLIES.slice(0, DEFAULT_FIREFLIES.count);
  const samples = active.map(fly => [0, 3, 7, 15].map(t => fireflyAt(fly, t)));
  assert.ok(new Set(samples.map(s => s[0].opacity.toFixed(3))).size >= 20);
  for (let i = 0; i < samples.length; i++) {
    assert.notDeepEqual(samples[i][0], samples[i][3]);
    if (i) assert.notEqual(samples[i][1].x - samples[i][0].x, samples[i - 1][1].x - samples[i - 1][0].x);
  }
  for (let t = 0; t <= 30; t += 1) {
    const ops = active.map(fly => fireflyAt(fly, t).opacity);
    assert.ok(ops.some(o => o < .32), `some faint at t=${t}`);
    assert.ok(ops.some(o => o >= .38 && o <= .66), `some medium at t=${t}`);
    assert.ok(ops.some(o => o > .65), `some bright at t=${t}`);
  }
});
