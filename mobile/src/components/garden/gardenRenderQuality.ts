// WEB-ONLY decisions. Inputs stay on this device; logical Garden units never enter here.
export type GardenQuality = 'HIGH' | 'BALANCED' | 'PERFORMANCE';
export type GardenQualityMode = 'AUTO' | GardenQuality;
export type QualitySignals = { dpr: number; width: number; height: number; cores?: number; memoryGB?: number };
const budgets = {
  HIGH: { minDpr: 2, dpr: 3, pixels: 8_000_000 },
  BALANCED: { minDpr: 1.5, dpr: 2, pixels: 4_000_000 },
  PERFORMANCE: { minDpr: 1, dpr: 1.25, pixels: 2_000_000 },
};
export function qualityMode(value: string | null): GardenQualityMode {
  return value === 'HIGH' || value === 'BALANCED' || value === 'PERFORMANCE' ? value : 'AUTO';
}
export function backingSize(tier: GardenQuality, signals: QualitySignals) {
  const width = Math.max(1, signals.width), height = Math.max(1, signals.height);
  const dpr = Number.isFinite(signals.dpr) && signals.dpr > 0 ? signals.dpr : 1;
  const budget = budgets[tier];
  // Dense source artwork benefits from 2x antialiasing even on a 1x display.
  // HIGH matches the verified 2x safe reference; pixel/texture ceilings still win.
  const scale = Math.min(Math.max(dpr, budget.minDpr), budget.dpr, Math.sqrt(budget.pixels / (width * height)), 4096 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
// Every frame repaints the whole Garden, which is what heats a phone. Left alone it needs no more than
// 30 frames a second; while it is touched, and for a moment after, it runs at full speed.
const AWAKE_MS = 6000, RESTING_FRAME_MS = 30;
export function restingFrameSkipped(now: number, lastTouch: number, lastPaint: number, touching: boolean) {
  return !touching && now - lastTouch > AWAKE_MS && now - lastPaint < RESTING_FRAME_MS;
}
export type FrameSample = { p90FrameMs: number; p90DrawMs: number; count: number };
// AUTO opens at the display's native resolution (HIGH, up to 3x) and steps down to BALANCED
// (2x) only when this device cannot keep up; it never drops below 2x (PERFORMANCE stays a dev
// override). Two slow windows vs four smooth windows; 20s between changes, except that the
// first step down is not held back, so a slow phone settles within a few seconds. Never
// switches during gestures.
export class GardenQualitySelector {
  tier: GardenQuality;
  private smooth = 0;
  private slow = 0;
  private lastChange: number;
  private changed = false;
  constructor(now: number, start: GardenQuality = 'HIGH') { this.lastChange = now; this.tier = start; }
  resetSamples() { this.smooth = this.slow = 0; }
  observe(sample: FrameSample, signals: QualitySignals, now: number, gesturing: boolean) {
    if (sample.count < 10 || gesturing) { this.resetSamples(); return this.tier; }
    const slow = sample.p90FrameMs > 35 || sample.p90DrawMs > 18;
    const smooth = sample.p90FrameMs <= 20 && sample.p90DrawMs <= 9;
    this.slow = slow ? this.slow + 1 : 0;
    this.smooth = smooth ? this.smooth + 1 : 0;
    const firstStepDown = !this.changed && this.slow >= 2 && this.tier === 'HIGH';
    if (now - this.lastChange < 20_000 && !firstStepDown) return this.tier;
    let next = this.tier;
    if (this.slow >= 2 && this.tier === 'HIGH') next = 'BALANCED';
    // Hardware hints limit speculative upgrades only. Slow runtime always wins.
    const constrained = (signals.memoryGB !== undefined && signals.memoryGB <= 4)
      || (signals.cores !== undefined && signals.cores <= 2);
    if (this.smooth >= 4 && !constrained) {
      const candidate = this.tier === 'PERFORMANCE' ? 'BALANCED' : 'HIGH';
      const current = backingSize(this.tier, signals), higher = backingSize(candidate, signals);
      const cost = higher.width * higher.height / (current.width * current.height);
      if (sample.p90DrawMs * cost <= 9) next = candidate;
    }
    if (next !== this.tier) { this.tier = next; this.lastChange = now; this.changed = true; this.resetSamples(); }
    return this.tier;
  }
}
export function frameSample(frames: number[], draws: number[]): FrameSample {
  const p90 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length * .9)] ?? 0;
  return { count: frames.length, p90FrameMs: p90(frames), p90DrawMs: p90(draws) };
}
