import { Canvas, Group } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { GARDEN_WORLD_HEIGHT, GARDEN_WORLD_WIDTH } from '../gardenMapLayout';
import { FlowerClusterLayer, CLUSTER_VISUALS, LEGACY_CLUSTER_VISUALS, CLUSTER_MATTE_NOTE } from './FlowerClusterLayer';
import SandboxGardenBackdrop from './SandboxGardenBackdrop';
import { FlowerEmotionPreview, previewVisual } from '../flower-visuals/FlowerEmotionPreview';
import { GardenFlowerVisualLayer } from '../flower-visuals/GardenFlowerVisualLayer';
import { classifyMaskArea, cloneAreaProfiles, changeProfileWeight, composeReviewObjects } from './tulip-components/tulipAreaProfiles';
import { cloneClusterVisualScales, clusterVisualScale } from './tulip-components/clusterVisualScale';
import { TulipComponentLayer, FixedTulipBounds } from './tulip-components/TulipComponentLayer';
import { CHAMOMILE_CATALOG } from './chamomile-components/chamomileCatalog';
import { HYDRANGEA_CATALOG } from './hydrangea-components/hydrangeaCatalog';
import { ALL_SPECIES_PRESETS, AVAILABLE_SPECIES, generateAllSpeciesLayout, composeAllSpecies } from './allSpeciesReviewModel';
import { composeMixedV2, MIXED_V2_PRESETS, densityCounts } from './mixedV2ReviewModel';
import { GROWTH_PRESETS, buildMonthlyGrowth, monthlyGrowthRecords, primaryHitTarget } from './monthly-growth/monthlyGrowthModel';
import { MonthlyGrowthLayer } from './monthly-growth/MonthlyGrowthLayer';
import { buildLayeredBed } from './monthly-growth/layeredBedModel';
import { MixedNeighborhoodLayer } from './MixedNeighborhoodLayer';
import { catalogForBatchSpecies } from './batch-components/batchCatalog';
import { generateSpeciesReviewLayout, composeSpeciesReview, SPECIES_REVIEW_PRESETS, HYDRANGEA_REVIEW_PRESETS, type SpeciesReview } from './speciesReviewModel';
import { TULIP_REVIEW_PRESETS, TULIP_REVIEW_RADIUS, TULIP_REVIEW_SETTINGS,
  TULIP_REVIEW_SCALES, tulipReviewTuning, type TulipScaleMode } from './tulipReviewPreset';
import {
  DEFAULT_TUNING, generateDensityLayout, getRegionInfo,
  type ClassTuning, type FlowerClass, type PreviewMode,
} from './flowerDensityModel';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MODES: { value: PreviewMode; label: string }[] = [
  { value: 'S', label: 'Chamomile Only' }, { value: 'M', label: 'Tulip Only' },
  { value: 'L', label: 'Hydrangea Only' }, { value: 'mixed', label: 'Mixed S/M/L' },
];
const CLASS_NAMES: Record<FlowerClass, string> = { S: 'Chamomile', M: 'Tulip', L: 'Hydrangea' };
const REVIEW_TARGETS: { label: string; month: number; mode: PreviewMode; count: number }[] = [
  { label: 'June · Mixed · 30', month: 6, mode: 'mixed', count: 30 },
  { label: 'October · Mixed · 30', month: 10, mode: 'mixed', count: 30 },
  { label: 'October · Tulip · 30', month: 10, mode: 'M', count: 30 },
  { label: 'June · Chamomile · 30', month: 6, mode: 'S', count: 30 },
  { label: 'October · Hydrangea · 20', month: 10, mode: 'L', count: 20 },
];
const cloneDefaults = () => ({ S: { ...DEFAULT_TUNING.S }, M: { ...DEFAULT_TUNING.M }, L: { ...DEFAULT_TUNING.L } });

function Button({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }}
    onPress={onPress} style={[styles.button, selected && styles.selectedButton]}>
    <Text style={[styles.buttonText, selected && styles.selectedText]}>{label}</Text>
  </Pressable>;
}

