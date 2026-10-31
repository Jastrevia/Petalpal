import {
  Blur, Circle, ColorMatrix, Group, Image, RadialGradient, useImage,
} from '@shopify/react-native-skia';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// The approved composite defines the landmark's local design space. Production
// exports have differing transparent-canvas sizes, so every static layer is
// registered to this common destination rect without cropping.
export const SWING_WIDTH = 1312;
export const SWING_HEIGHT = 1199;

// Future swing motion rotates the complete suspended assembly around this point.
// The seat anchor is local to that same future motion group, between back/front art.
export const SWING_PIVOT_X = 642;
export const SWING_PIVOT_Y = 268;
export const FAIRY_SEAT_ANCHOR_X = 653;
export const FAIRY_SEAT_ANCHOR_Y = 740;
export const SWING_IDLE_HALF_CYCLE_MS = 4200;
export type RibbonMotionStrength = 'soft' | 'medium' | 'strong';
const HANGING_DECOR_PIVOT = { x: 650, y: 205 };
// Derived from the glass regions in lanterns.png after applying its approved
// registration (x: 80, y: 60, scale: 0.834) into Swing design coordinates.
export const LEFT_LANTERN_LIGHT = { x: 220, y: 581 };
export const RIGHT_LANTERN_LIGHT = { x: 1110, y: 447 };
export const LEFT_ARCH_LIGHT = { x: 220, y: 550 };
export const RIGHT_ARCH_LIGHT = { x: 1110, y: 425 };
export const LEFT_GROUND_LIGHT = { x: 225, y: 1015 };
export const RIGHT_GROUND_LIGHT = { x: 1115, y: 1015 };
// Glass-only contours in the registered Swing design space. Re-rendering the
// lantern pixels inside these clips preserves their painted texture and metalwork.
export const LEFT_LANTERN_GLASS = 'M 184 530 L 257 530 L 257 632 L 184 635 Z';
export const RIGHT_LANTERN_GLASS = 'M 1060 394 L 1156 394 L 1156 498 L 1060 500 Z';
const LANTERN_LIGHT_MATRIX = [
  1.1, 0, 0, 0, 0,
  0, 0.65, 0, 0, 0,
  0, 0, 0.15, 0, 0,
  0, 0, 0, 1, 0,
];

