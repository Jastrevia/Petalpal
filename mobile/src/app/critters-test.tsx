import { Canvas, Group, Rect } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { Critter, PairSceneClip, type MalteseLook } from '@/components/garden/critters/GardenCritters';
import { PUPPY_LOOKS, type PuppyLook } from '@/components/garden/critters/puppyLooks';
import PetRingMenu from '@/components/garden/critters/PetRingMenu';
import { Otter } from '@/components/garden/spirits/MemoryOtter';
import { OTTER_SPEED, swimEnd, type Swim } from '@/components/garden/spirits/otterSwims';
import { CRITTER_IDS, CRITTERS, MALTESE_RUN_SPEED, RHYTHMS, RUN_SPEED, SCENE_SPECS, travelSeconds, visitPose, FADE_SECONDS, type CritterId, type Scene, type SceneKind, type Visit } from '@/components/garden/critters/critterVisits';

// Development preview: each Garden visitor large, crossing a plain lawn back and forth, so its
// painting and motion can be judged up close. Not part of production navigation.
const WIDTH = 360, HEIGHT = 260;
// The puppy is the biggest visitor: a little less zoom keeps all of it on the lawn; the rabbit's
// hops are a body length each, so it needs room for a few.
const zoomFor = (id: CritterId) => (id === 'puppy' ? 1.5 : id === 'rabbit' ? 1.2 : id === 'silktail' ? 1.3 : id === 'maltese' ? 2.2 : 2.4);
// The visitors plus the Silktail Fox spirit (not a random visitor; shown resting first, then walking).
const PREVIEW_IDS: CritterId[] = [...CRITTER_IDS, 'maltese', 'silktail'];

// The puppy beside the Maltese wears the look the Maltese matches (malteseLookOf).
const MATE_LOOK: Record<MalteseLook, PuppyLook> = { bare: 'bare', hat: 'hat', necklace: 'necklace', 'hat-necklace': 'hat-necklace',
  cape: 'cape', 'cape-hat': 'cape-hat', 'cape-necklace': 'cape', petal: 'cape2-hat', noble: 'cape-hat' };

