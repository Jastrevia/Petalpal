import { hitsMailbox } from './fairy/mailboxDestination';
import { hitsTreehouse, treehouseTap } from './fairy/treehouseDestination';
import {hitsTeaArea} from './fairy/teaDestination';
import { hitsMoonBed } from './fairy/moonDestination';
import { hitsSwing } from './fairy/swingDestination';
import { AMBIENT_LINES, AMBIENT_TIMING, ambientDelay, pickTapLine, RECENT_TAP_LINES, tapActivity, zhHans } from './fairy/tapLines';
import type { FairyState } from './fairy/FairyNavigation';
import { constrainGardenCamera, zoomGardenAt, GARDEN_WORLD_BOUNDS } from './rendering/gardenWorldBounds';
import GardenFairy, { type FairyHandle } from './fairy/GardenFairy';
import { useFairySchedule } from './fairy/useFairySchedule';
import { noteFairyInteraction } from '../../services/fairyCloseness';
import { GardenCalendar } from './GardenCalendar';
import type { FlowerSession } from './planting/flowerDetailApi';
import { Circle, Group, Image, Path, Rect, useCanvasRef, useImage } from '@shopify/react-native-skia';
import { forwardRef, useImperativeHandle, type Ref, useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { isGardenGroundBlocked } from './fairy/gardenGround';
import {GardenProfile,GardenRuntimePanel} from './performance/GardenRuntimePanel';
import {DEFAULT_ISOLATION,type GardenIsolation,runtimeAudit} from './performance/runtimeAudit';
import {productionQARecords} from './planting/productionGrowthQAData';
import { useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GardenLoadingOverlay } from './loading/GardenLoadingOverlay';
import { publishWater, reportGardenLoadFailure } from './loading/gardenReadiness';
import Canvas from './GardenCanvas';
import PlantingRegionOverlay from './planting/PlantingRegionOverlay';
import PlantingRegionCalibrationEditor, {
  type CalDisplayMode,
  type CalDragMode,
} from './planting/PlantingRegionCalibrationEditor';
import ManualMaskPaintEditor, {
  type PaintInteractionMode,
} from './planting/ManualMaskPaintEditor';
import {
  type MonthRegionCalibration,
  PLANTING_REGION_CALIBRATION,
  getCalibratedCentroid,
  getParentLand,
  loadCalibrationFromStorage,
  resetCalibrationStorage,
  saveCalibrationToStorage,
  worldToLandLocal,
} from './planting/plantingRegionCalibration';
import {
  type MaskStroke,
  type MaskTool,
  type MaskEditHistory,
  type MaskEditState,
  commitMaskEdit,
  createMaskEditHistory,
  createMaskStroke,
  isPointInRefinedMaskLandLocal,
  landLocalToRefinementLocal,
  loadMonthMaskRefinement,
  redoMaskEdit,
  resetMaskEditToLockedBase,
  saveMonthMaskRefinement,
  undoMaskEdit,
} from './planting/plantingMaskRefinement';
import PlantedFlowerLayer from './planting/PlantedFlowerLayer';
import { USE_MONTHLY_GARDEN_GROWTH_V1_1, gardenSpecies, hitProductionFlower } from './planting/productionGrowth';
import PlantingPlacementControls from './planting/PlantingPlacementControls';
import FlowerDetailModal from './planting/FlowerDetailModal';
import {
  PlantingProvider,
  usePlanting,
} from './planting/PlantingContext';
import { getFlowerPlacementDefinition } from './planting/flowerFootprintConfig';
import { MONTH_CENTROIDS, MONTH_REGION_METAS } from './planting/plantingRegionData';
import { getApprovedMonthCentroid } from './planting/approvedPlantingMasks';
import { FlowerPlacementRecord } from './planting/plantingPersistence';
import { useLocalSearchParams } from 'expo-router';
import GardenReferenceLayer from './GardenReferenceLayer';
import NativeLandCalibrationEditor from './NativeLandCalibrationEditor';
import SwingCalibrationEditor, { type SwingMapPlacement } from './SwingCalibrationEditor';
import MoonBedMapCalibrationEditor, { type MoonBedMapPlacement } from './MoonBedMapCalibrationEditor';
import StaticLandmarkCalibrationEditor from './StaticLandmarkCalibrationEditor';
import TeaSetMapCalibrationEditor, { type TeaSetMapPlacement } from './TeaSetMapCalibrationEditor';
import WaterfallMapCalibrationEditor from './WaterfallMapCalibrationEditor';
import { INITIAL_WATERFALL_PLACEMENT } from './waterfallMapPlacement';
import WaterfallImpactOverlay from './WaterfallImpactOverlay';
import WaterfallImpactCalibrationEditor from './WaterfallImpactCalibrationEditor';
import {
  INITIAL_WATERFALL_IMPACT_PLACEMENT,
  type WaterfallImpactPlacement,
} from './waterfallImpactPlacement';
import TreehouseCalibrationEditor, { type TreehousePlacement } from './TreehouseCalibrationEditor';
import LandLayer, { GardenLandResources } from './LandLayer';
import GardenConnectionLayer from './GardenConnectionLayer';
import GardenLand09InterfaceLayer from './GardenLand09InterfaceLayer';
import GardenInfrastructureLayer from './GardenInfrastructureLayer';
import GardenRoadApproachLayer from './GardenRoadApproachLayer';
import GardenEnvironmentLayer from './GardenEnvironmentLayer';
import GardenOuterBasin from './GardenOuterBasin';
import GardenBridge, { BridgeDebugOverlay } from './GardenBridge';
import BridgeTestEditor from './BridgeTestEditor';
import { INITIAL_BRIDGE_TEST } from './bridgeTestPlacement';
import LandmarkLayer from './LandmarkLayer';
import WaterfallV2Entity from './WaterfallV2Entity';
import { type WaterfallVersion } from './waterfallV2Placement';
import SurfaceRippleLayer from './water/SurfaceRippleLayer';
import FloatingPetalLayer from './water/FloatingPetalLayer';
import GardenWaterField from './water/GardenWaterField';
import GardenSubmergedRocks from './water/GardenSubmergedRocks';
import WaterfallImpactUnderlay from './water/WaterfallImpactUnderlay';
import FishLayer, { type FishDensity, type FishMotionPreset } from './water/FishLayer';
import LotusLayer, { type LotusRenderMode } from './water/LotusLayer';
import { useWaterTopFlow, type TopWaterMotionMode } from './water/WaterTopAssembly';
import WaterTopCalibrationEditor, { type TopWaterDisplayPreset } from './WaterTopCalibrationEditor';
import { INITIAL_WATER_TOP_PLACEMENT, type WaterTopPlacement } from './waterTopPlacement';

import { WATER_ASSETS } from './water/waterAssets';
import { GARDEN_LANDS, GARDEN_WATER_COLOR, GARDEN_WORLD_HEIGHT, GARDEN_WORLD_WIDTH } from './gardenMapLayout';
import {
  SWING_MAP_ROTATION, SWING_MAP_SCALE, SWING_MAP_X, SWING_MAP_Y,
} from './swingMapPlacement';
import { TREEHOUSE_MAP_SCALE, TREEHOUSE_MAP_X, TREEHOUSE_MAP_Y } from './treehouseMapPlacement';
import {
  MOON_BED_MAP_ROTATION, MOON_BED_MAP_SCALE, MOON_BED_MAP_X, MOON_BED_MAP_Y,
} from './moonBedMapPlacement';
import { STATIC_LANDMARK_MAP_PLACEMENTS, type StaticLandmarkMapPlacement } from './staticLandmarkMapPlacements';
import { TEA_SET_MAP_ROTATION, TEA_SET_MAP_SCALE, TEA_SET_MAP_X, TEA_SET_MAP_Y } from './teaSetMapPlacement';
import { type WorldTimeOverride, useWorldTime } from './world-time';

const reportWaterFailure = () => { publishWater('failed'); reportGardenLoadFailure('water'); };

function cyclicWeight(phase: number, index: number, count: number): number {
  'worklet';
  let distance = Math.abs(phase - index);
  if (distance > count / 2) distance = count - distance;
  if (distance >= 1) return 0;
  const cosine = Math.cos((distance * Math.PI) / 2);
  return cosine * cosine;
}

function WakeOverlay({ active }: { active: boolean }) {
  const wakeA = useImage(WATER_ASSETS.wake[0]);
  const wakeB = useImage(WATER_ASSETS.wake[1]);
  const wakeC = useImage(WATER_ASSETS.wake[2]);
  const wakeD = useImage(WATER_ASSETS.wake[3]);
  const wakeImages = [wakeA, wakeB, wakeC, wakeD] as const;
  const phase = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(phase);
    if (active && !reducedMotion) {
      phase.value = withRepeat(
        withTiming(4, { duration: 5200, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(phase);
  }, [active, reducedMotion, phase]);

  const op0 = useDerivedValue(() => cyclicWeight(phase.value, 0, 4) * 0.9);
  const op1 = useDerivedValue(() => cyclicWeight(phase.value, 1, 4) * 0.9);
  const op2 = useDerivedValue(() => cyclicWeight(phase.value, 2, 4) * 0.9);
  const op3 = useDerivedValue(() => cyclicWeight(phase.value, 3, 4) * 0.9);
  const ops = [op0, op1, op2, op3] as const;

  return (
    <Group>
      {wakeImages.map((img, i) =>
        img ? (
          <Image
            key={i}
            image={img}
            x={0}
            y={0}
            width={GARDEN_WORLD_WIDTH}
            height={GARDEN_WORLD_HEIGHT}
            opacity={ops[i]}
            fit="fill"
          />
        ) : null,
      )}
    </Group>
  );
}

const CHECKED_IN_TREEHOUSE: TreehousePlacement = {
  x: TREEHOUSE_MAP_X, y: TREEHOUSE_MAP_Y, scale: TREEHOUSE_MAP_SCALE,
};
const CHECKED_IN_SWING: SwingMapPlacement = {
  x: SWING_MAP_X, y: SWING_MAP_Y, scale: SWING_MAP_SCALE, rotation: SWING_MAP_ROTATION,
};
const CHECKED_IN_MOON_BED: MoonBedMapPlacement = {
  x: MOON_BED_MAP_X, y: MOON_BED_MAP_Y,
  scale: MOON_BED_MAP_SCALE, rotation: MOON_BED_MAP_ROTATION,
};
const CHECKED_IN_GARDEN_ARCH = STATIC_LANDMARK_MAP_PLACEMENTS.gardenArch;
const CHECKED_IN_PAVILION = STATIC_LANDMARK_MAP_PLACEMENTS.pavilion;
const CHECKED_IN_TEA_SET: TeaSetMapPlacement = {
  x: TEA_SET_MAP_X, y: TEA_SET_MAP_Y, scale: TEA_SET_MAP_SCALE, rotation: TEA_SET_MAP_ROTATION,
};



export type MailboxInteractionPhase =
  | 'idle'
  | 'walking'
  | 'retrieving'
  | 'transitioning';

export type GardenSceneHandle = {
  focusFairy: () => void;
  returnFromTreehouse: () => boolean;
  returnFromMailbox: () => boolean;
  visitMailbox: () => boolean;
  isMailboxBusy: () => boolean;
};

export type GardenSceneProps = {
  children?: import('react').ReactNode;
  showDevControls?: boolean;
  session?: FlowerSession;
  backendMode?: boolean;
  /** Fired after the front-facing opened-letter pose and its 800 ms hold. */
  onMailboxOpened?: () => void;
  /** Notifies when the mailbox interaction phase changes. */
  onMailboxPhaseChange?: (phase: MailboxInteractionPhase) => void;
  /** Future interior scene handoff. Entry is complete and the fairy is hidden. */
  onTreehouseEntered?: () => void;
  onTreehouseExited?: () => void;
  enableFairyWalk?: boolean;
  initialPreviewMode?: boolean;
  initialWaterfallVersion?: WaterfallVersion;
  gardenOwnerUserId?: string;
  readOnly?: boolean;
  onOpenBookhouse?: () => void;
  onOpenReflection?: () => void;
  showCalendar?: boolean;
  /** The owner's language ('en' | 'zh-Hans' …) for the Fairy's in-Garden hints. */
  locale?: string | null;
  /** Partner preview alias: 'player' hides the same DEV controls as showDevControls={false}. */
  mode?: 'development' | 'player';
};

const treehouseHint = (locale?: string | null) =>
  zhHans(locale)
    ?{ label: '小花仙在树屋里 ✨', hint: '点一下叫她出来' }
    : { label: 'Your fairy is in the treehouse ✨', hint: 'Tap to call her out' };

function GardenSceneContent({ enableFairyWalk = false, initialPreviewMode = true, initialWaterfallVersion = 'legacy', showDevControls = true, readOnly = false, onOpenBookhouse, onOpenReflection, showCalendar = false, locale, children, onTreehouseEntered, onTreehouseExited, onMailboxOpened, onMailboxPhaseChange, interactionRef, mode = 'development' }: GardenSceneProps & {interactionRef?:Ref<GardenSceneHandle>} = {}) {
  const isDev = showDevControls && mode === 'development';
  runtimeAudit.render('GardenScene');
  const planting = usePlanting();
  const [perfFlags,setPerfFlags]=useState<GardenIsolation>({...DEFAULT_ISOLATION});
  const [perfCount,setPerfCount]=useState<number|null>(null);
  const perf=__DEV__&&isDev?perfFlags:{...DEFAULT_ISOLATION,DebugUI:false};
  const fixtureParents=useMemo(()=>__DEV__&&perfCount!==null?productionQARecords(perfCount):null,[perfCount]);
  const drawnPlanting=fixtureParents?{...planting,placements:fixtureParents,activeMode:'normal' as const,
    targetFlower:null,previewCoords:null,validationResult:null}:planting;
  const [useMonthlyGrowth, setUseMonthlyGrowth] = useState(USE_MONTHLY_GARDEN_GROWTH_V1_1);
  const {
    placements,
    activeMode,
    targetFlower,
    previewCoords,
    validationResult,
    selectedFlower,
    isSaving,
    showDevPlantingRegions,
    showDevFootprints,
    showDevHitboxes,
    showPlacementDebug,
    startPlanting,
    startAdjusting,
    updatePreview,
    confirmPlacement,
    cancelPlacement,
    openFlowerDetail,
    closeFlowerDetail,
    supportFlower,
    resetAllPlacements,
    setShowDevPlantingRegions,
    setShowDevFootprints,
    setShowDevHitboxes,
    setShowPlacementDebug,
  } = planting;

  const unresolvedGardenArt = useMemo(() => [...new Set(placements.filter(p => !gardenSpecies(p))
    .map(p => p.speciesCode || p.flowerName || 'UNKNOWN'))], [placements]);

  const activeModeRef = useRef(activeMode);
  const perfFixtureRef=useRef(false);perfFixtureRef.current=fixtureParents!==null;
  const placementsRef = useRef(placements);
  useEffect(() => {
    activeModeRef.current = activeMode;
    placementsRef.current = placements;
  }, [activeMode, placements]);

  const searchParams = useLocalSearchParams<{
    mode?: string;
    flowerId?: string;
    journalEntryId?: string;
    plantedDate?: string;
    month?: string;
    flowerName?: string;
    speciesCode?: string;
    mood?: string;
    calMode?: string;
    subMode?: string;
  }>();

  const fairyRef = useRef<FairyHandle>(null);
  const fairyPress = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const fairySeconds=useSharedValue(0);
  const [fairyState, setFairyState] = useState<FairyState>('idle');
  // Read by the memoized tap handler without re-creating it on every Fairy state.
  const fairyStateRef = useRef<FairyState>('idle'); fairyStateRef.current = fairyState;
  // Her own day (server schedule), for owners the server enables; a user's tap holds it off a minute.
  const noteFairyUser = useFairySchedule(fairyRef, enableFairyWalk && !readOnly);
  // Tapping the treehouse sends her straight in, and the Bookhouse opens once she is inside.
  const bookhouseOnEntry = useRef(false);
  const tapTreehouse = useRef(() => {});
  tapTreehouse.current = () => {
    const fairy = fairyRef.current, bookhouse = !readOnly ? onOpenBookhouse : undefined;
    const action = treehouseTap(fairyStateRef.current, Boolean(bookhouse));
    if (action === 'callOut') fairy?.returnFromTreehouse();
    else if (action === 'openBookhouse') bookhouse?.();
    else if (action === 'openOnEntry') bookhouseOnEntry.current = true;
    else if (fairy?.visitTreehouse()) bookhouseOnEntry.current = Boolean(bookhouse);
    // She cannot get there right now (on her way out, or busy at the mailbox): the door still opens.
    else bookhouse?.();
  };

  const mailboxPhase: MailboxInteractionPhase = useMemo(() => {
    if (fairyState === 'movingToMailbox' || fairyState === 'flyingToMailbox') return 'walking';
    if (
      fairyState === 'aligningToMailbox' ||
      fairyState === 'retrievingMail' ||
      fairyState === 'turningWithMail' ||
      fairyState === 'presentingMail'
    )
      return 'retrieving';
    if (fairyState === 'mailboxTransition') return 'transitioning';
    return 'idle';
  }, [fairyState]);

  useEffect(() => {
    onMailboxPhaseChange?.(mailboxPhase);
  }, [mailboxPhase, onMailboxPhaseChange]);
  const fairyOnMoonBed = fairyState === 'sleepingOnMoonBed';
  const fairyOnSwing = fairyState === 'sittingOnSwing';
  const fairyInTreehouse = fairyState === 'insideTreehouse';
  const [fairyDebug, setFairyDebug] = useState(false);
  const [fairyStatus, setFairyStatus] = useState("Tap dry ground to move");
  // Now and then, while she rests, PPL says a line that fits what she is doing (not on a tap).
  const [fairyBubble, setFairyBubble] = useState<{ key: number; text: string } | null>(null);
  const fairyBubblePoint = useSharedValue({ x: 0, y: 0 });
  const recentFairyLines = useRef<string[]>([]);
  // When she last spoke, so moving between activities never shortens the quiet between lines.
  const fairyLineAt = useRef(-Infinity);
  const fairyBubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (fairyBubbleTimer.current) clearTimeout(fairyBubbleTimer.current); }, []);
  const handledParamRef = useRef<string | null>(null);

  const [waterfallVersion, setWaterfallVersion] = useState<WaterfallVersion>(initialWaterfallVersion);
  const worldTime = useWorldTime();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [previewMode, setPreviewMode] = useState(isDev ? initialPreviewMode : true);
  const [treehouseStatus, setTreehouseStatus] = useState('Waiting for TreehouseEntity effect');
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [infrastructureEnabled, setInfrastructureEnabled] = useState(true);
  const [environmentEnabled, setEnvironmentEnabled] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(0);
  const [waterfallReferenceOpacity, setWaterfallReferenceOpacity] = useState(0.5);
  const [moonBedIntegrationEnabled, setMoonBedIntegrationEnabled] = useState(true);
  const [moonBedShadowOpacity, setMoonBedShadowOpacity] = useState(0.5);
  const [calibrationLayout, setCalibrationLayout] = useState(() => GARDEN_LANDS.map((land) => ({ ...land })));
  const [selectedLandId, setSelectedLandId] = useState('central');
  const [calibrationMode, setCalibrationMode] = useState<
    | 'land'
    | 'treehouse'
    | 'swing'
    | 'moon-bed'
    | 'garden-arch'
    | 'pavilion'
    | 'tea-set'
    | 'waterfall'
    | 'impact'
    | 'water-top'
    | 'bridge'
    | 'planting-regions'
  >('land');
  const [plantingCalibrationMap, setPlantingCalibrationMap] = useState<
    Record<number, MonthRegionCalibration>
  >(() => loadCalibrationFromStorage());
  const [selectedCalMonth, setSelectedCalMonth] = useState<number>(1);
  const [calDisplayMode, setCalDisplayMode] = useState<CalDisplayMode>('all');
  const [calOpacity, setCalOpacity] = useState<number>(0.5);
  const [calDragMode, setCalDragMode] = useState<CalDragMode>('region');
  const [showLandBounds, setShowLandBounds] = useState<boolean>(true);
  const [calSubMode, setCalSubMode] = useState<'transform' | 'mask-paint'>('transform');
  const [paintTool, setPaintTool] = useState<MaskTool>('add');
  const [paintBrushSize, setPaintBrushSize] = useState<number>(40);
  const [paintInteractionMode, setPaintInteractionMode] = useState<PaintInteractionMode>('paint');
  const [paintOpacity, setPaintOpacity] = useState<number>(0.55);
  const [showBaseMask, setShowBaseMask] = useState<boolean>(false);
  const [showAdditions, setShowAdditions] = useState<boolean>(false);
  const [showErasures, setShowErasures] = useState<boolean>(false);
  const [showFinalMask, setShowFinalMask] = useState<boolean>(true);
  const [maskHistory, setMaskHistory] = useState<MaskEditHistory>(() => createMaskEditHistory());
  const maskHistoryRef = useRef(maskHistory);
  maskHistoryRef.current = maskHistory;
  const paintStrokes = maskHistory.current.strokes;
  const maskOffset = maskHistory.current;
  const undoStack = maskHistory.undo;
  const redoStack = maskHistory.redo;
  const setPaintStrokes = useCallback((value: SetStateAction<MaskStroke[]>) => {
    setMaskHistory((prev) => ({ ...prev, current: {
      ...prev.current, strokes: typeof value === 'function' ? value(prev.current.strokes) : value,
    } }));
  }, []);
  const setUndoStack = useCallback((value: SetStateAction<MaskEditState[]>) => {
    setMaskHistory((prev) => ({ ...prev, undo: typeof value === 'function' ? value(prev.undo) : value }));
  }, []);
  const setRedoStack = useCallback((value: SetStateAction<MaskEditState[]>) => {
    setMaskHistory((prev) => ({ ...prev, redo: typeof value === 'function' ? value(prev.redo) : value }));
  }, []);
  const [isMovingMask, setIsMovingMask] = useState(false);
  const moveMaskDragRef = useRef<{
    start: MaskEditState;
    pointer: { x: number; y: number };
    committed: boolean;
  } | null>(null);
  const [brushCursor, setBrushCursor] = useState<{
    lx: number;
    ly: number;
    radius: number;
    tool: MaskTool;
  } | null>(null);
  const currentStrokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const [bridgePlacement, setBridgePlacement] = useState(() => ({ ...INITIAL_BRIDGE_TEST }));
  const [showBridgeDebug, setShowBridgeDebug] = useState(false);
  const [showBridgeWalkPath, setShowBridgeWalkPath] = useState(false);
  const [treehousePlacement, setTreehousePlacement] = useState<TreehousePlacement>(() => ({ ...CHECKED_IN_TREEHOUSE }));
  const [swingPlacement, setSwingPlacement] = useState<SwingMapPlacement>(() => ({ ...CHECKED_IN_SWING }));
  const [moonBedPlacement, setMoonBedPlacement] = useState<MoonBedMapPlacement>(
    () => ({ ...CHECKED_IN_MOON_BED }),
  );
  const [gardenArchPlacement, setGardenArchPlacement] = useState<StaticLandmarkMapPlacement>(
    () => ({ ...CHECKED_IN_GARDEN_ARCH }),
  );
  const [pavilionPlacement, setPavilionPlacement] = useState<StaticLandmarkMapPlacement>(
    () => ({ ...CHECKED_IN_PAVILION }),
  );
  const [teaSetPlacement, setTeaSetPlacement] = useState<TeaSetMapPlacement>(
    () => ({ ...CHECKED_IN_TEA_SET }),
  );
  const [waterfallPlacement, setWaterfallPlacement] = useState(() => ({ ...INITIAL_WATERFALL_PLACEMENT }));
  const [waterfallImpactPlacement, setWaterfallImpactPlacement] = useState<WaterfallImpactPlacement>(
    () => ({ ...INITIAL_WATERFALL_IMPACT_PLACEMENT })
  );
  const [waterTopPlacement, setWaterTopPlacement] = useState<WaterTopPlacement>(
    () => ({ ...INITIAL_WATER_TOP_PLACEMENT })
  );
  const [waterTopPreset, setWaterTopPreset] = useState<TopWaterDisplayPreset>('all');
  const [waterTopFrontBankEnabled, setWaterTopFrontBankEnabled] = useState(true);
  const [impactOverlayVisible, setImpactOverlayVisible] = useState(true);
  const [impactWaterStrength, setImpactWaterStrength] = useState(1.0);
  const [underlayDebugMode, setUnderlayDebugMode] = useState<'off' | 'current-z' | 'top-z'>('off');
  const [runtimeUnderlayStrength, setRuntimeUnderlayStrength] = useState(1.5);
  const [gardenActive, setGardenActive] = useState(true);
  const canvasRef = useCanvasRef();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const worldActive = gardenActive && foreground;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  // Approved Water System integration states
  const [waterBaseVisible, setWaterBaseVisible] = useState(true);
  const [waterRipplesVisible, setWaterRipplesVisible] = useState(true);
  const [waterRippleOpacity, setWaterRippleOpacity] = useState(0.35);
  const [fishVisible, setFishVisible] = useState(true);
  const [fishDensity, setFishDensity] = useState<FishDensity>('normal');
  const [fishMotionPreset, setFishMotionPreset] = useState<FishMotionPreset>('normal');
  const [lotusVisible, setLotusVisible] = useState(true);
  const [lotusMode, setLotusMode] = useState<LotusRenderMode>('sway');
  const [wakeVisible, setWakeVisible] = useState(false); // Optional DEV toggle, default OFF
  const [foamVisible, setFoamVisible] = useState(true);
  const [topWaterAssemblyEnabled, setTopWaterAssemblyEnabled] = useState(true);
  const [topWaterMotionMode, setTopWaterMotionMode] = useState<TopWaterMotionMode>('animate');

  const surfaceFlow = useWaterTopFlow(worldActive && perf.Water && perf.WaterAnimation, waterRipplesVisible && perf.WaterAnimation);

  const calmBaseImage = useImage(WATER_ASSETS.calmBase, reportWaterFailure);
  useEffect(() => { publishWater(calmBaseImage ? 'ready' : 'loading'); }, [calmBaseImage]);


  useFocusEffect(useCallback(() => {
    setGardenActive(true);
    return () => setGardenActive(false);
  }, []));
  const waterfallFocus = __DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'waterfall';
  const fit = Math.min(viewport.width / GARDEN_WORLD_WIDTH, viewport.height / GARDEN_WORLD_HEIGHT);
  const baseX = (viewport.width - GARDEN_WORLD_WIDTH * fit) / 2;
  const baseY = (viewport.height - GARDEN_WORLD_HEIGHT * fit) / 2;
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraZoom = useSharedValue(1);
  // Partner camera contract: the Garden always covers the screen on any device.
  // Clamp programmatic focus, resize and reset as well as direct gestures.
  useAnimatedReaction(
    () => constrainGardenCamera(viewport.width, viewport.height, fit, baseX, baseY,
      cameraX.value, cameraY.value, cameraZoom.value),
    next => {
      if (cameraX.value !== next.x) cameraX.value = next.x;
      if (cameraY.value !== next.y) cameraY.value = next.y;
      if (cameraZoom.value !== next.zoom) cameraZoom.value = next.zoom;
    }, [viewport.width, viewport.height, fit, baseX, baseY]);
  const maximumCameraZoom = Math.max(3, fit > 0 ? Math.max(viewport.width / GARDEN_WORLD_BOUNDS.width, viewport.height / GARDEN_WORLD_BOUNDS.height) / fit * 3 : 3);
  useEffect(() => {
    if (fit <= 0) return;
    const minimum = constrainGardenCamera(viewport.width, viewport.height, fit, baseX, baseY, 0, 0, 1).minimumZoom;
    cameraZoom.value = minimum;
    cameraX.value = viewport.width / 2 - baseX - (GARDEN_WORLD_BOUNDS.x + GARDEN_WORLD_BOUNDS.width / 2) * fit * minimum;
    cameraY.value = viewport.height / 2 - baseY - (GARDEN_WORLD_BOUNDS.y + GARDEN_WORLD_BOUNDS.height / 2) * fit * minimum;
  }, [viewport.width, viewport.height, fit, baseX, baseY, cameraX, cameraY, cameraZoom]);
  const sceneElement = useRef<View>(null);
  // Web fallback: a restored session can mount the scene without a non-zero
  // onLayout event, leaving fit at 0 and no canvas. Measure the element directly.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof ResizeObserver === 'undefined') return;
    const element = sceneElement.current as unknown as HTMLElement | null;
    if (!element?.getBoundingClientRect) return;
    const apply = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setViewport(previous =>
        previous.width === width && previous.height === height ? previous : { width, height });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const zoomRequest = useRef({ time: 0, zoom: 1 });
  const reducedCameraMotion = useReducedMotion();
  const zoomAt = useCallback((factor: number, focalX = viewport.width / 2, focalY = viewport.height / 2) => {
    if (fit <= 0) return;
    const now = Date.now();
    const previous = now - zoomRequest.current.time < 180 ? zoomRequest.current.zoom : cameraZoom.value;
    const next = zoomGardenAt(viewport.width, viewport.height, fit, baseX, baseY,
      cameraX.value, cameraY.value, cameraZoom.value, previous * factor, focalX, focalY);
    zoomRequest.current = { time: now, zoom: next.zoom };
    const timing = { duration: reducedCameraMotion ? 0 : 140, easing: Easing.out(Easing.cubic) };
    cameraX.value = withTiming(next.x, timing);
    cameraY.value = withTiming(next.y, timing);
    cameraZoom.value = withTiming(next.zoom, timing);
  }, [viewport.width, viewport.height, fit, baseX, baseY, cameraX, cameraY, cameraZoom, reducedCameraMotion]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const element = sceneElement.current as unknown as HTMLElement | null;
    if (!element?.addEventListener) return;
    const wheel = (event: WheelEvent) => {
      // Capture only this Garden's wheel/pinch events, never browser-page zoom.
      if ((event.target as Element)?.closest('button, input, textarea, select')) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoomAt(Math.exp(-Math.max(-180, Math.min(180, pixels)) * .0025), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);
  const maskScreenScale = useDerivedValue(() => fit * cameraZoom.value, [fit]);
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
  // Hit area follows the existing landmark and camera; the painted scene is unchanged.
  const [pavilionSelected, setPavilionSelected] = useState(false);
  const pavilionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pavilionTimer.current) clearTimeout(pavilionTimer.current); }, []);
  const pavilionEntryStyle = useAnimatedStyle(() => ({
    left: baseX + cameraX.value + pavilionPlacement.x * fit * cameraZoom.value,
    top: baseY + cameraY.value + pavilionPlacement.y * fit * cameraZoom.value,
    width: Math.max(44, 1214 * pavilionPlacement.scale * fit * cameraZoom.value),
    height: Math.max(44, 1295 * pavilionPlacement.scale * fit * cameraZoom.value),
  }));
  const treehouseEntryStyle = useAnimatedStyle(() => ({
    left: baseX + cameraX.value + (treehousePlacement.x + 870 * treehousePlacement.scale) * fit * cameraZoom.value - 28,
    top: baseY + cameraY.value + (treehousePlacement.y + 690 * treehousePlacement.scale) * fit * cameraZoom.value - 28,
    width: 56, height: 56,
  }));
  // Inside, she is hidden behind the door; a bubble above it says she is there.
  const treehouseHintStyle = useAnimatedStyle(() => ({
    left: baseX + cameraX.value + (treehousePlacement.x + 870 * treehousePlacement.scale) * fit * cameraZoom.value - 100,
    top: baseY + cameraY.value + (treehousePlacement.y + 690 * treehousePlacement.scale) * fit * cameraZoom.value - 120,
    width: 200,
  }));
  const fairyBubbleStyle = useAnimatedStyle(() => ({
    left: baseX + cameraX.value + fairyBubblePoint.value.x * fit * cameraZoom.value - 110,
    top: baseY + cameraY.value + (fairyBubblePoint.value.y - 150) * fit * cameraZoom.value - 64,
    width: 220,
  }));
  const sayFairyLine = useCallback((state: FairyState, at: { x: number; y: number }) => {
    const line = pickTapLine(state, locale, recentFairyLines.current, Math.random, AMBIENT_LINES);
    if (!line) return;
    recentFairyLines.current = [line.id, ...recentFairyLines.current].slice(0, RECENT_TAP_LINES);
    fairyBubblePoint.value = { x: at.x, y: at.y };
    setFairyBubble(previous => ({ key: (previous?.key ?? 0) + 1, text: line.text }));
    if (fairyBubbleTimer.current) clearTimeout(fairyBubbleTimer.current);
    fairyBubbleTimer.current = setTimeout(() => setFairyBubble(null), AMBIENT_TIMING.showMs);
    fairyLineAt.current = Date.now();
  }, [locale, fairyBubblePoint]);
  // A new activity clears the old line and restarts the wait; she is quiet while travelling,
  // hidden indoors, or while the Garden is in the background.
  useEffect(() => {
    setFairyBubble(null);
    if (!enableFairyWalk || readOnly || !worldActive || !tapActivity(fairyState)) return;
    let timer = setTimeout(function speak() {
      const at = fairyRef.current?.getPosition();
      if (at) sayFairyLine(fairyStateRef.current, at);
      timer = setTimeout(speak, ambientDelay(false, Math.random, Date.now() - fairyLineAt.current));
    }, ambientDelay(true, Math.random, Date.now() - fairyLineAt.current));
    return () => clearTimeout(timer);
  }, [enableFairyWalk, readOnly, worldActive, fairyState, sayFairyLine]);
  const focusCoords = useCallback((worldX: number, worldY: number, targetZoom = 1.8) => {
    if (viewport.width === 0 || viewport.height === 0 || fit <= 0) return;
    cameraZoom.value = targetZoom;
    cameraX.value = viewport.width / 2 - baseX - worldX * fit * targetZoom;
    cameraY.value = viewport.height / 2 - baseY - worldY * fit * targetZoom;
  }, [baseX, baseY, fit, viewport.width, viewport.height, cameraX, cameraY, cameraZoom]);

  const calendarHighlight = useSharedValue(0);
  const calendarPoint = useSharedValue({ x: 0, y: 0 });
  const calendarReducedMotion = useReducedMotion();
  const calendarHighlightStyle = useAnimatedStyle(() => ({
    left: baseX + cameraX.value + calendarPoint.value.x * fit * cameraZoom.value - 22,
    top: baseY + cameraY.value + calendarPoint.value.y * fit * cameraZoom.value - 22,
    opacity: calendarHighlight.value,
  }));
  useImperativeHandle(interactionRef,()=>({
    focusFairy:()=>{
      if (activeModeRef.current !== 'normal' || selectedFlower) return;
      const point = fairyRef.current?.getPosition();
      if (point) focusCoords(point.x, point.y, cameraZoom.value);
    },
    returnFromTreehouse:()=>{noteFairyUser();return fairyRef.current?.returnFromTreehouse()??false;},
    returnFromMailbox:()=>{noteFairyUser();return fairyRef.current?.returnFromMailbox()??false;},
    visitMailbox:()=>{noteFairyUser();return fairyRef.current?.visitMailbox()??false;},
    isMailboxBusy:()=>fairyRef.current?.isMailboxBusy()??false,
  }),[focusCoords,cameraZoom,selectedFlower]);

  const focusCalendarFlower = (flower: typeof placements[number]) => {
    const duration = calendarReducedMotion ? 0 : 500;
    cameraZoom.value = withTiming(1.8, { duration });
    cameraX.value = withTiming(viewport.width / 2 - baseX - flower.worldX * fit * 1.8, { duration });
    cameraY.value = withTiming(viewport.height / 2 - baseY - flower.worldY * fit * 1.8, { duration });
    calendarPoint.value = { x: flower.worldX, y: flower.worldY };
    calendarHighlight.value = .45;
    calendarHighlight.value = withTiming(0, { duration: calendarReducedMotion ? 400 : 1700 });
  };
  const focusCalMonth = useCallback((month: number) => {
    if (fit <= 0) return;
    const centroid = getCalibratedCentroid(month, plantingCalibrationMap, calibrationLayout);
    focusCoords(centroid.x, centroid.y, 2.0);
  }, [fit, plantingCalibrationMap, calibrationLayout, focusCoords]);

  useEffect(() => {
    if (readOnly || (!searchParams.mode && !searchParams.calMode)) return;
    const paramKey = `${searchParams.mode || ''}-${searchParams.flowerId || ''}-${searchParams.calMode || ''}`;
    if (handledParamRef.current === paramKey) return;
    handledParamRef.current = paramKey;

    if (searchParams.calMode === 'planting-regions' || searchParams.mode === 'calibrate') {
      setPreviewMode(false);
      setCalibrationMode('planting-regions');
      if (searchParams.subMode === 'mask-paint') {
        setCalSubMode('mask-paint');
      } else {
        setCalSubMode('transform');
      }
      focusCalMonth(1);
    } else if (searchParams.mode === 'plant' && searchParams.flowerId) {
      const monthNum = parseInt(searchParams.month || '1', 10);
      startPlanting({
        flowerId: searchParams.flowerId,
        journalEntryId: searchParams.journalEntryId,
        plantedDate: searchParams.plantedDate,
        month: monthNum,
        flowerName: searchParams.flowerName || 'pink',
        speciesCode: searchParams.speciesCode,
        mood: searchParams.mood,
      });
      const c = getApprovedMonthCentroid(monthNum);
      focusCoords(c.x, c.y);
      setPreviewMode(true);
    } else if (searchParams.mode === 'adjust') {
      const flower = placements.find((p) => p.flowerId === searchParams.flowerId || p.id === searchParams.flowerId);
      if (flower) {
        startAdjusting(flower);
        focusCoords(flower.worldX, flower.worldY);
        setPreviewMode(true);
      }
    }
  }, [readOnly, searchParams, placements, startPlanting, startAdjusting, focusCoords, focusCalMonth]);

  const handleCalibrationNudge = useCallback((field: keyof MonthRegionCalibration, delta: number) => {
    setPlantingCalibrationMap((prev) => {
      const current = prev[selectedCalMonth] || PLANTING_REGION_CALIBRATION[selectedCalMonth];
      const updated = {
        ...current,
        [field]: Number(((current[field] as number) + delta).toFixed(4)),
      };
      return {
        ...prev,
        [selectedCalMonth]: updated,
      };
    });
  }, [selectedCalMonth]);

  const handleResetSelectedMonth = useCallback(() => {
    setPlantingCalibrationMap((prev) => ({
      ...prev,
      [selectedCalMonth]: { ...PLANTING_REGION_CALIBRATION[selectedCalMonth] },
    }));
  }, [selectedCalMonth]);

  const handleResetAllMonths = useCallback(() => {
    resetCalibrationStorage();
    setPlantingCalibrationMap({ ...PLANTING_REGION_CALIBRATION });
  }, []);

  const handleSaveCalibration = useCallback(() => {
    saveCalibrationToStorage(plantingCalibrationMap);
  }, [plantingCalibrationMap]);

  useEffect(() => {
    if (calibrationMode === 'planting-regions') {
      const refinement = loadMonthMaskRefinement(selectedCalMonth);
      setMaskHistory(createMaskEditHistory(refinement));
      setBrushCursor(null);
      moveMaskDragRef.current = null;
      setIsMovingMask(false);
    }
  }, [selectedCalMonth, calibrationMode]);

  const handleUndoMask = useCallback(() => {
    setMaskHistory(undoMaskEdit);
    setBrushCursor(null);
  }, []);

  const handleRedoMask = useCallback(() => {
    setMaskHistory(redoMaskEdit);
    setBrushCursor(null);
  }, []);

  const handleClearUnsavedMask = useCallback(() => {
    const refinement = loadMonthMaskRefinement(selectedCalMonth);
    setMaskHistory(createMaskEditHistory(refinement));
    setBrushCursor(null);
  }, [selectedCalMonth]);

  const handleResetMaskToLockedBase = useCallback(() => {
    setMaskHistory(resetMaskEditToLockedBase);
    setBrushCursor(null);
  }, []);

  const handleCancelMaskEdit = useCallback(() => {
    const refinement = loadMonthMaskRefinement(selectedCalMonth);
    setMaskHistory(createMaskEditHistory(refinement));
    setBrushCursor(null);
    setCalSubMode('transform');
  }, [selectedCalMonth]);

  const handleSaveMask = useCallback(() => {
    const cal =
      plantingCalibrationMap[selectedCalMonth] ||
      PLANTING_REGION_CALIBRATION[selectedCalMonth];
    const land = getParentLand(cal.parentLandAsset, calibrationLayout);
    saveMonthMaskRefinement(
      selectedCalMonth,
      paintStrokes,
      land.id,
      cal.parentLandAsset,
      maskOffset
    );
  }, [plantingCalibrationMap, selectedCalMonth, calibrationLayout, paintStrokes, maskOffset]);

  const handleMaskOffsetNudge = useCallback((axis: 'offsetX' | 'offsetY', amount: number) => {
    setMaskHistory((prev) => commitMaskEdit(prev, {
      ...prev.current, [axis]: prev.current[axis] + amount,
    }));
    setBrushCursor(null);
  }, []);

  const handleMaskInteractionMode = useCallback((mode: PaintInteractionMode) => {
    moveMaskDragRef.current = null;
    currentStrokePointsRef.current = [];
    setIsMovingMask(false);
    setBrushCursor(null);
    if (mode === 'move') setShowFinalMask(true);
    setPaintInteractionMode(mode);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && __DEV__) {
      (window as any).__plantingDebug = {
        setPaintTool,
        setPaintBrushSize,
        setPaintStrokes,
        setShowBaseMask,
        setShowAdditions,
        setShowErasures,
        setShowFinalMask,
        setUndoStack,
        setRedoStack,
        setSelectedCalMonth,
        focusCalMonth,
        focusCoords,
        getCamera: () => ({
          cameraX: cameraX.value,
          cameraY: cameraY.value,
          cameraZoom: cameraZoom.value,
          fit,
          baseX,
          baseY,
          viewport,
        }),
        paintStrokes,
        showErasures,
        showFinalMask,
        addStroke: (tool: MaskTool, radius: number, points: { x: number; y: number }[]) => {
          const stroke = createMaskStroke(tool, radius, points);
          setPaintStrokes((prev) => [...prev, stroke]);
        },
      };
    }
  }, [
    setPaintTool,
    setPaintBrushSize,
    setPaintStrokes,
    setShowBaseMask,
    setShowAdditions,
    setShowErasures,
    setShowFinalMask,
    setUndoStack,
    setRedoStack,
    setSelectedCalMonth,
    focusCalMonth,
    focusCoords,
    cameraX,
    cameraY,
    cameraZoom,
    fit,
    baseX,
    baseY,
    viewport,
    paintStrokes,
    showErasures,
    showFinalMask,
  ]);

  const handlePointerMove = useCallback(
    (e: any) => {
      if (
        !__DEV__ ||
        previewMode ||
        calibrationMode !== 'planting-regions' ||
        calSubMode !== 'mask-paint' ||
        paintInteractionMode !== 'paint'
      ) {
        setBrushCursor(null);
        return;
      }
      const nativeEvent = e.nativeEvent;
      if (!nativeEvent) return;
      const screenX = nativeEvent.locationX ?? nativeEvent.clientX;
      const screenY = nativeEvent.locationY ?? nativeEvent.clientY;
      if (screenX === undefined || screenY === undefined) return;
      const currentZoom = cameraZoom.value;
      const currentCamX = cameraX.value;
      const currentCamY = cameraY.value;
      const worldX = (screenX - baseX - currentCamX) / (fit * currentZoom);
      const worldY = (screenY - baseY - currentCamY) / (fit * currentZoom);
      const cal =
        plantingCalibrationMap[selectedCalMonth] ||
        PLANTING_REGION_CALIBRATION[selectedCalMonth];
      const land = getParentLand(cal.parentLandAsset, calibrationLayout);
      const landLocal = landLocalToRefinementLocal(
        worldToLandLocal(worldX, worldY, land), maskHistoryRef.current.current
      );
      setBrushCursor({
        lx: landLocal.x,
        ly: landLocal.y,
        radius: paintBrushSize / 2,
        tool: paintTool,
      });
    },
    [
      previewMode,
      calibrationMode,
      calSubMode,
      cameraZoom,
      cameraX,
      cameraY,
      baseX,
      baseY,
      fit,
      plantingCalibrationMap,
      selectedCalMonth,
      calibrationLayout,
      paintBrushSize,
      paintTool,
      paintInteractionMode,
    ]
  );

  const handleGardenTap = useCallback((screenX: number, screenY: number) => {
    // A friend's Garden (readOnly) still opens its flowers, so visitors can support them and leave
    // a message; planting, calibration and the Fairy stay with the owner.
    if (fit <= 0) return;
    if (selectedFlower) return;
    const currentZoom = cameraZoom.value;
    const currentCamX = cameraX.value;
    const currentCamY = cameraY.value;
    const worldX = (screenX - baseX - currentCamX) / (fit * currentZoom);
    const worldY = (screenY - baseY - currentCamY) / (fit * currentZoom);

    if (__DEV__ && !readOnly && perf.DebugUI && !previewMode && calibrationMode === 'planting-regions') {
      if (calSubMode === 'mask-paint') {
        return;
      }
      let closestMonth = selectedCalMonth;
      let closestDist = Infinity;
      for (let m = 1; m <= 12; m++) {
        const c = getCalibratedCentroid(m, plantingCalibrationMap, calibrationLayout);
        const d = Math.hypot(worldX - c.x, worldY - c.y);
        if (d < closestDist) {
          closestDist = d;
          closestMonth = m;
        }
      }
      if (closestDist < 160) {
        setSelectedCalMonth(closestMonth);
        return;
      }
    }

    if(perfFixtureRef.current)return;
    if (activeModeRef.current !== 'normal') {
      if (!readOnly) updatePreview(worldX, worldY);
    } else {
      const currentPlacements = placementsRef.current;
      let hitFlower: FlowerPlacementRecord | null = useMonthlyGrowth?hitProductionFlower(currentPlacements,worldX,worldY):null;
      for (let i = currentPlacements.length - 1; !useMonthlyGrowth && i >= 0; i--) {
        const p = currentPlacements[i];
        const def = getFlowerPlacementDefinition(p.flowerName);
        const hitCenterY = p.worldY - def.visualHeight * 0.35;
        const dx = worldX - p.worldX;
        const dy = worldY - hitCenterY;
        if (dx * dx + dy * dy <= def.hitboxRadius * def.hitboxRadius) {
          hitFlower = p;
          break;
        }
      }
      if (hitFlower) {
        openFlowerDetail(hitFlower);
        return;
      }
      if (readOnly) return;
      // Placement and flower details own taps before any Fairy destination.
      if (enableFairyWalk && fairyRef.current?.isMailboxBusy()) return;
      if (enableFairyWalk) { noteFairyUser(); bookhouseOnEntry.current = false; }
      if (enableFairyWalk && !readOnly) noteFairyInteraction();
      if (enableFairyWalk && hitsMailbox({x:worldX,y:worldY},treehousePlacement)) {
        fairyRef.current?.visitMailbox();
        return;
      }
      if (enableFairyWalk && hitsTreehouse({x:worldX,y:worldY},treehousePlacement)) {
        tapTreehouse.current();
        return;
      }
      if (enableFairyWalk && hitsSwing({x:worldX,y:worldY}, swingPlacement)) {
        fairyRef.current?.visitSwing();
        return;
      }
      if (enableFairyWalk && hitsTeaArea({x:worldX,y:worldY},teaSetPlacement)) {
        fairyRef.current?.visitTea();
        return;
      }
      if (enableFairyWalk && hitsMoonBed({x:worldX,y:worldY}, moonBedPlacement)) {
        fairyRef.current?.visitMoonBed();
        return;
      }
      if (enableFairyWalk) {
        const accepted = fairyRef.current?.move({ x: worldX, y: worldY });
        if (accepted && Platform.OS === 'web') canvasRef.current?.redraw();
      }
    }
  }, [readOnly, selectedFlower, fit, baseX, baseY, cameraZoom, cameraX, cameraY, updatePreview, openFlowerDetail, previewMode, calibrationMode, calSubMode, selectedCalMonth, plantingCalibrationMap, calibrationLayout, useMonthlyGrowth, enableFairyWalk, swingPlacement, moonBedPlacement, teaSetPlacement, treehousePlacement]);

  const startMaskPos = useRef({ localX: 0, localY: 0 });

  const maskPan = useMemo(() => {
    return Gesture.Pan()
      .maxPointers(1)
      .runOnJS(true)
      .onStart(() => {
        const cal =
          plantingCalibrationMap[selectedCalMonth] ||
          PLANTING_REGION_CALIBRATION[selectedCalMonth];
        startMaskPos.current = { localX: cal.localX, localY: cal.localY };
      })
      .onUpdate((event) => {
        const currentZoom = cameraZoom.value;
        const cal =
          plantingCalibrationMap[selectedCalMonth] ||
          PLANTING_REGION_CALIBRATION[selectedCalMonth];
        const land = getParentLand(cal.parentLandAsset, calibrationLayout);
        const rotRad = (land.rotation * Math.PI) / 180;
        const dxW = event.translationX / (fit * currentZoom);
        const dyW = event.translationY / (fit * currentZoom);
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);
        const dxL = dxW * cos + dyW * sin;
        const dyL = -dxW * sin + dyW * cos;
        setPlantingCalibrationMap((prev) => {
          const cur =
            prev[selectedCalMonth] || PLANTING_REGION_CALIBRATION[selectedCalMonth];
          return {
            ...prev,
            [selectedCalMonth]: {
              ...cur,
              localX: Number((startMaskPos.current.localX + dxL).toFixed(2)),
              localY: Number((startMaskPos.current.localY + dyL).toFixed(2)),
            },
          };
        });
      });
  }, [selectedCalMonth, plantingCalibrationMap, calibrationLayout, fit, cameraZoom]);

  const paintPan = useMemo(() => {
    return Gesture.Pan()
      .maxPointers(1)
      .minDistance(0)
      .runOnJS(true)
      .onStart((event) => {
        const currentZoom = cameraZoom.value;
        const currentCamX = cameraX.value;
        const currentCamY = cameraY.value;
        const worldX = (event.x - baseX - currentCamX) / (fit * currentZoom);
        const worldY = (event.y - baseY - currentCamY) / (fit * currentZoom);
        const cal =
          plantingCalibrationMap[selectedCalMonth] ||
          PLANTING_REGION_CALIBRATION[selectedCalMonth];
        const land = getParentLand(cal.parentLandAsset, calibrationLayout);
        const landLocal = landLocalToRefinementLocal(
          worldToLandLocal(worldX, worldY, land), maskHistoryRef.current.current
        );

        currentStrokePointsRef.current = [{ x: landLocal.x, y: landLocal.y }];
        const newStroke = createMaskStroke(
          paintTool,
          paintBrushSize / 2,
          currentStrokePointsRef.current
        );
        setMaskHistory((prev) => commitMaskEdit(prev, {
          ...prev.current, strokes: [...prev.current.strokes, newStroke],
        }));
        setBrushCursor({
          lx: landLocal.x,
          ly: landLocal.y,
          radius: paintBrushSize / 2,
          tool: paintTool,
        });
      })
      .onUpdate((event) => {
        const currentZoom = cameraZoom.value;
        const currentCamX = cameraX.value;
        const currentCamY = cameraY.value;
        const worldX = (event.x - baseX - currentCamX) / (fit * currentZoom);
        const worldY = (event.y - baseY - currentCamY) / (fit * currentZoom);
        const cal =
          plantingCalibrationMap[selectedCalMonth] ||
          PLANTING_REGION_CALIBRATION[selectedCalMonth];
        const land = getParentLand(cal.parentLandAsset, calibrationLayout);
        const landLocal = landLocalToRefinementLocal(
          worldToLandLocal(worldX, worldY, land), maskHistoryRef.current.current
        );

        setBrushCursor({
          lx: landLocal.x,
          ly: landLocal.y,
          radius: paintBrushSize / 2,
          tool: paintTool,
        });

        const pts = currentStrokePointsRef.current;
        if (pts.length === 0) return;
        const lastPt = pts[pts.length - 1];
        const dx = landLocal.x - lastPt.x;
        const dy = landLocal.y - lastPt.y;
        if (dx * dx + dy * dy >= 4) {
          pts.push({ x: landLocal.x, y: landLocal.y });
          const updatedStroke = createMaskStroke(paintTool, paintBrushSize / 2, pts);
          setPaintStrokes((prev) => [...prev.slice(0, -1), updatedStroke]);
        }
      })
      .onEnd(() => {
        currentStrokePointsRef.current = [];
        setBrushCursor(null);
      })
      .onFinalize(() => {
        currentStrokePointsRef.current = [];
        setBrushCursor(null);
      });
  }, [
    baseX,
    baseY,
    fit,
    cameraZoom,
    cameraX,
    cameraY,
    plantingCalibrationMap,
    selectedCalMonth,
    calibrationLayout,
    paintTool,
    paintBrushSize,
  ]);

  const moveMaskPan = useMemo(() => {
    const pointerInLand = (x: number, y: number) => {
      const cal = plantingCalibrationMap[selectedCalMonth] || PLANTING_REGION_CALIBRATION[selectedCalMonth];
      const land = getParentLand(cal.parentLandAsset, calibrationLayout);
      return worldToLandLocal(
        (x - baseX - cameraX.value) / (fit * cameraZoom.value),
        (y - baseY - cameraY.value) / (fit * cameraZoom.value), land
      );
    };
    return Gesture.Pan()
      .maxPointers(1)
      .minDistance(0)
      .runOnJS(true)
      .onBegin((event) => {
        moveMaskDragRef.current = null;
        const pointer = pointerInLand(event.x, event.y);
        const start = maskHistoryRef.current.current;
        const cal = plantingCalibrationMap[selectedCalMonth] || PLANTING_REGION_CALIBRATION[selectedCalMonth];
        // Begin only on the actual final silhouette, including adds and holes.
        if (!isPointInRefinedMaskLandLocal(selectedCalMonth, pointer.x, pointer.y,
          start.strokes, cal, MONTH_REGION_METAS[selectedCalMonth], start)) return;
        moveMaskDragRef.current = { start, pointer, committed: false };
        setIsMovingMask(true);
        setBrushCursor(null);
      })
      .onUpdate((event) => {
        const drag = moveMaskDragRef.current;
        if (!drag) return;
        const pointer = pointerInLand(event.x, event.y);
        const dx = pointer.x - drag.pointer.x;
        const dy = pointer.y - drag.pointer.y;
        if (!drag.committed && dx === 0 && dy === 0) return;
        const current = {
          ...drag.start, offsetX: drag.start.offsetX + dx, offsetY: drag.start.offsetY + dy,
        };
        const firstUpdate = !drag.committed;
        drag.committed = true;
        setMaskHistory((prev) => firstUpdate ? commitMaskEdit(prev, current) : { ...prev, current });
      })
      .onFinalize(() => {
        moveMaskDragRef.current = null;
        setIsMovingMask(false);
      });
  }, [baseX, baseY, fit, cameraX, cameraY, cameraZoom,
    plantingCalibrationMap, selectedCalMonth, calibrationLayout]);

  const cameraGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .maxPointers(1)
      .onStart(() => {
        cancelAnimation(cameraX); cancelAnimation(cameraY); cancelAnimation(cameraZoom);
        startX.value = cameraX.value;
        startY.value = cameraY.value;
      })
      .onUpdate((event) => {
        const next = constrainGardenCamera(viewport.width, viewport.height, fit, baseX, baseY,
          startX.value + event.translationX, startY.value + event.translationY, cameraZoom.value);
        cameraX.value = next.x;
        cameraY.value = next.y;
      });
    const pinch = Gesture.Pinch()
      .onStart((event) => {
        startZoom.value = cameraZoom.value;
        startX.value = cameraX.value;
        startY.value = cameraY.value;
        focalWorldX.value = (event.focalX - baseX - startX.value) / (fit * startZoom.value);
        focalWorldY.value = (event.focalY - baseY - startY.value) / (fit * startZoom.value);
      })
      .onUpdate((event) => {
        const nextZoom = constrainGardenCamera(viewport.width, viewport.height, fit, baseX, baseY, 0, 0, startZoom.value * event.scale).zoom;
        cameraZoom.value = nextZoom;
        const next = constrainGardenCamera(viewport.width, viewport.height, fit, baseX, baseY,
          event.focalX - baseX - focalWorldX.value * fit * nextZoom,
          event.focalY - baseY - focalWorldY.value * fit * nextZoom, nextZoom);
        cameraX.value = next.x;
        cameraY.value = next.y;
      });
    const tap = Gesture.Tap()
      .enabled(!((enableFairyWalk || readOnly) && Platform.OS === 'web'))
      .maxDuration(250)
      .runOnJS(true)
      .onEnd((event) => {
        handleGardenTap(event.x, event.y);
      });
    const isPlantingCal = __DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'planting-regions';
    let effectivePan = pan;
    if (isPlantingCal) {
      if (calSubMode === 'mask-paint') {
        if (paintInteractionMode === 'move') {
          // Keep the view stationary while a mask translation is being edited.
          return Gesture.Simultaneous(moveMaskPan, tap);
        }
        effectivePan = paintInteractionMode === 'paint' ? paintPan : pan;
      } else {
        effectivePan = calDragMode === 'region' ? maskPan : pan;
      }
    }
    return Gesture.Simultaneous(effectivePan, pinch, tap);
  }, [baseX, baseY, fit, cameraX, cameraY, cameraZoom, focalWorldX, focalWorldY,
    viewport.width, viewport.height, startX, startY, startZoom, handleGardenTap, enableFairyWalk, readOnly, previewMode, calibrationMode, calSubMode, calDragMode, paintInteractionMode, maskPan, paintPan, moveMaskPan]);
  const resetView = useCallback(() => {
    const minimum = constrainGardenCamera(viewport.width, viewport.height, fit, baseX, baseY, 0, 0, 1).minimumZoom;
    cameraZoom.value = minimum;
    cameraX.value = viewport.width / 2 - baseX - (GARDEN_WORLD_BOUNDS.x + GARDEN_WORLD_BOUNDS.width / 2) * fit * minimum;
    cameraY.value = viewport.height / 2 - baseY - (GARDEN_WORLD_BOUNDS.y + GARDEN_WORLD_BOUNDS.height / 2) * fit * minimum;
  }, [viewport.width, viewport.height, fit, baseX, baseY, cameraX, cameraY, cameraZoom]);

  const focusImpactView = useCallback(() => {
    if (viewport.width === 0 || viewport.height === 0 || fit <= 0) return;
    const targetZoom = 2.6;
    const targetX = 1040;
    const targetY = 240;
    cameraZoom.value = targetZoom;
    cameraX.value = viewport.width / 2 - baseX - targetX * fit * targetZoom;
    cameraY.value = viewport.height * 0.38 - baseY - targetY * fit * targetZoom;
  }, [baseX, baseY, fit, viewport.width, viewport.height, cameraX, cameraY, cameraZoom]);

  // Camera-only framing keeps the bridge above its numeric editor.
  const focusBridge = () => {
    if (fit <= 0) return;
    const zoom = Math.min(maximumCameraZoom, viewport.width * 0.9 / (fit * 800), viewport.height * 0.48 / (fit * 700));
    cameraZoom.value = zoom;
    cameraX.value = viewport.width / 2 - baseX - bridgePlacement.x * fit * zoom;
    cameraY.value = viewport.height * 0.27 - baseY - bridgePlacement.y * fit * zoom;
  };

  const focusWaterTopView = useCallback(() => {
    if (viewport.width === 0 || viewport.height === 0 || fit <= 0) return;
    // Fit the complete raw image above the calibration panel, including y < 0.
    // Camera only: approved world placement stays unchanged.
    const p = INITIAL_WATER_TOP_PLACEMENT;
    const targetZoom = Math.min(3, viewport.width * 0.9 / (fit * 530), viewport.height * 0.42 / (fit * 360));
    const targetX = p.x + 1536 * p.scale / 2;
    const targetY = p.y + 1024 * p.scale / 2;
    cameraZoom.value = targetZoom;
    cameraX.value = viewport.width / 2 - baseX - targetX * fit * targetZoom;
    cameraY.value = viewport.height * 0.25 - baseY - targetY * fit * targetZoom;
  }, [baseX, baseY, fit, viewport.width, viewport.height, cameraX, cameraY, cameraZoom]);

  useEffect(() => {
    if (calibrationMode === 'impact') {
      focusImpactView();
    } else if (calibrationMode === 'water-top') {
      focusWaterTopView();
    } else if (calibrationMode === 'planting-regions' && viewport.width > 0 && fit > 0) {
      focusCalMonth(selectedCalMonth);
    }
  }, [calibrationMode, focusImpactView, focusWaterTopView, focusCalMonth, selectedCalMonth, viewport.width, fit]);

  const handleDoneImpactCalibration = useCallback(() => {
    setCalibrationMode('land');
    setPreviewMode(true);
    resetView();
  }, [resetView]);

  const isWaterTopCalibrating = __DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'water-top';
  const topWaterShowWater = true;
  const topWaterShowCliff = !isWaterTopCalibrating || (waterTopPreset !== 'water-only');
  const topWaterShowBank = !isWaterTopCalibrating || (waterTopFrontBankEnabled || waterTopPreset === 'bank' || waterTopPreset === 'all');
  const waterfallVisible = !isWaterTopCalibrating || (waterTopPreset === 'waterfall' || waterTopPreset === 'all');
  const impactFoamEffective = foamVisible && (!isWaterTopCalibrating || waterTopPreset === 'all');

  return (
    <View
      ref={sceneElement}
      testID="garden-scene"
      style={styles.scene}
      // Web Fairy taps should not expire with the shared camera gesture's
      // 250ms timer. Only canvas presses qualify; controls, drags and pinches do not.
      onPointerDown={(event) => {
        // A friend's Garden (readOnly) uses the same path for opening flowers.
        if (!(enableFairyWalk || readOnly) || Platform.OS !== 'web') return;
        const e = event.nativeEvent;
        fairyPress.current = e.isPrimary && e.button === 0 &&
          (event.target as unknown as { tagName?: string }).tagName === 'CANVAS'
          ? { x: e.clientX, y: e.clientY, pointerId: e.pointerId } : null;
      }}
      onPointerUp={(event) => {
        const press = fairyPress.current;
        fairyPress.current = null;
        const e = event.nativeEvent;
        if (!press || press.pointerId !== e.pointerId || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) return;
        const bounds = (event.currentTarget as unknown as { getBoundingClientRect: () => { left: number; top: number } }).getBoundingClientRect();
        handleGardenTap(e.clientX - bounds.left, e.clientY - bounds.top);
      }}
      onPointerCancel={() => { fairyPress.current = null; }}
      onPointerMove={(event) => {
        const press = fairyPress.current;
        if (press && Math.hypot(event.nativeEvent.clientX - press.x, event.nativeEvent.clientY - press.y) > 8) fairyPress.current = null;
        handlePointerMove(event);
        if (!enableFairyWalk || !fairyDebug || fit <= 0) return;
        const e = event.nativeEvent;
        const element = event.currentTarget as unknown as { getBoundingClientRect?: () => { left: number; top: number } };
        const bounds = element.getBoundingClientRect?.();
        const px = bounds ? e.clientX - bounds.left : e.offsetX;
        const py = bounds ? e.clientY - bounds.top : e.offsetY;
        fairyRef.current?.pointer({ x: (px - baseX - cameraX.value) / (fit * cameraZoom.value),
          y: (py - baseY - cameraY.value) / (fit * cameraZoom.value) });
      }}
      onLayout={({ nativeEvent: { layout } }) => {
        // Preserve camera framing through hidden stack screens' zero layouts.
        if (layout.width > 0 && layout.height > 0) setViewport({ width: layout.width, height: layout.height });
      }}
    >
      {planting.detailError ? <Text accessibilityRole="alert" style={{ position: "absolute", bottom: 90, left: 16, right: 16, zIndex: 30, backgroundColor: "white", padding: 12 }}>{planting.detailError}</Text> : null}
      {/* Direct Waterfall gestures remain disabled while the stable numeric editor is active. */}
      {fit > 0 && (
        <GestureDetector gesture={cameraGesture}>
        <Canvas ref={canvasRef} style={styles.scene} active={worldActive}>
          <GardenLandResources>
          <PlantingProvider value={drawnPlanting}>
          {/* Shared camera only. Neither sibling inherits an individual land transform. */}
          <Group transform={cameraTransform}>
            {/* 1. Solid fallback */}
            <Rect x={-2400} y={-2400} width={7200} height={6600} color={GARDEN_WATER_COLOR} />

            {/* 2. Calm water base */}
            {perf.Water && waterBaseVisible && calmBaseImage && (
              <GardenProfile name="Water field" enabled={perf.Water}><GardenWaterField flow={surfaceFlow} image={calmBaseImage} active={worldActive && perf.WaterAnimation} animated={waterRipplesVisible && perf.WaterAnimation} /></GardenProfile>
            )}

            {/* Approved receiving-water floor/contact, below fish and all terrain. */}
            {perf.Water && waterBaseVisible && <>
              <GardenSubmergedRocks flow={surfaceFlow} />
              {perf.Land && <LandLayer renderPass="shore" layout={__DEV__ ? calibrationLayout : undefined} />}
            </>}

            {/* 3. Fish (below ripples & surface disturbance) */}
            <GardenProfile name="Fish" enabled={perf.Fish}><FishLayer
              active={worldActive && perf.WaterAnimation}
              enabled={fishVisible}
              opacity={0.84}
              density={fishDensity}
              motionPreset={fishMotionPreset}
            /></GardenProfile>

            {/* 4. Surface ripples */}
            <GardenProfile name="Surface ripples" enabled={perf.Water}><SurfaceRippleLayer
              flow={surfaceFlow}
              softWorldEdges
              active={worldActive && perf.WaterAnimation}
              enabled={waterRipplesVisible}
              opacity={waterRippleOpacity}
            /></GardenProfile>

            {/* Sparse floating petals sit on the surface, below lotus and terrain. */}
            {perf.Water && waterBaseVisible && <FloatingPetalLayer flow={surfaceFlow} fit={fit} impactPlacement={waterfallImpactPlacement} />}

            {/* 5. Waterfall Impact Underlay (disturbed turquoise water & wake, above fish/ripples, below lotus/land/landmarks) */}
            <GardenProfile name="Impact underlay" enabled={perf.Waterfall}><WaterfallImpactUnderlay
              strength={__DEV__ ? impactWaterStrength : 1.0}
              active={worldActive && perf.WaterAnimation}
              enabled={foamVisible && waterfallVersion === 'legacy'}
              opacity={1.0}
              placement={waterfallImpactPlacement}
              onRuntimeStrength={__DEV__ ? setRuntimeUnderlayStrength : undefined}
            /></GardenProfile>
            {__DEV__ && underlayDebugMode === 'current-z' && (
              <WaterfallImpactDebugShape placement={waterfallImpactPlacement} />
            )}

            {/* Continuous outer cliffs; original water and landmarks are retained. */}
            {perf.Land && <GardenOuterBasin />}

            {/* 6. Lotus */}
            <GardenProfile name="Lotus" enabled={perf.Lotus}><LotusLayer
              flow={surfaceFlow}
              active={worldActive && perf.WaterAnimation}
              visible={lotusVisible}
              opacity={1.0}
              mode={perf.WaterAnimation?lotusMode:'static'}
            /></GardenProfile>

            {/* V2 is one independent terrain; islands and treehouse occlude it naturally. */}
            {perf.Waterfall && showLandmarks && waterfallVersion === 'v2' && (
              <WaterfallV2Entity active={worldActive && perf.WaterAnimation} animated={topWaterMotionMode === 'animate' && perf.WaterAnimation} />
            )}
          </Group>
          <Group transform={cameraTransform}>
            {/* 7. LandLayer */}
            <GardenProfile name="Land" enabled={perf.Land}><LandLayer layout={__DEV__ ? calibrationLayout : undefined}
              selectedLandId={__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'land' ? selectedLandId : null} /></GardenProfile>
            {/* Month Planting Region Overlay */}
            <GardenProfile name="Planting overlays" enabled={perf.DebugUI}><PlantingRegionOverlay
              screenScale={maskScreenScale}
              highlightedMonth={activeMode !== 'normal' && targetFlower ? targetFlower.month : null}
              showAllRegions={showDevPlantingRegions}
              isCalibrating={__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'planting-regions'}
              calibrationMap={plantingCalibrationMap}
              selectedMonth={selectedCalMonth}
              displayMode={calDisplayMode}
              opacity={calSubMode === 'mask-paint' ? paintOpacity : calOpacity}
              showLandBounds={showLandBounds}
              layout={calibrationLayout}
              isPaintingMask={__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'planting-regions' && calSubMode === 'mask-paint'}
              paintingMonth={selectedCalMonth}
              activeStrokes={paintStrokes}
              activeOffset={maskOffset}
              brushCursor={brushCursor}
              showBaseMask={showBaseMask}
              showAdditions={showAdditions}
              showErasures={showErasures}
              showFinalMask={showFinalMask}
            /></GardenProfile>

            {environmentEnabled && <GardenEnvironmentLayer />}
            {/* Approved world-aligned artwork is shared by development and production. */}
            {infrastructureEnabled && <GardenLand09InterfaceLayer />}
            <GardenConnectionLayer />
            {infrastructureEnabled && <GardenInfrastructureLayer />}
            {__DEV__ && !infrastructureEnabled && <GardenBridge placement={bridgePlacement} />}

            {/* 8. Reference overlay when enabled */}
            {__DEV__ && (waterfallFocus ? waterfallReferenceOpacity : referenceOpacity) > 0 && (
              <GardenReferenceLayer opacity={waterfallFocus ? waterfallReferenceOpacity : referenceOpacity} />
            )}
          </Group>
          <Group transform={cameraTransform}>
            {showLandmarks && (
              <LandmarkLayer fairyOnMoonBed={fairyOnMoonBed} fairyOnSwing={fairyOnSwing} fairyInTreehouse={fairyInTreehouse} renderPass="motion"
                landmarksVisible={perf.Landmarks}
                waterEnabled={perf.Water}
                waterAnimationEnabled={perf.WaterAnimation}
                landmarkAnimationEnabled={worldActive && perf.LandmarkAnimation}
                waterfallVersion={waterfallVersion}
                showDiagnostics={__DEV__ && perf.DebugUI && !previewMode && !waterfallFocus && showDiagnostics}
                showBounds={__DEV__ && perf.DebugUI && !previewMode && !waterfallFocus && calibrationMode !== 'land' && calibrationMode !== 'impact' && calibrationMode !== 'water-top'}
                waterfallImpactPlacement={waterfallImpactPlacement}
                impactFoamEnabled={impactFoamEffective && perf.Waterfall}
                treehousePlacement={treehousePlacement}
                swingPlacement={swingPlacement}
                moonBedPlacement={moonBedPlacement}
                gardenArchPlacement={gardenArchPlacement}
                pavilionPlacement={pavilionPlacement}
                teaSetPlacement={teaSetPlacement}
                waterfallPlacement={waterfallPlacement}
                waterfallActive={worldActive && perf.WaterAnimation}
                moonBedIntegrationEnabled={moonBedIntegrationEnabled}
                moonBedShadowOpacity={moonBedShadowOpacity}
                treehouseLightingEnabled={worldTime.isTreehouseLightingTime}
                swingLightingEnabled={worldTime.isTreehouseLightingTime}
                topWaterAssemblyEnabled={topWaterAssemblyEnabled}
                suppressLegacyWaterTop
                topWaterMotionMode={perf.WaterAnimation?topWaterMotionMode:'static'}
                waterTopPlacement={waterTopPlacement}
                topWaterShowWater={topWaterShowWater}
                topWaterShowCliff={topWaterShowCliff}
                topWaterShowBank={topWaterShowBank}
                waterfallVisible={waterfallVisible && perf.Waterfall}
                onDebugStatus={__DEV__ ? setTreehouseStatus : undefined}
              />
            )}
            {/* Ground and entrance slabs belong below the walking fairy. */}
            {infrastructureEnabled && showLandmarks && <GardenRoadApproachLayer />}
          </Group>
          {enableFairyWalk && <Group transform={cameraTransform}>
            <GardenFairy motionClock={fairySeconds} onMailboxOpened={() => {
              onMailboxOpened?.();
            }} onTreehouseExited={() => {
              onTreehouseExited?.();
            }} onTreehouseEntered={() => {
              onTreehouseEntered?.();
              if (bookhouseOnEntry.current) { bookhouseOnEntry.current = false; onOpenBookhouse?.(); }
            }} pixelsPerUnit={()=>fit*cameraZoom.value} onStateChange={setFairyState} ref={fairyRef} debug={fairyDebug} onStatus={setFairyStatus}
              active={worldActive && perf.Land && perf.Infrastructure && infrastructureEnabled && activeMode === 'normal' && !selectedFlower && previewMode}
              blocked={isGardenGroundBlocked} />
          </Group>}
          <Group transform={cameraTransform}>
            {showLandmarks && (
              <LandmarkLayer fairySeconds={fairySeconds} fairyAtTea={fairyState==='seatedAtTea'||fairyState==='drinkingTea'?fairyState:null} renderPass="static-front"
                behindTeaSet={<GardenProfile name="Flowers behind Tea Set" enabled={perf.Flowers}><PlantedFlowerLayer depthPass="behind-tea-set" useMonthlyGrowth={useMonthlyGrowth} /></GardenProfile>}
                landmarksVisible={perf.Landmarks}
                waterEnabled={perf.Water}
                waterAnimationEnabled={perf.WaterAnimation}
                landmarkAnimationEnabled={worldActive && perf.LandmarkAnimation}
                waterfallVersion={waterfallVersion}
                showDiagnostics={__DEV__ && perf.DebugUI && !previewMode && !waterfallFocus && showDiagnostics}
                showBounds={__DEV__ && perf.DebugUI && !previewMode && !waterfallFocus && calibrationMode !== 'land' && calibrationMode !== 'impact' && calibrationMode !== 'water-top'}
                waterfallImpactPlacement={waterfallImpactPlacement}
                impactFoamEnabled={impactFoamEffective && perf.Waterfall}
                treehousePlacement={treehousePlacement}
                swingPlacement={swingPlacement}
                moonBedPlacement={moonBedPlacement}
                gardenArchPlacement={gardenArchPlacement}
                pavilionPlacement={pavilionPlacement}
                teaSetPlacement={teaSetPlacement}
                waterfallPlacement={waterfallPlacement}
                waterfallActive={worldActive && perf.WaterAnimation}
                moonBedIntegrationEnabled={moonBedIntegrationEnabled}
                moonBedShadowOpacity={moonBedShadowOpacity}
                treehouseLightingEnabled={worldTime.isTreehouseLightingTime}
                swingLightingEnabled={worldTime.isTreehouseLightingTime}
                topWaterAssemblyEnabled={topWaterAssemblyEnabled}
                suppressLegacyWaterTop
                topWaterMotionMode={perf.WaterAnimation?topWaterMotionMode:'static'}
                waterTopPlacement={waterTopPlacement}
                topWaterShowWater={topWaterShowWater}
                topWaterShowCliff={topWaterShowCliff}
                topWaterShowBank={topWaterShowBank}
                waterfallVisible={waterfallVisible && perf.Waterfall}
                onDebugStatus={isDev && __DEV__ ? setTreehouseStatus : undefined}
              />
            )}
            {/* Planted Flowers & Active Placement Preview Layer */}
            <GardenProfile name="Flower foreground" enabled={perf.Flowers}><PlantedFlowerLayer depthPass={showLandmarks ? 'foreground' : 'all'} useMonthlyGrowth={useMonthlyGrowth} /></GardenProfile>
            {isDev && __DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'impact' && (
              <WaterfallImpactOverlay placement={waterfallImpactPlacement} />
            )}
            {/* TOP Z Diagnostic Copy: above LandmarkLayer / above WaterfallEntity */}
            {isDev && __DEV__ && perf.DebugUI && <BridgeDebugOverlay placement={bridgePlacement}
              debug={showBridgeDebug} walkPath={showBridgeWalkPath} />}
            {isDev && __DEV__ && underlayDebugMode === 'top-z' && (
              <WaterfallImpactDebugShape placement={waterfallImpactPlacement} />
            )}
          </Group>
          </PlantingProvider>
          </GardenLandResources>
        </Canvas>
        </GestureDetector>
      )}
      <GardenLoadingOverlay />
      <View style={{position:'absolute',left:12,bottom:90,flexDirection:'row',gap:6,zIndex:30}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out Garden" onPress={() => zoomAt(1 / 1.25)}
          style={styles.zoomButton}><Text style={styles.zoomButtonText}>−</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in Garden" onPress={() => zoomAt(1.25)}
          style={styles.zoomButton}><Text style={styles.zoomButtonText}>+</Text></Pressable>
      </View>
      {isDev && __DEV__ && <GardenRuntimePanel flags={perfFlags} onFlags={setPerfFlags} count={perfCount} onCount={setPerfCount}
        canChangeFixture={activeMode==='normal'} metadata={{realParentCount:placements.length,renderedParentCount:drawnPlanting.placements.length,
          viewport,waterfallVersion,growthV11:useMonthlyGrowth,previewMode,environmentEnabled,worldPhase:worldTime.phase}}/>}
      {/* Planting Placement Controls Banner & Action Bar */}
      {!readOnly && fixtureParents===null&&<PlantingPlacementControls />}

      {/* Flower Detail Modal */}
      {fixtureParents===null && <FlowerDetailModal />}

      {!readOnly && onOpenReflection && activeMode === 'normal' && !selectedFlower && (
        <Animated.View style={[{ position: 'absolute' }, pavilionEntryStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Enter Reflection pavilion"
            onPress={() => {
              if (pavilionTimer.current) return;
              setPavilionSelected(true);
              pavilionTimer.current = setTimeout(() => {
                setPavilionSelected(false); pavilionTimer.current = null; onOpenReflection();
              }, 160);
            }} style={{ flex: 1, borderRadius: 28, backgroundColor: pavilionSelected ? '#FFE8AF22' : 'transparent',
              borderWidth: pavilionSelected ? 1 : 0, borderColor: '#F4D59277' }} />
        </Animated.View>
      )}
      {!readOnly && onOpenBookhouse && activeMode === 'normal' && !selectedFlower && (
        <Animated.View style={[{ position: 'absolute' }, treehouseEntryStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Enter Treehouse Bookhouse"
            accessibilityHint="Open your private journals and flower history" onPress={() => {
              if (enableFairyWalk) { noteFairyUser(); tapTreehouse.current(); } else onOpenBookhouse();
            }}
            style={({ pressed }) => ({ flex: 1, borderRadius: 28, backgroundColor: pressed ? '#FFF4DC22' : 'transparent' })} />
        </Animated.View>
      )}
      {enableFairyWalk && !readOnly && activeMode === 'normal' && !selectedFlower && fairyInTreehouse && (
        <Animated.View testID="fairy-treehouse-hint" style={[{ position: 'absolute', alignItems: 'center', zIndex: 25 }, treehouseHintStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={treehouseHint(locale).label} accessibilityHint={treehouseHint(locale).hint}
            onPress={() => fairyRef.current?.returnFromTreehouse()} style={({ pressed }) => [styles.treehouseHint, pressed && { opacity: 0.75 }]}>
            <Text style={styles.treehouseHintText}>{treehouseHint(locale).label}</Text>
            <Text style={styles.treehouseHintHint}>{treehouseHint(locale).hint}</Text>
          </Pressable>
          <View style={styles.treehouseHintTail} />
        </Animated.View>
      )}
      {enableFairyWalk && !readOnly && activeMode === 'normal' && !selectedFlower && fairyBubble && (
        <Animated.View key={fairyBubble.key} testID="fairy-bubble" pointerEvents="none" accessibilityLiveRegion="polite"
          style={[{ position: 'absolute', alignItems: 'center', zIndex: 25 }, fairyBubbleStyle]}>
          <View style={styles.treehouseHint}>
            <Text style={styles.treehouseHintText}>{fairyBubble.text}</Text>
          </View>
          <View style={styles.treehouseHintTail} />
        </Animated.View>
      )}
      {enableFairyWalk && !readOnly && activeMode === 'normal' && !selectedFlower &&
        fairyState === 'mailboxTransition' && (
        <View testID="fairy-interaction-controls" style={{position:'absolute',right:16,bottom:110,gap:8,zIndex:30}}>
          <Pressable accessibilityRole="button" accessibilityLabel="Return from mailbox" style={styles.fairyAction}
            onPress={() => fairyRef.current?.returnFromMailbox()}><Text style={styles.fairyActionText}>Return from mailbox</Text></Pressable>
        </View>
      )}
      {children}
      {showCalendar && !readOnly && activeMode === 'normal' && !selectedFlower && <GardenCalendar onFocusFlower={focusCalendarFlower} />}
      {showCalendar && <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#F5E8B3', backgroundColor: '#FFF2C518' }, calendarHighlightStyle]} />}

      {/* Floating button when in Preview Mode */}
      {enableFairyWalk && isDev && __DEV__ && <View style={{ position: 'absolute', top: 12, left: 12, padding: 10, borderRadius: 8, backgroundColor: '#f6f2e7', maxWidth: 260 }}>
        <Text style={{ color: '#365b42', fontSize: 12 }}>{fairyStatus}</Text>
        {__DEV__ && <Pressable accessibilityRole="button" accessibilityLabel="Toggle fairy path debug" onPress={() => { setFairyDebug(v => !v); setFairyStatus("Tap dry ground to move"); }}>
          <Text style={{ color: '#365b42', fontSize: 12, marginTop: 6 }}>Path debug: {fairyDebug ? 'ON' : 'OFF'}</Text>
        </Pressable>}
      </View>}
      {__DEV__ && isDev && perf.DebugUI && previewMode && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setPreviewMode(false)}
          style={styles.floatingToggleButton}
        >
          <Text style={styles.floatingToggleText}>⚙️ DEV Controls</Text>
        </Pressable>
      )}

      {/* Full DEV Control Panels when Preview Mode is OFF */}
      {isDev && __DEV__ && perf.DebugUI && !previewMode && !waterfallFocus && calibrationMode !== 'impact' && calibrationMode !== 'water-top' && calibrationMode !== 'bridge' && calibrationMode !== 'planting-regions' && (
        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <ToggleButton
              label="👁️ Preview Mode (Hide Panels)"
              enabled
              onPress={() => setPreviewMode(true)}
            />
            <ToggleButton label="Reset View" enabled={false} onPress={resetView} />
            {([
              ['B01 feet', 1740, 1364], ['B02 feet', 1680, 570],
              ['ST01 feet', 1650, 935], ['Road junctions', 790, 740],
              ['Upper path junction', 1340, 390], ['Lower path junction', 1160, 1040],
              ['Treehouse road', 640, 485], ['Entrance road junction', 1440, 1490],
              ['Environment Central', 1190, 650], ['Environment West', 425, 890],
              ['Environment Land0405', 1430, 205], ['Environment Land06', 1930, 445],
              ['Environment Land07', 2100, 740], ['Environment Land08', 2050, 1275],
              ['Environment Land09', 1230, 1280], ['Environment Shoreline', 320, 1240],
            ] as const).map(([label, x, y]) => <ToggleButton key={label} label={label} enabled={false}
              onPress={() => {
                cameraZoom.value = 3;
                cameraX.value = viewport.width / 2 - baseX - x * fit * 3;
                cameraY.value = viewport.height / 2 - baseY - y * fit * 3;
                setPreviewMode(true);
              }} />)}
            <ToggleButton label="BRIDGE TEST" enabled={false} onPress={() => {
              setCalibrationMode('bridge');
              focusBridge();
            }} />
            {([
              ['Roads medium west', 685, 600], ['Roads medium upper', 1340, 390],
              ['Roads medium lower', 1260, 1080], ['Roads medium entrance', 1440, 1490],
            ] as const).map(([label, x, y]) => <ToggleButton key={label} label={label} enabled={false}
              onPress={() => {
                cameraZoom.value = 1.65;
                cameraX.value = viewport.width / 2 - baseX - x * fit * 1.65;
                cameraY.value = viewport.height / 2 - baseY - y * fit * 1.65;
                setPreviewMode(true);
              }} />)}
            <ToggleButton label="Land calibration" enabled={calibrationMode === 'land'} onPress={() => setCalibrationMode('land')} />
            <ToggleButton
              label="Planting Region calibration"
              enabled={(calibrationMode as string) === 'planting-regions'}
              onPress={() => {
                setCalibrationMode('planting-regions');
                focusCalMonth(selectedCalMonth);
              }}
            />
                <ToggleButton label="Treehouse calibration" enabled={calibrationMode === 'treehouse'} onPress={() => {
                  setCalibrationMode('treehouse');
                  setShowLandmarks(true);
                }} />
            <ToggleButton label="Swing calibration" enabled={calibrationMode === 'swing'} onPress={() => {
              setCalibrationMode('swing');
              setShowLandmarks(true);
            }} />
            <ToggleButton label="Moon Bed calibration" enabled={calibrationMode === 'moon-bed'} onPress={() => {
              setCalibrationMode('moon-bed');
              setShowLandmarks(true);
            }} />
            <ToggleButton label="Garden Arch calibration" enabled={calibrationMode === 'garden-arch'} onPress={() => {
              setCalibrationMode('garden-arch');
              setShowLandmarks(true);
            }} />
            <ToggleButton label="Pavilion calibration" enabled={calibrationMode === 'pavilion'} onPress={() => {
              setCalibrationMode('pavilion');
              setShowLandmarks(true);
            }} />
            <ToggleButton label="Tea Set calibration" enabled={calibrationMode === 'tea-set'} onPress={() => {
              setCalibrationMode('tea-set');
              setShowLandmarks(true);
            }} />
            <ToggleButton label="Legacy Waterfall calibration" enabled={calibrationMode === 'waterfall'} onPress={() => {
              setWaterfallVersion('legacy');
              setCalibrationMode('waterfall');
              setShowLandmarks(true);
            }} />
            <ToggleButton label="Legacy Water Top calibration" enabled={false} onPress={() => {
              setWaterfallVersion('legacy');
              setCalibrationMode('water-top');
              setShowLandmarks(true);
              setTopWaterAssemblyEnabled(true);
              setTopWaterMotionMode('static');
              setWaterTopPreset('all');
              setWaterTopFrontBankEnabled(true);
              focusWaterTopView();
            }} />
            <ToggleButton label="Impact calibration" enabled={false} onPress={() => {
              setWaterfallVersion('legacy');
              setCalibrationMode('impact');
              setShowLandmarks(true);
              focusImpactView();
            }} />
          </View>
          {/* 🌿 Production Flower Planting System DEV Controls */}
          <View style={[styles.controlRow, { alignItems: 'center', backgroundColor: '#ECFDF5', padding: 4, borderRadius: 6 }]}>
            <Text style={[styles.diagnosticText, { fontWeight: '700', color: '#065F46' }]}>Planting DEV:</Text>
            <ToggleButton label={`Growth V1.1 ${useMonthlyGrowth?'ON':'OFF'}`} enabled={useMonthlyGrowth}
              onPress={()=>setUseMonthlyGrowth(v=>!v)} />
            {useMonthlyGrowth && unresolvedGardenArt.length > 0 && <Text style={styles.diagnosticText}>
              Garden art unavailable: {unresolvedGardenArt.join(', ')} (DEV anchor markers)
            </Text>}
            <ToggleButton
              label={`Calibrate Regions ${(calibrationMode as string) === 'planting-regions' ? 'ON' : 'OFF'}`}
              enabled={(calibrationMode as string) === 'planting-regions'}
              onPress={() => {
                setCalibrationMode((prev) => (prev === 'planting-regions' ? 'land' : 'planting-regions'));
                if ((calibrationMode as string) !== 'planting-regions') {
                  focusCalMonth(selectedCalMonth);
                }
              }}
            />
            <ToggleButton
              label={`Regions ${showDevPlantingRegions ? 'ON' : 'OFF'}`}
              enabled={showDevPlantingRegions}
              onPress={() => setShowDevPlantingRegions((v) => !v)}
            />
            <ToggleButton
              label={`Footprints ${showDevFootprints ? 'ON' : 'OFF'}`}
              enabled={showDevFootprints}
              onPress={() => setShowDevFootprints((v) => !v)}
            />
            <ToggleButton
              label={`Hitboxes ${showDevHitboxes ? 'ON' : 'OFF'}`}
              enabled={showDevHitboxes}
              onPress={() => setShowDevHitboxes((v) => !v)}
            />
            <ToggleButton
              label={`Debug Info ${showPlacementDebug ? 'ON' : 'OFF'}`}
              enabled={showPlacementDebug}
              onPress={() => setShowPlacementDebug((v) => !v)}
            />
            <ToggleButton
              label="Plant Jan"
              enabled={false}
              onPress={() => {
                startPlanting({ flowerId: `dev-fl-${Date.now()}`, month: 1, flowerName: 'pink', mood: 'Peaceful' });
                focusCoords(MONTH_CENTROIDS[1].x, MONTH_CENTROIDS[1].y);
              }}
            />
            <ToggleButton
              label="Plant Jun"
              enabled={false}
              onPress={() => {
                startPlanting({ flowerId: `dev-fl-${Date.now()}`, month: 6, flowerName: 'sunflower', mood: 'Sunny' });
                focusCoords(MONTH_CENTROIDS[6].x, MONTH_CENTROIDS[6].y);
              }}
            />
            <ToggleButton
              label="Reset Flowers"
              enabled={false}
              onPress={resetAllPlacements}
            />
          </View>
          <View style={styles.controlRow}>
            <ToggleButton label={`Infrastructure ${infrastructureEnabled ? 'ON' : 'OFF'}`}
              enabled={infrastructureEnabled} onPress={() => setInfrastructureEnabled((value) => !value)} />
            <ToggleButton label={`Environment ${environmentEnabled ? 'ON' : 'OFF'}`}
              enabled={environmentEnabled} onPress={() => setEnvironmentEnabled((value) => !value)} />
            <ToggleButton label="Landmarks" enabled={showLandmarks} onPress={() => setShowLandmarks((value) => !value)} />
            <ToggleButton label="Diagnostics" enabled={showDiagnostics} onPress={() => setShowDiagnostics((value) => !value)} />
            <ToggleButton label="Reference" enabled={referenceOpacity > 0}
              onPress={() => setReferenceOpacity((value) => value > 0 ? 0 : 0.5)} />
          </View>
          <View style={styles.controlRow}>
            <ToggleButton
              label={`Water ${waterBaseVisible ? 'ON' : 'OFF'}`}
              enabled={waterBaseVisible}
              onPress={() => setWaterBaseVisible((v) => !v)}
            />
            <ToggleButton
              label={`Ripples ${waterRipplesVisible ? 'ON' : 'OFF'}`}
              enabled={waterRipplesVisible}
              onPress={() => setWaterRipplesVisible((v) => !v)}
            />
            <ToggleButton
              label={`Fish ${fishVisible ? 'ON' : 'OFF'}`}
              enabled={fishVisible}
              onPress={() => setFishVisible((v) => !v)}
            />
            <ToggleButton
              label={`Lotus ${lotusVisible ? 'ON' : 'OFF'}`}
              enabled={lotusVisible}
              onPress={() => setLotusVisible((v) => !v)}
            />
            <ToggleButton
              label={`Impact Overlay ${impactOverlayVisible ? 'ON' : 'OFF'}`}
              enabled={impactOverlayVisible}
              onPress={() => setImpactOverlayVisible((v) => !v)}
            />
            <ToggleButton
              label={`Impact Foam ${foamVisible ? 'ON' : 'OFF'}`}
              enabled={foamVisible}
              onPress={() => setFoamVisible((v) => !v)}
            />
          </View>
          <View style={styles.controlRow}>
            <ToggleButton
              label={`Legacy Source ${topWaterAssemblyEnabled ? 'ON' : 'OFF'}`}
              enabled={topWaterAssemblyEnabled}
              onPress={() => setTopWaterAssemblyEnabled((v) => !v)}
            />
            <ToggleButton label="Waterfall V2" enabled={waterfallVersion === 'v2'}
              onPress={() => { setWaterfallVersion('v2'); setShowLandmarks(true); }} />
            <ToggleButton label="Old Waterfall" enabled={waterfallVersion === 'legacy'}
              onPress={() => setWaterfallVersion('legacy')} />
            <ToggleButton label={`Waterfall Flow ${topWaterMotionMode === 'animate' ? 'ON' : 'OFF'}`}
              enabled={topWaterMotionMode === 'animate'}
              onPress={() => setTopWaterMotionMode(m => m === 'animate' ? 'static' : 'animate')} />
          </View>
          <View style={[styles.controlRow, { alignItems: 'center' }]}>
            <Text style={[styles.diagnosticText, { fontWeight: '700' }]}>Impact Water:</Text>
            {[
              { label: 'OFF', val: 0 },
              { label: 'NORMAL', val: 1.0 },
              { label: 'STRONG', val: 1.5 },
            ].map(({ label, val }) => (
              <ToggleButton
                key={`impact-water-${label}`}
                label={label}
                enabled={impactWaterStrength === val}
                onPress={() => setImpactWaterStrength(val)}
              />
            ))}
          </View>
          <View style={[styles.controlRow, { alignItems: 'center' }]}>
            <Text style={[styles.diagnosticText, { fontWeight: '700' }]}>Impact Underlay Debug:</Text>
            {(['off', 'current-z', 'top-z'] as const).map((mode) => (
              <ToggleButton
                key={`underlay-debug-${mode}`}
                label={mode === 'off' ? 'OFF' : mode === 'current-z' ? 'CURRENT Z' : 'TOP Z'}
                enabled={underlayDebugMode === mode}
                onPress={() => setUnderlayDebugMode(mode)}
              />
            ))}
          </View>
          <Text style={styles.diagnosticText}>
            Impact Water: {impactWaterStrength === 0 ? 'OFF' : impactWaterStrength === 1.0 ? 'NORMAL (1.0x)' : 'STRONG (1.5x)'} · Runtime: {runtimeUnderlayStrength}x
          </Text>
          {waterRipplesVisible && (
            <View style={styles.controlRow}>
              {[0.2, 0.35, 0.5, 0.7].map((opacity) => (
                <ToggleButton
                  key={`ripple-${opacity}`}
                  label={`Ripple ${Math.round(opacity * 100)}%`}
                  enabled={waterRippleOpacity === opacity}
                  onPress={() => setWaterRippleOpacity(opacity)}
                />
              ))}
            </View>
          )}
          <View style={styles.controlRow}>
            <ToggleButton label={`Moon Bed Integration ${moonBedIntegrationEnabled ? 'ON' : 'OFF'}`}
              enabled={moonBedIntegrationEnabled}
              onPress={() => setMoonBedIntegrationEnabled((value) => !value)} />
            {[0, 0.3, 0.5, 0.7].map((opacity) => (
              <ToggleButton key={`moon-shadow-${opacity}`} label={`Shadow ${opacity * 100}%`}
                enabled={moonBedShadowOpacity === opacity}
                onPress={() => setMoonBedShadowOpacity(opacity)} />
            ))}
          </View>
          <View style={styles.controlRow}>
            {[0, 0.3, 0.5, 0.7].map((opacity) => (
              <ToggleButton key={opacity} label={`${opacity * 100}%`}
                enabled={referenceOpacity === opacity} onPress={() => setReferenceOpacity(opacity)} />
            ))}
          </View>
          <View style={styles.controlRow}>
            {([
              ['auto', 'AUTO'],
              ['day', 'FORCE DAY'],
              ['evening', 'FORCE EVENING'],
              ['night', 'FORCE NIGHT'],
            ] as const).map(([override, label]) => (
              <ToggleButton key={override} label={label}
                enabled={worldTime.override === override}
                onPress={() => worldTime.setOverride(override as WorldTimeOverride)} />
            ))}
          </View>
          <Text style={styles.diagnosticText}>
            World Time: {worldTime.override === 'auto'
              ? 'AUTO'
              : `FORCE ${worldTime.override.toUpperCase()}`}
            {' → '}{worldTime.phase.toUpperCase()}
          </Text>
          {showDiagnostics && (
            <View pointerEvents="none">
              <Text style={styles.diagnosticText}>Reference: 1448×1086 → 2400×1800 · scale 1.65745856 · offset 0,0</Text>
              <Text style={styles.diagnosticText}>Landmark anchor: {String(treehousePlacement.x)},{String(treehousePlacement.y)} · scale {String(treehousePlacement.scale)} · viewport fit {fit.toFixed(4)}</Text>
              <Text style={styles.diagnosticText}>Swing anchor: {String(swingPlacement.x)},{String(swingPlacement.y)} · scale {String(swingPlacement.scale)} · rotation {String(swingPlacement.rotation)}°</Text>
              <Text style={styles.diagnosticText}>Moon Bed anchor: {String(moonBedPlacement.x)},{String(moonBedPlacement.y)} · scale {String(moonBedPlacement.scale)} · rotation {String(moonBedPlacement.rotation)}°</Text>
              <Text style={styles.diagnosticText}>Garden Arch anchor: {String(gardenArchPlacement.x)},{String(gardenArchPlacement.y)} · scale {String(gardenArchPlacement.scale)} · rotation {String(gardenArchPlacement.rotation)}°</Text>
              <Text style={styles.diagnosticText}>Pavilion anchor: {String(pavilionPlacement.x)},{String(pavilionPlacement.y)} · scale {String(pavilionPlacement.scale)} · rotation {String(pavilionPlacement.rotation)}°</Text>
              <Text style={styles.diagnosticText}>Tea Set anchor: {String(teaSetPlacement.x)},{String(teaSetPlacement.y)} · scale {String(teaSetPlacement.scale)} · rotation {String(teaSetPlacement.rotation)}°</Text>
              <Text style={styles.diagnosticText}>Waterfall impact: {String(waterfallImpactPlacement.x)},{String(waterfallImpactPlacement.y)} · size {String(waterfallImpactPlacement.width)}×{String(waterfallImpactPlacement.height)} · rot {String(waterfallImpactPlacement.rotation)}°</Text>
              <Text style={styles.diagnosticText}>{treehouseStatus}</Text>
            </View>
          )}
        </View>
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'bridge' && (
        <BridgeTestEditor placement={bridgePlacement} onChange={setBridgePlacement}
          debug={showBridgeDebug} onDebug={() => setShowBridgeDebug(v => !v)}
          walkPath={showBridgeWalkPath} onWalkPath={() => setShowBridgeWalkPath(v => !v)}
          onReset={() => {
            setBridgePlacement({ ...INITIAL_BRIDGE_TEST });
            setShowBridgeDebug(false);
            setShowBridgeWalkPath(false);
          }}
          onDone={() => { setCalibrationMode('land'); setPreviewMode(true); }} />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'land' && (
        <NativeLandCalibrationEditor
          layout={calibrationLayout}
          selectedId={selectedLandId}
          onSelect={setSelectedLandId}
          onNudge={(field, amount) => setCalibrationLayout((current) => current.map((land) =>
            land.id === selectedLandId
              ? { ...land, [field]: field === 'width' ? Math.max(1, land.width + amount) : land[field] + amount }
              : land))}
          onResetSelected={() => setCalibrationLayout((current) => current.map((land) => {
            const initial = GARDEN_LANDS.find((item) => item.id === selectedLandId);
            return land.id === selectedLandId && initial ? { ...initial } : land;
          }))}
          onResetAll={() => setCalibrationLayout(GARDEN_LANDS.map((land) => ({ ...land })))}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'treehouse' && (
        <TreehouseCalibrationEditor
          placement={treehousePlacement}
          onNudge={(field, amount) => setTreehousePlacement((current) => ({
            ...current,
            [field]: field === 'scale' ? Math.max(0.01, current.scale + amount) : current[field] + amount,
          }))}
          onReset={() => setTreehousePlacement({ ...CHECKED_IN_TREEHOUSE })}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'swing' && (
        <SwingCalibrationEditor
          placement={swingPlacement}
          onNudge={(field, amount) => setSwingPlacement((current) => ({
            ...current,
            [field]: field === 'scale' ? Math.max(0.01, current.scale + amount) : current[field] + amount,
          }))}
          onReset={() => setSwingPlacement({ ...CHECKED_IN_SWING })}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'moon-bed' && (
        <MoonBedMapCalibrationEditor
          placement={moonBedPlacement}
          onNudge={(field, amount) => setMoonBedPlacement((current) => ({
            ...current,
            [field]: field === 'scale' ? Math.max(0.01, current.scale + amount) : current[field] + amount,
          }))}
          onReset={() => setMoonBedPlacement({ ...CHECKED_IN_MOON_BED })}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'garden-arch' && (
        <StaticLandmarkCalibrationEditor
          title="Garden Arch"
          placement={gardenArchPlacement}
          exportPlacements={{ gardenArch: gardenArchPlacement, pavilion: pavilionPlacement }}
          onNudge={(field, amount) => setGardenArchPlacement((current) => ({
            ...current,
            [field]: field === 'scale' ? Math.max(0.01, current.scale + amount) : current[field] + amount,
          }))}
          onReset={() => setGardenArchPlacement({ ...CHECKED_IN_GARDEN_ARCH })}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'pavilion' && (
        <StaticLandmarkCalibrationEditor
          title="Pavilion"
          placement={pavilionPlacement}
          exportPlacements={{ gardenArch: gardenArchPlacement, pavilion: pavilionPlacement }}
          onNudge={(field, amount) => setPavilionPlacement((current) => ({
            ...current,
            [field]: field === 'scale' ? Math.max(0.01, current.scale + amount) : current[field] + amount,
          }))}
          onReset={() => setPavilionPlacement({ ...CHECKED_IN_PAVILION })}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'waterfall' && (
        <WaterfallMapCalibrationEditor
          placement={waterfallPlacement}
          referenceOpacity={waterfallReferenceOpacity}
          onReferenceOpacityChange={setWaterfallReferenceOpacity}
          onExit={() => setCalibrationMode('land')}
          onNudge={(field, amount) => setWaterfallPlacement((current) => ({
            ...current,
            [field]: Number((field === 'scale'
              ? Math.max(0.01, current.scale + amount)
              : field === 'scaleX' || field === 'scaleY'
                ? Math.max(0.9, Math.min(1.1, current[field]+amount)) : current[field] + amount).toFixed(6)),
          }))}
          onReset={() => setWaterfallPlacement({ ...INITIAL_WATERFALL_PLACEMENT })}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'tea-set' && (
        <TeaSetMapCalibrationEditor
          placement={teaSetPlacement}
          onNudge={(field, amount) => setTeaSetPlacement((current) => ({
            ...current,
            [field]: field === 'scale' ? Math.max(0.01, current.scale + amount) : current[field] + amount,
          }))}
          onReset={() => setTeaSetPlacement({ ...CHECKED_IN_TEA_SET })}
        />
      )}
      {__DEV__ && calibrationMode === 'impact' && (
        <WaterfallImpactCalibrationEditor
          placement={waterfallImpactPlacement}
          onDone={handleDoneImpactCalibration}
          onFocusImpact={focusImpactView}
          onNudge={(field, amount) => setWaterfallImpactPlacement((current) => ({
            ...current,
            [field]: Number((field === 'rotation' ? current[field] + amount : Math.max(1, current[field] + amount)).toFixed(2)),
          }))}
          onReset={() => setWaterfallImpactPlacement({ ...INITIAL_WATERFALL_IMPACT_PLACEMENT })}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'water-top' && (
        <WaterTopCalibrationEditor
          rawFinal
          placement={waterTopPlacement}
          motionMode={topWaterMotionMode}
          displayPreset={waterTopPreset}
          frontBankEnabled={waterTopFrontBankEnabled}
          onNudge={(field, amount) =>
            setWaterTopPlacement((current) => ({
              ...current,
              [field]:
                field === 'scale' || field === 'cliffScale' || field === 'bankScale'
                  ? Math.max(0.01, Number((current[field] + amount).toFixed(6)))
                  : Number((current[field] + amount).toFixed(6)),
            }))
          }
          onMotionModeChange={setTopWaterMotionMode}
          onDisplayPresetChange={(preset) => {
            setWaterTopPreset(preset);
            if (preset === 'bank' || preset === 'all') {
              setWaterTopFrontBankEnabled(true);
            } else if (preset === 'water-only' || preset === 'cliff') {
              setWaterTopFrontBankEnabled(false);
            }
          }}
          onFrontBankToggle={() => setWaterTopFrontBankEnabled((v) => !v)}
          onReset={() => setWaterTopPlacement({ ...INITIAL_WATER_TOP_PLACEMENT })}
          onExit={() => {
            setCalibrationMode('land');
            setPreviewMode(true);
            resetView();
          }}
        />
      )}
      {__DEV__ && perf.DebugUI && !previewMode && calibrationMode === 'planting-regions' && (
        calSubMode === 'mask-paint' ? (
          <ManualMaskPaintEditor
            selectedMonth={selectedCalMonth}
            tool={paintTool}
            brushSize={paintBrushSize}
            interactionMode={paintInteractionMode}
            maskOffset={maskOffset}
            isMovingMask={isMovingMask}
            onNudgeOffset={handleMaskOffsetNudge}
            opacity={paintOpacity}
            showBaseMask={showBaseMask}
            showAdditions={showAdditions}
            showErasures={showErasures}
            showFinalMask={showFinalMask}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            strokeCount={paintStrokes.length}
            onSelectMonth={(m) => {
              setSelectedCalMonth(m);
              focusCalMonth(m);
            }}
            onChangeTool={setPaintTool}
            onChangeBrushSize={setPaintBrushSize}
            onChangeInteractionMode={handleMaskInteractionMode}
            onChangeOpacity={setPaintOpacity}
            onToggleShowBaseMask={() => setShowBaseMask((v) => !v)}
            onToggleShowAdditions={() => setShowAdditions((v) => !v)}
            onToggleShowErasures={() => setShowErasures((v) => !v)}
            onToggleShowFinalMask={() => setShowFinalMask((v) => !v)}
            onUndo={handleUndoMask}
            onRedo={handleRedoMask}
            onClearUnsaved={handleClearUnsavedMask}
            onResetToLockedBase={handleResetMaskToLockedBase}
            onCancel={handleCancelMaskEdit}
            onSaveMask={handleSaveMask}
          />
        ) : (
          <PlantingRegionCalibrationEditor
            calibrationMap={plantingCalibrationMap}
            selectedMonth={selectedCalMonth}
            displayMode={calDisplayMode}
            opacity={calOpacity}
            dragMode={calDragMode}
            showLandBounds={showLandBounds}
            onSelectMonth={(m) => {
              setSelectedCalMonth(m);
              focusCalMonth(m);
            }}
            onChangeDisplayMode={setCalDisplayMode}
            onChangeOpacity={setCalOpacity}
            onChangeDragMode={setCalDragMode}
            onToggleLandBounds={() => setShowLandBounds((v) => !v)}
            onNudge={handleCalibrationNudge}
            onResetSelected={handleResetSelectedMonth}
            onResetAll={handleResetAllMonths}
            onSave={handleSaveCalibration}
            onDone={() => {
              setCalibrationMode('land');
              setPreviewMode(true);
            }}
            onOpenMaskEditor={() => setCalSubMode('mask-paint')}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, backgroundColor: GARDEN_WATER_COLOR },
  fairyAction: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#365b42', alignItems: 'center' },
  fairyActionText: { color: '#fff', fontSize: 14 },
  treehouseHint: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, alignItems: 'center',
    backgroundColor: '#FFF6E2F2', borderWidth: 1, borderColor: '#C9A44C' },
  treehouseHintText: { color: '#5A4630', fontSize: 13, fontWeight: '600' },
  treehouseHintHint: { color: '#8A7354', fontSize: 11, marginTop: 1 },
  treehouseHintTail: { width: 10, height: 10, marginTop: -6, transform: [{ rotate: '45deg' }], backgroundColor: '#FFF6E2F2',
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#C9A44C' },
  zoomButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#365b42', borderWidth: 1, borderColor: '#e3edda', alignItems: 'center', justifyContent: 'center' },
  zoomButtonText: { color: '#fff', fontSize: 25, lineHeight: 30 },
  controls: { position: 'absolute', top: 8, left: 8, right: 8, padding: 8, gap: 6, backgroundColor: '#FFFFFFE8' },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  controlButton: { minHeight: 32, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 6, backgroundColor: '#D8DDDA' },
  controlButtonEnabled: { backgroundColor: '#245B45' },
  controlButtonText: { color: '#172219', fontSize: 11, fontWeight: '600' },
  controlButtonTextEnabled: { color: '#FFFFFF' },
  diagnosticText: { color: '#172219', fontSize: 11 },
  floatingToggleButton: {
    position: 'absolute',
    top: 150,
    right: 154,
    backgroundColor: '#1E2B22E6',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: '#4A6B56',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  floatingToggleText: {
    color: '#E8F5EE',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

function ToggleButton({ label, enabled, onPress }: { label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: enabled }} onPress={onPress}
      style={[styles.controlButton, enabled && styles.controlButtonEnabled]}>
      <Text style={[styles.controlButtonText, enabled && styles.controlButtonTextEnabled]}>{label}</Text>
    </Pressable>
  );
}

function WaterfallImpactDebugShape({ placement }: { placement: WaterfallImpactPlacement }) {
  return (
    <Group
      transform={[
        { translateX: placement.x },
        { translateY: placement.y },
        { rotate: (placement.rotation * Math.PI) / 180 },
        { scaleX: placement.width / 110 },
        { scaleY: placement.height / 57 },
      ]}
    >
      {/* Obvious bright magenta diagnostic footprint */}
      <Rect
        x={-57}
        y={-18}
        width={145}
        height={54}
        color="#FF00FF"
        opacity={0.9}
      />
      {/* DEV crosshair at underlay rendered center (local 0,0 -> world 1040, 250) */}
      <Path
        path="M -60 0 L 60 0 M 0 -35 L 0 35"
        color="#00FFFF"
        style="stroke"
        strokeWidth={3}
      />
      <Circle cx={0} cy={0} r={5} color="#FFFFFF" />
      <Circle cx={0} cy={0} r={2} color="#000000" />
    </Group>
  );
}

const GardenScene = forwardRef<GardenSceneHandle,GardenSceneProps>(function GardenScene(props, ref) {
  const detailParams = useLocalSearchParams<{ ownerId?: string }>();
  return (
    <PlantingProvider gardenOwnerUserId={props.gardenOwnerUserId || detailParams.ownerId} session={props.session} backendMode={props.backendMode}>
      <GardenSceneContent {...props} interactionRef={ref} />
    </PlantingProvider>
  );
});
export default GardenScene;
