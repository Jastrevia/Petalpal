import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const require=createRequire(import.meta.url), root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const init=require('canvaskit-wasm/bin/full/canvaskit.js');
const ck=await init({locateFile:file=>path.join(root,'node_modules/canvaskit-wasm/bin/full',file)});
const images=new Map(), values=[], cleanups=[];
const react={memo:f=>f,useMemo:f=>f(),useEffect:fn=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);}};
const reanimated={useSharedValue:value=>{const shared={value};values.push(shared);return shared;},
  useDerivedValue:fn=>({get value(){return fn();}}),useReducedMotion:()=>false,useAnimatedReaction:()=>{},cancelAnimation:()=>{},withTiming:value=>value,withRepeat:value=>value,Easing:{linear:t=>t}};
const load=loadPlantingModules(undefined,react,undefined,true,{
  'react-native-reanimated':reanimated,
  './WaterTopAssembly':{useWaterTopFlow:()=>({seconds:clock,enabled:true})},
  './GardenLotusContact':()=>null,
  './LotusSurfaceRipples':()=>null,
  '../performance/runtimeAudit':{runtimeAudit:{render:()=>{}}},
  '@shopify/react-native-skia':{Group:'Group',Paint:'Paint',Mask:'Mask',Rect:'Rect',Image:'Image',ColorMatrix:'ColorMatrix',Shader:'Shader',ImageShader:'ImageShader',
    Skia:{RuntimeEffect:{Make:source=>ck.RuntimeEffect.Make(source,message=>{throw new Error(message);})}},
    useImage:asset=>{
      if(!images.has(asset)) images.set(asset,ck.MakeImageFromEncoded(fs.readFileSync(path.join(root,asset.replace('@/','')))));
      return images.get(asset);
    }},
});
const {Otter}=load('../spirits/MemoryOtter');
const clock={value:0}, network={nodes:[{x:600,y:1450,links:[1]},{x:800,y:1450,links:[0]}],bounds:{}};
const tree=Otter({clock,network});
const spriteState=values[0], size=240;
// Asset/render tests select an exact phase; playback integration is tested separately.
function setAnimationTime(seconds,index=0){clock.value=seconds;values[index+2].value=seconds;}
const water=ck.Color(25,72,81,1);
const resolve=value=>value?.value??value;
const children=value=>Array.isArray(value)?value:[value];

function paint(style={}) {
  const p=new ck.Paint();p.setAntiAlias(true);
  p.setBlendMode(ck.BlendMode[style.blendMode??'SrcOver']);
  if(style.matrix) {const filter=ck.ColorFilter.MakeMatrix(style.matrix);p.setColorFilter(filter);filter.delete();}
  return p;
}
const blendName=name=>({screen:'Screen',src:'Src',srcIn:'SrcIn'})[name]??name;
/** Execute the component's actual JSX through CanvasKit, with the installed
 * Skia Mask.tsx saveLayer/src/luma/srcIn sequence (clip=false). No formula-only
 * screen-blend approximation: the regression is specifically layer restoration. */
