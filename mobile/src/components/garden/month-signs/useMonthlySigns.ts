import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { INITIAL_SIGNS, SIGN_STORAGE_KEY, parseSignPlacements, validSignPlacement, type SignPlacement } from './signPlacement';

export function useMonthlySigns(editorEnabled = false) {
  const editable=__DEV__ && editorEnabled;
  const [placements,setPlacements]=useState(INITIAL_SIGNS);
  const saved=useRef(INITIAL_SIGNS);
  const [ready,setReady]=useState(!editable), [editing,setEditing]=useState(false), [saving,setSaving]=useState(false);
  const [status,setStatus]=useState(editable?'Loading monthly signs…':'Approved placements locked.');
  useEffect(()=>{
    if (!editable) return;
    let alive=true;
    AsyncStorage.getItem(SIGN_STORAGE_KEY).then(raw=>{
      if(!alive)return;
      const parsed=raw?parseSignPlacements(raw):null;
      saved.current=parsed??INITIAL_SIGNS;setPlacements(saved.current);
      setStatus(raw&&!parsed?'Saved sign data invalid; using defaults.':'Placements ready.');
    }).catch(()=>{if(alive)setStatus('Storage unavailable. Save may fail.');})
      .finally(()=>{if(alive)setReady(true);});
    return ()=>{alive=false;};
  },[editable]);
  function update(p:SignPlacement) {
    if(!editable||!editing||saving||!ready)return;
    if(!validSignPlacement(p)){setStatus('Enter finite numeric X, Y and scale values.');return;}
    setPlacements(current=>current.map(item=>item.month===p.month?p:item));setStatus('Unsaved changes');
  }
  async function save() {
    if(!editable||!editing||saving||!ready)return;
    setSaving(true);
    try { await AsyncStorage.setItem(SIGN_STORAGE_KEY,JSON.stringify(placements));saved.current=placements;setEditing(false);setStatus('All 12 signs saved locally.'); }
    catch {setStatus('Save failed. Changes retained; try again.');} finally {setSaving(false);}
  }
  function cancel(){if(!editable||saving)return;setPlacements(saved.current);setEditing(false);setStatus('Changes cancelled.');}
  function reset(month?:number){if(!editable||!editing||saving)return;setPlacements(current=>month?current.map(p=>p.month===month?INITIAL_SIGNS[month-1]:p):INITIAL_SIGNS);setStatus('Defaults restored. Save to keep them.');}
  return {placements:editable?placements:INITIAL_SIGNS,ready,editing:editable&&editing,saving,status,update,save,cancel,reset,begin:()=>{if(editable&&ready&&!saving)setEditing(true);}};
}
