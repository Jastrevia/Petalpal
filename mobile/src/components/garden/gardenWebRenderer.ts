import type { CanvasKit, Surface } from 'canvaskit-wasm';
import { JsiSkImage } from '@shopify/react-native-skia/lib/module/skia/web/JsiSkImage';
import type { SkImage, SkRect, SkPicture } from '@shopify/react-native-skia';
import { backingSize, type GardenQuality, type QualitySignals } from './gardenRenderQuality';

// Garden-only replacement for Skia 2.6.2's import-time DPR renderer.
// Images/pictures stay in the existing Skia reconciler and ownership cleanup.
export class GardenWebRenderer {
  private surface: Surface | null = null;
  private disposed = false;
  private scaleX = 1;
  private scaleY = 1;
  onSurfaceChanged?: () => void;
  constructor(private kit: CanvasKit, private canvas: HTMLCanvasElement) {}
  resize(tier: GardenQuality, signals: QualitySignals) {
    if (this.disposed || !signals.width || !signals.height) return false;
    const size = backingSize(tier, signals);
    if (this.surface && this.canvas.width === size.width && this.canvas.height === size.height) return false;
    this.surface?.delete();
    this.surface = null;
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.scaleX = size.width / signals.width;
    this.scaleY = size.height / signals.height;
    this.surface = this.kit.MakeWebGLCanvasSurface(this.canvas);
    this.onSurfaceChanged?.();
    const context = this.canvas.getContext('webgl2');
    if (context) context.drawingBufferColorSpace = 'display-p3';
    if (!this.surface) throw new Error('Could not create Garden surface');
    return true;
  }
  draw(picture: SkPicture) {
    if (!this.surface) return false;
    const canvas = this.surface.getCanvas();
    canvas.clear(this.kit.TRANSPARENT);
    canvas.save();
    try {
      canvas.scale(this.scaleX, this.scaleY);
      // Same recorded picture, sampling and source pixels in every tier.
      canvas.drawPicture((picture as SkPicture & { ref: Parameters<typeof canvas.drawPicture>[0] }).ref);
    } finally { canvas.restore(); }
    this.surface.flush();
    return true;
  }
  // These layers alone, at this camera, on a clear surface the size of the canvas. Same GPU context, so it
  // costs no more than drawing them once; the result is only valid until the surface is next replaced.
  snapshot(picture: SkPicture, camera: { x: number; y: number; zoom: number }) {
    if (!this.surface) return null;
    const offscreen = this.surface.makeSurface(this.surface.imageInfo());
    if (!offscreen) return null;
    const canvas = offscreen.getCanvas();
    canvas.clear(this.kit.TRANSPARENT);
    canvas.scale(this.scaleX, this.scaleY);
    canvas.translate(camera.x, camera.y);
    canvas.scale(camera.zoom, camera.zoom);
    canvas.drawPicture((picture as SkPicture & { ref: Parameters<typeof canvas.drawPicture>[0] }).ref);
    offscreen.flush();
    const image = offscreen.makeImageSnapshot();
    offscreen.delete();
    return { image: new JsiSkImage(this.kit, image) as unknown as SkImage, width: this.canvas.clientWidth, height: this.canvas.clientHeight };
  }
  makeImageSnapshot(rect?: SkRect) {
    if (!this.surface) throw new Error('Garden surface is unavailable');
    const bounds = rect ? [Math.round(rect.x * this.scaleX), Math.round(rect.y * this.scaleY),
      Math.round((rect.x + rect.width) * this.scaleX), Math.round((rect.y + rect.height) * this.scaleY)] : undefined;
    return new JsiSkImage(this.kit, this.surface.makeImageSnapshot(bounds));
  }
  suspend() {
    // Route/background pause frees GPU textures, retaining the canonical picture/images.
    if (this.surface) this.onSurfaceChanged?.();
    this.surface?.delete();
    this.surface = null;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.suspend();
    this.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
