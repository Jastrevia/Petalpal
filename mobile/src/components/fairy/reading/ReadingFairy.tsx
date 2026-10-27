import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  createReadingFairyController, READING_TIMING, readingFrameCues, resolveReadingFrame,
  type ReadingSession, type ReadingSnapshot, type ReadingTiming,
} from './readingFairyController';

// Six poses from the reading storyboard, registered on one shared frame: the face, hair, wings and
// room all come from the reading pose, and only the arm, hand, book and page area changes.
export const READING_FRAMES = [
  require('@/assets/garden/fairy/reading-v1/reading_01.webp'),
  require('@/assets/garden/fairy/reading-v1/reading_02.webp'),
  require('@/assets/garden/fairy/reading-v1/reading_03.webp'),
  require('@/assets/garden/fairy/reading-v1/reading_04.webp'),
  require('@/assets/garden/fairy/reading-v1/reading_05.webp'),
  require('@/assets/garden/fairy/reading-v1/reading_06.webp'),
];

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
export function ReadingFairy({ session, timing, frames, style }: {
  session: ReadingSession; timing?: ReadingTiming; frames?: readonly unknown[]; style?: StyleProp<ViewStyle>;
}) {
  const { snapshot } = useReadingFairy(session, timing);
  return <ReadingFairyView snapshot={snapshot} frames={frames} style={style} />;
}

// Draws a controller snapshot (for owners that hold the controller themselves).
export function ReadingFairyView({ snapshot, frames = READING_FRAMES, style }: {
  snapshot: ReadingSnapshot; frames?: readonly unknown[]; style?: StyleProp<ViewStyle>;
}) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);

  const opacity = useRef(frames.map((_, index) => new Animated.Value(index === 0 ? 1 : 0))).current;
  const shown = useRef(0);
  const fade = useRef<Animated.CompositeAnimation | null>(null);
  const [layers, setLayers] = useState<{ top: number; under: number | null }>({ top: 0, under: null });

  // Crossfade: the new pose fades in over the current one, which is hidden once it is covered.
  const show = useCallback((target: number, fadeMs: number) => {
    const frame = resolveReadingFrame(target, frames);
    if (frame === null || frame === shown.current) return;
    fade.current?.stop();
    const from = shown.current;
    opacity.forEach((value, index) => { if (index !== from) value.setValue(0); });
    opacity[from].setValue(1);
    shown.current = frame;
    setLayers({ top: frame, under: from });
    const animation = Animated.timing(opacity[frame], { toValue: 1, duration: fadeMs, easing: Easing.inOut(Easing.quad),
      useNativeDriver: Platform.OS !== 'web' });
    fade.current = animation;
    animation.start(({ finished }) => {
      if (!finished || shown.current !== frame) return;
      opacity[from].setValue(0);
      setLayers({ top: frame, under: null });
    });
  }, [frames, opacity]);

  // Each state's poses are cued from when the state began, so a re-render never replays them.
  useEffect(() => {
    const since = Date.now() - snapshot.enteredAt;
    const handles = readingFrameCues(snapshot.state, snapshot.durationMs).map(cue =>
      setTimeout(() => show(reduced ? 0 : cue.frame, reduced ? 0 : cue.fadeMs), Math.max(0, cue.atMs - since)));
    return () => handles.forEach(clearTimeout);
  }, [snapshot.state, snapshot.enteredAt, snapshot.durationMs, reduced, show]);
  useEffect(() => () => fade.current?.stop(), []);

  if (resolveReadingFrame(0, frames) === null) return null;
  return <View accessible accessibilityRole="image" accessibilityLabel="The Fairy is reading her book beside you"
    style={[styles.frame, style]}>
    {frames.map((source, index) => source ? <Animated.View key={index} pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: opacity[index], zIndex: index === layers.top ? 2 : index === layers.under ? 1 : 0 }]}>
      <Image source={source as number} fadeDuration={0} resizeMode="cover" style={styles.image} />
    </Animated.View> : null)}
  </View>;
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 1, overflow: 'hidden', borderRadius: 18, backgroundColor: '#3A2C3F' },
  image: { width: '100%', height: '100%' },
});
