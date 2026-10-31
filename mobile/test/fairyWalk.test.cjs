const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const ts=require('typescript');
const source=path.join(__dirname,'../src/components/garden/fairy/walkNetwork.ts');
const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod=new Module(source);mod._compile(compiled,source);
const {WALK_NETWORK:net,WALK_START,route,advance,nearest,distance,walkFrame,WALK_LOOP_MS,WALK_FRAMES,WALK_IDLE}=mod.exports;
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS',name);};
check('All authored nodes are connected from the valid initial foot position',()=>{
 assert.ok(nearest(WALK_START,net,.001));
 for(const node of net.nodes)assert.ok(route(WALK_START,node),JSON.stringify(node));
});
check('Planting lawns and water reject movement; no long-distance snapping',()=>{
 const screenPoints=[[680,320],[585,434],[790,439],[280,356],[257,527],[330,647],[758,715],[1130,752],[1130,454],[845,692],[1380,940]];
 for(const [x,y] of screenPoints){const p={x:(x-76)/.52,y:(y-64)/.52};assert.equal(route(WALK_START,p),null,JSON.stringify(p));}
 assert.equal(route(WALK_START,{x:NaN,y:10}),null);
});
check('A distant route follows connected paving, never a straight shortcut',()=>{
 const target=net.nodes.find(p=>Math.abs(p.x-(330-76)/.52)<.01&&Math.abs(p.y-(719-64)/.52)<.01);
 const result=route(WALK_START,target);assert.ok(result.length>5);
 const length=result.slice(1).reduce((sum,p,i)=>sum+distance(result[i],p),0);
 assert.ok(length>distance(WALK_START,target)*1.25);
});
check('Every simulated foot position stays on a graph edge including sharp turns',()=>{
 for(const target of net.nodes){let pos=WALK_START;let remaining=route(pos,target).slice(1);let iterations=0;
  while(remaining.length){const next=advance(pos,remaining,17);pos=next.point;remaining=next.remaining;assert.ok(nearest(pos,net,.001));assert.ok(++iterations<1000);}
  assert.ok(distance(pos,target)<.001);
 }
});
check('Mid-edge retargeting and opposite travel remain constrained',()=>{
 const target=net.nodes[8];let state=advance(WALK_START,route(WALK_START,target).slice(1),32);
 const back=route(state.point,WALK_START);assert.ok(back);
 state=advance(state.point,back.slice(1),10000);assert.ok(distance(state.point,WALK_START)<.001);
});
check('Closed segments cannot be crossed, including a large elapsed-time step',()=>{
 const blocked=p=>distance(p,WALK_START)<5;assert.equal(route(WALK_START,net.nodes[5],blocked),null);
 const stopped=advance(WALK_START,[net.nodes[1]],1000,blocked);assert.deepEqual(stopped.point,WALK_START);assert.equal(stopped.remaining.length,0);
});
check('Painted stride: order, cadence, looping and the standing painting at rest are fixed',()=>{
 assert.equal(WALK_FRAMES,25);assert.equal(WALK_LOOP_MS,500);
 for(let i=0;i<WALK_FRAMES;i++)assert.equal(walkFrame(i*WALK_LOOP_MS/WALK_FRAMES+1,true),i);
 assert.equal(walkFrame(WALK_LOOP_MS,true),0);assert.equal(walkFrame(777,false),WALK_IDLE);
 const layer=fs.readFileSync(path.join(path.dirname(source),'GardenFairy.tsx'),'utf8');
 // Standing is her original painting; walking only the painted stride sheet, no other set.
 assert.equal((layer.match(/walk-v2\/walk_0[1-8]\.png/g)||[]).length,1);
 assert.ok(layer.includes('walk-v2/walk_04.png')&&layer.includes('walk-video-v1/walk.webp'));
 assert.ok(!/walk-v[34]/.test(layer));
});
console.log(`${count} fairy movement checks passed`);
