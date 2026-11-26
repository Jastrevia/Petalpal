import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PANEL_THEMES = {
  dark: { background: '#103431', surface: '#173C39', input: '#234D4B', text: '#FFF4DC', muted: '#BED2CA', border: '#52716A', gold: '#C6A164', frame: '#244E45', inset: '#315B52' },
  light: { background: '#FAF5E8', surface: '#FFF9EC', input: '#EBEFE7', text: '#163F45', muted: '#657A6E', border: '#A1BCB2', gold: '#CBB17C', frame: '#528F83', inset: '#FFFEF7' },
};
export type PanelTheme = typeof PANEL_THEMES.dark;
export const panelThemeStorageKey = (userId: string) => `petalpal_feature_panel_background_v1:${encodeURIComponent(userId)}`;
const fallback = { theme: PANEL_THEMES.dark, light: false, loading: true, error: '', setLight: async (_value: boolean) => {} };
const PanelThemeContext = createContext(fallback);

// Account-scoped device preference; never changes the Garden or server settings.
export function PanelThemeProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [light, setValue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const writing = useRef(false);
  // Signed out there is nothing to load.
  if (!userId && loading) setLoading(false);
  useEffect(() => {
    let active = true;
    if (!userId) return;
    AsyncStorage.getItem(panelThemeStorageKey(userId)).then(value => {
      if (active) setValue(value === 'light');
    }).catch(() => { if (active) setError('Unable to load background preference.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);
  const setLight = async (value: boolean) => {
    if (!userId || loading || writing.current) return;
    writing.current = true;
    setLoading(true); setError('');
    const previous = light;
    setValue(value);
    try { await AsyncStorage.setItem(panelThemeStorageKey(userId), value ? 'light' : 'dark'); }
    catch { setValue(previous); setError('Unable to save background preference. Please try again.'); }
    finally { writing.current = false; setLoading(false); }
  };
  return <PanelThemeContext.Provider value={{ theme: light ? PANEL_THEMES.light : PANEL_THEMES.dark, light, loading, error, setLight }}>{children}</PanelThemeContext.Provider>;
}
export function usePanelTheme() { return useContext(PanelThemeContext) ?? fallback; }
