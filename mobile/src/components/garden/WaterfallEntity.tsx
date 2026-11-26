import {runtimeAudit} from './performance/runtimeAudit';
import { Group, Image, useImage } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { FULL_WATERFALL_ASSETS, MAP_WATERFALL_ASSETS } from './waterfallAssets';
export const WATERFALL_WIDTH = 1199;
export const WATERFALL_HEIGHT = 1312;
export const WATERFALL_LAYER_NAMES = ['waterfall-static', 'waterfall_flow_main',
  'waterfall_flow_secondary', 'waterfall_foam', 'waterfall_mist'] as const;
export const WATERFALL_DEBUG_MODES = ['all', 'waterfall-static', 'main-body',
  'main-highlight', 'crest', 'secondary-body', 'secondary-highlight',
  'waterfall_foam', 'splash-particles', 'waterfall_mist'] as const;
export type WaterfallLayerName = typeof WATERFALL_LAYER_NAMES[number];
export type WaterfallDebugMode = typeof WATERFALL_DEBUG_MODES[number];
export type WaterfallLayerPlacement = { x: number; y: number; scale: number };
export type WaterfallRegistration = Record<WaterfallLayerName, WaterfallLayerPlacement>;
export type WaterfallFlowSpeed = 'slow' | 'normal' | 'fast';
export const WATERFALL_LAYER_REGISTRATION: WaterfallRegistration = {
  'waterfall-static': { x: 0, y: 0, scale: 1 },
  'waterfall_flow_main': { x: 0, y: 60, scale: 1 },
  'waterfall_flow_secondary': { x: 28, y: 0, scale: 1 },
  'waterfall_foam': { x: 0, y: 184, scale: 1 },
  'waterfall_mist': { x: 0, y: 164, scale: 1 },
};
// Aliased export for explicit clarity
export const APPROVED_WATERFALL_LAYER_REGISTRATION = WATERFALL_LAYER_REGISTRATION;


