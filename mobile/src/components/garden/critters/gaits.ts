// The skeletons of the Garden's walkers (joints read off each painting, in its pixels) and how
// each one moves. Gaits are driven by distance, not time: a paw on the ground moves back under
// the body exactly as fast as the body goes forward, so it stays on its spot.
import { buildMesh, restPaws, type Mesh, type Pose, type RigSpec } from './rig';

// Painting 512 × 415, facing right, standing.
const PUPPY: RigSpec = {
  w: 512, h: 415, ground: 396, body: [250, 200],
  legs: [
    // Near hind, far hind (a copy of the near one), near front, far front.
    { joints: [[115, 210], [98, 292], [78, 345], [92, 394]], radii: [40, 22, 18] },
    { copyOf: 0, offset: [80, -20] },
    { joints: [[338, 238], [330, 300], [352, 368], [392, 396]], radii: [32, 21, 18] },
    { copyOf: 2, offset: [26, -10] },
  ],
  parts: [
    { name: 'head', parent: 'body', pivot: [362, 150], segments: [[[362, 150], [470, 90], 84]] },
    { name: 'ear', parent: 'head', pivot: [396, 40], segments: [[[396, 40], [400, 110], 26]] },
    { name: 'tail', parent: 'body', pivot: [118, 130], segments: [[[118, 130], [12, 30], 34]] },
  ],
};

// Painting 512 × 491, facing right, sitting on its haunches.
const RABBIT: RigSpec = {
  w: 512, h: 491, ground: 474, body: [250, 330],
  legs: [
    // Hind (hip, knee at the front of the haunch, heel, toes; the haunch is body fur), near
    // front, far front.
    { joints: [[150, 330], [214, 418], [100, 446], [236, 472]], radii: [70, 30, 22], inBody: true },
    { joints: [[290, 340], [282, 410], [300, 458], [356, 478]], radii: [30, 22, 18] },
    { copyOf: 1, offset: [38, -20] },
  ],
  parts: [
    { name: 'head', parent: 'body', pivot: [330, 250], segments: [[[330, 250], [470, 230], 74]] },
    { name: 'ears', parent: 'head', pivot: [345, 142], segments: [[[345, 142], [300, 12], 34], [[355, 142], [372, 12], 34]] },
    { name: 'tail', parent: 'body', pivot: [74, 398], segments: [[[74, 398], [24, 402], 30]] },
  ],
};

// Painting 512 × 467, facing right; short legs under a round body.
const HEDGEHOG: RigSpec = {
  w: 512, h: 467, ground: 444, body: [240, 280],
  legs: [
    // Hind, near front, far front.
    { joints: [[186, 366], [210, 402], [168, 426], [196, 440]], radii: [26, 18, 16] },
    { joints: [[296, 336], [304, 384], [318, 420], [348, 442]], radii: [24, 18, 16] },
    { copyOf: 1, offset: [46, -10] },
  ],
  parts: [
    { name: 'head', parent: 'body', pivot: [330, 262], segments: [[[330, 262], [480, 236], 86]] },
  ],
};

export type WalkerId = 'puppy' | 'rabbit' | 'hedgehog';
export const WALKER_MESHES: Record<WalkerId, Mesh> = { puppy: buildMesh(PUPPY), rabbit: buildMesh(RABBIT), hedgehog: buildMesh(HEDGEHOG) };
export const WALKER_SPECS: Record<WalkerId, RigSpec> = { puppy: PUPPY, rabbit: RABBIT, hedgehog: HEDGEHOG };

// Gait settings in painting pixels: one stride (all four paws once), the share of it each paw
// is on the ground, when in the stride each paw lifts, where it stands, and how high it steps.
// `ground` per paw: the far legs stand a little higher in the picture.
type Walk = { stride: number; duty: number; phase: number[]; stand: number[]; ground: number[]; lift: number[]; swingTilt: number[] };
export const PUPPY_WALK: Walk = {
  stride: 140, duty: 0.62,
  // A dog's walk: hind, front on the same side, other hind, other front.
  phase: [0, 0.5, 0.25, 0.75], stand: [92, 172, 392, 418], ground: [394, 374, 396, 386], lift: [16, 14, 18, 14], swingTilt: [0.25, 0.25, 0.45, 0.45],
};
export const HEDGEHOG_WALK: Walk = {
  stride: 84, duty: 0.58, phase: [0.5, 0, 0.5], stand: [196, 348, 394], ground: [440, 442, 432], lift: [12, 13, 11], swingTilt: [0.4, 0.6, 0.6],
};

const fract = (x: number) => { 'worklet'; return x - Math.floor(x); };
const span = (u: number, a: number, b: number) => { 'worklet'; return Math.max(0, Math.min(1, (u - a) / (b - a))); };
const ease = (u: number) => { 'worklet'; return u * u * (3 - 2 * u); };

// One paw over a walk: on the ground it slides back under the body as the body comes forward
// (so it stays put); off the ground it swings forward in an arc to its next spot.
function walkPaw(walk: Walk, i: number, distance: number, stepping: number) {
  'worklet';
  const S = walk.stride, beta = walk.duty, n = walk.stand[i], ground = walk.ground[i];
  const phase = fract(distance / S + walk.phase[i]);
  if (phase < beta) return [n + beta * S / 2 - phase * S, ground, 0];
  const u = (phase - beta) / (1 - beta);
  return [n - beta * S / 2 + beta * S * ease(u), ground - walk.lift[i] * Math.sin(Math.PI * u) * stepping, walk.swingTilt[i] * Math.sin(Math.PI * u) * stepping];
}

