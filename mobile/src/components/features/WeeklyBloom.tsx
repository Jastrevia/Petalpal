import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../../services/auth';
import { eventFlowers } from '../../services/events';
import { bouquetLayout, MOOD_SPECIES, shortDate, type MoodPoint, type ShortLocale } from '../../services/reflections';
import { clusterPicture } from '../garden/planting/flowerClusters';

// Weekly 2.0 opening (docs/product/WEEKLY_2.0.md): a crocus bud, then the week's bouquet, one painted flower per Event.
const BUD = require('@/assets/bond/checkin-bud.webp');
export const FLOWER = 44;

// Each Event's own flower species, from the owner's Garden (read once per owner while the app runs).
const speciesCache = new Map<string, Promise<Map<string, string>>>();
export function useEventSpecies() {
  const userId = useAuth().session?.user.id;
  const [species, setSpecies] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    if (!speciesCache.has(userId)) {
      const load = eventFlowers(userId).then(flowers => new Map(flowers.map(flower => [flower.sourceEventId!, flower.speciesCode])));
      load.catch(() => speciesCache.delete(userId));
      speciesCache.set(userId, load);
    }
    speciesCache.get(userId)!.then(map => { if (live) setSpecies(map); }, () => { if (live) setSpecies(new Map()); });
    return () => { live = false; };
  }, [userId]);
  return species;
}

// One opening per report while the app runs, shared by both pages of the spread (and the page-turn copies):
// tapping the bud on the left page brings in the bouquet, then the headline, then the right page.
type Bloom = { bloomed: boolean; bud: Animated.Value; headline: Animated.Value; rest: Animated.Value; rise: Animated.Value[]; listeners: Set<() => void> };
const blooms = new Map<string, Bloom>();
function bloomFor(key: string, flowers: number, open: boolean) {
  let entry = blooms.get(key);
  if (!entry) {
    const start = open ? 1 : 0;
    entry = { bloomed: open, bud: new Animated.Value(1), headline: new Animated.Value(start), rest: new Animated.Value(start),
      rise: Array.from({ length: flowers }, () => new Animated.Value(start)), listeners: new Set() };
    blooms.set(key, entry);
  }
  return entry;
}
export function useBloom(key: string, flowers: number, { enabled, reducedMotion }: { enabled: boolean; reducedMotion: boolean }) {
  const entry = bloomFor(key, flowers, !enabled || reducedMotion);
  const bloomed = useSyncExternalStore(listener => { entry.listeners.add(listener); return () => { entry.listeners.delete(listener); }; },
    () => entry.bloomed);
  function bloom() {
    if (entry.bloomed) return;
    const done = () => { entry.bloomed = true; entry.listeners.forEach(listener => listener()); };
    if (reducedMotion) { [entry.headline, entry.rest, ...entry.rise].forEach(value => value.setValue(1)); done(); return; }
    const ease = (value: Animated.Value, duration = 360) => Animated.timing(value, { toValue: 1, duration, useNativeDriver: true });
    Animated.timing(entry.bud, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      done();
      Animated.sequence([Animated.stagger(110, entry.rise.map(value => ease(value))), ease(entry.headline, 380), ease(entry.rest, 320)]).start();
    });
  }
  // Reduced motion can arrive after the first render: no bud then.
  useEffect(() => { if (enabled && reducedMotion && !entry.bloomed) bloom(); }, [enabled, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  return { bloomed, bloom, bud: entry.bud, headline: entry.headline, rest: entry.rest, rise: entry.rise };
}

export function BudGate({ title, hint, fade, interactive, onOpen }: { title: string; hint: string; fade: Animated.Value; interactive: boolean; onOpen: () => void }) {
  return <Animated.View style={[s.gate, { opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }] }]}>
    <Text style={s.eyebrow}>{title}</Text>
    <Pressable testID="weekly-bud" accessibilityRole="button" accessibilityLabel={hint} disabled={!interactive} onPress={onOpen}
      style={({ pressed }) => [s.bud, pressed && { transform: [{ scale: .97 }] }]}>
      <Image source={BUD} contentFit="contain" style={s.budArt} accessible={false} />
    </Pressable>
    <Text style={s.hint}>{hint}</Text>
  </Animated.View>;
}

// Flowers all stand on one ground line: no mood is drawn higher or lower than another.
export function WeeklyBouquet({ days, points, locale, dayNames, species, rise, openId, interactive, onOpen }: {
  days: string[]; points: MoodPoint[]; locale: ShortLocale; dayNames: readonly string[]; species: Map<string, string> | null;
  rise: Animated.Value[]; openId: string | null; interactive: boolean; onOpen: (eventId: string) => void;
}) {
  const [width, setWidth] = useState(0);
  // A narrow page gets smaller flowers, about one day column wide.
  const size = width ? Math.min(FLOWER, Math.round(width / 7 * 1.05)) : FLOWER;
  const placed = width ? bouquetLayout(days, points, width, size) : [], ground = Math.round(size * 1.3);
  return <View>
    <View testID="weekly-bouquet" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: ground }}>
      <View style={s.ground} />
      {placed.map((point, i) => {
        const art = clusterPicture(species?.get(point.sourceEventId) ?? MOOD_SPECIES[point.mood], '', 'S');
        const height = art ? Math.min(ground - 4, size * art.ratio) : size, value = rise[i];
        return <Animated.View key={point.sourceEventId} style={[s.flower, { left: point.x, width: size, height: ground, opacity: value ?? 1,
          transform: [{ translateY: value ? value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) : 0 }] }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={shortDate(point.date, locale)} disabled={!interactive}
            onPress={() => onOpen(point.sourceEventId)} style={({ pressed }) => [s.flowerHit, pressed && { opacity: .75 }]}>
            {art && <Image source={art.source} contentFit="contain" style={{ width: size, height }} accessible={false} />}
          </Pressable>
          {openId === point.sourceEventId && <View style={[s.mark, { left: size * .25, width: size * .5 }]} />}
        </Animated.View>;
      })}
    </View>
    <View accessible={false} style={s.days}>{dayNames.map((day, i) => <Text key={i} style={s.day}>{day}</Text>)}</View>
  </View>;
}

const s = StyleSheet.create({
  gate: { alignItems: 'center', paddingVertical: 18, marginBottom: 8 },
  eyebrow: { fontFamily: 'Georgia', color: '#8B6C44', fontSize: 13, letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
  bud: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  budArt: { width: 96, height: 96 },
  hint: { fontFamily: 'Georgia', fontStyle: 'italic', color: '#654D30', fontSize: 14, marginTop: 10, textAlign: 'center' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 4, height: 1, backgroundColor: '#B8934A66' },
  flower: { position: 'absolute', top: 0, justifyContent: 'flex-end' },
  flowerHit: { minHeight: 44, justifyContent: 'flex-end', paddingBottom: 4 },
  mark: { position: 'absolute', bottom: 0, height: 2, borderRadius: 1, backgroundColor: '#B8934A' },
  days: { flexDirection: 'row', marginTop: 4, marginBottom: 8 },
  day: { flex: 1, textAlign: 'center', fontFamily: 'Georgia', color: '#8B6C44', fontSize: 12 },
});
