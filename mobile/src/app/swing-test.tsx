import { Canvas, Image, useImage } from '@shopify/react-native-skia';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import SwingEntity, {
  FAIRY_SEAT_ANCHOR_X,
  FAIRY_SEAT_ANCHOR_Y,
  SWING_HEIGHT,
  SWING_IDLE_HALF_CYCLE_MS,
  SWING_LAYER_NAMES,
  SWING_LAYER_REGISTRATION,
  SWING_PIVOT_X,
  SWING_PIVOT_Y,
  SWING_WIDTH,
  type SwingDebugMode,
  type SwingSeatCalibration,
  type RibbonMotionStrength,
} from '@/components/garden/SwingEntity';
import { type WorldTimeOverride, useWorldTime } from '@/components/garden/world-time';

const TEST_SCALE = 0.92;
const XY_NUDGES = [-10, -5, -1, 1, 5, 10] as const;
const SCALE_NUDGES = [-0.05, -0.01, -0.005, 0.005, 0.01, 0.05] as const;
const CHECKED_IN_SEAT: SwingSeatCalibration = {
  movingBack: {
    x: SWING_LAYER_REGISTRATION['swing-moving-back'].x,
    y: SWING_LAYER_REGISTRATION['swing-moving-back'].y,
    scale: SWING_LAYER_REGISTRATION['swing-moving-back'].scale,
  },
  movingFront: {
    x: SWING_LAYER_REGISTRATION['swing-moving-front'].x,
    y: SWING_LAYER_REGISTRATION['swing-moving-front'].y,
    scale: SWING_LAYER_REGISTRATION['swing-moving-front'].scale,
  },
  movingGroup: { xOffset: 0, yOffset: 0 },
};
type CalibrationTarget = 'movingBack' | 'movingFront' | 'movingGroup';

function freshCheckedInSeat(): SwingSeatCalibration {
  return {
    movingBack: { ...CHECKED_IN_SEAT.movingBack },
    movingFront: { ...CHECKED_IN_SEAT.movingFront },
    movingGroup: { ...CHECKED_IN_SEAT.movingGroup },
  };
}

