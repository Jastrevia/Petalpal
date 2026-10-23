import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlowerThumb } from '../garden/planting/FlowerThumb';
import { factAt, FLOWER_FACTS, WAKING_COPY, type FactLocale } from './flowerFacts';

// The app's display language is only known once the server answers, which is exactly what
// we are waiting for, so the last signed-in choice on this device is remembered (no user data).
const LOCALE_KEY = 'petalpal.displayLocale';
export function rememberDisplayLocale(locale?: string) {
  AsyncStorage.setItem(LOCALE_KEY, locale === 'zh-Hans' ? 'zh-Hans' : 'en').catch(() => undefined);
}

// A flower note card for slow waits. It appears only after `delayMs`, so a quick load never
// flashes it, and moves to the next flower every few seconds or on tap.
export function WakingFlowerFacts({ delayMs = 2500, showNote = true }: { delayMs?: number; showNote?: boolean }) {
  const [locale, setLocale] = useState<FactLocale>('en');
  const [visible, setVisible] = useState(delayMs === 0);
  const [start] = useState(() => Math.floor(Math.random() * FLOWER_FACTS.length));
  const [step, setStep] = useState(0);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LOCALE_KEY).then(value => { if (active && value === 'zh-Hans') setLocale('zh-Hans'); }).catch(() => undefined);
    const show = setTimeout(() => setVisible(true), delayMs);
    return () => { active = false; clearTimeout(show); };
  }, [delayMs]);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setStep(value => value + 1), 8000);
    return () => clearInterval(timer);
  }, [visible, step]);
  if (!visible) return null;
  const copy = WAKING_COPY[locale];
  const fact = factAt(start, step);
  return <View style={styles.wrap}>
    {showNote ? <Text style={styles.note}>{copy.note}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityHint={copy.next} onPress={() => setStep(value => value + 1)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <Text style={styles.kicker}>✿ {copy.did}</Text>
      <View style={styles.head}>
        <FactArt species={fact.species} name={fact.flower.en} />
        <Text accessibilityLiveRegion="polite" style={styles.flower}>{fact.flower[locale]}</Text>
      </View>
      <Text style={styles.text}>{fact.text[locale]}</Text>
      <Text style={styles.next}>{copy.next} →</Text>
    </Pressable>
  </View>;
}

const KEEPSAKE_ART: Record<string, number> = {
  CROCUS: require('../../../assets/keepsakes/crocus-brooch.webp'),
  SAFFRON: require('../../../assets/keepsakes/crocus-seed-pouch.webp'),
};
function FactArt({ species, name }: { species: string; name: string }) {
  if (KEEPSAKE_ART[species]) return <Image accessible={false} source={KEEPSAKE_ART[species]} style={styles.art} resizeMode="contain" />;
  return <FlowerThumb speciesCode={species} name={name} image="" size={44} style={styles.art} />;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  art: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3ECD6' },
  wrap: { alignItems: 'center', gap: 12, width: '100%', maxWidth: 340 },
  note: { fontSize: 13, lineHeight: 19, color: '#5d7263', textAlign: 'center' },
  card: { width: '100%', padding: 16, gap: 6, borderRadius: 18, borderWidth: 1, borderColor: '#D4BD85',
    backgroundColor: '#FFFBF0', boxShadow: '0 4px 14px #4E472622' },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, color: '#B8913F' },
  flower: { fontFamily: 'serif', fontSize: 20, fontWeight: '600', color: '#254E43' },
  text: { fontFamily: 'serif', fontSize: 15, lineHeight: 22, color: '#3D5A4C' },
  next: { marginTop: 4, fontSize: 12, color: '#6B7B69', alignSelf: 'flex-end' },
});