function draw(canvas,element,inherited={}) {
  if(!element) return;
  if(Array.isArray(element)){element.forEach(child=>draw(canvas,child,inherited));return;}
  if(typeof element.type==='function'){draw(canvas,element.type(element.props),inherited);return;}
  const p=element.props, style={...inherited,...(p.blendMode?{blendMode:blendName(p.blendMode)}:{})};
  if(element.type==='Group') {
    canvas.save();
    if(p.layer) {
      const layer=typeof p.layer==='object'?paint({blendMode:blendName(p.layer.props.blendMode)}):null;
      canvas.saveLayer(layer);layer?.delete();
    }
    for(const transform of resolve(p.transform)??[]) {
      if('translateX' in transform)canvas.translate(transform.translateX,0);
      if('translateY' in transform)canvas.translate(0,transform.translateY);
      if('rotate' in transform)canvas.rotate(transform.rotate*180/Math.PI,0,0);
      if('scale' in transform)canvas.scale(transform.scale,transform.scale);
    }
    if(p.clip){const r=resolve(p.clip);canvas.clipRect(ck.XYWHRect(r.x,r.y,r.width,r.height),ck.ClipOp.Intersect,true);}
    draw(canvas,p.children,style);
    if(p.layer)canvas.restore();
    canvas.restore();return;
  }
  if(element.type==='Mask') {
    assert.equal(p.mode,'luminance');assert.equal(p.clip,false);
    canvas.saveLayer(); // <Group layer> restores with SrcOver, not inherited screen
    const luma=ck.ColorFilter.MakeLuma(),src=paint({blendMode:'Src'});src.setColorFilter(luma);
    canvas.saveLayer(src);draw(canvas,p.mask,style);canvas.restore();src.delete();luma.delete();
    draw(canvas,p.children,{...style,blendMode:'SrcIn'});canvas.restore();return;
  }
  if(element.type==='Rect') {
    const brush=paint(style);brush.setColor(ck.WHITE);
    const effect=children(p.children).find(child=>child?.type==='Shader');
    let shader,imageShader;
    if(effect) {
      const uniforms=resolve(effect.props.uniforms),image=effect.props.children.props.image;
      imageShader=image.makeShaderOptions(ck.TileMode.Decal,ck.TileMode.Decal,ck.FilterMode.Linear,ck.MipmapMode.None);
      shader=effect.props.source.makeShaderWithChildren([uniforms.frame,uniforms.seconds,uniforms.motion,uniforms.bend],[imageShader]);
      brush.setShader(shader);
    }
    canvas.drawRect(ck.XYWHRect(p.x,p.y,p.width,p.height),brush);
    brush.delete();shader?.delete();imageShader?.delete();return;
  }
  if(element.type==='Image') {
    const matrix=children(p.children).find(child=>child?.type==='ColorMatrix')?.props.matrix;
    const brush=paint({...style,matrix}),image=p.image;
    if(p.opacity!==undefined)brush.setAlphaf(resolve(p.opacity));
    canvas.drawImageRectOptions(image,ck.XYWHRect(0,0,image.width(),image.height()),
      ck.XYWHRect(resolve(p.x),resolve(p.y),p.width,p.height),ck.FilterMode.Linear,ck.MipmapMode.None,brush);
    brush.delete();return;
  }
  throw new Error('Unsupported test draw node: '+String(element.type));
}
function render(element,x,y,background=water) {
  const surface=ck.MakeSurface(size,size),canvas=surface.getCanvas();canvas.clear(background);
  canvas.translate(size/2-x,size/2-y);draw(canvas,element);surface.flush();
  const pixels=canvas.readPixels(0,0,{width:size,height:size,colorType:ck.ColorType.RGBA_8888,
    alphaType:ck.AlphaType.Unpremul,colorSpace:ck.ColorSpace.SRGB});
  surface.delete();return pixels;
}
const clip=tree.props.clip?tree:tree.props.children;
const mask=tree.props.clip?tree.props.children.props.children:clip.props.children;
// Original direct-to-water screen appearance, with the identical sprite,
// crop, size, animation frame and rotation, but no occluders.
const reference={type:'Group',props:{blendMode:'screen',children:{type:'Group',props:{...clip.props,children:mask.props.children}}}};
const anglesForFrame=frame=>[0,...([0,16,32,48,61].includes(frame)?[Math.PI/4,Math.PI/2,Math.PI]:[])];
const maxDifference=(a,b)=>{let difference=0;for(let i=0;i<a.length;i++)difference=Math.max(difference,Math.abs(a[i]-b[i]));return difference;};

test('all 62 animation frames preserve transparent screen compositing at multiple rotations',()=>{
  for(let frame=0;frame<62;frame++) for(const heading of anglesForFrame(frame)) {
    setAnimationTime((frame+.01)/12);spriteState.value={...spriteState.value,x:600,y:1450,heading};
    const actual=render(tree,600,1450),expected=render(reference,600,1450);
    assert.ok(maxDifference(actual,expected)<=2,'masked compositor must match the original direct screen appearance: frame '+frame+', angle '+heading);
  }
});

