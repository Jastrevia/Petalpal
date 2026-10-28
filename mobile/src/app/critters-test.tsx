import { Canvas, Circle, Group, Image, Line, Rect, useImage, vec } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { Critter, MeshLayer, WALKER_ART } from '@/components/garden/critters/GardenCritters';
import { CRITTER_IDS, CRITTERS, RHYTHMS, travelSeconds, visitPose, FADE_SECONDS, type CritterId, type Visit } from '@/components/garden/critters/critterVisits';
import { rabbitPose, WALKER_MESHES } from '@/components/garden/critters/gaits';
import { posePoints, type Pose } from '@/components/garden/critters/rig';

// Development preview: each Garden visitor large, crossing a plain lawn back and forth, so its
// painting and motion can be judged up close; for the rabbit (on a skeleton), a strip of stills
// through one hop and its skeleton. Not part of production navigation.
const WIDTH = 360, HEIGHT = 260;
// The puppy is the biggest visitor: a little less zoom keeps all of it on the lawn.
const zoomFor = (id: CritterId) => (id === 'puppy' ? 1.5 : 2.4);
const FRAMES = 8;
function stillPose(k: number): Pose {
  return rabbitPose(k / FRAMES, 320, 0);
}

export default function CrittersTestScreen() {
  const [id, setId] = useState<CritterId>('puppy');
  const [slow, setSlow] = useState(false);
  const [bones, setBones] = useState(false);
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
    return { key: round, id, path, start, duration: travelSeconds(length / spec.speed, rhythm) + FADE_SECONDS * 2, speed: spec.speed, rhythm };
  }, [id, round, start]);
  // Rounds run on the preview clock, so slow motion stretches them too.
  useEffect(() => {
    const timer = setInterval(() => { if (seconds.value > visit.start + visit.duration) setRound(value => value + 1); }, 200);
    return () => clearInterval(timer);
  }, [visit, seconds]);
  const [debug, setDebug] = useState('');
  useEffect(() => { const timer = setInterval(() => { const pose = visitPose(visit, seconds.value);
    setDebug(`t ${seconds.value.toFixed(1)} · x ${pose.x.toFixed(0)} y ${pose.y.toFixed(0)} · opacity ${pose.opacity.toFixed(2)}`); }, 250);
    return () => clearInterval(timer); }, [visit, seconds]);
  if (!__DEV__) return <Redirect href="/" />;
  return <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
    <Text style={styles.title}>Garden visitors</Text>
    <Canvas style={{ width: WIDTH, height: HEIGHT, borderRadius: 16 }}>
      <Rect x={0} y={0} width={WIDTH} height={HEIGHT} color="#5C7F45" />
      <Rect x={0} y={HEIGHT * 0.62} width={WIDTH} height={HEIGHT * 0.3} color="#B9AA8C" />
      <Critter key={id} visit={visit} clock={seconds} zoom={zoomFor(id)} />
    </Canvas>
    <Text testID="critter-debug" style={styles.label}>{debug}</Text>
    <View style={styles.row}>{CRITTER_IDS.map(item => <Pressable key={item} onPress={() => setId(item)}
      style={[styles.button, id === item && styles.selected]}><Text style={styles.label}>{item}</Text></Pressable>)}</View>
    <View style={styles.row}>
      <Pressable onPress={() => setSlow(value => !value)} style={[styles.button, slow && styles.selected]}><Text style={styles.label}>slow ¼×</Text></Pressable>
      <Pressable onPress={() => setBones(value => !value)} style={[styles.button, bones && styles.selected]}><Text style={styles.label}>skeleton</Text></Pressable>
    </View>
    {id === 'rabbit' ? <Filmstrip bones={bones} /> : null}
  </ScrollView>;
}

// One hop in stills, left to right; the first is the painting at rest when
// `bones` is on, with its joints drawn over it.
function Filmstrip({ bones }: { bones: boolean }) {
  const image = useImage(WALKER_ART.rabbit.source), legs = useImage(WALKER_ART.rabbit.legs);
  const mesh = WALKER_MESHES.rabbit;
  const cellW = 300, s = cellW / mesh.w, cellH = mesh.h * s + 8;
  const frames = useMemo(() => Array.from({ length: FRAMES }, (_, k) => posePoints(mesh, stillPose(k))), [mesh]);
  const rect = { x: 0, y: 0, width: mesh.w, height: mesh.h };
  if (!image || !legs) return null;
  const columns = 2, rows = Math.ceil((FRAMES + (bones ? 1 : 0)) / columns);
  return <Canvas style={{ width: cellW * columns, height: cellH * rows, backgroundColor: '#5C7F45', borderRadius: 12 }}>
    {bones ? <Group transform={[{ scale: s }]}>
      <Image image={image} x={0} y={0} width={mesh.w} height={mesh.h} fit="fill" />
      <Image image={legs} x={0} y={0} width={mesh.w} height={mesh.h} fit="fill" />
      {mesh.legs.map((leg, i) => <Group key={i}>
        {[0, 1, 2].map(k => <Line key={k} p1={vec(leg.joints[k * 2], leg.joints[k * 2 + 1])} p2={vec(leg.joints[k * 2 + 2], leg.joints[k * 2 + 3])} color="#FFE066" strokeWidth={4} />)}
        {[0, 1, 2, 3].map(k => <Circle key={k} cx={leg.joints[k * 2]} cy={leg.joints[k * 2 + 1]} r={7} color={k === 0 ? '#FF6B6B' : '#FFE066'} />)}
      </Group>)}
      {Object.entries(mesh.parts).map(([name, bone]) => <Circle key={name} cx={mesh.pivotX[bone]} cy={mesh.pivotY[bone]} r={9} color="#7AD7FF" />)}
      <Line p1={vec(0, mesh.ground)} p2={vec(mesh.w, mesh.ground)} color="#FFFFFF88" strokeWidth={2} />
    </Group> : null}
    {frames.map((points, k) => {
      const cell = k + (bones ? 1 : 0);
      return <Group key={k} transform={[{ translateX: (cell % columns) * cellW }, { translateY: Math.floor(cell / columns) * cellH }, { scale: s }]}>
        <Line p1={vec(0, mesh.ground)} p2={vec(mesh.w, mesh.ground)} color="#FFFFFF44" strokeWidth={2} />
        {mesh.layers.map((layer, l) => <MeshLayer key={l} layers={{ value: points }} index={l} layer={layer} image={layer.texture === 'body' ? image : legs} rect={rect} />)}
      </Group>;
    })}
  </Canvas>;
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
