// A painted animal as a cut-out puppet on a skeleton. Its painting is cut into parts
// (scripts/critters/cut-parts.py): the body without its legs, and the near legs, each cut along
// its painted outline and fading in at the hip. Each part is a grid of points bound to the bones
// near it (body, each leg's upper, lower and paw bones, head, ears, tail); a pose turns the bones
// about their joints and the points follow, so a leg bends at the knee and its fur bends with it.
// Drawn back to front: the far legs (darker copies of the near ones, so they are whole), the
// body, then the near legs.
// Legs are placed by inverse kinematics: give a paw a spot on the ground and the hip–knee–ankle
// chain bends to reach it, with the knee on the side the painting shows it.
// All coordinates are the painting's own pixels.

export type P = readonly [number, number];
// A leg: hip (or shoulder), knee (or elbow), ankle (or wrist), and the point of the paw that
// touches the ground; with the radius of fur each bone carries. A far leg is a copy of near leg
// `copyOf` moved by `offset`, drawn behind the body. `inBody`: the leg's hip and knee bones also
// bend the body's fur (the rabbit's haunch is its thigh).
export type LegSpec =
  | { joints: readonly [P, P, P, P]; radii: readonly [number, number, number]; inBody?: boolean }
  | { copyOf: number; offset: P };
// Any other bone: turns about `pivot`, carries the fur around its segments.
export type PartSpec = { name: string; parent: 'body' | string; pivot: P; segments: readonly (readonly [P, P, number])[] };
export type RigSpec = { w: number; h: number; ground: number; body: P; legs: readonly LegSpec[]; parts: readonly PartSpec[]; cell?: number };

// One drawing layer: its points (rest place, bones, weights, where in its texture), triangles,
// which texture it draws ('body' or 'legs'), and how much darker it is drawn (far legs).
export type Layer = {
  rest: number[]; bones: number[]; weights: number[]; textures: { x: number; y: number }[]; indices: number[];
  texture: 'body' | 'legs'; shade: number;
};
export type Mesh = {
  w: number; h: number; ground: number; body: P;
  // In drawing order: far legs, body, near legs.
  layers: Layer[];
  // Bone tree: parent index (-1 for the body) and pivot per bone.
  parent: number[]; pivotX: number[]; pivotY: number[];
  legs: { bones: [number, number, number]; joints: number[]; lengths: [number, number, number]; rest: [number, number, number]; bend: number }[];
  parts: Record<string, number>;
};

