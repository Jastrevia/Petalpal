import { mailboxApproachAnchor, mailboxInteractionAnchor, mailboxPresentAnchor, mailboxExitAnchor, MAILBOX_TIMING } from './mailboxDestination';
import { treehouseApproachAnchor, treehouseDoorAnchor, treehouseInteriorAnchor } from './treehouseDestination';
import {TEA_EXIT,TEA_APPROACH,TEA_SEAT} from './teaDestination';
import {MOON_EXIT,MOON_APPROACH,MOON_SLEEP_ANCHOR} from './moonDestination';
import {walkVisualHeight} from './fairyMetrics';
import {GARDEN_WORLD_BOUNDS} from '../rendering/gardenWorldBounds';
import { advance, route as pathRoute, nearest, distance, WALK_START, type Point } from './walkNetwork';
import { groundRoute } from './groundNavigation';
import { SWING_EXIT } from './swingDestination';
import { createAerialFlight, sampleFlight, smooth, SWING_FLIGHT_APPROACH, SWING_FLIGHT_SEAT } from './swingFlight';
export const WALK_SPEED=.110; // world units per millisecond; shared with renderer
// Flying is how she crosses the Garden; owner feedback 2026-10-26: was .18 and felt slow.
export const FLIGHT_SPEED=.30, MIN_FLIGHT_MS=700;

