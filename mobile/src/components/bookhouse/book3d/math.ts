// Book geometry and camera maths shared by the renderer (engine.ts), the motion timeline and tests. No Skia here.
// Every function is a Reanimated worklet so it can run on the UI thread.
//
// Geometry lives in "book space" (units: a book 1000 tall): x from the spine (0) to the fore-edge (W),
// y from head (0) to tail (H), z from the back cover (−T/2) to the front cover (+T/2), +z toward the viewer.
// Flat faces are drawn as images under a 4×4 perspective matrix (exact perspective texturing); curved
// surfaces — the rounded spine, the gutter curve of the open pages and a turning sheet — are meshes.
export type V3 = [number, number, number];
export type M4 = number[];
export type Camera = { cx: number; cy: number; d: number };
export type Pose = { x: number; y: number; z: number; s: number; yaw: number; pitch: number; roll: number; px: number; py: number; pz: number };
/** One leaf being turned: p is its progress 0 → 1; dir +1 turns it from the right page onto the left (forward),
 *  −1 from the left onto the right (backward). */
export type Turn = { p: number; dir: 1 | -1 };
/** phi: cover angle (0 closed → π flat open). split: share of the page block on the left. curl: gutter curvature 0..1.
 *  turns: the leaves in motion, top-most first (several for a riffle across many entries). */
export type BookState = { phi: number; split: number; curl: number; turns: Turn[] };

// Proportions: the spine's painted width (31 % of the height) wraps the rounded spine as its arc length.
export const SPEC = { H: 1000, W: 680, T: 290, board: 22, over: 14, gap: 12, arc: 310, gutter: .2 };
export const LIGHT: V3 = (() => { const l: V3 = [-.34, -.5, .8]; const n = Math.hypot(l[0], l[1], l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();

// ---------- matrices (row-major, column vectors) ----------
export function mul(a: M4, b: M4): M4 {
  'worklet';
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let v = 0; for (let k = 0; k < 4; k++) v += a[r * 4 + k] * b[k * 4 + c]; o[r * 4 + c] = v;
  }
  return o;
}
export function translate(x: number, y: number, z: number): M4 { 'worklet'; return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]; }
export function scale(s: number): M4 { 'worklet'; return [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]; }
// CSS-compatible rotations (y down, z toward the viewer), so React Native views can share the same transforms.
export function rotX(a: number): M4 { 'worklet'; const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; }
export function rotY(a: number): M4 { 'worklet'; const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; }
export function rotZ(a: number): M4 { 'worklet'; const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
export function apply(m: M4, p: V3): V3 {
  'worklet';
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
}
/** Perspective about the camera centre, eye at distance d in front of the screen plane (same model as CSS perspective). */
export function projection(cam: Camera): M4 {
  'worklet';
  return mul(translate(cam.cx, cam.cy, 0), mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1 / cam.d, 1], translate(-cam.cx, -cam.cy, 0)));
}
export function project(cam: Camera, p: V3): [number, number] {
  'worklet';
  const k = cam.d / (cam.d - p[2]);
  return [cam.cx + (p[0] - cam.cx) * k, cam.cy + (p[1] - cam.cy) * k];
}
export function poseMatrix(p: Pose): M4 {
  'worklet';
  return mul(translate(p.x, p.y, p.z), mul(scale(p.s), mul(rotZ(p.roll), mul(rotX(p.pitch), mul(rotY(p.yaw), translate(-p.px, -p.py, -p.pz))))));
}

// ---------- book proportions ----------
/** Rounded spine: a circular arc of fixed length between the two boards' spine edges. Returns its angle for a chord. */
export function arcAngle(chord: number, length: number) {
  'worklet';
  const ratio = Math.max(1.0005, length / Math.max(1, chord));
  let t = Math.sqrt(24 * (ratio - 1));
  for (let i = 0; i < 12; i++) { const h = t / 2, f = h / Math.sin(h) - ratio, df = (Math.sin(h) - h * Math.cos(h)) / (2 * Math.sin(h) ** 2); t = Math.max(1e-4, Math.min(6.2, t - f / df)); }
  return t;
}
/** Height of the page surfaces at the hinge: the right stack's top. */
export function hingeZ(state: BookState) {
  'worklet';
  const pages = SPEC.T - 2 * SPEC.board;
  return SPEC.T / 2 - SPEC.board - pages * state.split;
}
/** Book space → book space for the left half (front board and the pages turned onto it). */
export function slabMatrix(state: BookState): M4 {
  'worklet';
  const zh = hingeZ(state);
  return mul(translate(0, 0, zh), mul(rotY(-state.phi), translate(0, 0, -zh)));
}

// ---------- poses shared by the shelf and the monthly book ----------
export const CLOSED: BookState = { phi: 0, split: 0, curl: 0, turns: [] };
/** How far the closed book's rounded spine bulges beyond the boards' spine edges (book units). */
export function spineSag() {
  'worklet';
  const theta = arcAngle(SPEC.T, SPEC.arc), radius = SPEC.arc / theta;
  return radius * (1 - Math.cos(theta / 2));
}
/** A book standing on a shelf, spine out, front cover to the right: the spine's crown lies in the screen plane,
 *  centred on `x`, its tail on `bottom`, `height` pixels tall. */
export function shelfPose(x: number, bottom: number, height: number): Pose {
  'worklet';
  const s = height / SPEC.H;
  return { x, y: bottom, z: -spineSag() * s, s, yaw: Math.PI / 2, pitch: 0, roll: 0, px: 0, py: SPEC.H, pz: 0 };
}
/** Screen width of a shelf book's spine for a given height. */
export const SPINE_RATIO = SPEC.T / SPEC.H;

// ---------- a turning leaf ----------
function clamp01(t: number) { 'worklet'; return Math.max(0, Math.min(1, t)); }
function smoothstep(a: number, b: number, t: number) { 'worklet'; const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); }
function easeInOut(t: number) { 'worklet'; const x = clamp01(t); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
/** The leaf's profile across its width, as the angle of each of `n` segments from the binding (r = 0) to the outer
 *  edge (r = 1), measured from the right-hand page (0) over the spine to the left-hand page (π).
 *  Forward: the outer edge lifts first and curls in toward the binding; the root then swings the leaf over the spine
 *  with the free edge trailing in a soft curve, which relaxes as it settles flat on the left. Backward mirrors it. */
export function leafAngles(p: number, dir: number, n: number): number[] {
  'worklet';
  const root = Math.PI * easeInOut((p - .16) / .76);
  const lift = Math.sin(Math.PI * clamp01(p / .5));
  const trail = .95 * Math.sin(Math.PI * clamp01((p - .28) / .72));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = (i + .5) / n;
    let a = root + 1.45 * lift * smoothstep(.35, 1, r) - trail * Math.pow(r, 1.6);
    a = Math.max(0, Math.min(Math.PI, a));
    out.push(dir > 0 ? a : Math.PI - a);
  }
  return out;
}
/** Mean angle of a leaf (0 lying on the right, π on the left), for the shadow it casts on the pages beneath. */
export function leafMeanAngle(t: Turn) {
  'worklet';
  const a = leafAngles(t.p, t.dir, 8);
  let sum = 0; for (const v of a) sum += v;
  return sum / a.length;
}
