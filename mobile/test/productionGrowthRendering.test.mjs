import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadPlantingModules} from './loadPlantingModules.mjs';
const jsx=(type,props)=>({type,props}),plain=x=>JSON.parse(JSON.stringify(x));
const state={placements:[],activeMode:'normal',targetFlower:null,previewCoords:null};
const imageSources=[];
const effects=[];
const react={memo:fn=>fn,useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:()=>{},
  useState:()=>[new Proxy({}, {get:()=> 'decoded-image'}),()=>{}]};
const load=loadPlantingModules(undefined,react,undefined,true,{
  'react/jsx-runtime':{jsx,jsxs:jsx},'@shopify/react-native-skia':{Group:'Group',Image:'Image',Oval:'Oval',ImageShader:'ImageShader',Rect:'Rect',Shader:'Shader',Circle:'Circle',
    ColorType:{RGBA_8888:4},AlphaType:{Unpremul:3},
    Skia:{RuntimeEffect:{Make:source=>{const effect={source};effects.push(effect);return effect;}}},
    useImage:source=>{imageSources.push(source);return source?'decoded-image':null;}},
  '../performance/runtimeAudit':{runtimeAudit:{render(){}},timeGardenWork:(_,fn)=>fn()},
  './PlantingContext':{usePlanting:()=>state},
  '../flower-mood-effects/GardenMoodEffects':{GardenMoodEffectsLayer:'MoodEffects'},
});
const api=load('productionGrowth'),render=load('ProductionPlantedFlowers').ProductionPlantedFlowers;
assert.equal(api.USE_MONTHLY_GARDEN_GROWTH_V1_1,true,'Release defaults to the approved monthly Flower renderer');
const layer=load('ProductionGrowthLayer').ProductionGrowthLayer;
const botanicalImage=load('../flower-visuals/BotanicalFlowerImage').BotanicalFlowerImage;
const presentationPose=load('../flower-visuals/botanicalPresentationPose').botanicalPresentationPose;
const poseSamples=Array.from({length:64},(_,i)=>presentationPose(`synthetic-flower-${i}`));
assert.ok(new Set(poseSamples.map(p=>JSON.stringify(p.transform))).size>60,'Separate flowers get subtle individual poses');
for(let i=0;i<poseSamples.length;i++){
  const pose=poseSamples[i],again=presentationPose(`synthetic-flower-${i}`);
  assert.deepEqual(plain(pose),plain(again),'Visual pose remains stable across renders');
  assert.ok(pose.seed>=0&&pose.seed<1);
  assert.ok(pose.transform[0].scale>=.94&&pose.transform[0].scale<=1.04);
  assert.ok(Math.abs(pose.transform[1].rotate)<=Math.PI/90);
  assert.ok(Math.abs(pose.transform[2].skewX)<=.018);
  assert.ok(pose.transform.every(t=>!('translateX' in t)&&!('translateY' in t)),
    'A visual pose cannot displace its soil root');
}
const spriteRect={image:{width:()=>56,height:()=>64,readPixels:()=>null},x:-23,y:-47,width:56,height:64,rootX:0,rootY:0,rootWidth:12,
  seed:.4,plantWidth:32,plantHeight:41};
assert.equal(effects.length,2,'Shaders compile once when the shared renderer loads');
for(const role of ['primary','companion','filler']){
  const drawing=botanicalImage({...spriteRect,role}),[shadow,plant]=drawing.props.children;
  assert.equal(plant.type,'Rect');assert.equal(shadow.type,'Rect');
  for(const key of ['x','y','width','height'])assert.equal(plant.props[key],spriteRect[key],'Presentation preserves source image geometry');
  const shading=plant.props.children,contact=shadow.props.children,image=shading.props.children;
  assert.equal(image.type,'ImageShader');assert.equal(image.props.image,spriteRect.image);
  assert.deepEqual(plain(image.props.rect),{x:-23,y:-47,width:56,height:64});
  assert.equal(image.props.fit,'fill');assert.equal(image.props.tx,'decal');assert.equal(image.props.ty,'decal');
  assert.equal(image.props.children,undefined,'Source texture has no global color filter');
  assert.deepEqual(plain(shading.props.uniforms.root),[0,0]);
  assert.deepEqual(plain(shading.props.uniforms.plantSize),[32,41],'Root blending uses visible plant size, not padded canvas');
  assert.equal(shading.props.uniforms.seed,.4);
  assert.ok(shading.props.uniforms.baseDepth>=41*.05&&shading.props.uniforms.baseDepth<=41*.15);
  assert.ok(contact.props.uniforms.opacity>0&&contact.props.uniforms.opacity<.2);
  assert.equal(contact.props.children,image,'Contact samples the same botanical alpha, with no grass asset');
}
const localArtwork=load('localFlowerArtwork').localFlowerArtwork;
const species=load('../flower-density-sandbox/allSpeciesReviewModel').AVAILABLE_SPECIES;
for(const {speciesCode} of species){
  const local=localArtwork(speciesCode);
  assert.ok(local?.source);assert.equal(local.component.speciesCode,speciesCode);
}
assert.equal(localArtwork('UNKNOWN_CANONICAL'),null,'Unknown flowers never borrow another species');
const monthly=load('../flower-density-sandbox/monthly-growth/monthlyGrowthModel');
const records=[6,10].map(month=>{
  const p=monthly.monthlyGrowthRecords(month,1)[0];
  return {...p,id:`real-${month}`,flowerId:`flower-${month}`,flowerName:p.speciesCode,month,scale:1,rotation:0};
});
state.placements=records;
function nodes(node){return Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];}
function images(node){if(Array.isArray(node))return node.flatMap(images);if(!node||typeof node!=='object')return [];
  if(node.type===botanicalImage)return [node];
  if(typeof node.type==='function')return images(node.type(node.props));
  return images(node.props?.children);}
