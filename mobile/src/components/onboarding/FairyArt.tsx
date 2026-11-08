import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { FIRST_APPROVED_LAYERS } from '../fairy/fairyExtractedAssets';

// The tour shows only the approved Fairy artwork, unchanged: the first-approved layered
// painting (her portrait), the approved glide pose (fly-v1) and the approved open-hand pose of
// the mailbox atlas. Motion is rigid and small (hover, a breath of wing), never redrawn.

// Opaque bounds measured from the source PNGs.
const PORTRAIT = { canvas: 1254, x: 405, y: 45, width: 455, height: 1130, wingPivot: { x: 662, y: 365 } };
const GLIDE = { width: 1086, height: 1448, x: 51, y: 20, w: 1012, h: 1352 };
// Mailbox atlas cell 0 (452 × 627 of 1254 × 1254): standing, one open hand held out to her right.
const REACH = { atlas: 1254, x: 29, y: 17, width: 419, height: 602, hand: { x: 40, y: 134 } };

export const portraitWidth = (height: number) => height * PORTRAIT.width / PORTRAIT.height;
export const glideWidth = (height: number) => height * GLIDE.w / GLIDE.h;
export const reachWidth = (height: number) => height * REACH.width / REACH.height;
/** Where her held-out hand is inside the reach pose box, as a fraction of its size. */
export const REACH_HAND = { x: (REACH.hand.x - REACH.x) / REACH.width, y: (REACH.hand.y - REACH.y) / REACH.height };

function useWingBeat() {
  const reduced = useReducedMotion();
  const beat = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    beat.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced, beat]);
  return beat;
}

/** The first-approved layered painting. Only her wings and trailing petals breathe. */
export function FairyPortrait({ height }: { height: number }) {
  const scale = height / PORTRAIT.height;
  const size = PORTRAIT.canvas * scale;
  const beat = useWingBeat();
  const origin = `${PORTRAIT.wingPivot.x / PORTRAIT.canvas * 100}% ${PORTRAIT.wingPivot.y / PORTRAIT.canvas * 100}%`;
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: `${(beat.value - .5) * 2.2}deg` }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: `${(.5 - beat.value) * 2.2}deg` }] }));
  const petals = useAnimatedStyle(() => ({ transform: [{ rotate: `${(beat.value - .5) * .5}deg` }] }));
  return <View pointerEvents="none" style={{ width: PORTRAIT.width * scale, height, overflow: 'visible' }}>
    <View style={{ position: 'absolute', left: -PORTRAIT.x * scale, top: -PORTRAIT.y * scale, width: size, height: size }}>
      {FIRST_APPROVED_LAYERS.map(layer => {
        const motion = layer.id === 'wing_left' ? left : layer.id === 'wing_right' ? right
          : layer.id === 'dress_side_petals' || layer.id === 'dress_back_petals' ? petals : null;
        return <Animated.Image key={layer.id} source={layer.source} accessible={false} resizeMode="stretch"
          style={[StyleSheet.absoluteFill, { width: size, height: size, transformOrigin: origin }, motion]} />;
      })}
    </View>
  </View>;
}

/** The approved glide pose, for the small guide and for flight. */
export function FairyGlide({ height }: { height: number }) {
  const scale = height / GLIDE.h;
  return <View pointerEvents="none" style={{ width: GLIDE.w * scale, height }}>
    <Image source={require('@/assets/garden/fairy/fly-v1/glide.png')} accessible={false} resizeMode="stretch"
      style={{ position: 'absolute', left: -GLIDE.x * scale, top: -GLIDE.y * scale, width: GLIDE.width * scale, height: GLIDE.height * scale }} />
  </View>;
}

/** Her approved open-hand pose (mailbox atlas, cell 0), reaching out. */
export function FairyReach({ height }: { height: number }) {
  const scale = height / REACH.height;
  return <View pointerEvents="none" style={{ width: REACH.width * scale, height, overflow: 'hidden' }}>
    <Image source={require('@/assets/garden/fairy/mailbox-v1/poses.png')} accessible={false} resizeMode="stretch"
      style={{ position: 'absolute', left: -REACH.x * scale, top: -REACH.y * scale, width: REACH.atlas * scale, height: REACH.atlas * scale }} />
  </View>;
}

/** A gentle hover for any of her poses. */
export function Hover({ children, amplitude = 5, period = 2600 }: { children: React.ReactNode; amplitude?: number; period?: number }) {
  const reduced = useReducedMotion();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    phase.value = withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced, period, phase]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (phase.value - .5) * 2 * amplitude },
    { rotate: `${(phase.value - .5) * 1.2}deg` }] }));
  return <Animated.View pointerEvents="none" style={style}>{children}</Animated.View>;
}
