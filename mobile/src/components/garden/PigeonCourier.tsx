import { Group, ImageShader, Rect, Shader, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import type { TreehousePlacement } from './TreehouseCalibrationEditor';
import { wingbeat, wingbeatEffect } from './wingbeat';

// The treehouse mailbox's carrier dove: it circles the mailbox so the mailbox reads as its own
// place to tap. With an unread letter it flies a closer, quicker loop; otherwise a wide, lazy
// one. One painting (wings raised, letter in its beak); the wingbeat is a warp that folds the
// feathers above the wing roots toward the body, so the bird never changes identity.
const ART = require('@/assets/garden/pigeon/pigeon-courier.webp');
const W = 512, H = 509;

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
    // Painting coordinates: the wing roots (hinge line a–b) and the head with its letter, which
    // stays still while the wings beat (wingbeat.ts). Literal here: worklets see their own values.
    flap: reduced ? 0 : wingbeat(clock.value, unread ? 0.36 : 0.46), a: [208, 214], b: [382, 152], head: [368, 212, 104],
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
  if (!sprite || !wingbeatEffect) return null;
  return <Group transform={transform}>
    <Rect x={0} y={0} width={W} height={H}>
      <Shader source={wingbeatEffect} uniforms={uniforms}>
        <ImageShader image={sprite} rect={{ x: 0, y: 0, width: W, height: H }} fit="fill" tx="decal" ty="decal" />
      </Shader>
    </Rect>
  </Group>;
}