export default function SwingTestScreen() {
  const worldTime = useWorldTime();
  const [mode, setMode] = useState<SwingDebugMode>('all');
  const [showAnchor, setShowAnchor] = useState(true);
  const [showPivot, setShowPivot] = useState(true);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [occupied, setOccupied] = useState(false);
  const [swingAmplitude, setSwingAmplitude] = useState(4);
  const [ribbonAnimationEnabled, setRibbonAnimationEnabled] = useState(true);
  const [ribbonMotionStrength, setRibbonMotionStrength] = useState<RibbonMotionStrength>('soft');
  const [calibrationEnabled, setCalibrationEnabled] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState<CalibrationTarget>('movingFront');
  const [seatCalibration, setSeatCalibration] = useState(freshCheckedInSeat);
  const [exportJson, setExportJson] = useState('');
  const [panelCollapsed, setPanelCollapsed] = useState(true);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [referenceOpacity, setReferenceOpacity] = useState(0);
  const [status, setStatus] = useState('Waiting for Canvas');
  const masterReference = useImage(require('@/assets/garden/landmarks/swing/swing-master.webp'));
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const fitScale = Math.min(
    viewport.width / SWING_WIDTH,
    viewport.height / SWING_HEIGHT,
  ) * TEST_SCALE;
  const scale = fitScale * previewZoom;

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  const nudge = (field: 'x' | 'y' | 'scale' | 'xOffset' | 'yOffset', amount: number) => {
    setSeatCalibration((current) => {
      const selected = current[calibrationTarget];
      const nextValue = field === 'scale'
        ? Math.max(0.01, (selected as typeof current.movingFront).scale + amount)
        : (selected as unknown as Record<string, number>)[field] + amount;
      return { ...current, [calibrationTarget]: { ...selected, [field]: nextValue } };
    });
  };
  const resetSelected = () => setSeatCalibration((current) => ({
    ...current,
    [calibrationTarget]: { ...CHECKED_IN_SEAT[calibrationTarget] },
  }));
  const exportCalibration = () => {
    const json = JSON.stringify(seatCalibration, null, 2);
    setExportJson(json);
    console.log(`Swing seat calibration:\n${json}`);
  };

  return (
    <View style={styles.container}>
      {__DEV__ && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.title}>DEV Swing — {mode}</Text>
            <Pressable onPress={() => setPanelCollapsed((value) => !value)} style={styles.button}>
              <Text style={styles.text}>{panelCollapsed ? 'Expand' : 'Collapse'}</Text>
            </Pressable>
          </View>
          {!panelCollapsed && (
            <ScrollView contentContainerStyle={styles.panelContent}>
              <View style={styles.buttons}>
                <Pressable onPress={() => setPreviewZoom(1)} style={styles.button}>
                  <Text style={styles.text}>Fit</Text>
                </Pressable>
                <Pressable onPress={() => setPreviewZoom((value) => Math.max(0.6, value - 0.2))}
                  style={styles.button}>
                  <Text style={styles.text}>Zoom −</Text>
                </Pressable>
                <Pressable onPress={() => setPreviewZoom((value) => Math.min(2, value + 0.2))}
                  style={styles.button}>
                  <Text style={styles.text}>Zoom +</Text>
                </Pressable>
                <Pressable onPress={() => setShowAnchor((value) => !value)}
                  style={[styles.button, showAnchor && styles.selected]}>
                  <Text style={styles.text}>Anchor {showAnchor ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable onPress={() => setShowPivot((value) => !value)}
                  style={[styles.button, showPivot && styles.selected]}>
                  <Text style={styles.text}>Pivot {showPivot ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable onPress={() => setAnimationEnabled((value) => !value)}
                  style={[styles.button, animationEnabled && styles.selected]}>
                  <Text style={styles.text}>Animation {animationEnabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable onPress={() => setOccupied(false)}
                  style={[styles.button, !occupied && styles.selected]}>
                  <Text style={styles.text}>Swing Occupancy: EMPTY</Text>
                </Pressable>
                <Pressable onPress={() => setOccupied(true)}
                  style={[styles.button, occupied && styles.selected]}>
                  <Text style={styles.text}>Swing Occupancy: FAIRY ON SWING</Text>
                </Pressable>
                <Pressable onPress={() => {
                  setCalibrationEnabled((value) => {
                    if (!value) {
                      setAnimationEnabled(false);
                      setPanelCollapsed(false);
                      setReferenceOpacity(0.5);
                    }
                    return !value;
                  });
                }} style={[styles.button, calibrationEnabled && styles.selected]}>
                  <Text style={styles.text}>Swing Seat Calibration {calibrationEnabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
                {[2, 4, 6].map((amplitude) => (
                  <Pressable key={amplitude} onPress={() => setSwingAmplitude(amplitude)}
                    style={[styles.button, swingAmplitude === amplitude && styles.selected]}>
                    <Text style={styles.text}>{amplitude}°</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setRibbonAnimationEnabled((value) => !value)}
                  style={[styles.button, ribbonAnimationEnabled && styles.selected]}>
                  <Text style={styles.text}>Ribbon Animation {ribbonAnimationEnabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
                {(['soft', 'medium', 'strong'] as const).map((strength) => (
                  <Pressable key={strength} onPress={() => setRibbonMotionStrength(strength)}
                    style={[styles.button, ribbonMotionStrength === strength && styles.selected]}>
                    <Text style={styles.text}>Ribbon {strength}</Text>
                  </Pressable>
                ))}
                {([
                  ['auto', 'Time AUTO'],
                  ['day', 'Force DAY'],
                  ['evening', 'Force EVENING'],
                  ['night', 'Force NIGHT'],
                ] as const).map(([override, label]) => (
                  <Pressable key={override}
                    onPress={() => worldTime.setOverride(override as WorldTimeOverride)}
                    style={[styles.button, worldTime.override === override && styles.selected]}>
                    <Text style={styles.text}>{label}</Text>
                  </Pressable>
                ))}
                {[0, 0.3, 0.5, 0.7].map((opacity) => (
                  <Pressable key={opacity} onPress={() => setReferenceOpacity(opacity)}
                    style={[styles.button, referenceOpacity === opacity && styles.selected]}>
                    <Text style={styles.text}>Master {Math.round(opacity * 100)}%</Text>
                  </Pressable>
                ))}
                {(['all', ...SWING_LAYER_NAMES] as const).map((name) => (
                  <Pressable key={name} onPress={() => setMode(name)}
                    style={[styles.button, mode === name && styles.selected]}>
                    <Text style={styles.text}>{name}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => { setMode('seat-only'); setReferenceOpacity(0); }}
                  style={styles.button}>
                  <Text style={styles.text}>Seat Only</Text>
                </Pressable>
                <Pressable onPress={() => { setMode('seat-only'); setReferenceOpacity(0.5); }}
                  style={styles.button}>
                  <Text style={styles.text}>Seat + Master</Text>
                </Pressable>
                <Pressable onPress={() => setMode('all')} style={styles.button}>
                  <Text style={styles.text}>Full Swing</Text>
                </Pressable>
              </View>
              {calibrationEnabled && (
                <View style={styles.calibration}>
                  <View style={styles.buttons}>
                    {([
                      ['movingBack', 'Moving Back'],
                      ['movingFront', 'Moving Front'],
                      ['movingGroup', 'Whole Moving Group'],
                    ] as const).map(([target, label]) => (
                      <Pressable key={target} onPress={() => setCalibrationTarget(target)}
                        style={[styles.button, calibrationTarget === target && styles.selected]}>
                        <Text style={styles.text}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text selectable style={styles.calibrationValue}>
                    {calibrationTarget}: {JSON.stringify(seatCalibration[calibrationTarget])}
                  </Text>
                  {calibrationTarget === 'movingGroup' ? (
                    <>
                      <NudgeRow label="GROUP X OFFSET" values={XY_NUDGES}
                        onNudge={(amount) => nudge('xOffset', amount)} />
                      <NudgeRow label="GROUP Y OFFSET" values={XY_NUDGES}
                        onNudge={(amount) => nudge('yOffset', amount)} />
                    </>
                  ) : (
                    <>
                      <NudgeRow label="X" values={XY_NUDGES} onNudge={(amount) => nudge('x', amount)} />
                      <NudgeRow label="Y" values={XY_NUDGES} onNudge={(amount) => nudge('y', amount)} />
                      <NudgeRow label="Scale" values={SCALE_NUDGES}
                        onNudge={(amount) => nudge('scale', amount)} />
                    </>
                  )}
                  <View style={styles.buttons}>
                    <Pressable onPress={resetSelected} style={styles.button}>
                      <Text style={styles.text}>Reset Selected</Text>
                    </Pressable>
                    <Pressable onPress={() => setSeatCalibration(freshCheckedInSeat())} style={styles.button}>
                      <Text style={styles.text}>Reset All Seat Calibration</Text>
                    </Pressable>
                    <Pressable onPress={exportCalibration} style={styles.button}>
                      <Text style={styles.text}>Export Swing Seat Calibration</Text>
                    </Pressable>
                  </View>
                  {!!exportJson && <Text selectable style={styles.exportText}>{exportJson}</Text>}
                </View>
              )}
              <Text style={styles.text}>Preview zoom: {previewZoom.toFixed(1)}×</Text>
              <Text style={styles.text}>Swing: ±{swingAmplitude}° · {SWING_IDLE_HALF_CYCLE_MS} ms/direction</Text>
              <Text style={styles.text}>Master: {masterReference ? 'loaded 1312 × 1199' : 'loading'}</Text>
              <Text style={styles.text}>
                World Time: {worldTime.override === 'auto'
                  ? 'AUTO'
                  : `FORCE ${worldTime.override.toUpperCase()}`}
                {' → '}{worldTime.phase.toUpperCase()} · Lantern glow {' '}
                {worldTime.isTreehouseLightingTime ? 'ON' : 'OFF'}
              </Text>
              <Text style={styles.text}>Pivot: {SWING_PIVOT_X}, {SWING_PIVOT_Y}</Text>
              <Text style={styles.text}>Fairy seat: {FAIRY_SEAT_ANCHOR_X}, {FAIRY_SEAT_ANCHOR_Y}</Text>
              <Text style={styles.status}>{status}</Text>
            </ScrollView>
          )}
        </View>
      )}
      <View style={styles.preview} onLayout={({ nativeEvent: { layout } }) =>
        setViewport({ width: layout.width, height: layout.height })}>
        {viewport.width > 0 && viewport.height > 0 && (
          <Canvas style={styles.canvas}>
            <SwingEntity
              x={(viewport.width - SWING_WIDTH * scale) / 2}
              y={(viewport.height - SWING_HEIGHT * scale) / 2}
              scale={scale}
              debugMode={mode}
              showAnchor={showAnchor}
              showPivot={showPivot}
              onDebugStatus={setStatus}
              animationEnabled={animationEnabled}
              occupied={occupied}
              swingAmplitudeDegrees={swingAmplitude}
              seatCalibration={seatCalibration}
              ribbonAnimationEnabled={ribbonAnimationEnabled}
              ribbonMotionStrength={ribbonMotionStrength}
              lanternLightingEnabled={worldTime.isTreehouseLightingTime}
            />
            {__DEV__ && masterReference && referenceOpacity > 0 && (
              <Image
                image={masterReference}
                x={(viewport.width - SWING_WIDTH * scale) / 2}
                y={(viewport.height - SWING_HEIGHT * scale) / 2}
                width={SWING_WIDTH * scale}
                height={SWING_HEIGHT * scale}
                opacity={referenceOpacity}
                fit="fill"
              />
            )}
          </Canvas>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DCE4DA' },
  preview: { flex: 1, minHeight: 0 },
  canvas: { flex: 1 },
  panel: {
    flexShrink: 0, maxHeight: 280, margin: 8, marginBottom: 0,
    borderRadius: 8, backgroundColor: '#FFFFFF', overflow: 'hidden',
  },
  panelHeader: {
    minHeight: 42, paddingHorizontal: 8, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  panelContent: { paddingHorizontal: 8, paddingBottom: 8 },
  title: { color: '#172219', fontSize: 12, fontWeight: '700' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 6 },
  button: { padding: 6, borderRadius: 4, backgroundColor: '#E5E7EB' },
  selected: { backgroundColor: '#A7D6AF' },
  text: { color: '#172219', fontSize: 11 },
  status: { color: '#37423A', fontSize: 10, marginTop: 4 },
  calibration: { paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9CA3AF' },
  calibrationValue: { color: '#172219', fontSize: 11, fontWeight: '700' },
  exportText: { color: '#172219', fontSize: 10, fontFamily: 'monospace' },
});

function NudgeRow({ label, values, onNudge }: {
  label: string;
  values: readonly number[];
  onNudge: (amount: number) => void;
}) {
  return (
    <View>
      <Text style={styles.text}>{label}</Text>
      <View style={styles.buttons}>
        {values.map((value) => (
          <Pressable key={value} onPress={() => onNudge(value)} style={styles.button}>
            <Text style={styles.text}>{value > 0 ? '+' : ''}{value}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
