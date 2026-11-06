import type {ReactNode} from 'react';
import { Group, Image, useImage } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';
import {
  cancelAnimation, Easing, useDerivedValue, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';

export const MOON_BED_WIDTH = 1312;
export const MOON_BED_HEIGHT = 1199;

const LEFT_PENDANT_WIND = {
  pivot: { x: 785.28, y: 125.41 }, rotation: 5, duration: 6200, delay: 0,
};
const RIGHT_PENDANT_WIND = {
  pivot: { x: 885.29, y: 80.15 }, rotation: 4.5, duration: 6800, delay: 500,
};

export const MOON_BED_LAYER_NAMES = [
  'ribbons',
  'frame-static',
  'bed-surface',
  'pillow',
  'hanging-decor',
  'blanket-tail',
] as const;

export type MoonBedLayerName = typeof MOON_BED_LAYER_NAMES[number];
export type MoonBedDebugMode = 'all' | MoonBedLayerName;
export type MoonBedLayerPlacement = { x: number; y: number; scale: number };
export type MoonBedRegistration = Record<MoonBedLayerName, MoonBedLayerPlacement>;

// Uniform source-to-master registrations. These are deliberately centralized
// for visual calibration; no source image is cropped or non-uniformly stretched.
export const MOON_BED_LAYER_REGISTRATION: MoonBedRegistration = {
  ribbons: { x: -1, y: 230, scale: 0.82 },
  'frame-static': { x: 52, y: 0, scale: 1 },
  'bed-surface': { x: -121, y: 0, scale: 1.125 },
  pillow: { x: 376, y: 498, scale: 0.3 },
  'blanket-tail': { x: 88, y: 158, scale: 0.9 },
  'hanging-decor': { x: 175, y: 40, scale: 0.73 },
};

const SOURCE_DIMENSIONS: Record<MoonBedLayerName, { width: number; height: number }> = {
  'frame-static': { width: 1254, height: 1254 },
  'bed-surface': { width: 1422, height: 1106 },
  pillow: { width: 1312, height: 1199 },
  'blanket-tail': { width: 1254, height: 1254 },
  ribbons: { width: 1536, height: 1024 },
  'hanging-decor': { width: 1402, height: 1122 },
};

type LoadedImage = ReturnType<typeof useImage>;

function useMoonBedWind(
  enabled: boolean,
  duration: number,
  delay: number,
  degrees: number,
  driftX: number,
  driftY: number,
) {
  const phase = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (enabled) {
      phase.value = withDelay(delay, withRepeat(withTiming(2 * Math.PI, {
        duration,
        easing: Easing.linear,
      }), -1, false));
    }
    return () => cancelAnimation(phase);
  }, [delay, duration, enabled, phase]);

  return useDerivedValue(() => {
    const wind = enabled ? Math.sin(phase.value) : 0;
    return [
      { translateX: wind * driftX },
      { translateY: wind * driftY },
      { rotate: wind * degrees * Math.PI / 180 },
    ];
  }, [degrees, driftX, driftY, enabled]);
}

function useProductionImage(source: number) {
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((reason: Error) => {
    if (__DEV__) setError(reason.message);
  }, []);
  const image = useImage(source, onError);
  return { image, error };
}

export type MoonBedEntityProps = {
  x?: number;
  y?: number;
  scale?: number;
  fairy?: ReactNode;
  debugMode?: MoonBedDebugMode;
  registration?: MoonBedRegistration;
  animationEnabled?: boolean;
  onDebugStatus?: (status: string) => void;
};

function RegisteredLayer({ image, name, mode, registration }: {
  image: LoadedImage;
  name: MoonBedLayerName;
  mode: MoonBedDebugMode;
  registration: MoonBedRegistration;
}) {
  if (!image || (mode !== 'all' && mode !== name)) return null;
  const source = SOURCE_DIMENSIONS[name];
  const placement = registration[name];
  return (
    <Image image={image} x={placement.x} y={placement.y}
      width={source.width * placement.scale} height={source.height * placement.scale}
      fit="fill" />
  );
}

