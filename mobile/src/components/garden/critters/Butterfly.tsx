import { Group, Image, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useRef, useState } from 'react';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { isOnMonthLawn } from '../fairy/gardenGround';
import { flutterPose, perchSeconds, planFlutter, STONES, stoneLawn, type Flutter } from './butterflyStones';
import { residents, skyTaken } from './gardenResidents';

// The Garden's butterfly: resting on a lawn stone, wings slowly opening and closing; now and then
// it flutters to another stone (butterflyStones.ts). Seen from above, painted body pointing up
// (448 × 367); it turns to its heading and its wings beat fast in the air.
const ART = require('@/assets/garden/critters/butterfly.webp');
const W = 448, H = 367, SIZE = 54;
const LAWNS = STONES.map((_, i) => stoneLawn(i, isOnMonthLawn));
const lawnOf = (stone: number) => LAWNS[stone];

export default memo(function Butterfly({ clock, active }: { clock: SharedValue<number>; active: boolean }) {
  // It starts resting on a stone of its own choosing (not on the rabbit's lawn).
  const [flutter, setFlutter] = useState<Flutter>(() => {
    const options = STONES.map((_, i) => i).filter(i => lawnOf(i) !== residents.lawns.rabbit);
    const from = options[Math.floor(Math.random() * options.length)];
    return { from, to: from, start: Number.POSITIVE_INFINITY, seconds: 1, height: 0, heading: -Math.PI / 2 };
  });
  const flutterRef = useRef(flutter); flutterRef.current = flutter;
  residents.lawns.butterfly = lawnOf(flutter.to) ?? undefined;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (wait: number) => {
      timer = setTimeout(() => {
        const now = clock.value;
        // The bluebird is in the air: wait for it to land.
        if (skyTaken('butterfly', now)) { schedule(3000); return; }
        const avoid = residents.lawns.rabbit !== undefined ? [residents.lawns.rabbit] : [];
        const next = planFlutter(flutterRef.current.to, now, Math.random, lawnOf, avoid);
        if (!next) { schedule(5000); return; }
        residents.butterfly = { start: now, end: now + next.seconds, to: STONES[next.to] };
        setFlutter(next);
        schedule((next.seconds + perchSeconds(Math.random)) * 1000);
      }, wait);
    };
    schedule((8 + Math.random() * 15) * 1000);
    return () => clearTimeout(timer);
  }, [active, reduced, clock]);
  const image = useImage(ART);
  const transform = useDerivedValue(() => {
    const t = clock.value, pose = flutterPose(flutter, t);
    // Resting: wings slowly open and close; flying: a quick flap, a little drift.
    const rest = 0.5 + 0.5 * Math.cos(t * Math.PI * 2 / 2.8);
    const flap = Math.abs(Math.cos(t * Math.PI / 0.24));
    const open = reduced ? 1 : (0.55 + 0.45 * rest) * (1 - pose.flying) + (0.28 + 0.72 * flap) * pose.flying;
    const k = SIZE / Math.max(W, H);
    return [{ translateX: pose.x + Math.sin(t * 2.3) * 7 * pose.flying }, { translateY: pose.y + Math.cos(t * 1.7) * 5 * pose.flying },
      { rotate: pose.heading + Math.PI / 2 }, { scaleX: k * open }, { scaleY: k }, { translateX: -W / 2 }, { translateY: -H / 2 }];
  }, [flutter, reduced]);
  if (!image) return null;
  return <Group transform={transform}>
    <Image image={image} x={0} y={0} width={W} height={H} fit="fill" />
  </Group>;
});
