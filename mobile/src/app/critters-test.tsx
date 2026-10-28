import { Canvas, Rect } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { Critter } from '@/components/garden/critters/GardenCritters';
import { CRITTER_IDS, CRITTERS, RHYTHMS, visitPose, type CritterId, type Visit } from '@/components/garden/critters/critterVisits';

// Development preview: each Garden visitor large, crossing a plain lawn back and forth, so its
// painting and motion can be judged up close. Not part of production navigation.
const WIDTH = 360, HEIGHT = 260, ZOOM = 2.4;
export default function CrittersTestScreen() {
  const [id, setId] = useState<CritterId>('rabbit');
  const seconds = useSharedValue(0);
  useFrameCallback(frame => { seconds.value = frame.timestamp / 1000; });
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  // A path in the zoomed lawn's own units, there and back, repeated by restarting the visit.
  const [round, setRound] = useState(0);
  // The start time is read once per round (outside render: the compiler would track the clock).
  const [start, setStart] = useState(0);
  // A moment later, so the clock has started ticking on first open.
  useEffect(() => { const timer = setTimeout(() => setStart(seconds.value), 100); return () => clearTimeout(timer); }, [id, round, seconds]);
  const visit = useMemo<Visit>(() => {
    const y = CRITTERS[id].kind === 'walker' ? HEIGHT / ZOOM * 0.78 : HEIGHT / ZOOM * 0.5;
    const path = [{ x: 16, y }, { x: WIDTH / ZOOM - 16, y: y - 6 }, { x: 24, y: y + 4 }];
    const spec = CRITTERS[id], rhythm = RHYTHMS[id];
    const length = Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y) + Math.hypot(path[2].x - path[1].x, path[2].y - path[1].y);
    return { key: round, id, path, start, duration: length / spec.speed / rhythm.moving + 1.6, speed: spec.speed, rhythm };
  }, [id, round, start]);
  useEffect(() => { const timer = setTimeout(() => setRound(value => value + 1), visit.duration * 1000); return () => clearTimeout(timer); }, [visit]);
  const [debug, setDebug] = useState('');
  useEffect(() => { const timer = setInterval(() => { const pose = visitPose(visit, seconds.value);
    setDebug(`t ${seconds.value.toFixed(1)} · x ${pose.x.toFixed(0)} y ${pose.y.toFixed(0)} · opacity ${pose.opacity.toFixed(2)}`); }, 250);
    return () => clearInterval(timer); }, [visit, seconds]);
  if (!__DEV__) return <Redirect href="/" />;
  return <View style={styles.page}>
    <Text style={styles.title}>Garden visitors</Text>
    <Canvas style={{ width: WIDTH, height: HEIGHT, borderRadius: 16 }}>
      <Rect x={0} y={0} width={WIDTH} height={HEIGHT} color="#5C7F45" />
      <Rect x={0} y={HEIGHT * 0.62} width={WIDTH} height={HEIGHT * 0.3} color="#B9AA8C" />
      <Critter visit={visit} clock={seconds} zoom={ZOOM} />
    </Canvas>
    <Text testID="critter-debug" style={styles.label}>{debug}</Text>
    <View style={styles.row}>{CRITTER_IDS.map(item => <Pressable key={item} onPress={() => setId(item)}
      style={[styles.button, id === item && styles.selected]}><Text style={styles.label}>{item}</Text></Pressable>)}</View>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#1B2A24' },
  title: { color: '#F2E6D0', fontSize: 20, fontFamily: 'serif' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  button: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#8C7A5B' },
  selected: { backgroundColor: '#5B4A63' },
  label: { color: '#F2E6D0' },
});
