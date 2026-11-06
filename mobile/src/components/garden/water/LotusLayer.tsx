import LotusSurfaceRipples from './LotusSurfaceRipples';
import { useWaterTopFlow, type WaterTopFlow } from './WaterTopAssembly';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import {runtimeAudit} from '../performance/runtimeAudit';
import GardenLotusContact from './GardenLotusContact';
import { Group, Image, useImage, type SkImage, type Transforms3d } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import {
  cancelAnimation,
  useDerivedValue,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import {
  LOTUS_CLUSTER_ASSETS,
  type LotusClusterVariant,
} from './lotusClusterAssets';

// Maps source design coords (1448 x 1086) to garden world coords (2400 x 1800)
const S2W = 2400 / 1448;

export type LotusClusterPlacement = {
  id: string;
  variant: LotusClusterVariant;
  /** Center X in 2400 x 1800 world coordinates */
  x: number;
  /** Center Y in 2400 x 1800 world coordinates */
  y: number;
  /** Scale multiplier (default 1.0) */
  scale?: number;
  /** Rotation in radians (default 0) */
  rotation?: number;
  /** Asynchronous sway phase offset (0 to 2π) */
  swayPhase?: number;
  /** Sway cycle period in ms (delicate: 6000ms to 9000ms) */
  swayPeriod?: number;
  /** Region label for composition tracking */
  region: 'lower-left' | 'upper-right' | 'supporting';
};

/**
 * Curated Lotus Placements adhering strictly to structure-final-version.png:
 * 1. Main concentration: lower-left outer water surrounding island 10/11/12 and bottom-left shoreline.
 * 2. Secondary concentration: upper-right outer water around tea-set island 6 and island 7.
 * 3. Light supporting clusters: calm south-central pond & east lagoon inlet.
 * 4. Zero clusters in waterfall impact foam or turbulent wake.
 * 5. Central circulation channels near the pavilion and busy bridge crossings are kept clear and open.
 */
export const DEFAULT_LOTUS_PLACEMENTS: readonly LotusClusterPlacement[] = [
  // ─── Region 1: Lower-Left Outer Water (Main Calm Expanse) ───────────────────
  // Wide open water well below island 10/11/12 (clearance >95px to >999px from all land)
  {
    id: 'lotus-ll-1',
    variant: 'triple_a',
    x: 210,
    y: 1540,
    scale: 1.05,
    rotation: 0.12,
    swayPhase: 0.2,
    swayPeriod: 7200,
    region: 'lower-left',
  },
  {
    id: 'lotus-ll-2',
    variant: 'trio_b',
    x: 380,
    y: 1580,
    scale: 0.95,
    rotation: -0.15,
    swayPhase: 1.8,
    swayPeriod: 7800,
    region: 'lower-left',
  },
  {
    id: 'lotus-ll-3',
    variant: 'wide_a',
    x: 200,
    y: 1400,
    scale: 1.0,
    rotation: 0.25,
    swayPhase: 3.1,
    swayPeriod: 6900,
    region: 'lower-left',
  },
  {
    id: 'lotus-ll-4',
    variant: 'single_a',
    x: 300,
    y: 1480,
    scale: 1.1,
    rotation: -0.3,
    swayPhase: 4.4,
    swayPeriod: 8100,
    region: 'lower-left',
  },
  {
    id: 'lotus-ll-5',
    variant: 'single_b',
    x: 240,
    y: 1650,
    scale: 1.0,
    rotation: 0.4,
    swayPhase: 2.5,
    swayPeriod: 7100,
    region: 'lower-left',
  },
  {
    id: 'lotus-ll-6',
    variant: 'dual_a',
    x: 480,
    y: 1630,
    scale: 0.9,
    rotation: -0.2,
    swayPhase: 5.2,
    swayPeriod: 8400,
    region: 'lower-left',
  },
  {
    id: 'lotus-ll-7',
    variant: 'single_a',
    x: 130,
    y: 1470,
    scale: 0.85,
    rotation: 0.1,
    swayPhase: 1.1,
    swayPeriod: 6600,
    region: 'lower-left',
  },

  // ─── Region 2: Upper-Right Outer Water (Northeast Open Bay) ─────────────────
  // Open water outside island 06 and 07 (clearance >46px to >113px from all land)
  {
    id: 'lotus-ur-1',
    variant: 'pair_a',
    x: 2080,
    y: 150,
    scale: 0.95,
    rotation: -0.1,
    swayPhase: 0.6,
    swayPeriod: 7400,
    region: 'upper-right',
  },
  {
    id: 'lotus-ur-2',
    variant: 'dual_a',
    x: 2210,
    y: 180,
    scale: 0.9,
    rotation: 0.18,
    swayPhase: 2.2,
    swayPeriod: 8000,
    region: 'upper-right',
  },
  {
    id: 'lotus-ur-3',
    variant: 'single_b',
    x: 2270,
    y: 260,
    scale: 0.95,
    rotation: -0.25,
    swayPhase: 3.7,
    swayPeriod: 7000,
    region: 'upper-right',
  },
  {
    id: 'lotus-ur-4',
    variant: 'single_a',
    x: 2290,
    y: 350,
    scale: 0.85,
    rotation: 0.15,
    swayPhase: 4.9,
    swayPeriod: 7600,
    region: 'upper-right',
  },

  // ─── Region 3: South & Southeast Calm Supporting Open Water ─────────────────
  // Wide open south water well away from island 08 and island 09 (clearance >85px to >999px)
  {
    id: 'lotus-sp-1',
    variant: 'large_a',
    x: 750,
    y: 1620,
    scale: 0.9,
    rotation: 0.08,
    swayPhase: 0.4,
    swayPeriod: 7700,
    region: 'supporting',
  },
  {
    id: 'lotus-sp-2',
    variant: 'single_b',
    x: 640,
    y: 1580,
    scale: 1.0,
    rotation: -0.15,
    swayPhase: 2.8,
    swayPeriod: 7300,
    region: 'supporting',
  },
  {
    id: 'lotus-sp-3',
    variant: 'trio_b',
    x: 1850,
    y: 1660,
    scale: 0.9,
    rotation: 0.2,
    swayPhase: 4.1,
    swayPeriod: 8200,
    region: 'supporting',
  },
  {
    id: 'lotus-sp-4',
    variant: 'single_a',
    x: 1980,
    y: 1670,
    scale: 0.85,
    rotation: -0.3,
    swayPhase: 1.7,
    swayPeriod: 6800,
    region: 'supporting',
  },
] as const;

// The otter consumes the SAME image and UI-thread transform as the visible
// cluster. No duplicate sway animation or second copy of the plant is drawn.
export type LotusOccluder = {
  id: string;
  image: SkImage;
  transform: DerivedValue<Transforms3d>;
  width: number;
  height: number;
  opacity: number;
};
export type LotusOccluderListener = (id: string, occluder: LotusOccluder | null) => void;

type LotusClusterItemProps = {
  seconds: SharedValue<number>;
  placement: LotusClusterPlacement;
  mode: 'static' | 'sway';
  opacity: number;
  active: boolean;
  onOccluder?: LotusOccluderListener;
};

const LotusClusterItem = memo(function LotusClusterItem({
  seconds,
  placement,
  mode,
  opacity,
  active,
  onOccluder,
}: LotusClusterItemProps) {
  const asset = LOTUS_CLUSTER_ASSETS[placement.variant];
  const staticImg = useImage(asset.static);

  const reducedMotion = useReducedMotion();
  const swayPhaseVal = useSharedValue(placement.swayPhase ?? 0);

  useEffect(() => {
    cancelAnimation(swayPhaseVal);
    if (active && mode === 'sway' && !reducedMotion) {
      const period = placement.swayPeriod ?? 7500;
      swayPhaseVal.value = withRepeat(
        withTiming((placement.swayPhase ?? 0) + 2 * Math.PI, {
          duration: period,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    }
    return () => {
      cancelAnimation(swayPhaseVal);
    };
  }, [active, mode, reducedMotion, placement.swayPeriod, placement.swayPhase, swayPhaseVal]);

  // Cluster dimensions scaled to world space
  const baseScale = placement.scale ?? 1.0;
  const worldW = asset.width * S2W * baseScale;
  const worldH = asset.height * S2W * baseScale;

  // Transform anchoring the cluster firmly at world (x, y) with delicate micro-sway
  // Rotation: ±1.4° (0.025 rad) around center
  // Micro-offset: max ±0.6px, imperceptible wander, zero drifting or sliding
  // Single crisp image, zero ghosting/afterimages
  const clusterTransform = useDerivedValue<Transforms3d>(() => {
    const baseRot = placement.rotation ?? 0;
    if (mode === 'static' || reducedMotion || !active) {
      return [
        { translateX: placement.x },
        { translateY: placement.y },
        { rotate: baseRot },
        { translateX: -worldW / 2 },
        { translateY: -worldH / 2 },
      ];
    }
    const ph = swayPhaseVal.value;
    const dRot = 0.025 * Math.sin(ph);
    const dx = 0.6 * Math.cos(ph);
    const dy = 0.5 * Math.sin(ph * 0.8);
    return [
      { translateX: placement.x + dx },
      { translateY: placement.y + dy },
      { rotate: baseRot + dRot },
      { translateX: -worldW / 2 },
      { translateY: -worldH / 2 },
    ];
  }, [mode, reducedMotion, active, placement.x, placement.y, placement.rotation, worldW, worldH]);

  useEffect(() => {
    if (!staticImg || !onOccluder) return;
    onOccluder(placement.id, { id: placement.id, image: staticImg, transform: clusterTransform,
      width: worldW, height: worldH, opacity });
    return () => onOccluder(placement.id, null);
  }, [onOccluder, placement.id, staticImg, clusterTransform, worldW, worldH, opacity]);

  if (!staticImg) return null;

  return (
    <Group transform={clusterTransform}>
      <GardenLotusContact image={staticImg} width={worldW} height={worldH} opacity={opacity} />
      <LotusSurfaceRipples image={staticImg} width={worldW} height={worldH}
        seconds={seconds} seed={placement.swayPhase ?? 0} opacity={opacity} />
      <Image
        image={staticImg}
        x={0}
        y={0}
        width={worldW}
        height={worldH}
        opacity={opacity}
        fit="fill"
      />
    </Group>
  );
});

export type LotusRenderMode = 'static' | 'sway';

export type LotusLayerProps = {
  flow?: WaterTopFlow;
  visible?: boolean;
  opacity?: number;
  mode?: LotusRenderMode;
  active?: boolean;
  placements?: readonly LotusClusterPlacement[];
  onOccluder?: LotusOccluderListener;
};

export default function LotusLayer({
  visible = true,
  opacity = 1.0,
  mode = 'sway',
  active = true,
  placements = DEFAULT_LOTUS_PLACEMENTS,
  flow: sharedFlow,
  onOccluder,
}: LotusLayerProps) {
  runtimeAudit.render('LotusLayer');
  const standalone = useWaterTopFlow(active && visible && !sharedFlow, mode === 'sway' && !sharedFlow);
  const flow = sharedFlow ?? standalone;
  const rippleSeconds = useSharedValue(0);
  const previous = useSharedValue(flow.seconds.value);
  // Follow the existing scene clock; preserve the local phase during a pause.
  useAnimatedReaction(() => flow.seconds.value, seconds => {
    const elapsed = Math.max(0, seconds - previous.value);
    previous.value = seconds;
    if (active && visible && mode === 'sway' && flow.enabled) rippleSeconds.value += elapsed;
  }, [flow.seconds, flow.enabled, active, visible, mode]);
  if (!visible || opacity <= 0) return null;

  return (
    <Group>
      {placements.map((p) => (
        <LotusClusterItem
          key={p.id}
          seconds={rippleSeconds}
          placement={p}
          onOccluder={onOccluder}
          mode={mode}
          opacity={opacity}
          active={active}
        />
      ))}
    </Group>
  );
}
