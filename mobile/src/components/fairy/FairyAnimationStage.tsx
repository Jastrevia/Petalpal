import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { FAIRY_ANIMATION_ASSETS, type FairyAnimationState, type FairyAnimationStageProps } from './fairyAnimationAssets';

// iOS / Android. Only what is needed is decoded: idle (one still painting, kept mounted so
// returning to her rest is instant) and the action being played. An action is mounted fresh for
// every request, so it starts on its first frame; it is drawn invisibly until that frame is on
// screen, and the picture before it stays (frozen, if it was an action) until then — never an
// empty or wrapped-around frame. The hover matches the web's idle float (4 pt, 2.6 s).
const HOVER_PT = 4, HOVER_HALF_PERIOD_MS = 1300;

export function FairyAnimationStage({ play, reduced, onStart }: FairyAnimationStageProps) {
  const wanted = play.state === 'idle' ? 'idle' : `${play.state}:${play.id}`;
  // What is fully on screen: 'idle', an action key, or nothing yet (first action still decoding).
  const [onScreen, setOnScreen] = useState<string | null>(wanted === 'idle' ? 'idle' : null);
  if (wanted === 'idle' && onScreen !== 'idle') setOnScreen('idle');
  const refs = useRef(new Map<string, Image | null>());

  const outgoing = onScreen && onScreen !== 'idle' && onScreen !== wanted ? onScreen : null;
  useEffect(() => {
    if (outgoing) refs.current.get(outgoing)?.stopAnimating().catch(() => undefined);
  }, [outgoing]);

  const resting = onScreen === 'idle' || onScreen === null;
  const phase = useSharedValue(0), amp = useSharedValue(0);
  useEffect(() => {
    const hover = resting && !reduced;
    amp.value = withTiming(hover ? HOVER_PT : 0, { duration: 240 });
    if (hover) phase.value = withRepeat(withTiming(1, { duration: HOVER_HALF_PERIOD_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
    else cancelAnimation(phase);
  }, [resting, reduced, amp, phase]);
  const hoverStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -phase.value * amp.value }] }));

  const action = (key: string, visible: boolean) => {
    const state = key.split(':')[0] as FairyAnimationState;
    return <Image
      key={key}
      ref={image => { if (image) refs.current.set(key, image); else refs.current.delete(key); }}
      source={FAIRY_ANIMATION_ASSETS[state].webp}
      style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0 }]}
      contentFit="contain"
      autoplay
      accessible={false}
      onDisplay={key === wanted ? () => { setOnScreen(key); onStart(play.id); } : undefined}
      // If an action cannot be drawn she stays at rest; the controller's grace timer still finishes it.
      onError={key === wanted ? () => setOnScreen('idle') : undefined}
    />;
  };

  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, hoverStyle]}>
    <Image
      source={FAIRY_ANIMATION_ASSETS.idle.webp}
      style={[StyleSheet.absoluteFill, { opacity: resting ? 1 : 0 }]}
      contentFit="contain"
      accessible={false}
    />
    {outgoing ? action(outgoing, true) : null}
    {wanted !== 'idle' ? action(wanted, onScreen === wanted) : null}
  </Animated.View>;
}