type LoadedImage = ReturnType<typeof useImage>;
function useSequence(sources: readonly number[], onError: (reason: Error) => void) {
  // Every sequence is a fixed module array and the map and full sets have equal lengths
  // (test/waterfallAssets.test.mjs), so the number of useImage calls never changes.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return sources.map(source => useImage(source, onError));
}
function SequenceLayer({ image, placement, pixelScale }: {
  image: LoadedImage; placement: WaterfallLayerPlacement; pixelScale: number;
}) {
  if (!image) return null;
  return <Image image={image} x={placement.x} y={placement.y}
    width={image.width()*pixelScale*placement.scale}
    height={image.height()*pixelScale*placement.scale} fit="fill" />;
}
// Deterministic irregular splash holds, unchanged from the approved playback.
function impactHold(step: number, fps: number, seed: number) {
  let hash = Math.imul(step + seed, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  const random = ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
  return (1000 / fps) * (0.8 + random * 0.4);
}
function splashFrameAt(elapsed: number, speed: number) {
  const target = elapsed*speed+103;
  let step=0, start=0, duration=impactHold(0,12,827);
  while (target >= start+duration) {
    start += duration;
    duration=impactHold(++step,12,827);
  }
  return step%6;
}
export type WaterfallEntityProps = {
  x?: number; y?: number; scale?: number; debugMode?: WaterfallDebugMode;
  registration?: WaterfallRegistration; animationEnabled?: boolean;
  flowSpeed?: WaterfallFlowSpeed; splashParticlesVisible?: boolean;
  assetQuality?: 'full' | 'map'; active?: boolean;
  // Retained for caller compatibility; tail clipping is disabled during recovery.
  flowWaterlineY?: number;
  // Optional map-only source surface, between structural rocks and untouched flow.
  sourcePond?: ReactNode;
  onDebugStatus?: (status: string) => void;
};
function WaterfallEntity({ x=0, y=0, scale=1, debugMode='all',
  registration=WATERFALL_LAYER_REGISTRATION, animationEnabled=false,
  flowSpeed='normal', splashParticlesVisible=true, assetQuality='full',
  active=true, sourcePond, onDebugStatus }: WaterfallEntityProps) {
  runtimeAudit.render('WaterfallEntity');
  const reducedMotion = useReducedMotion();
  const playing = animationEnabled && !reducedMotion;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  const [error, setError] = useState('');
  const onError = useCallback((reason: Error) => { if (__DEV__) setError(reason.message); }, []);
  const assets = assetQuality === 'map' ? MAP_WATERFALL_ASSETS : FULL_WATERFALL_ASSETS;
  const pixelScale = assetQuality === 'map' ? 2 : 1;
  const staticLayer = useImage(assets.STATIC, onError);
  const mainBody = useSequence(assets.MAIN_BODY, onError);
  const mainHighlight = useSequence(assets.MAIN_HIGHLIGHT, onError);
  const crest = useSequence(assets.CREST, onError);
  const secondaryBody = useSequence(assets.SECONDARY_BODY, onError);
  const secondaryHighlight = useSequence(assets.SECONDARY_HIGHLIGHT, onError);
  const impactFoam = useImage(assets.IMPACT_FOAM_CORE, onError);
  const splashParticles = useSequence(assets.SPLASH_PARTICLES, onError);
  const mist = useSequence(assets.MIST, onError);
  const frames = [ [staticLayer], mainBody, mainHighlight, crest, secondaryBody,
    secondaryHighlight, [impactFoam], splashParticles, mist ];
  const allLoaded = frames.every(sequence => sequence.every(Boolean));
  const speed = flowSpeed === 'slow' ? 0.7 : flowSpeed === 'fast' ? 1.35 : 1;
  const [elapsed, setElapsed] = useState(0);
  // One timer for every sequence. It rerenders only this memoized entity, never GardenScene.
  useEffect(() => {
    if (!playing || !active || !foreground || !allLoaded) {
      if (!playing) setElapsed(0);
      return;
    }
    const started=Date.now()-elapsed;
    const timer=setInterval(() => setElapsed(Date.now()-started),33);
    return () => clearInterval(timer);
    // elapsed is intentionally captured only when a playback period starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing,active,foreground,allLoaded]);
  const sampled=Math.floor(elapsed/33)*33*speed;
  const pick=(sequence: LoadedImage[], fps: number, phase: number) =>
    sequence[playing ? Math.floor((sampled+phase)/(1000/fps))%sequence.length : 0];
  const indexes = [
    staticLayer,
    pick(mainBody,10,0),
    pick(mainHighlight,12,37),
    pick(crest,12,71),
    pick(secondaryBody,11,53),
    pick(secondaryHighlight,13,89),
    impactFoam,
    splashParticles[playing ? splashFrameAt(elapsed,speed) : 0],
    pick(mist,3.5,143),
  ];
  const names: WaterfallDebugMode[] = ['waterfall-static','main-body','main-highlight','crest',
    'secondary-body','secondary-highlight','waterfall_foam','splash-particles','waterfall_mist'];
  const main=registration.waterfall_flow_main, secondary=registration.waterfall_flow_secondary;
  const placements=[registration['waterfall-static'],main,main,main,secondary,secondary,
    registration.waterfall_foam,registration.waterfall_foam,registration.waterfall_mist];
  const expectedW=assetQuality === 'map' ? 600 : WATERFALL_WIDTH;
  const expectedH=assetQuality === 'map' ? 656 : WATERFALL_HEIGHT;
  const status = __DEV__ ? [
    `animation: ${playing ? 'ON' : 'OFF / reduced motion'}; ${assetQuality}; one UI clock`,
    `canvas: ${WATERFALL_WIDTH} × ${WATERFALL_HEIGHT}; foam: Stable A`,
    ...frames.map((sequence,i) => names[i]+': '+sequence.filter(Boolean).length+'/'+sequence.length+' decoded'
      +(sequence.some(im=>im && (im.width()!==expectedW || im.height()!==expectedH))?' DIMENSION MISMATCH':'')),
    error,
  ].join('\n') : '';
  useEffect(() => { if (__DEV__) onDebugStatus?.(status); }, [status,onDebugStatus]);
  if (debugMode==='all' && !allLoaded) return null;
  const mode=__DEV__ ? debugMode : 'all';
  const isFlow = (name: WaterfallDebugMode) =>
    name === 'main-body' ||
    name === 'main-highlight' ||
    name === 'crest' ||
    name === 'secondary-body' ||
    name === 'secondary-highlight';

  return <Group transform={[{translateX:x},{translateY:y},{scale}]}>
    {/* 1. Base static layer (rocks/cliff/vegetation) - never clipped */}
    {(mode === 'all' || mode === 'waterfall-static') && (
      <SequenceLayer image={indexes[0]} placement={placements[0]} pixelScale={pixelScale} />
    )}

    {mode === 'all' && sourcePond}
    {/* 2. Full approved flow frames, without waterline clipping or alpha masking. */}
    <Group>
      {names.map((name, i) =>
        isFlow(name) && (mode === 'all' || mode === name)
          ? <SequenceLayer key={name} image={indexes[i]} placement={placements[i]} pixelScale={pixelScale} />
          : null
      )}
    </Group>

    {/* 3. Surface foam, splash particles, mist - rendered on top, unclipped */}
    {names.map((name, i) =>
      !isFlow(name) && name !== 'waterfall-static' && (mode === 'all' || mode === name) && (name !== 'splash-particles' || splashParticlesVisible)
        ? <SequenceLayer key={name} image={indexes[i]} placement={placements[i]} pixelScale={pixelScale} />
        : null
    )}
  </Group>;
}
export default memo(WaterfallEntity);
