const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const test=require('node:test');
const ts=require('typescript');
const mobile=path.join(__dirname,'..'),garden=path.join(mobile,'src/components/garden');

for(const name of ['checkTreehouseEntry','checkMailboxInteraction','checkGardenGround']){
  test(`${name}: real navigation, terrain veto and interaction lifecycle`,()=>{
    const env=Object.fromEntries(['PATH','HOME','TMPDIR','SystemRoot'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    const result=JSON.parse(execFileSync(process.execPath,[`scripts/${name}.cjs`],{cwd:mobile,env,encoding:'utf8',timeout:30000}));
    assert.equal(result.status,'PASS');
  });
}

test('new sprite, terrain and water shaders compile in the pinned CanvasKit with original assets',async()=>{
  const kit=await require('canvaskit-wasm')({wasmBinary:fs.readFileSync(path.join(mobile,'public/canvaskit.wasm'))});
  const cache=new Map(),effects=[],paths=[],sources=[];
  const skia={Path:{Rect:bounds=>{const b=new kit.PathBuilder();b.addRect(kit.XYWHRect(bounds.x,bounds.y,bounds.width,bounds.height));const p=b.detach();b.delete();paths.push(p);return p;},MakeFromSVGString:source=>{const p=kit.Path.MakeFromSVGString(source);assert.ok(p);paths.push(p);return p;}},RuntimeEffect:{Make:source=>{const effect=kit.RuntimeEffect.Make(source);assert.ok(effect,'shader compilation');effects.push(effect);sources.push(source);return effect;}}};
  function load(file){
    if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const requireLocal=q=>{
      if(q.startsWith('@/'))return path.join(mobile,q.slice(2));
      if(q.startsWith('.')){
        let resolved=path.resolve(path.dirname(file),q);
        if(!path.extname(resolved))resolved+=fs.existsSync(resolved+'.ts')?'.ts':'.tsx';
        if(resolved.endsWith('.png')){assert.ok(fs.existsSync(resolved));return resolved;}
        return load(resolved);
      }
      if(q==='@shopify/react-native-skia')return{Skia:skia,FillType:kit.FillType};
      if(q==='react-native')return{Platform:{OS:'web'}};
      if(q==='react')return{memo:fn=>fn};
      return{};
    };
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(code,{module,exports:module.exports,require:requireLocal,__DEV__:false});return module.exports;
  }
  try{
    for(const file of ['fairy/FlyingFairy.tsx','fairy/MailboxFairy.tsx','fairy/TeaFairy.tsx','fairy/TreehouseEntryOcclusion.tsx','GardenOuterBasin.tsx','water/FishLayer.tsx','water/GardenWaterField.tsx','water/SurfaceRippleLayer.tsx','water/FloatingPetalLayer.tsx','water/GardenShoreContact.tsx'])load(path.join(garden,file));
    assert.ok(effects.length>=10);
    // Compare the exact optimized terrain to its retained unoptimized shader.
    // Every bypass must be pixel-neutral at interior, inlet and entrance views.
    const inlet=kit.MakeImageFromEncoded(fs.readFileSync(path.join(garden,'terrain/waterfall-source-banks-v1.png')));
    const bank=inlet.makeShaderOptions(kit.TileMode.Clamp,kit.TileMode.Mirror,kit.FilterMode.Linear,kit.MipmapMode.None,[600/inlet.width(),0,645,0,900/inlet.height(),-1160,0,0,1]);
    const paint=new kit.Paint();paint.setAntiAlias(true);
    try{
      for(const [needle,file,bounds,uniforms] of [
        ['uniform shader upland;','outer-upland-v1.png',[-1700,-2250,3000,2000],[]],
        ['uniform float lowerPlacement;','outer-basin-v2.png',[-700,-800,3800,3400],[-700,-800,3800,3400,0,0,1]],
      ]){
        const optimized=sources.find(source=>source.includes(needle));assert.ok(optimized);
        const unoptimized=optimized
          .replace('  if(p.y>=-280.0) return 1.0;','')
          .replace('  if(a==0.0) return half4(0);','')
          .replace('  if(lowerPlacement==0.0 || p.y<=1790.0) return painting.eval(p) * a * sourceBank(p);','')
          .replace('  if(placement==0.0) return painting.eval(p) * a * sourceBank(p);','')
          .replace('  if(p.y>=-270.0 && p.y<=1774.0 && p.x>=-490.0 && p.x<=2810.0) return half4(0);','')
          .replace('  if(cover==0.0) return half4(0);','');
        const image=kit.MakeImageFromEncoded(fs.readFileSync(path.join(garden,'terrain',file)));
        const [x,y,w,h]=bounds;
        const art=image.makeShaderOptions(needle.includes('upland')?kit.TileMode.Mirror:kit.TileMode.Decal,needle.includes('upland')?kit.TileMode.Mirror:kit.TileMode.Decal,kit.FilterMode.Linear,kit.MipmapMode.None,[w/image.width(),0,x,0,h/image.height(),y,0,0,1]);
        const pair=[kit.RuntimeEffect.Make(optimized),kit.RuntimeEffect.Make(unoptimized)];
        const shaders=pair.map(effect=>effect.makeShaderWithChildren(uniforms,[art,bank]));
        try{
          for(const [cx,cy,zoom] of [[1200,750.5,1.0667],[900,-309,1.6],[1500,1850,1.2],[-490,1774,.6]]){
            const views=[kit.MakeSurface(128,128),kit.MakeSurface(128,128)];
            try{
              const pixels=views.map((view,index)=>{const canvas=view.getCanvas();canvas.clear(kit.Color(.3,.7,.75,1));canvas.translate(64,64);canvas.scale(zoom,zoom);canvas.translate(-cx,-cy);paint.setShader(shaders[index]);canvas.drawRect(kit.XYWHRect(-2400,-2400,7200,7000),paint);paint.setShader(null);view.flush();const snapshot=view.makeImageSnapshot();try{return snapshot.readPixels(0,0,{width:128,height:128,colorType:kit.ColorType.RGBA_8888,alphaType:kit.AlphaType.Premul,colorSpace:kit.ColorSpace.SRGB});}finally{snapshot.delete();}});
              assert.deepEqual(pixels[0],pixels[1],`${file}: ${cx},${cy} at ${zoom}`);
            }finally{views.forEach(view=>view.delete());}
          }
        }finally{shaders.forEach(shader=>shader.delete());pair.forEach(effect=>effect.delete());art.delete();image.delete();}
      }
    }finally{paint.delete();bank.delete();inlet.delete();}

    for(const file of ['mailbox-v1/poses.png','tea-v1/poses.png','fly-v1/glide.png','moon-sleep-v1/sleep.png','swing-seated-v3/seated-back.png']){
      const image=kit.MakeImageFromEncoded(fs.readFileSync(path.join(mobile,'assets/garden/fairy',file)));
      assert.ok(image,file);assert.ok(image.width()>1000&&image.height()>1000,'full sprite resolution retained');image.delete();
    }
  }finally{effects.forEach(e=>e.delete());paths.forEach(p=>p.delete());}
});

test('integrated scene retains one cached Canvas, current app contracts and camera coordinate mapping',()=>{
  const source=fs.readFileSync(path.join(garden,'GardenScene.tsx'),'utf8');
  assert.equal((source.match(/<Canvas\b/g)||[]).length,1);
  assert.ok(source.includes("import Canvas from './GardenCanvas'"));
  assert.equal(source.includes('GardenCanvasPlane'),false);
  assert.ok(source.includes('session={props.session} backendMode={props.backendMode}'));
  // A friend's Garden (readOnly) opens flowers only; nothing else follows a read-only tap.
  assert.ok(source.includes('if (fit <= 0) return;') && source.includes('if (readOnly) return;'));
  assert.ok(source.includes('showCalendar && !readOnly'));
  assert.ok(source.includes('(screenX - baseX - currentCamX) / (fit * currentZoom)'));
  // Landmarks in order (the mailbox before the treehouse), then a lawn with flowers.
  assert.ok(source.indexOf('hitsMailbox(at, treehousePlacement)')>0&&source.indexOf('hitsMailbox(at, treehousePlacement)')<source.indexOf('hitsTreehouse(at, treehousePlacement)'));
  assert.ok(source.indexOf('hitsMoonBed(at, moonBedPlacement)')<source.indexOf('plantedLawnAt(placementsRef.current'));
  assert.ok(source.indexOf('<FishLayer')<source.indexOf('<SurfaceRippleLayer'));
  assert.ok(source.indexOf('<GardenFairy')<source.indexOf('renderPass="static-front"'));
  assert.ok(fs.readFileSync(path.join(garden,'LandLayer.tsx'),'utf8').includes('GardenStaticPicture'));
  assert.ok(fs.readFileSync(path.join(garden,'GardenOuterBasin.tsx'),'utf8').includes('GardenStaticPicture'));
});

test('shore and land passes reuse seven decoded images rather than decoding fourteen',()=>{
  const cache=new Map(),decoded=[];let shared=null;
  const jsx=(type,props)=>({type,props});
  const react={createContext:()=>({Provider:'Provider'}),useContext:()=>shared,useMemo:fn=>fn(),useEffect:()=>{}};
  const skia={Group:'Group',Image:'Image',Rect:'Rect',useImage:source=>{
    if(source===null)return null;
    const image={source,width:()=>1536,height:()=>1024};decoded.push(image);return image;
  }};
  function load(file){
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const requireLocal=q=>{
      if(q==='react')return react;
      if(q==='react/jsx-runtime')return{jsx,jsxs:jsx};
      if(q==='react-native')return{Platform:{OS:'web'}};
      if(q==='@shopify/react-native-skia')return skia;
      if(q.includes('GardenStaticPicture'))return{default:'CachedPicture'};
      if(q.includes('GardenShoreContact'))return{default:'Shore',makeShoreCoverage:()=>({coverage:true})};
      if(q.startsWith('@/'))return q;
      return load(path.resolve(path.dirname(file),q+'.ts'));
    };
    const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    vm.runInNewContext(source,{module,exports:module.exports,require:requireLocal,__DEV__:false});return module.exports;
  }
  const land=load(path.join(garden,'LandLayer.tsx'));
  shared=land.GardenLandResources({children:null,loadStore:{reportFailure(){},publishLandsLoaded(){}}}).props.value;
  const passes=['shore','land'].map(renderPass=>land.default({renderPass}).props.children.map(node=>node.type(node.props)));
  assert.equal(decoded.length,7);
  for(let i=0;i<7;i++)assert.equal(passes[0][i].props.images[0],passes[1][i].props.images[0]);
});

test('camera always covers the screen with the Garden on any device while zoom keeps the focal world point',()=>{
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(garden,'rendering/gardenWorldBounds.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports});
  const {constrainGardenCamera,zoomGardenAt,GARDEN_WORLD_BOUNDS:b}=module.exports;
  for(const [width,height] of [[1280,736],[390,760],[375,812],[2560,1440]]){
    const fit=Math.min(width/2400,height/1800),baseX=(width-2400*fit)/2,baseY=(height-1800*fit)/2;
    const cover=Math.max(width/b.width,height/b.height)/fit;
    const covers=c=>{const s=fit*c.zoom;
      assert.ok(baseX+c.x+b.x*s<=1e-6&&baseX+c.x+(b.x+b.width)*s>=width-1e-6,'horizontal edges stay off screen');
      assert.ok(baseY+c.y+b.y*s<=1e-6&&baseY+c.y+(b.y+b.height)*s>=height-1e-6,'vertical edges stay off screen');};
    const zoomedOut=constrainGardenCamera(width,height,fit,baseX,baseY,0,0,.1);
    assert.ok(Math.abs(zoomedOut.zoom-cover)<1e-9);assert.equal(zoomedOut.minimumZoom,zoomedOut.zoom);covers(zoomedOut);
    assert.ok(Math.abs(constrainGardenCamera(width,height,fit,baseX,baseY,0,0,99).zoom-Math.max(3,cover*3))<1e-9);
    for(const [x,y] of [[-99999,-99999],[99999,99999],[-700,900]]) covers(constrainGardenCamera(width,height,fit,baseX,baseY,x,y,cover*1.5));
    const z=cover*1.5,focalX=width*.37,focalY=height*.61;
    const inside=constrainGardenCamera(width,height,fit,baseX,baseY,-200*fit,-150*fit,z);
    const next=zoomGardenAt(width,height,fit,baseX,baseY,inside.x,inside.y,z,z*1.1,focalX,focalY);
    const before=[(focalX-baseX-inside.x)/(fit*z),(focalY-baseY-inside.y)/(fit*z)];
    const after=[(focalX-baseX-next.x)/(fit*next.zoom),(focalY-baseY-next.y)/(fit*next.zoom)];
    const clamped=constrainGardenCamera(width,height,fit,baseX,baseY,next.x,next.y,next.zoom);
    assert.equal(clamped.x,next.x);assert.equal(clamped.y,next.y);covers(next);
    if(next.x!==inside.x||next.y!==inside.y) assert.ok(Math.hypot(after[0]-before[0],after[1]-before[1])<200,'zoom stays near the focal point');
  }
});

test('new lotus ripples use the shared water clock and retain phase across pause/resume without another loop',()=>{
  const cache=new Map(),slots=[],activity=[];let cursor=0,reaction;
  const jsx=(type,props)=>({type,props});
  function load(file){
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const requireLocal=q=>{
      if(q==='react')return{memo:fn=>fn,useMemo:fn=>fn()};
      if(q==='react/jsx-runtime')return{jsx,jsxs:jsx};
      if(q==='react-native')return{Platform:{OS:'web'}};
      if(q==='react-native-reanimated')return{useSharedValue:value=>slots[cursor++]??(slots[cursor-1]={value}),useAnimatedReaction:(prepare,react)=>{reaction=()=>react(prepare());}};
      if(q==='@shopify/react-native-skia')return{Group:'Group',Skia:{RuntimeEffect:{Make:()=>null}}};
      if(q.includes('WaterTopAssembly'))return{useWaterTopFlow:(active,animate)=>{activity.push([active,animate]);return{seconds:{value:0},enabled:false};}};
      if(q.startsWith('@/'))return q;
      let resolved=path.resolve(path.dirname(file),q);resolved+=fs.existsSync(resolved+'.ts')?'.ts':'.tsx';return load(resolved);
    };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:requireLocal,__DEV__:false});return module.exports;
  }
  const Lotus=load(path.join(garden,'water/LotusLayer.tsx')).default,clock={value:0},flow={seconds:clock,enabled:true};
  const render=mode=>{cursor=0;return Lotus({flow,mode,active:true}).props.children[0].props.seconds;};
  const seconds=render('sway');clock.value=1;reaction();assert.equal(seconds.value,1);
  render('static');clock.value=3;reaction();assert.equal(seconds.value,1);
  render('sway');clock.value=4;reaction();assert.equal(seconds.value,2);
  assert.ok(activity.every(([active,animate])=>!active&&!animate),'standalone water callbacks stay disabled');
});
