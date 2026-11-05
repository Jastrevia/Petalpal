import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const otter=loadPlantingModules()('../spirits/otterSwims');
const network=otter.getSwimNetwork();
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const close=(a,b)=>assert.ok(distance(a,b)<1e-6);

test('largest safe component spans the lake, branches, and never joins land-separated bays',()=>{
  assert.ok(network.nodes.length>50);
  assert.ok(network.bounds.maxX-network.bounds.minX>1000);
  assert.ok(network.nodes.some(p=>p.links.length>2));
  const seen=new Set([0]),pending=[0];
  for(const id of pending) for(const next of network.nodes[id].links) if(!seen.has(next)){seen.add(next);pending.push(next);}
  assert.equal(seen.size,network.nodes.length);
  for(const p of network.nodes) {
    assert.ok(otter.isOpenWater(p,otter.OTTER_BODY_RADIUS+16));
    for(const id of p.links) {
      const q=network.nodes[id],heading=Math.atan2(q.y-p.y,q.x-p.x);
      for(let t=0;t<=1;t+=.025) {
        const point={x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};
        assert.ok(otter.isOpenWater(point)||otter.bodyFits(point,heading),'entire body fits, not only its center');
      }
    }
  }
  assert.equal(otter.swimmableWater({x:100,y:600}),false,'western terrain stays solid');
  assert.equal(otter.swimmableWater({x:1800,y:0}),false,'decorative scenic collision exclusion is not water');
});

test('every possible junction and both dead-end turns keep the full rotating body clear',()=>{
  for(let to=0;to<network.nodes.length;to++) for(const from of network.nodes[to].links)
    for(const next of network.nodes[to].links) for(const side of next===from?[-1,1]:[1]) {
      const entering=otter.straightLeg(network,from,to),turn=otter.turningLeg(network,from,to,next,side);
      const exiting=otter.straightLeg(network,to,next);
      close(entering.samples.at(-1),turn.samples[0]);
      close(turn.samples.at(-1),exiting.samples[0]);
      for(const point of turn.samples) assert.ok(otter.isOpenWater(point),'turn clearance includes artwork and glow at every heading');
      assert.ok(turn.speed>0 && turn.speed<=otter.OTTER_SPEED);
    }
});

test('four simulated hours explore the whole network without resets, pauses, or heading snaps',()=>{
  let state=otter.createSwim(network,7),maxStep=0,maxYaw=0,turns=0;
  const visited=new Set();
  for(let i=0;i<144000;i++) {
    const before=state;state=otter.advanceSwim(network,state,.1);
    const step=distance(before,state);
    maxStep=Math.max(maxStep,step);maxYaw=Math.max(maxYaw,Math.abs(state.heading-before.heading));
    assert.ok(step>0,'route ends never freeze or despawn the swimmer');
    assert.ok(Number.isFinite(state.x)&&Number.isFinite(state.y));
    if(state.turning&&!before.turning) turns++;
    visited.add(state.to);
    if(i%10===0) assert.ok(otter.isOpenWater(state)||otter.bodyFits(state,state.heading),'rendered whole-body pose stays in water');
  }
  assert.equal(visited.size,network.nodes.length,'visitation weighting explores every branch');
  assert.ok(turns>100);
  assert.ok(maxStep<=otter.OTTER_SPEED*.1+1e-6,'no teleport');
  assert.ok(maxYaw<=.095+1e-6,'heading crosses +/-pi continuously');
});

test('dead ends use a moving curved U-turn, slow down, and resume at the same world-space join',()=>{
  const from=0,to=network.nodes[from].links[0];
  const turn=otter.turningLeg(network,from,to,from);
  close(turn.samples[0],turn.samples.at(-1));
  assert.ok(turn.samples.some(p=>distance(p,turn.samples[0])>10),'swims a real curve instead of flipping in place');
  const first=turn.samples[0].heading,last=turn.samples.at(-1).heading;
  assert.ok(Math.abs(Math.abs(Math.atan2(Math.sin(last-first),Math.cos(last-first)))-Math.PI)<.1);
  assert.ok(turn.speed<otter.OTTER_SPEED*.6);
});

test('only actual bridge decks can override dry collision; terrain and causeways cannot',()=>{
  for(const p of [{x:1660,y:560},{x:1710,y:1380},{x:1650,y:950}])
    assert.equal(otter.swimmableWater(p),true);
  for(const p of [{x:100,y:600},{x:1200,y:700},{x:1600,y:1700}])
    assert.equal(otter.swimmableWater(p),false);
});
