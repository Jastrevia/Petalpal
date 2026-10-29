import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../../services/auth';
import { eventFlowers } from '../../services/events';
import { bouquetLayout, MOOD_SPECIES, shortDate, type MoodPoint, type ShortLocale } from '../../services/reflections';
import { PRIMARY_MOODS, type PrimaryMood } from '../../services/events';
import { clusterPicture } from '../garden/planting/flowerClusters';
import { ART_RATIO, PETAL_ART, WEEKLY_ART } from './weeklyArt';

// Weekly 2.0 opening (docs/product/WEEKLY_2.0.md): a crocus bud opens into one petal per Event, each in the colour
// of the mood chosen for it; then the week's bouquet rises, one painted flower per Event.
const BUD_HEIGHT = 150, PETAL = 54;
export const FLOWER = 52;

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
type Bloom = { bloomed: boolean; bud: Animated.Value; fan: Animated.Value; headline: Animated.Value; rest: Animated.Value; rise: Animated.Value[];
  listeners: Set<() => void> };
const blooms = new Map<string, Bloom>();
function bloomFor(key: string, flowers: number, open: boolean) {
  let entry = blooms.get(key);
  if (!entry) {
    const start = open ? 1 : 0;
    entry = { bloomed: open, bud: new Animated.Value(1), fan: new Animated.Value(0), headline: new Animated.Value(start), rest: new Animated.Value(start),
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
    // The petals open out (one after another), the bud fades, then the bouquet rises.
    Animated.sequence([Animated.timing(entry.fan, { toValue: 1, duration: 900, useNativeDriver: true }), Animated.delay(250),
      Animated.timing(entry.bud, { toValue: 0, duration: 320, useNativeDriver: true })]).start(() => {
      done();
      Animated.sequence([Animated.stagger(110, entry.rise.map(value => ease(value))), ease(entry.headline, 380), ease(entry.rest, 320)]).start();
    });
  }
  // Reduced motion can arrive after the first render: no bud then.
  useEffect(() => { if (enabled && reducedMotion && !entry.bloomed) bloom(); }, [enabled, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  return { bloomed, bloom, bud: entry.bud, fan: entry.fan, headline: entry.headline, rest: entry.rest, rise: entry.rise };
}

export function BudGate({ title, hint, fade, fan, moods, interactive, onOpen }: { title: string; hint: string; fade: Animated.Value;
  fan: Animated.Value; moods: string[]; interactive: boolean; onOpen: () => void }) {
  // Petals fan out upward around the bud head, from left to right in the order the Events were written.
  const spread = Math.min(160, 26 * Math.max(1, moods.length - 1)), radius = 46;
  return <Animated.View style={[s.gate, { opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }] }]}>
    <Text style={s.eyebrow}>{title}</Text>
    <Pressable testID="weekly-bud" accessibilityRole="button" accessibilityLabel={hint} disabled={!interactive} onPress={onOpen}
      style={({ pressed }) => [s.bud, pressed && { transform: [{ scale: .97 }] }]}>
      {moods.map((mood, i) => {
        const angle = moods.length === 1 ? 0 : -spread / 2 + spread * i / (moods.length - 1), rad = angle * Math.PI / 180;
        const start = i / Math.max(1, moods.length) * .5, step = fan.interpolate({ inputRange: [0, start, Math.min(1, start + .5), 1],
          outputRange: [0, 0, 1, 1] });
        return PETAL_ART[mood] ? <Animated.View key={i} pointerEvents="none" style={[s.petal, { opacity: step, transform: [
          { translateX: step.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * radius] }) },
          { translateY: step.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.cos(rad) * radius * .55] }) },
          { rotate: `${angle}deg` }] }]}>
          <Image source={PETAL_ART[mood]} contentFit="contain" accessible={false} style={{ width: PETAL * ART_RATIO.petal, height: PETAL }} />
        </Animated.View> : null;
      })}
      <Image source={WEEKLY_ART.bud} contentFit="contain" style={s.budArt} accessible={false} />
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
  const placed = width ? bouquetLayout(days, points, width, size) : [];
  const ground = Math.round(size * 1.3 + Math.max(0, ...placed.map(point => point.lift)));
  return <View>
    <View testID="weekly-bouquet" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: ground }}>
      {/* A painted bed of moss under the flowers. */}
      <Image source={WEEKLY_ART.ground} contentFit="fill" accessible={false}
        style={{ position: 'absolute', left: -6, right: -6, bottom: -4, height: Math.round(size * .7) }} />
      {placed.map((point, i) => {
        const art = clusterPicture(species?.get(point.sourceEventId) ?? MOOD_SPECIES[point.mood], '', 'S');
        const height = art ? Math.min(size * 1.3 - 4, point.size * art.ratio) : point.size, value = rise[i];
        return <Animated.View key={point.sourceEventId} style={[s.flower, { left: point.x, width: point.size, height: ground, zIndex: 10 - point.row,
          bottom: point.lift, opacity: value ?? 1, transform: [{ translateY: value ? value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) : 0 }] }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={shortDate(point.date, locale)} disabled={!interactive}
            onPress={() => onOpen(point.sourceEventId)} style={({ pressed }) => [s.flowerHit, pressed && { opacity: .75 }]}>
            {art && <Image source={art.source} contentFit="contain" style={{ width: point.size, height }} accessible={false} />}
          </Pressable>
          {openId === point.sourceEventId && <View style={[s.mark, { left: point.size * .25, width: point.size * .5 }]} />}
        </Animated.View>;
      })}
    </View>
    <View accessible={false} style={s.days}>{dayNames.map((day, i) => <Text key={i} style={s.day}>{day}</Text>)}</View>
  </View>;
}

