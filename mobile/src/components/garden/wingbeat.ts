import { Skia } from '@shopify/react-native-skia';

// A wingbeat for a single painting of a bird with raised wings (side view): everything above
// the wing roots (the hinge line from `a` to `b`, painting pixels) folds toward the body as
// `flap` goes 0 → 1, as if the feathers were seen edge-on in the downstroke. The head (and
// anything it carries) inside `head` (centre x, y, radius) stays still, so the bird keeps its
// identity on every frame.
export const wingbeatEffect = Skia.RuntimeEffect.Make(`
uniform shader sprite;
uniform float flap;
uniform float2 a;
uniform float2 b;
uniform float3 head;
half4 main(float2 p) {
  float hinge = a.y + (b.y - a.y) * (p.x - a.x) / (b.x - a.x);
  float above = hinge - p.y;
  float2 q = p;
  if (above > 0.0) q.y = hinge - above / (1.0 - 0.62 * flap);
  float still = 1.0 - smoothstep(head.z * 0.7, head.z, length((p - head.xy) * float2(1.0, 0.82)));
  return sprite.eval(mix(q, p, still));
}`);

// 0 (wings up, as painted) → 1 (downstroke) → 0, eased like a real wingbeat.
export function wingbeat(seconds: number, period: number) {
  'worklet';
  return 0.5 - 0.5 * Math.cos(seconds * Math.PI * 2 / period);
}
