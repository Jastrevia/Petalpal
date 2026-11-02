import { Skia, type CanvasRef, type SkPicture, type SkRect, type SkImage } from '@shopify/react-native-skia';
import { SkiaSGRoot } from '@shopify/react-native-skia/lib/module/sksg/Reconciler';
import { SkiaViewNativeId } from '@shopify/react-native-skia/lib/module/views/SkiaViewNativeId';
import type { CanvasKit } from 'canvaskit-wasm';
import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { GardenCanvasProps } from './GardenCanvas';
import { afterNextFrames, createStaticRunHost, StaticRunContext } from './gardenStaticRuns';
import { GardenWebRenderer } from './gardenWebRenderer';
import { GardenQualitySelector, frameSample, qualityMode, type QualitySignals, restingFrameSkipped } from './gardenRenderQuality';
import { ownGardenWebView } from './webCanvasCache';

type WebApi = {
  registerView(id: string, view: unknown): void;
  setJsiProperty(id: number, name: string, value: SkPicture): void;
  makeImageSnapshot(id: number, rect?: SkRect): SkImage;
  makeImageSnapshotAsync(id: number, rect?: SkRect): Promise<SkImage>;
};
const viewApi = () => (globalThis as unknown as { SkiaViewApi: WebApi }).SkiaViewApi;
export default function GardenCanvas({ children, style, ref, active }: GardenCanvasProps) {
  const nativeId = useMemo(() => SkiaViewNativeId.current++, []);
  // The pinned package publishes two declaration paths for the same Skia binding.
  const root = useMemo(() => new SkiaSGRoot(Skia as unknown as ConstructorParameters<typeof SkiaSGRoot>[0], nativeId), [nativeId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const redrawRef = useRef(() => {});
  const [runs] = useState(() => {
    const host = createStaticRunHost<SkPicture>();
    const snapshotter = { current: null as GardenWebRenderer | null };
    return { host, snapshotter, value: {
      host,
      snapshot: (picture: SkPicture, camera: { x: number; y: number; zoom: number }) => snapshotter.current?.snapshot(picture, camera) ?? null,
      register: (id: number, onPicture: (picture: SkPicture) => void) => {
        viewApi().registerView(String(id), { setPicture: onPicture, getSize: () => ({ width: 0, height: 0 }), redraw() {}, makeImageSnapshot() { throw new Error('A static run has no canvas'); } });
        return ownGardenWebView(viewApi(), id, picture => afterNextFrames(() => picture.dispose()));
      },
    } };
  });
  useImperativeHandle(ref, () => ({
    getNativeId: () => nativeId, redraw: () => redrawRef.current(),
    makeImageSnapshot: rect => viewApi().makeImageSnapshot(nativeId, rect),
    makeImageSnapshotAsync: rect => viewApi().makeImageSnapshotAsync(nativeId, rect),
    measure: callback => {
      const canvas = canvasRef.current; if (!canvas) return;
      const bounds = canvas.getBoundingClientRect(), parent = canvas.offsetParent?.getBoundingClientRect();
      callback(bounds.left - (parent?.left ?? 0), bounds.top - (parent?.top ?? 0),
        bounds.width, bounds.height, bounds.left, bounds.top);
    },
    measureInWindow: callback => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (bounds) callback(bounds.left, bounds.top, bounds.width, bounds.height);
    },
  }) as CanvasRef, [nativeId]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const kit = (globalThis as unknown as { CanvasKit: CanvasKit }).CanvasKit;
    const renderer = new GardenWebRenderer(kit, canvas);
    let awaitingPicture = false;
    runs.snapshotter.current = renderer;
    // Snapshots die with their surface. Wait for the frame recorded without them rather than paint a hole.
    renderer.onSurfaceChanged = () => { if (runs.host.invalidateAll()) awaitingPicture = true; };
    const api = viewApi();
    let picture: SkPicture | null = null, dirty = true, disposed = false, drawQueued = false;
    let request = 0, previous = 0, windowStart = performance.now();
    let frames: number[] = [], draws: number[] = [];
    const pointers = new Set<number>();
    let lastPaint = 0, lastTouch = windowStart;
    const selector = new GardenQualitySelector(windowStart);
    // Testing override is dev-only and URL-scoped. No production settings or storage.
    const mode = __DEV__ ? qualityMode(new URLSearchParams(window.location.search).get('gardenQuality')) : 'AUTO';
    let tier = mode === 'AUTO' ? selector.tier : mode;
    const signals = (): QualitySignals => ({
      dpr: window.devicePixelRatio, width: canvas.clientWidth, height: canvas.clientHeight,
      cores: navigator.hardwareConcurrency || undefined,
      memoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    });
    const redraw = () => { dirty = true; };
    // Explicit input redraws sample the current shared values immediately.
    // The animation mapper continues to record at its existing RAF cadence.
    redrawRef.current = () => {
      if (!disposed && picture && activeRef.current) {
        api.setJsiProperty(nativeId, 'picture', root.getPicture() as unknown as SkPicture);
      }
    };
    const drawLatest = () => {
      if (disposed || !dirty || !picture || awaitingPicture || !activeRef.current || document.visibilityState !== 'visible') return;
      const start = performance.now();
      // The next animation frame picks up what is skipped here.
      if (restingFrameSkipped(start, lastTouch, lastPaint, pointers.size > 0)) return;
      const painted = renderer.draw(picture);
      if (!painted) return;
      dirty = false;
      lastPaint = start;
      if (!pointers.size) draws.push(performance.now() - start);
    };
    api.registerView(String(nativeId), { setPicture(value: SkPicture) { picture = value; awaitingPicture = false; redraw();
      // Skia's web animation mapper already runs on RAF. Paint its newest
      // recording in this turn instead of displaying it one RAF later. Coalesce
      // synchronous commits without dropping animation frames or changing cadence.
      if (!drawQueued) {
        drawQueued = true;
        queueMicrotask(() => { drawQueued = false; drawLatest(); });
      }
    },
      getSize: () => ({ width: canvas.clientWidth, height: canvas.clientHeight }), redraw,
      makeImageSnapshot: (rect?: SkRect) => { if (picture) renderer.draw(picture); return renderer.makeImageSnapshot(rect); } });
    const releaseView = ownGardenWebView(api, nativeId);
    const resize = () => { if (!disposed && !pointers.size && activeRef.current && document.visibilityState === 'visible') { renderer.resize(tier, signals()); redraw(); } };
    const pointerDown = (event: PointerEvent) => { lastTouch = performance.now(); pointers.add(event.pointerId); selector.resetSamples(); frames = []; draws = []; previous = 0; };
    const pointerUp = (event: PointerEvent) => { lastTouch = performance.now(); pointers.delete(event.pointerId); if (!pointers.size) resize(); };
    const resetTiming = () => { frames = []; draws = []; previous = 0; windowStart = performance.now(); selector.resetSamples(); pointers.clear(); };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointerup', pointerUp, true);
    window.addEventListener('pointercancel', pointerUp, true);
    window.addEventListener('blur', resetTiming);
    document.addEventListener('visibilitychange', resetTiming);
    const tick = (now: number) => {
      if (disposed) return;
      if (activeRef.current && document.visibilityState === 'visible') {
        // Re-read live DPR even if CSS dimensions did not change (display/browser zoom).
        if (!pointers.size && renderer.resize(tier, signals())) dirty = true;
        if (previous && !pointers.size) frames.push(now - previous);
        previous = now;
        drawLatest();
        if (!pointers.size) runs.host.step(now);
        if (now - windowStart >= 2500) {
          const sample = frameSample(frames, draws);
          if (mode === 'AUTO' && draws.length >= 10) {
            tier = selector.observe(sample, signals(), now, pointers.size > 0);
            if (!pointers.size && renderer.resize(tier, signals())) dirty = true;
          }
          if (__DEV__) canvas.dataset.gardenQuality = JSON.stringify({ mode, tier, dpr: signals().dpr,
            css: [canvas.clientWidth, canvas.clientHeight], backing: [canvas.width, canvas.height],
            ...sample, heapMiB: (kit as CanvasKit & { HEAPU8: Uint8Array }).HEAPU8.byteLength / 1048576 });
          frames = []; draws = []; windowStart = now;
        }
      } else { renderer.suspend(); resetTiming(); }
      request = requestAnimationFrame(tick);
    };
    resize(); request = requestAnimationFrame(tick);
    return () => {
      // Retain the proven root/view ordering: gate late pictures, then root releases images.
      void root.unmount(); releaseView(); disposed = true;
      runs.snapshotter.current = null; renderer.onSurfaceChanged = undefined;
      picture = null; redrawRef.current = () => {};
      cancelAnimationFrame(request); observer.disconnect(); renderer.dispose();
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointerup', pointerUp, true);
      window.removeEventListener('pointercancel', pointerUp, true);
      window.removeEventListener('blur', resetTiming);
      document.removeEventListener('visibilitychange', resetTiming);
    };
  }, [nativeId, root]);
  useLayoutEffect(() => { void root.render(<StaticRunContext.Provider value={runs.value}>{children}</StaticRunContext.Provider>); }, [root, runs, children]);
  return <View style={style}><canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} /></View>;
}
