import { FilterMode, Group, MipmapMode, Picture, Skia, type SkImage, type SkPicture, type Transforms3d } from '@shopify/react-native-skia';
import { SkiaSGRoot } from '@shopify/react-native-skia/lib/module/sksg/Reconciler';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { PixelRatio, Platform } from 'react-native';
import { useDerivedValue, useFrameCallback, useSharedValue, type DerivedValue } from 'react-native-reanimated';
import { LandImages } from './LandLayer';
import { sameCamera, SETTLE_MS, type GardenCamera } from './gardenStaticRuns';

type Snapshot = { picture: SkPicture; image: SkImage; camera: GardenCamera };
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
  const showing = useDerivedValue(() => {
    const held = snapshot.value;
    return held && sameCamera(held.camera, cameraOf(cameraTransform.value)) ? held : null;
  });
  const transform = useDerivedValue<Transforms3d>(() => showing.value ? [{ translateX: 0 }] : cameraTransform.value);
  const picture = useDerivedValue<SkPicture>(() => showing.value?.picture ?? world.value ?? empty);

  // Only a whole device pixel maps one to one; otherwise these layers simply stay live.
  const pixelWidth = width * density, pixelHeight = height * density;
  const exact = pixelWidth > 0 && pixelHeight > 0 && Number.isInteger(pixelWidth) && Number.isInteger(pixelHeight);
  useFrameCallback(frame => {
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
    canvas.translate(camera.x, camera.y);
    canvas.scale(camera.zoom, camera.zoom);
    canvas.drawPicture(layers);
    surface.flush();
    const image = surface.makeImageSnapshot();
    surface.dispose();
    const recorder = Skia.PictureRecorder();
    recorder.beginRecording().drawImageRectOptions(image, Skia.XYWHRect(0, 0, pixelWidth, pixelHeight), Skia.XYWHRect(0, 0, width, height), FilterMode.Nearest, MipmapMode.None);
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
      if (alive) { world.value = root.getPicture(); snapshot.value = null; }
    };
    return () => { alive = false; void root.unmount(); };
  }, [root, snapshot, world]);
  useEffect(() => { snapshot.value = null; }, [snapshot, width, height]);
  useEffect(() => { void root.render(<LandImages.Provider value={landImages}>{children}</LandImages.Provider>); }, [root, landImages, children]);
  return <Group transform={transform}><Picture picture={picture} /></Group>;
}
