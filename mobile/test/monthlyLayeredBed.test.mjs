import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {loadPlantingModules} from './loadPlantingModules.mjs';
const storage=new Proxy({}, {get(){throw new Error('Layered bed must not access persistence');}});
const load=loadPlantingModules(storage),clean=x=>JSON.parse(JSON.stringify(x));
const model=load('../flower-density-sandbox/monthly-growth/monthlyGrowthModel');
const layered=load('../flower-density-sandbox/monthly-growth/layeredBedModel');
const catalog=load('../flower-density-sandbox/monthly-growth/growthCatalog');
const masks=load('approvedPlantingMasks');
const {validateFlowerPlacement}=load('placementValidator');
const {clusterGeometry,footprintPoints}=load('approvedFlowerClusters');
const {getFlowerPlacementDefinition}=load('flowerFootprintConfig');
const {alphaAt}=load('../flower-density-sandbox/monthly-growth/growthCoverage');
const records=model.monthlyGrowthRecords(6,30),base=model.buildMonthlyGrowth(records,6),before=JSON.stringify(base);
const scene=layered.buildLayeredBed(base,6),depth=layered.bedDepth(scene.mask.points);
assert.equal(layered.buildLayeredBed(base,6),scene,'Reuse the same derived composition when switching A/B');
assert.equal(JSON.stringify(base),before,'V1 remains byte-equivalent after building V1.1');
assert.deepEqual(clean(scene.records),clean(base.records));
assert.deepEqual(clean(scene.primary),clean(base.primary),'Every primary art transform is unchanged');
assert.equal(scene.mask,base.mask);assert.deepEqual(clean(scene.supportTargetIds),clean(base.supportTargetIds));
for(const kind of ['primary','companions','filler'])assert.equal(scene[kind].length,base[kind].length);
assert.equal(scene.pieces.length,591);assert.equal(scene.records.length,30);
assert.equal(crypto.createHash('sha256').update(JSON.stringify(scene.pieces)).digest('hex'),
  '347f5a41794341e6032d88db308928a76e2e0b7e893010e776cbce2f2cec0f5c',
  'Rendering-boundary correction must preserve the exact pre-correction V1.1 composition');
