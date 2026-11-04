import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FairyGlide, Hover } from './FairyArt';
import { GUIDE_FAIRY, guidePlacement, type Box } from './onboardingLayout';

export const GOLD = '#C9A55C';
export const INK = '#2E5A4A';
export const PAPER = '#FBF6E9';
export const serif = Platform.select({ ios: 'Georgia', web: 'Georgia, "Songti SC", "Noto Serif SC", serif', default: 'serif' });

// The small guide: the Fairy beside a paper speech bubble. She flies to each new highlight
// and settles beside it without covering it.
export function OnboardingGuide({ anchor, text, speaker, showNext, onNext, nextLabel, prefer = 'auto', children, maxWidth = 320 }: {
  anchor: Box | null;
  text: string;
  speaker?: string | null;
  showNext: boolean;
  onNext?: () => void;
  nextLabel: string;
  prefer?: 'auto' | 'below' | 'above';
  children?: ReactNode;
  maxWidth?: number;
}) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const bubbleWidth = Math.min(maxWidth, screen.width - insets.left - insets.right - 24 - GUIDE_FAIRY.width - 6);
  const [size, setSize] = useState({ width: GUIDE_FAIRY.width + 6 + bubbleWidth, height: 120 });
  const place = guidePlacement(anchor, screen, size, insets, prefer);
  const x = useSharedValue(place.x), y = useSharedValue(place.y);
  const placed = useRef(false);
  useEffect(() => {
    // The first placement appears in place; later ones are a short, eased flight.
    const timing = { duration: reduced || !placed.current ? 0 : 680, easing: Easing.inOut(Easing.cubic) };
    placed.current = true;
    x.value = withTiming(place.x, timing); y.value = withTiming(place.y, timing);
  }, [place.x, place.y, reduced, x, y]);
  const position = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  return <Animated.View pointerEvents="box-none" style={[styles.root, position]}
    onLayout={event => {
      const { width, height } = event.nativeEvent.layout;
      if (Math.abs(width - size.width) > 1 || Math.abs(height - size.height) > 1) setSize({ width, height });
    }}>
    <View pointerEvents="none" style={styles.fairy}>
      <Hover amplitude={4}><FairyGlide height={GUIDE_FAIRY.height} /></Hover>
    </View>
    <Animated.View key={text} entering={reduced ? undefined : FadeIn.duration(320)} accessibilityLiveRegion="polite"
      style={[styles.bubble, { width: bubbleWidth }]}>
      <View style={styles.tail} />
      {speaker ? <Text style={styles.speaker}>✦ {speaker}</Text> : null}
      <Text style={styles.text}>{text}</Text>
      {children}
      {showNext ? <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={onNext} hitSlop={10}
        style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
        <Text style={styles.nextArrow}>›</Text>
      </Pressable> : null}
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, top: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6, zIndex: 20 },
  fairy: { width: GUIDE_FAIRY.width, height: GUIDE_FAIRY.height, alignItems: 'center', justifyContent: 'center' },
  bubble: { marginTop: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderRadius: 18,
    backgroundColor: PAPER, borderWidth: 1, borderColor: GOLD,
    boxShadow: 'inset 0 0 0 3px #FFFDF6, 0 6px 22px rgba(18, 52, 46, 0.28)', gap: 8 },
  tail: { position: 'absolute', left: -6, top: 22, width: 12, height: 12, backgroundColor: PAPER,
    borderLeftWidth: 1, borderBottomWidth: 1, borderColor: GOLD, transform: [{ rotate: '45deg' }] },
  speaker: { fontFamily: serif, fontSize: 12, letterSpacing: .6, color: '#9B7B3C' },
  text: { fontFamily: serif, fontSize: 16, lineHeight: 24, color: INK },
  next: { alignSelf: 'flex-end', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2F6F67', borderWidth: 1.5, borderColor: '#D9C48D', boxShadow: 'inset 0 0 0 2px #8FB9A6' },
  nextArrow: { color: '#FFF8E6', fontSize: 22, lineHeight: 24, marginTop: -2, fontFamily: serif },
  pressed: { opacity: .75, transform: [{ scale: .95 }] },
});