// One planted record = one complete approved cluster; the procedural bed is no longer drawn.
const {ClusterFlower}=load('ClusterFlowerArt'),clusterApi=load('approvedFlowerClusters');
const drawnClusters=tree=>nodes(tree).filter(n=>n.type===ClusterFlower);
for(const pass of ['all','behind-tea-set','foreground']){
  const tree=render({depthPass:pass}),drawn=drawnClusters(tree);
  assert.deepEqual(drawn.map(n=>n.props.anchor.id),pass==='all'?['real-6','real-10']:pass==='behind-tea-set'?['real-6']:['real-10'],
    'Each depth pass draws its own months, one cluster per record');
  assert.deepEqual(drawn.map(n=>n.props.geometry.size),pass==='all'?['SMALL','LARGE']:pass==='behind-tea-set'?['SMALL']:['LARGE'],
    'Land06 grows Small clusters and Land10 Large ones');
  assert.ok(drawn.every(n=>n.props.image==='decoded-image'),'Neutral rendering works with __DEV__ false');
  assert.equal(nodes(tree).filter(n=>n.type===layer).length,0,'No scattered bed is drawn around a planted flower');
  assert.ok(nodes(tree).every(n=>!n.props?.clip),'Cluster pixels are not clipped to planting mask');
}
const before=JSON.stringify(records);
state.activeMode='adjusting';state.targetFlower=records[0];state.previewCoords={worldX:records[0].worldX+10,worldY:records[0].worldY+5};
const adjusting=drawnClusters(render({depthPass:'behind-tea-set'}));
assert.equal(adjusting.length,1,'Adjust draws the moving flower once, at its preview pose');
assert.deepEqual([adjusting[0].props.anchor.worldX,adjusting[0].props.anchor.worldY],[records[0].worldX+10,records[0].worldY+5]);
assert.equal(JSON.stringify(records),before);
state.activeMode='planting';state.targetFlower={...records[0],id:'pending',flowerId:'pending'};
const pending=drawnClusters(render({depthPass:'behind-tea-set'}));
assert.equal(pending.length,2,'Planting adds exactly one preview cluster');
assert.deepEqual(plain(pending[1].props.geometry),plain(clusterApi.clusterGeometry({...state.targetFlower,...state.previewCoords})),
  'The preview is exactly the cluster that Plant Here will commit');
assert.ok(pending[1].props.opacity<1);
// Planting a flower that is already shown (e.g. an unplaced historical flower at its fallback spot)
// draws it once, at the preview, never twice.
state.targetFlower=records[0];
const historical=drawnClusters(render({depthPass:'behind-tea-set'}));
assert.equal(historical.length,1,'A flower entering planting is not drawn twice');
assert.deepEqual([historical[0].props.anchor.worldX,historical[0].props.anchor.worldY],[state.previewCoords.worldX,state.previewCoords.worldY]);
state.targetFlower={...records[0],id:'pending',flowerId:'pending'};
assert.equal(drawnClusters(render({depthPass:'foreground'})).length,1);
const single=api.productionGrowth([records[0]])[0].growth,painted=images(layer({growth:single}));
assert.equal(painted.length,single.pieces.length);
const composed=load('productionBedComposition').composeProductionBed(single,6);
assert.equal(images(layer({growth:single,month:6})).length,
  composed.primary.length+composed.companions.length+composed.filler.length,
  'The production drawing uses the composed display bed rather than the full coverage-filling model');
