import { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { FAIRY_ANIMATION_ASSETS, type FairyAnimationState, type FairyAnimationStageProps } from './fairyAnimationAssets';

// iPhone. Her actions are HEVC videos with alpha, made from the same approved WebM frames (every
// frame checked: alpha exact, colour within 2/255). The phone's video hardware decodes them, so a
// busy Garden cannot hold a frame back, and an action reports when it has really played to its end,
// so the tour moves on from her last frame, never from a clock. Idle is the same still painting as
// everywhere else. An action is mounted fresh for each request (first frame first), drawn invisibly
// until that frame is on screen, and the picture before it stays until then.
export const STAGE_REPORTS_END = true;
const HOVER_PT = 4, HOVER_HALF_PERIOD_MS = 1300;

// Required here, not in fairyAnimationAssets.ts, so the web and Android bundles do not carry them.
const VIDEOS = {
  fly: require('@/assets/garden/fairy/onboarding-suite/fairy-fly.mov'),
  greet: require('@/assets/garden/fairy/onboarding-suite/fairy-greet.mov'),
  celebrate: require('@/assets/garden/fairy/onboarding-suite/fairy-celebrate.mov'),
} as const;
// The tour guide's copy, made at the 370 px it is drawn (Lanczos from the same frames).
const FLY_GUIDE = { video: require('@/assets/garden/fairy/onboarding-suite/fairy-fly-guide.mov'), pixelHeight: 370 };

function source(state: Exclude<FairyAnimationState, 'idle'>, height: number) {
  return state === 'fly' && height * PixelRatio.get() <= FLY_GUIDE.pixelHeight ? FLY_GUIDE.video : VIDEOS[state];
}

function Action({ state, height, loop, visible, current, onFirstFrame, onEnd }: {
  state: Exclude<FairyAnimationState, 'idle'>; height: number; loop: boolean; visible: boolean; current: boolean;
  onFirstFrame?: () => void; onEnd?: () => void;
}) {
  const ended = useRef(onEnd);
  ended.current = onEnd;
  const player = useVideoPlayer(source(state, height), video => {
    video.muted = true;
    video.audioMixingMode = 'mixWithOthers'; // never pauses the owner's music
    video.loop = loop;
    video.play();
  });
  useEffect(() => {
    const subscription = player.addListener('playToEnd', () => ended.current?.());
    return () => subscription.remove();
  }, [player]);
  useEffect(() => { player.loop = loop; }, [player, loop]);
  // Once the next action has been asked for, this one holds its frame until that one is on screen.
  useEffect(() => { if (!current) player.pause(); }, [player, current]);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0 }]}>
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false}
      allowsPictureInPicture={false} allowsVideoFrameAnalysis={false} onFirstFrameRender={onFirstFrame} />
  </View>;
}

export function FairyAnimationStage({ play, loop, reduced, onStart, onEnd, height }: FairyAnimationStageProps) {
  const wanted = play.state === 'idle' ? 'idle' : `${play.state}:${play.id}`;
  // What is fully on screen: 'idle', an action key, or nothing yet (first action still loading).
  const [onScreen, setOnScreen] = useState<string | null>(wanted === 'idle' ? 'idle' : null);
  if (wanted === 'idle' && onScreen !== 'idle') setOnScreen('idle');
  const outgoing = onScreen && onScreen !== 'idle' && onScreen !== wanted ? onScreen : null;

  const resting = onScreen === 'idle' || onScreen === null;
  const phase = useSharedValue(0), amp = useSharedValue(0);
  useEffect(() => {
    const hover = resting && !reduced;
    amp.value = withTiming(hover ? HOVER_PT : 0, { duration: 240 });
    if (hover) phase.value = withRepeat(withTiming(1, { duration: HOVER_HALF_PERIOD_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
    else cancelAnimation(phase);
  }, [resting, reduced, amp, phase]);
  const hoverStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -phase.value * amp.value }] }));

  const action = (key: string, visible: boolean, current: boolean) => {
    const state = key.split(':')[0] as Exclude<FairyAnimationState, 'idle'>;
    return <Action key={key} state={state} height={height} loop={current && loop} visible={visible} current={current}
      onFirstFrame={current ? () => { setOnScreen(key); onStart(play.id); } : undefined}
      onEnd={current ? () => onEnd?.(play.id) : undefined} />;
  };

  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, hoverStyle]}>
    <Image source={FAIRY_ANIMATION_ASSETS.idle.webp} style={[StyleSheet.absoluteFill, { opacity: resting ? 1 : 0 }]}
      contentFit="contain" accessible={false} />
    {outgoing ? action(outgoing, true, false) : null}
    {wanted !== 'idle' ? action(wanted, onScreen === wanted, true) : null}
  </Animated.View>;
}
