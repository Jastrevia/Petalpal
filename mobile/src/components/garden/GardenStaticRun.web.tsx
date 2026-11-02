import { FilterMode, Group, MipmapMode, Picture, Skia, type SkImage, type SkPicture, type Transforms3d } from '@shopify/react-native-skia';
import { SkiaSGRoot } from '@shopify/react-native-skia/lib/module/sksg/Reconciler';
import { SkiaViewNativeId } from '@shopify/react-native-skia/lib/module/views/SkiaViewNativeId';
import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDerivedValue, useSharedValue, type DerivedValue } from 'react-native-reanimated';
import { LandImages } from './LandLayer';
import { afterNextFrames, sameCamera, StaticRunContext, type GardenCamera } from './gardenStaticRuns';

type Snapshot = { picture: SkPicture; image: SkImage; camera: GardenCamera };

const makeEmpty = () => { const recorder = Skia.PictureRecorder(); recorder.beginRecording(); const picture = recorder.finishRecordingAsPicture(); recorder.dispose(); return picture; };
const cameraOf = (transform: Transforms3d): GardenCamera => {
  const parts = transform as unknown as [{ translateX: number }, { translateY: number }, { scale: number }];
  return { x: parts[0].translateX, y: parts[1].translateY, zoom: parts[2].scale };
};

// Its layers live in their own Skia root, so their recording can be drawn with or without the rest of the Garden.
// Must sit outside the camera groups: it applies the camera itself, and none at all to a snapshot.
export default function GardenStaticRun({ cameraTransform, children }: { cameraTransform: DerivedValue<Transforms3d>; children: ReactNode }) {
  const context = useContext(StaticRunContext), landImages = useContext(LandImages);
  const [{ nativeId, root, empty }] = useState(() => {
    const id = SkiaViewNativeId.current++;
    return { nativeId: id, root: new SkiaSGRoot(Skia as unknown as ConstructorParameters<typeof SkiaSGRoot>[0], id), empty: makeEmpty() };
  });
  const world = useSharedValue<SkPicture | null>(null), snapshot = useSharedValue<Snapshot | null>(null);
  const showing = useDerivedValue(() => {
    const held = snapshot.value;
    return held && sameCamera(held.camera, cameraOf(cameraTransform.value)) ? held : null;
  });
  const transform = useDerivedValue<Transforms3d>(() => showing.value ? [{ translateX: 0 }] : cameraTransform.value);
  const picture = useDerivedValue<SkPicture>(() => showing.value?.picture ?? world.value ?? empty);

  const run = useMemo(() => {
    const drop = (held: Snapshot | null) => { if (held) afterNextFrames(() => { held.picture.dispose(); held.image.dispose(); }); };
    const invalidate = () => { const held = snapshot.value; snapshot.value = null; drop(held); return !!held; };
    return {
      camera: () => cameraOf(cameraTransform.value), picture: () => world.value, snapshotCamera: () => snapshot.value?.camera ?? null, invalidate,
      setWorld(next: SkPicture) { world.value = next; invalidate(); },
      capture(from: SkPicture, camera: GardenCamera) {
        const made = context?.snapshot(from, camera);
        if (!made) return;
        const recorder = Skia.PictureRecorder();
        const canvas = recorder.beginRecording();
        // One device pixel to one device pixel: the renderer's scale takes this CSS rectangle exactly onto the canvas.
        canvas.drawImageRectOptions(made.image, Skia.XYWHRect(0, 0, made.image.width(), made.image.height()), Skia.XYWHRect(0, 0, made.width, made.height), FilterMode.Nearest, MipmapMode.None);
        const paste = recorder.finishRecordingAsPicture();
        recorder.dispose();
        const held = snapshot.value;
        snapshot.value = { picture: paste, image: made.image, camera };
        drop(held);
      },
    };
  }, [cameraTransform, context, snapshot, world]);
  useEffect(() => context?.register(nativeId, run.setWorld), [context, nativeId, run]);
  useEffect(() => context?.host.add(run), [context, run]);
  useEffect(() => () => { run.invalidate(); void root.unmount(); }, [root, run]);
  useEffect(() => { void root.render(<LandImages.Provider value={landImages}>{children}</LandImages.Provider>); }, [root, landImages, children]);
  return <Group transform={transform}><Picture picture={picture} /></Group>;
}