export default function CrittersTestScreen() {
  const [id, setId] = useState<CritterId>('puppy');
  const [slow, setSlow] = useState(false);
  // The puppy's outfit: switching it mid-walk shows how one look turns into another.
  const [look, setLook] = useState<PuppyLook>('bare');
  // The Maltese's look, and the Maltese walking beside the puppy at one zoom (their sizes side by side).
  const [malteseLook, setMalteseLook] = useState<MalteseLook>('bare');
  const [together, setTogether] = useState(false);
  // The puppy's moves: its walk, its gallop (a chase), or sitting a while first, then getting up.
  // (eat / pat: the puppy's painted actions, petal cape only.)
  const [move, setMove] = useState<'walk' | 'run' | 'sit' | 'eat' | 'pat'>('walk');
  // The pair's painted scenes (puppy and Maltese together), shown on their own.
  const [pair, setPair] = useState<SceneKind | null>(null);
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
    const ZOOM = together && id === 'maltese' ? zoomFor('puppy') : zoomFor(id), margin = CRITTERS[id].size * 0.45;
    const y = CRITTERS[id].kind === 'walker' ? HEIGHT / ZOOM * 0.78 : HEIGHT / ZOOM * 0.5;
    const path = [{ x: margin, y }, { x: WIDTH / ZOOM - margin, y: y - 6 }, { x: margin + 8, y: y + 4 }];
    const spec = CRITTERS[id], puppyMove = id === 'puppy' || id === 'maltese' ? move : 'walk';
    const acting = id === 'puppy' && (puppyMove === 'eat' || puppyMove === 'pat');
    const running = puppyMove === 'run', sitting = puppyMove === 'sit' || acting;
    const rhythm = running ? { cycle: 0, moving: 1 } : RHYTHMS[id], speed = running ? (id === 'maltese' ? MALTESE_RUN_SPEED : RUN_SPEED) : spec.speed;
    const length = Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y) + Math.hypot(path[2].x - path[1].x, path[2].y - path[1].y);
    const lead = id === 'silktail' ? 10 : acting ? 10 : sitting ? 7 : FADE_SECONDS;
    return { key: round, id, path, start, duration: lead + travelSeconds(length / speed, rhythm), speed, rhythm,
      lead, fadeIn: id !== 'silktail' && !sitting, walked: 0, chase: running && id === 'puppy', running: running && id === 'maltese', sits: sitting,
      ...(acting ? { held: true, action: { kind: puppyMove as 'eat' | 'pat', start: start + 2 } } : {}) };
  }, [id, round, start, move, together]);
  // The puppy beside it: the same path a little further back, at its own pace.
  const mate = useMemo<Visit | null>(() => {
    if (!together || id !== 'maltese') return null;
    const running = move === 'run', speed = running ? RUN_SPEED : CRITTERS.puppy.speed;
    const path = visit.path.map(p => ({ x: p.x, y: p.y - 16 }));
    return { ...visit, key: visit.key + 0.5, id: 'puppy', path, speed, rhythm: running ? { cycle: 0, moving: 1 } : RHYTHMS.puppy,
      chase: running, running: false };
  }, [together, id, move, visit]);
  const scene = useMemo<Scene | null>(() => (pair ? { key: round, kind: pair, start: start + 0.4, end: start + 0.4 + SCENE_SPECS[pair].seconds, x: 70, y: HEIGHT / 1.5 * 0.78, dir: 1 } : null), [pair, round, start]);
  useEffect(() => {
    if (!scene) return;
    const timer = setInterval(() => { if (seconds.value > scene.end + 0.6) { setRound(value => value + 1); setStart(seconds.value); } }, 200);
    return () => clearInterval(timer);
  }, [scene, seconds]);
  // Rounds run on the preview clock, so slow motion stretches them too.
  useEffect(() => {
    const timer = setInterval(() => { if (seconds.value > visit.start + visit.duration) setRound(value => value + 1); }, 200);
    return () => clearInterval(timer);
  }, [visit, seconds]);
  // Memory Otter on night water: it swims across, dives, and comes back the other way.
  const [otter, setOtter] = useState(false);
  // Each pet's ring menu over this page, as if it had been tapped at the middle of the preview.
  const [ring, setRing] = useState<'puppy' | 'maltese' | null>(null);
  const viewport = useWindowDimensions();
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
      {scene ? <Group transform={[{ scale: 1.5 }]}><PairSceneClip key={scene.key} scene={scene} clock={seconds} /></Group>
        : mate ? <>
          <Critter key={`mate-${move}`} visit={mate} clock={seconds} zoom={zoomFor('puppy')} look={MATE_LOOK[malteseLook]} />
          <Critter key={`${id}-${move}-t`} visit={visit} clock={seconds} zoom={zoomFor('puppy')} malteseLook={malteseLook} /></>
        : <Critter key={`${id}-${move}`} visit={visit} clock={seconds} zoom={zoomFor(id)} look={look} malteseLook={malteseLook} />}
    </Canvas>}
    <Text testID="critter-debug" style={styles.label}>{debug}</Text>
    <View style={styles.row}>{PREVIEW_IDS.map(item => <Pressable key={item} onPress={() => { setOtter(false); setPair(null); setId(item); }}
      style={[styles.button, !otter && !pair && id === item && styles.selected]}><Text style={styles.label}>{item}</Text></Pressable>)}
      <Pressable onPress={() => { setOtter(true); setStart(seconds.value); }} style={[styles.button, otter && styles.selected]}><Text style={styles.label}>otter (night)</Text></Pressable></View>
    <View style={styles.row}>{(['hug', 'tug'] as const).map(item => <Pressable key={item} onPress={() => { setOtter(false); setPair(item); setStart(seconds.value); }}
      style={[styles.button, pair === item && styles.selected]}><Text style={styles.label}>{item === 'hug' ? 'pair: hug 抱抱' : 'pair: tug 抢玩具'}</Text></Pressable>)}</View>
    {!otter && !pair && id === 'puppy' ? <View style={styles.row}>{(Object.keys(PUPPY_LOOKS) as PuppyLook[]).map(item => <Pressable key={item} onPress={() => setLook(item)}
      style={[styles.button, look === item && styles.selected]}><Text style={styles.label}>{item}</Text></Pressable>)}</View> : null}
    {!otter && !pair && id === 'maltese' ? <View style={styles.row}>{(Object.keys(MATE_LOOK) as MalteseLook[]).map(item => <Pressable key={item} onPress={() => setMalteseLook(item)}
      style={[styles.button, malteseLook === item && styles.selected]}><Text style={styles.label}>{item === 'petal' ? 'petal 花仙装' : item}</Text></Pressable>)}
      <Pressable onPress={() => { setTogether(value => !value); setRound(value => value + 1); }} style={[styles.button, together && styles.selected]}><Text style={styles.label}>with puppy 和小金毛一起</Text></Pressable></View> : null}
    {!otter && !pair && (id === 'puppy' || id === 'maltese') ? <View style={styles.row}>{(id === 'puppy' ? ['walk', 'run', 'sit', 'eat', 'pat'] as const : ['walk', 'run', 'sit'] as const).map(item => <Pressable key={item}
      onPress={() => { setMove(item); setRound(value => value + 1); }}
      style={[styles.button, move === item && styles.selected]}><Text style={styles.label}>{item}</Text></Pressable>)}</View> : null}
    <View style={styles.row}>
      <Pressable onPress={() => setSlow(value => !value)} style={[styles.button, slow && styles.selected]}><Text style={styles.label}>slow ¼×</Text></Pressable>
      <Pressable onPress={() => setRing('puppy')} style={styles.button}><Text style={styles.label}>ring: puppy 小金毛菜单</Text></Pressable>
      <Pressable onPress={() => setRing('maltese')} style={styles.button}><Text style={styles.label}>ring: maltese 小白菜单</Text></Pressable>
    </View>
    {ring ? <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]}>
      <PetRingMenu key={ring} petId={ring} pet={{ x: viewport.width / 2 - 60, y: 230, body: ring === 'puppy' ? 110 : 52 }} viewport={viewport}
        locale="zh-Hans" onClose={() => setRing(null)} />
    </View> : null}
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