let fitting=0;
for(const f of records){
  const params={flowerId:f.id,speciesCode:f.speciesCode,month:6,worldX:f.worldX,worldY:f.worldY,existingPlacements:[],
    definition:{...getFlowerPlacementDefinition(f.speciesCode),footprintRadius:f.footprintRadius}};
  assert.ok(masks.isFootprintInApprovedMonthMaskWorld(6,f.worldX,f.worldY,f.footprintRadius));
  // Planting validates the whole approved cluster footprint against the same approved mask.
  const cluster=clusterGeometry({...f,month:6});
  const fits=footprintPoints(cluster.footprint).every(p=>masks.isPointInApprovedMonthMaskWorld(6,p.x,p.y));
  assert.equal(validateFlowerPlacement(params).isValid,fits,'Parent planting still uses approved validity');
  assert.equal(validateFlowerPlacement({...params,worldX:0,worldY:0}).isValid,false,'Outside parent placement rejected');
  if(!fits){assert.equal(validateFlowerPlacement(params).reason,'FOOTPRINT_OUTSIDE_REGION');continue;}
  fitting++;
  const occupied={id:f.id,flowerName:f.speciesCode,worldX:f.worldX,worldY:f.worldY};
  assert.equal(validateFlowerPlacement({...params,existingPlacements:[occupied]}).reason,'COLLIDES_WITH_FLOWER');
  assert.equal(validateFlowerPlacement({...params,existingPlacements:[occupied],ignorePlacementId:f.id}).isValid,true,'Adjust Position still ignores only its own footprint');
  assert.equal(validateFlowerPlacement({...params,worldX:0,worldY:0,existingPlacements:[occupied],ignorePlacementId:f.id}).isValid,false,'Adjust Position cannot bypass mask validation');
}
assert.ok(fitting>=10,`Whole clusters still fit at many bed parents (${fitting}/${records.length})`);
// Check visible alpha, not transparent PNG padding: botanical pixels already
// cross the mask in the unchanged composition and must be allowed to render.
for(const kind of ['primary','companion','filler']){
  const crosses=scene.pieces.filter(p=>p.kind===kind).some(p=>{
    const c=catalog.growthCatalog(p.speciesCode).lookup(p.componentId),[l,t,r,b]=c.contentBounds;
    for(let v=t;v<b;v+=8)for(let u=l;u<r;u+=8){
      const x=(u-c.anchorX*c.canvasWidth)*p.scale,y=(v-c.anchorY*c.canvasHeight)*p.scale;
      const wx=p.worldX+x*Math.cos(p.rotation)-y*Math.sin(p.rotation),wy=p.worldY+x*Math.sin(p.rotation)+y*Math.cos(p.rotation);
      if(alphaAt(p,wx,wy)>.5&&!masks.isPointInApprovedMonthMaskWorld(6,wx,wy))return true;
    }
    return false;
  });
  assert.ok(crosses,`${kind} visible artwork may extend outside the Final Mask`);
}
assert.deepEqual(clean(scene.pieces.map(p=>p.id)),clean(base.pieces.map(p=>p.id)),'No new visual identities');
assert.ok(Math.abs(scene.approvedMaskCoverage-base.approvedMaskCoverage)<.02,'Density stays within two percentage points');
assert.ok(scene.approvedMaskCoverage<=base.approvedMaskCoverage+.005,'No increased coverage target');
for(const piece of scene.pieces){
  assert.equal(piece.interactive,false);
  assert.equal(piece.speciesCode,records.find(f=>f.id===piece.parentId).speciesCode);
  assert.equal(piece.parentId,base.pieces.find(p=>p.id===piece.id).parentId);
  if(piece.kind!=='primary'){
    const p=layered.botanicalCenter(piece);
    assert.ok(masks.isPointInApprovedMonthMaskWorld(6,p.x,p.y));
  }
}
const average=values=>values.reduce((a,b)=>a+b,0)/values.length;
const centerDepth=p=>depth(layered.botanicalCenter(p));
const height=p=>{const c=catalog.growthCatalog(p.speciesCode).lookup(p.componentId);return (c.contentBounds[3]-c.contentBounds[1])*p.scale;};
const tall=scene.companions.filter(p=>['LAVENDER','COREOPSIS'].includes(p.speciesCode));
const low=scene.companions.filter(p=>['CHAMOMILE','DAISY'].includes(p.speciesCode));
assert.ok(average(tall.map(centerDepth))+.25<average(low.map(centerDepth)),'Tall back / low inner edge');
assert.ok(average(tall.map(height))>average(low.map(height))*1.4,'Actual height hierarchy');
assert.ok(Math.max(...tall.map(height))-Math.min(...tall.map(height))>12,'Irregular tall skyline');
const hydrangea=scene.companions.filter(p=>p.speciesCode==='HYDRANGEA');
const heads=hydrangea.filter(p=>!p.componentId.startsWith('foliage/')).map(layered.botanicalCenter).sort((a,b)=>a.x-b.x);
let pockets=1;for(let i=1;i<heads.length;i++)if(heads[i].x-heads[i-1].x>45)pockets++;
assert.equal(pockets,3,'Three separated heavy focal pockets');assert.equal(heads.length,8);
const rootCover=scene.filler.filter(p=>p.baseCover);assert.equal(rootCover.length,44);
assert.ok(rootCover.some(p=>{const c=layered.botanicalCenter(p);return records.some(f=>f.speciesCode!==p.speciesCode&&Math.hypot(f.worldX-c.x,f.worldY-c.y)<20);}), 'Different species interpenetrate at neighboring bases');
for(const p of scene.filler.filter(p=>p.speciesCode==='DAISY'&&!p.baseCover))assert.ok(layered.fillerPocket(layered.botanicalCenter(p))>.599,'White filler confined to uneven pockets');
for(const p of scene.filler.filter(p=>p.speciesCode==='CHAMOMILE'))assert.ok(p.componentId.startsWith('foliage/'),'Use existing leaves rather than uniform white speckles');
assert.equal(scene.emotionEffects,false);
assert.equal(layered.buildLayeredBed(base,4),base,'No April V1.1 behavior');
assert.equal(layered.buildLayeredBed(base,10),base,'No October V1.1 behavior');
const early=model.buildMonthlyGrowth(model.monthlyGrowthRecords(6,5),6);
assert.equal(layered.buildLayeredBed(early,6),early,'Only June Day 30');
const freshLoad=loadPlantingModules(storage),fresh=freshLoad('../flower-density-sandbox/monthly-growth/layeredBedModel');
assert.deepEqual(clean(fresh.buildLayeredBed({...base,records:[...base.records].reverse()},6).pieces),clean(scene.pieces),'Seeded reload and record-order independence');
const area=load('../flower-density-sandbox/flowerDensityModel').getRegionInfo(6).estimatedArea;
fs.writeFileSync(new URL('../../output/monthly-layered-bed-geometry.json',import.meta.url),JSON.stringify([
  {version:'V1',month:6,area,points:base.mask.points,pieces:base.pieces,sampledCoverage:base.approvedMaskCoverage},
  {version:'V1.1',month:6,area,points:scene.mask.points,pieces:scene.pieces,sampledCoverage:scene.approvedMaskCoverage}]));
console.log(JSON.stringify({records:30,primary:scene.primary.length,companions:scene.companions.length,filler:scene.filler.length,
  rootCover:rootCover.length,focalPockets:pockets,v1Coverage:base.approvedMaskCoverage,v11Coverage:scene.approvedMaskCoverage,
  tallDepth:average(tall.map(centerDepth)),lowDepth:average(low.map(centerDepth))}));
console.log('June layered bed: exact pre-correction composition, unchanged parents/counts, deterministic children, anchor/footprint validation, outside-placement rejection, unchanged collisions/adjustment, visible artwork crossing the mask, layering and parent-only semantics passed.');
