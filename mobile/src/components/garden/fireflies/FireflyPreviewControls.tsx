import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useWorldTime } from '../world-time';
import {
  DEFAULT_FIREFLIES, FIREFLIES, fireflyDisplacement5s, type FireflySettings,
} from './fireflyMotion';

export default function FireflyPreviewControls({ settings, onChange }: {
  settings: FireflySettings; onChange: (settings: FireflySettings) => void;
}) {
  const world = useWorldTime();
  const [expanded, setExpanded] = useState(true);
  const [diagSec, setDiagSec] = useState(5);
  useEffect(() => {
    if (!__DEV__ || !settings.motionDiagnostic) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      setDiagSec(5 + ((Date.now() - t0) / 1000) * settings.speed);
    }, 500);
    return () => clearInterval(id);
  }, [settings.motionDiagnostic, settings.speed]);

  if (!__DEV__) return null;
  const button = (label: string, action: () => void) => <Pressable key={label}
    accessibilityRole="button" accessibilityLabel={label} onPress={action}
    style={{ padding: 8, borderRadius: 6, backgroundColor: '#314253' }}>
    <Text style={{ color: '#FFF3BD', fontSize: 12 }}>{label}</Text>
  </Pressable>;

  const activeFlies = FIREFLIES.slice(0, settings.count);
  const disps = settings.motionDiagnostic
    ? activeFlies.map(f => fireflyDisplacement5s(f, diagSec, 0.6)).sort((a, b) => a.distScreenPx - b.distScreenPx)
    : [];
  const median5s = disps.length ? disps[Math.floor(disps.length / 2)].distScreenPx : 0;
  const min5s = disps.length ? disps[0].distScreenPx : 0;
  const max5s = disps.length ? disps[disps.length - 1].distScreenPx : 0;

  return <View style={{ position: 'absolute', right: 12, top: 50, maxWidth: 320,
    padding: 10, gap: 6, backgroundColor: '#172333F2', borderRadius: 10, zIndex: 10001 }}>
    {button(expanded ? 'Hide Firefly Preview' : 'Firefly Preview', () => setExpanded(!expanded))}
    {expanded && <>
      <Text style={{ color: '#FFF3BD' }}>Development only · {world.phase}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {button(`Fireflies ${settings.enabled ? 'ON' : 'OFF'}`, () => onChange({ ...settings, enabled: !settings.enabled }))}
        {button(`Max Brightness ${settings.maxBrightness ? 'ON' : 'OFF'}`, () => onChange({ ...settings, maxBrightness: !settings.maxBrightness }))}
        {button(`Motion Diag ${settings.motionDiagnostic ? 'ON' : 'OFF'}`, () => onChange({
          ...settings,
          motionDiagnostic: !settings.motionDiagnostic,
          showTrails: !settings.motionDiagnostic ? true : settings.showTrails,
        }))}
        {settings.motionDiagnostic && button(`Trails ${settings.showTrails !== false ? 'ON' : 'OFF'}`, () => onChange({
          ...settings,
          showTrails: settings.showTrails === false,
        }))}
        {button('Day', () => world.setOverride('day'))}
        {button('Night', () => world.setOverride('night'))}
        {button('Auto', () => world.setOverride('auto'))}
      </View>
      {settings.motionDiagnostic && (
        <View style={{ padding: 6, borderRadius: 6, backgroundColor: '#0E1722', gap: 2 }}>
          <Text style={{ color: '#4ADE80', fontSize: 11 }}>
            5s Screen Displacement: median {median5s.toFixed(1)}px ({min5s.toFixed(1)}–{max5s.toFixed(1)}px)
          </Text>
          {[0, 8, 20, 34].filter(idx => idx < activeFlies.length).map(idx => {
            const d = fireflyDisplacement5s(activeFlies[idx], diagSec, 0.6);
            return <Text key={idx} style={{ color: '#CBD5E1', fontSize: 10 }}>
              #{idx} pos ({Math.round(d.toX)},{Math.round(d.toY)}) · Δ5s: {d.distScreenPx.toFixed(1)}px ({d.distWorld.toFixed(0)}wu)
            </Text>;
          })}
        </View>
      )}
      {([
        ['count', 1, FIREFLIES.length],
        ['brightness', .25, 2],
        ['coreSize', .2, 4],
        ['coreOpacity', .05, 1],
        ['haloRadius', .5, 12],
        ['haloOpacity', .05, 1],
        ['bloomRadius', 1, 20],
        ['bloomOpacity', .025, .3],
        ['speed', .25, 1.5],
      ] as const).map(([key, step, max]) => {
        const change = (delta: number) => onChange({
          ...settings,
          [key]: Number(Math.max(0, Math.min(max, settings[key] + delta)).toFixed(2)),
        });
        return <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {button(`Decrease ${key}`, () => change(-step))}
          <Text style={{ color: '#FFF3BD', minWidth: 35 }}>{settings[key]}</Text>
          {button(`Increase ${key}`, () => change(step))}
        </View>;
      })}
      {button('Reset firefly settings', () => onChange({ ...DEFAULT_FIREFLIES }))}
      <Link href="/" style={{ color: '#FFF3BD', padding: 8 }}>Open normal Garden</Link>
    </>}
  </View>;
}
