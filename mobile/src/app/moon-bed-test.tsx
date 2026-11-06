import { Canvas, Image, useImage } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import MoonBedEntity, {
  MOON_BED_HEIGHT,
  MOON_BED_LAYER_NAMES,
  MOON_BED_LAYER_REGISTRATION,
  MOON_BED_WIDTH,
  type MoonBedDebugMode,
  type MoonBedLayerName,
  type MoonBedRegistration,
} from '@/components/garden/MoonBedEntity';

const TEST_SCALE = 0.92;
const XY_NUDGES = [-20, -10, -5, -1, 1, 5, 10, 20] as const;
const SCALE_NUDGES = [-0.1, -0.05, -0.01, -0.005, 0.005, 0.01, 0.05, 0.1] as const;

function freshRegistration(): MoonBedRegistration {
  return Object.fromEntries(MOON_BED_LAYER_NAMES.map((name) => [
    name, { ...MOON_BED_LAYER_REGISTRATION[name] },
  ])) as MoonBedRegistration;
}

function cleanNumber(value: number) {
  return Number(value.toFixed(6));
}

function exportKey(name: MoonBedLayerName) {
  return name.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export default function MoonBedTestScreen() {
  const [mode, setMode] = useState<MoonBedDebugMode>('all');
  const [selected, setSelected] = useState<MoonBedLayerName>('frame-static');
  const [registration, setRegistration] = useState(freshRegistration);
  const [referenceOpacity, setReferenceOpacity] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [windMotionEnabled, setWindMotionEnabled] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [status, setStatus] = useState('Waiting for Canvas');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const master = useImage(require('@/assets/garden/landmarks/moon-bed/moon-bed-master.webp'));
  const fitScale = Math.min(viewport.width / MOON_BED_WIDTH, viewport.height / MOON_BED_HEIGHT) * TEST_SCALE;
  const scale = fitScale * previewZoom;

  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  if (!__DEV__) return <Redirect href="/" />;

  const selectedPlacement = registration[selected];
  const nudge = (field: 'x' | 'y' | 'scale', amount: number) => {
    setRegistration((current) => ({
      ...current,
      [selected]: {
        ...current[selected],
        [field]: field === 'scale'
          ? Math.max(0.01, current[selected].scale + amount)
          : current[selected][field] + amount,
      },
    }));
  };
  const resetSelected = () => setRegistration((current) => ({
    ...current, [selected]: { ...MOON_BED_LAYER_REGISTRATION[selected] },
  }));
  const exportJson = JSON.stringify(Object.fromEntries(MOON_BED_LAYER_NAMES.map((name) => [
      exportKey(name),
      {
        x: cleanNumber(registration[name].x),
        y: cleanNumber(registration[name].y),
        scale: cleanNumber(registration[name].scale),
      },
    ])), null, 2);

  return (
    <View style={styles.container}>
      <View style={styles.preview} onLayout={({ nativeEvent: { layout } }) =>
        setViewport({ width: layout.width, height: layout.height })}>
        {viewport.width > 0 && viewport.height > 0 && (
          <Canvas style={styles.canvas}>
            <MoonBedEntity
              x={(viewport.width - MOON_BED_WIDTH * scale) / 2}
              y={(viewport.height - MOON_BED_HEIGHT * scale) / 2}
              scale={scale}
              debugMode={mode}
              registration={registration}
              animationEnabled={windMotionEnabled}
              onDebugStatus={setStatus}
            />
            {master && referenceOpacity > 0 && (
              <Image image={master}
                x={(viewport.width - MOON_BED_WIDTH * scale) / 2}
                y={(viewport.height - MOON_BED_HEIGHT * scale) / 2}
                width={MOON_BED_WIDTH * scale} height={MOON_BED_HEIGHT * scale}
                opacity={referenceOpacity} fit="fill" />
            )}
          </Canvas>
        )}
      </View>
      <View style={[styles.panel, collapsed ? styles.collapsedPanel : styles.expandedPanel]}>
        <View style={styles.header}>
          <View style={styles.headerSummary}>
            <Text style={styles.title}>DEV Moon Bed — {mode}</Text>
            <Text style={styles.compactSummary}>
              {selected} · X {String(selectedPlacement.x)} · Y {String(selectedPlacement.y)}
              {' · '}Scale {String(selectedPlacement.scale)}
            </Text>
          </View>
          <Button label={collapsed ? 'Expand' : 'Collapse'}
            onPress={() => setCollapsed((value) => !value)} />
        </View>
        {!collapsed && (
          <ScrollView style={styles.controlsScroll} contentContainerStyle={styles.controlsContent}
            keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            <View style={styles.row}>
              <Button label="Fit" onPress={() => setPreviewZoom(1)} />
              <Button label="Zoom −" onPress={() => setPreviewZoom((value) => Math.max(0.6, value - 0.2))} />
              <Button label="Zoom +" onPress={() => setPreviewZoom((value) => Math.min(2, value + 0.2))} />
              <Button label={`Wind Motion ${windMotionEnabled ? 'ON' : 'OFF'}`}
                selected={windMotionEnabled}
                onPress={() => setWindMotionEnabled((value) => !value)} />
            </View>
            <View style={styles.row}>
              <Button label="ALL" selected={mode === 'all' && referenceOpacity === 0}
                onPress={() => { setMode('all'); setReferenceOpacity(0); }} />
              <Button label="SELECTED ONLY" selected={mode !== 'all' && referenceOpacity === 0}
                onPress={() => { setMode(selected); setReferenceOpacity(0); }} />
              <Button label="SELECTED + MASTER" selected={mode !== 'all' && referenceOpacity > 0}
                onPress={() => { setMode(selected); setReferenceOpacity(0.5); }} />
              <Button label="ALL + MASTER" selected={mode === 'all' && referenceOpacity > 0}
                onPress={() => { setMode('all'); setReferenceOpacity(0.5); }} />
            </View>
            <Text style={styles.value}>Target: {selected}</Text>
            <Text style={styles.registrationValues}>
              X: {String(selectedPlacement.x)}{`\n`}
              Y: {String(selectedPlacement.y)}{`\n`}
              Scale: {String(selectedPlacement.scale)}
            </Text>
            <View style={styles.row}>
              {MOON_BED_LAYER_NAMES.map((name) => (
                <Button key={name} label={name} selected={selected === name}
                  onPress={() => {
                    setSelected(name);
                    if (mode !== 'all') setMode(name);
                  }} />
              ))}
            </View>
            <Control label="X" value={selectedPlacement.x} values={XY_NUDGES}
              onNudge={(amount) => nudge('x', amount)} />
            <Control label="Y" value={selectedPlacement.y} values={XY_NUDGES}
              onNudge={(amount) => nudge('y', amount)} />
            <Control label="Scale" value={selectedPlacement.scale} values={SCALE_NUDGES}
              onNudge={(amount) => nudge('scale', amount)} />
            <View style={styles.row}>
              {[0, 0.3, 0.5, 0.7].map((opacity) => (
                <Button key={opacity} label={`Master ${opacity * 100}%`}
                  selected={referenceOpacity === opacity}
                  onPress={() => setReferenceOpacity(opacity)} />
              ))}
            </View>
            <View style={styles.row}>
              <Button label="Reset Selected" onPress={resetSelected} />
              <Button label="Reset All" onPress={() => setRegistration(freshRegistration())} />
              <Button label="Export / Copy Moon Bed Registration JSON"
                onPress={() => setShowExport((value) => !value)} />
            </View>
            {showExport && <TextInput multiline editable={false} selectTextOnFocus
              value={exportJson} style={styles.export} />}
            <Text style={styles.status}>Preview zoom: {previewZoom.toFixed(1)}×{`\n`}{status}</Text>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function Control({ label, value, values, onNudge }: {
  label: string; value: number; values: readonly number[]; onNudge: (amount: number) => void;
}) {
  return (
    <View style={styles.control}>
      <Text style={styles.value}>{label}: {String(value)}</Text>
      <View style={styles.row}>
        {values.map((amount) => <Button key={amount}
          label={`${amount > 0 ? '+' : ''}${amount}`} onPress={() => onNudge(amount)} />)}
      </View>
    </View>
  );
}

function Button({ label, selected = false, onPress }: {
  label: string; selected?: boolean; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[styles.button, selected && styles.selected]}>
      <Text style={[styles.buttonText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
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
  compactSummary: { color: '#172219', fontSize: 10, marginTop: 2 },
  controlsScroll: { flex: 1, marginTop: 4 },
  controlsContent: { paddingBottom: 10 },
  control: { marginTop: 6 },
  value: { color: '#172219', fontSize: 11, fontWeight: '700', marginTop: 6 },
  registrationValues: { color: '#172219', fontSize: 14, lineHeight: 20, fontWeight: '700',
    marginTop: 5, padding: 7, borderRadius: 5, backgroundColor: '#EEF1EF' },
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