function TuningField({ label, value, step, min, max, onChange }: {
  label: string; value: number; step: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [draftFor, setDraftFor] = useState(value);
  if (draftFor !== value) { setDraftFor(value); setDraft(String(value)); }
  const normalized = (number: number) => Math.max(min, Math.min(max, Math.round(number * 100) / 100));
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.fieldControls}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}
        onPress={() => onChange(normalized(value - step))} style={styles.stepButton}><Text>−</Text></Pressable>
      <TextInput accessibilityLabel={label} value={draft} keyboardType="decimal-pad" selectTextOnFocus
        style={styles.input} onChangeText={(text) => {
          setDraft(text);
          if (text.trim() && Number.isFinite(Number(text))) {
            const number = Number(text);
            if (number >= min && number <= max) onChange(normalized(number));
          }
        }} onBlur={() => {
          const number = draft.trim() ? Number(draft) : NaN;
          if (Number.isFinite(number)) onChange(normalized(number));
          setDraft(String(Number.isFinite(number) ? normalized(number) : value));
        }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`}
        onPress={() => onChange(normalized(value + step))} style={styles.stepButton}><Text>+</Text></Pressable>
    </View>
  </View>;
}

// Mounted only by the DEV-only /garden-test entry. All state expires on exit.
export default function FlowerDensitySandbox({ onClose }: { onClose: () => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const wide = windowWidth >= 850;
  const [month, setMonth] = useState(10);
  const [count, setCount] = useState(30);
  const [gardenArtMode, setGardenArtMode] = useState(true);
  const [emotionPreview, setEmotionPreview] = useState(TULIP_REVIEW_SETTINGS);
  const [tulipScaleMode, setTulipScaleMode] = useState<TulipScaleMode>('tuned');
  const [componentMode, setComponentMode] = useState(true);
  const [speciesReview, setSpeciesReview] = useState<SpeciesReview | 'ALL_AVAILABLE' | 'MONTHLY_GROWTH'>('MONTHLY_GROWTH');
  const [showGrowthCompanions, setShowGrowthCompanions] = useState(true);
  const [growthVersion, setGrowthVersion] = useState<'v1'|'v1.1'>('v1');
  const [showGrowthFiller, setShowGrowthFiller] = useState(true);
  const [showGrowthCoverage, setShowGrowthCoverage] = useState(false);
  const [selectedGrowthId, setSelectedGrowthId] = useState<string|null>(null);
  const [mixedVersion, setMixedVersion] = useState<'v1'|'v2'>('v2');
  const [showNeighborhoods, setShowNeighborhoods] = useState(false);
  const [chamomileScale, setChamomileScale] = useState(1);
  const [hydrangeaScale, setHydrangeaScale] = useState(1);
  const [areaAwareMode, setAreaAwareMode] = useState(true);
  const [areaProfiles, setAreaProfiles] = useState(cloneAreaProfiles);
  const [clusterScales, setClusterScales] = useState(cloneClusterVisualScales);
  const [showClusterBounds, setShowClusterBounds] = useState(false);
  const [mode, setMode] = useState<PreviewMode>('M');
  const [tuning, setTuning] = useState(cloneDefaults);
  const [editingClass, setEditingClass] = useState<FlowerClass>('S');
  const [showFootprints, setShowFootprints] = useState(false);
  const [showAnchors, setShowAnchors] = useState(false);
  const [showMask, setShowMask] = useState(false);
  const [variantsEnabled, setVariantsEnabled] = useState(true);
  const [artworkStatus, setArtworkStatus] = useState<{ ready: number; total: number; error?: string }>({ ready: 0, total: 3 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const region = useMemo(() => getRegionInfo(month), [month]);
  const areaProfileName = classifyMaskArea(region.estimatedArea);
  const areaProfile = areaProfiles[areaProfileName];
  const composedVisualScale = clusterVisualScale(emotionPreview.scaleMultiplier, areaAwareMode, areaProfileName, clusterScales);
  // Only footprint tuning changes ground positions. Appearance controls never repack.
  const radii = { S: tuning.S.footprintRadius, M: tuning.M.footprintRadius, L: tuning.L.footprintRadius };
  const legacyLayout = useMemo(() => generateDensityLayout(month, count, mode, {
    S: { ...DEFAULT_TUNING.S, footprintRadius: radii.S },
    M: { ...DEFAULT_TUNING.M, footprintRadius: radii.M },
    L: { ...DEFAULT_TUNING.L, footprintRadius: radii.L },
  }), [month, count, mode, radii.S, radii.M, radii.L]);
  const gardenRadius = emotionPreview.speciesCode === 'TULIP' ? TULIP_REVIEW_RADIUS
    : previewVisual(emotionPreview, 'preview-footprint').footprintRadius;
  const gardenLayout = useMemo(() => gardenArtMode ? generateDensityLayout(month, count, 'M', {
    ...DEFAULT_TUNING, M: { ...DEFAULT_TUNING.M, footprintRadius: gardenRadius },
  }) : null, [gardenArtMode, month, count, gardenRadius]);
  const speciesReviewActive = gardenArtMode && componentMode && speciesReview !== 'TULIP';
  const growthActive = __DEV__ && speciesReviewActive && speciesReview === 'MONTHLY_GROWTH';
  const growthRecords = useMemo(()=>growthActive?monthlyGrowthRecords(month,count):[],[growthActive,month,count]);
  const growthV1 = useMemo(()=>growthActive?buildMonthlyGrowth(growthRecords,month):null,[growthActive,growthRecords,month]);
  const layeredActive = growthVersion==='v1.1' && month===6 && count===30;
  const growth = useMemo(()=>growthV1 && layeredActive?buildLayeredBed(growthV1,month):growthV1,[growthV1,layeredActive,month]);
  const allSpeciesActive = speciesReviewActive && speciesReview === 'ALL_AVAILABLE';
  const allSpeciesLayout = useMemo(()=>allSpeciesActive?generateAllSpeciesLayout(month,count):null,[allSpeciesActive,month,count]);
  const mixedV2 = useMemo(()=>composeMixedV2(allSpeciesLayout?.flowers??[],month,
    emotionPreview.composition==='auto'?undefined:emotionPreview.composition),[allSpeciesLayout,month,emotionPreview.composition]);
  const allSpeciesFlowers = useMemo(()=>(mixedVersion==='v2'?mixedV2.flowers:composeAllSpecies(allSpeciesLayout?.flowers??[],month,
    emotionPreview.composition==='auto'?undefined:emotionPreview.composition))
    .map(f=>({...f,catalog:catalogForBatchSpecies(f.speciesCode)})),[mixedVersion,mixedV2,allSpeciesLayout,month,emotionPreview.composition]);
  const speciesLayout = useMemo(()=>speciesReviewActive && speciesReview !== 'ALL_AVAILABLE' && speciesReview !== 'MONTHLY_GROWTH'?generateSpeciesReviewLayout(month,count,speciesReview):null,
    [speciesReviewActive,month,count,speciesReview]);
  const layout = (growth?{flowers:growthRecords,requested:Math.min(30,count),placed:growthRecords.length,failed:Math.min(30,count)-growthRecords.length}:null) ?? allSpeciesLayout ?? speciesLayout ?? gardenLayout ?? legacyLayout;
  const componentsActive = gardenArtMode && emotionPreview.speciesCode === 'TULIP' && componentMode && !speciesReviewActive;
  const speciesFlowers = useMemo(()=>composeSpeciesReview(speciesLayout?.flowers??[],month,
    emotionPreview.composition==='auto'?undefined:emotionPreview.composition,chamomileScale,hydrangeaScale)
    .map(f=>({...f,...(f.speciesCode==='CHAMOMILE'?{catalog:CHAMOMILE_CATALOG}:f.speciesCode==='HYDRANGEA'?{catalog:HYDRANGEA_CATALOG}:{})})),
    [speciesLayout,month,emotionPreview.composition,chamomileScale,hydrangeaScale]);
  const composedFlowers = useMemo(() => composeReviewObjects(layout.flowers,region,areaAwareMode,areaProfiles,
    emotionPreview.composition==='auto'?undefined:emotionPreview.composition),
  [layout,emotionPreview.composition,areaAwareMode,region,areaProfiles]);
  const gardenFlowers = useMemo(() => layout.flowers.map((f) => {
    const visual = previewVisual({ ...emotionPreview, main: '', accent: '', selected: false }, f.id);
    return { ...f, visual: { ...visual, footprintRadius: f.footprintRadius },
      previewTuning: tulipReviewTuning(emotionPreview, visual.compositionVariant, tulipScaleMode) };
  }), [layout, emotionPreview, tulipScaleMode]);
  const applyTulipReview = (reviewMonth: number, reviewCount = 30) => {
    setSpeciesReview('TULIP');
    setMonth(reviewMonth); setCount(reviewCount); setMode('M'); setGardenArtMode(true);
    setEmotionPreview({ ...TULIP_REVIEW_SETTINGS });
    setShowFootprints(false); setShowAnchors(false); setShowMask(false);
    setShowClusterBounds(false);
  };
  const applySpeciesReview = (species: SpeciesReview | 'ALL_AVAILABLE' | 'MONTHLY_GROWTH', reviewMonth = month, reviewCount = species==='HYDRANGEA'?20:30) => {
    applyTulipReview(reviewMonth,reviewCount);
    setSelectedGrowthId(null);
    setSpeciesReview(species); setComponentMode(true); setAreaAwareMode(true);
  };

  const scale = useSharedValue(1);
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pinchScale = useSharedValue(1);
  const pinchWorldX = useSharedValue(0);
  const pinchWorldY = useSharedValue(0);
  const transform = useDerivedValue(() => [
    { translateX: cameraX.value }, { translateY: cameraY.value }, { scale: scale.value },
  ]);

  const fitRegion = useCallback(() => {
    if (!viewport.width || !viewport.height) return;
    const b = region.bounds;
    const nextScale = Math.min(viewport.width / (b.width + 140), viewport.height / (b.height + 140), 4);
    scale.set(nextScale);
    cameraX.set(viewport.width / 2 - (b.x + b.width / 2) * nextScale);
    cameraY.set(viewport.height / 2 - (b.y + b.height / 2 - 12) * nextScale);
  }, [region, viewport, scale, cameraX, cameraY]);
  useEffect(fitRegion, [fitRegion]);
  const zoom = (factor: number) => {
    const next = Math.max(0.12, Math.min(10, scale.value * factor));
    const ratio = next / scale.value;
    cameraX.set(viewport.width / 2 - (viewport.width / 2 - cameraX.value) * ratio);
    cameraY.set(viewport.height / 2 - (viewport.height / 2 - cameraY.value) * ratio);
    scale.set(next);
  };
  const wholeGarden = () => {
    const next = Math.min(viewport.width / GARDEN_WORLD_WIDTH, viewport.height / GARDEN_WORLD_HEIGHT) * 0.95;
    scale.set(next);
    cameraX.set((viewport.width - GARDEN_WORLD_WIDTH * next) / 2);
    cameraY.set((viewport.height - GARDEN_WORLD_HEIGHT * next) / 2);
  };
  const pan = Gesture.Pan().maxPointers(1).onStart(() => {
    panX.value = cameraX.value; panY.value = cameraY.value;
  }).onUpdate((event) => {
    cameraX.set(panX.value + event.translationX);
    cameraY.set(panY.value + event.translationY);
  });
  const pinch = Gesture.Pinch().onStart((event) => {
    pinchScale.value = scale.value;
    pinchWorldX.value = (event.focalX - cameraX.value) / scale.value;
    pinchWorldY.value = (event.focalY - cameraY.value) / scale.value;
  }).onUpdate((event) => {
    const next = Math.max(0.12, Math.min(10, pinchScale.value * event.scale));
    scale.set(next);
    cameraX.set(event.focalX - pinchWorldX.value * next);
    cameraY.set(event.focalY - pinchWorldY.value * next);
  });
  const growthTap = Gesture.Tap().runOnJS(true).onEnd((event, success) => {
    if(success && growthActive)setSelectedGrowthId(primaryHitTarget(growthRecords,(event.x-cameraX.value)/scale.value,(event.y-cameraY.value)/scale.value));
  });
  const updateTuning = (key: keyof ClassTuning, value: number) => setTuning((current) => ({
    ...current, [editingClass]: { ...current[editingClass], [key]: value },
  }));
  const current = tuning[editingClass];
  const visual = (variantsEnabled ? CLUSTER_VISUALS : LEGACY_CLUSTER_VISUALS)[editingClass];

  if (!__DEV__) return null;
  return <View style={[styles.root, wide ? styles.row : styles.column]}>
    <View style={styles.preview} onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      setViewport((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    }}>
      <GestureDetector gesture={Gesture.Exclusive(pinch, pan, growthTap)}>
        {/* Skia web forwards style to the DOM: always a single plain style object. */}
        <Canvas style={styles.canvas}>
          <Group transform={transform}>
            <SandboxGardenBackdrop month={month} showMask={showMask}>
            {allSpeciesActive && showNeighborhoods && <MixedNeighborhoodLayer neighborhoods={mixedV2.neighborhoods} flowers={allSpeciesFlowers} />}
            {growthActive && growth ? <MonthlyGrowthLayer growth={growth} showCompanions={showGrowthCompanions}
              showFiller={showGrowthFiller} showCoverage={showGrowthCoverage} showAnchors={showAnchors} selectedId={selectedGrowthId} />
              : speciesReviewActive ? <TulipComponentLayer flowers={allSpeciesActive ? allSpeciesFlowers : speciesFlowers} showBounds={showClusterBounds}
              showFootprints={showFootprints} showAnchors={showAnchors} />
              : componentsActive ? <TulipComponentLayer flowers={composedFlowers} showBounds={showClusterBounds}
              showFootprints={showFootprints} showAnchors={showAnchors} visualScale={composedVisualScale} />
              : gardenArtMode ? <GardenFlowerVisualLayer flowers={gardenFlowers} devPreview debug={showFootprints || showAnchors} /> : <FlowerClusterLayer flowers={layout.flowers} tuning={tuning}
              showFootprints={showFootprints} showAnchors={showAnchors} onArtworkStatus={setArtworkStatus}
              variantsEnabled={variantsEnabled} />}
            {gardenArtMode && !componentsActive && !speciesReviewActive && showClusterBounds && <FixedTulipBounds flowers={gardenFlowers} />}
            </SandboxGardenBackdrop>
          </Group>
        </Canvas>
      </GestureDetector>
      <View style={styles.previewHeader} pointerEvents="none">
        <Text style={styles.previewTitle}>{MONTHS[month - 1]} / {region.landId}</Text>
        <Text style={styles.previewSubtitle}>{layout.placed} of {layout.requested} objects · temporary preview</Text>
      </View>
      <View style={styles.cameraControls}>
        <Button label="Fit region" onPress={fitRegion} />
        <Button label="Whole garden" onPress={wholeGarden} />
        <Button label="− Zoom" onPress={() => zoom(1 / 1.25)} />
        <Button label="+ Zoom" onPress={() => zoom(1.25)} />
      </View>
    </View>
    <ScrollView style={wide ? styles.sidePanel : styles.bottomPanel} contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}><Text style={styles.devBadge}>DEV V2</Text><Text style={styles.title}>Flower Density Sandbox</Text></View>
      <Text style={styles.description}>One journal entry = one small flower cluster. Drag to pan; pinch or use Zoom to inspect.</Text>
      {!gardenArtMode && artworkStatus.ready < artworkStatus.total && <Text style={styles.failure}>
        {artworkStatus.error ?? `Preparing flower artwork (${artworkStatus.ready}/${artworkStatus.total})…`}
      </Text>}
      <Button label="Back to Garden" onPress={onClose} />
      <Button label={gardenArtMode ? 'Garden art preview ON' : 'Legacy V2 preview · switch to Garden art'} selected={gardenArtMode}
        onPress={() => setGardenArtMode(value => !value)} />
      <Text style={styles.sectionTitle}>Monthly Garden Growth · primary beauty review</Text>
      <Button label="Monthly Growth V1" selected={growthActive && !layeredActive} onPress={()=>{setGrowthVersion('v1');applySpeciesReview('MONTHLY_GROWTH',month,30);}} />
      <Button label="Growth V1.1 — Layered Bed" selected={growthActive && layeredActive} onPress={()=>{setGrowthVersion('v1.1');applySpeciesReview('MONTHLY_GROWTH',6,30);}} />
      <View style={styles.wrap}>{(['v1','v1.1'] as const).map(version=><Button key={version}
        label={`June Day 30 — ${version==='v1'?'V1':'V1.1'}`} selected={growthActive && month===6 && count===30 && growthVersion===version}
        onPress={()=>{setGrowthVersion(version);applySpeciesReview('MONTHLY_GROWTH',6,30);}} />)}</View>
      <View style={styles.wrap}>{GROWTH_PRESETS.map(preset=><Button key={preset.label} label={preset.label}
        onPress={()=>{setGrowthVersion('v1');applySpeciesReview('MONTHLY_GROWTH',preset.month,preset.day);}} />)}</View>
      {growthActive && growth && <View style={styles.stats}>
        <Text style={styles.statsTitle}>Monthly Garden Growth {layeredActive?'V1.1 — Layered Bed':'V1'} · {growth.stage.name} · READY_FOR_REVIEW</Text>
        {layeredActive && <Text style={styles.small}>June-only A/B: same parents, primary blooms and child budget. Taller back silhouettes, low inner-edge pockets, separated focal growth and root cover. V1 density retained; manual art-direction review pending.</Text>}
        <Text style={styles.small}>{growth.records.length} parent Flower Records · {growth.primary.length} primary pieces / {growth.companions.length} companion pieces / {growth.filler.length} filler pieces. All visual children are non-interactive.</Text>
        <Text style={styles.small}>Approximate full-growth coverage: {(growth.approvedMaskCoverage*100).toFixed(1)}% of the approved Final Mask (source-alpha sampling, before landmark occlusion). Coverage debug shows all three layers even if a layer is temporarily hidden.</Text>
        <Text style={styles.small}>{Array.from(new Set(growthRecords.map(f=>f.speciesCode))).map(code=>`${code} × ${growthRecords.filter(f=>f.speciesCode===code).length}`).join(' · ')}</Text>
        <View style={styles.wrap}>
          <Button label={`Primary Anchors ${showAnchors?'ON':'OFF'}`} selected={showAnchors} onPress={()=>setShowAnchors(v=>!v)} />
          <Button label={`Companion Growth ${showGrowthCompanions?'ON':'OFF'}`} selected={showGrowthCompanions} onPress={()=>setShowGrowthCompanions(v=>!v)} />
          <Button label={`Bed Filler ${showGrowthFiller?'ON':'OFF'}`} selected={showGrowthFiller} onPress={()=>setShowGrowthFiller(v=>!v)} />
          <Button label={`Growth Coverage ${showGrowthCoverage?'ON':'OFF'}`} selected={showGrowthCoverage} onPress={()=>setShowGrowthCoverage(v=>!v)} />
        </View>
        <Text style={styles.small}>Tap a primary anchor to inspect its parent identity. {selectedGrowthId?`Selected parent: ${selectedGrowthId}`:'No parent selected.'} Companion/filler pieces create no click targets or Support targets. Review fixtures only; nothing is persisted.</Text>
        <Text style={styles.small}>Fixed primary anchors and 9 / 12 / 16 footprints. All growth stays behind the Land06 Tea Set. Approved reference recipes and artwork remain unchanged. Both emotions NONE.</Text>
      </View>}
      <Text style={styles.sectionTitle}>Existing species / mixed QA modes</Text>
      <View style={styles.wrap}>{(['MIXED_SML','TULIP','CHAMOMILE','HYDRANGEA','MIXED'] as const).map(species=><Button key={species}
        label={species==='MIXED_SML'?'Mixed S + M + L':species==='MIXED'?'Tulip + Chamomile':species==='TULIP'?'Tulip':species==='HYDRANGEA'?'Hydrangea (QA)':'Chamomile'}
        selected={gardenArtMode && componentMode && speciesReview===species} onPress={()=>applySpeciesReview(species)} />)}</View>
      <View style={styles.wrap}>{HYDRANGEA_REVIEW_PRESETS.map(preset=><Button key={preset.label} label={preset.label}
        onPress={()=>applySpeciesReview(preset.species,preset.month,preset.count)} />)}</View>
      <View style={styles.wrap}>{SPECIES_REVIEW_PRESETS.map(preset=><Button key={preset.label} label={preset.label}
        onPress={()=>applySpeciesReview(preset.species,preset.month)} />)}</View>
      <Button label="ALL AVAILABLE SPECIES — MIXED" selected={allSpeciesActive}
        onPress={()=>applySpeciesReview('ALL_AVAILABLE')} />
      <View style={styles.wrap}>{ALL_SPECIES_PRESETS.map(preset=><Button key={preset.label} label={preset.label}
        onPress={()=>{applySpeciesReview('ALL_AVAILABLE',preset.month,30);setMixedVersion('v1');}} />)}</View>
      <View style={styles.wrap}>{(['v1','v2'] as const).map(version=><Button key={version} label={version==='v1'?'Mixed V1':'Mixed V2'}
        selected={allSpeciesActive && mixedVersion===version} onPress={()=>{setMixedVersion(version);setSpeciesReview('ALL_AVAILABLE');setComponentMode(true);setGardenArtMode(true);}} />)}</View>
      <View style={styles.wrap}>{MIXED_V2_PRESETS.map(preset=><Button key={preset.label} label={preset.label}
        onPress={()=>{applySpeciesReview('ALL_AVAILABLE',preset.month,30);setMixedVersion('v2');}} />)}</View>
      {allSpeciesActive && <View style={styles.stats}>
        <Text style={styles.statsTitle}>Mixed {mixedVersion==='v2'?'V2':'V1'} · REJECTED beauty target · QA only</Text>
        <Text style={styles.small}>{AVAILABLE_SPECIES.length} available species. All Species Mixed and single-species views are QA only; Monthly Growth is the beauty target. Both emotions NONE.</Text>
        <Text style={styles.small}>{allSpeciesFlowers.length} TOTAL Journal objects · {allSpeciesFlowers.filter(f=>f.flowerClass==='S').length} S / {allSpeciesFlowers.filter(f=>f.flowerClass==='M').length} M / {allSpeciesFlowers.filter(f=>f.flowerClass==='L').length} L. Fixed radii 9 / 12 / 16 world px.</Text>
        <Text style={styles.small}>{AVAILABLE_SPECIES.map(s=>({code:s.speciesCode,count:allSpeciesFlowers.filter(f=>f.speciesCode===s.speciesCode).length})).filter(s=>s.count>0).map(s=>`${s.code} ${s.count}`).join(' · ')}</Text>
        <Text style={styles.small}>Sparse {densityCounts(allSpeciesFlowers).sparse} / Normal {densityCounts(allSpeciesFlowers).normal} / Full {densityCounts(allSpeciesFlowers).full} · {mixedV2.neighborhoods.length} neighborhoods ({mixedV2.neighborhoods.map(n=>n.flowerIds.length).join(' / ')} objects).</Text>
        {mixedVersion==='v2' && <Text style={styles.small}>V2 area targets: {mixedV2.weights.sparse}/{mixedV2.weights.normal}/{mixedV2.weights.full}%. Richer cluster cores; fixed IDs, anchors and footprints. Species affinity exchanges only non-reference species within the same class; monthly species totals and reference compositions remain fixed.</Text>}
        <Button label={`Show Neighborhoods ${showNeighborhoods?'ON':'OFF'}`} selected={showNeighborhoods} onPress={()=>setShowNeighborhoods(value=>!value)} />
        <Text style={styles.small}>{areaProfileName} · cluster visual scale {clusterVisualScale(1,true,areaProfileName).toFixed(2)}. Existing area scale and spread reused. Olive base scale 0.90; all other base scales 1.00.</Text>
        <Text style={styles.small}>Chamomile APPROVED_S_CLASS_REFERENCE · Tulip V3 unchanged · Hydrangea V2 APPROVED_L_CLASS_REFERENCE. Mixed V1 and V2 rejected for beauty review; retained for QA.</Text>
        <Text style={styles.small}>Rose skipped: opaque baked checkerboard. Missing sources: Tumi, White Magnolia, Blue Rose, Lotus, Cherry Blossom. No botanical fallback.</Text>
        <Text style={styles.small}>One ground anchor and footprint per object. All species share the Land06 flower layer behind the Tea Set. No production data changes.</Text>
        <View style={styles.wrap}>{(['auto','sparse','normal','full'] as const).map(composition=><Button key={composition}
          label={composition} selected={emotionPreview.composition===composition}
          onPress={()=>setEmotionPreview(previous=>({...previous,composition}))} />)}</View>
      </View>}
      {speciesReviewActive && !allSpeciesActive && !growthActive && <View style={styles.stats}>
        <Text style={styles.statsTitle}>Neutral {speciesReview==='MIXED_SML'?'Mixed S + M + L':speciesReview==='HYDRANGEA'?'Hydrangea':speciesReview==='MIXED'?'Tulip + Chamomile':'Chamomile'} · Chamomile S-class reference APPROVED</Text>
        <Text style={styles.small}>These species modes are QA/stress tests. Monthly Growth is the primary beauty review. DEV only; production integration remains deferred.</Text>
        <Text style={styles.small}>{speciesFlowers.filter(f=>f.speciesCode==='TULIP').length} Tulip + {speciesFlowers.filter(f=>f.speciesCode==='CHAMOMILE').length} Chamomile + {speciesFlowers.filter(f=>f.speciesCode==='HYDRANGEA').length} Hydrangea = {speciesFlowers.length} total Journal objects</Text>
        <Text style={styles.small}>One object / anchor / footprint per cluster. Chamomile radius 9 px; Tulip radius 12 px; Hydrangea radius 16 px. Both emotions NONE.</Text>
        <Text style={styles.small}>Final Mask ≈ {region.estimatedArea.toLocaleString()} world px² · {areaProfileName}. Area defaults: Small 45/45/10%, spread 1.00, scale 1.00; Medium 25/50/25%, spread 1.08, scale 1.08; Large 10/45/45%, spread 1.15, scale 1.22.</Text>
        <Text style={styles.small}>Chamomile: Sparse 2–4 / Normal 4–7 / Full 7–11 open heads. 29 distinct source pieces; 0.105 world px/source px; base scale 1.00. Tulip V3 defaults unchanged.</Text>
        <TuningField label="Chamomile visual scale" value={chamomileScale} min={.5} max={1.5} step={.05} onChange={setChamomileScale} />
        <Text style={styles.small}>Effective Chamomile scale: {clusterVisualScale(chamomileScale,true,areaProfileName).toFixed(2)}. Temporary visual tuning leaves anchors and footprints fixed.</Text>
        {(speciesReview==='MIXED_SML' || speciesReview==='HYDRANGEA') && <View>
          <Text style={styles.small}>Hydrangea V2 art · APPROVED_L_CLASS_REFERENCE. Sparse: one partial/side bloom with foliage; Normal: one main plus optional smaller partial bloom; Full: usually two staggered heads, occasionally three. New source only; rejected V1 art and huge bushes excluded. Base scale 1.00; 0.18 world px/source px.</Text>
          <TuningField label="Hydrangea visual scale" value={hydrangeaScale} min={.5} max={1.5} step={.05} onChange={setHydrangeaScale} />
          <Text style={styles.small}>Effective Hydrangea scale {clusterVisualScale(hydrangeaScale,true,areaProfileName).toFixed(2)}; radius stays 16. Mixed 30 target: 12 Tulip / 12 Chamomile / 6 Hydrangea. Single-species counts are requested capacity checks; failed placements remain visible below.</Text>
        </View>}
        <View style={styles.wrap}>{(['auto','sparse','normal','full'] as const).map(composition=><Button key={composition}
          label={composition} selected={emotionPreview.composition===composition}
          onPress={()=>setEmotionPreview(previous=>({...previous,composition}))} />)}</View>
        <Text style={styles.small}>{speciesFlowers[0]?`First: ${speciesFlowers[0].speciesCode} / ${speciesFlowers[0].composition.density} / ${speciesFlowers[0].composition.bloomCount} heads or buds`:''}</Text>
        <Text style={styles.small}>Land06 flowers render behind the existing Tea Set layers. Source colors are unchanged; no emotion effects.</Text>
      </View>}
      <View style={styles.wrap}>{TULIP_REVIEW_PRESETS.map(preset => <Button key={preset.month} label={preset.label}
        onPress={() => applyTulipReview(preset.month)} />)}</View>
      <Button label="October · Tulip · 10" onPress={() => applyTulipReview(10,10)} />
      <View style={styles.wrap}>{(['fixed','v2','v3'] as const).map(version => <Button key={version}
        label={version==='fixed'?'Old Fixed Prefabs':version==='v2'?'Component Composition V2':'Area-Aware Composition V3'}
        selected={gardenArtMode && speciesReview==='TULIP' && (version==='fixed'?!componentMode:componentMode && areaAwareMode===(version==='v3'))}
        onPress={() => {setGardenArtMode(true);setComponentMode(version!=='fixed');setAreaAwareMode(version==='v3');
          setSpeciesReview('TULIP');
          setEmotionPreview(previous=>({...previous,speciesCode:'TULIP',main:'',accent:''}));}} />)}</View>
      {componentsActive && <View style={styles.stats}>
        <Text style={styles.statsTitle}>Neutral Tulip components {areaAwareMode?'V3':'V2'} · READY_FOR_REVIEW</Text>
        <Text style={styles.small}>Approved Final Mask area ≈ {region.estimatedArea.toLocaleString()} world px² · {areaProfileName}</Text>
        <Text style={styles.small}>{areaAwareMode ? `Sparse ${areaProfile.weights.sparse}% / Normal ${areaProfile.weights.normal}% / Full ${areaProfile.weights.full}% · Internal Spread ${areaProfile.spread.toFixed(2)}` : 'V2 original identity-hash density selection · Internal Spread 1.00'}</Text>
        {areaAwareMode && <View>
          {(['sparse','normal','full'] as const).map(key=><TuningField key={key} label={`${key} %`} value={areaProfile.weights[key]}
            min={0} max={100} step={5} onChange={value=>setAreaProfiles(previous=>({...previous,
              [areaProfileName]:changeProfileWeight(previous[areaProfileName],key,value)}))} />)}
          <TuningField label="Internal Spread" value={areaProfile.spread} min={.8} max={1.3} step={.01}
            onChange={spread=>setAreaProfiles(previous=>({...previous,[areaProfileName]:{...previous[areaProfileName],spread}}))} />
          <TuningField label="Cluster Visual Scale" value={clusterScales[areaProfileName]} min={.8} max={1.5} step={.01}
            onChange={value=>setClusterScales(previous=>({...previous,[areaProfileName]:value}))} />
          <Text style={styles.small}>Whole-cluster scale for {areaProfileName}: {clusterScales[areaProfileName].toFixed(2)} · effective scale {composedVisualScale.toFixed(2)}. Ground anchor and 12 px footprint stay fixed.</Text>
          <View style={styles.wrap}>{([1,1.22] as const).map(value=><Button key={value} label={`Large Scale ${value.toFixed(2)}`}
            selected={month===10 && count===30 && clusterScales.LARGE===value}
            onPress={()=>{applyTulipReview(10);setComponentMode(true);setAreaAwareMode(true);
              setClusterScales(previous=>({...previous,LARGE:value}));}} />)}</View>
          <Button label="Reset cluster visual scales" onPress={()=>setClusterScales(cloneClusterVisualScales())} />
          <Text style={styles.small}>Editing {areaProfileName} only. Other percentages rebalance to total 100%. Temporary DEV values; no saved data changes. Use auto composition to apply these weights.</Text>
          <Button label="Reset area profiles" onPress={()=>setAreaProfiles(cloneAreaProfiles())} />
        </View>}
        <Text style={styles.small}>One journal flower = one ground anchor and one 12 px footprint. Both emotions NONE. No hue shifts.</Text>
        <Text style={styles.small}>Pink-only 25% · yellow-only 20% · pink-dominant 25% · yellow-dominant 15% · mixed 15% (seeded weights).</Text>
        <View style={styles.wrap}>{(['auto','sparse','normal','full'] as const).map(composition=><Button key={composition}
          label={composition} selected={emotionPreview.composition===composition}
          onPress={()=>setEmotionPreview(previous=>({...previous,composition}))} />)}</View>
        <TuningField label="Component visual scale" value={emotionPreview.scaleMultiplier} min={.4} max={2} step={.05}
          onChange={scaleMultiplier=>setEmotionPreview(previous=>({...previous,scaleMultiplier}))} />
        <Text style={styles.small}>{composedFlowers[0] ? `First: ${composedFlowers[0].composition.density} / ${composedFlowers[0].composition.colorFamily} / ${composedFlowers[0].composition.bloomCount} blooms or buds` : 'No flowers'}</Text>
        <Text style={styles.small}>28 extracted components; stems, occasional two-bloom pieces and foliage drive V2. Medium/full references are retained separately. Brown dots indicate a component still loading.</Text>
      </View>}
      <View style={styles.wrap}>{(['current', 'tuned'] as const).map(scaleMode => <Button key={scaleMode}
        label={scaleMode === 'current' ? 'Tulip Current Scale' : 'Tulip Tuned Scale'}
        selected={gardenArtMode && !componentsActive && !speciesReviewActive && emotionPreview.speciesCode === 'TULIP' && tulipScaleMode === scaleMode}
        onPress={() => { applyTulipReview(10); setComponentMode(false); setTulipScaleMode(scaleMode); }} />)}</View>
      {gardenArtMode && !componentsActive && !speciesReviewActive && emotionPreview.speciesCode === 'TULIP' && <Text style={styles.small}>
        {tulipScaleMode === 'tuned' ? 'Tuned' : 'Current'} Tulip scale · A/B buttons use October / Land10, 30 flowers and identical seeded compositions. June keeps the selected scale profile.
      </Text>}
      {gardenArtMode && !componentsActive && !speciesReviewActive && <FlowerEmotionPreview settings={emotionPreview} onChange={setEmotionPreview}
        baseArtOnly sandboxRadius={gardenRadius} firstId={layout.flowers[0]?.id ?? 'preview-empty'}
        compositionScales={emotionPreview.speciesCode === 'TULIP' ? TULIP_REVIEW_SCALES[tulipScaleMode] : undefined} />}
      {gardenArtMode && <Text style={styles.small}>Month, Density, camera and Visual debug controls apply here. Legacy V1/V2 composition, mix and class tuning below remain available when switching back.</Text>}
      {!gardenArtMode && <><Button label={`Cluster Variants ${variantsEnabled ? 'ON' : 'OFF'}`} selected={variantsEnabled}
        onPress={() => setVariantsEnabled((value) => !value)} />
      <Text style={styles.small}>{variantsEnabled ? 'Five seeded compositions per species.' : 'Original V1 compositions for comparison.'} Toggling keeps the same ground positions and footprints.</Text>
      <Text style={styles.sectionTitle}>V2 review targets</Text>
      <View style={styles.wrap}>{REVIEW_TARGETS.map((target) => <Button key={target.label} label={target.label}
        selected={month === target.month && mode === target.mode && count === target.count}
        onPress={() => { setMonth(target.month); setMode(target.mode); setCount(target.count); }} />)}</View></>}

      <Text style={styles.sectionTitle}>Approved month</Text>
      <View style={styles.wrap}>{MONTHS.map((name, index) => <Button key={name}
        label={`${String(index + 1).padStart(2, '0')} ${name}`} selected={month === index + 1}
        onPress={() => setMonth(index + 1)} />)}</View>
      <Text style={styles.sectionTitle}>Density</Text>
      <View style={styles.wrap}>{(growthActive?[5,10,15,20,25,30]:[5, 10, 20, 30, 40]).map((number) => <Button key={number}
        label={`${number} Flowers`} selected={count === number} onPress={() => setCount(number)} />)}
        <Button label="Clear" selected={count === 0} onPress={() => setCount(0)} /></View>
      <View style={styles.stats}>
        <Text style={styles.statsTitle}>{region.monthName} / {region.landId}</Text>
        <Text style={styles.statsText}>Requested: {layout.requested}   Placed: {layout.placed}   Failed: {layout.failed}</Text>
        <Text style={styles.small}>Final Mask area ≈ {Math.round(region.estimatedArea).toLocaleString()} world px²</Text>
        {layout.failed > 0 && <Text style={styles.failure}>These footprints did not all fit. Sizes remain unchanged.</Text>}
      </View>
      {!gardenArtMode && <><Text style={styles.sectionTitle}>Flower mix</Text>
      <View style={styles.wrap}>{MODES.map((item) => <Button key={item.value} label={item.label}
        selected={mode === item.value} onPress={() => setMode(item.value)} />)}</View></>}
      <Text style={styles.sectionTitle}>Visual debug</Text>
      <View style={styles.wrap}>
        <Button label={`Show Cluster Bounds ${showClusterBounds?'ON':'OFF'}`} selected={showClusterBounds}
          onPress={()=>setShowClusterBounds(value=>!value)} />
        <Button label={`Footprints ${showFootprints ? 'ON' : 'OFF'}`} selected={showFootprints} onPress={() => setShowFootprints((value) => !value)} />
        <Button label={`Anchors ${showAnchors ? 'ON' : 'OFF'}`} selected={showAnchors} onPress={() => setShowAnchors((value) => !value)} />
        <Button label={`Final Mask ${showMask ? 'ON' : 'OFF'}`} selected={showMask} onPress={() => setShowMask((value) => !value)} />
      </View>
      {!gardenArtMode && <><Text style={styles.sectionTitle}>Live class tuning</Text>
      <View style={styles.wrap}>{(['S', 'M', 'L'] as const).map((flowerClass) => <Button key={flowerClass}
        label={`${flowerClass} · ${CLASS_NAMES[flowerClass]}`} selected={editingClass === flowerClass}
        onPress={() => setEditingClass(flowerClass)} />)}</View>
      <Text style={styles.small}>{visual.description}</Text>
      <TuningField label={`${editingClass} Visual scale`} value={current.visualScale} step={0.05} min={0.4} max={2.5} onChange={(value) => updateTuning('visualScale', value)} />
      <TuningField label={`${editingClass} Footprint radius`} value={current.footprintRadius} step={1} min={2} max={40} onChange={(value) => updateTuning('footprintRadius', value)} />
      <TuningField label={`${editingClass} Anchor X`} value={current.anchorX} step={0.01} min={0} max={1} onChange={(value) => updateTuning('anchorX', value)} />
      <TuningField label={`${editingClass} Anchor Y`} value={current.anchorY} step={0.01} min={0} max={1} onChange={(value) => updateTuning('anchorY', value)} />
      <Text style={styles.small}>Reference visual size: {(visual.width * current.visualScale).toFixed(1)} × {(visual.height * current.visualScale).toFixed(1)} world px, plus ±10% variation. Compositions may spread beyond this size. Footprint diameter: {current.footprintRadius * 2} world px. Anchors use fractions of the reference container.</Text>
      <Button label="Reset prototype tuning" onPress={() => setTuning(cloneDefaults())} />
      <Text style={styles.small}>Fixed seed · loose neighboring groups and open grass gaps · ±12° rotation. Visuals may overlap; ground footprints stay separate. Appearance changes keep ground positions; footprint changes repack. All sandbox values are temporary.</Text>
      <Text style={styles.small}>{CLUSTER_MATTE_NOTE}</Text></>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eff4e9' }, row: { flexDirection: 'row' }, column: { flexDirection: 'column' },
  preview: { flex: 1, minHeight: 220, overflow: 'hidden' }, canvas: { flex: 1 },
  previewHeader: { position: 'absolute', top: 12, left: 12, borderRadius: 10, backgroundColor: '#f9fbedee', padding: 10 },
  previewTitle: { fontWeight: '700', color: '#244935', fontSize: 15 }, previewSubtitle: { color: '#466151', fontSize: 12, marginTop: 3 },
  cameraControls: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  sidePanel: { width: 340, flexGrow: 0, borderLeftWidth: 1, borderColor: '#d4dfcf' },
  bottomPanel: { flexGrow: 0, maxHeight: '48%', borderTopWidth: 1, borderColor: '#d4dfcf' },
  panelContent: { padding: 16, gap: 10 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  devBadge: { color: '#fff', backgroundColor: '#416548', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 3, fontSize: 10, fontWeight: '700' },
  title: { flex: 1, fontSize: 17, color: '#244935', fontWeight: '700' }, description: { color: '#52654e', fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: '#304d36', fontSize: 13, fontWeight: '700', marginTop: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 7, borderWidth: 1, borderColor: '#c8d6c1', backgroundColor: '#fbfcf6', alignItems: 'center' },
  selectedButton: { backgroundColor: '#365b42', borderColor: '#365b42' }, buttonText: { fontSize: 12, color: '#365b42', fontWeight: '600' }, selectedText: { color: '#fff' },
  stats: { backgroundColor: '#e3edda', padding: 12, borderRadius: 9, gap: 6 }, statsTitle: { color: '#294732', fontSize: 14, fontWeight: '700' },
  statsText: { color: '#294732', fontSize: 12, fontWeight: '600' }, failure: { color: '#8d4027', fontSize: 12, lineHeight: 17 }, small: { color: '#60715a', fontSize: 11, lineHeight: 17 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, fieldLabel: { color: '#36533a', fontSize: 12, flex: 1 },
  fieldControls: { flexDirection: 'row', alignItems: 'center', gap: 5 }, stepButton: { backgroundColor: '#e0e9d8', borderRadius: 5, width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c8d6c1', borderRadius: 5, width: 57, height: 34, textAlign: 'center', color: '#294732', fontSize: 13, padding: 4 },
});

