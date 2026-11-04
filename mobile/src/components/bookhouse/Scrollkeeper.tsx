import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import Reanimated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

// Scrollkeeper, the Treehouse's spirit squirrel (journal paper with a ruff of paper leaves, its
// tail a scroll); its clips are generated from the Garden spirits design sheet itself, so its
// colours are the sheet's. It sits and looks about (IDLE, first frame = last); now and then, when
// it is back in that first pose, it folds into a journal (FOLD: its scroll unrolls into pages and
// the book closes, the paper really folding), stays a book for a while, and unfolds again (FOLD
// backwards). Both share one crop: 164 × 150 cells, 10 to a row, 12 fps, painted facing right;
// `ground` is the row its feet and the book stand on.
//
// `roam` (the writing desk): between sits it also scurries along the desk, `from`..`to` (px from
// its resting x, either side), in small hops, turning to face where it goes. It leaves only from
// its first pose and never while folded, so no clip is cut off.
const IDLE = { source: require('../../../assets/bookhouse/scrollkeeper-idle.webp'), count: 58, rows: 6 };
const FOLD = { source: require('../../../assets/bookhouse/scrollkeeper-fold.webp'), count: 62, rows: 7 };
const CELL = { w: 164, h: 150, columns: 10, ground: 142, fps: 12 };
const between = (low: number, high: number) => low + Math.random() * (high - low);
/** Roaming: one hop covers this many of its own heights, takes HOP_MS, and lifts it HOP_LIFT of its height. */
const HOP = { stride: .32, ms: 260, lift: .07 };

type Phase = { clip: 'idle' | 'fold' | 'walk'; frame: number; step: 1 | -1 | 0; until: number; walkUntil: number };

export function Scrollkeeper({ x, y, height, still, roam }: {
  x: number; y: number; height: number; still: boolean; roam?: { from: number; to: number };
}) {
  // x, y: where its feet rest (scene units); height: drawn cell height.
  const now0 = Date.now();
  const [phase, setPhase] = useState<Phase>({ clip: 'idle', frame: 0, step: 1, until: now0 + between(25, 50) * 1000, walkUntil: now0 + between(3, 6) * 1000 });
  const [facing, setFacing] = useState<1 | -1>(1);
  const offset = useSharedValue(0);
  const hop = useSharedValue(0);
  const at = useRef(0);
  const roamRef = useRef(roam);
  roamRef.current = roam;

  // A walk: pick a spot well away from here, face it, and hop there; the clip rests on its first pose meanwhile.
  const walk = () => {
    const range = roamRef.current;
    if (!range) return;
    const span = range.to - range.from, min = span * .3;
    let target = at.current;
    for (let i = 0; i < 6 && Math.abs(target - at.current) < min; i++) target = between(range.from, range.to);
    const distance = Math.abs(target - at.current);
    const hops = Math.max(2, Math.round(distance / (height * HOP.stride)));
    const duration = hops * HOP.ms;
    setFacing(target >= at.current ? 1 : -1);
    at.current = target;
    offset.value = withTiming(target, { duration, easing: Easing.linear });
    hop.value = 0;
    hop.value = withRepeat(withTiming(1, { duration: HOP.ms, easing: Easing.linear }), hops, false);
    return duration;
  };

  useEffect(() => {
    if (still) { cancelAnimation(offset); cancelAnimation(hop); hop.value = 0; return; }
    const timer = setInterval(() => setPhase(p => {
      const now = Date.now();
      if (p.clip === 'walk') return now > p.until ? { ...p, clip: 'idle', frame: 0, walkUntil: now + between(5, 11) * 1000 } : p;
      if (p.clip === 'idle') {
        const frame = (p.frame + 1) % IDLE.count;
        if (frame !== 0) return { ...p, frame };
        // From its first pose only: fold when it is time, otherwise (roaming) scurry somewhere else on the desk.
        if (now > p.until) return { ...p, clip: 'fold', frame: 0, step: 1, until: 0 };
        if (roamRef.current && now > p.walkUntil) {
          const duration = walk();
          if (duration) return { ...p, clip: 'walk', frame: 0, until: now + duration + 120 };
        }
        return { ...p, frame };
      }
      if (p.step === 0) return now > p.until ? { ...p, step: -1 } : p;
      const frame = p.frame + p.step;
      if (frame >= FOLD.count) return { ...p, clip: 'fold', frame: FOLD.count - 1, step: 0, until: now + between(15, 40) * 1000 };
      if (frame < 0) return { ...p, clip: 'idle', frame: 0, step: 1, until: now + between(25, 50) * 1000, walkUntil: now + between(4, 8) * 1000 };
      return { ...p, frame };
    }), 1000 / CELL.fps);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  const sheet = phase.clip === 'fold' ? FOLD : IDLE;
  const frame = still ? 0 : phase.frame;
  const k = height / CELL.h, w = CELL.w * k;
  const lift = height * HOP.lift;
  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { translateY: -Math.sin(hop.value * Math.PI) * lift }],
  }));
  return <Reanimated.View pointerEvents="none" accessible={false} testID="bookhouse-scrollkeeper"
    style={[{ position: 'absolute', left: x - w / 2, top: y - CELL.ground * k, width: w, height }, moving]}>
    <View style={{ width: w, height, overflow: 'hidden', transform: [{ scaleX: facing }] }}>
      <Image source={sheet.source} resizeMode="stretch" style={{
        position: 'absolute', width: w * CELL.columns, height: height * sheet.rows,
        left: -(frame % CELL.columns) * w, top: -Math.floor(frame / CELL.columns) * height,
      }} />
    </View>
  </Reanimated.View>;
}
