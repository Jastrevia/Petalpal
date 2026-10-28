import { Group, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import SheetFrame from './SheetFrame';
import type { TreehousePlacement } from './TreehouseCalibrationEditor';

// Letterwing, the mailbox's spirit bird (letter paper, handwriting and blossoms): it circles the
// mailbox so the mailbox reads as its own place to tap. With an unread letter it flies a closer,
// quicker loop; otherwise a wide, lazy one. Its flight is painted frames: a whole generated
// flying clip (several wingbeats, first frame = last), 62 frames at 12 fps, 279 × 240 each,
// painted facing right.
const ART = require('@/assets/garden/spirits/letterwing-fly.webp');
const FLY = { columns: 10, count: 62, fps: 12, w: 279, h: 240 };

export default function Letterwing({ placement, clock, unread }: {
  placement: TreehousePlacement; clock: SharedValue<number>; unread: boolean;
}) {
  const sheet = useImage(ART);
  const reduced = useReducedMotion();
  const k = placement.scale;
  // The mailbox in treehouse-local units (its hit area is around 988, 802).
  const mailboxX = placement.x + 988 * k, mailboxY = placement.y + 760 * k;
  const drawScale = 230 * k / FLY.w;
  const frame = useDerivedValue(() => (reduced ? 0 : Math.floor(clock.value * FLY.fps) % FLY.count), [reduced]);
  const transform = useDerivedValue(() => {
    const t = clock.value;
    const loop = t * Math.PI * 2 / (unread ? 7 : 12) * (reduced ? 0.4 : 1);
    const rx = (unread ? 230 : 310) * k, ry = (unread ? 70 : 96) * k;
    const centreY = mailboxY - (unread ? 175 : 245) * k;
    const x = mailboxX + rx * Math.cos(loop), y = centreY + ry * Math.sin(loop);
    const vx = -Math.sin(loop), vy = Math.cos(loop);
    // Faces the way it flies; passes through edge-on as it turns.
    const facing = Math.tanh(vx * 3);
    // The near half of the loop is a little larger.
    const depth = 0.92 + 0.1 * Math.sin(loop);
    const bank = 0.16 * vy * (facing < 0 ? -1 : 1);
    return [{ translateX: x }, { translateY: y }, { rotate: bank },
      { scaleX: facing * depth * drawScale }, { scaleY: depth * drawScale },
      { translateX: -FLY.w / 2 }, { translateY: -FLY.h / 2 }];
  }, [k, mailboxX, mailboxY, drawScale, unread, reduced]);
  if (!sheet) return null;
  return <Group transform={transform}>
    <SheetFrame sheet={sheet} frame={frame} columns={FLY.columns} count={FLY.count} w={FLY.w} h={FLY.h} />
  </Group>;
}