export function getTransformedFairySeatAnchor(angleDegrees: number) {
  const radians = angleDegrees * Math.PI / 180;
  const dx = FAIRY_SEAT_ANCHOR_X - SWING_PIVOT_X;
  const dy = FAIRY_SEAT_ANCHOR_Y - SWING_PIVOT_Y;
  return {
    x: SWING_PIVOT_X + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: SWING_PIVOT_Y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export const SWING_LAYER_NAMES = [
  'lantern-glow',
  'frame-static',
  'hanging-decor',
  'lanterns',
  'swing-moving-back',
  'fairy-slot',
  'swing-moving-front',
  'foreground-overlay',
] as const;

export type SwingLayerName = typeof SWING_LAYER_NAMES[number];
export type SwingDebugMode = 'all' | 'seat-only' | SwingLayerName;

export type SwingSeatCalibration = {
  movingBack: { x: number; y: number; scale: number };
  movingFront: { x: number; y: number; scale: number };
  movingGroup: { xOffset: number; yOffset: number };
};

type LoadedImage = ReturnType<typeof useImage>;

function useProductionImage(source: number) {
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((reason: Error) => {
    if (__DEV__) setError(reason.message);
  }, []);
  const image = useImage(source, onError);
  return { image, error };
}

export type SwingEntityProps = {
  x?: number;
  y?: number;
  scale?: number;
  debugMode?: SwingDebugMode;
  showAnchor?: boolean;
  showPivot?: boolean;
  onDebugStatus?: (status: string) => void;
  animationEnabled?: boolean;
  swingAmplitudeDegrees?: number;
  fairy?: ReactNode;
  seatCalibration?: SwingSeatCalibration;
  ribbonAnimationEnabled?: boolean;
  ribbonMotionStrength?: RibbonMotionStrength;
  lanternLightingEnabled?: boolean;
  occupied?: boolean;
};

function useRibbonWind(
  enabled: boolean,
  duration: number,
  phaseOffset: number,
  degrees: number,
  driftX: number,
) {
  const phase = useSharedValue(phaseOffset);
  useEffect(() => {
    cancelAnimation(phase);
    phase.value = phaseOffset;
    if (enabled) {
      phase.value = withRepeat(withTiming(phaseOffset + 2 * Math.PI, {
        duration,
        easing: Easing.linear,
      }), -1, false);
    }
    return () => cancelAnimation(phase);
  }, [duration, enabled, phase, phaseOffset]);
  return useDerivedValue(() => {
    const wind = enabled ? Math.sin(phase.value) : 0;
    return [
      { translateX: wind * driftX },
      { rotate: wind * degrees * Math.PI / 180 },
    ];
  }, [degrees, driftX, enabled]);
}

type LayerProps = {
  image: LoadedImage;
  name: SwingLayerName;
  mode: SwingDebugMode;
  placement?: { x: number; y: number; scale: number };
};

// Uniform source-to-master registrations. Source pixels retain their aspect;
// differing export canvases are never stretched to the master rectangle.
export const SWING_LAYER_REGISTRATION = {
  'lantern-glow': { sourceWidth: 1312, sourceHeight: 1199, scale: 1, x: 0, y: 0 },
  'frame-static': { sourceWidth: 1430, sourceHeight: 1100, scale: 1.068, x: -112, y: 35 },
  'hanging-decor': { sourceWidth: 1368, sourceHeight: 1150, scale: 0.935, x: 15, y: 70 },
  lanterns: { sourceWidth: 1402, sourceHeight: 1122, scale: 0.834, x: 80, y: 60 },
  'swing-moving-back': { sourceWidth: 1308, sourceHeight: 1202, scale: 0.525, x: 289, y: 260 },
  'swing-moving-front': { sourceWidth: 1495, sourceHeight: 1052, scale: 0.36, x: 350, y: 569 },
  'foreground-overlay': { sourceWidth: 1402, sourceHeight: 1122, scale: 0.814, x: 123, y: 237 },
} as const;

function RegisteredLayer({ image, name, mode, placement }: LayerProps) {
  const visible = mode === 'all' || mode === name
    || (mode === 'seat-only' && (name === 'swing-moving-back' || name === 'swing-moving-front'));
  if (!image || !visible) return null;
  if (name === 'fairy-slot') return null;
  const checkedIn = SWING_LAYER_REGISTRATION[name];
  const registration = placement
    ? { ...checkedIn, ...placement }
    : checkedIn;
  const rect = {
    x: registration.x,
    y: registration.y,
    width: registration.sourceWidth * registration.scale,
    height: registration.sourceHeight * registration.scale,
  };
  return <Image image={image} {...rect} fit="fill" />;
}

function ProceduralLanternOuterGlow({ x, y }: { x: number; y: number }) {
  return (
    <Group blendMode="screen">
      <Circle cx={x} cy={y} r={86}>
        <RadialGradient c={{ x, y }} r={86}
          colors={['rgba(255, 208, 124, 0.24)', 'rgba(242, 177, 78, 0.10)', 'rgba(242, 177, 78, 0)']}
          positions={[0, 0.44, 1]} />
        <Blur blur={10} />
      </Circle>
    </Group>
  );
}

function ProceduralGroundGlow({ x, y }: { x: number; y: number }) {
  return (
    <Group transform={[{ scaleY: 0.33 }]} origin={{ x, y }}>
      <Circle cx={x} cy={y} r={120}>
        <RadialGradient c={{ x, y }} r={120}
          colors={['rgba(255, 200, 120, 0.22)', 'rgba(242, 168, 72, 0.08)', 'rgba(242, 168, 72, 0)']}
          positions={[0, 0.5, 1]} />
        <Blur blur={14} />
      </Circle>
    </Group>
  );
}

function ProceduralArchGlow({ x, y }: { x: number; y: number }) {
  return (
    <Circle cx={x} cy={y} r={165}>
      <RadialGradient c={{ x, y }} r={165}
        colors={['rgba(255, 200, 120, 0.20)', 'rgba(245, 175, 75, 0.07)', 'rgba(240, 160, 60, 0)']}
        positions={[0, 0.45, 1]} />
      <Blur blur={20} />
    </Circle>
  );
}

function ProceduralLanternHalo({ x, y }: { x: number; y: number }) {
  return (
    <Circle cx={x} cy={y} r={95}>
      <RadialGradient c={{ x, y }} r={95}
        colors={[
          'rgba(255, 208, 124, 0.45)',
          'rgba(255, 185, 85, 0.20)',
          'rgba(242, 165, 65, 0.05)',
          'rgba(242, 165, 65, 0)',
        ]}
        positions={[0, 0.35, 0.70, 1]} />
      <Blur blur={10} />
    </Circle>
  );
}

function ProceduralLanternCore({ x, y, r = 44 }: { x: number; y: number; r?: number }) {
  return (
    <Circle cx={x} cy={y} r={r}>
      <RadialGradient c={{ x, y }} r={r}
        colors={[
          '#FFF5DC',
          '#FFC878',
          'rgba(255, 175, 65, 0.25)',
          'rgba(255, 175, 65, 0)',
        ]}
        positions={[0, 0.35, 0.75, 1]} />
      <Blur blur={5} />
    </Circle>
  );
}

function ProceduralLanternInnerLight({
  image, clip,
}: { image: LoadedImage; clip: string }) {
  if (!image) return null;
  const registration = SWING_LAYER_REGISTRATION.lanterns;
  return (
    <Group clip={clip}>
      <Image image={image} x={registration.x} y={registration.y}
        width={registration.sourceWidth * registration.scale}
        height={registration.sourceHeight * registration.scale}
        fit="fill" blendMode="screen" opacity={0.76}>
        <ColorMatrix matrix={LANTERN_LIGHT_MATRIX} />
      </Image>
    </Group>
  );
}

/** Embeddable Skia drawing node. The owning screen/scene supplies the Canvas. */
export default function SwingEntity({
  x = 0,
  y = 0,
  scale = 1,
  debugMode = 'all',
  showAnchor = false,
  showPivot = false,
  onDebugStatus,
  animationEnabled = false,
  swingAmplitudeDegrees = 4,
  fairy,
  seatCalibration,
  ribbonAnimationEnabled = false,
  ribbonMotionStrength = 'soft',
  lanternLightingEnabled = false,
  occupied = false,
}: SwingEntityProps) {
  const reducedMotion = useReducedMotion();
  const seatAnimationAllowed = animationEnabled && !reducedMotion;
  const seatMotionRequested = seatAnimationAllowed && occupied;
  const swingPhase = useSharedValue(0);
  const swingEnvelope = useSharedValue(0);
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    cancelAnimation(swingEnvelope);
    if (seatMotionRequested) {
      cancelAnimation(swingPhase);
      swingPhase.value = 0;
      swingEnvelope.value = 0;
      swingPhase.value = withRepeat(withTiming(2 * Math.PI, {
        duration: SWING_IDLE_HALF_CYCLE_MS * 2,
        easing: Easing.linear,
      }), -1, false);
      swingEnvelope.value = withTiming(1, {
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
      });
    } else {
      // Keep the phase moving briefly while its amplitude decays, then stop at rest.
      swingEnvelope.value = withTiming(0, {
        duration: 1200,
        easing: Easing.out(Easing.cubic),
      });
      settleTimer = setTimeout(() => {
        cancelAnimation(swingPhase);
        swingPhase.value = 0;
      }, 1250);
    }
    return () => {
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [seatMotionRequested, swingEnvelope, swingPhase]);

  useEffect(() => () => {
    cancelAnimation(swingPhase);
    cancelAnimation(swingEnvelope);
  }, [swingEnvelope, swingPhase]);

  const swingTransform = useDerivedValue(() => [{
    rotate: Math.sin(swingPhase.value) * swingAmplitudeDegrees
      * swingEnvelope.value * Math.PI / 180,
  }], [swingAmplitudeDegrees]);
  const ribbonEnabled = ribbonAnimationEnabled && !reducedMotion;
  const ribbonMultiplier = ribbonMotionStrength === 'soft'
    ? 1
    : ribbonMotionStrength === 'strong' ? 1.5 : 1.25;
  const hangingDecorTransform = useRibbonWind(
    ribbonEnabled, 9200, 1.7, 0.7 * ribbonMultiplier, 0.15 * ribbonMultiplier,
  );
  const lanternGlowOpacity = useSharedValue(lanternLightingEnabled ? 1 : 0);
  useEffect(() => {
    lanternGlowOpacity.value = withTiming(lanternLightingEnabled ? 1 : 0, {
      duration: reducedMotion ? 0 : lanternLightingEnabled ? 1200 : 900,
      easing: Easing.inOut(Easing.ease),
    });
  }, [lanternGlowOpacity, lanternLightingEnabled, reducedMotion]);

  const lightBreathPhase = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(lightBreathPhase);
    lightBreathPhase.value = 0;
    if (lanternLightingEnabled && !reducedMotion) {
      lightBreathPhase.value = withRepeat(
        withTiming(2 * Math.PI, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
        -1,
        false,
      );
    }
    return () => cancelAnimation(lightBreathPhase);
  }, [lanternLightingEnabled, lightBreathPhase, reducedMotion]);

  const effectiveGlowOpacity = useDerivedValue(() => {
    if (lanternGlowOpacity.value <= 0.001) return 0;
    const breath = 0.97 + 0.03 * Math.sin(lightBreathPhase.value);
    return lanternGlowOpacity.value * breath;
  });

  const frame = useProductionImage(require('@/assets/garden/landmarks/swing/frame-static.png'));
  const decor = useProductionImage(require('@/assets/garden/landmarks/swing/hanging-decor.png'));
  const lanterns = useProductionImage(require('@/assets/garden/landmarks/swing/lanterns.png'));
  const movingBack = useProductionImage(require('@/assets/garden/landmarks/swing/swing-moving-back.png'));
  const movingFront = useProductionImage(require('@/assets/garden/landmarks/swing/swing-moving-front.png'));
  const foreground = useProductionImage(require('@/assets/garden/landmarks/swing/foreground-overlay.png'));
  const layers = [frame, decor, lanterns, movingBack, movingFront, foreground];
  const names = SWING_LAYER_NAMES.filter((name) =>
    name !== 'fairy-slot' && name !== 'lantern-glow');
  const mode = __DEV__ ? debugMode : 'all';
  const movingBackPlacement = seatCalibration?.movingBack;
  const movingFrontPlacement = seatCalibration?.movingFront;
  const movingGroup = seatCalibration?.movingGroup ?? { xOffset: 0, yOffset: 0 };
  const status = __DEV__
    ? [`lantern-glow: procedural ${lanternLightingEnabled ? 'ON' : 'OFF'}`,
      ...layers.map(({ image, error }, index) => `${names[index]}: ${image
      ? `loaded ${image.width()} × ${image.height()}`
      : error ? `ERROR: ${error}` : 'loading / not decoded'}`)].join('\n')
    : '';

  useEffect(() => {
    if (__DEV__) onDebugStatus?.(status);
  }, [onDebugStatus, status]);

  if (mode === 'all' && layers.some(({ image }) => !image)) return null;

  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
      {(mode === 'all' || mode === 'lantern-glow') && (
        <Group opacity={effectiveGlowOpacity}>
          <ProceduralLanternOuterGlow {...LEFT_LANTERN_LIGHT} />
          <ProceduralLanternOuterGlow {...RIGHT_LANTERN_LIGHT} />
        </Group>
      )}

      {/* The complete pendulum sits behind the frame so the upper branch
          naturally occludes the rope attachment area. */}
      <Group origin={{ x: SWING_PIVOT_X, y: SWING_PIVOT_Y }} transform={swingTransform}>
        <Group transform={[
          { translateX: movingGroup.xOffset },
          { translateY: movingGroup.yOffset },
        ]}>
          <RegisteredLayer image={movingBack.image} name="swing-moving-back" mode={mode}
            placement={movingBackPlacement} />
          {/* Reserved fairy render slot: behind the front rail, above the seat/back. */}
          {occupied
            && (mode === 'all' || mode === 'seat-only' || mode === 'fairy-slot') && fairy}
          {__DEV__ && showAnchor
            && (mode === 'all' || mode === 'seat-only' || mode === 'fairy-slot') && (
            <Group>
              <Circle cx={FAIRY_SEAT_ANCHOR_X} cy={FAIRY_SEAT_ANCHOR_Y} r={13} color="#FF2DAA" />
              <Circle cx={FAIRY_SEAT_ANCHOR_X} cy={FAIRY_SEAT_ANCHOR_Y} r={5} color="#FFFFFF" />
            </Group>
          )}
          <RegisteredLayer image={movingFront.image} name="swing-moving-front" mode={mode}
            placement={movingFrontPlacement} />
        </Group>
      </Group>

      <RegisteredLayer image={frame.image} name="frame-static" mode={mode} />
      <Group {...(ribbonEnabled ? {
        origin: HANGING_DECOR_PIVOT,
        transform: hangingDecorTransform,
      } : {})}>
        <RegisteredLayer image={decor.image} name="hanging-decor" mode={mode} />
      </Group>
      {/* Restrained warm glow onto immediately surrounding wooden arch, flowers, and ground */}
      {(mode === 'all' || mode === 'lantern-glow') && (
        <Group opacity={effectiveGlowOpacity} blendMode="screen">
          <ProceduralGroundGlow x={LEFT_GROUND_LIGHT.x} y={LEFT_GROUND_LIGHT.y} />
          <ProceduralGroundGlow x={RIGHT_GROUND_LIGHT.x} y={RIGHT_GROUND_LIGHT.y} />
          <ProceduralArchGlow x={LEFT_ARCH_LIGHT.x} y={LEFT_ARCH_LIGHT.y} />
          <ProceduralArchGlow x={RIGHT_ARCH_LIGHT.x} y={RIGHT_ARCH_LIGHT.y} />
        </Group>
      )}

      <RegisteredLayer image={lanterns.image} name="lanterns" mode={mode} />
      {(mode === 'all' || mode === 'lantern-glow') && (
        <Group opacity={effectiveGlowOpacity}>
          <ProceduralLanternInnerLight image={lanterns.image} clip={LEFT_LANTERN_GLASS} />
          <ProceduralLanternInnerLight image={lanterns.image} clip={RIGHT_LANTERN_GLASS} />
          <Group blendMode="screen">
            <ProceduralLanternHalo x={LEFT_LANTERN_LIGHT.x} y={LEFT_LANTERN_LIGHT.y} />
            <ProceduralLanternHalo x={RIGHT_LANTERN_LIGHT.x} y={RIGHT_LANTERN_LIGHT.y} />
            <ProceduralLanternCore x={LEFT_LANTERN_LIGHT.x} y={LEFT_LANTERN_LIGHT.y} r={42} />
            <ProceduralLanternCore x={RIGHT_LANTERN_LIGHT.x} y={RIGHT_LANTERN_LIGHT.y} r={44} />
          </Group>
        </Group>
      )}

      {__DEV__ && showPivot
        && (mode === 'all' || mode === 'seat-only' || mode === 'fairy-slot') && (
        <Group>
          <Circle cx={SWING_PIVOT_X} cy={SWING_PIVOT_Y} r={12} color="#18A8FF" />
          <Circle cx={SWING_PIVOT_X} cy={SWING_PIVOT_Y} r={4} color="#FFFFFF" />
        </Group>
      )}

      <RegisteredLayer image={foreground.image} name="foreground-overlay" mode={mode} />
    </Group>
  );
}
