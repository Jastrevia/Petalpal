import { CanonicalFlowerArt } from './CanonicalFlowerArt';
import { GardenMoodEffectsLayer } from '../flower-mood-effects/GardenMoodEffects';
import {runtimeAudit} from '../performance/runtimeAudit';
import { Circle, Group, Oval, Rect } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { usePlanting } from './PlantingContext';
import { flowerInDepthPass, type FlowerDepthPass } from '../flowerOcclusion';
import { gardenSpecies } from './productionGrowth';
import { clusterGeometry, placementFootprint, type ClusterGeometry, type Footprint } from './approvedFlowerClusters';
import { ClusterFlower, clusterImageKey, useClusterImages } from './ClusterFlowerArt';
import type { FlowerPlacementRecord } from './plantingPersistence';

export function growthPreviewParents(placements:readonly FlowerPlacementRecord[],target:FlowerPlacementRecord|null,
  preview:{worldX:number;worldY:number}|null,adjusting:boolean) {
  return adjusting&&target&&preview?placements.map(p=>p.id===target.id?{...p,...preview}:p):placements;
}
const ovalRect=(f:Footprint)=>({x:f.cx-f.rx,y:f.cy-f.ry,width:f.rx*2,height:f.ry*2});

/** One planted flower record = one complete approved cluster image. The previous
 * procedural bed (companions/filler scattered around a parent) is no longer drawn. */
export function ProductionPlantedFlowers({depthPass='all'}:{depthPass?:FlowerDepthPass}) {
  runtimeAudit.render('ProductionPlantedFlowers');
  const {placements,activeMode,targetFlower,previewCoords,previewLandId,validationResult,showDevFootprints,showDevHitboxes,
    accountTimeZone,gardenOwnerUserId,currentUserId}=usePlanting();
  const parents=placements;
  // While planting or adjusting, the flower is shown only at its preview pose (never twice).
  const moving=activeMode!=='normal'&&targetFlower?targetFlower.id:null;
  const committed=useMemo(()=>parents.filter(p=>p.id!==moving&&flowerInDepthPass(p.month,depthPass))
    .sort((a,b)=>a.worldY-b.worldY||a.id.localeCompare(b.id))
    .map(p=>({record:p,geometry:clusterGeometry(p)})),[parents,moving,depthPass]);
  const preview=activeMode!=='normal'&&targetFlower&&previewCoords&&flowerInDepthPass(targetFlower.month,depthPass)
    ?{...targetFlower,...previewCoords,landId:previewLandId??targetFlower.landId}:null;
  const previewGeometry:ClusterGeometry|null=useMemo(()=>preview?clusterGeometry(preview):null,
    [preview?.worldX,preview?.worldY,preview?.landId,preview?.speciesCode,preview?.flowerName,preview?.scale,preview?.rotation]);
  const {images,loaders}=useClusterImages([...committed.map(c=>c.geometry),previewGeometry]);
  const color=validationResult?.isValid?'#22c55e':'#ef4444';
  // The partner's mood effects, today only and on the owner's own Garden (account timezone).
  const own=!gardenOwnerUserId||gardenOwnerUserId===currentUserId;
  const moodFlowers=useMemo(()=>own?parents.filter(p=>(p.sourceType||p.sourceEventId)&&gardenSpecies(p)&&flowerInDepthPass(p.month,depthPass)):[],
    [own,parents,depthPass]);
  const previewFootprint=preview?(previewGeometry?.footprint??placementFootprint(preview)):null;
  return <Group>
    {loaders}
    <GardenMoodEffectsLayer flowers={moodFlowers} timeZone={accountTimeZone} part="behind"/>
    {committed.map(({record:p,geometry:g})=>g?<ClusterFlower key={p.id} geometry={g} anchor={p} image={images[clusterImageKey(g)]}/>
      :p.sourceType||p.sourceEventId?<CanonicalFlowerArt key={p.id} flower={p}/>
      :__DEV__?<Circle key={p.id} cx={p.worldX} cy={p.worldY} r={4} color="#a6643c" style="stroke" strokeWidth={1.5}/>:null)}
    {preview&&previewFootprint&&<Group>
      <Oval rect={ovalRect(previewFootprint)} color={color} opacity={.22}/>
      <Oval rect={ovalRect(previewFootprint)} color={color} style="stroke" strokeWidth={2.5}/>
      {previewGeometry?<ClusterFlower geometry={previewGeometry} anchor={preview} image={images[clusterImageKey(previewGeometry)]}
        opacity={validationResult?.isValid?.92:.65}/>:preview.sourceType||preview.sourceEventId?<CanonicalFlowerArt flower={preview}/>:null}
    </Group>}
    <GardenMoodEffectsLayer flowers={moodFlowers} timeZone={accountTimeZone} part="front"/>
    {__DEV__&&showDevFootprints&&committed.map(({record:p})=><Oval key={`fp-${p.id}`} rect={ovalRect(placementFootprint(p))}
      color="#38bdf8" style="stroke" strokeWidth={1}/>)}
    {__DEV__&&showDevHitboxes&&committed.map(({record:p,geometry:g})=>g?<Rect key={`hb-${p.id}`}
      x={g.drawX+g.art.solid[0]*g.k} y={g.drawY+g.art.solid[1]*g.k} width={(g.art.solid[2]-g.art.solid[0])*g.k}
      height={(g.art.solid[3]-g.art.solid[1])*g.k} color="#f472b6" style="stroke" strokeWidth={1}/>:null)}
  </Group>;
}