const FAR_SHADE = 0.8;
const smooth = (edge0: number, edge1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };
function segmentDistance(px: number, py: number, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
const jointsOf = (spec: RigSpec, i: number): readonly [P, P, P, P] => {
  const leg = spec.legs[i];
  if ('joints' in leg) return leg.joints;
  const [a, b, c, d] = jointsOf(spec, leg.copyOf), [dx, dy] = leg.offset;
  const move = (p: P): P => [p[0] + dx, p[1] + dy];
  return [move(a), move(b), move(c), move(d)];
};

export function buildMesh(spec: RigSpec): Mesh {
  const parent: number[] = [-1], pivotX = [spec.body[0]], pivotY = [spec.body[1]];
  // Copies carry no fur of their own in the grid: their points come from their near leg.
  const capsules: (readonly (readonly [P, P, number])[])[] = [[]];
  const legs: Mesh['legs'] = [];
  spec.legs.forEach((leg, i) => {
    const [a, b, c, d] = jointsOf(spec, i), first = parent.length;
    const radii = 'radii' in leg ? leg.radii : null;
    const add = (from: P, to: P, radius: number | undefined, up: number) => {
      parent.push(up); pivotX.push(from[0]); pivotY.push(from[1]); capsules.push(radius ? [[from, to, radius]] : []);
    };
    add(a, b, radii?.[0], 0); add(b, c, radii?.[1], first); add(c, d, radii?.[2], first + 1);
    const angle = (p: P, q: P) => Math.atan2(q[1] - p[1], q[0] - p[0]);
    // Which side of the hip–ankle line the knee is on, in the painting.
    const cross = (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
    legs.push({ bones: [first, first + 1, first + 2], joints: [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]],
      lengths: [Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(d[0] - c[0], d[1] - c[1])],
      rest: [angle(a, b), angle(b, c), angle(c, d)], bend: cross >= 0 ? 1 : -1 });
  });
  const parts: Record<string, number> = {};
  for (const part of spec.parts) {
    parts[part.name] = parent.length;
    parent.push(part.parent === 'body' ? 0 : parts[part.parent]);
    pivotX.push(part.pivot[0]); pivotY.push(part.pivot[1]); capsules.push(part.segments);
  }
  // The body's fur follows the body, head, ears and tail, and the hip and knee of an `inBody` leg.
  const bodyBones = new Set<number>([0, ...Object.values(parts)]);
  spec.legs.forEach((leg, i) => { if ('inBody' in leg && leg.inBody) { bodyBones.add(legs[i].bones[0]); bodyBones.add(legs[i].bones[1]); } });
  // A grid over the painting; `cell` pixels apart.
  const cell = spec.cell ?? 12, cols = Math.ceil(spec.w / cell) + 1, rows = Math.ceil(spec.h / cell) + 1;
  const points: { x: number; y: number; w: number[] }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = Math.min(spec.w, c * cell), y = Math.min(spec.h, r * cell);
    // Later bones (paws before knees before hips; ears before the head) take the fur first;
    // what is left belongs to the body.
    const w = new Array(parent.length).fill(0);
    let left = 1;
    for (let b = parent.length - 1; b >= 1; b--) {
      let f = 0;
      for (const [a, z, radius] of capsules[b]) f = Math.max(f, 1 - smooth(radius, radius * 1.3 + 4, segmentDistance(x, y, a, z)));
      w[b] = f * left; left -= w[b];
    }
    w[0] = left;
    points.push({ x, y, w });
  }
  // A layer keeps its own copy of the points it uses, bound to the bones `keep` allows (others'
  // weight goes to `fallback`); `bone` renames bones (a far copy uses its own leg's bones) and
  // `offset` moves its rest place, while it still draws from the same spot in the texture.
  const makeLayer = (texture: Layer['texture'], keep: (bone: number) => boolean, bone = (b: number) => b, offset: P = [0, 0], shade = 1) => {
    const layer: Layer & { map: Map<number, number> } = { rest: [], bones: [], weights: [], textures: [], indices: [], texture, shade, map: new Map() };
    const vertex = (i: number) => {
      let local = layer.map.get(i);
      if (local !== undefined) return local;
      local = layer.textures.length; layer.map.set(i, local);
      const p = points[i];
      layer.rest.push(p.x + offset[0], p.y + offset[1]); layer.textures.push({ x: p.x, y: p.y });
      const w = p.w.map((value, b) => (keep(b) ? value : 0));
      w[0] += 1 - w.reduce((total, value) => total + value, 0);
      const top = w.map((value, index) => [value, index]).sort((m, n) => n[0] - m[0]).slice(0, 3);
      const sum = top.reduce((total, [value]) => total + value, 0) || 1;
      for (const [value, index] of top) { layer.bones.push(bone(index)); layer.weights.push(value / sum); }
      return local;
    };
    return { layer, add: (a: number, b: number, c: number) => layer.indices.push(vertex(a), vertex(b), vertex(c)) };
  };
  const body = makeLayer('body', b => bodyBones.has(b));
  const near = spec.legs.map((leg, i) => ('joints' in leg ? makeLayer('legs', b => b === 0 || legs[i].bones.includes(b)) : null));
  const triangles: [number, number, number][] = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const i = r * cols + c;
    triangles.push([i, i + 1, i + cols], [i + 1, i + cols + 1, i + cols]);
  }
  const share = ([a, b, c]: [number, number, number], bones: number[]) =>
    bones.reduce((total, bone) => total + points[a].w[bone] + points[b].w[bone] + points[c].w[bone], 0) / 3;
  // The body: every triangle (its texture is empty where the legs were). A near leg: the
  // triangles around it (its texture is empty around its outline).
  const reachOf = (i: number) => triangles.filter(t => share(t, legs[i].bones) > 0.04);
  for (const t of triangles) body.add(...t);
  near.forEach((layer, i) => { if (layer) for (const t of reachOf(i)) layer.add(...t); });
  // A far leg: its near leg's triangles, moved to its own hip and bound to its own bones.
  const far = spec.legs.map((leg, i) => {
    if (!('copyOf' in leg)) return null;
    const source = legs[leg.copyOf].bones, own = legs[i].bones;
    const layer = makeLayer('legs', b => b === 0 || source.includes(b), b => (source.includes(b) ? own[source.indexOf(b)] : b), leg.offset, FAR_SHADE);
    for (const t of reachOf(leg.copyOf)) layer.add(...t);
    return layer;
  });
  const strip = ({ layer }: ReturnType<typeof makeLayer>): Layer =>
    ({ rest: layer.rest, bones: layer.bones, weights: layer.weights, textures: layer.textures, indices: layer.indices, texture: layer.texture, shade: layer.shade });
  const layers = [...far.filter(Boolean).map(l => strip(l!)), strip(body), ...near.filter(Boolean).map(l => strip(l!))];
  return { w: spec.w, h: spec.h, ground: spec.ground, body: spec.body, layers, parent, pivotX, pivotY, legs, parts };
}

// A pose: the body's lift and tilt, where each paw is, how each paw is tilted from its rest
// angle, and the turn of every other bone by name.
export type Pose = { lift: number; pitch: number; paws: number[]; tilts: number[]; turns: Record<string, number> };

