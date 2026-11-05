// Otter-only navigation. All coordinates are Garden world units, before the camera.
import ground from '../fairy/gardenGroundMask.json';
import type { Point } from '../fairy/walkNetwork';

export const OTTER_SPEED = 42;
export const OTTER_BODY_RADIUS = 80; // encloses every non-black pixel of all 62 frames at the existing pivot
const PORT = 16;
const NODE_CLEARANCE = OTTER_BODY_RADIUS + 16;
const STEP = 40;

// Existing deck footprints, not imaginary tunnels or shoreline overrides.
// Only the water-spanning decks are admitted; the entrance causeway stays solid.
export const OTTER_BRIDGES = [
  [[1556,568],[1603,547],[1669,520],[1765,507],[1790,552],[1795,571],[1724,580],[1655,610],[1594,637]],
  [[1602,1420],[1649,1374],[1708,1329],[1773,1297],[1798,1287],[1841,1329],[1782,1369],[1725,1416],[1660,1475]],
  [[1508,836],[1851,985],[1818,1076],[1480,929]],
] as const;

function underDeck(x: number, y: number) {
  return OTTER_BRIDGES.some(points => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [a,b] = points[i], [c,d] = points[j];
      if ((b > y) !== (d > y) && x < (c-a)*(y-b)/(d-b)+a) inside = !inside;
    }
    return inside;
  });
}

export function swimmableWater({x,y}: Point) {
  if (x < 0 || x >= ground.width || y < ground.y || y >= ground.y + ground.height) return false;
  // The scenic opening is excluded from WALKING collision, but contains painted
  // cliffs/rocks. It cannot be promoted wholesale to an otter swimming surface.
  if (y < 220) return false;
  const row = ground.rows[Math.floor((y-ground.y)/ground.cellSize)], column = Math.floor(x/ground.cellSize);
  for (let i=0; i<row.length; i+=2) {
    if (column < row[i]) break;
    if (column < row[i+1]) return underDeck(x,y);
  }
  return true;
}

/** Conservative filled-disc clearance, including small rocks INSIDE the footprint.
 * Intersect exact 2-unit terrain runs, rather than checking only the center/perimeter. */
export function isOpenWater(p: Point, radius = OTTER_BODY_RADIUS) {
  const cell = ground.cellSize;
  if (p.x-radius < 0 || p.x+radius >= ground.width || p.y-radius < 220 ||
      p.y+radius >= ground.y+ground.height) return false;
  for (let y=Math.floor((p.y-radius-ground.y)/cell); y<=Math.floor((p.y+radius-ground.y)/cell); y++) {
    // Include every terrain cell touched by the disc, with a cell-sized safety margin.
    const worldY = ground.y+y*cell+cell/2;
    const dy = Math.max(0, Math.abs(worldY-p.y)-cell);
    if (dy > radius) continue;
    const extent = Math.sqrt(radius*radius-dy*dy)+cell;
    const left = p.x-extent, right = p.x+extent, row = ground.rows[y];
    for (let i=0; i<row.length; i+=2) {
      const lo=Math.max(left,row[i]*cell), hi=Math.min(right,row[i+1]*cell);
      if (lo >= hi) continue;
      for (let x=lo; x<=hi; x+=cell) if (!underDeck(x,worldY)) return false;
    }
  }
  return true;
}


/** Whole-frame oriented rectangle for straight passages. Narrow channels need
 * not be wide enough to rotate in; junctions retain their larger turning disc. */
export function bodyFits(p:Point,heading:number) {
  const c=Math.cos(heading),s=Math.sin(heading);
  const corners=[[-76,-50],[76,-50],[76,50],[-76,50]].map(([x,y])=>({x:p.x+c*x-s*y,y:p.y+s*x+c*y}));
  const minX=Math.min(...corners.map(q=>q.x)),maxX=Math.max(...corners.map(q=>q.x));
  const minY=Math.min(...corners.map(q=>q.y)),maxY=Math.max(...corners.map(q=>q.y));
  if(minX<2 || maxX>=ground.width-2 || minY<222 || maxY>=ground.y+ground.height-2) return false;
  for(let rowIndex=Math.floor((minY-ground.y)/2);rowIndex<=Math.floor((maxY-ground.y)/2);rowIndex++) {
    const y=ground.y+rowIndex*2+1, intersections:number[]=[];
    for(let i=0;i<4;i++) {
      const a=corners[i],b=corners[(i+1)%4];
      if((a.y>y)!==(b.y>y)) intersections.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
    }
    if(intersections.length<2) continue;
    const left=Math.min(...intersections)-3,right=Math.max(...intersections)+3,row=ground.rows[rowIndex];
    for(let i=0;i<row.length;i+=2) {
      const lo=Math.max(left,row[i]*2),hi=Math.min(right,row[i+1]*2);
      if(lo>=hi) continue;
      for(let x=lo;x<=hi;x+=2) if(!underDeck(x,y)) return false;
    }
  }
  return true;
}
export function safeSwimSegment(a:Point,b:Point) {
  const heading=Math.atan2(b.y-a.y,b.x-a.x),steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/3);
  for(let i=0;i<=steps;i++) if(!bodyFits({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps},heading)) return false;
  return true;
}

