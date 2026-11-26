import { Canvas, Group, Rect } from '@shopify/react-native-skia';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useMemo, useState, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import WaterScenePreview, {
  type LotusRenderMode,
  type WaterSpeedMode,
} from '@/components/garden/water/WaterScenePreview';
import FishLayer, { type FishMotionPreset, type FishDensity } from '@/components/garden/water/FishLayer';
import LandLayer from '@/components/garden/LandLayer';
import GardenReferenceLayer from '@/components/garden/GardenReferenceLayer';
import {
  GARDEN_WATER_COLOR,
  GARDEN_WORLD_HEIGHT,
  GARDEN_WORLD_WIDTH,
} from '@/components/garden/gardenMapLayout';

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 3.5;

export default function WaterTestScreen() {
  const insets = useSafeAreaInsets();

  // Layer toggles
  const [baseVisible, setBaseVisible] = useState(true);
  const [baseVariant, setBaseVariant] = useState<'old' | 'new'>('new');
  const [baseOnly, setBaseOnly] = useState(false);
  const [fishVisible, setFishVisible] = useState(true);
  const [fishMotionPreset, setFishMotionPreset] = useState<FishMotionPreset>('normal');
  const [fishDensity, setFishDensity] = useState<FishDensity>('normal');
  const [fishOpacity, setFishOpacity] = useState(1.0);
  const [ripplesVisible, setRipplesVisible] = useState(true);
  const [wakeVisible, setWakeVisible] = useState(false);
  const [lotusVisible, setLotusVisible] = useState(true);
  const [lotusMode, setLotusMode] = useState<LotusRenderMode>('sway');

  // Opacities
  const [rippleOpacity, setRippleOpacity] = useState(0.35);
  const [wakeOpacity, setWakeOpacity] = useState(0.9);

  // Animation playback
  const [animationPlaying, setAnimationPlaying] = useState(true);
  const [speedMode, setSpeedMode] = useState<WaterSpeedMode>('normal');

  // Preview-only context overlays
  const [showLands, setShowLands] = useState(false);
  const [showReference, setShowReference] = useState(false);

  // UI state
  const [collapsed, setCollapsed] = useState(false);
  const [debugStatus, setDebugStatus] = useState('Initializing water preview...');
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  // Viewport fitting for the 2400 x 1800 world
  const fit = viewport.width && viewport.height
    ? Math.min(viewport.width / GARDEN_WORLD_WIDTH, viewport.height / GARDEN_WORLD_HEIGHT)
    : 0;
  const baseX = (viewport.width - GARDEN_WORLD_WIDTH * fit) / 2;
  const baseY = (viewport.height - GARDEN_WORLD_HEIGHT * fit) / 2;

  // Camera Pan & Zoom controls
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const focalWorldX = useSharedValue(0);
  const focalWorldY = useSharedValue(0);

  const cameraTransform = useDerivedValue(() => [
    { translateX: baseX + cameraX.value },
    { translateY: baseY + cameraY.value },
    { scale: fit * cameraZoom.value },
  ]);

  const cameraGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .maxPointers(1)
      .onStart(() => {
        startX.set(cameraX.value);
        startY.set(cameraY.value);
      })
      .onUpdate((event) => {
        cameraX.set(startX.value + event.translationX);
        cameraY.set(startY.value + event.translationY);
      });

    const pinch = Gesture.Pinch()
      .onStart((event) => {
        startZoom.set(cameraZoom.value);
        startX.set(cameraX.value);
        startY.set(cameraY.value);
        focalWorldX.set((event.focalX - baseX - startX.value) / (fit * startZoom.value));
        focalWorldY.set((event.focalY - baseY - startY.value) / (fit * startZoom.value));
      })
      .onUpdate((event) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom.value * event.scale));
        cameraZoom.set(nextZoom);
        cameraX.set(event.focalX - baseX - focalWorldX.value * fit * nextZoom);
        cameraY.set(event.focalY - baseY - focalWorldY.value * fit * nextZoom);
      });

    return Gesture.Simultaneous(pan, pinch);
  }, [baseX, baseY, fit, cameraX, cameraY, cameraZoom, focalWorldX, focalWorldY, startX, startY, startZoom]);

  const resetCamera = () => {
    cameraX.set(0);
    cameraY.set(0);
    cameraZoom.set(1);
  };

  // Dev-only screen: the hooks above always run, so hook order is the same in every build.
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View
        style={styles.canvasContainer}
        onLayout={({ nativeEvent: { layout } }) =>
          setViewport({ width: layout.width, height: layout.height })
        }>
        {fit > 0 && (
          <GestureDetector gesture={cameraGesture}>
            <Canvas style={styles.canvas}>
              <Group transform={cameraTransform}>
                {/* Fallback solid water background */}
                <Rect
                  x={0}
                  y={0}
                  width={GARDEN_WORLD_WIDTH}
                  height={GARDEN_WORLD_HEIGHT}
                  color={GARDEN_WATER_COLOR}
                />

                {/* Layered Water System Preview (base, ripples, wake, lotus — no static fish) */}
                <WaterScenePreview
                  width={GARDEN_WORLD_WIDTH}
                  height={GARDEN_WORLD_HEIGHT}
                  baseVisible={baseVisible}
                  baseVariant={baseVariant}
                  baseOnly={baseOnly}
                  ripplesVisible={ripplesVisible}
                  rippleOpacity={rippleOpacity}
                  wakeVisible={wakeVisible}
                  wakeOpacity={wakeOpacity}
                  fishVisible={false}
                  fishOpacity={0}
                  lotusVisible={lotusVisible}
                  lotusOpacity={1.0}
                  lotusMode={lotusMode}
                  animationEnabled={animationPlaying}
                  speedMode={speedMode}
                  onDebugStatus={setDebugStatus}
                />

                {/* Animated FishLayer (independent animated fish groups) */}
                <FishLayer
                  active={animationPlaying}
                  enabled={fishVisible && !baseOnly}
                  opacity={fishOpacity}
                  motionPreset={fishMotionPreset}
                  density={fishDensity}
                />

                {/* Optional context overlay: Lands */}
                {showLands && !baseOnly && (
                  <Group opacity={0.65}>
                    <LandLayer />
                  </Group>
                )}

                {/* Optional context overlay: Reference Layout */}
                {showReference && !baseOnly && <GardenReferenceLayer opacity={0.45} />}
              </Group>
            </Canvas>
          </GestureDetector>
        )}
      </View>

      {/* Lightweight DEV Debug Controls Panel */}
      <View
        style={[
          styles.panel,
          { top: insets.top + 6 },
          collapsed ? styles.collapsedPanel : styles.expandedPanel,
        ]}>
        <View style={styles.panelHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Water System Sandbox</Text>
            <Text style={styles.subtitle}>
              {animationPlaying ? '● Animating' : '○ Paused'} · Speed: {speedMode.toUpperCase()}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCollapsed((prev) => !prev)}
            style={styles.collapseButton}>
            <Text style={styles.collapseButtonText}>{collapsed ? 'Expand' : 'Collapse'}</Text>
          </Pressable>
        </View>

        {!collapsed && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            {/* Layer Visibility */}
            <Text style={styles.sectionLabel}>Water Base Comparison</Text>
            <View style={styles.buttonRow}>
              <ToggleButton label="Old Base" enabled={baseVariant === 'old'} onPress={() => setBaseVariant('old')} />
              <ToggleButton label="New Base" enabled={baseVariant === 'new'} onPress={() => setBaseVariant('new')} />
              <ToggleButton label="Base Only" enabled={baseOnly} onPress={() => setBaseOnly((v) => !v)} />
            </View>
            <Text style={styles.sectionLabel}>Layer Visibility</Text>
            <View style={styles.buttonRow}>
              <ToggleButton
                label="Base"
                enabled={baseVisible}
                onPress={() => setBaseVisible((v) => !v)}
              />
              <ToggleButton
                label={`Fish ${fishVisible ? 'ON' : 'OFF'}`}
                enabled={fishVisible}
                onPress={() => setFishVisible((v) => !v)}
              />
              <ToggleButton
                label="Ripples"
                enabled={ripplesVisible}
                onPress={() => setRipplesVisible((v) => !v)}
              />
              <ToggleButton
                label="Wake"
                enabled={wakeVisible}
                onPress={() => setWakeVisible((v) => !v)}
              />
              <ToggleButton
                label="Lotus"
                enabled={lotusVisible}
                onPress={() => setLotusVisible((v) => !v)}
              />
            </View>

            {/* Fish Controls */}
            {fishVisible && (
              <>
                <Text style={styles.sectionLabel}>Fish Motion</Text>
                <View style={styles.buttonRow}>
                  {(['subtle', 'normal', 'strong'] as const).map((preset) => (
                    <ToggleButton
                      key={preset}
                      label={preset.toUpperCase()}
                      enabled={fishMotionPreset === preset}
                      onPress={() => setFishMotionPreset(preset)}
                    />
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Fish Density</Text>
                <View style={styles.buttonRow}>
                  {(['low', 'normal', 'high'] as const).map((d) => (
                    <ToggleButton
                      key={d}
                      label={d.toUpperCase()}
                      enabled={fishDensity === d}
                      onPress={() => setFishDensity(d)}
                    />
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Fish Opacity ({Math.round(fishOpacity * 100)}%)</Text>
                <View style={styles.buttonRow}>
                  {[0.4, 0.6, 0.8, 1.0].map((val) => (
                    <ToggleButton
                      key={`fish-opacity-${val}`}
                      label={`${Math.round(val * 100)}%`}
                      enabled={fishOpacity === val}
                      onPress={() => setFishOpacity(val)}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Lotus Mode */}
            {lotusVisible && (
              <>
                <Text style={styles.sectionLabel}>Lotus Mode</Text>
                <View style={styles.buttonRow}>
                  <ToggleButton
                    label="Gentle Micro-Sway"
                    enabled={lotusMode === 'sway'}
                    onPress={() => setLotusMode('sway')}
                  />
                  <ToggleButton
                    label="Static Lotus"
                    enabled={lotusMode === 'static'}
                    onPress={() => setLotusMode('static')}
                  />
                </View>
              </>
            )}

            {/* Animation & Speed */}
            <Text style={styles.sectionLabel}>Animation Controls</Text>
            <View style={styles.buttonRow}>
              <ToggleButton
                label={animationPlaying ? 'Pause Animation' : 'Resume Animation'}
                enabled={animationPlaying}
                onPress={() => setAnimationPlaying((v) => !v)}
              />
              {(['slow', 'normal', 'fast'] as const).map((mode) => (
                <ToggleButton
                  key={mode}
                  label={mode.toUpperCase()}
                  enabled={speedMode === mode}
                  onPress={() => setSpeedMode(mode)}
                />
              ))}
            </View>

            {/* Ripple Opacity */}
            <Text style={styles.sectionLabel}>Ripple Opacity ({Math.round(rippleOpacity * 100)}%)</Text>
            <View style={styles.buttonRow}>
              {[0.3, 0.35, 0.45, 0.6, 0.85].map((val) => (
                <ToggleButton
                  key={`ripple-${val}`}
                  label={`${Math.round(val * 100)}%`}
                  enabled={rippleOpacity === val}
                  onPress={() => setRippleOpacity(val)}
                />
              ))}
            </View>

            {/* Wake Opacity */}
            <Text style={styles.sectionLabel}>Wake Opacity ({Math.round(wakeOpacity * 100)}%)</Text>
            <View style={styles.buttonRow}>
              {[0.3, 0.6, 0.9, 1.0].map((val) => (
                <ToggleButton
                  key={`wake-${val}`}
                  label={`${Math.round(val * 100)}%`}
                  enabled={wakeOpacity === val}
                  onPress={() => setWakeOpacity(val)}
                />
              ))}
            </View>

            {/* Context Overlays */}
            <Text style={styles.sectionLabel}>Preview Context Overlays</Text>
            <View style={styles.buttonRow}>
              <ToggleButton
                label={showLands ? 'Hide Lands' : 'Show Lands'}
                enabled={showLands}
                onPress={() => setShowLands((v) => !v)}
              />
              <ToggleButton
                label={showReference ? 'Hide Garden Ref' : 'Show Garden Ref'}
                enabled={showReference}
                onPress={() => setShowReference((v) => !v)}
              />
              <ToggleButton label="Reset View" enabled={false} onPress={resetCamera} />
            </View>

            {/* Diagnostics */}
            <Text style={styles.diagnostics}>{debugStatus}</Text>
          </ScrollView>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

function ToggleButton({
  label,
  enabled,
  onPress,
}: {
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, enabled && styles.buttonEnabled]}>
      <Text style={[styles.buttonText, enabled && styles.buttonTextEnabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2B2B',
  },
  canvasContainer: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: '#FFFFFFEE',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  collapsedPanel: {
    maxHeight: 65,
  },
  expandedPanel: {
    maxHeight: 380,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#153128',
  },
  subtitle: {
    fontSize: 11,
    color: '#526A62',
    marginTop: 1,
  },
  collapseButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E0E6E2',
  },
  collapseButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#245B45',
  },
  scroll: {
    marginTop: 8,
  },
  scrollContent: {
    gap: 6,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#344E45',
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  button: {
    minHeight: 28,
    paddingHorizontal: 9,
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#E2E7E4',
  },
  buttonEnabled: {
    backgroundColor: '#245B45',
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1A2E27',
  },
  buttonTextEnabled: {
    color: '#FFFFFF',
  },
  diagnostics: {
    fontSize: 10,
    color: '#4B635B',
    fontFamily: 'monospace',
    marginTop: 6,
    lineHeight: 14,
  },
});
