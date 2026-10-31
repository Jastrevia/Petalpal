import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { INITIAL_LANTERNS, LANTERN_STORAGE_KEY, parseLanternPlacements, validLanternPlacement, type LanternPlacement } from './lanternPlacement';

export function useLanternPlacements(editorEnabled = false) {
  const editing = __DEV__ && editorEnabled;
  const [placements, setPlacements] = useState(INITIAL_LANTERNS);
  const [ready, setReady] = useState(!editing);
  const [status, setStatus] = useState('Loading saved placements…');
  useEffect(() => {
    if (!editing) return;
    let alive = true;
    AsyncStorage.getItem(LANTERN_STORAGE_KEY).then(raw => {
      if (!alive) return;
      const saved = raw ? parseLanternPlacements(raw) : null;
      if (saved) setPlacements(saved);
      setStatus(raw && !saved ? 'Saved data invalid; using approved placements.' : saved ? 'Saved placements loaded.' : 'Approved placements — adjust and Save.');
    }).catch(() => { if (alive) setStatus('Storage unavailable. Changes cannot be restored.'); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [editing]);
  function update(next: LanternPlacement) {
    if (!editing || !ready) return;
    if (!validLanternPlacement(next)) {
      setStatus(next.kind === 'ground' ? 'Keep the complete base on land.' : 'Keep the complete lotus pad on water.');
      return;
    }
    setPlacements(current => current.map(p => p.id === next.id ? next : p));
    setStatus('Unsaved changes');
  }
  async function save() {
    if (!editing || !ready) return;
    try {
      await AsyncStorage.setItem(LANTERN_STORAGE_KEY, JSON.stringify(placements));
      setStatus('All 16 placements saved locally.');
    } catch { setStatus('Save failed. Your changes are still here; retry Save.'); }
  }
  return { placements: editing ? placements : INITIAL_LANTERNS, ready, status, update, save };
}
