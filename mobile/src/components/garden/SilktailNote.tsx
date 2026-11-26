import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { foxMessage, foxVisitKey, type FoxReason } from './critters/silktailDays';

// The Silktail Fox's little note as it arrives: why it came (14 days of Events, or the holiday's
// greeting), on the same paper card as the Garden's lawn note. It shows once per visit on this
// device (a later visit to the Garden that day finds the fox already there), fades out by itself
// after NOTE_MS, and a tap closes it sooner.
const NOTE_MS = 7000;
const SEEN_KEY = 'petalpal.silktailNote.v1';

export function SilktailNote({ arrival, locale }: { arrival: { reason: FoxReason; date: string; at: number } | null; locale: 'en' | 'zh-Hans' }) {
  const [shown, setShown] = useState<{ text: string; at: number } | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!arrival) return;
    let live = true;
    const key = foxVisitKey(arrival.reason, arrival.date);
    AsyncStorage.getItem(SEEN_KEY).catch(() => null).then(seen => {
      if (!live || seen === key) return;
      AsyncStorage.setItem(SEEN_KEY, key).catch(() => undefined);
      setShown({ text: foxMessage(arrival.reason, locale), at: arrival.at });
    });
    return () => { live = false; };
  }, [arrival, locale]);
  useEffect(() => {
    if (!shown) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 600, delay: 900, useNativeDriver: true }).start();
    const timer = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }).start(() => setShown(null)), NOTE_MS);
    return () => clearTimeout(timer);
  }, [shown, opacity]);
  if (!shown) return null;
  const close = () => Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setShown(null));
  return <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity }]}>
    <Pressable testID="silktail-note" accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityHint={locale === 'zh-Hans' ? '点击关闭' : 'Tap to close'}
      onPress={close} style={styles.note}>
      <Text style={styles.text}>{shown.text}</Text>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: '16%', left: 16, right: 16, alignItems: 'center', zIndex: 36 },
  note: { maxWidth: 300, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 11, borderWidth: 1, borderColor: '#C9A95C', backgroundColor: '#FAF3DFF2', boxShadow: '0 4px 14px #0B1F1A44' },
  text: { fontFamily: 'serif', fontSize: 12.5, lineHeight: 17, color: '#254E43', textAlign: 'center' },
});
