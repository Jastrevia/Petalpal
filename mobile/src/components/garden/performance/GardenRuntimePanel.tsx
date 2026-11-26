import {Profiler,useEffect,useRef,useState,type ReactNode} from 'react';
import {AppState,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useFrameCallback,useSharedValue} from 'react-native-reanimated';
import {DEFAULT_ISOLATION,MAX_AUDIT_SAMPLES,runtimeAudit,frameSummary,type GardenIsolation} from './runtimeAudit';

export function GardenProfile({name,enabled=true,children}:{name:string;enabled?:boolean;children:ReactNode}) {
  if(!enabled)return null;
  return __DEV__?<Profiler id={name} onRender={(id,_phase,ms)=>runtimeAudit.commit(id,ms)}>{children}</Profiler>:children;
}
export function GardenRuntimePanel({flags,onFlags,count,onCount,canChangeFixture,metadata}:{
  flags:GardenIsolation;onFlags:(flags:GardenIsolation)=>void;count:number|null;onCount:(count:number|null)=>void;
  canChangeFixture:boolean;metadata:Record<string,unknown>;
}) {
  const [open,setOpen]=useState(false),[recording,setRecording]=useState(false),[result,setResult]=useState('');
  const stopRef=useRef<()=>void>(()=>{}),[budget,setBudget]=useState(1000/60);
  const [configuration,setConfiguration]=useState('Custom / existing defaults');
  const [cadence,setCadence]=useState<{current:number|null;average:number|null;p95:number|null}>({current:null,average:null,p95:null});
  const uiSamples=useSharedValue<number[]>([]);
  const frame=useFrameCallback(info=>{
    const dt=info.timeSincePreviousFrame;
    if(dt!==null)uiSamples.modify(values=>{if(values.length<MAX_AUDIT_SAMPLES)values.push(dt);return values;});
  },false);
  useEffect(()=>{frame.setActive(recording&&Platform.OS!=='web');return()=>frame.setActive(false);},[recording,frame]);
  useEffect(()=>{
    if(!recording)return;
    let previous:number|null=null,handle=0;const recent:number[]=[];
    const tick=(timestamp:number)=>{if(previous!==null){const dt=timestamp-previous;runtimeAudit.frame(dt);recent.push(dt);if(recent.length>240)recent.shift();}previous=timestamp;handle=requestAnimationFrame(tick);};
    handle=requestAnimationFrame(tick);
    // Supported browsers expose JS long tasks; no guessed GPU timings.
    let observer:PerformanceObserver|undefined;
    if(Platform.OS==='web'&&typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){
      observer=new PerformanceObserver(list=>list.getEntries().forEach(e=>runtimeAudit.longTask(e.duration)));observer.observe({entryTypes:['longtask']});
    }
    const display=setInterval(()=>{const summary=frameSummary(recent,budget);setCadence({current:recent.length?1000/recent[recent.length-1]:null,average:summary.averageCallbackFps,p95:summary.p95Ms});},1000);
    const timer=setTimeout(()=>stopRef.current(),30_000);
    const sub=AppState.addEventListener('change',state=>{if(state!=='active')stopRef.current();});
    const visibility=()=>{if(document.hidden)stopRef.current();};
    if(Platform.OS==='web')document.addEventListener('visibilitychange',visibility);
    return()=>{cancelAnimationFrame(handle);clearInterval(display);clearTimeout(timer);observer?.disconnect();sub.remove();
      if(Platform.OS==='web')document.removeEventListener('visibilitychange',visibility);};
  },[recording]);
  useEffect(()=>()=>{if(runtimeAudit.active)runtimeAudit.stop();},[]);
  const stop=()=>{const data=runtimeAudit.stop(Platform.OS==='web'?[]:uiSamples.value,budget);
    // eslint-disable-next-line react-hooks/refs -- dev panel: the latest stop() for the recording timer
    setResult(JSON.stringify(data,null,2));setRecording(false);};stopRef.current=stop;
  const button=(label:string,fn:()=>void,disabled=false)=><Pressable key={label} disabled={disabled} onPress={fn} style={styles.button}><Text>{label}</Text></Pressable>;
  if(!__DEV__)return null;
  return <View style={styles.panel}>
    {button(open?'Close Runtime Audit':'Runtime Audit',()=>setOpen(!open))}
    {open&&<ScrollView style={{maxHeight:420}}>
      <Text>Configuration: {configuration}</Text>
      <Text>JS callback cadence (not presented FPS): current {cadence.current?.toFixed(1)??'—'}; recent average {cadence.average?.toFixed(1)??'—'}; p95 {cadence.p95?.toFixed(1)??'—'} ms. Updates while recording.</Text>
      <View style={styles.row}>{[
        ['FULL',{}],['NO FLOWERS',{Flowers:false}],['NO WATER',{Water:false}],
        ['NO WATERFALL',{Waterfall:false}],['NO FISH/LOTUS',{Fish:false,Lotus:false}],
        ['NO LANDMARK ANIMATION',{LandmarkAnimation:false}],
        ['STATIC MAP ONLY',{Water:false,Waterfall:false,Fish:false,Lotus:false,Flowers:false,LandmarkAnimation:false,WaterAnimation:false}],
      ].map(([label,overrides])=>button(String(label),()=>{
        setConfiguration(String(label));onFlags({...DEFAULT_ISOLATION,DebugUI:false,...overrides as object});onCount(30);
      },recording||!canChangeFixture))}</View>
      <Text>Local profiling only. Defaults unchanged. Fixtures are read-only; use Real records for detail/Adjust.</Text>
      <View style={styles.row}>{[
        ['A Empty',{}],['B Land + landmarks',{Land:true,Landmarks:true,Environment:true,LandmarkAnimation:true}],
        ['C Water',{Land:true,Water:true,WaterAnimation:true}],
        ['D Waterfall',{Land:true,Waterfall:true,WaterAnimation:true}],
        ['E Fish + lotus',{Land:true,Water:true,Fish:true,Lotus:true,WaterAnimation:true}],
      ].map(([label,enabled])=>button(String(label),()=>{
        onFlags({...Object.fromEntries(Object.keys(DEFAULT_ISOLATION).map(key=>[key,false])),...enabled as object} as GardenIsolation);onCount(0);
      },recording||!canChangeFixture))}</View>
      <View style={styles.row}>{[null,0,1,10,20,30].map(n=>button(n===null?'Real records':`${n} parents${count===n?' ✓':''}`,()=>onCount(n),recording||!canChangeFixture))}</View>
      <View style={styles.row}>{Object.keys(flags).map(key=>button(`${key}: ${flags[key as keyof GardenIsolation]?'ON':'OFF'}`,()=>onFlags({...flags,[key]:!flags[key as keyof GardenIsolation]}),recording))}</View>
      {button('Restore visual defaults',()=>{onFlags({...DEFAULT_ISOLATION});onCount(null);},recording||!canChangeFixture)}
      <View style={styles.row}>{button('60Hz budget',()=>setBudget(1000/60),recording)}{button('120Hz budget',()=>setBudget(1000/120),recording)}</View>
      {button(recording?'Stop + show report':'Record 30 seconds',()=>{
        if(recording){stop();return;}uiSamples.set([]);runtimeAudit.start({...metadata,flags:{...flags},fixtureCount:count,platform:Platform.OS,configuration,budgetMs:budget});setRecording(true);
      })}
      <Text selectable>{result||'Warm assets first. Record idle, pan/zoom, detail and Adjust separately. No per-frame React state updates in this recorder.'}</Text>
    </ScrollView>}
  </View>;
}
const styles=StyleSheet.create({panel:{position:'absolute',bottom:8,right:8,width:310,backgroundColor:'#ffffffe8',padding:6,zIndex:100},
  button:{padding:12,minHeight:44,margin:2,backgroundColor:'#e7eef4',borderRadius:4},row:{flexDirection:'row',flexWrap:'wrap'}});
