import { Canvas, Image, useImage } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import TeaSetEntity, {
  TEA_SET_HEIGHT, TEA_SET_LAYER_NAMES, TEA_SET_LAYER_REGISTRATION, TEA_SET_WIDTH,
  type TeaSetDebugMode, type TeaSetLayerName, type TeaSetRegistration,
} from '@/components/garden/TeaSetEntity';

const XY_NUDGES = [-20, -10, -5, -1, 1, 5, 10, 20] as const;
const SCALE_NUDGES = [-0.1, -0.05, -0.01, -0.005, 0.005, 0.01, 0.05, 0.1] as const;
const ROTATION_NUDGES = [-5, -1, -0.25, 0.25, 1, 5] as const;

const freshRegistration = () => Object.fromEntries(TEA_SET_LAYER_NAMES.map((name) => [
  name, { ...TEA_SET_LAYER_REGISTRATION[name] },
])) as TeaSetRegistration;
const exportKey = (name: TeaSetLayerName) =>
  name.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase());
const clean = (value: number) => Number(value.toFixed(6));

export default function TeaSetTestScreen() {
  const [mode, setMode] = useState<TeaSetDebugMode>('all');
  const [selected, setSelected] = useState<TeaSetLayerName>('tea-table');
  const [registration, setRegistration] = useState(freshRegistration);
  const [masterOpacity, setMasterOpacity] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [collapsed, setCollapsed] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [status, setStatus] = useState('Waiting for Canvas');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const master = useImage(require('@/assets/garden/landmarks/tea-set/tea-set-master.webp'));
  const fit = Math.min(viewport.width / TEA_SET_WIDTH, viewport.height / TEA_SET_HEIGHT) * 0.94;
  const scale = fit * previewZoom;

  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  if (!__DEV__) return <Redirect href="/" />;

  const nudge = (field: 'x' | 'y' | 'scale' | 'rotation', amount: number) => setRegistration((current) => ({
    ...current,
    [selected]: {
      ...current[selected],
      [field]: field === 'scale'
        ? Math.max(0.01, current[selected].scale + amount)
        : current[selected][field] + amount,
    },
  }));
  const exportJson = JSON.stringify(Object.fromEntries(TEA_SET_LAYER_NAMES.map((name) => [
    exportKey(name), {
      x: clean(registration[name].x), y: clean(registration[name].y),
      scale: clean(registration[name].scale),
      rotation: clean(registration[name].rotation),
    },
  ])), null, 2);

  return <View style={styles.container}>
    <View style={styles.preview} onLayout={({ nativeEvent: { layout } }) =>
      setViewport({ width: layout.width, height: layout.height })}>
      {viewport.width > 0 && viewport.height > 0 && <Canvas style={styles.canvas}>
        <TeaSetEntity
          x={(viewport.width - TEA_SET_WIDTH * scale) / 2}
          y={(viewport.height - TEA_SET_HEIGHT * scale) / 2}
          scale={scale} debugMode={mode} registration={registration} onDebugStatus={setStatus} />
        {master && masterOpacity > 0 && <Image image={master}
          x={(viewport.width - TEA_SET_WIDTH * scale) / 2}
          y={(viewport.height - TEA_SET_HEIGHT * scale) / 2}
          width={TEA_SET_WIDTH * scale} height={TEA_SET_HEIGHT * scale}
          opacity={masterOpacity} fit="fill" />}
      </Canvas>}
    </View>
    <View style={[styles.panel, collapsed ? styles.collapsedPanel : styles.expandedPanel]}>
      <View style={styles.header}>
        <View style={styles.headerSummary}>
          <Text style={styles.title}>DEV Tea Set — {mode}</Text>
          <Text style={styles.summary}>{selected} · X {String(registration[selected].x)}
            {' · '}Y {String(registration[selected].y)} · Scale {String(registration[selected].scale)}
            {' · '}Rotation {String(registration[selected].rotation)}°</Text>
        </View>
        <Button label={collapsed ? 'Expand' : 'Collapse'} onPress={() => setCollapsed((value) => !value)} />
      </View>
      {!collapsed && <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <View style={styles.row}>
          <Button label="Fit" onPress={() => setPreviewZoom(1)} />
          <Button label="Zoom −" onPress={() => setPreviewZoom((value) => Math.max(0.6, value - 0.2))} />
          <Button label="Zoom +" onPress={() => setPreviewZoom((value) => Math.min(2, value + 0.2))} />
        </View>
        <View style={styles.row}>
          <Button label="ALL" selected={mode === 'all' && masterOpacity === 0}
            onPress={() => { setMode('all'); setMasterOpacity(0); }} />
          <Button label="SELECTED ONLY" selected={mode !== 'all' && masterOpacity === 0}
            onPress={() => { setMode(selected); setMasterOpacity(0); }} />
          <Button label="SELECTED + MASTER" selected={mode !== 'all' && masterOpacity > 0}
            onPress={() => { setMode(selected); setMasterOpacity(0.5); }} />
          <Button label="ALL + MASTER" selected={mode === 'all' && masterOpacity > 0}
            onPress={() => { setMode('all'); setMasterOpacity(0.5); }} />
        </View>
        <Text style={styles.values}>Target: {selected}{'\n'}X: {String(registration[selected].x)}
          {'\n'}Y: {String(registration[selected].y)}{'\n'}Scale: {String(registration[selected].scale)}
          {'\n'}Rotation: {String(registration[selected].rotation)}°</Text>
        <View style={styles.row}>{TEA_SET_LAYER_NAMES.map((name) => <Button key={name}
          label={name} selected={selected === name} onPress={() => {
            setSelected(name);
            if (mode !== 'all') setMode(name);
          }} />)}</View>
        <Control label="X" value={registration[selected].x} increments={XY_NUDGES}
          onNudge={(amount) => nudge('x', amount)} />
        <Control label="Y" value={registration[selected].y} increments={XY_NUDGES}
          onNudge={(amount) => nudge('y', amount)} />
        <Control label="Scale" value={registration[selected].scale} increments={SCALE_NUDGES}
          onNudge={(amount) => nudge('scale', amount)} />
        <Control label="Rotation" value={registration[selected].rotation} increments={ROTATION_NUDGES}
          suffix="°" onNudge={(amount) => nudge('rotation', amount)} />
        <View style={styles.row}>{[0, 0.3, 0.5, 0.7].map((opacity) => <Button key={opacity}
          label={`Master ${opacity * 100}%`} selected={masterOpacity === opacity}
          onPress={() => setMasterOpacity(opacity)} />)}</View>
        <View style={styles.row}>
          <Button label="Reset Selected" onPress={() => setRegistration((current) => ({
            ...current, [selected]: { ...TEA_SET_LAYER_REGISTRATION[selected] },
          }))} />
          <Button label="Reset All" onPress={() => setRegistration(freshRegistration())} />
          <Button label="Export / Copy Tea Set Registration JSON"
            onPress={() => setShowExport((value) => !value)} />
        </View>
        {showExport && <TextInput multiline editable={false} selectTextOnFocus
          value={exportJson} style={styles.export} />}
        <Text style={styles.status}>Preview zoom: {previewZoom.toFixed(1)}×{'\n'}{status}</Text>
      </ScrollView>}
    </View>
  </View>;
}

