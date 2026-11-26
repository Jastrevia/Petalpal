import { Blur, Group, Image, Path, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { WATER_ASSETS } from './waterAssets';

// World-space bounds:
// source_water_base: [x: 880, y: -120, width: 300, height: 200]
export const SOURCE_WATER_BASE_BOUNDS = { x: 880, y: -120, width: 300, height: 200 } as const;

// source_env_static: [x: 760, y: -120, width: 600, height: 280]
export const SOURCE_ENV_STATIC_BOUNDS = { x: 760, y: -120, width: 600, height: 280 } as const;

// source_flow_overlay: [x: 900, y: -100, width: 260, height: 176]
export const SOURCE_FLOW_OVERLAY_BOUNDS = { x: 900, y: -100, width: 260, height: 176 } as const;

const FLOW_CYCLE_MS = 4200;
const STAGGERED_PHASES = [0.0, 0.33, 0.67] as const;

export type WaterfallSourceWaterLayerProps = {
  active?: boolean;
};

// --------------------------------------------------------------------------
// 1. source_water_base: WORLD-SPACE static source-water body
// --------------------------------------------------------------------------
export function WaterfallSourceWaterBase({ active = true }: WaterfallSourceWaterLayerProps) {
  const image = useImage(WATER_ASSETS.sourceWaterBase);
  if (!active || !image) return null;

  return (
    <Image
      image={image}
      x={SOURCE_WATER_BASE_BOUNDS.x}
      y={SOURCE_WATER_BASE_BOUNDS.y}
      width={SOURCE_WATER_BASE_BOUNDS.width}
      height={SOURCE_WATER_BASE_BOUNDS.height}
      fit="fill"
    />
  );
}

// --------------------------------------------------------------------------
// 2. Animated Flow Highlights & Ripples (source_flow_overlay)
// Motion direction: off-screen upstream (x≈1015, y≈-100) -> mouth (x≈1028, y≈72)
// --------------------------------------------------------------------------
function FlowStreakPulse({
  clock,
  phase,
}: {
  clock: SharedValue<number>;
  phase: number;
}) {
  // Travel from y = -90 (off-screen) to y = 72 (waterfall lip)
  const transform = useDerivedValue(() => {
    const p = (clock.value + phase) % 1;
    // Natural easing: slightly faster as it nears the drop
    const eased = p * (0.85 + 0.15 * p);
    // River center curve in world coords:
    // At y = -90: x ~ 1015; at y = -10: x ~ 1020; at y = 72: x ~ 1028
    const curX = 1015 + 13 * eased;
    const curY = -90 + 162 * eased;
    // Scale narrows as river converges into the throat
    const scaleX = 1.3 - 0.75 * eased;
    const scaleY = 0.8 + 0.4 * eased;
    return [{ translateX: curX }, { translateY: curY }, { scaleX }, { scaleY }];
  });

  // Soft Hermite entrance from off-screen, peak mid-river, gentle dissolve at lip
  const opacity = useDerivedValue(() => {
    const p = (clock.value + phase) % 1;
    const enter = Math.min(1, p / 0.16);
    const exitFade = Math.max(0, 1 - (p - 0.72) / 0.28);
    return enter * enter * (3 - 2 * enter) * exitFade * 0.42;
  });

  return (
    <Group transform={transform} opacity={opacity}>
      {/* Soft directional flow streak */}
      <Path
        path="M -30 -4 C -15 -8 15 -8 30 -4 C 18 0 -18 0 -30 -4 Z"
        color="#84D1D8"
        opacity={0.65}
      >
        <Blur blur={3.0} />
      </Path>
      {/* Luminous crest wisp */}
      <Path
        path="M -18 -2 C -8 -5 8 -5 18 -2"
        color="#DDF5F8"
        style="stroke"
        strokeWidth={1.8}
        strokeCap="round"
        opacity={0.85}
      >
        <Blur blur={1.2} />
      </Path>
    </Group>
  );
}

function ConvergingRipplePulse({
  clock,
  phase,
  xOffset = 0,
}: {
  clock: SharedValue<number>;
  phase: number;
  xOffset?: number;
}) {
  const transform = useDerivedValue(() => {
    const p = (clock.value + phase) % 1;
    const eased = p * (0.8 + 0.2 * p);
    const curX = 1015 + 13 * eased + xOffset * (1 - eased);
    const curY = -80 + 152 * eased;
    const s = 1.2 - 0.65 * eased;
    return [{ translateX: curX }, { translateY: curY }, { scaleX: s }];
  });

  const opacity = useDerivedValue(() => {
    const p = (clock.value + phase) % 1;
    const enter = Math.min(1, p / 0.14);
    const decay = Math.max(0, 1 - (p - 0.70) / 0.30);
    return enter * decay * 0.35;
  });

  return (
    <Group transform={transform} opacity={opacity}>
      <Path
        path="M -22 0 C -8 -3 8 -3 22 0"
        color="#9DDEE3"
        style="stroke"
        strokeWidth={1.5}
        strokeCap="round"
      >
        <Blur blur={1.0} />
      </Path>
    </Group>
  );
}

// Subtle stationary shimmer breathing at the waterfall lip
function LipThresholdGlow({ clock }: { clock: SharedValue<number> }) {
  const glowOp = useDerivedValue(() => {
    const wave = Math.sin(clock.value * 2 * Math.PI);
    return 0.22 + 0.12 * wave;
  });

  return (
    <Group transform={[{ translateX: 1028 }, { translateY: 72 }]} opacity={glowOp}>
      <Path
        path="M -24 -2 C -10 -5 10 -5 24 -2 C 14 3 -14 3 -24 -2 Z"
        color="#DDF5F8"
      >
        <Blur blur={2.2} />
      </Path>
    </Group>
  );
}

// --------------------------------------------------------------------------
// 3. source_env_static + source_flow_overlay: WORLD-SPACE Environment Overlay
// Frames the top cut edges of WaterfallEntity with painterly rocks, cliffs, and banks,
// and hosts the gentle animated surface highlights flowing into the mouth.
// --------------------------------------------------------------------------
export function WaterfallSourceEnvironment({ active = true }: WaterfallSourceWaterLayerProps) {
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const clock = useSharedValue(0.1);
  const envImage = useImage(WATER_ASSETS.sourceEnvStatic);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(clock);
    if (active && foreground && !reduced) {
      clock.value = 0.1;
      clock.value = withRepeat(
        withTiming(1.1, { duration: FLOW_CYCLE_MS, easing: Easing.linear }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(clock);
  }, [active, foreground, reduced, clock]);

  if (!active || !envImage) return null;

  return (
    <Group>
      {/* 1. source_env_static: static painterly rocks, cliffs, and banks */}
      <Image
        image={envImage}
        x={SOURCE_ENV_STATIC_BOUNDS.x}
        y={SOURCE_ENV_STATIC_BOUNDS.y}
        width={SOURCE_ENV_STATIC_BOUNDS.width}
        height={SOURCE_ENV_STATIC_BOUNDS.height}
        fit="fill"
      />

      {/* 2. source_flow_overlay: gentle directional highlights & ripples */}
      {STAGGERED_PHASES.map((phase, i) => (
        <FlowStreakPulse key={`flow-streak-${i}`} clock={clock} phase={phase} />
      ))}
      <ConvergingRipplePulse clock={clock} phase={0.12} xOffset={-8} />
      <ConvergingRipplePulse clock={clock} phase={0.45} xOffset={6} />
      <ConvergingRipplePulse clock={clock} phase={0.78} xOffset={-4} />

      {/* 3. Soft living shimmer at the waterfall lip threshold */}
      <LipThresholdGlow clock={clock} />
    </Group>
  );
}

export default memo(WaterfallSourceEnvironment);
