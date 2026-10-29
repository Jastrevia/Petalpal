import { Group, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useRef, useState } from 'react';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { gardenGroundKind } from '../fairy/gardenGround';
import SheetFrame from '../SheetFrame';
import { planSwim, swimEnd, swimPose, type Swim } from './otterSwims';

// Memory Otter, the lake's night spirit: a water otter with blossoms inside, out only in the
// evening and at night. It swims a stretch of open water, dives, and surfaces somewhere near
// (otterSwims.ts). Painted frames of a generated swimming clip on black, drawn in screen blend,
// so the black falls away and its body glows translucent over the water it swims in, lighting
// only its own patch of lake. 62 frames at 12 fps, 304 × 180 each, painted facing right.
const ART = require('@/assets/garden/spirits/otter-swim.webp');
const SWIM = { columns: 10, count: 62, fps: 12, w: 304, h: 180 };
// Body length in world units (PPL's walking frame is about 102 wide).
const LENGTH = 150;
const isWater = (p: { x: number; y: number }) => gardenGroundKind(p) === 'water';
// The lake without its outermost edges, which framings crop (world units).
const BOUNDS = { minX: 60, minY: 40, maxX: 2340, maxY: 1620 };

export default memo(function MemoryOtter({ clock, active, night }: { clock: SharedValue<number>; active: boolean; night: boolean }) {
  const [swim, setSwim] = useState<Swim | null>(null);
  const swimRef = useRef(swim); swimRef.current = swim;
  useEffect(() => {
    if (!night) { setSwim(null); return; }
    if (!active) return;
    // The first swim a few seconds after night falls or the Garden opens; then one after another.
    const plan = () => {
      const last = swimRef.current;
      if (last && clock.value < swimEnd(last)) return;
      const next = planSwim({ from: last ? last.b : null, now: clock.value, isWater, bounds: BOUNDS, random: Math.random })
        ?? planSwim({ from: null, now: clock.value, isWater, bounds: BOUNDS, random: Math.random });
      setSwim(next);
    };
    const first = setTimeout(plan, swimRef.current ? 0 : 3000 + Math.random() * 5000);
    const timer = setInterval(plan, 500);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [active, night, clock]);
  // Development only: window.__memoryOtter.swim() is the current swim, .clock() the Garden clock,
  // .swimNear({ x, y }) starts a swim surfacing near that point now.
  useEffect(() => {
    if (!__DEV__ || typeof window === 'undefined') return;
    (window as unknown as { __memoryOtter?: unknown }).__memoryOtter = { swim: () => swimRef.current, clock: () => clock.value,
      swimNear: (from: { x: number; y: number }) => { const next = planSwim({ from, now: clock.value, isWater, bounds: BOUNDS, random: Math.random }); if (next) setSwim(next); return next; } };
  }, [clock]);
  return swim ? <Otter swim={swim} clock={clock} /> : null;
});

export function Otter({ swim, clock }: { swim: Swim; clock: SharedValue<number> }) {
  const sheet = useImage(ART);
  const reduced = useReducedMotion();
  const scale = LENGTH / SWIM.w;
  const opacity = useDerivedValue(() => swimPose(swim, clock.value).opacity, [swim]);
  const transform = useDerivedValue(() => {
    const pose = swimPose(swim, clock.value);
    // A little lower as it dives or before it surfaces; tilted along a rising or falling stretch.
    return [{ translateX: pose.x }, { translateY: pose.y + pose.depth * 10 }, { rotate: pose.tilt * pose.facing * 0.5 },
      { scaleX: pose.facing * scale }, { scaleY: scale }, { translateX: -SWIM.w / 2 }, { translateY: -SWIM.h * 0.55 }];
  }, [swim, scale]);
  const frame = useDerivedValue(() => (reduced ? 0 : Math.floor(clock.value * SWIM.fps) % SWIM.count), [reduced]);
  if (!sheet) return null;
  return <Group opacity={opacity} blendMode="screen">
    <Group transform={transform}>
      <SheetFrame sheet={sheet} frame={frame} columns={SWIM.columns} count={SWIM.count} w={SWIM.w} h={SWIM.h} />
    </Group>
  </Group>;
}
