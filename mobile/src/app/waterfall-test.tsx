import { Canvas, Group, Image, Rect, useImage } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import WaterfallEntity, {
  WATERFALL_DEBUG_MODES, WATERFALL_HEIGHT, WATERFALL_LAYER_NAMES,
  WATERFALL_LAYER_REGISTRATION, WATERFALL_WIDTH,
  type WaterfallDebugMode, type WaterfallFlowSpeed,
  type WaterfallLayerName, type WaterfallRegistration,
} from '@/components/garden/WaterfallEntity';

const XY_NUDGES = [-50, -20, -10, -5, -1, 1, 5, 10, 20, 50] as const;
const SCALE_NUDGES = [-0.1, -0.05, -0.01, -0.005, 0.005, 0.01, 0.05, 0.1] as const;
const clean = (value: number) => Number(value.toFixed(6));
const freshRegistration = () => Object.fromEntries(WATERFALL_LAYER_NAMES.map((name) => [
  name, { ...WATERFALL_LAYER_REGISTRATION[name] },
])) as WaterfallRegistration;
const exportKey = (name: WaterfallLayerName) => name.replace(/[-_]([a-z])/g,
  (_, letter: string) => letter.toUpperCase());
const MODE_LABELS: Record<WaterfallDebugMode, string> = {
  all: 'All',
  'waterfall-static': 'Static',
  'main-body': 'Main Body',
  'main-highlight': 'Main Highlight',
  crest: 'Crest',
  'secondary-body': 'Secondary Body',
  'secondary-highlight': 'Secondary Highlight',
  waterfall_foam: 'Foam',
  'splash-particles': 'Splash Particles',
  waterfall_mist: 'Mist',
};

