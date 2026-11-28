import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { usePanelTheme } from './PanelTheme';
import { useAuth } from '../../services/auth';
import { loadWeather, saveWeatherLocation, WEATHER_CREDIT } from '../../services/gardenWeather';
import { useAppLocale } from '../../services/locale';
import { FEATURE_COLORS as colors, FeatureActionButton, FeatureSection, ui } from './FeatureUI';

// Me → Garden weather (docs/items/WEATHER.md): off until the owner turns it on. Turning it on asks
// for location permission (approximate is enough), reads one rough position (expo-location's
// lowest accuracy, about 3 km) and sends it once; the server keeps only a ~11 km grid point.
// Turning it off makes the server forget it. The Garden then rains, snows or clears with the sky
// where they are, and the dogs go home to their house in rain, storms and snow.
const COPY = {
  en: { title: 'Garden weather', label: 'Show the weather where I am', loading: 'Saving Garden weather',
    hint: 'Uses your approximate location once. Only a rounded area (about 11 km) is kept; friends who visit see the weather, never the place.',
    denied: 'Location is off for PetalPal. Turn it on in Settings to show your weather.', openSettings: 'Open Settings',
    failed: 'Garden weather was not saved. Please try again.', reload: 'Reload Garden weather' },
  'zh-Hans': { title: '花园天气', label: '显示我所在地的天气', loading: '正在保存花园天气',
    hint: '只读取一次大致位置，只保留约 11 公里范围的粗略区域；朋友来逛只看到天气，看不到你在哪里。',
    denied: 'PetalPal 的定位权限已关闭，请在系统设置里打开，才能显示你那里的天气。', openSettings: '打开设置',
    failed: '花园天气没有保存成功，请再试一次。', reload: '重新加载花园天气' },
};

export function GardenWeatherSettings() {
  const { theme } = usePanelTheme();
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const copy = COPY[useAppLocale()];
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  // Whether it is on, read when Me opens (and again after Reload).
  const [reloads, setReloads] = useState(0);
  const failed = copy.failed;
  useEffect(() => {
    if (!ownerId) return;
    let current = true;
    loadWeather()
      .then(answer => { if (current) { setError(''); setEnabled(answer?.enabled === true); } })
      .catch(() => { if (current) { setEnabled(null); setError(failed); } });
    return () => { current = false; };
  }, [ownerId, reloads, failed]);

  const change = async (on: boolean) => {
    if (busy) return;
    setBusy(true); setError(''); setDenied(false);
    try {
      if (!on) { const answer = await saveWeatherLocation(null); if (live.current) setEnabled(answer.enabled); return; }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { if (live.current) setDenied(true); return; }
      const position = await Location.getLastKnownPositionAsync({ maxAge: 60 * 60 * 1000 })
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
      // Rounded here too, so not even the request carries more than a rough place.
      const round = (value: number) => Math.round(value * 10) / 10;
      const answer = await saveWeatherLocation({ lat: round(position.coords.latitude), lon: round(position.coords.longitude) });
      if (live.current) setEnabled(answer.enabled);
    } catch {
      if (live.current) setError(copy.failed);
    } finally {
      if (live.current) setBusy(false);
    }
  };

  return <FeatureSection title={copy.title}>
    <View style={ui.row}>
      <Text style={[ui.text, { flex: 1, color: theme.text }]}>{copy.label}</Text>
      <Switch testID="garden-weather-toggle" accessibilityLabel={copy.label} value={enabled === true}
        disabled={!ownerId || enabled === null || busy} onValueChange={value => void change(value)}
        trackColor={{ true: colors.primary }} />
    </View>
    <Text style={[ui.caption, { color: theme.muted }]}>{copy.hint}</Text>
    {enabled ? <Text style={[ui.caption, { color: theme.muted }]}>{WEATHER_CREDIT}</Text> : null}
    {busy ? <ActivityIndicator accessibilityLabel={copy.loading} color={colors.primary} /> : null}
    {denied ? <><Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{copy.denied}</Text>
      <FeatureActionButton secondary title={copy.openSettings} onPress={() => void Linking.openSettings()} /></> : null}
    {error ? <><Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{error}</Text>
      <FeatureActionButton secondary title={copy.reload} disabled={busy} onPress={() => setReloads(n => n + 1)} /></> : null}
  </FeatureSection>;
}
