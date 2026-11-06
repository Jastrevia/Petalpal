import {Canvas,Group,Rect,useImage} from '@shopify/react-native-skia';
import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,ScrollView,Text,View} from 'react-native';
import {useDerivedValue,useSharedValue} from 'react-native-reanimated';
import SwingEntity,{FAIRY_SEAT_ANCHOR_X,FAIRY_SEAT_ANCHOR_Y,SWING_WIDTH,SWING_HEIGHT} from '../garden/SwingEntity';
import {SWING_MAP_X,SWING_MAP_Y,SWING_MAP_SCALE,SWING_MAP_ROTATION} from '../garden/swingMapPlacement';
import {FairyController} from './FairyController';
import {FairyPoseSprite} from './FairyPoseSprite';
import {FAIRY_POSE_SCALE,FAIRY_POSE_FRAMES} from './fairyPoseMetadata';
import {createSwingTarget} from './fairySwingInteraction';

const target=createSwingTarget({x:FAIRY_SEAT_ANCHOR_X,y:FAIRY_SEAT_ANCHOR_Y},SWING_WIDTH,SWING_HEIGHT);
const start={x:target.approach.x-90,y:target.approach.y+20};
const center={x:SWING_MAP_X+SWING_WIDTH*SWING_MAP_SCALE/2,y:SWING_MAP_Y+SWING_HEIGHT*SWING_MAP_SCALE/2};

export default function FairySwingTestScene() {
  const [controller,setController]=useState(()=>new FairyController(start));
  const [snapshot,setSnapshot]=useState(()=>controller.snapshot());
  const [width,setWidth]=useState(640);
  const [paused,setPaused]=useState(false);
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const [ready,setReady]=useState(false);
  const phaseRef=useRef('');
  const image=useImage(require('@/assets/garden/fairy/swing-pose-v2/poses.webp'));
  const poseIndex=useSharedValue(0),poseNext=useSharedValue(0),poseMix=useSharedValue(0);

  const worldX=useSharedValue(start.x),worldY=useSharedValue(start.y);
  const transform=useDerivedValue(()=>[{translateX:worldX.value},{translateY:worldY.value},
    {rotate:SWING_MAP_ROTATION*Math.PI/180},{scale:FAIRY_POSE_SCALE}]);
  const fit=Math.min(width/620,1.5);
  useEffect(()=>{const sub=AppState.addEventListener('change',s=>setForeground(s==='active'));return()=>sub.remove();},[]);
  useEffect(()=>{
    if(paused||!foreground||snapshot.state==='idle')return;
    let frame=0,last=0,debug=0,alive=true;
    const tick=(now:number)=>{
      if(!alive)return;
      controller.tick(last?Math.min(now-last,50):0);last=now;
      const value=controller.snapshot();worldX.value=value.drawX;worldY.value=value.drawY;
      poseIndex.value=value.poseIndex;poseNext.value=value.nextPoseIndex;poseMix.value=value.poseMix;
      const key=`${value.state}/${value.phase}/${value.attached}`;
      // React receives transitions and a throttled debug snapshot, never frame progression.
      if(key!==phaseRef.current||now-debug>=150){phaseRef.current=key;debug=now;setSnapshot(value);}
      if(value.state!=='idle')frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>{alive=false;cancelAnimationFrame(frame);};
  },[controller,paused,foreground,snapshot.state,worldX,worldY,poseIndex,poseNext,poseMix]);
  const occupied=snapshot.attached;
  const startInteraction=()=>{if(controller.request(target))setSnapshot(controller.snapshot());};
  const restartReview=()=>{
    const fresh=new FairyController(start);setController(fresh);setSnapshot(fresh.snapshot());
    worldX.value=start.x;worldY.value=start.y;poseIndex.value=0;poseNext.value=0;poseMix.value=0;
    phaseRef.current='';setPaused(false);
  };
  return <ScrollView contentContainerStyle={{padding:16,gap:12}}>
    <Text style={{fontSize:22,fontWeight:'600'}}>Fairy × Swing — first interaction</Text>
    <Text>New authored walk poses and dedicated back-facing Swing poses. Candidate artwork and contact timing await visual approval; the rejected standing-cutout walk is no longer used.</Text>
    <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={{height:470*fit}}>
      <Canvas style={{width:'100%',height:'100%'}}>
        <Rect x={0} y={0} width={width} height={470*fit} color="#e3e9df"/>
        <Group transform={[{scale:fit},{translateX:-550},{translateY:-870}]}>
          <Group origin={center} transform={[{rotate:SWING_MAP_ROTATION*Math.PI/180}]}>
            <SwingEntity x={SWING_MAP_X} y={SWING_MAP_Y} scale={SWING_MAP_SCALE}
              occupied={occupied} animationEnabled={!paused&&foreground&&snapshot.phase==='swinging_back'}
              onDebugStatus={status=>setReady(!status.includes('loading')&&!status.includes('ERROR'))}
              fairy={<Group transform={[{translateX:FAIRY_SEAT_ANCHOR_X},{translateY:FAIRY_SEAT_ANCHOR_Y},
                {scale:FAIRY_POSE_SCALE/SWING_MAP_SCALE}]}>
                <>{image&&<FairyPoseSprite image={image} index={poseIndex} next={poseNext} mix={poseMix} anchor="hips"/>}</>
              </Group>}/>
          </Group>
          {!occupied&&<Group transform={transform}><>{image&&<FairyPoseSprite image={image} index={poseIndex} next={poseNext} mix={poseMix} anchor="root"/>}</></Group>}
        </Group>
      </Canvas>
    </View>
    <View style={{flexDirection:'row',gap:12}}>
      <Pressable accessibilityRole="button" disabled={!ready||!image||snapshot.state!=='idle'} onPress={startInteraction} style={{padding:12,backgroundColor:'#c5c1dd'}}>
        <Text>{snapshot.state==='idle'?'Visit Swing':'Interaction in progress'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={()=>setPaused(p=>!p)} style={{padding:12,backgroundColor:'#ccdcd9'}}><Text>{paused?'Resume':'Pause'}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={restartReview} style={{padding:12,backgroundColor:'#e1d8c5'}}><Text>Reset full review</Text></Pressable>
    </View>
    <Text selectable>{`State: ${snapshot.state}\nPhase: ${snapshot.phase}\nWorld root / attachment: ${snapshot.x.toFixed(2)}, ${snapshot.y.toFixed(2)}\nFacing: ${snapshot.facing} (authored pose: ${FAIRY_POSE_FRAMES[snapshot.poseIndex].id})\nAnimation: ${snapshot.animationState}\nTarget: ${snapshot.activeTarget?.id??'none'}\nLandmark: ${snapshot.currentLandmark??'none'}\nSeat attached: ${occupied}\nRegistered canvas: 512 × 640\nStanding height: approximately 108 world px\nSwing assets: ${ready?'ready':'loading'}`}</Text>
    <Text>Flow: idle_front_3q → walk_cycle → approach_swing → turn_back → sit_back → swinging_back → settle → stand_back → turn_front → idle_front_3q. The back-facing Fairy shares the seat’s movement and occlusion. Pause/background stops travel; the Swing eases to rest.</Text>
  </ScrollView>;
}
