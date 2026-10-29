import { Canvas, Rect } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { Critter } from '@/components/garden/critters/GardenCritters';
import { Otter } from '@/components/garden/spirits/MemoryOtter';
import { OTTER_SPEED, swimEnd, type Swim } from '@/components/garden/spirits/otterSwims';
import { CRITTER_IDS, CRITTERS, RHYTHMS, travelSeconds, visitPose, FADE_SECONDS, type CritterId, type Visit } from '@/components/garden/critters/critterVisits';

// Development preview: each Garden visitor large, crossing a plain lawn back and forth, so its
// painting and motion can be judged up close. Not part of production navigation.
const WIDTH = 360, HEIGHT = 260;
// The puppy is the biggest visitor: a little less zoom keeps all of it on the lawn; the rabbit's
// hops are a body length each, so it needs room for a few.
const zoomFor = (id: CritterId) => (id === 'puppy' ? 1.5 : id === 'rabbit' ? 1.2 : id === 'silktail' ? 1.3 : 2.4);
// The visitors plus the Silktail Fox spirit (not a random visitor; shown resting first, then walking).
const PREVIEW_IDS: CritterId[] = [...CRITTER_IDS, 'silktail'];

export default function CrittersTestScreen() {
  const [id, setId] = useState<CritterId>('puppy');
  const [slow, setSlow] = useState(false);
  const seconds = useSharedValue(0);
  const rate = useSharedValue(1);
  useEffect(() => { rate.value = slow ? 0.25 : 1; }, [slow, rate]);
  useFrameCallback(frame => { seconds.value += ((frame.timeSincePreviousFrame ?? 16) / 1000) * rate.value; });
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  const [round, setRound] = useState(0);
  // The start time is read once per round (outside render: the compiler would track the clock),
  // a moment later, so the clock has started ticking on first open.
  const [start, setStart] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setStart(seconds.value), 100); return () => clearTimeout(timer); }, [id, round, seconds]);
  const visit = useMemo<Visit>(() => {
    const ZOOM = zoomFor(id), margin = CRITTERS[id].size * 0.45;
    const y = CRITTERS[id].kind === 'walker' ? HEIGHT / ZOOM * 0.78 : HEIGHT / ZOOM * 0.5;
    const path = [{ x: margin, y }, { x: WIDTH / ZOOM - margin, y: y - 6 }, { x: margin + 8, y: y + 4 }];
    const spec = CRITTERS[id], rhythm = RHYTHMS[id];
    const length = Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y) + Math.hypot(path[2].x - path[1].x, path[2].y - path[1].y);
    const lead = id === 'silktail' ? 10 : FADE_SECONDS;
    return { key: round, id, path, start, duration: lead + travelSeconds(length / spec.speed, rhythm), speed: spec.speed, rhythm,
      lead, fadeIn: id !== 'silktail', walked: 0 };
  }, [id, round, start]);
  // Rounds run on the preview clock, so slow motion stretches them too.
  useEffect(() => {
    const timer = setInterval(() => { if (seconds.value > visit.start + visit.duration) setRound(value => value + 1); }, 200);
    return () => clearInterval(timer);
  }, [visit, seconds]);
  // Memory Otter on night water: it swims across, dives, and comes back the other way.
  const [otter, setOtter] = useState(false);
  const [swimRound, setSwimRound] = useState(0);
  const swim = useMemo<Swim>(() => {
    const left = { x: 60, y: HEIGHT * 0.55 }, right = { x: WIDTH - 60, y: HEIGHT * 0.5 };
    const [a, b] = swimRound % 2 ? [right, left] : [left, right];
    return { a, b, start, swim: Math.hypot(b.x - a.x, b.y - a.y) / OTTER_SPEED, under: 1 };
  }, [swimRound, start]);
  useEffect(() => {
    if (!otter) return;
    const timer = setInterval(() => { if (seconds.value > swimEnd(swim)) { setSwimRound(value => value + 1); setStart(seconds.value); } }, 200);
    return () => clearInterval(timer);
  }, [otter, swim, seconds]);
  const [debug, setDebug] = useState('');
  useEffect(() => { const timer = setInterval(() => { const pose = visitPose(visit, seconds.value);
    setDebug(`t ${seconds.value.toFixed(1)} · x ${pose.x.toFixed(0)} y ${pose.y.toFixed(0)} · opacity ${pose.opacity.toFixed(2)}`); }, 250);
    return () => clearInterval(timer); }, [visit, seconds]);
  if (!__DEV__) return <Redirect href="/" />;
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <Text style={styles.title}>Garden visitors</Text>
    {otter ? <Canvas style={{ width: WIDTH, height: HEIGHT, borderRadius: 16 }}>
      <Rect x={0} y={0} width={WIDTH} height={HEIGHT} color="#123C4A" />
      <Otter key={swimRound} swim={swim} clock={seconds} />
    </Canvas> : <Canvas style={{ width: WIDTH, height: HEIGHT, borderRadius: 16 }}>
      <Rect x={0} y={0} width={WIDTH} height={HEIGHT} color="#5C7F45" />
      <Rect x={0} y={HEIGHT * 0.62} width={WIDTH} height={HEIGHT * 0.3} color="#B9AA8C" />
      <Critter key={id} visit={visit} clock={seconds} zoom={zoomFor(id)} />
    </Canvas>}
    <Text testID="critter-debug" style={styles.label}>{debug}</Text>
    <View style={styles.row}>{PREVIEW_IDS.map(item => <Pressable key={item} onPress={() => { setOtter(false); setId(item); }}
      style={[styles.button, !otter && id === item && styles.selected]}><Text style={styles.label}>{item}</Text></Pressable>)}
      <Pressable onPress={() => { setOtter(true); setStart(seconds.value); }} style={[styles.button, otter && styles.selected]}><Text style={styles.label}>otter (night)</Text></Pressable></View>
    <View style={styles.row}>
      <Pressable onPress={() => setSlow(value => !value)} style={[styles.button, slow && styles.selected]}><Text style={styles.label}>slow ¼×</Text></Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#1B2A24' },
  page: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 24 },
  title: { color: '#F2E6D0', fontSize: 20, fontFamily: 'serif' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  button: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#8C7A5B' },
  selected: { backgroundColor: '#5B4A63' },
  label: { color: '#F2E6D0' },
});