// The week's moods as an 8-axis chart drawn with the painted petals: each mood keeps its own direction every week
// (clockwise from the top, in the app's mood order), and its petal grows with how many times it was chosen. Every petal is
// labelled with its mood's name and count, so the colours are never the only way to tell them apart.
export function MoodPetalChart({ points, names, label, width }: { points: MoodPoint[]; names: Record<PrimaryMood, string>;
  label: string; width: number }) {
  const counts = new Map<PrimaryMood, number>(PRIMARY_MOODS.map(mood => [mood, 0]));
  for (const point of points) counts.set(point.mood, (counts.get(point.mood) ?? 0) + 1);
  const most = Math.max(1, ...counts.values()), box = Math.min(width, 260), centre = box / 2, longest = box * .27, shortest = box * .1;
  const summary = PRIMARY_MOODS.map(mood => `${names[mood]} ${counts.get(mood)}`).join(', ');
  return <View accessible accessibilityRole="image" accessibilityLabel={`${label}: ${summary}`} style={{ width: box, height: box, alignSelf: 'center' }}>
    <View style={[s.ring, { width: longest * 2, height: longest * 2, borderRadius: longest, left: centre - longest, top: centre - longest }]} />
    {PRIMARY_MOODS.map((mood, i) => {
      const count = counts.get(mood) ?? 0, angle = i * 45, rad = angle * Math.PI / 180;
      const length = count ? shortest + (longest - shortest) * count / most : 0, petalWidth = length * ART_RATIO.petal;
      const labelAt = longest + 20, lx = centre + Math.sin(rad) * labelAt, ly = centre - Math.cos(rad) * labelAt;
      return <View key={mood} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[s.axis, { left: centre, top: centre - longest, height: longest, transformOrigin: '50% 100%', transform: [{ rotate: `${angle}deg` }] }]} />
        {count > 0 && <Image source={PETAL_ART[mood]} contentFit="contain" accessible={false} style={{ position: 'absolute', width: petalWidth, height: length,
          left: centre - petalWidth / 2, top: centre - length, transformOrigin: '50% 100%', transform: [{ rotate: `${angle}deg` }] }} />}
        <Text style={[s.chartLabel, { left: lx - 34, top: ly - 9 }, !count && s.chartLabelNone]}>{`${names[mood]} ${count}`}</Text>
      </View>;
    })}
  </View>;
}

const s = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1, borderColor: '#A8823F33' },
  axis: { position: 'absolute', width: 1, backgroundColor: '#A8823F40' },
  chartLabel: { position: 'absolute', width: 68, textAlign: 'center', fontFamily: 'Georgia', fontSize: 11, color: '#4D3B28' },
  chartLabelNone: { color: '#9A8261' },
  gate: { alignItems: 'center', paddingTop: 28, paddingBottom: 18, marginBottom: 8 },
  eyebrow: { fontFamily: 'Georgia', color: '#8B6C44', fontSize: 14, letterSpacing: 3, marginBottom: 40, textAlign: 'center' },
  bud: { minWidth: 120, height: BUD_HEIGHT + 8, alignItems: 'center', justifyContent: 'center' },
  // Centred on the bud's head (the upper third of the painting).
  petal: { position: 'absolute', top: BUD_HEIGHT * .22 - PETAL / 2 + 4, left: '50%', marginLeft: -PETAL * ART_RATIO.petal / 2 },
  budArt: { width: BUD_HEIGHT * ART_RATIO.bud, height: BUD_HEIGHT },
  hint: { fontFamily: 'Georgia', fontStyle: 'italic', color: '#7A5E3C', fontSize: 15, marginTop: 14, textAlign: 'center' },
  flower: { position: 'absolute', justifyContent: 'flex-end' },
  flowerHit: { minHeight: 44, justifyContent: 'flex-end', paddingBottom: 4 },
  mark: { position: 'absolute', bottom: 0, height: 2, borderRadius: 1, backgroundColor: '#B8934A' },
  days: { flexDirection: 'row', marginTop: 8, marginBottom: 10 },
  day: { flex: 1, textAlign: 'center', fontFamily: 'Georgia', color: '#9A7D52', fontSize: 11, letterSpacing: 1 },
});
