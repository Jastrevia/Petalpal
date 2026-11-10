import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { MONTH_LABELS, SIGN_ANCHOR, SIGN_SIZE, SIGN_STORAGE_KEY, parseSignPlacements, type SignPlacement } from './signPlacement';
import type { useMonthlySigns } from './useMonthlySigns';

type Camera={baseX:number;baseY:number;fit:number;cameraX:SharedValue<number>;cameraY:SharedValue<number>;cameraZoom:SharedValue<number>};
type State=ReturnType<typeof useMonthlySigns>;
type Props=Camera & State & {canEdit:boolean;onOpen:(month:number)=>void;focus:(x:number,y:number)=>void};
const button={padding:7,margin:2,borderRadius:6,backgroundColor:'#e3d5bc'};
function SignHandle({p,props,selected,select}:{p:SignPlacement;props:Props;selected:boolean;select:()=>void}) {
 const current=useRef({p,props,select});current.current={p,props,select};
 const start=useRef(p), moved=useRef(false);
 const [hovered,setHovered]=useState(false);
 const responder=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,
  onPanResponderGrant:()=>{start.current=current.current.p;moved.current=false;if(current.current.props.editing)current.current.select();},
  onPanResponderMove:(_,g)=>{if(Math.hypot(g.dx,g.dy)>5)moved.current=true;const c=current.current.props;
   if(c.editing){const s=c.fit*c.cameraZoom.value;if(s>0)c.update({...start.current,x:start.current.x+g.dx/s,y:start.current.y+g.dy/s});}},
  onPanResponderRelease:()=>{const c=current.current;if(!c.props.editing&&!moved.current)c.props.onOpen(c.p.month);},
  onPanResponderTerminationRequest:()=>false,
 }),[]);
 const style=useAnimatedStyle(()=>{
  const s=props.fit*props.cameraZoom.value,size=SIGN_SIZE*p.scale*s;
  return {left:props.baseX+props.cameraX.value+p.x*s-size*SIGN_ANCHOR.x-7,top:props.baseY+props.cameraY.value+p.y*s-size*SIGN_ANCHOR.y-7,
    width:size+14,height:size+14};
 },[props.baseX,props.baseY,props.fit,p.x,p.y,p.scale]);
 if (!props.editing) return <Animated.View pointerEvents="box-none" style={[{position:'absolute'},style]}>
  <Pressable accessibilityRole="button" accessibilityLabel={`Open Pavilion for ${MONTH_LABELS[p.month-1]}`} hitSlop={6}
    onHoverIn={()=>setHovered(true)} onHoverOut={()=>setHovered(false)}
    onPress={event=>{event.stopPropagation();props.onOpen(p.month);}}
    style={({pressed})=>({position:'absolute',left:'9%',top:'18%',width:'82%',height:'47%',borderRadius:18,
      backgroundColor:pressed||hovered?'#ffe1a733':'transparent',borderWidth:1,borderColor:pressed||hovered?'#ffe0a355':'transparent'})}/>
  <Pressable accessible={false} hitSlop={4} onPress={event=>{event.stopPropagation();props.onOpen(p.month);}}
    style={{position:'absolute',left:'43%',top:'65%',width:'22%',height:'23%'}}/>
 </Animated.View>;
 return <Animated.View {...responder.panHandlers} accessibilityRole="button" accessibilityLabel={`${props.editing?'Move':'Open Pavilion for'} ${MONTH_LABELS[p.month-1]}`}
   onAccessibilityTap={()=>props.editing?select():props.onOpen(p.month)}
   style={[{position:'absolute',borderWidth:props.editing?1:0,borderColor:selected?'#ffdc79':'#ffffff88',borderRadius:6,
    ...({touchAction:'none'} as object)},style]}>
   {props.editing && <View pointerEvents="none" style={{position:'absolute',left:`${SIGN_ANCHOR.x*100}%`,top:`${SIGN_ANCHOR.y*100}%`,width:8,height:5,marginLeft:-4+7*(1-2*SIGN_ANCHOR.x),marginTop:-2+7*(1-2*SIGN_ANCHOR.y),borderRadius:3,backgroundColor:selected?'#ffdc79':'#ffffffaa'}}/>}
  </Animated.View>;
}
function NumericField({label,value,onChange,disabled}:{label:string;value:number;onChange:(value:number)=>void;disabled:boolean}) {
 const [text,setText]=useState(String(value));
 // Remount by placement value so dragging and nudging update the displayed number.
 return <View style={{flexDirection:'row',alignItems:'center',gap:5}}><Text style={{color:'white',width:42}}>{label}</Text>
  <TextInput accessibilityLabel={`Sign ${label}`} value={text} editable={!disabled} keyboardType="decimal-pad"
    onChangeText={setText} onBlur={()=>{const n=Number(text);if(text.trim()&&Number.isFinite(n))onChange(n);setText(String(value));}}
    style={{backgroundColor:'#fff9ed',padding:5,width:85,borderRadius:4}}/>
  {[-1,1].map(d=><Pressable key={d} disabled={disabled} style={button} onPress={()=>onChange(value+d*(label==='Scale'?.01:1))}><Text>{d<0?'−':'+'}</Text></Pressable>)}
 </View>;
}
export default function MonthlySignControls(props:Props) {
 const [selected,setSelected]=useState(1);
 const [exportStatus,setExportStatus]=useState('');
 const [exportRaw,setExportRaw]=useState('');
 async function copySaved() {
  try {
   const raw=window.localStorage.getItem(SIGN_STORAGE_KEY);
   if (!raw || !parseSignPlacements(raw)) {setExportStatus('No complete saved sign placements found. Nothing changed.');return;}
   setExportRaw(raw);
   await navigator.clipboard.writeText(raw);
   setExportStatus('Copied exact saved placements for all 12 signs.');
  } catch {setExportStatus('Export unavailable. Nothing changed.');}
 }
 const p=props.placements.find(item=>item.month===selected)!;
 return <>
  <View pointerEvents="box-none" style={{position:'absolute',inset:0}}>
   {[...props.placements].sort((a,b)=>a.y-b.y).map(item=><SignHandle key={item.month} p={item} props={props} selected={selected===item.month} select={()=>setSelected(item.month)}/>)}
  </View>
  {props.canEdit&&<View style={{position:'absolute',right:10,top:70,width:285,padding:8,borderRadius:10,backgroundColor:'#253747f2',zIndex:10000}}>
   {!props.editing?<Pressable disabled={!props.ready} style={button} onPress={props.begin}><Text>Monthly Sign Placement Mode</Text></Pressable>:<>
    <Text style={{color:'#ffe5a6',fontWeight:'bold'}}>Monthly Sign Placement · {MONTH_LABELS[selected-1]}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap'}}>{MONTH_LABELS.map((label,i)=><Pressable key={label} style={[button,selected===i+1&&{backgroundColor:'#e9bfe8'}]}
      onPress={()=>{setSelected(i+1);const item=props.placements[i];props.focus(item.x,item.y-40);}}><Text>{label}</Text></Pressable>)}</View>
    <Text style={{color:'white',marginVertical:5}}>Drag a sign with mouse or touch. Place anywhere. X/Y mark the pole base.</Text>
    {(['x','y','scale'] as const).map(field=><NumericField key={`${selected}-${field}-${p[field]}`} label={field==='scale'?'Scale':field.toUpperCase()} value={p[field]}
      disabled={props.saving} onChange={n=>props.update({...p,[field]:n})}/>)}
    <View style={{flexDirection:'row',flexWrap:'wrap'}}>
     <Pressable style={button} disabled={props.saving} onPress={()=>void props.save()}><Text>{props.saving?'Saving…':'Save'}</Text></Pressable>
     <Pressable style={button} disabled={props.saving} onPress={props.cancel}><Text>Cancel</Text></Pressable>
     <Pressable style={button} disabled={props.saving} onPress={()=>props.reset(selected)}><Text>Reset Selected</Text></Pressable>
     <Pressable style={button} disabled={props.saving} onPress={()=>props.reset()}><Text>Reset All</Text></Pressable>
    </View>
   </>}
   {Platform.OS==='web' && <Pressable accessibilityRole="button" style={button} onPress={()=>void copySaved()}><Text>Copy Saved Sign Placements</Text></Pressable>}
   {!!exportRaw && <TextInput accessibilityLabel="Saved Monthly Sign Placement JSON" multiline editable={false} value={exportRaw} style={{backgroundColor:"#fff9ed",maxHeight:90,padding:5}}/>}
   {!!exportStatus && <Text accessibilityLiveRegion="polite" style={{color:'#fff3d0'}}>{exportStatus}</Text>}
   <Text accessibilityLiveRegion="polite" style={{color:'#fff3d0',marginTop:5}}>{props.status}</Text>
  </View>}
 </>;
}
