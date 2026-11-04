import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { FairyGlide, FairyPortrait, FairyReach, Hover, glideWidth, portraitWidth, REACH_HAND, reachWidth } from './FairyArt';
import { FINALE_LINE } from './onboardingCopy';
import { serif } from './OnboardingGuide';

const EASE = Easing.inOut(Easing.cubic);
// Beats, in ms from the start of the finale.
export const FINALE_TIMELINE = {
  veilOut: [0, 1100], arrive: [200, 1500], line: 1500, reach: [2700, 700], contact: [3400, 700],
  lead: [4300, 2100], end: 6600,
} as const;

// Phase nine. The veil lifts, she returns to the centre and says "It's your turn!", holds out
// her hand (her approved open-hand pose), and a warm light closes around the visitor's hand.
// She then turns into her approved glide and leads that light into the Garden, which is
// already easing open behind her. When she is gone, the Garden is fully interactive.
// The repository has no hand-in-hand or lead-away artwork (see report), so the hold and the
// lead are carried by light and motion around approved poses rather than by new drawings.
export function FairyFinale({ onLead, onDone }: { onLead: () => void; onDone: () => void }) {
  const screen = useWindowDimensions();
  const reduced = useReducedMotion();
  const heroHeight = Math.min(screen.height * .42, 400);
  const portrait = { width: portraitWidth(heroHeight), height: heroHeight };
  const reach = { width: reachWidth(heroHeight), height: heroHeight };
  const glideHeight = heroHeight * .8;
  const glide = { width: glideWidth(glideHeight), height: glideHeight };
  const centre = { x: screen.width / 2, y: screen.height * .44 };

  const veil = useSharedValue(1), arrive = useSharedValue(0), reachMix = useSharedValue(0);
  const contact = useSharedValue(0), lead = useSharedValue(0), line = useSharedValue(0);
  const [showLine, setShowLine] = useState(false);

  useEffect(() => {
    const k = reduced ? .25 : 1;
    const t = FINALE_TIMELINE;
    veil.value = withTiming(0, { duration: t.veilOut[1] * k, easing: EASE });
    arrive.value = withDelay(t.arrive[0] * k, withTiming(1, { duration: t.arrive[1] * k, easing: Easing.out(Easing.cubic) },
      finished => { if (finished) runOnJS(setShowLine)(true); }));
    line.value = withDelay(t.line * k, withSequence(withTiming(1, { duration: 500 * k }), withDelay((t.lead[0] - t.line) * k, withTiming(0, { duration: 600 * k }))));
    reachMix.value = withDelay(t.reach[0] * k, withTiming(1, { duration: t.reach[1] * k, easing: EASE }));
    contact.value = withDelay(t.contact[0] * k, withSequence(withTiming(1, { duration: t.contact[1] * k, easing: Easing.out(Easing.quad) }),
      withTiming(.75, { duration: 300 * k })));
    lead.value = withDelay(t.lead[0] * k, withTiming(1, { duration: t.lead[1] * k, easing: Easing.inOut(Easing.quad) },
      finished => { if (finished) runOnJS(onDone)(); }));
    const leadTimer = setTimeout(onLead, t.lead[0] * k);
    return () => clearTimeout(leadTimer);
  }, []);

  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: line.value, transform: [{ translateY: (1 - line.value) * 10 }] }));
  // Standing figure (portrait, then the open hand) at the centre.
  const standStyle = useAnimatedStyle(() => ({
    opacity: arrive.value * (1 - lead.value * 4 > 0 ? 1 - lead.value * 4 : 0),
    transform: [{ translateY: (1 - arrive.value) * screen.height * .3 }, { scale: .4 + .6 * arrive.value + contact.value * .03 }],
  }));
  const portraitStyle = useAnimatedStyle(() => ({ opacity: 1 - reachMix.value }));
  const reachStyle = useAnimatedStyle(() => ({ opacity: reachMix.value }));
  // Her hand in the reach pose, in screen space (the reach pose is centred like the portrait).
  const hand = { x: centre.x - reach.width / 2 + reach.width * REACH_HAND.x, y: centre.y - reach.height / 2 + reach.height * REACH_HAND.y };
  // The lead: a gentle curve from her place into the Garden, up and to the right, getting smaller.
  const leadPoint = (t: number) => {
    'worklet';
    return { x: centre.x + t * screen.width * .42, y: centre.y - Math.sin(t * Math.PI * .5) * screen.height * .2, scale: 1 - t * .72 };
  };
  const glideStyle = useAnimatedStyle(() => {
    const p = leadPoint(lead.value);
    const fadeIn = Math.min(1, lead.value * 6), fadeOut = lead.value > .8 ? (1 - lead.value) / .2 : 1;
    return { opacity: fadeIn * fadeOut, transform: [{ translateX: p.x - glide.width / 2 }, { translateY: p.y - glide.height / 2 }, { scale: p.scale }] };
  });
  // The held hand: light gathers at her fingers, then travels with her, a little behind.
  const lightStyle = useAnimatedStyle(() => {
    const p = leadPoint(Math.max(0, lead.value - .06));
    const x = hand.x + (p.x - centre.x - glide.width * .32 * p.scale) * Math.min(1, lead.value * 3);
    const y = hand.y + (p.y - centre.y + glide.height * .05 * p.scale) * Math.min(1, lead.value * 3);
    const fadeOut = lead.value > .85 ? (1 - lead.value) / .15 : 1;
    return { opacity: contact.value * fadeOut, transform: [{ translateX: x - 40 }, { translateY: y - 40 }, { scale: .6 + contact.value * .5 }] };
  });

  return <View style={StyleSheet.absoluteFill}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil, veilStyle]} />
    {/* The Garden waits until she has led you in. */}
    <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={() => undefined} />
    <Animated.View pointerEvents="none" style={[styles.figure, { left: centre.x - Math.max(portrait.width, reach.width) / 2,
      top: centre.y - heroHeight / 2, width: Math.max(portrait.width, reach.width), height: heroHeight }, standStyle]}>
      <Hover amplitude={5} period={2800}>
        <View style={{ width: Math.max(portrait.width, reach.width), height: heroHeight, alignItems: 'center' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center' }, portraitStyle]}><FairyPortrait height={heroHeight} /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center' }, reachStyle]}><FairyReach height={heroHeight} /></Animated.View>
        </View>
      </Hover>
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.light, lightStyle]} />
    <Animated.View pointerEvents="none" style={[styles.glide, glideStyle]}><FairyGlide height={glide.height} /></Animated.View>
    {showLine ? <Animated.View pointerEvents="none" entering={reduced ? undefined : FadeIn.duration(500)}
      style={[styles.lineWrap, { top: centre.y + heroHeight / 2 + 8 }, lineStyle]}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.line}>{FINALE_LINE}</Text>
    </Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create({
  veil: { backgroundColor: 'rgba(10, 34, 32, 0.56)' },
  figure: { position: 'absolute', alignItems: 'center' },
  glide: { position: 'absolute', left: 0, top: 0 },
  light: { position: 'absolute', left: 0, top: 0, width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255, 244, 214, 0.75)', boxShadow: '0 0 34px 18px rgba(255, 228, 160, 0.6)' },
  lineWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  line: { fontFamily: serif, fontSize: 34, lineHeight: 42, color: '#FFF8E4', textAlign: 'center', letterSpacing: .5,
    textShadowColor: 'rgba(30, 60, 48, 0.55)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 } },
});