export type SwimNode = Point & { links: number[] };
export type SwimNetwork = { nodes: SwimNode[]; bounds: {minX:number; minY:number; maxX:number; maxY:number} };
let cachedNetwork: SwimNetwork | undefined;

/** Build once, never per frame. Retain the largest body-clear, turnable component.
 * Neighbor corridors are also checked; land-separated bays never become graph edges. */
export function buildSwimNetwork(): SwimNetwork {
  const nodes: SwimNode[] = [], grid = new Map<string,number>();
  for (let y=240; y<ground.y+ground.height-NODE_CLEARANCE; y+=STEP)
    for (let x=140; x<ground.width-NODE_CLEARANCE; x+=STEP)
      if (isOpenWater({x,y}, NODE_CLEARANCE)) { grid.set(`${x},${y}`,nodes.length); nodes.push({x,y,links:[]}); }
  nodes.forEach((p,index) => {
    for (const [dx,dy] of [[STEP,0],[0,STEP],[STEP,STEP],[-STEP,STEP]]) {
      const other = grid.get(`${p.x+dx},${p.y+dy}`);
      if (other === undefined) continue;
      const q=nodes[other], steps=Math.ceil(Math.hypot(dx,dy)/4);
      let clear=true;
      for (let s=0;s<=steps && clear;s++) clear=isOpenWater({x:p.x+(q.x-p.x)*s/steps,y:p.y+(q.y-p.y)*s/steps});
      if (clear) { p.links.push(other); q.links.push(index); }
    }
  });

  // Join turnable pockets across lengthwise-swimmable necks and real bridge
  // openings. A failed connection remains a separate region, never a tunnel.
  const parent=nodes.map((_,i)=>i);
  const root=(i:number):number=>{while(parent[i]!==i)i=parent[i];return i;};
  nodes.forEach((p,i)=>p.links.forEach(j=>{parent[root(i)]=root(j);}));
  const candidates:{a:number;b:number;distance:number}[]=[];
  nodes.forEach((p,a)=>nodes.forEach((q,b)=>{
    if(b<=a || root(a)===root(b)) return;
    const distance=Math.hypot(q.x-p.x,q.y-p.y);
    if(distance<=420) candidates.push({a,b,distance});
  }));
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const {a,b} of candidates) {
    if(root(a)===root(b) || !safeSwimSegment(nodes[a],nodes[b])) continue;
    nodes[a].links.push(b);nodes[b].links.push(a);parent[root(a)]=root(b);
  }

  const seen = new Set<number>(); let largest:number[]=[];
  for (let i=0;i<nodes.length;i++) {
    if (seen.has(i)) continue;
    const component=[i]; seen.add(i);
    for (let n=0;n<component.length;n++) for (const next of nodes[component[n]].links)
      if (!seen.has(next)) { seen.add(next); component.push(next); }
    if (component.length>largest.length) largest=component;
  }
  if (largest.length<2) throw new Error('Otter swimming network has no safe connected route');
  const remap=new Map(largest.map((id,index)=>[id,index]));
  const connected=largest.map(id=>({...nodes[id],links:nodes[id].links.map(next=>remap.get(next)!)}));
  return {nodes:connected,bounds:{minX:Math.min(...connected.map(p=>p.x)),maxX:Math.max(...connected.map(p=>p.x)),
    minY:Math.min(...connected.map(p=>p.y)),maxY:Math.max(...connected.map(p=>p.y))}};
}
export function getSwimNetwork() { return cachedNetwork ??= buildSwimNetwork(); }

export type SwimSample = Point & { heading: number; distance: number };
export type SwimLeg = { samples: SwimSample[]; length: number; speed: number };
export type Swim = { from:number; to:number; next:number; turning:boolean; along:number;
  leg:SwimLeg; speed:number; heading:number; x:number; y:number; seed:number; visits:number[] };

