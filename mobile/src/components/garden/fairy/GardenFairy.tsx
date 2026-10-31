import MailboxFairy from './MailboxFairy';
import TreehouseEntryOcclusion from './TreehouseEntryOcclusion';
import {WALK_SPRITE_HEIGHT,walkVisualHeight,FLY_VISUAL_HEIGHT,SEATED_VISUAL_HEIGHT} from './fairyMetrics';
import { FairyNavigation, type FairyState } from './FairyNavigation';
import SwingFlightOcclusion from './SwingFlightOcclusion';
import FlyingFairy from './FlyingFairy';
import { SWING_APPROACH } from './swingDestination';
import { Circle, Group, Image, Path, useImage } from '@shopify/react-native-skia';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { WALK_NETWORK, WALK_START, WALK_FRAMES, WALK_IDLE, walkFrame, type Point } from './walkNetwork';
import SheetFrame from '../SheetFrame';
import { groundRoute } from './groundNavigation';
import type { ScheduleRest } from './fairySchedule';

// Standing: her original painting. Walking: one painted stride, 25 frames of 280 × 420 in a
// 5-wide sheet, on the same canvas (so the same foot pivot) as the painting.
const STANDING=require('@/assets/garden/fairy/walk-v2/walk_04.png');
const WALKING=require('@/assets/garden/fairy/walk-video-v1/walk.webp');
const CELL={w:280,h:420,columns:5};
export type FairyHandle = { getPosition:()=>Point; getState:()=>FairyState; place:(rest:ScheduleRest,at?:Point)=>boolean; move:(p:Point)=>boolean; visitSwing:()=>boolean; visitMoonBed:()=>boolean; visitTea:()=>boolean; visitTreehouse:()=>boolean; visitMailbox:()=>boolean; isMailboxBusy:()=>boolean; returnFromMailbox:()=>boolean; returnFromTreehouse:()=>boolean; pointer:(p:Point)=>void; stop:()=>void };
type Props={motionClock?:SharedValue<number>;onMailboxOpened?:()=>void;onTreehouseEntered?:()=>void;onTreehouseExited?:()=>void;pixelsPerUnit?:()=>number;onStateChange?:(state:FairyState)=>void;blocked:(p:Point)=>boolean;active:boolean;debug:boolean;onStatus:(s:string)=>void};
const polyline=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
const networkPath=WALK_NETWORK.edges.map(e=>polyline([WALK_NETWORK.nodes[e.a],WALK_NETWORK.nodes[e.b]])).join(' ');
function WalkSprite({frame}:{frame:SharedValue<number>}) {
  const standing=useImage(STANDING),walking=useImage(WALKING);
  const standingOpacity=useDerivedValue(()=>frame.value===WALK_IDLE?1:0);
  const walkingOpacity=useDerivedValue(()=>frame.value===WALK_IDLE?0:1);
  const cell=useDerivedValue(()=>Math.max(0,frame.value));
  // One fixed foot/base pivot for every frame: the sheet's cells share the painting's canvas.
  return <>
    {standing?<Image image={standing} x={-58} y={-139} width={102.4} height={WALK_SPRITE_HEIGHT} fit="fill" opacity={standingOpacity}/>:null}
    {walking?<Group opacity={walkingOpacity} transform={[{translateX:-58},{translateY:-139},{scale:102.4/CELL.w}]}>
      <SheetFrame sheet={walking} frame={cell} columns={CELL.columns} count={WALK_FRAMES} w={CELL.w} h={CELL.h}/>
    </Group>:null}
  </>;
}
const GardenFairy=forwardRef<FairyHandle,Props>(function GardenFairy({blocked,active,debug,onStatus,onStateChange,pixelsPerUnit,onTreehouseEntered,onTreehouseExited,onMailboxOpened,motionClock},ref){
  const x=useSharedValue(WALK_START.x),y=useSharedValue(WALK_START.y),facing=useSharedValue(1),frame=useSharedValue(WALK_IDLE);
  const treehouseDepth=useSharedValue(0),treehouseScale=useSharedValue(1);
  const mailboxPhase=useSharedValue(0),mailboxElapsed=useSharedValue(0);
  const mailCount=useRef(0);
  const mailboxBlend=useDerivedValue(()=>mailboxPhase.value===1?Math.min(1,mailboxElapsed.value/250):mailboxPhase.value>1&&mailboxPhase.value<4?1:0);
  const normalPoseOpacity=useDerivedValue(()=>mailboxPhase.value===4?0:1-mailboxBlend.value);
  const exitCount=useRef(0);
  const entryCount=useRef(0);
  const lift=useSharedValue(0), lean=useSharedValue(0);
  const flightSeconds=useSharedValue(0), flightBlend=useSharedValue(0);
  const localClock=useSharedValue(0),seconds=motionClock??localClock;
  const groundOpacity=useDerivedValue(()=>1-flightBlend.value);
  const nav=useRef(new FairyNavigation());
  const elapsed=useRef(0);
  const [state,setState]=useState<FairyState>('idle');
  const lastState=useRef<FairyState>('idle');
  const config=useRef({blocked,active,debug,onStatus,onStateChange,pixelsPerUnit,onTreehouseEntered,onTreehouseExited,onMailboxOpened});config.current={blocked,active,debug,onStatus,onStateChange,pixelsPerUnit,onTreehouseEntered,onTreehouseExited,onMailboxOpened};
  const [routeDrawing,setRouteDrawing]=useState(''),[targetDrawing,setTargetDrawing]=useState<Point|null>(null);
  const [pointerDrawing,setPointerDrawing]=useState<{p:Point;valid:boolean}|null>(null);
  const trace=useRef<Point[]>([]);
  const transform=useSharedValue([{translateX:WALK_START.x},{translateY:WALK_START.y},{rotate:0},{scaleX:1},{scale:1}]);
  const step=useRef<(now:number)=>void>(()=>{});
  const controls=useRef<FairyHandle>(null);
  const publish = () => {
    const current=nav.current;
    mailboxPhase.value=current.state==='retrievingMail'?1:current.state==='turningWithMail'?2:current.state==='presentingMail'?3:current.state==='mailboxTransition'?4:0;
    mailboxElapsed.value=current.mailboxElapsedMs;
    treehouseDepth.value=current.treehouseDepth;treehouseScale.value=current.treehouseScale;
    x.value=current.position.x;y.value=current.position.y;lift.value=current.lift;
    // Preserve main's immediate shared transform publication on pointer input.
    transform.value=[{translateX:current.position.x},{translateY:current.position.y-current.lift},
      {rotate:lean.value},{scaleX:facing.value},{scale:current.treehouseScale}];
    flightBlend.value=current.airborne?((current.state==='aligningToTea'||current.state==='aligningToSwing'||current.state==='aligningToMoonBed')?1:Math.min(1,current.flightTime/220)*((current.state==='flying'||current.state==='flyingToTreehouse'||current.state==='flyingToMailbox')?Math.min(1,(1-current.flightProgress)*current.duration/220):1)):0;
    if(lastState.current!==current.state){
      lastState.current=current.state;setState(current.state);config.current.onStateChange?.(current.state);
      config.current.onStatus({movingToMailbox:'Walking to mailbox',flyingToMailbox:'Flying to mailbox',aligningToMailbox:'Aligning beside mailbox',retrievingMail:'Retrieving a letter',turningWithMail:'Turning toward camera',presentingMail:'Opening the letter',mailboxTransition:'Mailbox opened · handoff ready',flyingToTreehouse:'Flying to treehouse entrance',enteringTreehouse:'Walking into the treehouse',exitingTreehouse:'Walking out of the treehouse',insideTreehouse:'Inside treehouse · handoff ready',flyingToTea:'Flying to afternoon tea',aligningToTea:'Taking a seat',seatedAtTea:'Seated for afternoon tea',drinkingTea:'Enjoying afternoon tea · tap to leave',flyingToMoonBed:'Flying to the moon bed',aligningToMoonBed:'Settling into the moon bed',sleepingOnMoonBed:'Sleeping on the moon bed · tap to leave',idle:'Resting on dry ground',walking:'Walking on dry ground',flying:'Flying to the destination',flyingToSwing:'Flying to the swing',aligningToSwing:'Settling onto the swing',sittingOnSwing:'Sitting on the swing · tap dry ground to leave'}[current.state]);
    }
  };
  const requestMove=(p:Point,swing=false,moon=false,tea=false,treehouse=false,mailbox=false)=>{
    if(!config.current.active)return false;
    const accepted=nav.current.move(p,config.current.blocked,swing,nav.current.state==='sittingOnSwing'?SEATED_VISUAL_HEIGHT:nav.current.airborne?FLY_VISUAL_HEIGHT:walkVisualHeight(),moon,tea,treehouse,mailbox);

    if(!accepted){if(nav.current.traversingTreehouse||nav.current.state==='insideTreehouse'||nav.current.mailboxSequenceActive)return false;config.current.onStatus(nav.current.decision?.reason==='Water or plantable flower area'?'Water / flower bed · choose dry ground':'Cannot reach this destination');return false;}
    elapsed.current=0;
    if(config.current.debug){setRouteDrawing(polyline([nav.current.position,...nav.current.remaining]));setTargetDrawing(nav.current.target);}
    publish();step.current(performance.now());
    if(__DEV__&&config.current.debug&&nav.current.decision){const d=nav.current.decision;
      config.current.onStatus(`${d.mode} · height ${d.visualHeight.toFixed(1)} · distance ${d.distanceToTarget.toFixed(1)}\nPath: ${d.pathDistance?.toFixed(1)??(d.pathEvaluated?"unreachable":"not evaluated")} · local section: ${d.sameLocalPathSection}\n${d.reason}`);
    }
    return true;
  };
  if(!controls.current)controls.current={
    getPosition:()=>({...nav.current.position}),
    getState:()=>nav.current.state,
    // Her schedule's resting place, without travel (the Garden just opened).
    place:(rest,at)=>{
      if(!nav.current.place(rest,at))return false;
      elapsed.current=0;facing.value=1;lean.value=0;frame.value=WALK_IDLE;flightBlend.value=0;
      publish();step.current(performance.now());return true;
    },
    move:p=>requestMove(p),
    returnFromTreehouse:()=>{
      const accepted=nav.current.returnFromTreehouse();if(!accepted)return false;
      elapsed.current=0;facing.value=1;lean.value=0;frame.value=WALK_IDLE;publish();return true;
    },
    isMailboxBusy:()=>nav.current.mailboxSequenceActive||nav.current.state==='movingToMailbox'||nav.current.state==='flyingToMailbox',
    visitMailbox:()=>(nav.current.mailboxSequenceActive||nav.current.state==='movingToMailbox'||nav.current.state==='flyingToMailbox')?false:requestMove({x:0,y:0},false,false,false,false,true),
    returnFromMailbox:()=>{const accepted=nav.current.returnFromMailbox();if(accepted){elapsed.current=0;frame.value=WALK_IDLE;publish();}return accepted;},
    visitTreehouse:()=>requestMove({x:0,y:0},false,false,false,true),
    visitSwing:()=>requestMove(SWING_APPROACH,true),
    visitTea:()=>requestMove({x:0,y:0},false,false,true),
    visitMoonBed:()=>requestMove({x:0,y:0},false,true),
    pointer(p){if(!config.current.debug)return;const valid=!config.current.blocked(p);
      setPointerDrawing({p,valid});},
    stop(){nav.current.stop();frame.value=WALK_IDLE;setRouteDrawing('');setTargetDrawing(null);publish();},
  };
  useImperativeHandle(ref,()=>controls.current!,[]);
  useEffect(()=>{
    let previous:number|undefined,request:number;
    const advanceAt=(now:number)=>{
      const dt=previous===undefined?0:Math.max(0,Math.min(50,now-previous));
      previous=Math.max(previous??now,now);
      // A covered Garden pauses in place; resuming must not reset an interaction.
      if(!config.current.active)return;
      if(config.current.active)seconds.value+=dt/1000;
      if(config.current.active&&(nav.current.remaining.length||nav.current.airborne||nav.current.state==='seatedAtTea'||nav.current.traversingTreehouse||(nav.current.mailboxSequenceActive&&nav.current.state!=='mailboxTransition'))){
        const old=nav.current.position;
        const moved=nav.current.update(dt,config.current.blocked);
        if(nav.current.airborne)flightSeconds.value+=dt/1000;
        const point=nav.current.position;
        if(Math.abs(point.x-old.x)>.001)facing.value=point.x>old.x?1:-1;
        lean.value+=( (nav.current.airborne ? (point.x-old.x)*.012 : 0)-lean.value)*Math.min(1,dt/160);
        if(nav.current.traversingTreehouse){facing.value=nav.current.state==='exitingTreehouse'?1:-1;lean.value=0;}
        if(nav.current.state==='aligningToMailbox'||nav.current.state==='retrievingMail'){facing.value=-1;lean.value=0;}
        publish();elapsed.current+=dt;frame.value=nav.current.airborne?WALK_IDLE:walkFrame(elapsed.current,nav.current.remaining.length>0||nav.current.traversingTreehouse||nav.current.state==='aligningToMailbox');
        if(nav.current.mailboxOpenedCount>mailCount.current){
          mailCount.current=nav.current.mailboxOpenedCount;config.current.onMailboxOpened?.();
        }
        if(nav.current.treehouseEntryCount>entryCount.current){
          entryCount.current=nav.current.treehouseEntryCount;
          config.current.onTreehouseEntered?.();
        }
        if(nav.current.treehouseExitCount>exitCount.current){
          exitCount.current=nav.current.treehouseExitCount;config.current.onTreehouseExited?.();
        }
        if(config.current.debug&&moved){trace.current.push(point);if(trace.current.length>20000)trace.current.shift();}
        if(config.current.debug&&!nav.current.remaining.length){setRouteDrawing('');setTargetDrawing(nav.current.target);}
      }else frame.value=WALK_IDLE;
    };
    step.current=advanceAt;
    const tick=(now:number)=>{advanceAt(now);request=requestAnimationFrame(tick);};
    request=requestAnimationFrame(tick);
    return()=>{step.current=()=>{};cancelAnimationFrame(request);};
  },[x,y,frame,facing,transform,seconds]);
  useEffect(()=>{
    setRouteDrawing(debug&&nav.current.remaining.length?polyline([nav.current.position,...nav.current.remaining]):'');
    setTargetDrawing(debug?nav.current.target:null);
  },[debug]);
  useEffect(()=>{
    if(!__DEV__||typeof window==='undefined')return;
    const host=window as unknown as {__fairyDebug?:unknown};
    const api={move:(p:Point)=>controls.current!.move(p),getState:()=>({position:nav.current.position,target:nav.current.target,
      mailboxElapsedMs:nav.current.mailboxElapsedMs,mailboxOpenedCount:nav.current.mailboxOpenedCount,treehouseEntryProgress:nav.current.treehouseEntryProgress,treehouseDepth:nav.current.treehouseDepth,treehouseScale:nav.current.treehouseScale,treehouseExitCount:nav.current.treehouseExitCount,treehouseEntryCount:nav.current.treehouseEntryCount,remaining:nav.current.remaining,frame:frame.value+1,facing:facing.value,source:'V2',state:nav.current.state,decision:nav.current.decision,lift:nav.current.lift,flightProgress:nav.current.flightProgress,active:config.current.active}),
      network:WALK_NETWORK,trace:()=>trace.current,clearTrace:()=>{trace.current=[];},
      isWalkable:(p:Point)=>!config.current.blocked(p),route:(p:Point)=>groundRoute(nav.current.position,p,config.current.blocked)};
    host.__fairyDebug=api;return()=>{if(host.__fairyDebug===api)delete host.__fairyDebug;};
  },[frame,facing]);
  return <>
    {debug&&<>
      <Path path={networkPath} color="rgba(40,215,210,.4)" style="stroke" strokeWidth={12}/>
      <Path path={networkPath} color="#e6fff7" style="stroke" strokeWidth={2}/>
      {routeDrawing&&<Path path={routeDrawing} color="#ffde68" style="stroke" strokeWidth={5}/>}
      {targetDrawing&&<Circle cx={targetDrawing.x} cy={targetDrawing.y} r={7} color="#ffde68"/>}
      {pointerDrawing&&<Circle cx={pointerDrawing.p.x} cy={pointerDrawing.p.y} r={8} color={pointerDrawing.valid?'#48e0a0':'#fb6272'}/>}
    </>}
    <Group opacity={normalPoseOpacity}>
    <Group opacity={(state==='seatedAtTea'||state==='drinkingTea'||state==='sittingOnSwing'||state==='sleepingOnMoonBed'||state==='insideTreehouse')?0:1} transform={transform}>
      <Group opacity={groundOpacity}><WalkSprite frame={frame}/></Group>
      <FlyingFairy seconds={flightSeconds} blend={flightBlend}/>
    </Group>
    </Group>
    {/* Only the development Garden still runs these two sequences: no textures otherwise. */}
    {state.toLowerCase().includes('mail')&&<MailboxFairy x={x} y={y} phase={mailboxPhase} elapsedMs={mailboxElapsed} opacity={mailboxBlend}/>}
    {state.toLowerCase().includes('treehouse')&&<TreehouseEntryOcclusion depth={treehouseDepth}/>}
    {(state==='flying'||state==='flyingToSwing'||state==='aligningToSwing')&&<SwingFlightOcclusion/>}
    {debug&&<Circle cx={x} cy={y} r={4} color="#ff4285"/>}
  </>;
});
export default GardenFairy;