assert.ok(painted.every(n=>n.props.image==='decoded-image'&&n.props.width>0&&n.props.height>0&&!n.props.colorFilter));
const empty={...single,records:[],pieces:[],primary:[],companions:[],filler:[]};
assert.equal(images(layer({growth:empty})).length,0,'Empty growth renders no added decoration');
const coverage=load('../flower-density-sandbox/monthly-growth/growthCoverage');
const catalog=load('../flower-density-sandbox/monthly-growth/growthCatalog');
const primary=single.primary[0],component=catalog.growthCatalog(primary.speciesCode).lookup(primary.componentId);
const beforeRendering=JSON.stringify(single);
for(const node of nodes(layer({growth:single})).filter(n=>n.type?.name==='BotanicalPiece')){
  const p=node.props.piece,c=catalog.growthCatalog(p.speciesCode).lookup(p.componentId);
  const outer=node.type({...node.props,image:'decoded-image'}),posed=outer.props.children,sprite=posed.props.children;
  assert.deepEqual(plain(outer.props.transform),[{translateX:p.worldX},{translateY:p.worldY},{rotate:p.rotation}]);
  assert.deepEqual(plain(posed.props.transform),plain(presentationPose(p.id).transform));
  assert.equal(sprite.props.x,-c.anchorX*c.canvasWidth*p.scale);
  assert.equal(sprite.props.y,-c.anchorY*c.canvasHeight*p.scale);
  assert.equal(sprite.props.width,c.canvasWidth*p.scale);assert.equal(sprite.props.height,c.canvasHeight*p.scale);
  assert.equal(sprite.props.plantWidth,(c.contentBounds[2]-c.contentBounds[0])*p.scale);
  assert.equal(sprite.props.plantHeight,(c.contentBounds[3]-c.contentBounds[1])*p.scale);
  assert.equal(sprite.props.seed,presentationPose(p.id).seed);
  assert.equal(sprite.props.rootX,0);assert.equal(sprite.props.rootY,0);
}
assert.equal(JSON.stringify(single),beforeRendering,'Presentation cannot alter growth, coverage, anchors or source geometry');
let opaque;
for(let x=0;!opaque&&x<component.canvasWidth;x+=4)for(let y=0;!opaque&&y<component.canvasHeight;y+=4){
  const dx=(x-component.anchorX*component.canvasWidth)*primary.scale,dy=(y-component.anchorY*component.canvasHeight)*primary.scale;
  const point={x:primary.worldX+dx*Math.cos(primary.rotation)-dy*Math.sin(primary.rotation),
    y:primary.worldY+dx*Math.sin(primary.rotation)+dy*Math.cos(primary.rotation)};
  if(coverage.alphaAt(primary,point.x,point.y)>.15)opaque=point;
}
assert.ok(opaque);assert.equal(api.hitProductionFlower([records[0]],opaque.x,opaque.y),records[0],
  'Clicking actual primary alpha resolves the original parent record');
const wrapper=load('PlantedFlowerLayer');
assert.equal(wrapper.default({useMonthlyGrowth:true}).type,render);
assert.equal(wrapper.default({useMonthlyGrowth:false}).type,wrapper.LegacyPlantedFlowerLayer);
state.placements=[{id:'legacy-root',flowerName:'Tulip',worldX:120,worldY:240,month:6}];
state.activeMode='normal';state.showDevFootprints=true;
const legacy=wrapper.LegacyPlantedFlowerLayer({}),committed=images(legacy)[0];
const legacyPose=nodes(legacy).find(n=>n.props?.children===committed);
assert.deepEqual(plain(legacyPose.props.origin),{x:120,y:240});
assert.deepEqual(plain(legacyPose.props.transform),plain(presentationPose('legacy-root').transform));
assert.equal(legacyPose.props.children.type,botanicalImage,'Footprints and interaction overlays remain outside the visual pose');
state.activeMode='adjusting';state.targetFlower=state.placements[0];state.previewCoords={worldX:135,worldY:255};
const adjusted=wrapper.LegacyPlantedFlowerLayer({}),preview=images(adjusted)[0];
const previewPose=nodes(adjusted).find(n=>n.props?.children===preview);
assert.deepEqual(plain(previewPose.props.origin),{x:135,y:255});
assert.deepEqual(plain(previewPose.props.transform),plain(legacyPose.props.transform),'Moving a flower preserves its presentation pose');
assert.equal(preview.props.seed,committed.props.seed);
assert.equal(preview.props.x-committed.props.x,15);assert.equal(preview.props.y-committed.props.y,15);
assert.equal(state.placements[0].worldX,120);assert.equal(state.placements[0].worldY,240);
const source=fs.readFileSync(new URL('../src/components/garden/GardenScene.tsx',import.meta.url),'utf8');
assert.ok(source.includes('behindTeaSet={<GardenProfile name="Flowers behind Tea Set" enabled={perf.Flowers}><PlantedFlowerLayer depthPass="behind-tea-set" useMonthlyGrowth={useMonthlyGrowth} /></GardenProfile>}'));
assert.ok(source.includes("depthPass={showLandmarks ? 'foreground' : 'all'} useMonthlyGrowth={useMonthlyGrowth}"));
console.log('Production render: neutral decoded artwork, release-capable drawing, no mask clip, one draw per depth pass, Land06 slot, Adjust and Plant previews, flag recovery passed.');