export default function WaterfallTestScreen() {
  const [mode, setMode] = useState<WaterfallDebugMode>('all');
  const [selected, setSelected] = useState<WaterfallLayerName>('waterfall_flow_main');
  const [registration, setRegistration] = useState(freshRegistration);
  const [diagnostics, setDiagnostics] = useState(true);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [flowSpeed, setFlowSpeed] = useState<WaterfallFlowSpeed>('normal');
  const [splashParticlesVisible, setSplashParticlesVisible] = useState(true);
  const [showRegistrationRoi, setShowRegistrationRoi] = useState(false);
  const [masterOpacity, setMasterOpacity] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [collapsed, setCollapsed] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [status, setStatus] = useState('Waiting for Canvas');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const master = useImage(require('@/assets/garden/landmarks/waterfall/waterfall-master.webp'));

  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  if (!__DEV__) return <Redirect href="/" />;

  const fit = viewport.width && viewport.height
    ? Math.min(viewport.width / WATERFALL_WIDTH, viewport.height / WATERFALL_HEIGHT) * 0.94 : 0;
  const viewScale = fit * previewZoom;
  const x = (viewport.width - WATERFALL_WIDTH * viewScale) / 2;
  const y = (viewport.height - WATERFALL_HEIGHT * viewScale) / 2;
  const nudge = (field: 'x' | 'y' | 'scale', amount: number) => setRegistration((current) => ({
    ...current,
    [selected]: {
      ...current[selected],
      [field]: field === 'scale'
        ? Math.max(0.01, clean(current[selected].scale + amount))
        : clean(current[selected][field] + amount),
    },
  }));
  const exportJson = JSON.stringify(Object.fromEntries(WATERFALL_LAYER_NAMES.map((name) => [
    exportKey(name), {
      x: clean(registration[name].x), y: clean(registration[name].y),
      scale: clean(registration[name].scale),
    },
  ])), null, 2);

  return <View style={styles.container}>
    <View style={styles.preview} onLayout={({ nativeEvent: { layout } }) =>
      setViewport({ width: layout.width, height: layout.height })}>
      {fit > 0 && <Canvas style={styles.canvas}>
        {master && masterOpacity > 0 && <Image image={master}
          x={x} y={y} width={WATERFALL_WIDTH * viewScale} height={WATERFALL_HEIGHT * viewScale}
          opacity={masterOpacity} fit="fill" />}
        <WaterfallEntity x={x} y={y} scale={viewScale} debugMode={mode}
          registration={registration} animationEnabled={animationEnabled}
          flowSpeed={flowSpeed} splashParticlesVisible={splashParticlesVisible} assetQuality="map"
          onDebugStatus={setStatus} />
        {diagnostics && <Group transform={[{ translateX: x }, { translateY: y }, { scale: viewScale }]}>
          <Rect x={0} y={0} width={WATERFALL_WIDTH} height={WATERFALL_HEIGHT}
            color="#FF2FA8" style="stroke" strokeWidth={4 / viewScale} />
          {showRegistrationRoi && <Rect x={0} y={0} width={WATERFALL_WIDTH} height={WATERFALL_HEIGHT}
            color="#FF9F1C" style="stroke" strokeWidth={5 / viewScale} />}
        </Group>}
      </Canvas>}
    </View>

    <View style={[styles.panel, collapsed ? styles.collapsedPanel : styles.expandedPanel]}>
      <View style={styles.header}>
        <View style={styles.headerSummary}>
          <Text style={styles.title}>DEV Waterfall — {MODE_LABELS[mode]}</Text>
          <Text style={styles.summary}>Canvas {WATERFALL_WIDTH} × {WATERFALL_HEIGHT} · {selected} · X {String(registration[selected].x)}
            {' · '}Y {String(registration[selected].y)} · Scale {String(registration[selected].scale)}</Text>
        </View>
        <Button label={collapsed ? 'Expand' : 'Collapse'} onPress={() => setCollapsed((value) => !value)} />
      </View>

      {!collapsed && <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <View style={styles.row}>
          <Button label="Fit" onPress={() => setPreviewZoom(1)} />
          <Button label="Zoom −" onPress={() => setPreviewZoom((value) => Math.max(0.6, clean(value - 0.2)))} />
          <Button label="Zoom +" onPress={() => setPreviewZoom((value) => Math.min(2, clean(value + 0.2)))} />
          <Button label={`Diagnostics ${diagnostics ? 'ON' : 'OFF'}`}
            selected={diagnostics} onPress={() => setDiagnostics((value) => !value)} />
          <Button label={`Animation ${animationEnabled ? 'ON' : 'OFF'}`}
            selected={animationEnabled} onPress={() => setAnimationEnabled((value) => !value)} />
          <Button label={`Registration ROI ${showRegistrationRoi ? 'ON' : 'OFF'}`}
            selected={showRegistrationRoi} onPress={() => {
              setShowRegistrationRoi((value) => !value);
              setDiagnostics(true);
            }} />
        </View>
        <View style={styles.row}>
          {(['slow', 'normal', 'fast'] as const).map((speed) => <Button key={speed}
            label={`Speed ${speed}`} selected={flowSpeed === speed}
            onPress={() => setFlowSpeed(speed)} />)}
        </View>
        <View style={styles.row}>
          <Text style={styles.value}>Foam Core: Stable (A)</Text>
          <Button label={`Splash Particles ${splashParticlesVisible ? 'ON' : 'OFF'}`}
            selected={splashParticlesVisible}
            onPress={() => setSplashParticlesVisible((value) => !value)} />
        </View>
        <View style={styles.row}>
          {WATERFALL_DEBUG_MODES.map((debugMode) => <Button key={debugMode}
            label={MODE_LABELS[debugMode]} selected={mode === debugMode && masterOpacity === 0}
            onPress={() => { setMode(debugMode); setMasterOpacity(0); }} />)}
          <Button label="ALL + MASTER" selected={mode === 'all' && masterOpacity > 0}
            onPress={() => { setMode('all'); setMasterOpacity(0.5); }} />
        </View>
        <Text style={styles.values}>Target: {selected}{'\n'}X: {String(registration[selected].x)}
          {'\n'}Y: {String(registration[selected].y)}{'\n'}Scale: {String(registration[selected].scale)}
          {'\n'}Preview zoom: {previewZoom.toFixed(1)}×</Text>
        <View style={styles.row}>{WATERFALL_LAYER_NAMES.map((name) => <Button key={name}
          label={name} selected={selected === name} onPress={() => {
            setSelected(name);
          }} />)}</View>
        <Control label="X" value={registration[selected].x} increments={XY_NUDGES}
          onNudge={(amount) => nudge('x', amount)} />
        <Control label="Y" value={registration[selected].y} increments={XY_NUDGES}
          onNudge={(amount) => nudge('y', amount)} />
        <Control label="Selected layer Scale" value={registration[selected].scale}
          increments={SCALE_NUDGES} onNudge={(amount) => nudge('scale', amount)} />
        <View style={styles.row}>{[0, 0.3, 0.5, 0.7].map((opacity) => <Button key={opacity}
          label={`Master ${opacity * 100}%`} selected={masterOpacity === opacity}
          onPress={() => setMasterOpacity(opacity)} />)}</View>
        <View style={styles.row}>
          <Button label="Reset Selected" onPress={() => setRegistration((current) => ({
            ...current, [selected]: { ...WATERFALL_LAYER_REGISTRATION[selected] },
          }))} />
          <Button label="Reset All" onPress={() => setRegistration(freshRegistration())} />
          <Button label="Export / Copy Waterfall Registration JSON"
            onPress={() => setShowExport((value) => !value)} />
        </View>
        {showExport && <TextInput multiline editable={false} selectTextOnFocus
          value={exportJson} style={styles.export} />}
        {diagnostics && <Text style={styles.status}>
          Canonical master: {WATERFALL_WIDTH} × {WATERFALL_HEIGHT}{'\n'}{status}
        </Text>}
      </ScrollView>}
    </View>
  </View>;
}

function Control({ label, value, increments, onNudge }: {
  label: string; value: number; increments: readonly number[]; onNudge: (amount: number) => void;
}) {
  return <View style={styles.control}><Text style={styles.value}>{label}: {String(value)}</Text>
    <View style={styles.row}>{increments.map((amount) => <Button key={amount}
      label={`${amount > 0 ? '+' : ''}${amount}`} onPress={() => onNudge(amount)} />)}</View></View>;
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
  status: { color: '#172219', fontSize: 10, lineHeight: 14, marginTop: 7 },
  export: { minHeight: 180, marginTop: 8, padding: 8, color: '#172219',
    backgroundColor: '#EEF1EF', fontSize: 10, fontFamily: 'monospace', textAlignVertical: 'top' },
});
