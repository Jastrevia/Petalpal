import { Group, useImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import SheetFrame from '../SheetFrame';
import { clipToWorld, useDogHouseState } from '../dogHouseState';
import { FADE_SECONDS } from './critterVisits';

// The puppy and the Maltese going into their house and resting in it (dogHouseState.ts). The clip
// (oil-motion, 2026-11-21, packed by scripts/critters/pack-dog-house.py) is the two dogs alone, cut
// from the painted courtyard: the golden gets up, walks in and the Maltese trots after it, and they
// lie down together on the rug, seen through the doorway; the house's front walls hide the rest, as
// in the clip, because the Garden's own house is drawn under it. While they are inside, its last
// frame stays; when the weather clears it fades out as they come back out of the door.
// `crop` is where the cells sit on the clip's key frame (CLIP_KEY), in key-frame pixels.
const CLIP = {
  source: require('@/assets/garden/landmarks/dog-house/dogs-enter.webp'),
  columns: 8, count: 63, w: 398, h: 228, crop: { x: 388, y: 353, w: 723, h: 415 },
};
const FPS = 12;
/** How long the dogs take to go in (the clip at its 12 frames a second). */
export const HOUSE_ENTER_SECONDS = CLIP.count / FPS;

export default function DogHouseOccupants({ clock }: { clock: SharedValue<number> }) {
  const house = useDogHouseState();
  const reduced = useReducedMotion();
  // Kept a moment after they come out, to fade out under them.
  const [leaving, setLeaving] = useState(false);
  const [wasIn, setWasIn] = useState(false);
  if (house.phase !== 'out' && !wasIn) setWasIn(true);
  if (house.phase === 'out' && wasIn) { setWasIn(false); setLeaving(true); }
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), FADE_SECONDS * 1000 + 100);
    return () => clearTimeout(timer);
  }, [leaving]);
  const shown = house.phase !== 'out' || leaving;
  const sheet = useImage(shown || house.phase === 'out' ? CLIP.source : null);
  const { phase, since } = house;
  const frame = useDerivedValue(() => {
    if (phase !== 'entering' || reduced) return CLIP.count - 1;
    return Math.max(0, Math.min(CLIP.count - 1, Math.floor((clock.value - since) * FPS)));
  }, [phase, since, reduced]);
  const opacity = useDerivedValue(() => (phase === 'out' ? Math.max(0, 1 - (clock.value - since) / FADE_SECONDS) : 1), [phase, since]);
  const transform = useMemo(() => {
    const map = clipToWorld();
    return [{ translateX: map.x(CLIP.crop.x) }, { translateY: map.y(CLIP.crop.y) },
      { scaleX: (map.k * CLIP.crop.w) / CLIP.w }, { scaleY: (map.k * CLIP.crop.h) / CLIP.h }];
  }, []);
  if (!shown || !sheet) return null;
  return <Group opacity={opacity} transform={transform}>
    <SheetFrame sheet={sheet} frame={frame} columns={CLIP.columns} count={CLIP.count} w={CLIP.w} h={CLIP.h} />
  </Group>;
}
