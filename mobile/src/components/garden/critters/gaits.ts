// The rabbit's skeleton (joints read off its painting, in its pixels) and its hop. The puppy and
// the hedgehog walk in painted frames instead (GardenCritters.tsx). The hop is driven by
// distance, not time: a paw on the ground moves back under the body exactly as fast as the body
// goes forward, so it stays on its spot.
import { buildMesh, restPaws, type Mesh, type Pose, type RigSpec } from './rig';

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

export type WalkerId = 'rabbit';
export const WALKER_MESHES: Record<WalkerId, Mesh> = { rabbit: buildMesh(RABBIT) };

const span = (u: number, a: number, b: number) => { 'worklet'; return Math.max(0, Math.min(1, (u - a) / (b - a))); };
const ease = (u: number) => { 'worklet'; return u * u * (3 - 2 * u); };

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

export const WALKER_REST_PAWS: Record<WalkerId, number[]> = { rabbit: restPaws(WALKER_MESHES.rabbit) };
