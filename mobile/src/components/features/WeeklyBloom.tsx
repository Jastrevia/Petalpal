import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../../services/auth';
import { eventFlowers } from '../../services/events';
import { bouquetLayout, MOOD_SPECIES, shortDate, type MoodPoint, type ShortLocale } from '../../services/reflections';
import { PRIMARY_MOODS, type PrimaryMood } from '../../services/events';
import { clusterPicture } from '../garden/planting/flowerClusters';
import { ART_RATIO, PETAL_ART, WEEKLY_ART } from './weeklyArt';

// Weekly 2.0 left page (docs/product/WEEKLY_2.0.md): the week's bouquet, one painted flower per Event, and the moods chart.
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

// Flowers all stand on one ground line: no mood is drawn higher or lower than another.
export function WeeklyBouquet({ days, points, locale, dayNames, species, openId, interactive, onOpen }: {
  days: string[]; points: MoodPoint[]; locale: ShortLocale; dayNames: readonly string[]; species: Map<string, string> | null;
  openId: string | null; interactive: boolean; onOpen: (eventId: string) => void;
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
      {placed.map(point => {
        const art = clusterPicture(species?.get(point.sourceEventId) ?? MOOD_SPECIES[point.mood], '', 'S');
        const height = art ? Math.min(size * 1.3 - 4, point.size * art.ratio) : point.size;
        return <View key={point.sourceEventId} style={[s.flower, { left: point.x, width: point.size, height: ground, zIndex: 10 - point.row, bottom: point.lift }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={shortDate(point.date, locale)} disabled={!interactive}
            onPress={() => onOpen(point.sourceEventId)} style={({ pressed }) => [s.flowerHit, pressed && { opacity: .75 }]}>
            {art && <Image source={art.source} contentFit="contain" style={{ width: point.size, height }} accessible={false} />}
          </Pressable>
          {openId === point.sourceEventId && <View style={[s.mark, { left: point.size * .25, width: point.size * .5 }]} />}
        </View>;
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
  flower: { position: 'absolute', justifyContent: 'flex-end' },
  flowerHit: { minHeight: 44, justifyContent: 'flex-end', paddingBottom: 4 },
  mark: { position: 'absolute', bottom: 0, height: 2, borderRadius: 1, backgroundColor: '#B8934A' },
  days: { flexDirection: 'row', marginTop: 8, marginBottom: 10 },
  day: { flex: 1, textAlign: 'center', fontFamily: 'Georgia', color: '#9A7D52', fontSize: 11, letterSpacing: 1 },
});