function HangingDecorLayer({ image, mode, registration, leftTransform, rightTransform }: {
  image: LoadedImage;
  mode: MoonBedDebugMode;
  registration: MoonBedRegistration;
  leftTransform: ReturnType<typeof useMoonBedWind>;
  rightTransform: ReturnType<typeof useMoonBedWind>;
}) {
  if (!image || (mode !== 'all' && mode !== 'hanging-decor')) return null;
  const source = SOURCE_DIMENSIONS['hanging-decor'];
  const placement = registration['hanging-decor'];
  // Source alpha components end at x=904 and begin again at x=919. Splitting
  // at the transparent gap preserves both complete pendants without overlap.
  const splitX = placement.x + 911.5 * placement.scale;
  const imageNode = (
    <Image image={image} x={placement.x} y={placement.y}
      width={source.width * placement.scale} height={source.height * placement.scale}
      fit="fill" />
  );
  return (
    <>
      <Group
        clip={{ x: placement.x, y: placement.y, width: splitX - placement.x,
          height: source.height * placement.scale }}
        origin={LEFT_PENDANT_WIND.pivot}
        transform={leftTransform}>
        {imageNode}
      </Group>
      <Group
        clip={{ x: splitX, y: placement.y,
          width: placement.x + source.width * placement.scale - splitX,
          height: source.height * placement.scale }}
        origin={RIGHT_PENDANT_WIND.pivot}
        transform={rightTransform}>
        {imageNode}
      </Group>
    </>
  );
}

/** Static embeddable Skia landmark. The owning test/scene supplies the Canvas. */
export default function MoonBedEntity({
  x = 0,
  y = 0,
  scale = 1,
  debugMode = 'all',
  registration = MOON_BED_LAYER_REGISTRATION,
  animationEnabled = false,
  onDebugStatus,
  fairy,
}: MoonBedEntityProps) {
  const reducedMotion = useReducedMotion();
  const windEnabled = animationEnabled && !reducedMotion;
  const leftPendantTransform = useMoonBedWind(
    windEnabled, LEFT_PENDANT_WIND.duration, LEFT_PENDANT_WIND.delay,
    LEFT_PENDANT_WIND.rotation, 0, 0,
  );
  const rightPendantTransform = useMoonBedWind(
    windEnabled, RIGHT_PENDANT_WIND.duration, RIGHT_PENDANT_WIND.delay,
    RIGHT_PENDANT_WIND.rotation, 0, 0,
  );
  const frame = useProductionImage(require('@/assets/garden/landmarks/moon-bed/frame-static.webp'));
  const bedSurface = useProductionImage(require('@/assets/garden/landmarks/moon-bed/bed-surface.png'));
  const pillow = useProductionImage(require('@/assets/garden/landmarks/moon-bed/pillow.webp'));
  const blanketTail = useProductionImage(require('@/assets/garden/landmarks/moon-bed/blanket-tail.png'));
  const ribbons = useProductionImage(require('@/assets/garden/landmarks/moon-bed/ribbons.webp'));
  const hangingDecor = useProductionImage(require('@/assets/garden/landmarks/moon-bed/hanging-decor.png'));
  const layers = [ribbons, frame, bedSurface, pillow, hangingDecor, blanketTail];
  const mode = __DEV__ ? debugMode : 'all';
  const status = __DEV__ ? layers.map(({ image, error }, index) =>
    `${MOON_BED_LAYER_NAMES[index]}: ${image
      ? `loaded ${image.width()} × ${image.height()}`
      : error ? `ERROR: ${error}` : 'loading / not decoded'}`,
  ).join('\n') : '';

  useEffect(() => {
    if (__DEV__) onDebugStatus?.(status);
  }, [onDebugStatus, status]);

  if (mode === 'all' && layers.some(({ image }) => !image)) return null;

  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
      {/* Back-to-front registration follows the approved master, with the
          sheer ribbons painting over the crescent frame at intersections. */}
      <RegisteredLayer image={frame.image} name="frame-static" mode={mode}
        registration={registration} />
      <RegisteredLayer image={ribbons.image} name="ribbons" mode={mode}
        registration={registration} />
      <RegisteredLayer image={bedSurface.image} name="bed-surface" mode={mode}
        registration={registration} />
      <RegisteredLayer image={pillow.image} name="pillow" mode={mode}
        registration={registration} />
      {mode === 'all' && fairy}
      <HangingDecorLayer image={hangingDecor.image} mode={mode} registration={registration}
        leftTransform={leftPendantTransform} rightTransform={rightPendantTransform} />
      <RegisteredLayer image={blanketTail.image} name="blanket-tail" mode={mode}
        registration={registration} />
    </Group>
  );
}
