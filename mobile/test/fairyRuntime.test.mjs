import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const base=new URL('../src/components/fairy/',import.meta.url),cache=new Map();
const jsx=(type,props)=>({type,props});let imageRequests=0;
const skia={Image:'Image',Atlas:'Atlas',Skia:{XYWHRect:(x,y,width,height)=>({x,y,width,height}),RSXform:(scos,ssin,tx,ty)=>({scos,ssin,tx,ty})},
  useImage:source=>{if(source!==null)imageRequests++;return source===null?null:'decoded';}};
function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(name,base),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,require:ref=>{
      if(ref==='react/jsx-runtime')return{jsx,jsxs:jsx};
      if(ref==='react')return{memo:f=>f,useMemo:f=>f(),useCallback:f=>f,useEffect:f=>f(),useState:init=>[init,()=>{}]};
      if(ref==='@shopify/react-native-skia')return skia;
      if(/\.(png|webp)$/.test(ref))return'reference.png';
      if(ref.startsWith('.'))return load(ref.slice(2)+'.ts');
      throw Error(ref);
    }});return exports;
}
const api=load('fairyRuntime.ts'),assets=load('fairyAssets.ts').FAIRY_ASSETS;
assert.equal(api.FAIRY_ANIMATION_STATES.length,9);assert.equal(Object.keys(assets.animations).length,0);
for(const state of api.FAIRY_ANIMATION_STATES)for(const facing of api.FAIRY_FACINGS){
  const frame=api.resolveFairyFrame(assets,state,facing,999);
  assert.equal(frame.kind,'reference');assert.equal(frame.source,'reference.png');assert.ok(!frame.sourceRect,'Never crop the reference sheet');
}
const sequence={...assets,animations:{walk:{front:{kind:'sequence',frames:[1,2,3],width:64,height:96,anchorX:.5,anchorY:1,fps:12,loop:true}}}};
assert.equal(api.resolveFairyFrame(sequence,'walk','front',4).source,2);
sequence.animations.walk.front.loop=false;assert.equal(api.resolveFairyFrame(sequence,'walk','front',99).source,3);
assert.equal(api.resolveFairyFrame(sequence,'walk','left').kind,'reference');
assert.equal(api.resolveFairyFrame(sequence,'walk','front',NaN).kind,'reference');
const atlas={...assets,animations:{idle:{front:{kind:'atlas',source:4,fps:12,loop:true,frames:[{x:16,y:32,width:64,height:96,anchorX:.5,anchorY:1}]}}}};
const frame=api.resolveFairyFrame(atlas,'idle','front');assert.equal(frame.kind,'atlas');assert.equal(frame.sourceRect.x,16);
const pose={x:100,y:120,scale:2,facing:'front',animationState:'idle',visible:true};
assert.equal(api.fairyWorldBounds(pose,frame).x,36);assert.equal(api.fairyWorldBounds(pose,frame).y,-72);
assert.equal(api.fairyInView(pose,frame,{x:0,y:0,width:100,height:100}),true);
assert.equal(api.fairyInView({...pose,visible:false},frame,{x:0,y:0,width:100,height:100}),false);
assert.equal(api.fairyInView({...pose,x:1000},frame,{x:0,y:0,width:100,height:100}),false);
assert.equal(api.fairyInView({...pose,scale:NaN},frame,{x:0,y:0,width:100,height:100}),false);
const {FairyLayer}=load('FairyLayer.tsx');const statuses=[];
const node=FairyLayer({...pose,onStatus:s=>statuses.push(s)});assert.equal(node.type,'Image');assert.equal(statuses[0],'reference-ready');
assert.equal(FairyLayer({...pose,assets:atlas}).type,'Atlas');
const before=imageRequests;assert.equal(FairyLayer({...pose,visible:false}),null);assert.equal(imageRequests,before);
assert.equal(FairyLayer({...pose,x:10000,viewport:{x:0,y:0,width:640,height:480}}),null);assert.equal(imageRequests,before);
const root=new URL('../../',import.meta.url),hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const original=fs.readFileSync(new URL('Resources/icon/fairy.png',root));
assert.equal(hash(original),'0b9a6e4b8118d5e959199d0b2bdb1496b2d93aecd53050a2abe42fa20334a01a','Authoritative Fairy reference remains unchanged');
assert.deepEqual(fs.readFileSync(new URL('../assets/garden/fairy/reference/fairy.png',import.meta.url)),original,'Runtime copy is byte-identical');
const route=fs.readFileSync(new URL('../src/app/fairy-test.tsx',import.meta.url),'utf8');
assert.ok(route.includes('if(!__DEV__)return <Redirect href="/"/>'));
for(const name of ['fairyRuntime.ts','fairyAssets.ts','FairyLayer.tsx','FairyTestScene.tsx']){
  const text=fs.readFileSync(new URL(name,base),'utf8');
  assert.ok(!/GardenScene|fetch\(|localStorage|setInterval\(|requestAnimationFrame\(/.test(text.replace(/\/\*[^]*?\*\//g,'')),`${name}: no Garden/network/storage/playback loop`);
}
console.log('Fairy: unchanged source/runtime bytes, nine static fallback states, authored sequence/atlas lookup, pivots/culling, one node, hidden no decode, DEV route isolation passed.');
