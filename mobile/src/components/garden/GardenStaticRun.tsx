import { FilterMode, Group, MipmapMode, Picture, Skia, type SkImage, type SkPicture, type Transforms3d } from '@shopify/react-native-skia';
import { SkiaSGRoot } from '@shopify/react-native-skia/lib/module/sksg/Reconciler';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { PixelRatio, Platform } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue, type DerivedValue } from 'react-native-reanimated';
import { LandImages } from './LandLayer';
import { sameCamera, SETTLE_MS, type GardenCamera } from './gardenStaticRuns';

type Snapshot = { picture: SkPicture; image: SkImage; camera: GardenCamera };
// A snapshot reaches this far past each edge of the screen (a share of its size), so a drag only slides
// it along and repaints nothing. Past that, or at a new zoom, the layers are drawn as usual until the
// camera rests again. Slides land on whole device pixels, so the art stays exactly as sharp.
const MARGIN = .2;
type Props = { cameraTransform: DerivedValue<Transforms3d>; width: number; height: number; order: number; children: ReactNode };
const cameraOf = (transform: Transforms3d): GardenCamera => {
  'worklet';
  const parts = transform as unknown as [{ translateX: number }, { translateY: number }, { scale: number }];
  return { x: parts[0].translateX, y: parts[1].translateY, zoom: parts[2].scale };
};
const makeEmpty = () => { const recorder = Skia.PictureRecorder(); recorder.beginRecording(); const picture = recorder.finishRecordingAsPicture(); recorder.dispose(); return picture; };

// See gardenStaticRuns.ts. Skia's textures belong to the thread that made them, so the snapshot is taken
// on the UI thread that paints the canvas. Android keeps drawing its layers in place until it is tried on a device.
export default function GardenStaticRun(props: Props) {
  if (Platform.OS !== 'ios') return <Group transform={props.cameraTransform}>{props.children}</Group>;
  return <SnapshotRun {...props} />;
}

function SnapshotRun({ cameraTransform, width, height, order, children }: Props) {
  const landImages = useContext(LandImages);
  const density = PixelRatio.get();
  const [{ root, empty }] = useState(() => ({ root: new SkiaSGRoot(Skia as unknown as ConstructorParameters<typeof SkiaSGRoot>[0]), empty: makeEmpty() }));
  const world = useSharedValue<SkPicture | null>(null), snapshot = useSharedValue<Snapshot | null>(null);
  const still = useSharedValue<GardenCamera | null>(null), since = useSharedValue(0);
  // Set from the JS thread when the layers change; the UI thread, which made the snapshot, frees it.
  const stale = useSharedValue(false);
  const marginX = Math.round(width * MARGIN), marginY = Math.round(height * MARGIN);
  const showing = useDerivedValue(() => {
    const held = snapshot.value;
    if (!held || stale.value) return null;
    const camera = cameraOf(cameraTransform.value);
    return held.camera.zoom === camera.zoom && Math.abs(camera.x - held.camera.x) <= marginX && Math.abs(camera.y - held.camera.y) <= marginY ? held : null;
  });
  const transform = useDerivedValue<Transforms3d>(() => {
    const held = showing.value;
    if (!held) return cameraTransform.value;
    const camera = cameraOf(cameraTransform.value);
    return [{ translateX: Math.round((camera.x - held.camera.x) * density) / density }, { translateY: Math.round((camera.y - held.camera.y) * density) / density }];
  });
  const picture = useDerivedValue<SkPicture>(() => showing.value?.picture ?? world.value ?? empty);

  // Only a whole device pixel maps one to one; otherwise these layers simply stay live.
  const pixelWidth = (width + 2 * marginX) * density, pixelHeight = (height + 2 * marginY) * density;
  const exact = pixelWidth > 0 && pixelHeight > 0 && Number.isInteger(pixelWidth) && Number.isInteger(pixelHeight);
  useFrameCallback(frame => {
    if (stale.value) {
      stale.value = false;
      const dropped = snapshot.value;
      snapshot.value = null;
      if (dropped) requestAnimationFrame(() => requestAnimationFrame(() => { dropped.picture.dispose(); dropped.image.dispose(); }));
    }
    if (!exact) return;
    const camera = cameraOf(cameraTransform.value);
    if (!sameCamera(still.value, camera)) { still.value = camera; since.value = frame.timestamp; return; }
    // One run per frame: each waits its turn, so taking them never adds up.
    if (sameCamera(snapshot.value?.camera ?? null, camera) || frame.timestamp - since.value < SETTLE_MS + order * 50) return;
    const layers = world.value;
    if (!layers) return;
    const surface = Skia.Surface.MakeOffscreen(pixelWidth, pixelHeight);
    if (!surface) return;
    const canvas = surface.getCanvas();
    canvas.scale(density, density);
    canvas.translate(camera.x + marginX, camera.y + marginY);
    canvas.scale(camera.zoom, camera.zoom);
    canvas.drawPicture(layers);
    surface.flush();
    const image = surface.makeImageSnapshot();
    surface.dispose();
    const recorder = Skia.PictureRecorder();
    recorder.beginRecording().drawImageRectOptions(image, Skia.XYWHRect(0, 0, pixelWidth, pixelHeight), Skia.XYWHRect(-marginX, -marginY, width + 2 * marginX, height + 2 * marginY), FilterMode.Nearest, MipmapMode.None);
    const paste = recorder.finishRecordingAsPicture();
    recorder.dispose();
    const old = snapshot.value;
    snapshot.value = { picture: paste, image, camera };
    // A frame being painted may still name the old one: let the next ones replace it first. Hermes
    // would otherwise keep the pixels until some later collection.
    if (old) requestAnimationFrame(() => requestAnimationFrame(() => { old.picture.dispose(); old.image.dispose(); }));
  });
  useEffect(() => {
    const container = (root as unknown as { container: { redraw(): void } }).container, redraw = container.redraw;
    let alive = true;
    container.redraw = function (this: unknown) {
      redraw.call(this);
      if (alive) { world.value = root.getPicture(); stale.value = true; }
    };
    return () => { alive = false; void root.unmount(); };
  }, [root, stale, world]);
  useEffect(() => { stale.value = true; }, [stale, width, height]);
  useEffect(() => { void root.render(<LandImages.Provider value={landImages}>{children}</LandImages.Provider>); }, [root, landImages, children]);
  return <Group transform={transform}><Picture picture={picture} /></Group>;
}
