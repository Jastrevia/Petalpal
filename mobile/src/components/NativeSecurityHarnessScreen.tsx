import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '../services/auth';
import { nativeSecurityEnabled } from '../services/nativeSecurity';
import { createDeviceNativeSecurityHarness } from '../services/nativeSecurityHarness/device';
import type { AttemptReport } from '../services/nativeSecurityHarness/attempts';
import type { Checkpoint } from '../services/nativeSecurityHarness/engine';

export default function NativeSecurityHarnessScreen() {
  const auth=useAuth(),currentAuth=useRef(auth);currentAuth.current=auth;
  const [current,setCurrent]=useState<AttemptReport|null>(null),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false);
  const [continuation,setContinuation]=useState<{active:boolean;journal:Checkpoint[]}|null>(null);
  const harness=useRef<ReturnType<typeof createDeviceNativeSecurityHarness>|null>(null);
  const mounted=useRef(true),started=useRef<string|null>(null);
  const refreshVersion=useRef(0);
  async function refresh(){
    const version=++refreshVersion.current;
    try{
      const value=await harness.current?.readCurrentAttempt();
      const remaining=value?.journal.at(-1)?.code==='PASS'?await harness.current?.readContinuation():null;
      if(mounted.current&&version===refreshVersion.current){setCurrent(value||null);setContinuation(remaining||null)}
      return value;
    }catch{
      if(mounted.current&&version===refreshVersion.current){setCurrent(null);setBlocked(true)}
      return null;
    }
  }
  async function run(){
    if(busy||!current||started.current===current.id||current.journal.at(-1)?.phase!=='ready')return;
    started.current=current.id;setBusy(true);setBlocked(false);
    try{await harness.current!.runCurrentScenarioOne()}
    catch{if(mounted.current)setBlocked(true)}
    finally{await refresh();if(mounted.current)setBusy(false)}
  }
  async function runRemaining(){
    setBusy(true);setBlocked(false);
    try{await harness.current!.runContinuation()}
    catch{if(mounted.current)setBlocked(true)}
    finally{await refresh();if(mounted.current)setBusy(false)}
  }
  useEffect(()=>{
    if(!__DEV__||!nativeSecurityEnabled)return;
    mounted.current=true;void SplashScreen.hideAsync().catch(()=>{});
    const target=globalThis as typeof globalThis & {__PETALPAL_NATIVE_SECURITY_ATTEMPT__?:unknown};
    const controls={
      inspect:()=>harness.current!.readCurrentAttempt(),
      inspectContinuation:()=>harness.current!.readContinuation(),
      continue:async()=>{await harness.current!.activateContinuation();void runRemaining();return {started:true,scope:'scenarios-2-7'}},
      prepare:async()=>{
        if(started.current||busy)throw Error('Existing execution state requires a fresh controller');
        refreshVersion.current++;setBlocked(false);setCurrent(null);
        try{
          const report=await harness.current!.prepareFreshScenarioOne();
          refreshVersion.current++;if(mounted.current)setCurrent(report);
          return {ready:report?.journal.at(-1)?.phase==='ready',scope:'scenario-1',attemptId:report?.id,generation:report?.generation,phases:report?.journal.map(c=>c.phase)};
        }catch{await refresh();if(mounted.current)setBlocked(true);throw Error('Attempt preparation blocked')}
      },
    };
    try{
      harness.current=createDeviceNativeSecurityHarness(()=>currentAuth.current,()=>{void refresh()});
      target.__PETALPAL_NATIVE_SECURITY_ATTEMPT__=controls;
      void refresh().then(async()=>{
        const saved=await harness.current!.readContinuation(),last=saved?.journal.at(-1);
        if(mounted.current&&saved?.active&&last&&last.code!=='FAIL'&&last.code!=='BLOCKED'&&!(last.scenario===7&&last.code==='PASS'))void runRemaining();
      }).catch(()=>{});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the security harness could not start: show it as blocked
    }catch{setCurrent(null);setBlocked(true)}
    // Only explicitly activated continuation resumes; Scenario 1 never reruns.
    return ()=>{mounted.current=false;if(target.__PETALPAL_NATIVE_SECURITY_ATTEMPT__===controls)delete target.__PETALPAL_NATIVE_SECURITY_ATTEMPT__};
  },[]);
  if(!__DEV__||!nativeSecurityEnabled)return null;
  const journal=continuation?.journal||current?.journal||[],last=journal.at(-1),ready=!continuation&&last?.phase==='ready';
  return <View testID="ns-screen" style={{flex:1,backgroundColor:'#eff4e9'}}><ScrollView contentContainerStyle={{padding:24,gap:14}}>
    <Text style={{fontSize:24,fontWeight:'600'}}>{continuation?'Native security continuation':'Scenario 1 verification'}</Text>
    <Text>{continuation?'Scenarios 2–7. Only designated disposable C may be deleted. A and B are preserved.':'Scenario 1 only. Scenarios 2–7 and account deletion are disabled.'}</Text>
    <Text>Earlier attempts are historical / superseded. Their evidence is retained separately.</Text>
    <Text>{current?`Current generation ${current.generation}: ${current.id}`:'No current attempt prepared.'}</Text>
    <Text testID="ns-final">{blocked?'BLOCKED — current attempt evidence is incomplete.':busy?'Running; keep this project open.':ready?'Prepared — not started.':last?`${last.code}: ${last.phase}`:'Waiting for preparation.'}</Text>
    {ready&&!blocked&&<Pressable testID="ns-scenario1-run" accessibilityRole="button" disabled={busy||started.current===current?.id} onPress={()=>{void run()}}
      style={{padding:16,backgroundColor:'#dcebdd',borderRadius:10}}><Text>Run this Scenario 1 attempt once</Text></Pressable>}
    {[2,3,4,5,6,7].map(n=><Text testID={`ns-scenario-${n}`} key={n}>{n}: {journal.filter(c=>c.scenario===n).at(-1)?.code||'NOT STARTED'}</Text>)}
    <Text>Current attempt checkpoints only:</Text>
    <Text testID="ns-source" selectable>{current?JSON.stringify(current):'null'}</Text>
    <Text testID="ns-journal" selectable>{JSON.stringify(journal)}</Text>
    <Text>{continuation?'After a planned reload or app exit, reopen 8108. Persisted evidence controls safe resume; FAIL/BLOCKED stops all later scenarios.':'No automatic retry.'} Startup cleanup cannot supply a missing logout witness.</Text>
  </ScrollView></View>;
}