function unit(a:Point,b:Point) {
  'worklet';
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  return {x:(b.x-a.x)/length,y:(b.y-a.y)/length};
}
function port(p:Point,d:Point,amount:number) {
  'worklet';
  return {x:p.x+d.x*amount,y:p.y+d.y*amount};
}
function sampleCurve(a:Point,b:Point,c:Point,d:Point):Point[] {
  'worklet';
  const points:Point[]=[];
  for (let i=0;i<=48;i++) {
    const t=i/48,u=1-t;
    points.push({x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
      y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y});
  }
  return points;
}
function leg(points:Point[],speed:number):SwimLeg {
  'worklet';
  let distance=0;
  const samples=points.map((p,i)=>{
    if(i) distance+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    return {...p,distance,heading:Math.atan2(b.y-a.y,b.x-a.x)};
  });
  let rotation=0;
  for(let i=1;i<samples.length;i++) rotation+=Math.abs(Math.atan2(Math.sin(samples[i].heading-samples[i-1].heading),Math.cos(samples[i].heading-samples[i-1].heading)));
  // Give the painted animal time to yaw through a bend, rather than racing round it.
  return {samples,length:distance,speed:rotation>.01?Math.min(speed,distance/(rotation/.8+.2)):speed};
}
export function straightLeg(network:SwimNetwork,from:number,to:number) {
  'worklet';
  const a=network.nodes[from],b=network.nodes[to],d=unit(a,b);
  return leg([port(a,d,PORT),port(b,d,-PORT)],OTTER_SPEED);
}
export function turningLeg(network:SwimNetwork,from:number,to:number,next:number,side=1) {
  'worklet';
  const a=network.nodes[from],b=network.nodes[to],c=network.nodes[next];
  const incoming=unit(a,b),outgoing=unit(b,c),start=port(b,incoming,-PORT),end=port(b,outgoing,PORT);
  if(next===from) {
    // A moving teardrop, not a pivot/flip: same entrance and exit position,
    // opposite tangent. Every point is within 16 units of the clear junction.
    const middle={x:b.x-incoming.y*8*side,y:b.y+incoming.x*8*side};
    const first=sampleCurve(start,b,port(middle,incoming,8),middle);
    const second=sampleCurve(middle,port(middle,incoming,-8),b,end);
    return leg([...first,...second.slice(1)],OTTER_SPEED*.55);
  }
  const dot=incoming.x*outgoing.x+incoming.y*outgoing.y;
  return leg(sampleCurve(start,port(b,incoming,-9),port(b,outgoing,9),end),
    OTTER_SPEED*(.65+.35*(dot+1)/2));
}
export function createSwim(network:SwimNetwork,seed=1):Swim {
  const from=Math.floor(network.nodes.length/2),to=network.nodes[from].links[0],route=straightLeg(network,from,to);
  return {from,to,next:to,turning:false,along:0,leg:route,speed:OTTER_SPEED*.6,heading:route.samples[0].heading,
    x:route.samples[0].x,y:route.samples[0].y,seed,visits:network.nodes.map(()=>0)};
}

export function swimPose(route:SwimLeg,along:number,previousHeading:number) {
  'worklet';
  const samples=route.samples;
  let lo=0,hi=samples.length-1;
  while(lo+1<hi) {const mid=(lo+hi)>>>1;if(samples[mid].distance<along)lo=mid;else hi=mid;}
  const a=samples[lo],b=samples[hi],t=Math.max(0,Math.min(1,(along-a.distance)/(b.distance-a.distance||1)));
  const heading=a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*t;
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
    heading:previousHeading+Math.atan2(Math.sin(heading-previousHeading),Math.cos(heading-previousHeading))};
}

/** Clock-driven UI-thread state; no timers, React renders, route-end fades or position resets. */
export function advanceSwim(network:SwimNetwork,previous:Swim,seconds:number):Swim {
  'worklet';
  const state={...previous};
  let remaining=Math.max(0,seconds);
  while(remaining>0) {
    // Ease down BEFORE a bend, then accelerate gently after leaving it.
    const edgeFactor=state.turning?1:Math.min(1,.8+.2*(state.leg.length-state.along)/12);
    const targetSpeed=state.leg.speed*edgeFactor;
    const speed=state.speed+(targetSpeed-state.speed)*(1-Math.exp(-Math.min(remaining,.1)/.35));
    state.speed=speed;
    const step=Math.min(remaining,(state.leg.length-state.along)/speed);
    state.along=Math.min(state.leg.length,state.along+step*speed);remaining-=step;
    const pose=swimPose(state.leg,state.along,state.heading);
    state.x=pose.x;state.y=pose.y;
    // Unwrap across +/-pi and limit yaw: the side-painted sprite never snaps or flips.
    const yaw=pose.heading-state.heading, limit=step*.95;
    state.heading+=Math.max(-limit,Math.min(limit,yaw));
    if(state.along<state.leg.length-1e-8) break;
    if(state.turning) {
      state.from=state.to;state.to=state.next;state.turning=false;
      state.leg=straightLeg(network,state.from,state.to);
    } else {
      const choices=network.nodes[state.to].links.filter(id=>id!==state.from);
      const incoming=unit(network.nodes[state.from],network.nodes[state.to]);
      const forward=choices.filter(id=>{const d=unit(network.nodes[state.to],network.nodes[id]);return incoming.x*d.x+incoming.y*d.y>=0;});
      const candidates=forward.length?forward:choices.length?choices:[state.from];
      const visits=[...state.visits];visits[state.to]++;state.visits=visits;
      let best=-1,next=candidates[0];
      for(const id of candidates) {
        state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0;
        const d=unit(network.nodes[state.to],network.nodes[id]);
        const persistence=1+3*Math.max(0,incoming.x*d.x+incoming.y*d.y);
        const score=(.2+state.seed/4294967296)*persistence/((1+visits[id])**1.5);
        if(score>best){best=score;next=id;}
      }
      state.next=next;state.turning=true;
      state.leg=turningLeg(network,state.from,state.to,next,state.seed%2?1:-1);
    }
    state.along=0;
  }
  return state;
}
