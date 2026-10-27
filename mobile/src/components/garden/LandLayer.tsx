import { Platform } from 'react-native';
import { Group, Image, Rect, useImage } from '@shopify/react-native-skia';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { SkImage } from '@shopify/react-native-skia';
import GardenStaticPicture from './GardenStaticPicture';
import type { GardenLoadStore } from './loading/gardenReadiness';
import { GARDEN_LANDS, type GardenLand, type GardenLandLayout } from './gardenMapLayout';
import GardenShoreContact, { makeShoreCoverage } from './water/GardenShoreContact';

// The shore and opaque passes share the same decoded artwork and GPU texture.
// Keep loading in this owning scene root, outside cached static recordings.
const LandImages = createContext<ReadonlyMap<unknown, SkImage | null> | null>(null);
export function GardenLandResources({ children, loadStore }: { children: ReactNode; loadStore: GardenLoadStore }) {
  const errors = useMemo(() => GARDEN_LANDS.slice(0, 7).map(land => () => loadStore.reportFailure(`island ${land.id}`)), [loadStore]);
  const central = useImage(GARDEN_LANDS[0].source, errors[0]);
  const upper = useImage(GARDEN_LANDS[1].source, errors[1]);
  const june = useImage(GARDEN_LANDS[2].source, errors[2]);
  const july = useImage(GARDEN_LANDS[3].source, errors[3]);
  const august = useImage(GARDEN_LANDS[4].source, errors[4]);
  const september = useImage(GARDEN_LANDS[5].source, errors[5]);
  const autumn = useImage(GARDEN_LANDS[6].source, errors[6]);
  const images = useMemo(() => new Map(GARDEN_LANDS.slice(0, 7).map((land, index) =>
    [land.source, [central, upper, june, july, august, september, autumn][index]])),
  [central, upper, june, july, august, september, autumn]);
  const loaded = [central, upper, june, july, august, september, autumn].filter(Boolean).length;
  useEffect(() => { loadStore.publishLandsLoaded(loaded, 7); }, [loadStore, loaded]);
  useEffect(() => () => loadStore.publishLandsLoaded(0, 7), [loadStore]);
  return <LandImages.Provider value={images}>{children}</LandImages.Provider>;
}

function Land({ land, selected, renderPass }: { land: GardenLand; selected: boolean; renderPass: 'shore' | 'land' }) {
  const shared = useContext(LandImages);
  const fallback = useImage(shared?.has(land.source) ? null : land.source);
  const image = shared?.has(land.source) ? shared.get(land.source) : fallback;
  const coverage = useMemo(() => renderPass === 'shore' && Platform.OS === 'web' && image ? makeShoreCoverage(image,land.width) : null, [image,land.width,renderPass]);
  const images = useMemo(() => image ? coverage ? [image,coverage] : [image] : [], [image,coverage]);
  const drawing = useMemo(() => {
    if (!image) return null;
    // Keep the exact original alpha-contact shader and source sampling.
    const height = land.width * image.height() / image.width();
    const centerX = land.x + land.width / 2, centerY = land.y + height / 2;
    return <Group transform={[
      { translateX: centerX }, { translateY: centerY },
      { rotate: land.rotation * Math.PI / 180 },
      { translateX: -centerX }, { translateY: -centerY },
    ]}>
      {renderPass === 'shore' ? <GardenShoreContact coverage={coverage} image={image} x={land.x} y={land.y} width={land.width} height={height} />
        : <Image image={image} x={land.x} y={land.y} width={land.width} height={height} fit="contain" />}
      {renderPass === 'land' && __DEV__ && selected && <Group>
        <Rect x={land.x} y={land.y} width={land.width} height={height}
          color="#FFE36E" style="stroke" strokeWidth={6} />
      </Group>}
    </Group>;
  }, [image, land, selected, coverage, renderPass]);
  return drawing ? <GardenStaticPicture images={images}>{drawing}</GardenStaticPicture> : null;
}

type LandLayerProps = {
  renderPass?: 'shore' | 'land';
  layout?: GardenLandLayout;
  selectedLandId?: string | null;
};

export default function LandLayer({ layout = GARDEN_LANDS, selectedLandId = null, renderPass = 'land' }: LandLayerProps) {
  const orderedLands = [...layout].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <Group>
      {orderedLands.map((land) => (
        <Land key={land.id} land={land} selected={land.id === selectedLandId} renderPass={renderPass} />
      ))}
    </Group>
  );
}