function Control({ label, value, increments, suffix = '', onNudge }: {
  label: string; value: number; increments: readonly number[]; suffix?: string;
  onNudge: (amount: number) => void;
}) {
  return <View style={styles.control}><Text style={styles.value}>{label}: {String(value)}{suffix}</Text>
    <View style={styles.row}>{increments.map((amount) => <Button key={amount}
      label={`${amount > 0 ? '+' : ''}${amount}${suffix}`} onPress={() => onNudge(amount)} />)}</View></View>;
}

function Button({ label, selected = false, onPress }: {
  label: string; selected?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.button, selected && styles.selected]}>
    <Text style={[styles.buttonText, selected && styles.selectedText]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#D8DDD8' },
  preview: { flex: 1 },
  canvas: { flex: 1 },
  panel: { flexShrink: 0, margin: 8, marginTop: 0, padding: 8,
    borderRadius: 8, backgroundColor: '#FFFFFFF2', overflow: 'hidden' },
  expandedPanel: { height: '42%', maxHeight: '42%' },
  collapsedPanel: { height: undefined },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headerSummary: { flex: 1 },
  title: { color: '#172219', fontSize: 12, fontWeight: '700' },
  summary: { color: '#172219', fontSize: 10, marginTop: 2 },
  scroll: { flex: 1, marginTop: 4 },
  scrollContent: { paddingBottom: 10 },
  control: { marginTop: 6 },
  value: { color: '#172219', fontSize: 11, fontWeight: '700' },
  values: { color: '#172219', fontSize: 13, lineHeight: 19, fontWeight: '700',
    marginTop: 6, padding: 7, borderRadius: 5, backgroundColor: '#EEF1EF' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  button: { minHeight: 29, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: 5, backgroundColor: '#D8DDDA' },
  selected: { backgroundColor: '#245B45' },
  buttonText: { color: '#172219', fontSize: 10, fontWeight: '600' },
  selectedText: { color: '#FFFFFF' },
  status: { color: '#172219', fontSize: 10, marginTop: 7 },
  export: { minHeight: 180, marginTop: 8, padding: 8, color: '#172219',
    backgroundColor: '#EEF1EF', fontSize: 10, fontFamily: 'monospace', textAlignVertical: 'top' },
});
