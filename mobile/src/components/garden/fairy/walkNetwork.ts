/** Centerlines traced on the unchanged authored garden at world 2400×1800.
 * Authoring coordinates below are from the 1400×1000 runtime review:
 * world origin (76,64), scale .52. Never infer walkability from non-grass alone.
 * Short chords follow paving; no smoothing or corner-cutting at runtime.
 */
export type Point = { x: number; y: number };
export type Edge = { a: number; b: number; width: number };
export type Network = { nodes: Point[]; edges: Edge[] };
const lines: number[][][] = [
  // Central perimeter, with shared junction vertices.
  [[700,575],[770,565],[820,530],[855,475],[867,420],[854,362],[825,308],[775,272],[716,260],[650,267],[590,290],[550,329],[527,383],[520,433],[530,490],[565,534],[622,564],[700,575]],
  // Western junction and paths around the three planting lawns.
  [[520,433],[490,432],[465,433],[446,412],[400,379],[348,354],[304,307],[249,290],[214,292],[190,302],[175,345],[158,396],[157,427],[162,438],[185,451],[247,434],[318,422],[386,426],[433,444],[450,461],[480,465],[520,433]],
  [[185,451],[160,469],[146,504],[145,550],[153,596],[176,628],[210,672],[267,702],[330,719],[389,709],[428,680],[453,654]],
  [[450,461],[430,485],[388,510],[340,544],[300,579],[261,600],[207,619],[176,628]],
  // Treehouse approach, ending at the existing stair foot.
  [[446,412],[419,388],[400,379]],
  [[419,388],[422,369],[438,351],[445,330]],
  // Upper land loop and its internal dividing path.
  [[825,308],[853,302],[889,307],[913,296],[921,279],[918,251],[921,229],[942,207],[956,182],[962,152],[960,126],[948,104],[917,88],[877,74],[830,70],[783,81],[740,104],[707,130],[688,163],[687,189],[701,215],[733,233],[775,247],[809,261],[825,308]],
  [[917,88],[903,113],[883,144],[849,162],[822,182],[820,207],[836,238],[834,262],[825,308]],
  // B02 bridge and tea courtyard perimeter.
  [[854,362],[892,365],[923,350],[958,340],[999,339],[1027,334],[1066,350],[1110,347],[1155,322],[1177,305]],
  [[1027,334],[1034,312],[1045,298]],
  // ST01 crossing to Land08 and its paved loop.
  [[820,530],[851,533],[901,556],[956,581],[1006,605],[1033,625],[1057,650],[1070,678],[1050,709],[1035,742],[1036,778],[1052,808],[1087,832],[1139,842],[1189,834],[1227,812],[1250,785],[1257,752],[1249,718],[1230,690],[1198,671],[1160,650],[1127,641],[1094,651],[1070,678]],
  // Land09 and the entrance branch. B01 closes the lower circulation loop.
  [[700,575],[680,608],[648,653],[628,703],[619,751],[627,800],[650,835],[688,854],[728,850],[759,831],[769,809],[760,787],[780,784],[810,804],[821,835],[865,867],[910,891],[913,940],[916,980]],
  // B01's integrated deck sits northwest of the old review trace. Keep its
  // entrance/Land08 junctions, but register the intervening foot points on wood.
  [[910,891],[914,851],[923,814],[952,790],[982,768],[1015,744],[1035,742]],
  // Land07 paved perimeter; six stepping stones connect its southern landing.
  [[1200,516],[1177,516],[1138,506],[1098,492],[1062,474],[1037,452],[1024,432],[1020,412],[1030,403],[1052,401],[1090,407],[1130,409],[1176,403],[1204,385],[1217,357],[1223,338],[1235,330],[1254,339],[1274,365],[1291,391],[1304,419],[1309,446],[1299,473],[1277,492],[1247,508],[1200,516]],
  [[1200,516],[1206,544],[1197,559],[1187,576],[1173,595],[1162,617],[1160,650]],
  // Narrow internal paths divide central lawns; the pavilion itself stays excluded.
  [[550,329],[574,348],[603,365],[628,388],[635,416],[644,444],[666,464],[686,478],[696,513],[700,550],[700,575]],
  [[825,308],[807,334],[782,354],[754,373],[748,402],[747,433],[735,456],[713,472],[686,478]],
  [[635,416],[644,449],[667,469],[692,475],[718,468],[739,449],[747,433]],
];
const nodes: Point[] = [], edges: Edge[] = [];
const ids = new Map<string, number>();
for (const [lineIndex, line] of lines.entries()) {
  let last: number | undefined;
  for (const [vertex, [sx, sy]] of line.entries()) {
    const key = `${sx},${sy}`;
    let id = ids.get(key);
    if (id === undefined) { id = nodes.length; ids.set(key, id); nodes.push({x:(sx-76)/.52,y:(sy-64)/.52}); }
    // Measured on the rendered 1280×720 web map: ordinary paving taps
    // 18–23 world units from the trace were silently rejected at width 8.
    // Bridges have wider wooden decks; internal paths and stones stay narrow.
    // Only destination selection uses these margins. Feet follow exact chords.
    // Registered deck widths are roughly 96 (ST01) and 64 (B01) world
    // units across. Select inside those decks, rather than reaching water.
    const deckWidth = lineIndex === 10 && vertex <= 5 ? 48
      : lineIndex === 12 && vertex >= 2 && vertex <= 5 ? 32 : 24;
    const width = lineIndex === 14 ? 8 : lineIndex >= 15 ? 12 : deckWidth;
    if (last !== undefined) edges.push({a:last,b:id,width});
    last = id;
  }
}
export const WALK_NETWORK: Network = { nodes, edges };
export const WALK_START = nodes[0];
export const distance = (a: Point,b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
export const interpolate = (a: Point,b: Point,t: number): Point => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export function project(p: Point,a: Point,b: Point) {
  const d=(b.x-a.x)**2+(b.y-a.y)**2;
  const t=d?Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/d)):0;
  const point=interpolate(a,b,t);return {point,t,distance:distance(p,point)};
}
// Optional dynamic veto (e.g. a closed bridge). Walkability comes ONLY from the graph.
export function safeSegment(a: Point,b: Point,blocked: (p:Point)=>boolean) {
  const n=Math.max(1,Math.ceil(distance(a,b)/2));
  for(let i=0;i<=n;i++)if(blocked(interpolate(a,b,i/n)))return false;
  return true;
}
export function nearest(p: Point,network=WALK_NETWORK,tolerance=Infinity) {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
  let best: (ReturnType<typeof project>&{edge:number})|null=null;
  for(let edge=0;edge<network.edges.length;edge++){const e=network.edges[edge];const hit=project(p,network.nodes[e.a],network.nodes[e.b]);
    if(hit.distance<=Math.min(tolerance,e.width)&&(!best||hit.distance<best.distance))best={...hit,edge};}
  return best;
}
export function route(start:Point,target:Point,blocked:(p:Point)=>boolean=()=>false,network=WALK_NETWORK): Point[]|null {
  if(blocked(target))return null;
  const from=nearest(start,network,.05),to=nearest(target,network);
  if(!from||!to||blocked(to.point))return null;
  const pts=[...network.nodes,from.point,to.point],s=pts.length-2,t=pts.length-1;
  const adjacency: {id:number;cost:number}[][]=pts.map(()=>[]);
  const link=(a:number,b:number)=>{if(!safeSegment(pts[a],pts[b],blocked))return;
    const cost=distance(pts[a],pts[b]);adjacency[a].push({id:b,cost});adjacency[b].push({id:a,cost});};
  network.edges.forEach(e=>link(e.a,e.b));
  const f=network.edges[from.edge],v=network.edges[to.edge];
  link(s,f.a);link(s,f.b);link(t,v.a);link(t,v.b);
  if(from.edge===to.edge)link(s,t);
  const dist=pts.map(()=>Infinity),prev=pts.map(()=>-1),todo=new Set(pts.map((_,i)=>i));dist[s]=0;
  while(todo.size){let u=-1;for(const id of todo)if(u<0||dist[id]<dist[u])u=id;
    if(u<0||!Number.isFinite(dist[u]))break;if(u===t)break;todo.delete(u);
    for(const {id,cost} of adjacency[u])if(dist[u]+cost<dist[id]){dist[id]=dist[u]+cost;prev[id]=u;}}
  if(!Number.isFinite(dist[t]))return null;
  const result:Point[]=[];for(let u=t;u!==-1;u=prev[u])result.unshift(pts[u]);
  return result.filter((p,i)=>!i||distance(p,result[i-1])>.001);
}
export function advance(position:Point,remaining:Point[],amount:number,blocked:(p:Point)=>boolean=()=>false) {
  let point=position;const rest=[...remaining];let moved=0;
  while(rest.length&&amount>0){const d=distance(point,rest[0]);
    const next=d<=amount?rest[0]:interpolate(point,rest[0],amount/d);
    if(!safeSegment(point,next,blocked))return {point,remaining:[],moved};
    moved+=distance(point,next);point=next;if(d<=amount){amount-=d;rest.shift();}else break;
  }
  return {point,remaining:rest,moved};
}
// Walking: one painted stride (walk-video-v1/walk.webp: 25 frames over 2.08 s, cut from a
// walking clip made from walk_04); standing still: walk_04 itself (WALK_IDLE).
export const WALK_LOOP_MS=50/24*1000, WALK_FRAMES=25, WALK_IDLE=-1;
export function walkFrame(elapsed:number,moving:boolean){if(!moving)return WALK_IDLE;
  return Math.floor((elapsed%WALK_LOOP_MS)/WALK_LOOP_MS*WALK_FRAMES)%WALK_FRAMES;}
