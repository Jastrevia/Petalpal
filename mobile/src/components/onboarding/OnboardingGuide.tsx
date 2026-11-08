import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FairyAnimationController, type FairyAnimationState } from '../fairy/FairyAnimationController';
import { GUIDE_FAIRY, guidePlacement, type Box } from './onboardingLayout';

export const GOLD = '#C9A55C';
export const INK = '#2E5A4A';
export const PAPER = '#FBF6E9';
export const serif = Platform.select({ ios: 'Georgia', web: 'Georgia, "Songti SC", "Noto Serif SC", serif', default: 'serif' });

// Module-level persistent position so the fairy never resets to center when remounted across steps
const persistentGuidePos: { x: number; y: number; initialized: boolean } = {
  x: 0,
  y: 0,
  initialized: false,
};

// The tutorial guide: the Fairy beside a paper speech bubble.
// When moving between highlights, she smoothly transitions to the approved Fly / Glide animation,
// glides along an eased flight trajectory, and settles naturally into continuous living Idle upon arrival.
export function OnboardingGuide({
  step,
  anchor,
  text,
  speaker,
  showNext,
  onNext,
  nextLabel,
  prefer = 'auto',
  children,
  maxWidth = 320,
}: {
  step?: string;
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
  const extraHeight = step === 'fairy.feed' || step === 'fairy.keepsakes' ? 76 : step === 'friends.house' ? 116 : 0;
  const estLines = Math.max(2, Math.ceil((text?.length || 20) / 14));
  const size = {
    width: GUIDE_FAIRY.width + 6 + bubbleWidth,
    height: Math.max(120, 64 + estLines * 24 + extraHeight + (showNext ? 38 : 0)),
  };
  const place = guidePlacement(anchor, screen, size, insets, prefer);

  // Initial stage center position where the fairy was during intro
  const introCenterX = (screen.width - GUIDE_FAIRY.width) / 2;
  const introCenterY = Math.max(insets.top + 20, screen.height * 0.28);

  const initialX = persistentGuidePos.initialized ? persistentGuidePos.x : introCenterX;
  const initialY = persistentGuidePos.initialized ? persistentGuidePos.y : introCenterY;

  const [fairyState, setFairyState] = useState<FairyAnimationState>(
    persistentGuidePos.initialized ? 'idle' : 'fly'
  );
  const x = useSharedValue(initialX);
  const y = useSharedValue(initialY);
  const flightBank = useSharedValue(0);
  const prevPlace = useRef({ x: initialX, y: initialY });

  useEffect(() => {
    const dx = place.x - prevPlace.current.x;
    const dy = place.y - prevPlace.current.y;
    const dist = Math.hypot(dx, dy);

    if (reduced) {
      persistentGuidePos.initialized = true;
      persistentGuidePos.x = place.x;
      persistentGuidePos.y = place.y;
      prevPlace.current = { x: place.x, y: place.y };
      x.value = place.x;
      y.value = place.y;
      setFairyState('idle');
      return;
    }

    if (dist < 12) {
      persistentGuidePos.initialized = true;
      persistentGuidePos.x = place.x;
      persistentGuidePos.y = place.y;
      prevPlace.current = { x: place.x, y: place.y };
      x.value = place.x;
      y.value = place.y;
      setFairyState('idle');
      return;
    }

    // Subsequent step-to-step flights: transition into approved Fly / Glide animation
    setFairyState('fly');
    persistentGuidePos.initialized = true;
    persistentGuidePos.x = place.x;
    persistentGuidePos.y = place.y;
    prevPlace.current = { x: place.x, y: place.y };

    const duration = Math.min(1000, Math.max(700, dist * 1.8));
    const bankDir = dx >= 0 ? 1 : -1;

    flightBank.value = withTiming(bankDir * 6, { duration: duration * 0.4, easing: Easing.out(Easing.quad) }, () => {
      flightBank.value = withTiming(0, { duration: duration * 0.6, easing: Easing.inOut(Easing.quad) });
    });

    const flightEase = Easing.inOut(Easing.cubic);
    x.value = withTiming(place.x, { duration, easing: flightEase });
    y.value = withTiming(place.y, { duration, easing: flightEase }, finished => {
      if (finished) runOnJS(setFairyState)('idle');
    });
  }, [place.x, place.y, reduced]);

  const positionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
    ],
  }));

  const fairyTiltStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${flightBank.value}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.root, positionStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.fairy, fairyTiltStyle]}>
        <FairyAnimationController
          state={fairyState}
          characterHeight={GUIDE_FAIRY.height}
          loop={fairyState === 'idle' || fairyState === 'fly'}
        />
      </Animated.View>
      <Animated.View
        key={text}
        entering={reduced ? undefined : FadeIn.duration(320)}
        accessibilityLiveRegion="polite"
        style={[styles.bubble, { width: bubbleWidth }]}
      >
        <View style={styles.tail} />
        {speaker ? <Text style={styles.speaker}>✦ {speaker}</Text> : null}
        <Text style={styles.text}>{text}</Text>
        {children}
        {showNext ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nextLabel}
            onPress={onNext}
            hitSlop={10}
            style={({ pressed }) => [styles.next, pressed && styles.pressed]}
          >
            <Text style={styles.nextArrow}>›</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    zIndex: 20,
    overflow: 'visible',
  },
  fairy: {
    width: GUIDE_FAIRY.width,
    height: GUIDE_FAIRY.height,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  bubble: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 18,
    backgroundColor: PAPER,
    borderWidth: 1,
    borderColor: GOLD,
    boxShadow: 'inset 0 0 0 3px #FFFDF6, 0 6px 22px rgba(18, 52, 46, 0.28)',
    gap: 8,
  },
  tail: {
    position: 'absolute',
    left: -6,
    top: 22,
    width: 12,
    height: 12,
    backgroundColor: PAPER,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: GOLD,
    transform: [{ rotate: '45deg' }],
  },
  speaker: {
    fontFamily: serif,
    fontSize: 12,
    letterSpacing: 0.6,
    color: '#9B7B3C',
  },
  text: {
    fontFamily: serif,
    fontSize: 16,
    lineHeight: 24,
    color: INK,
  },
  next: {
    alignSelf: 'flex-end',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F6F67',
    borderWidth: 1.5,
    borderColor: '#D9C48D',
    boxShadow: 'inset 0 0 0 2px #8FB9A6',
    zIndex: 5,
  },
  nextArrow: {
    color: '#FFF8E6',
    fontSize: 22,
    lineHeight: 24,
    marginTop: -2,
    fontFamily: serif,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
});
