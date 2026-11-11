import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ROOT,load,footprints,masks,metas,staticData,scenarios,buildDomain,search,polish,tangentSearch,validate,radius,hash,clearance} from '../scripts/productionCapacityAudit.mjs';
const output=new URL('output/production-capacity-audit/',ROOT);
const inputs=JSON.parse(fs.readFileSync(new URL('locked-inputs.json',output)));
for(const [path,expected] of Object.entries(inputs))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(path,ROOT))).digest('hex'),expected,path);
for(const [path,expected] of Object.entries(staticData.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(path,ROOT))).digest('hex'),expected,path);
assert.deepEqual(Object.fromEntries(Object.entries(footprints.FLOWER_PLACEMENT_DEFINITIONS).map(([k,v])=>[k,v.footprintRadius])),
  {default:22,Sunflower:24,Tulip:20,Lotus:22,Lavender:20,'Cherry Blossom':22});
assert.equal(radius({flowerName:'pink',speciesCode:'TULIP'}),22,'Production uses flowerName, not visual speciesCode');
assert.equal(radius({flowerName:'purple'}),22);
assert.equal(radius({flowerName:'ORANGE_TULIP'}),20);
const plain=x=>JSON.parse(JSON.stringify(x));
let scenariosChecked=0,parentsChecked=0;
for(let month=1;month<=12;month++){
  assert.equal(masks.APPROVED_MASK_REFINEMENTS[month].month,month);
  assert.equal(masks.APPROVED_MASK_CALIBRATION[month].landId,metas[month].landId);
  const land=JSON.parse(fs.readFileSync(new URL(`land${String(month).padStart(2,'0')}.json`,output)));
  assert.equal(land.semanticHash,hash(land.results.map(({elapsedMs,...r})=>r)));
  const domain=buildDomain(month);assert.deepEqual(domain.counts,land.domain.counts);
  for(const scenario of scenarios(month)){
    assert.equal(scenario.records.length,30);assert.equal(new Set(scenario.records.map(p=>p.id)).size,30);
    assert.ok(scenario.records.every(p=>[20,22,24].includes(radius(p))));
    const expected=land.results.find(r=>r.scenario===scenario.scenario);
    let rerun=search(domain,scenario.records);
    if(rerun.placed.length<30)rerun=polish(domain,scenario.records,rerun);
    if(expected.tangentAttempts)rerun=tangentSearch(domain,scenario.records,rerun);
    assert.deepEqual(plain(rerun.placed),expected.placed,`${month}/${scenario.scenario} deterministic full search`);
    assert.equal(rerun.minClearance,expected.minClearance);
    if(expected.margin2px){
      const margin=search(domain,scenario.records,{attempts:48,gap:2,repair:48});
      assert.deepEqual(plain(margin.placed),expected.margin2px.placed,'Deterministic margin search');
      assert.ok(clearance(margin.placed)>=2);
    }
    const checked=[];
    for(const p of expected.placed){
      assert.ok(validate(p,checked).isValid);assert.equal(validate(p,checked).detectedMonth,month);
      assert.equal(p.landId,metas[month].landId);
      if(checked.length){const duplicate={...p,worldX:checked[0].worldX,worldY:checked[0].worldY};
        assert.equal(validate(duplicate,checked).isValid,false,'Overlap still rejected');}
      checked.push(p);parentsChecked++;
      const adjust=load('placementValidator').validateFlowerPlacement({flowerId:p.flowerId,month:p.month,
        flowerName:p.flowerName,worldX:p.worldX,worldY:p.worldY,existingPlacements:checked,ignorePlacementId:p.id});
      assert.ok(adjust.isValid,'Adjust uses the identical footprint rule');
    }
    assert.equal(expected.failed,30-checked.length);assert.equal(expected.achieved,checked.length===30);
    scenariosChecked++;
  }
  console.log(`Land${String(month).padStart(2,'0')}: all four complete searches reproduced; production validation/Adjust parity passed`);
}
const context=fs.readFileSync(new URL('mobile/src/components/garden/planting/PlantingContext.tsx',ROOT),'utf8');
assert.ok(context.includes('const confirmed = validateAt(previewCoords.worldX, previewCoords.worldY, targetFlower.month,'));
assert.ok(context.includes('const landId = MONTH_REGION_METAS[targetFlower.month].landId;'));
console.log(`PASS: ${scenariosChecked} deterministic scenarios, ${parentsChecked} real-parent-shaped witnesses; 12 masks, authoritative radii, no user storage/backend access, locked Growth/art/performance/checkpoint inputs unchanged.`);
