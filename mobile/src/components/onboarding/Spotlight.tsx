import { useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Box } from './onboardingLayout';

// The tour's spotlight: a soft veil over everything except one rounded opening that tracks a
// measured component. Taps outside the opening are absorbed (nothing behind it can be hit by
// accident); inside it they either reach the real control or act as Next.
const VEIL = 'rgba(10, 34, 32, 0.56)';
const EASE = Easing.inOut(Easing.cubic);

export function Spotlight({ rect, dim = true, hole = 'pass', padding = 8, radius = 18, onHolePress, holeLabel }: {
  rect: Box | null;
  dim?: boolean;
  hole?: 'pass' | 'next';
  padding?: number;
  radius?: number;
  onHolePress?: () => void;
  holeLabel?: string;
}) {
  const screen = useWindowDimensions();
  const reduced = useReducedMotion();
  const target = rect ? { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 } : null;
  const x = useSharedValue(target?.x ?? screen.width / 2), y = useSharedValue(target?.y ?? screen.height / 2);
  const w = useSharedValue(target?.width ?? 0), h = useSharedValue(target?.height ?? 0);
  const shown = useSharedValue(0);
  const glow = useSharedValue(.55);
  useEffect(() => {
    shown.value = withTiming(1, { duration: reduced ? 0 : 420, easing: EASE });
    glow.value = reduced ? .7 : withRepeat(withSequence(withTiming(1, { duration: 1300, easing: EASE }),
      withTiming(.55, { duration: 1300, easing: EASE })), -1);
  }, [reduced, shown, glow]);
  useEffect(() => {
    if (!target) {
      // No opening: close it softly onto the centre of the screen.
      const timing = { duration: reduced ? 0 : 380, easing: EASE };
      x.value = withTiming(screen.width / 2, timing); y.value = withTiming(screen.height / 2, timing);
      w.value = withTiming(0, timing); h.value = withTiming(0, timing);
      return;
    }
    const first = w.value === 0 && h.value === 0;
    const timing = { duration: reduced || first ? 0 : 520, easing: EASE };
    x.value = withTiming(target.x, timing); y.value = withTiming(target.y, timing);
    w.value = withTiming(target.width, timing); h.value = withTiming(target.height, timing);
  }, [target?.x, target?.y, target?.width, target?.height, screen.width, screen.height, reduced]);
  const opening = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value, opacity: shown.value }));
  const ring = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value,
    opacity: shown.value * (w.value > 1 ? glow.value : 0) }));
  const veilOnly = useAnimatedStyle(() => ({ opacity: shown.value * (w.value > 1 ? 0 : 1) }));

  const blockers = target ? [
    { left: 0, top: 0, width: screen.width, height: Math.max(0, target.y) },
    { left: 0, top: target.y + target.height, width: screen.width, height: Math.max(0, screen.height - target.y - target.height) },
    { left: 0, top: target.y, width: Math.max(0, target.x), height: target.height },
    { left: target.x + target.width, top: target.y, width: Math.max(0, screen.width - target.x - target.width), height: target.height },
  ] : [{ left: 0, top: 0, width: screen.width, height: screen.height }];

  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {dim ? <>
      {/* The opening's outer shadow is the veil, so the opening keeps soft rounded corners. */}
      <Animated.View pointerEvents="none" style={[styles.opening, { borderRadius: radius, boxShadow: `0 0 0 4000px ${VEIL}` }, opening]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: VEIL }, veilOnly]} />
      <Animated.View pointerEvents="none" style={[styles.opening, styles.ring, { borderRadius: radius }, ring]} />
    </> : null}
    {blockers.map((style, index) => <Pressable key={index} accessible={false} onPress={() => undefined}
      style={[styles.blocker, style]} />)}
    {target && hole === 'next' ? <Pressable accessibilityRole="button" accessibilityLabel={holeLabel} onPress={onHolePress}
      style={[styles.blocker, { left: target.x, top: target.y, width: target.width, height: target.height, borderRadius: radius }]} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  opening: { position: 'absolute' },
  ring: { borderWidth: 1.5, borderColor: '#F1DFA8', boxShadow: '0 0 18px 3px rgba(255, 236, 178, 0.55), inset 0 0 12px rgba(255, 240, 200, 0.35)' },
  blocker: { position: 'absolute', backgroundColor: 'transparent', cursor: 'auto' },
});
