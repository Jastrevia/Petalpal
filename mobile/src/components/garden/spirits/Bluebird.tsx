import { Group, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useRef, useState } from 'react';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import SheetFrame from '../SheetFrame';
import { FLY, hopPose, hopSeconds, nextPerchWait, PERCHES, planHop, TAKEOFF, type Hop } from './bluebirdPerch';
import { announceBirdFlight, skyTaken } from '../critters/gardenResidents';

// The Garden's bluebird: it sits on the pavilion, the swing or the moon bed, and about once a
// minute flies to another (bluebirdPerch.ts), never while the butterfly is in the air; each
// flight is announced (gardenResidents.ts) for the puppy, who may chase it. Frames from two
// generated clips sharing one crop (151 × 140 cells, 11 to a row, painted facing right): take-off
// from a perched pose, then a wingbeat loop. FEET is where its feet are in a cell; SCALE world units per cell pixel.
const ART = require('@/assets/garden/spirits/bluebird.webp');
const CELL = { w: 151, h: 140, columns: 11 };
const FEET = { x: 37, y: 131 }, SCALE = 0.44;

export default memo(function Bluebird({ clock, active }: { clock: SharedValue<number>; active: boolean }) {
  // Before its first hop it sits, facing right, on a perch of its own choosing.
  const [hop, setHop] = useState<Hop>(() => {
    const from = Math.floor(Math.random() * PERCHES.length);
    return { ...planHop(from, 1, Number.POSITIVE_INFINITY, Math.random), to: from, turn: false, facing: 1 };
  });
  const hopRef = useRef(hop); hopRef.current = hop;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (wait: number) => {
      timer = setTimeout(() => {
        // The butterfly is in the air: wait for it to settle.
        if (skyTaken('bird', clock.value)) { schedule(3000); return; }
        const last = hopRef.current, next = planHop(last.to, last.facing, clock.value, Math.random);
        announceBirdFlight({ start: next.start, end: next.start + hopSeconds(next), to: PERCHES[next.to] });
        setHop(next);
        schedule((hopSeconds(next) + nextPerchWait(Math.random)) * 1000);
      }, wait);
    };
    // First flight a little sooner than a full minute after the Garden opens.
    schedule((20 + Math.random() * 20) * 1000);
    return () => clearTimeout(timer);
  }, [active, reduced, clock]);
  const sheet = useImage(ART);
  const frame = useDerivedValue(() => hopPose(hop, clock.value).cell, [hop]);
  const transform = useDerivedValue(() => {
    const pose = hopPose(hop, clock.value);
    return [{ translateX: pose.x }, { translateY: pose.y }, { scaleX: pose.facing * SCALE }, { scaleY: SCALE },
      { translateX: -FEET.x }, { translateY: -FEET.y }];
  }, [hop]);
  if (!sheet) return null;
  return <Group transform={transform}>
    <SheetFrame sheet={sheet} frame={frame} columns={CELL.columns} count={TAKEOFF.count + FLY.count} w={CELL.w} h={CELL.h} />
  </Group>;
});