function walkPose(mesh: Mesh, walk: Walk, distance: number, stepping: number) {
  'worklet';
  const paws: number[] = [], tilts: number[] = [];
  for (let i = 0; i < mesh.legs.length; i++) {
    const [x, y, tilt] = walkPaw(walk, i, distance, stepping);
    paws.push(x, y); tilts.push(tilt);
  }
  return { paws, tilts };
}

// `distance` along the path and `stepping` (0 when standing, 1 at full pace), both in painting
// pixels; `seconds` drives what happens whatever the pace (tail, ears, sniffing).
export function puppyPose(distance: number, stepping: number, seconds: number): Pose {
  'worklet';
  const mesh = WALKER_MESHES.puppy, walk = PUPPY_WALK, c = distance / walk.stride;
  const { paws, tilts } = walkPose(mesh, walk, distance, stepping);
  const sniff = (1 - stepping) * (0.5 + 0.5 * Math.sin(seconds * 1.7));
  return {
    // Walking, the body rides a little lower (the legs a little bent), rising slightly twice a
    // stride as each pair of legs passes under it.
    lift: stepping * (20 - 3 * (0.5 + 0.5 * Math.cos(4 * Math.PI * c))), pitch: 0.02 * stepping * Math.sin(2 * Math.PI * c),
    paws, tilts,
    turns: {
      // The head nods with the steps, and dips to sniff when it stops.
      head: 0.05 * stepping * Math.sin(4 * Math.PI * c + 0.8) + 0.22 * sniff,
      ear: 0.14 * Math.sin(4 * Math.PI * c + 1.6) * stepping + 0.05 * Math.sin(seconds * 3.1),
      tail: 0.32 * Math.sin(seconds * 9.5) + 0.06,
    },
  };
}

// One hop per burst, `hop` 0..1 through it (by distance), `length` its painting pixels. The hind
// feet push off and stay on their spot while the body lifts; the front paws reach forward and
// land; the hind feet swing in beside them and the rabbit settles back on its haunches.
export function rabbitPose(hop: number, length: number, seconds: number): Pose {
  'worklet';
  const mesh = WALKER_MESHES.rabbit, g = mesh.ground, S = length, u = hop;
  const j = (leg: number, k: number) => mesh.legs[leg].joints[k];
  const paws: number[] = [], tilts: number[] = [];
  // Hind toes: planted until 0.42 (the heel rises as the leg straightens), then forward to land at 0.95.
  const hind = j(0, 6);
  if (u < 0.42) { paws.push(hind - u * S, g); tilts.push(1.0 * ease(span(u, 0.1, 0.42))); }
  else if (u < 0.95) {
    const v = ease(span(u, 0.42, 0.95));
    paws.push(hind - 0.42 * S + 0.47 * S * v, g - 34 * Math.sin(Math.PI * v)); tilts.push(1.0 * (1 - ease(span(u, 0.42, 0.85))));
  } else { paws.push(hind + (1 - u) * S, g); tilts.push(0); }
  // Front paws: lift at 0.12, reach ahead and land at 0.72.
  for (const leg of [1, 2]) {
    const front = j(leg, 6), ground = j(leg, 7), lag = leg === 2 ? 0.04 : 0;
    const lifts = 0.12 + lag, lands = 0.72 + lag;
    if (u < lifts) { paws.push(front - u * S, ground); tilts.push(0); }
    else if (u < lands) {
      const v = ease(span(u, lifts, lands));
      paws.push(front - lifts * S + (lifts + 1 - lands) * S * v, ground - 26 * Math.sin(Math.PI * v)); tilts.push(0.7 * Math.sin(Math.PI * v));
    } else { paws.push(front + (1 - u) * S, ground); tilts.push(0); }
  }
  const air = Math.sin(Math.PI * span(u, 0.16, 0.7));
  // Nose up once the front paws have left the ground, nose down as they land, level to sit.
  const pitch = -0.2 * Math.sin(Math.PI * span(u, 0.15, 0.5)) + 0.1 * Math.sin(Math.PI * span(u, 0.52, 0.9));
  const settle = Math.sin(Math.PI * span(u, 0.62, 0.98));
  return {
    lift: -0.11 * S * air + 10 * settle, pitch, paws, tilts,
    turns: {
      head: -pitch * 0.6,
      // Ears trail on take-off and flick on landing; now and then one twitch while it sits.
      ears: -pitch * 0.5 - 0.1 * settle + (u === 0 ? 0.05 * Math.max(0, Math.sin(seconds * 0.9)) ** 12 : 0),
      tail: 0.12 * Math.sin(Math.PI * span(u, 0.1, 0.5)),
    },
  };
}

export function hedgehogPose(distance: number, stepping: number, seconds: number): Pose {
  'worklet';
  const mesh = WALKER_MESHES.hedgehog, walk = HEDGEHOG_WALK, c = distance / walk.stride;
  const { paws, tilts } = walkPose(mesh, walk, distance, stepping);
  const sniff = (1 - stepping) * Math.sin(seconds * 7) * (0.5 + 0.5 * Math.sin(seconds * 1.3));
  return {
    lift: stepping * (9 - 2 * Math.abs(Math.sin(2 * Math.PI * c))), pitch: 0.025 * stepping * Math.sin(2 * Math.PI * c),
    paws, tilts, turns: { head: 0.03 * stepping * Math.sin(2 * Math.PI * c + 1) + 0.04 * sniff },
  };
}

export const WALKER_REST_PAWS: Record<WalkerId, number[]> = { puppy: restPaws(WALKER_MESHES.puppy), rabbit: restPaws(WALKER_MESHES.rabbit), hedgehog: restPaws(WALKER_MESHES.hedgehog) };
