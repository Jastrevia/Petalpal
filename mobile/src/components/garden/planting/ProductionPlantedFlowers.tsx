import { CanonicalFlowerArt } from './CanonicalFlowerArt';
import { GardenMoodEffectsLayer } from '../flower-mood-effects/GardenMoodEffects';
import {runtimeAudit} from '../performance/runtimeAudit';
import { BlurMask, Circle, Group, Image, Oval, useImage, type SkImage } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { Snowy } from '../weather/SnowLayer';
import { gardenWeatherSeconds, gardenWind, useWindBendsFlowers, windGust } from '../weather/gardenWeather';
import { usePlanting } from './PlantingContext';
import { flowerInDepthPass, type FlowerDepthPass } from '../flowerOcclusion';
import GardenStaticPicture from '../GardenStaticPicture';
import { clusterDrawing, clusterFootprintRadius, hasClusterArt } from './flowerClusters';
import { awaitsPlanting, type FlowerPlacementRecord } from './plantingPersistence';

const ClusterLoader = memo(function ClusterLoader({ source, onLoad }: { source: number; onLoad: (source: number, image: SkImage) => void }) {
  const image = useImage(source);
  useEffect(() => { if (image) onLoad(source, image); }, [image, source, onLoad]);
  return null;
});

/**
 * A cluster bending in the wind from its root: the stems shear downwind (the base stays planted)
 * and spring back, and each gust band that crosses the Garden bends the beds it passes in turn.
 */
function Bending({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const transform = useDerivedValue(() => {
    const t = gardenWeatherSeconds.value, wind = gardenWind.value;
    const gust = windGust(x, y, t);
    const flutter = Math.sin(t * (2.1 + wind * 2.4) + x * 0.031 + y * 0.017);
    const bend = wind * (0.05 + 0.2 * gust) + wind * (0.03 + 0.06 * gust) * flutter;
    // Points above the root have negative y, so a negative skew carries the tops downwind (+x).
    return [{ skewX: -bend }, { scaleY: 1 - Math.abs(bend) * 0.12 }];
  });
  return <Group origin={{ x, y }} transform={transform}>{children}</Group>;
}

/** One painted cluster per planted flower, standing on its planting point, back to front. */
function ClusterBed({ flowers, cacheStatic = false }: { flowers: readonly FlowerPlacementRecord[]; cacheStatic?: boolean }) {
  const [images, setImages] = useState<Record<string, SkImage>>({});
  const onLoad = useCallback((source: number, image: SkImage) => setImages(previous =>
    previous[source] === image ? previous : { ...previous, [source]: image }), []);
  const drawn = useMemo(() => [...flowers].sort((a, b) => a.worldY - b.worldY || a.id.localeCompare(b.id))
    .map(flower => ({ flower, cluster: clusterDrawing(flower) })), [flowers]);
  const sources = useMemo(() => [...new Set(drawn.flatMap(({ cluster }) => cluster ? [cluster.source] : []))], [drawn]);
  const complete = sources.every(source => images[source]);
  const bending = useWindBendsFlowers();
  const drawing = useMemo(() => <Group>
    {drawn.map(({ flower, cluster }) => {
      if (!cluster) return flower.sourceType || flower.sourceEventId ? <CanonicalFlowerArt key={flower.id} flower={flower} />
        : __DEV__ ? <Circle key={flower.id} cx={flower.worldX} cy={flower.worldY} r={4} color="#a6643c" style="stroke" strokeWidth={1.5}/> : null;
      const image = images[cluster.source];
      const art = <Image image={image} x={cluster.x} y={cluster.y} width={cluster.width} height={cluster.height} fit="fill" />;
      return image ? <Group key={flower.id}>
        <Oval x={flower.worldX - cluster.width * .4} y={flower.worldY - cluster.width * .07} width={cluster.width * .8}
          height={cluster.width * .16} color="#2f3f22" opacity={.2}><BlurMask blur={2.5} style="normal"/></Oval>
        {bending ? <Bending x={flower.worldX} y={flower.worldY}>{art}</Bending> : art}
      </Group> : null;
    })}
  </Group>, [drawn, images, bending]);
  return <Group>
    {sources.map(source => <ClusterLoader key={source} source={source} onLoad={onLoad} />)}
    <Snowy>{cacheStatic && complete && !bending ? <GardenStaticPicture images={Object.values(images)}>{drawing}</GardenStaticPicture> : drawing}</Snowy>
  </Group>;
}

export function ProductionPlantedFlowers({depthPass='all'}:{depthPass?:FlowerDepthPass}) {
  runtimeAudit.render('ProductionPlantedFlowers');
  const {placements,activeMode,targetFlower,previewCoords,validationResult,showDevFootprints,showDevHitboxes,
    accountTimeZone,gardenOwnerUserId,currentUserId}=usePlanting();
  // While a flower is being planted, it shows only as the ghost where the owner tapped; an Event
  // flower nobody has planted yet is not drawn at all.
  const plantingId=activeMode==='planting'?targetFlower?.flowerId:undefined;
  const planted=useMemo(()=>placements.filter(p=>flowerInDepthPass(p.month,depthPass)&&p.flowerId!==plantingId&&!awaitsPlanting(p)),
    [placements,depthPass,plantingId]);
  // The unconfirmed ghost is drawn on its own and never joins the planted bed.
  const pending=useMemo(()=>activeMode==='planting'&&targetFlower&&previewCoords&&flowerInDepthPass(targetFlower.month,depthPass)
    ?[{...targetFlower,...previewCoords}]:[],[activeMode,targetFlower,previewCoords,depthPass]);
  // Gold for a good spot; a soft rose (never an alarm red) where it can't grow.
  const color=validationResult?.isValid?'#C9A96E':'#D9A0B0';
  // The partner's mood effects, today only and on the owner's own Garden (account timezone).
  const own=!gardenOwnerUserId||gardenOwnerUserId===currentUserId;
  const moodFlowers=useMemo(()=>own?planted.filter(p=>(p.sourceType||p.sourceEventId)&&hasClusterArt(p.speciesCode,p.flowerName)):[],
    [own,planted]);
  return <Group>
    <GardenMoodEffectsLayer flowers={moodFlowers} timeZone={accountTimeZone} part="behind"/>
    <ClusterBed flowers={planted} cacheStatic/>
    {pending.length>0&&<Group opacity={validationResult?.isValid ? .6 : .32}><ClusterBed flowers={pending}/></Group>}
    <GardenMoodEffectsLayer flowers={moodFlowers} timeZone={accountTimeZone} part="front"/>
    {pending.map(p=><Group key="preview-ring">
      <Circle cx={p.worldX} cy={p.worldY} r={clusterFootprintRadius(p.month)+4} color={color} opacity={.18}/>
      <Circle cx={p.worldX} cy={p.worldY} r={clusterFootprintRadius(p.month)} color={color} opacity={.85} style="stroke" strokeWidth={2}/>
    </Group>)}
    {__DEV__&&(showDevFootprints||showDevHitboxes)&&planted.map(p=><Circle key={p.id}
      cx={p.worldX} cy={p.worldY} r={clusterFootprintRadius(p.month)} color="#38bdf8" style="stroke" strokeWidth={1}/>)}
  </Group>;
}