export const WALK_HEIGHT_MULTIPLIER=4;
export type MovementDecision={target:Point;visualHeight:number;distanceToTarget:number;pathDistance:number|null;pathEvaluated:boolean;sameLocalPathSection:boolean;walkReachable:boolean|null;mode:'WALK'|'FLY'|'INVALID';reason:string};
export type FairyState='idle'|'walking'|'flying'|'flyingToSwing'|'aligningToSwing'|'sittingOnSwing'|'flyingToMoonBed'|'aligningToMoonBed'|'sleepingOnMoonBed'|'flyingToTea'|'aligningToTea'|'seatedAtTea'|'drinkingTea'|'flyingToTreehouse'|'enteringTreehouse'|'insideTreehouse'|'exitingTreehouse'|'movingToMailbox'|'flyingToMailbox'|'aligningToMailbox'|'retrievingMail'|'turningWithMail'|'presentingMail'|'mailboxTransition';
const length=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
export class FairyNavigation {
  state:FairyState='idle';position:Point;remaining:Point[]=[];target:Point|null=null;
  lift=0;flightStartLift=0;flightProgress=0;flight:Point[]=[];flightTime=0;duration=0;estimatedWalkMs=0;
  decision:MovementDecision|null=null;
  private mailboxTarget=false;
  mailboxElapsedMs=0;mailboxOpenedCount=0;
  private mailboxAlignmentStart:Point|null=null;
  private mailboxAlignmentMs=0;
  private treehouseTarget=false;
  treehouseEntryProgress=0;treehouseEntryCount=0;treehouseExitCount=0;
  treehouseDepth=0;treehouseScale=1;
  private entryTime=0;
  private teaTarget=false;private seatedTime=0;
  get atTea(){return this.state==='seatedAtTea'||this.state==='drinkingTea';}
  private swingTarget=false;private moonTarget=false;
  private alignment:Point[]=[];
  constructor(start:Point=WALK_START){this.position={...start};}
  get airborne(){return this.state==='flyingToMailbox'||this.state==='flyingToTreehouse'||this.state==='flyingToTea'||this.state==='aligningToTea'||this.state==='flying'||this.state==='flyingToSwing'||this.state==='aligningToSwing'||this.state==='flyingToMoonBed'||this.state==='aligningToMoonBed';}
  private align(){
    if(this.mailboxTarget){this.beginMailboxAlignment();return;}
    if(this.treehouseTarget){this.beginTreehouseEntry();return;}
    const approach=createAerialFlight(this.position,this.teaTarget?TEA_APPROACH:this.moonTarget?MOON_APPROACH:SWING_FLIGHT_APPROACH);
    if(!approach){this.state='idle';return;}
    this.alignment=[...approach,this.teaTarget?TEA_SEAT:this.moonTarget?MOON_SLEEP_ANCHOR:SWING_FLIGHT_SEAT];this.flightTime=0;
    this.duration=Math.max(850,length(this.alignment)/.12);this.state=this.teaTarget?'aligningToTea':this.moonTarget?'aligningToMoonBed':'aligningToSwing';
  }
  // Travel can be retargeted normally; the short letter sequence owns the
  // character from alignment until the mail UI handoff has been consumed.
  get mailboxSequenceActive(){return this.state==='aligningToMailbox'||this.state==='retrievingMail'||
    this.state==='turningWithMail'||this.state==='presentingMail'||this.state==='mailboxTransition';}
  visitMailbox(blocked:(p:Point)=>boolean,visualHeight=walkVisualHeight()){
    return this.move(mailboxApproachAnchor,blocked,false,visualHeight,false,false,false,true);
  }
  returnFromMailbox(){
    if(this.state!=='mailboxTransition')return false;
    this.position={...mailboxExitAnchor};this.target=null;this.remaining=[];this.flight=[];
    this.lift=0;this.mailboxTarget=false;this.mailboxElapsedMs=0;this.state='idle';return true;
  }
  private beginMailboxAlignment(){
    this.remaining=[];this.lift=0;this.mailboxElapsedMs=0;
    this.mailboxAlignmentStart={...this.position};
    this.mailboxAlignmentMs=Math.max(1,distance(this.position,mailboxInteractionAnchor)/WALK_SPEED);
    this.state='aligningToMailbox';
  }
  private updateMailbox(dtMs:number){
    const old=this.position;
    // Consume elapsed time across phase boundaries so even a delayed frame
    // cannot skip the required open-letter hold or issue a second handoff.
    let left=Math.max(0,dtMs);
    while(left>0&&this.state!=='mailboxTransition'){
      const duration=this.state==='aligningToMailbox'?this.mailboxAlignmentMs:
        this.state==='retrievingMail'?MAILBOX_TIMING.retrieveMs:
        this.state==='turningWithMail'?MAILBOX_TIMING.turnMs:
        MAILBOX_TIMING.unfoldMs+MAILBOX_TIMING.holdMs;
      const step=Math.min(left,Math.max(0,duration-this.mailboxElapsedMs));
      this.mailboxElapsedMs+=step;left-=step;
      const t=Math.min(1,this.mailboxElapsedMs/duration);
      if(this.state==='aligningToMailbox')
        this.position=sampleFlight([this.mailboxAlignmentStart!,mailboxInteractionAnchor],t);
      else if(this.state==='turningWithMail')
        this.position=sampleFlight([mailboxInteractionAnchor,mailboxPresentAnchor],smooth(t));
      if(t<1)break;
      this.mailboxElapsedMs=0;
      if(this.state==='aligningToMailbox'){this.position={...mailboxInteractionAnchor};this.state='retrievingMail';}
      else if(this.state==='retrievingMail')this.state='turningWithMail';
      else if(this.state==='turningWithMail'){this.position={...mailboxPresentAnchor};this.state='presentingMail';}
      else {this.state='mailboxTransition';this.target=null;this.mailboxOpenedCount++;}
    }
    return distance(old,this.position);
  }
  get traversingTreehouse(){return this.state==='enteringTreehouse'||this.state==='exitingTreehouse';}
  private get treehouseStairsMs(){return distance(treehouseApproachAnchor,treehouseDoorAnchor)/WALK_SPEED;}
  private get treehouseInsideMs(){return Math.max(900,distance(treehouseDoorAnchor,treehouseInteriorAnchor)*1.5/WALK_SPEED);}
  returnFromTreehouse(){
    if(this.state!=='insideTreehouse')return false;
    this.position={...treehouseInteriorAnchor};this.remaining=[];this.target=treehouseApproachAnchor;
    this.lift=0;this.entryTime=0;this.treehouseDepth=1;this.treehouseScale=.84;
    this.duration=this.treehouseStairsMs+this.treehouseInsideMs;
    this.state='exitingTreehouse';return true;
  }
  private beginTreehouseEntry(){
    this.remaining=[];this.lift=0;this.entryTime=0;this.treehouseEntryProgress=0;this.treehouseDepth=0;this.treehouseScale=1;
    this.alignment=[{...this.position},treehouseDoorAnchor,treehouseInteriorAnchor];
    this.duration=this.treehouseStairsMs+this.treehouseInsideMs;
    this.state='enteringTreehouse';
  }
  visitTreehouse(blocked:(p:Point)=>boolean,visualHeight=walkVisualHeight()){
    return this.move(treehouseApproachAnchor,blocked,false,visualHeight,false,false,true);
  }
  move(destination:Point,blocked:(p:Point)=>boolean,swing=false,visualHeight=walkVisualHeight(),moon=false,tea=false,treehouse=false,mailbox=false){
    // Entry owns the character until the future interior handoff/exit controller.
    if(this.traversingTreehouse||this.state==='insideTreehouse'||this.mailboxSequenceActive||(mailbox&&(this.state==='movingToMailbox'||this.state==='flyingToMailbox')))return false;
    const requested=mailbox?mailboxApproachAnchor:treehouse?treehouseApproachAnchor:tea?TEA_EXIT:moon?MOON_EXIT:swing?SWING_EXIT:destination;
    const start=this.atTea?TEA_EXIT:this.state==='sleepingOnMoonBed'?MOON_EXIT:this.state==='sittingOnSwing'?SWING_EXIT:this.position;
    const b=GARDEN_WORLD_BOUNDS;
    const inside=Number.isFinite(requested.x)&&Number.isFinite(requested.y)&&requested.x>=b.x&&requested.x<b.x+b.width&&requested.y>=b.y&&requested.y<b.y+b.height;
    // Ground validity applies before either travel mode. Flying crosses water
    // and flower beds, but never makes them eligible landing destinations.
    const valid=inside&&!blocked(requested);
    const distanceToTarget=distance(this.position,requested);
    const walkLimit=WALK_HEIGHT_MULTIPLIER*visualHeight;
    // Far travel already selects flight under the approved four-height rule.
    // Avoid a synchronous island-wide ground search that cannot change that
    // decision. Null diagnostics mean "not evaluated", never "unreachable".
    const pathEvaluated=valid&&!this.airborne&&distanceToTarget<=walkLimit+1e-7;
    const legacyPath=!swing&&!moon&&!tea&&!treehouse&&!mailbox&&pathEvaluated
      &&nearest(start,undefined,.001)&&nearest(requested,undefined,.001)?pathRoute(start,requested,blocked):null;
    const points=pathEvaluated?(legacyPath??groundRoute(start,requested,blocked)):null;
    const pathDistance=points?length(points):null;
    const sameLocalPathSection=!!points&&length(points)<=walkLimit+1e-7;
    // Reachable local travel always stays grounded. Beyond the user's explicit
    // four-height cutoff, select the aerial shortcut even on a connected graph.
    const fly=this.airborne||!points||distanceToTarget>walkLimit+1e-7;
    this.decision={target:requested,visualHeight,distanceToTarget,pathDistance,pathEvaluated,sameLocalPathSection,walkReachable:pathEvaluated?!!points:null,mode:valid?(fly?'FLY':'WALK'):'INVALID',reason:!inside?'Outside Garden':!valid?'Water or plantable flower area':this.airborne?'Complete airborne approach before landing':distanceToTarget>walkLimit?'Beyond four fairy heights':!points?'No connected ground route':sameLocalPathSection?'Local connected ground · WALK preferred':'Within four fairy heights'};
    if(!valid)return false;
    if((tea&&this.atTea)||(swing&&this.state==='sittingOnSwing')||(moon&&this.state==='sleepingOnMoonBed'))return true;
    const flight=fly?createAerialFlight(start,tea?TEA_APPROACH:moon?MOON_APPROACH:swing?SWING_FLIGHT_APPROACH:(points?.at(-1)??requested)):null;
    if(fly&&!flight)return false; // No unsafe straight-line fallback.
    this.estimatedWalkMs=points?length(points)/WALK_SPEED:Infinity;this.flightStartLift=this.lift;this.position={...start};this.mailboxTarget=mailbox;this.mailboxElapsedMs=0;this.swingTarget=swing;this.moonTarget=moon;this.teaTarget=tea;this.treehouseTarget=treehouse;this.treehouseEntryProgress=0;this.treehouseDepth=0;this.treehouseScale=1;this.seatedTime=0;
    this.target=points?.at(-1)??requested;this.flightTime=0;this.flightProgress=0;
    if(flight){this.flight=flight;this.remaining=[];this.duration=Math.max(MIN_FLIGHT_MS,length(flight)/FLIGHT_SPEED);this.state=mailbox?'flyingToMailbox':treehouse?'flyingToTreehouse':tea?'flyingToTea':moon?'flyingToMoonBed':swing?'flyingToSwing':'flying';}
    else {this.remaining=points!.slice(1);this.lift=0;this.state=this.remaining.length?(mailbox?'movingToMailbox':'walking'):'idle';if(!this.remaining.length&&(swing||moon||tea||treehouse||mailbox))this.align();else if(!this.remaining.length)this.target=null;}
    return true;
  }
  update(dtMs:number,blocked:(p:Point)=>boolean){return this.tick(dtMs*WALK_SPEED,blocked);}
  tick(amount:number,blocked:(p:Point)=>boolean){
    if(this.mailboxSequenceActive)return this.updateMailbox(amount/WALK_SPEED);
    if(this.traversingTreehouse){
      const exiting=this.state==='exitingTreehouse',old=this.position;
      this.entryTime=Math.min(this.duration,this.entryTime+amount/WALK_SPEED);
      // A single reversible traversal: ordinary stair speed, then short eased
      // inward steps. Occlusion uses physical depth, never sprite alpha.
      const inwardTime=exiting?this.duration-this.entryTime:this.entryTime;
      const stairT=Math.min(1,inwardTime/this.treehouseStairsMs);
      const depth=smooth(Math.max(0,Math.min(1,(inwardTime-this.treehouseStairsMs)/this.treehouseInsideMs)));
      this.treehouseDepth=depth;this.treehouseScale=1-.16*smooth(stairT);
      this.treehouseEntryProgress=inwardTime/this.duration;
      this.position=depth>0?sampleFlight([treehouseDoorAnchor,treehouseInteriorAnchor],depth)
        :sampleFlight([treehouseApproachAnchor,treehouseDoorAnchor],stairT);
      if(this.entryTime===this.duration){
        if(exiting){this.position={...treehouseApproachAnchor};this.treehouseDepth=0;this.treehouseScale=1;
          this.state='idle';this.treehouseTarget=false;this.treehouseExitCount++;}
        else {this.position={...treehouseInteriorAnchor};this.treehouseDepth=1;
          this.state='insideTreehouse';this.treehouseEntryCount++;}
        this.target=null;
      }
      return distance(old,this.position);
    }
    if(this.state==='seatedAtTea'){this.seatedTime+=amount/WALK_SPEED;if(this.seatedTime>=1200)this.state='drinkingTea';return 0;}
    if(this.airborne){
      const old=this.position;this.flightTime+=amount/WALK_SPEED;
      const t=Math.min(1,this.flightTime/this.duration);this.flightProgress=t;
      if(this.state==='aligningToTea'||this.state==='aligningToSwing'||this.state==='aligningToMoonBed'){
        this.position=sampleFlight(this.alignment,smooth(t));this.lift=7.2*(1-smooth(t));
        if(t===1){this.state=this.teaTarget?'seatedAtTea':this.moonTarget?'sleepingOnMoonBed':'sittingOnSwing';this.lift=0;}
      }else{
        this.position=sampleFlight(this.flight,smooth(t));
        const endLift=(this.swingTarget||this.moonTarget||this.teaTarget)?.3:0;
        this.lift=(this.flightStartLift+(24-this.flightStartLift)*smooth(Math.min(1,this.flightTime/300)))*(1-(1-endLift)*smooth(Math.max(0,(t-.65)/.35)))+1.5*Math.sin(this.flightTime/310)*Math.sin(Math.PI*t);
        if(t===1){if(this.swingTarget||this.moonTarget||this.teaTarget||this.treehouseTarget||this.mailboxTarget)this.align();else {this.state='idle';this.target=null;this.lift=0;}}
      }
      return distance(old,this.position);
    }
    if(!this.remaining.length)return 0;
    const next=advance(this.position,this.remaining,amount,blocked);
    this.position=next.point;this.remaining=next.remaining;
    if(!this.remaining.length){this.state='idle';if((this.swingTarget||this.moonTarget||this.teaTarget||this.treehouseTarget||this.mailboxTarget)&&this.target&&distance(this.position,this.target)<.05)this.align();else this.target=null;}
    return next.moved;
  }
  // Opening the Garden on her schedule: she is already there, so no travel. A letter sequence
  // in progress keeps the character. `at` is the path point for 'path'.
  place(rest:'tea'|'swing'|'moon'|'treehouse'|'mailbox'|'path',at:Point=WALK_START){
    if(this.mailboxSequenceActive)return false;
    this.remaining=[];this.target=null;this.flight=[];this.alignment=[];this.lift=0;this.flightTime=0;this.flightProgress=0;
    this.mailboxTarget=false;this.mailboxElapsedMs=0;this.swingTarget=false;this.moonTarget=false;this.teaTarget=false;
    this.treehouseTarget=false;this.treehouseEntryProgress=0;this.treehouseDepth=0;this.treehouseScale=1;this.entryTime=0;this.seatedTime=0;
    if(rest==='tea'){this.position={...TEA_SEAT};this.teaTarget=true;this.state='drinkingTea';}
    else if(rest==='swing'){this.position={...SWING_FLIGHT_SEAT};this.swingTarget=true;this.state='sittingOnSwing';}
    else if(rest==='moon'){this.position={...MOON_SLEEP_ANCHOR};this.moonTarget=true;this.state='sleepingOnMoonBed';}
    else if(rest==='treehouse'){this.position={...treehouseInteriorAnchor};this.treehouseTarget=true;this.treehouseEntryProgress=1;
      this.treehouseDepth=1;this.treehouseScale=.84;this.state='insideTreehouse';}
    else {this.position={...(rest==='mailbox'?mailboxApproachAnchor:at)};this.state='idle';}
    return true;
  }
  stop(){if(this.airborne||this.traversingTreehouse||this.state==='insideTreehouse'||this.mailboxSequenceActive)return;this.remaining=[];this.target=null;if(!this.atTea&&this.state!=='sittingOnSwing'&&this.state!=='sleepingOnMoonBed')this.state='idle';}
}
