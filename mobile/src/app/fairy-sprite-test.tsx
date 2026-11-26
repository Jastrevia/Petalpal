import {Redirect, Stack} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {useEffect, useRef, useState} from 'react';
import {Animated, AppState, Image, Pressable, ScrollView, Text, View} from 'react-native';

const frames = [
  require('../../assets/dev/fairy-approved-walk-8/frame_01.png'),
  require('../../assets/dev/fairy-approved-walk-8/frame_02.png'),
  require('../../assets/dev/fairy-approved-walk-8/frame_03.png'),
  require('../../assets/dev/fairy-approved-walk-8/frame_04.png'),
  require('../../assets/dev/fairy-approved-walk-8/frame_05.png'),
  require('../../assets/dev/fairy-approved-walk-8/frame_06.png'),
  require('../../assets/dev/fairy-approved-walk-8/frame_07.png'),
  require('../../assets/dev/fairy-approved-walk-8/frame_08.png'),
];
function Test() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [travelSpeed, setTravelSpeed] = useState(60);
  const [dark, setDark] = useState(false);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState(true);
  const x = useState(() => new Animated.Value(0))[0];
  const distance = useRef(0);
  const phase = useRef(0);
  useEffect(() => {
    void SplashScreen.hideAsync();
    const sub = AppState.addEventListener('change', s => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!playing || !active) return;
    let request = 0, last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const dt = Math.min(now-last, 100);
        phase.current += dt*speed;
        setIndex(Math.floor(phase.current/100)%8);
        distance.current += dt/1000*travelSpeed;
        if (distance.current > width) distance.current = -181;
        x.setValue(distance.current);
      }
      last = now; request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, active, speed, travelSpeed, width, x]);
  const step = (delta: number) => {
    setPlaying(false); const next = (index+delta+8)%8;
    phase.current = next*100; setIndex(next);
  };
  const button = (label: string, onPress: () => void) => <Pressable key={label} onPress={onPress} style={{padding:10,backgroundColor:'#e4d5ed',borderRadius:8,margin:4}}><Text>{label}</Text></Pressable>;
  return <ScrollView contentContainerStyle={{padding:20,gap:12}}>
    <Text style={{fontSize:22}}>Approved eight-pose sprite test</Text>
    <Text>Frame {index+1}/8 · {100/speed} ms/frame · travel {travelSpeed} px/s</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap'}}>
      {button(playing?'Pause':'Play',()=>setPlaying(!playing))}
      {/* eslint-disable-next-line react-hooks/refs -- dev test page: step() touches the phase ref only when pressed */}
      {button('Previous',()=>step(-1))}{button('Next',()=>step(1))}
      {[.5,1,2].map(s=>button(`Animation ${s}×`,()=>setSpeed(s)))}
      {[0,30,60,120].map(s=>button(`Travel ${s} px/s`,()=>setTravelSpeed(s)))}
      {button('Light / dark',()=>setDark(!dark))}
    </View>
    <View style={{backgroundColor:dark?'#263340':'#eeeae5',height:241}}>
      <Image source={frames[index]} fadeDuration={0} style={{width:181,height:241}}/>
    </View>
    <Text>Horizontal travel — animation speed and travel speed are independent.</Text>
    <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{height:241,overflow:'hidden',backgroundColor:dark?'#263340':'#eeeae5',borderBottomWidth:1,borderColor:'#999'}}>
      <Animated.View style={{transform:[{translateX:x}]}}><Image source={frames[index]} fadeDuration={0} style={{width:181,height:241}}/></Animated.View>
    </View>
    <Text>Fixed source-grid extraction. No new poses or interpolation. Review the 8→1 seam and source-art changes manually. Travel does not automatically imply ground locking.</Text>
  </ScrollView>;
}
export default function FairySpriteTestRoute() {
  if (!__DEV__) return <Redirect href="/"/>;
  return <><Stack.Screen options={{title:'Fairy sprite test'}}/><Test/></>;
}
