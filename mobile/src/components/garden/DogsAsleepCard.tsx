import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useReducedMotion } from 'react-native-reanimated';
import { useDogHouseState } from './dogHouseState';

// A tap on the dogs' house while they shelter in it (dogHouseState.ts 'inside'): a small window into
// the house: the puppy and the Maltese asleep together on their cushion (oil-motion loop,
// 2026-11-21), until the weather clears (then it closes itself). Muted, looping, never pausing the owner's music; with
// motion reduced, its first frame stands still. A tap anywhere on it closes it.
const VIDEO = require('@/assets/garden/landmarks/dog-house/dogs-asleep.mp4');
const COPY = {
  en: { text: 'Snug in their house until the weather clears.', close: 'Close' },
  'zh-Hans': { text: '天气转好之前，它们在小屋里睡得正香。', close: '关闭' },
};

export function DogsAsleepCard({ locale, onClose }: { locale: 'en' | 'zh-Hans'; onClose: () => void }) {
  const reduced = useReducedMotion();
  const copy = COPY[locale];
  const player = useVideoPlayer(VIDEO, video => {
    video.muted = true;
    video.audioMixingMode = 'mixWithOthers';
    video.loop = true;
    if (!reduced) video.play();
  });
  useEffect(() => { if (reduced) player.pause(); else player.play(); }, [player, reduced]);
  // The weather cleared and they came out: nothing left to look in on.
  const phase = useDogHouseState().phase;
  useEffect(() => { if (phase === 'out') onClose(); }, [phase, onClose]);
  return <View style={styles.veil} pointerEvents="box-none">
    <Pressable testID="dogs-asleep-card" accessibilityRole="button" accessibilityLabel={`${copy.text} ${copy.close}`} onPress={onClose} style={styles.card}>
      <View style={styles.frame} pointerEvents="none">
        {/* (Sized by width and height: on web an absolutely placed <video> keeps its own 960 × 548.) */}
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false}
          allowsPictureInPicture={false} allowsVideoFrameAnalysis={false} />
      </View>
      <Text style={styles.text}>{copy.text}</Text>
    </Pressable>
  </View>;
}

const GOLD = '#C6A164';
const styles = StyleSheet.create({
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 360, borderRadius: 18, borderWidth: 1, borderColor: GOLD, backgroundColor: 'rgba(16, 52, 49, 0.94)', padding: 10, gap: 8 },
  // The loop is 960 × 548.
  frame: { width: '100%', aspectRatio: 960 / 548, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1D1A16' },
  video: { width: '100%', height: '100%' },
  text: { color: '#FFF4DC', fontFamily: 'serif', fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 6, paddingBottom: 2 },
});