test('bridge alpha masks block the sprite and glow while preserving exposed water at representative swimming frames and rotations',()=>{
  // The same component's actual mask, rendered alone, supplies pixel coverage,
  // including source artwork feathering; no rectangular bridge proxy is used.
  for(const [x,y] of [[1660,560],[1710,1380],[1650,950]]) {
    const coverage=render(mask.props.mask,x,y,ck.TRANSPARENT);
    assert.ok(coverage.some((v,i)=>i%4===0&&v===0),'opaque bridge coverage exists');
    for(const frame of [0,16,32,48,61]) for(const heading of [0,Math.PI/4,Math.PI/2,Math.PI]) {
      setAnimationTime((frame+.01)/12);spriteState.value={...spriteState.value,x,y,heading};
      const actual=render(tree,x,y),unmasked=render(reference,x,y);
      for(let i=0;i<actual.length;i+=4) for(let c=0;c<3;c++) {
        const base=[25,72,81][c],expected=base+(unmasked[i+c]-base)*coverage[i]/255;
        assert.ok(Math.abs(actual[i+c]-expected)<=3,'bridge coverage must mask glow without leaking opaque black');
      }
    }
  }
});
test('live lily-pad and lotus silhouettes occlude the otter and glow without changing the plants',()=>{
  const {default:LotusLayer}=load('../water/LotusLayer');
  const {LOTUS_CLUSTER_ASSETS}=load('../water/lotusClusterAssets');
  for(const variant of Object.keys(LOTUS_CLUSTER_ASSETS)) {
    let occluder,notifications=0;
    const parent=LotusLayer({flow:{seconds:clock,enabled:true},mode:'sway',
      placements:[{id:variant,variant,x:600,y:1450,scale:1.05,rotation:.12,swayPhase:.2,region:'lower-left'}],
      onOccluder:(_id,value)=>{occluder=value;notifications++;}});
    const phaseIndex=values.length,child=parent.props.children[0],plant=child.type(child.props);
    const phase=values[phaseIndex],release=cleanups.at(-1);
    assert.equal(occluder.transform,plant.props.transform,'mask shares the ORIGINAL live transform, not a duplicate sway clock');
    assert.equal(occluder.image,plant.props.children.at(-1).props.image,'original artwork reused');
    const poseIndex=values.length,underPlant=Otter({clock,network,lotusOccluders:[occluder]});
    const state=values[poseIndex],plantMask=underPlant.props.children.props.children.props.mask;
    for(const sway of [0,Math.PI/2]) {
      phase.value=sway;
      const coverage=render(plantMask,600,1450,ck.TRANSPARENT),plantsOnly=render(plant,600,1450);
      assert.ok(coverage.some((value,i)=>i%4===0&&value<=8),'lily-pad and flower silhouettes are represented: '+variant);
      for(const frame of [0,31])for(const heading of [0,Math.PI/2]) {
        setAnimationTime((frame+.01)/12);
        setAnimationTime((frame+.01)/12,poseIndex);
        const pose={...state.value,x:600,y:1450,heading};state.value=pose;spriteState.value=pose;
        const actual=render({type:'Group',props:{children:[plant,underPlant]}},600,1450);
        const exposed=render(reference,600,1450);
        for(let i=0;i<actual.length;i+=4)for(let c=0;c<3;c++) {
          const base=[25,72,81][c],glow=(exposed[i+c]-base)/(255-base);
          const expected=plantsOnly[i+c]+(255-plantsOnly[i+c])*glow*coverage[i]/255;
          assert.ok(Math.abs(actual[i+c]-expected)<=3,'lotus pixels stay above the otter and its glow: '+variant);
        }
      }
    }
    assert.equal(notifications,1,'animation does not re-register plants or update React every frame');
    release();assert.equal(occluder,null,'hidden/unmounted plants leave no invisible occlusion');
  }
});

