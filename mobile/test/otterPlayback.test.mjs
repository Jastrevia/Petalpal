import assert from 'node:assert/strict';
import test from 'node:test';
import {loadPlantingModules} from './loadPlantingModules.mjs';

function explorer(reduced=false,provided) {
  const shared=[],clock={value:0};let cursor=0,reaction,active=true;
  const react={memo:fn=>fn,useMemo:fn=>fn()};
  const reanimated={
    useSharedValue:initial=>{const index=cursor++;return shared[index]??= {value:initial};},
    useDerivedValue:fn=>({get value(){return fn();}}),
    useReducedMotion:()=>reduced,
    useAnimatedReaction:(_prepare,callback)=>{reaction=callback;},
  };
  const load=loadPlantingModules(undefined,react,undefined,true,{
    'react-native-reanimated':reanimated,
    '@shopify/react-native-skia':{Group:'Group',Paint:'Paint',Mask:'Mask',Rect:'Rect',Image:'Image',
      Shader:'Shader',ImageShader:'ImageShader',ColorMatrix:'ColorMatrix',useImage:()=>({}),
      Skia:{RuntimeEffect:{Make:()=>({})}}},
  });
  const {Otter}=load('../spirits/MemoryOtter');
  const network=provided??{nodes:[{x:200,y:1450,links:[1]},{x:1000,y:1450,links:[0,2]},
    {x:1400,y:1650,links:[1]}],bounds:{}};
  let tree;
  const render=()=>{cursor=0;tree=Otter({clock,network,active});};
  render();
  const spriteElement=()=>tree.props.children.props.children.props.children.props.children;
  const sprite=()=>spriteElement().props;
  const uniforms=()=>{const element=spriteElement();return element.type(element.props).props.children.props.uniforms.value;};
  return {shared,clock,render,sprite,uniforms,setActive(value){active=value;render();},tick(dt=1/60){const before=clock.value;clock.value+=dt;reaction(clock.value,before);}};
}

for(const reduced of [false,true]) test('body and water continue for at least three cycles through travel, turns and rerenders; reduced='+reduced,()=>{
  const e=explorer(reduced),frames=new Set();let wraps=0,last=e.sprite().frame.value,held=0,maxHeld=0,turns=0,turnFrameChanges=0,moved=0;
  for(let i=0;i<3600;i++) {
    const before=e.shared[0].value;e.tick();const after=e.shared[0].value;
    moved+=Math.hypot(after.x-before.x,after.y-before.y);
    if(after.turning&&!before.turning)turns++;
    const frame=e.sprite().frame.value;frames.add(frame);
    if(after.turning && frame!==last)turnFrameChanges++;
    if(frame<last){assert.equal(last,61);assert.equal(frame,0);wraps++;}
    held=frame===last?held+1:0;maxHeld=Math.max(maxHeld,held);last=frame;
    if(i%173===0) {
      const phase=e.sprite().seconds.value,position=e.shared[0].value;
      e.render();assert.equal(e.sprite().seconds.value,phase,'rerender preserves playback phase');
      assert.equal(e.uniforms().frame,frame,'shader receives the advancing body frame');
      assert.equal(e.uniforms().seconds,phase,'water shader shares the body phase, including reduced motion');
      assert.equal(e.shared[0].value,position,'rerender preserves navigation state');
    }
  }
  assert.ok(moved>500);
  assert.ok(turns>=2,'covers real navigation turn transitions');
  assert.ok(turnFrameChanges>2,'body animation keeps advancing during turns');
  assert.ok(wraps>=3,'three full cycles, not one playback followed by a held pose');
  assert.equal(frames.size,62,'all source frames are reached');
  assert.ok(maxHeld/60<.3,'no visible held pose between cycles');
  assert.ok(e.sprite().seconds.value>0,'water effects share an advancing activity phase');
});

test('playback responds to actual movement speed and is not a fixed wall-clock rate',()=>{
  const slow=explorer(),fast=explorer();
  slow.shared[0].value={...slow.shared[0].value,speed:8,leg:{...slow.shared[0].value.leg,speed:8}};
  fast.shared[0].value={...fast.shared[0].value,speed:42,leg:{...fast.shared[0].value.leg,speed:42}};
  for(let i=0;i<120;i++){slow.tick();fast.tick();}
  assert.ok(fast.sprite().seconds.value>slow.sprite().seconds.value*1.15,'faster swimming advances the stroke and flow phase faster');
});

test('inactive otter pauses and resumes without a phase jump or reset',()=>{
  const e=explorer();for(let i=0;i<120;i++)e.tick();
  const phase=e.sprite().seconds.value;
  const position=e.shared[0].value;
  e.setActive(false);for(let i=0;i<600;i++)e.tick();
  assert.equal(e.sprite().seconds.value,phase);
  assert.equal(e.shared[0].value,position);
  e.setActive(true);e.tick(0);assert.equal(e.sprite().seconds.value,phase);
  e.render();e.tick();
  assert.ok(e.sprite().seconds.value>phase);
  assert.ok(e.sprite().seconds.value-phase<.05);
});

test('long straight travel loops for three complete cycles without route resets',()=>{
  const network={nodes:[{x:100,y:1450,links:[1]},{x:2300,y:1450,links:[0]}],bounds:{}};
  const e=explorer(false,network);let wraps=0,last=0;
  for(let i=0;i<1200;i++){
    e.tick();const frame=e.sprite().frame.value;
    if(frame<last){assert.equal(last,61);assert.equal(frame,0);wraps++;}last=frame;
    assert.equal(e.shared[0].value.turning,false,'still on the long straight segment');
  }
  assert.ok(wraps>=3);
});
