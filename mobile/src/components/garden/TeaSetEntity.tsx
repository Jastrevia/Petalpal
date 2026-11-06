import type {ReactNode} from 'react';
import { Group, Image, useImage } from '@shopify/react-native-skia';
import { useCallback, useEffect, useState } from 'react';

export const TEA_SET_WIDTH = 1536;
export const TEA_SET_HEIGHT = 1024;

export const TEA_SET_LAYER_NAMES = [
  'left-chair-base',
  'right-chair-base',
  'tea-table',
  'left-occluder',
  'right-occluder',
  'left-overlay',
  'right-overlay',
] as const;

export type TeaSetLayerName = typeof TEA_SET_LAYER_NAMES[number];
export type TeaSetDebugMode = 'all' | TeaSetLayerName;
export type TeaSetLayerPlacement = { x: number; y: number; scale: number; rotation: number };
export type TeaSetRegistration = Record<TeaSetLayerName, TeaSetLayerPlacement>;

// Initial uniform registrations for manual master-overlay refinement. Chair
// exports already share the master canvas; tea-table uses a portrait canvas.
export const TEA_SET_LAYER_REGISTRATION: TeaSetRegistration = {
  'left-chair-base': { x: -100, y: 0, scale: 1, rotation: 0 },
  'right-chair-base': { x: 380, y: 100, scale: 0.8, rotation: 0 },
  'tea-table': { x: 470, y: 90, scale: 0.58, rotation: 0 },
  'left-occluder': { x: -55, y: 262, scale: 0.66, rotation: 0 },
  'right-occluder': { x: 559, y: 282, scale: 0.675, rotation: -3.5 },
  'left-overlay': { x: -120, y: -15, scale: 1, rotation: 0 },
  'right-overlay': { x: 480, y: 191, scale: 0.73, rotation: 0 },
};

const SOURCE_DIMENSIONS: Record<TeaSetLayerName, { width: number; height: number }> = {
  'left-chair-base': { width: 1536, height: 1024 },
  'right-chair-base': { width: 1536, height: 1024 },
  'tea-table': { width: 1024, height: 1536 },
  'left-occluder': { width: 1536, height: 1024 },
  'right-occluder': { width: 1536, height: 1024 },
  'left-overlay': { width: 1536, height: 1024 },
  'right-overlay': { width: 1536, height: 1024 },
};

type LoadedImage = ReturnType<typeof useImage>;

function useProductionImage(source: number) {
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((reason: Error) => {
    if (__DEV__) setError(reason.message);
  }, []);
  return { image: useImage(source, onError), error };
}

function RegisteredLayer({ image, name, mode, registration }: {
  image: LoadedImage; name: TeaSetLayerName; mode: TeaSetDebugMode;
  registration: TeaSetRegistration;
}) {
  if (!image || (mode !== 'all' && mode !== name)) return null;
  const source = SOURCE_DIMENSIONS[name];
  const placement = registration[name];
  const width = source.width * placement.scale;
  const height = source.height * placement.scale;
  const center = { x: placement.x + width / 2, y: placement.y + height / 2 };
  return <Group origin={center} transform={[{ rotate: placement.rotation * Math.PI / 180 }]}>
    <Image image={image} x={placement.x} y={placement.y}
      width={width} height={height} fit="fill" />
  </Group>;
}

export type TeaSetEntityProps = {
  x?: number;
  y?: number;
  scale?: number;
  fairy?: ReactNode;
  debugMode?: TeaSetDebugMode;
  registration?: TeaSetRegistration;
  onDebugStatus?: (status: string) => void;
};

/** Static embeddable Skia entity. The owning test screen supplies the Canvas. */
export default function TeaSetEntity({
  x = 0, y = 0, scale = 1, debugMode = 'all',
  registration = TEA_SET_LAYER_REGISTRATION, onDebugStatus, fairy,
}: TeaSetEntityProps) {
  const leftBase = useProductionImage(require('@/assets/garden/landmarks/tea-set/left-chair-base.webp'));
  const rightBase = useProductionImage(require('@/assets/garden/landmarks/tea-set/right-chair-base.webp'));
  const table = useProductionImage(require('@/assets/garden/landmarks/tea-set/tea-table.webp'));
  const leftOccluder = useProductionImage(require('@/assets/garden/landmarks/tea-set/left-occluder.png'));
  const rightOccluder = useProductionImage(require('@/assets/garden/landmarks/tea-set/right-occluder.png'));
  const leftOverlay = useProductionImage(require('@/assets/garden/landmarks/tea-set/left-overlay.png'));
  const rightOverlay = useProductionImage(require('@/assets/garden/landmarks/tea-set/right-overlay.webp'));
  const layers = [leftBase, rightBase, table, leftOccluder, rightOccluder, leftOverlay, rightOverlay];
  const mode = __DEV__ ? debugMode : 'all';
  const status = __DEV__ ? layers.map(({ image, error }, index) =>
    `${TEA_SET_LAYER_NAMES[index]}: ${image
      ? `loaded ${image.width()} × ${image.height()}`
      : error ? `ERROR: ${error}` : 'loading / not decoded'}`).join('\n') : '';

  useEffect(() => {
    if (__DEV__) onDebugStatus?.(status);
  }, [onDebugStatus, status]);

  if (mode === 'all' && layers.some(({ image }) => !image)) return null;
  return <Group transform={[{ translateX: x }, { translateY: y }, { scale }]}>
    <RegisteredLayer image={leftBase.image} name="left-chair-base" mode={mode} registration={registration} />
    <RegisteredLayer image={rightBase.image} name="right-chair-base" mode={mode} registration={registration} />
    {mode === 'all' && fairy}
    <RegisteredLayer image={table.image} name="tea-table" mode={mode} registration={registration} />
    <RegisteredLayer image={leftOccluder.image} name="left-occluder" mode={mode} registration={registration} />
    <RegisteredLayer image={rightOccluder.image} name="right-occluder" mode={mode} registration={registration} />
    <RegisteredLayer image={leftOverlay.image} name="left-overlay" mode={mode} registration={registration} />
    <RegisteredLayer image={rightOverlay.image} name="right-overlay" mode={mode} registration={registration} />
  </Group>;
}
