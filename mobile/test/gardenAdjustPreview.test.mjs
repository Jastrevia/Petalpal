import assert from 'node:assert/strict';
import {loadPlantingModules} from './loadPlantingModules.mjs';
const jsx=(type,props)=>({type,props});let cursor=0,calls=0;const slots=[];
const react={memo:f=>f,useState:init=>[init,()=>{}],useCallback:f=>f,useEffect:()=>{},useMemo(fn,deps){const i=cursor++;const old=slots[i];if(old&&deps.every((d,j)=>d===old.deps[j]))return old.value;return(slots[i]={deps,value:fn()}).value;}};
const state={placements:[],activeMode:'normal',targetFlower:null,previewCoords:null,validationResult:{isValid:true}};
const dependencies={'react/jsx-runtime':{jsx,jsxs:jsx},'@shopify/react-native-skia':{Group:'Group',Image:'Image',Skia:{RuntimeEffect:{Make:()=>null}},Circle:'Circle',Oval:'Oval',Rect:'Rect',useImage:()=>null},'./PlantingContext':{usePlanting:()=>state},'../flower-mood-effects/GardenMoodEffects':{GardenMoodEffectsLayer:'MoodEffects'}};
const load=loadPlantingModules(new Proxy({}, {get(){throw Error('No placement writes in preview test');}}),react,undefined,true,dependencies);
const parents=load('productionGrowthQAData').productionQARecords(30);
const {ProductionPlantedFlowers}=load('ProductionPlantedFlowers'),{ClusterFlower}=load('ClusterFlowerArt');
dependencies['./productionGrowth']={gardenSpecies:()=>null,productionGrowth:()=>{calls++;throw Error('The procedural bed is not built');}};
function nodes(n){return Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'?[n,...nodes(n.props?.children)]:[];}
function render(){cursor=0;return nodes(ProductionPlantedFlowers({depthPass:'behind-tea-set'}));}
const clustersOf=tree=>tree.filter(n=>n.type===ClusterFlower);
state.placements=parents;const saved=JSON.stringify(parents),first=clustersOf(render());
assert.ok(first.length>0);assert.equal(calls,0);
const committedGeometry=new Map(first.map(n=>[n.props.anchor.id,n.props.geometry]));
state.activeMode='adjusting';state.targetFlower=first[0].props.anchor;
let adjustFrame=null;
for(let i=1;i<=60;i++){
 state.previewCoords={worldX:state.targetFlower.worldX+i/20,worldY:state.targetFlower.worldY+i/20};
 const tree=render(),drawn=clustersOf(tree);
 assert.equal(drawn.length,first.length,'The moving flower is drawn once, never twice');
 adjustFrame??=new Map(drawn.map(n=>[n.props.anchor.id,n.props.geometry]));
 for(const n of drawn)if(n.props.anchor.id!==state.targetFlower.id){
  assert.deepEqual(n.props.geometry,committedGeometry.get(n.props.anchor.id),'Other clusters are unchanged');
  assert.equal(n.props.geometry,adjustFrame.get(n.props.anchor.id),'Pointer moves reuse the other clusters without recomputing them');
 }
 const moving=drawn.find(n=>n.props.anchor.id===state.targetFlower.id);
 assert.deepEqual([moving.props.anchor.worldX,moving.props.anchor.worldY],[state.previewCoords.worldX,state.previewCoords.worldY]);
 assert.ok(tree.some(n=>n.type==='Oval'),'The footprint ring follows the preview');
}
assert.equal(calls,0,'60 pointer updates never build a procedural bed');
state.activeMode='normal';state.previewCoords=null;state.targetFlower=null;
const cancelled=clustersOf(render());
assert.deepEqual(cancelled.map(n=>n.props.geometry),first.map(n=>committedGeometry.get(n.props.anchor.id)),'Cancel reuses the committed clusters');
assert.equal(JSON.stringify(parents),saved,'Cancel leaves real parent data untouched');
state.placements=parents.map((p,i)=>p.id===first[0].props.anchor.id?{...p,worldX:p.worldX+2,worldY:p.worldY+1}:p);
const confirmed=clustersOf(render()),moved=confirmed.find(n=>n.props.anchor.id===first[0].props.anchor.id);
assert.equal(moved.props.anchor.worldX,first[0].props.anchor.worldX+2,'Confirm draws the cluster at its new position');
assert.equal(confirmed.length,first.length);assert.equal(JSON.stringify(parents),saved);
console.log('Adjust: 60 preview updates move one cluster, reuse every other cluster, build no procedural bed, Cancel and Confirm change no stored data.');