test('face and flower colors stay painted while the lower body transmits the lake in all 62 frames',()=>{
  const {default:SheetFrame}=load('../SheetFrame');
  const painted=mask.props.children,water=painted.props.children;
  const original={type:'Group',props:{blendMode:'screen',children:{type:'Group',props:{...painted.props,
    children:{type:SheetFrame,props:{sheet:water.props.sheet,frame:water.props.frame,columns:10,count:62,w:304,h:180}}}}}};
  for(let frame=0;frame<62;frame++) for(const heading of anglesForFrame(frame)) {
    setAnimationTime((frame+.01)/12);spriteState.value={...spriteState.value,x:600,y:1450,heading};
    const actual=render(tree,600,1450),before=render(original,600,1450);
    let changedTail=0,softenedBody=0,protectedPixels=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const dx=x+.5-size/2,dy=y+.5-size/2;
      const sx=(Math.cos(heading)*dx+Math.sin(heading)*dy)*304/150+152;
      const sy=(-Math.sin(heading)*dx+Math.cos(heading)*dy)*304/150+99;
      const index=(y*size+x)*4;
      const sourceRgb=[0,1,2].map(c=>Math.max(0,(before[index+c]-[25,72,81][c])/(255-[25,72,81][c])));
      const warm=Math.max(sourceRgb[0]-sourceRgb[1],sourceRgb[0]-sourceRgb[2]);
      const face=sx>=220&&sx<302&&sy>=2&&sy<=108;
      const flower=sx>=100&&sx<=200&&sy>=35&&sy<=142&&(warm>=.14||Math.min(...sourceRgb)>=.92);
      if(face||flower){protectedPixels++;for(let c=0;c<3;c++)
        assert.ok(Math.abs(actual[index+c]-before[index+c])<=3,'face and petal colors must remain intact');}
      if(sx>96&&sx<218&&sy>120&&sy<164&&actual[index+2]<before[index+2]-4)softenedBody++;
      if(sx<90&&Math.abs(actual[index+2]-before[index+2])>3)changedTail++;
      if(Math.hypot(dx,dy)>82)for(let c=0;c<3;c++)
        assert.ok(Math.abs(actual[index+c]-[25,72,81][c])<=1,'effect must stay in the unchanged navigation clearance envelope');
    }
    assert.ok(changedTail>10,'tail treatment is visibly present in every swimming frame');
    assert.ok(softenedBody>10,'underside integration is selective, not a uniform sprite-opacity change');
    assert.ok(protectedPixels>100,'face and flower preservation is checked independently');
  }
  // Hold the source frame fixed: the additional water itself must animate,
  // respond to speed, and bend on a turn rather than being a static decal.
  const effect=load('../spirits/otterWaterEffect');
  const compiled=ck.RuntimeEffect.Make(effect.OTTER_WATER_SHADER);
  const atlas=water.props.sheet.makeShaderOptions(ck.TileMode.Decal,ck.TileMode.Decal,ck.FilterMode.Linear,ck.MipmapMode.None);
  const sample=(seconds,motion,bend)=>{
    const surface=ck.MakeSurface(304,180),canvas=surface.getCanvas();canvas.clear(ck.TRANSPARENT);
    const shader=compiled.makeShaderWithChildren([16,seconds,motion,bend],[atlas]),brush=paint();brush.setShader(shader);
    canvas.drawRect(ck.XYWHRect(0,0,304,180),brush);
    const pixels=canvas.readPixels(0,0,{width:304,height:180,colorType:ck.ColorType.RGBA_8888,
      alphaType:ck.AlphaType.Unpremul,colorSpace:ck.ColorSpace.SRGB});
    brush.delete();shader.delete();surface.delete();return pixels;
  };
  const first=sample(0,1,0);
  assert.ok(maxDifference(first,sample(1.3,1,0))>10,'procedural flow moves with time');
  assert.ok(maxDifference(first,sample(0,.2,0))>3,'wake softens while slowing');
  assert.ok(maxDifference(first,sample(0,1,.8))>3,'wake curves during turns');
  assert.equal(first[3],0,'empty corners have real zero alpha, not opaque black');
  atlas.delete();compiled.delete();
});

test.after(()=>{for(const image of images.values())image.delete();});
