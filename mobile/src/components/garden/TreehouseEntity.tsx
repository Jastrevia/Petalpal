import { ColorMatrix, Group, Image, useImage } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';
import {
  cancelAnimation, Easing, useDerivedValue, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';

// All six production PNGs share this canvas and origin. Keep their full
// transparent bounds: cropping individual layers would break registration.
export const TREEHOUSE_WIDTH = 1448;
export const TREEHOUSE_HEIGHT = 1086;

// Mailbox-only registration beside the stairs, using the full master as reference.
// Keep the source canvas and the parent transform unchanged.
const MAILBOX_OFFSET = { x: 60, y: 135 };

// Pivots and amplitudes are in source-image coordinates, inside the parent scale.
const CANOPY_PIVOT = { x: 740, y: 350 };
// Single-overlay approximation: suspend the flowers from the upper attachment edge.
const WISTERIA_PIVOT = { x: 740, y: 0 };
const FOREGROUND_PIVOT = { x: 820, y: 900 };

// Inset contours traced against tree-base's painted openings, in source pixels.
// No external halo: the roof, bark, frame, stairs and mailbox remain untouched.
export const WINDOW_INTERIOR = 'M 783 376 C 802 365 813 380 811 404 C 809 426 795 444 777 449 C 759 451 746 439 746 420 C 746 401 762 383 783 376 Z';
export const LIBRARY_INTERIOR = 'M 854 613 C 886 605 916 621 931 653 C 940 682 931 720 912 749 L 863 774 C 836 770 810 750 799 726 C 788 699 797 660 816 637 C 827 625 839 617 854 613 Z';
// Tint a copy of the actual pixels, with NO constant color/brightness offset.
// Screen then lifts existing painted highlights while dark detail stays dark.
const INTERIOR_LIGHT_MATRIX = [
  1.1, 0, 0, 0, 0,
  0, 0.65, 0, 0, 0,
  0, 0, 0.15, 0, 0,
  0, 0, 0, 1, 0,
];

function useLightBreathing(enabled: boolean, min: number, max: number, duration: number, delay: number) {
  const phase = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (enabled) {
      phase.value = withDelay(delay, withRepeat(
        withTiming(2 * Math.PI, { duration, easing: Easing.linear }), -1, false,
      ));
    }
    return () => cancelAnimation(phase);
  }, [enabled, duration, delay, phase]);
  return useDerivedValue(() => enabled
    ? min + (max - min) * (1 - Math.cos(phase.value)) / 2
    : 0, [enabled, min, max]);
}

function useVegetationWind(
  enabled: boolean, duration: number, delay: number,
  degrees: number, driftX: number, driftY: number, direction = 1,
) {
  const phase = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (enabled) {
      // A full sine cycle reverses softly and has no discontinuity at the repeat.
      phase.value = withDelay(delay, withRepeat(
        withTiming(2 * Math.PI, { duration: duration * 2, easing: Easing.linear }),
        -1, false,
      ));
    }
    return () => cancelAnimation(phase);
  }, [enabled, duration, delay, phase]);

  return useDerivedValue(() => {
    const wind = enabled ? Math.sin(phase.value) * direction : 0;
    return [
      { translateX: wind * driftX },
      { translateY: wind * driftY },
      { rotate: wind * degrees * Math.PI / 180 },
    ];
  }, [enabled, degrees, driftX, driftY, direction]);
}

export const TREEHOUSE_LAYER_NAMES = [
  'tree-base', 'canopy-overlay', 'wisteria-overlay', 'mailbox', 'warmlight', 'foreground-overlay',
] as const;
export type TreehouseDebugMode = 'all' | typeof TREEHOUSE_LAYER_NAMES[number];

function useProductionImage(source: number) {
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((reason: Error) => {
    if (__DEV__) setError(reason.message);
  }, []);
  const image = useImage(source, onError);
  return { image, error };
}

export type TreehouseEntityProps = {
  x?: number;
  y?: number;
  scale?: number;
  debugMode?: TreehouseDebugMode;
  onDebugStatus?: (status: string) => void;
  animationEnabled?: boolean;
  lightingEnabled?: boolean;
  /** The Fairy is inside: the windows glow brighter, day or night. */
  occupied?: boolean;
};

