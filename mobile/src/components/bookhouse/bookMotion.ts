// Pure geometry and timeline for the monthly book: shelf → reading position → shelf.
// Everything is computed here and sampled into tables, so the animation runs on the native driver
// (translate, scale, rotateY with perspective, opacity) without a 3D engine.

export type Rect = { x: number; y: number; width: number; height: number };
export type BookGeometry = ReturnType<typeof bookGeometry>;

export const OPEN_MS = 2400;
export const CLOSE_MS = 2000;
// Opened pages rest at this angle around the binding: the left leaf of a book held open, seen
// face-on to its right page. Page turns and the opening cover end here.
export const LEFT_ANGLE = -100;
// Perspective distance as a multiple of the page width (weak perspective keeps text undistorted).
export const PERSPECTIVE = 10;
// Spine art window proportions (atlas spine: 97 × 313 px).
export const SPINE_ASPECT = .31;
// The closed book arrives slightly smaller than reading size, then grows while it opens.
const CLOSED_SCALE = .74;

/**
 * Projected width of the resting left leaf, as a fraction of its own width. The leaf is hinged on its left
 * edge but RN/CSS apply perspective about the element's centre, so the eye sits half a leaf right of the hinge.
 */
export function leftLeafFraction() {
  const a = LEFT_ANGLE * Math.PI / 180;
  const depth = Math.sin(Math.abs(a));
  const fromCentre = Math.cos(a) - .5; // the leaf's outer edge, relative to the centre, before projection
  return -(fromCentre * PERSPECTIVE / (PERSPECTIVE - depth)) - .5;
}

/** Reading layout for a portrait window. Coordinates are window coordinates. */
export function bookGeometry(width: number, height: number, insets: { top: number; bottom: number }) {
  const tab = 34, pad = 5, right = 7;
  const top = insets.top + 50 + 56;            // back/close bar + title row
  const bottom = height - insets.bottom - 56;  // page controls
  // The resting left leaf's outer edge is nearer the eye, so it appears this much taller than the page.
  const grow = PERSPECTIVE / (PERSPECTIVE - Math.sin(Math.abs(LEFT_ANGLE) * Math.PI / 180));
  const room = Math.max(260, bottom - top - tab);
  const boardHeight = Math.min(room / grow, 820);
  const pageHeight = boardHeight - pad * 2;
  const leaf = leftLeafFraction();
  const pageWidth = Math.floor(Math.min((width - 24 - (right + 1) * (1 + leaf)) / (1 + leaf), pageHeight * .74, 470));
  const boardWidth = pageWidth + right + 1;
  const leftWidth = leaf * boardWidth;
  const ex = Math.round((width - (leftWidth + boardWidth)) / 2 + leftWidth);
  const boardTop = Math.round(top + tab + (room - boardHeight) / 2);
  const spineWidth = boardHeight * SPINE_ASPECT;
  return {
    pageWidth, pageHeight, boardWidth, boardHeight, spineWidth, tab, pad, right, ex, boardTop, leftWidth, controlsTop: boardTop + boardHeight + 8,
    // Carrier: local x = spineWidth is the binding; local y = tab is the board's top edge.
    carrierWidth: spineWidth + boardWidth, carrierHeight: tab + boardHeight,
  };
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const inOut = (x: number) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const seg = (t: number, a: number, b: number, ease: (x: number) => number) => ease(clamp((t - a) / (b - a)));

export type BookFrame = {
  tx: number; ty: number; scale: number; spineScale: number; spineX: number; coverScale: number; coverX: number;
  open: number; spineShade: number; coverShade: number; dim: number; pages: number; ui: number; lift: number;
};

/**
 * One instant of the opening (t: 0 → OPEN_MS; closing plays it backwards).
 * 0–0.4 s extraction · 0.4–1.0 s float forward · 0.7–1.3 s quarter turn spine → cover ·
 * 1.3–2.1 s cover opens around the spine · 2.1–2.4 s pages settle.
 */
export function bookFrame(t: number, g: BookGeometry, shelf: Rect): BookFrame {
  const extract = seg(t, 0, 400, outCubic);
  const float = seg(t, 400, 1000, inOut);
  const turn = seg(t, 700, 1300, inOut);
  const open = seg(t, 1300, 2100, inOut);
  const grow = seg(t, 1300, 2400, inOut);
  const settle = seg(t, 2100, 2400, outCubic);
  const theta = turn * Math.PI / 2;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const s0 = shelf.height / g.boardHeight;
  let scale = lerp(s0 * (1 + .14 * extract), CLOSED_SCALE, float);
  scale = lerp(scale, 1, grow);
  // The visible box spans [E − spine·cos, E + board·sin] around the binding E (an orthographic quarter turn).
  const centreOffset = (g.boardWidth * sin - g.spineWidth * cos) / 2;
  const startX = shelf.x + shelf.width / 2, startY = shelf.y + shelf.height / 2 - 6 * extract;
  const endX = g.ex + g.boardWidth * CLOSED_SCALE / 2, endY = g.boardTop + g.boardHeight / 2;
  const binding = t <= 1300 ? lerp(startX, endX, float) - centreOffset * scale : g.ex;
  const middle = lerp(startY, endY, float);
  // Carrier scales about its own centre; solve the translation that puts the binding and board centre in place.
  const cx = g.carrierWidth / 2, cy = g.carrierHeight / 2;
  return {
    tx: binding - cx - scale * (g.spineWidth - cx),
    ty: middle - cy - scale * (g.tab + g.boardHeight / 2 - cy),
    scale, spineScale: Math.max(.001, cos), spineX: g.spineWidth * (1 - cos) / 2,
    coverScale: Math.max(.001, sin), coverX: -g.boardWidth * (1 - sin) / 2,
    open: LEFT_ANGLE * open || 0, spineShade: sin * .55, coverShade: cos * .55,
    dim: seg(t, 0, 900, inOut) * .8, pages: t >= 1300 ? 1 : 0, ui: settle, lift: extract * (1 - float),
  };
}

/** Where a point in carrier coordinates lands on screen for a frame (used by tests and hit checks). */
export function project(frame: BookFrame, g: BookGeometry, x: number, y: number) {
  const cx = g.carrierWidth / 2, cy = g.carrierHeight / 2;
  return { x: frame.tx + cx + frame.scale * (x - cx), y: frame.ty + cy + frame.scale * (y - cy) };
}

/** Samples the timeline into interpolation tables (input in ms). */
export function sampleTimeline(g: BookGeometry, shelf: Rect, steps = 72) {
  const input: number[] = [];
  const out: Record<keyof BookFrame, number[]> = {
    tx: [], ty: [], scale: [], spineScale: [], spineX: [], coverScale: [], coverX: [], open: [], spineShade: [],
    coverShade: [], dim: [], pages: [], ui: [], lift: [],
  };
  const times = Array.from({ length: steps + 1 }, (_, i) => i * OPEN_MS / steps);
  // Exact edges for the step changes (pages appear the moment the cover starts to lift).
  times.push(1299, 1301);
  times.sort((a, b) => a - b);
  for (const t of times) {
    input.push(t);
    const frame = bookFrame(t, g, shelf);
    for (const key of Object.keys(out) as (keyof BookFrame)[]) out[key].push(frame[key]);
  }
  return { input, out };
}
