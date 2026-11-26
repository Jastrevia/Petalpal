import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';

import {
  createReadingFairyController, READING_SHEET, READING_TIMING, readingArt, readingMotion,
  type ReadingEasing, type ReadingSession, type ReadingSnapshot, type ReadingTiming,
} from './readingFairyController';

// The reading pose (whole scene) and a strip of 42 frames of the area that moves: arm, hand, book
// and page. Face, hair, wings and room are always the reading pose underneath.
export const READING_ART = {
  base: require('@/assets/garden/fairy/reading-v1/reading_01.webp'),
  sheet: require('@/assets/garden/fairy/reading-v1/reading_sheet.webp'),
};

// One controller per mounted companion. The timing is read once; remount (key) to change it.
export function useReadingFairy(session: ReadingSession, timing: ReadingTiming = READING_TIMING) {
  const [controller] = useState(() => createReadingFairyController({ timing }));
  useEffect(() => { controller.setSession(session); }, [controller, session]);
  useEffect(() => () => controller.dispose(), [controller]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { controller, snapshot };
}

// The Fairy reading beside you during a study or work session. `session` comes from the session
// that owns the timer: 'active' while it runs, 'paused' while it is paused, 'idle' otherwise.
export function ReadingFairy({ session, timing, art, style }: {
  session: ReadingSession; timing?: ReadingTiming; art?: { base?: unknown; sheet?: unknown }; style?: StyleProp<ViewStyle>;
}) {
  const { snapshot } = useReadingFairy(session, timing);
  return <ReadingFairyView snapshot={snapshot} art={art} style={style} />;
}

const EASING: Record<ReadingEasing, (value: number) => number> = {
  in: Easing.in(Easing.sin), out: Easing.out(Easing.sin), linear: Easing.linear, inOut: Easing.inOut(Easing.sin),
};
const { columns, frames, size, crop } = READING_SHEET;
// Tile edges are the reading pose in every frame; trimming them avoids sampling a neighbouring tile.
const TRIM = 2;
const STEP = 0.001;

// Step functions over the fractional strip position: which tile each of the two layers shows, and
// how far the upper (next) frame has faded in.
function stripRanges(scale: number) {
  const input: number[] = [], lowerX: number[] = [], lowerY: number[] = [], upperX: number[] = [], upperY: number[] = [], fade: number[] = [];
  const tileX = (frame: number) => -((frame % columns) * crop.width + TRIM) * scale;
  const tileY = (frame: number) => -(Math.floor(frame / columns) * crop.height + TRIM) * scale;
  for (let frame = 0; frame < frames; frame += 1) {
    const next = Math.min(frame + 1, frames - 1);
    const points = frame === frames - 1 ? [frame] : [frame, frame + 1 - STEP];
    points.forEach((point, index) => {
      input.push(point);
      lowerX.push(tileX(frame)); lowerY.push(tileY(frame));
      upperX.push(tileX(next)); upperY.push(tileY(next));
      fade.push(index === 0 ? 0 : 1);
    });
  }
  return { input, lowerX, lowerY, upperX, upperY, fade };
}

// Draws a controller snapshot (for owners that hold the controller themselves).
export function ReadingFairyView({ snapshot, art = READING_ART, style }: {
  snapshot: ReadingSnapshot; art?: { base?: unknown; sheet?: unknown }; style?: StyleProp<ViewStyle>;
}) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  const [width, setWidth] = useState(0);
  const progress = useState(() => new Animated.Value(0))[0];
  const mode = readingArt(art);

  // Each state's movement starts from wherever the strip is, so a re-render never replays it and
  // an interrupted movement continues smoothly instead of jumping.
  useEffect(() => {
    let cancelled = false;
    progress.stopAnimation(at => {
      if (cancelled) return;
      const motion = reduced ? { to: 0, durationMs: 0, easing: 'linear' as const } : readingMotion(snapshot.state, snapshot.durationMs, at);
      if (!motion) return;
      const duration = Math.max(0, motion.durationMs - Math.max(0, Date.now() - snapshot.enteredAt));
      if (duration === 0) return progress.setValue(motion.thenJumpTo ?? motion.to);
      Animated.timing(progress, { toValue: motion.to, duration, easing: EASING[motion.easing], useNativeDriver: Platform.OS !== 'web' })
        .start(({ finished }) => { if (finished && !cancelled && motion.thenJumpTo !== undefined) progress.setValue(motion.thenJumpTo); });
    });
    return () => { cancelled = true; };
  }, [snapshot.state, snapshot.enteredAt, snapshot.durationMs, reduced, progress]);
  useEffect(() => () => progress.stopAnimation(), [progress]);

  const layers = useMemo(() => {
    if (!width) return null;
    const scale = width / size, ranges = stripRanges(scale);
    const at = (output: number[]) => progress.interpolate({ inputRange: ranges.input, outputRange: output, extrapolate: 'clamp' });
    return {
      window: { left: (crop.x + TRIM) * scale, top: (crop.y + TRIM) * scale, width: (crop.width - TRIM * 2) * scale, height: (crop.height - TRIM * 2) * scale },
      sheet: { width: columns * crop.width * scale, height: READING_SHEET.rows * crop.height * scale },
      lower: [{ translateX: at(ranges.lowerX) }, { translateY: at(ranges.lowerY) }],
      upper: [{ translateX: at(ranges.upperX) }, { translateY: at(ranges.upperY) }],
      fade: at(ranges.fade),
    };
  }, [width, progress]);

  if (!mode) return null;
  return <View accessible accessibilityRole="image" accessibilityLabel="The Fairy is reading her book beside you"
    onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={[styles.frame, style]}>
    <Image source={art.base as number} fadeDuration={0} resizeMode="cover" style={styles.fill} />
    {mode === 'animated' && layers ? <View pointerEvents="none" style={[styles.window, layers.window]}>
      <Animated.Image source={art.sheet as number} fadeDuration={0} resizeMode="stretch"
        style={[styles.sheet, layers.sheet, { transform: layers.lower }]} />
      <Animated.Image source={art.sheet as number} fadeDuration={0} resizeMode="stretch"
        style={[styles.sheet, layers.sheet, { opacity: layers.fade, transform: layers.upper }]} />
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 1, overflow: 'hidden', borderRadius: 18, backgroundColor: '#3A2C3F' },
  fill: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  window: { position: 'absolute', overflow: 'hidden' },
  sheet: { position: 'absolute', left: 0, top: 0 },
});
