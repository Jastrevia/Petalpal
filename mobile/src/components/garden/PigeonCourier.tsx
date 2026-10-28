import { Group, ImageShader, Rect, Shader, Skia, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import type { TreehousePlacement } from './TreehouseCalibrationEditor';

// The treehouse mailbox's carrier dove: it circles the mailbox so the mailbox reads as its own
// place to tap. With an unread letter it flies a closer, quicker loop; otherwise a wide, lazy
// one. One painting (wings raised, letter in its beak); the wingbeat is a warp that folds the
// feathers above the wing roots toward the body, so the bird never changes identity.
const ART = require('@/assets/garden/pigeon/pigeon-courier.webp');
const W = 512, H = 509;
// Painting coordinates: the wing roots (the hinge line) and the head with its letter, which
// stay still while the wings beat.
const flapEffect = Skia.RuntimeEffect.Make(`
uniform shader sprite;
uniform float flap;
half4 main(float2 p) {
  float2 a = float2(208.0, 214.0);
  float2 b = float2(382.0, 152.0);
  float hinge = a.y + (b.y - a.y) * (p.x - a.x) / (b.x - a.x);
  float above = hinge - p.y;
  float2 q = p;
  // Downstroke: everything above the hinge folds toward it (feathers seen edge-on).
  if (above > 0.0) q.y = hinge - above / (1.0 - 0.62 * flap);
  float head = 1.0 - smoothstep(70.0, 104.0, length((p - float2(368.0, 212.0)) * float2(1.0, 0.82)));
  return sprite.eval(mix(q, p, head));
}`);

export default function PigeonCourier({ placement, clock, unread }: {
  placement: TreehousePlacement; clock: SharedValue<number>; unread: boolean;
}) {
  const sprite = useImage(ART);
  const reduced = useReducedMotion();
  const k = placement.scale;
  // The mailbox in treehouse-local units (its hit area is around 988, 802).
  const mailboxX = placement.x + 988 * k, mailboxY = placement.y + 760 * k;
  const drawScale = 210 * k / W;
  const uniforms = useDerivedValue(() => ({
    flap: reduced ? 0 : 0.5 - 0.5 * Math.cos(clock.value * Math.PI * 2 / (unread ? 0.36 : 0.46)),
  }), [reduced, unread]);
  const transform = useDerivedValue(() => {
    const t = clock.value;
    const loop = t * Math.PI * 2 / (unread ? 7 : 12) * (reduced ? 0.4 : 1);
    const rx = (unread ? 230 : 310) * k, ry = (unread ? 70 : 96) * k;
    const centreY = mailboxY - (unread ? 175 : 245) * k;
    // Each wingbeat lifts the body a touch.
    const bob = reduced ? 0 : Math.sin(t * Math.PI * 2 / (unread ? 0.36 : 0.46)) * 4 * k;
    const x = mailboxX + rx * Math.cos(loop), y = centreY + ry * Math.sin(loop) + bob;
    const vx = -Math.sin(loop), vy = Math.cos(loop);
    // Faces the way it flies (the painting faces right); passes through edge-on as it turns.
    const facing = Math.tanh(vx * 3);
    // The near half of the loop is a little larger.
    const depth = 0.92 + 0.1 * Math.sin(loop);
    const bank = 0.16 * vy * (facing < 0 ? -1 : 1);
    return [{ translateX: x }, { translateY: y }, { rotate: bank },
      { scaleX: facing * depth * drawScale }, { scaleY: depth * drawScale },
      { translateX: -W / 2 }, { translateY: -H / 2 }];
  }, [k, mailboxX, mailboxY, drawScale, unread, reduced]);
  if (!sprite || !flapEffect) return null;
  return <Group transform={transform}>
    <Rect x={0} y={0} width={W} height={H}>
      <Shader source={flapEffect} uniforms={uniforms}>
        <ImageShader image={sprite} rect={{ x: 0, y: 0, width: W, height: H }} fit="fill" tx="decal" ty="decal" />
      </Shader>
    </Rect>
  </Group>;
}