// Two-bone reach: the hip–knee and knee–ankle angles that put the ankle at (tx, ty).
function reach(hx: number, hy: number, l1: number, l2: number, tx: number, ty: number, bend: number) {
  'worklet';
  const dx = tx - hx, dy = ty - hy;
  const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, Math.hypot(dx, dy)));
  const cos = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const upper = Math.atan2(dy, dx) + bend * Math.acos(cos);
  const kx = hx + l1 * Math.cos(upper), ky = hy + l1 * Math.sin(upper);
  return [upper, Math.atan2(ty - ky, tx - kx)];
}

// Every bone's turn for a pose (body first), from the legs' reach and the named parts.
export function boneTurns(mesh: Mesh, pose: Pose) {
  'worklet';
  const turns = new Array(mesh.parent.length).fill(0);
  turns[0] = pose.pitch;
  const cos = Math.cos(-pose.pitch), sin = Math.sin(-pose.pitch), bx = mesh.body[0], by = mesh.body[1];
  for (let i = 0; i < mesh.legs.length; i++) {
    const leg = mesh.legs[i], j = leg.joints;
    // The paw's spot, in the body's own frame (undo its lift and tilt).
    const wx = pose.paws[i * 2] - bx, wy = pose.paws[i * 2 + 1] - pose.lift - by;
    const px = bx + wx * cos - wy * sin, py = by + wx * sin + wy * cos;
    // The paw keeps its painted angle plus its tilt, against the ground (not the body).
    const pawAngle = leg.rest[2] + pose.tilts[i] - pose.pitch;
    const ax = px - leg.lengths[2] * Math.cos(pawAngle), ay = py - leg.lengths[2] * Math.sin(pawAngle);
    const [upper, lower] = reach(j[0], j[1], leg.lengths[0], leg.lengths[1], ax, ay, leg.bend);
    const r1 = upper - leg.rest[0], r2 = lower - leg.rest[1] - r1;
    turns[leg.bones[0]] = r1; turns[leg.bones[1]] = r2; turns[leg.bones[2]] = pawAngle - leg.rest[2] - r1 - r2;
  }
  for (const name in pose.turns) { const index = mesh.parts[name]; if (index !== undefined) turns[index] = pose.turns[name]; }
  return turns;
}

// The mesh points for a pose: each bone's frame is its parent's frame turned about its own
// joint; each point is the weighted blend of its bones' frames.
export function posePoints(mesh: Mesh, pose: Pose) {
  'worklet';
  const turns = boneTurns(mesh, pose), n = mesh.parent.length;
  const A = new Array(n), B = new Array(n), C = new Array(n), D = new Array(n), E = new Array(n), F = new Array(n);
  for (let b = 0; b < n; b++) {
    const c = Math.cos(turns[b]), s = Math.sin(turns[b]), px = mesh.pivotX[b], py = mesh.pivotY[b];
    // Turn about the joint: x' = c(x-px) - s(y-py) + px, y' = s(x-px) + c(y-py) + py.
    const la = c, lb = s, lc = -s, ld = c, le = px - c * px + s * py, lf = py - s * px - c * py + (b === 0 ? pose.lift : 0);
    const p = mesh.parent[b];
    if (p < 0) { A[b] = la; B[b] = lb; C[b] = lc; D[b] = ld; E[b] = le; F[b] = lf; continue; }
    A[b] = A[p] * la + C[p] * lb; B[b] = B[p] * la + D[p] * lb;
    C[b] = A[p] * lc + C[p] * ld; D[b] = B[p] * lc + D[p] * ld;
    E[b] = A[p] * le + C[p] * lf + E[p]; F[b] = B[p] * le + D[p] * lf + F[p];
  }
  // Each layer's points, in drawing order.
  const out = new Array(mesh.layers.length);
  for (let l = 0; l < mesh.layers.length; l++) {
    const layer = mesh.layers[l], points = new Array(layer.textures.length);
    for (let i = 0, k = 0; i < points.length; i++, k += 3) {
      const x = layer.rest[i * 2], y = layer.rest[i * 2 + 1];
      let ox = 0, oy = 0;
      for (let m = 0; m < 3; m++) {
        const b = layer.bones[k + m], w = layer.weights[k + m];
        if (!w) continue;
        ox += w * (A[b] * x + C[b] * y + E[b]); oy += w * (B[b] * x + D[b] * y + F[b]);
      }
      points[i] = { x: ox, y: oy };
    }
    out[l] = points;
  }
  return out;
}

// Where each leg's paw rests in the painting (its ground spot when standing still).
export const restPaws = (mesh: Mesh) => mesh.legs.flatMap(leg => [leg.joints[6], leg.joints[7]]);
