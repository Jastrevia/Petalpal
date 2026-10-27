import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ReadingFairyView, useReadingFairy } from '@/components/fairy/reading/ReadingFairy';
import {
  READING_TIMING, READING_TIMING_FAST, type ReadingSession, type ReadingTiming,
} from '@/components/fairy/reading/readingFairyController';

// Development preview of the reading companion. "Fast" runs the same sequence on a short clock
// (page turn every 5–10 s, a thought after 20 s); production timing is the default.
export default function ReadingFairyTestScreen() {
  const [fast, setFast] = useState(true);
  if (!__DEV__) return <Redirect href="/" />;
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Reading companion</Text>
    <View style={styles.row}>
      {[true, false].map(value => <Pressable key={String(value)} onPress={() => setFast(value)}
        style={[styles.button, fast === value && styles.selected]}>
        <Text style={styles.buttonText}>{value ? 'Fast timing (dev)' : 'Production timing'}</Text>
      </Pressable>)}
    </View>
    <Preview key={fast ? 'fast' : 'production'} timing={fast ? READING_TIMING_FAST : READING_TIMING} />
  </ScrollView>;
}

function Preview({ timing }: { timing: ReadingTiming }) {
  const [session, setSession] = useState<ReadingSession>('active');
  const { controller, snapshot } = useReadingFairy(session, timing);
  // Read in the interval itself: the React Compiler would cache a render-time call on a stable object.
  const [{ pageTurnInMs, thinkingInMs }, setRemaining] = useState(controller.remaining);
  useEffect(() => {
    const id = setInterval(() => setRemaining(controller.remaining()), 250);
    return () => clearInterval(id);
  }, [controller]);
  const seconds = (ms: number | null) => ms === null ? '—' : `${Math.max(0, ms / 1000).toFixed(1)} s`;
  return <View style={styles.preview}>
    <ReadingFairyView snapshot={snapshot} style={styles.fairy} />
    <Text testID="reading-state" style={styles.state}>{snapshot.state}</Text>
    <Text style={styles.meta}>pages turned {snapshot.pagesTurned} · next page {seconds(pageTurnInMs)} · thinking in {seconds(thinkingInMs)}</Text>
    <View style={styles.row}>
      {(['active', 'paused', 'idle'] as const).map(value => <Pressable key={value} onPress={() => setSession(value)}
        style={[styles.button, session === value && styles.selected]}>
        <Text style={styles.buttonText}>{value === 'active' ? 'Run' : value === 'paused' ? 'Pause' : 'End session'}</Text>
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, alignItems: 'center', backgroundColor: '#211A24', minHeight: '100%' },
  title: { fontFamily: 'serif', fontSize: 24, color: '#F2E6D0' },
  preview: { width: '100%', maxWidth: 520, gap: 12, alignItems: 'center' },
  fairy: { maxWidth: 520 },
  state: { fontFamily: 'monospace', fontSize: 16, color: '#F2E6D0' },
  meta: { fontSize: 13, color: '#BFAFC6', textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#8C7A5B' },
  selected: { backgroundColor: '#5B4A63' },
  buttonText: { color: '#F2E6D0', fontSize: 14 },
});