/** Skia scene node. Motion is opt-in; render inside a Canvas. */
export default function TreehouseEntity({
  x = 0, y = 0, scale = 1, debugMode = 'all', onDebugStatus,
  animationEnabled = false,
  lightingEnabled = false,
  occupied = false,
}: TreehouseEntityProps) {
  const reducedMotion = useReducedMotion();
  const motionEnabled = animationEnabled && !reducedMotion;
  const canopyTransform = useVegetationWind(motionEnabled, 8000, 0, 0.3, 2, 0.5);
  const wisteriaTransform = useVegetationWind(motionEnabled, 6000, 600, 0.65, 0, 0, -1);
  const foregroundTransform = useVegetationWind(motionEnabled, 9000, 1200, 0.12, 0.8, 0.3);
  const lightsEnabled = motionEnabled && (lightingEnabled || occupied) && debugMode === 'all';
  const windowOpacity = useLightBreathing(lightsEnabled, occupied ? 0.74 : 0.52, occupied ? 0.86 : 0.58, 7000, 0);
  const libraryOpacity = useLightBreathing(lightsEnabled, occupied ? 0.78 : 0.61, occupied ? 0.9 : 0.69, 8500, 1300);
  const treeBase = useProductionImage(require('@/assets/garden/landmarks/treehouse/tree-base.png'));
  const canopy = useProductionImage(require('@/assets/garden/landmarks/treehouse/canopy-overlay.png'));
  const wisteria = useProductionImage(require('@/assets/garden/landmarks/treehouse/wisteria-overlay.png'));
  const mailbox = useProductionImage(require('@/assets/garden/landmarks/treehouse/mailbox.png'));
  const warmLight = useProductionImage(require('@/assets/garden/landmarks/treehouse/warmlight.png'));
  const foreground = useProductionImage(require('@/assets/garden/landmarks/treehouse/foreground-overlay.png'));

  const layers = [treeBase, canopy, wisteria, mailbox, warmLight, foreground];
  const status = __DEV__ ? layers.map(({ image, error }, index) =>
    `${TREEHOUSE_LAYER_NAMES[index]}: ${image
      ? `loaded ${image.width()} × ${image.height()}`
      : error ? `ERROR: ${error}` : 'loading / not decoded'}`,
  ).join('\n') : '';

  useEffect(() => {
    if (__DEV__) onDebugStatus?.(status);
  }, [onDebugStatus, status]);

  const mode = __DEV__ ? debugMode : 'all';

  // The broad warm-light effect is debug-only, not part of the default composite.
  const renderOrder = mode === 'all' ? [0, 1, 2, 5, 3] : [0, 1, 2, 3, 4, 5];

  // Reveal the assembled entity only after its five visible layers are ready.
  // Isolated debugging must still work if an unrelated layer fails to load.
  if (mode === 'all' && renderOrder.some((index) => !layers[index].image)) return null;

  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
      {renderOrder.map((index) => {
        const { image } = layers[index];
        const name = TREEHOUSE_LAYER_NAMES[index];
        if (!image || (mode !== 'all' && mode !== name)) return null;
        const artwork = <Image
          image={image}
          x={name === 'mailbox' ? MAILBOX_OFFSET.x : 0}
          y={name === 'mailbox' ? MAILBOX_OFFSET.y : 0}
          width={TREEHOUSE_WIDTH}
          height={TREEHOUSE_HEIGHT}
          fit="contain"
        />;
        const vegetation = name === 'canopy-overlay'
          ? { origin: CANOPY_PIVOT, transform: canopyTransform }
          : name === 'wisteria-overlay'
            ? { origin: WISTERIA_PIVOT, transform: wisteriaTransform }
            : name === 'foreground-overlay'
              ? { origin: FOREGROUND_PIVOT, transform: foregroundTransform }
              : undefined;

        // Mailbox owns a separate static group, ready for future event-only motion.
        // Base and mailbox never receive vegetation transforms. OFF is exact static art.
        return (
          <Group key={name} {...(motionEnabled && vegetation ? vegetation : {})}>
            {artwork}
            {name === 'tree-base' && lightsEnabled && (
              <Group>
                <Group clip={WINDOW_INTERIOR}>
                  <Image image={image} x={0} y={0} width={TREEHOUSE_WIDTH}
                    height={TREEHOUSE_HEIGHT} fit="contain" blendMode="screen" opacity={windowOpacity}>
                    <ColorMatrix matrix={INTERIOR_LIGHT_MATRIX} />
                  </Image>
                </Group>
                <Group clip={LIBRARY_INTERIOR}>
                  <Image image={image} x={0} y={0} width={TREEHOUSE_WIDTH}
                    height={TREEHOUSE_HEIGHT} fit="contain" blendMode="screen" opacity={libraryOpacity}>
                    <ColorMatrix matrix={INTERIOR_LIGHT_MATRIX} />
                  </Image>
                </Group>
              </Group>
            )}
          </Group>
        );
      })}
    </Group>
  );
}
