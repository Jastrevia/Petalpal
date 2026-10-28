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
  'react/jsx-runtime':{jsx,jsxs:jsx},'@shopify/react-native-skia':{Group:'Group',Image:'Image',Oval:'Oval',BlurMask:'BlurMask',ImageShader:'ImageShader',Rect:'Rect',Shader:'Shader',Circle:'Circle',
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
// Planted flowers are the painted clusters: one picture per flower, sized by its land.
const clusters=load('flowerClusters');
const drawnClusters=tree=>nodes(expand(tree)).filter(n=>n.type==='Image');
function expand(node){if(Array.isArray(node))return node.map(expand);if(!node||typeof node!=='object')return node;
  if(typeof node.type==='function')return expand(node.type(node.props));
  return {...node,props:{...node.props,children:expand(node.props?.children)}};}
assert.deepEqual([6,10].map(clusters.clusterSizeForMonth),['S','L']);
for(const pass of ['all','behind-tea-set','foreground']){
  const tree=render({depthPass:pass}),drawn=drawnClusters(tree);
  const expected=pass==='all'?records:pass==='behind-tea-set'?[records[0]]:[records[1]];
  assert.equal(drawn.length,expected.length,'One cluster per planted flower in its depth pass');
  for(const record of expected){
    const want=clusters.clusterDrawing(record),got=drawn.find(n=>n.props.x===want.x&&n.props.y===want.y);
    assert.ok(got,'Each cluster stands on its planting point');
    assert.equal(got.props.width,clusters.CLUSTER_WORLD_WIDTH[clusters.clusterSizeForMonth(record.month)]);
    assert.equal(got.props.image,'decoded-image');
  }
  assert.equal(nodes(tree).filter(n=>n.type==='Image'&&n.props?.image==='decoded-image').length,0,'Pictures only come from the cluster bed');
  assert.ok(nodes(expand(tree)).every(n=>!n.props?.clip),'Cluster pixels are not clipped to the planting mask');
}
assert.equal(clusters.clusterDrawing({...records[0],speciesCode:'UNKNOWN_CANONICAL',flowerName:'UNKNOWN_CANONICAL'}),null,
  'Unknown flowers never borrow another species');
const before=JSON.stringify(records);
state.activeMode='planting';state.targetFlower={...records[0],id:'pending',flowerId:'pending'};
state.previewCoords={worldX:records[0].worldX+40,worldY:records[0].worldY+5};
const withPreview=drawnClusters(render({depthPass:'behind-tea-set'}));
assert.equal(withPreview.length,2,'The Plant preview is drawn once beside the committed flower');
assert.ok(withPreview.some(n=>n.props.x===clusters.clusterDrawing({...state.targetFlower,...state.previewCoords}).x));
assert.equal(drawnClusters(render({depthPass:'foreground'})).length,1);
assert.equal(JSON.stringify(records),before,'Previewing never changes a planted flower');
state.activeMode='normal';state.targetFlower=null;state.previewCoords=null;
// Taps pick the front-most cluster picture.
for(const record of records){
  const d=clusters.clusterDrawing(record);
  assert.equal(clusters.hitCluster(records,record.worldX,d.y+d.height*.5),record);
}
assert.equal(clusters.hitCluster(records,records[0].worldX,records[0].worldY+60),null);
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
assert.ok(opaque);
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
assert.equal(state.placements[0].worldX,120);assert.equal(state.placements[0].worldY,240);
const source=fs.readFileSync(new URL('../src/components/garden/GardenScene.tsx',import.meta.url),'utf8');
assert.ok(source.includes('behindTeaSet={<GardenProfile name="Flowers behind Tea Set" enabled={perf.Flowers}><PlantedFlowerLayer depthPass="behind-tea-set" useMonthlyGrowth={useMonthlyGrowth} /></GardenProfile>}'));
assert.ok(source.includes("depthPass={showLandmarks ? 'foreground' : 'all'} useMonthlyGrowth={useMonthlyGrowth}"));
console.log('Production render: painted clusters sized by land, one per flower per depth pass, no mask clip, Plant preview, cluster taps, legacy recovery passed.');
