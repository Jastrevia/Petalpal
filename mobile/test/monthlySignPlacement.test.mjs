import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const load=loadPlantingModules();
const {INITIAL_SIGNS:initial,validSignPlacement:valid,parseSignPlacements:parse,signPavilionHref:href}=load('../month-signs/signPlacement');
const plain=x=>JSON.parse(JSON.stringify(x));
test('exactly one valid sign per existing monthly Land, with original supplied PNGs',()=>{
 assert.deepEqual(plain(initial.map(p=>p.month)),Array.from({length:12},(_,i)=>i+1));
 for(const p of initial){assert.ok(valid(p),`month ${p.month}`);}
 const files=fs.readdirSync(new URL('../assets/garden/month-signs/',import.meta.url));assert.equal(files.length,12);
 for(const file of files)assert.ok(fs.readFileSync(new URL(`../assets/garden/month-signs/${file}`,import.meta.url)).subarray(1,4).equals(Buffer.from('PNG')));
});
test('save and reload preserve each independent placement and the fixed roster',()=>{
 for(let i=0;i<12;i++){
  const changed=plain(initial);changed[i].scale=.9;assert.ok(valid(changed[i]));
  assert.deepEqual(plain(parse(JSON.stringify(changed))),changed);
 }
});
test('only malformed numbers or month rosters are rejected',()=>{
 for(const raw of ['{}','null','bad',JSON.stringify(initial.slice(1)),JSON.stringify([...initial.slice(0,11),initial[0]])])assert.equal(parse(raw),null);
 for(const p of initial)for(const patch of [{x:NaN},{y:Infinity},{scale:NaN},{month:13}])assert.equal(valid({...p,...patch}),false);
});
test('all signs accept paths, water, other Lands, scenery and unrestricted coordinates and scales',()=>{
 const positions=[{x:1193,y:530},{x:0,y:0},{x:900,y:420},{x:1920,y:355},{x:-9999.123456789,y:99999.987654321}];
 for(const p of initial)for(const position of positions)for(const scale of [.01,.1,3,20,0,-1]){
  const changed=plain(initial);changed[p.month-1]={...p,...position,scale};
  assert.ok(valid(changed[p.month-1]));
  assert.deepEqual(plain(parse(JSON.stringify(changed))),changed,'saved transforms are never repaired or clamped');
 }
});
test('every sign preserves its month in the existing Pavilion route',()=>{
 for(const p of initial)assert.deepEqual(plain(href(p.month)),{pathname:'/reflection',params:{month:String(p.month)}});
});

// Small hook runner exercises storage failures, draft isolation and cancellation without an app session.
function runner(raw=null,failSave=false,editor=true,development=true){
 let cells=[],index=0,effects=[],started=false,writes=[],reads=0;
 const react={useState:initial=>{const i=index++;if(!(i in cells))cells[i]=initial;return [cells[i],next=>{cells[i]=typeof next==='function'?next(cells[i]):next;}];},
 useRef:initial=>{const i=index++;if(!(i in cells))cells[i]={current:initial};return cells[i];},useEffect:fn=>{if(!started)effects.push(fn);}};
 const storage={getItem:async()=>{reads++;return raw;},setItem:async(key,value)=>{if(failSave)throw Error('unavailable');writes.push({key,value});raw=value;}};
 const hook=loadPlantingModules(undefined,react,storage,true,{},development)('../month-signs/useMonthlySigns').useMonthlySigns;
 const render=()=>{index=0;const state=hook(editor);if(!started){started=true;effects.forEach(fn=>fn());}return state;};
 return {render,writes,get reads(){return reads;}};
}
test('draft, cancel, resets and Save are isolated from other Garden storage',async()=>{
 const r=runner();r.render();await new Promise(resolve=>setImmediate(resolve));
 let s=r.render();assert.equal(s.ready,true);s.begin();s=r.render();s.update({...s.placements[0],scale:.9});
 s=r.render();assert.equal(s.placements[0].scale,.9);assert.equal(r.writes.length,0);s.cancel();
 s=r.render();assert.equal(s.placements[0].scale,1);s.begin();s=r.render();s.update({...s.placements[1],scale:.9});
 s=r.render();s.reset(2);s=r.render();assert.equal(s.placements[1].scale,1);
 s.update({...s.placements[0],scale:.9});s=r.render();await s.save();s=r.render();assert.equal(s.editing,false);
 assert.equal(r.writes.length,1);assert.equal(r.writes[0].key,'petalpal.month-sign-placements.v1');
 const restored=runner(r.writes[0].value);restored.render();await new Promise(resolve=>setImmediate(resolve));assert.equal(restored.render().placements[0].scale,.9);
});
test('failed save retains draft and does not close editor',async()=>{
 const r=runner(null,true);r.render();await new Promise(resolve=>setImmediate(resolve));r.render().begin();let s=r.render();s.update({...s.placements[0],scale:.9});s=r.render();await s.save();s=r.render();
 assert.equal(s.editing,true);assert.equal(s.placements[0].scale,.9);assert.match(s.status,/Save failed/);assert.equal(r.writes.length,0);
});

test('free transforms persist exactly, Cancel restores them, and normal mode cannot drag',async()=>{
 const chosen={...initial[0],x:-567.123456789,y:10000.987654321,scale:4.123456789};
 const r=runner();r.render();await new Promise(resolve=>setImmediate(resolve));
 r.render().update(chosen);assert.deepEqual(plain(r.render().placements[0]),plain(initial[0]));
 r.render().begin();r.render().update(chosen);await r.render().save();
 assert.deepEqual(JSON.parse(r.writes[0].value)[0],plain(chosen));
 const restored=runner(r.writes[0].value);restored.render();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(plain(restored.render().placements[0]),plain(chosen));
 restored.render().begin();restored.render().update({...chosen,x:0,y:0});restored.render().cancel();
 assert.deepEqual(plain(restored.render().placements[0]),plain(chosen));
 restored.render().begin();restored.render().reset();assert.deepEqual(plain(restored.render().placements),plain(initial));
 restored.render().cancel();assert.deepEqual(plain(restored.render().placements[0]),plain(chosen));
 assert.deepEqual(plain(href(chosen.month)),{pathname:'/reflection',params:{month:'1'}});
});

test('approved defaults match the exact 12-month source export',()=>{
 const exported=JSON.parse(fs.readFileSync(new URL('../src/components/garden/month-signs/monthly-sign-placements.json',import.meta.url),'utf8'));
 assert.deepEqual(plain(initial),exported);
 assert.ok(Object.isFrozen(initial));assert.ok(initial.every(Object.isFrozen));
});
test('normal Garden ignores local editor overrides and is locked in clean and returning sessions',async()=>{
 const changed=plain(initial);changed[0].x=-12345;
 for(const raw of [null,JSON.stringify(changed)])for(const development of [false,true]){
  const r=runner(raw,false,false,development);let state=r.render();
  assert.deepEqual(plain(state.placements),plain(initial));assert.equal(state.ready,true);
  state.begin();state=r.render();state.update(changed[0]);state.reset();await state.save();state.cancel();
  assert.equal(r.render().editing,false);assert.deepEqual(plain(r.render().placements),plain(initial));
  assert.equal(r.reads,0);assert.equal(r.writes.length,0);
 }
});
test('release cannot enable the development editor even if the flag is passed',async()=>{
 const r=runner(null,false,true,false);r.render().begin();await r.render().save();
 assert.equal(r.render().editing,false);assert.equal(r.reads,0);assert.equal(r.writes.length,0);
});
