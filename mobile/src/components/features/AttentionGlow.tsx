import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

const FULL = { color: '#EFC95F', shrink: 1500, fade: 900, rounds: 8, rest: .7, glow: '0 0 14px 4px' };
// For a hint that sits in the Garden all day: paler and slower, and it soon settles.
const SOFT = { color: '#F7E7B4', shrink: 2800, fade: 1800, rounds: 4, rest: .4, glow: '0 0 10px 2px' };
const useNativeDriver = true;
// A gold halo for something easy to miss: a wide soft ring closes in on the edge, brightens as it
// arrives and fades, slowly enough to stay calm. After a few rounds the edge just keeps a quiet glow.
// Only transform and opacity animate, so it costs the frame nothing. `spread`: how far out it starts.
export function AttentionGlow({ radius, spread = 12, soft = false }: { radius: number; spread?: number; soft?: boolean }) {
  const look = soft ? SOFT : FULL;
  const ring = useRef(new Animated.Value(0)).current, rest = useRef(new Animated.Value(0)).current;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined, active = true;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduced => {
      if (!active) return;
      if (reduced) { rest.setValue(1); return; }
      loop = Animated.loop(Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: look.shrink, easing: Easing.inOut(Easing.sin), useNativeDriver }),
        Animated.timing(ring, { toValue: 2, duration: look.fade, easing: Easing.out(Easing.quad), useNativeDriver }),
      ]), { iterations: look.rounds });
      loop.start(({ finished }) => { if (finished && active) Animated.timing(rest, { toValue: 1, duration: look.fade, useNativeDriver }).start(); });
    });
    return () => { active = false; loop?.stop(); };
  }, [ring, rest, look]);
  const scaleX = size ? (size.width + spread * 2) / size.width : 1, scaleY = size ? (size.height + spread * 2) / size.height : 1;
  return <View testID="attention-glow" pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={({ nativeEvent: { layout } }) => {
    if (layout.width > 0 && layout.height > 0) setSize({ width: layout.width, height: layout.height });
  }}>
    <Animated.View style={[styles.edge, { borderColor: look.color, borderRadius: radius, opacity: rest.interpolate({ inputRange: [0, 1], outputRange: [0, look.rest] }) }]} />
    <Animated.View style={[styles.ring, { borderColor: look.color, boxShadow: `${look.glow} ${look.color}`, borderRadius: radius,
      opacity: ring.interpolate({ inputRange: [0, .25, 1, 2], outputRange: [0, .5, 1, 0] }),
      transform: [
        { scaleX: ring.interpolate({ inputRange: [0, 1, 2], outputRange: [scaleX, 1, 1] }) },
        { scaleY: ring.interpolate({ inputRange: [0, 1, 2], outputRange: [scaleY, 1, 1] }) },
      ] }]} />
  </View>;
}

const styles = StyleSheet.create({
  edge: { ...StyleSheet.absoluteFill, borderWidth: 2 },
  ring: { ...StyleSheet.absoluteFill, borderWidth: 2.5 },
});
