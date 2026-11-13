import { FilterMode, Group, MipmapMode, Picture, Skia, type SkImage, type SkPicture, type Transforms3d } from '@shopify/react-native-skia';
import { SkiaSGRoot } from '@shopify/react-native-skia/lib/module/sksg/Reconciler';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { PixelRatio, Platform } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue, type DerivedValue } from 'react-native-reanimated';
import { LandImages } from './LandLayer';
import { planSnapshotReach, sameCamera, SETTLE_MS, snapshotReachAt, snapshotStillBest, type GardenCamera, type SnapshotReach } from './gardenStaticRuns';
import { GARDEN_WORLD_BOUNDS } from './rendering/gardenWorldBounds';

// A snapshot reaches past each edge of the screen (planSnapshotReach), so a drag only slides it along and
// repaints nothing. Past that, or at a new zoom, the layers are drawn as usual until the camera rests
// again. Slides land on whole device pixels, so the art stays exactly as sharp.
type Snapshot = { picture: SkPicture; image: SkImage; camera: GardenCamera; reach: SnapshotReach };
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
  const showing = useDerivedValue(() => {
    const held = snapshot.value;
    if (!held || stale.value) return null;
    const camera = cameraOf(cameraTransform.value);
    return snapshotReachAt(held.camera, held.reach, camera) ? held : null;
  });
  const transform = useDerivedValue<Transforms3d>(() => {
    const held = showing.value;
    if (!held) return cameraTransform.value;
    const camera = cameraOf(cameraTransform.value);
    return [{ translateX: Math.round((camera.x - held.camera.x) * density) / density }, { translateY: Math.round((camera.y - held.camera.y) * density) / density }];
  });
  const picture = useDerivedValue<SkPicture>(() => showing.value?.picture ?? world.value ?? empty);

  // Only a whole device pixel maps one to one; otherwise these layers simply stay live.
  const exact = width > 0 && height > 0 && Number.isInteger(width * density) && Number.isInteger(height * density);
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
    if (frame.timestamp - since.value < SETTLE_MS + order * 50) return;
    const held = snapshot.value, reach = planSnapshotReach(camera, width, height, GARDEN_WORLD_BOUNDS);
    // A drag that stayed on the snapshot usually leaves it as good as a new one: then nothing is drawn at all.
    if (held && snapshotStillBest(snapshotReachAt(held.camera, held.reach, camera), reach)) return;
    const spanX = width + reach.left + reach.right, spanY = height + reach.top + reach.bottom;
    const pixelWidth = spanX * density, pixelHeight = spanY * density;
    const layers = world.value;
    if (!layers) return;
    const surface = Skia.Surface.MakeOffscreen(pixelWidth, pixelHeight);
    if (!surface) return;
    const canvas = surface.getCanvas();
    canvas.scale(density, density);
    canvas.translate(camera.x + reach.left, camera.y + reach.top);
    canvas.scale(camera.zoom, camera.zoom);
    canvas.drawPicture(layers);
    surface.flush();
    const image = surface.makeImageSnapshot();
    surface.dispose();
    const recorder = Skia.PictureRecorder();
    recorder.beginRecording().drawImageRectOptions(image, Skia.XYWHRect(0, 0, pixelWidth, pixelHeight), Skia.XYWHRect(-reach.left, -reach.top, spanX, spanY), FilterMode.Nearest, MipmapMode.None);
    const paste = recorder.finishRecordingAsPicture();
    recorder.dispose();
    const old = snapshot.value;
    snapshot.value = { picture: paste, image, camera, reach };
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
