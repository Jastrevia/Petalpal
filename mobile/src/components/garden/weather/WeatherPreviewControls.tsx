import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WEATHER_STATES, type GardenWeather } from './weatherPreview';

// Dev-only switcher for the weather preview (?weather=… on the Garden URL), so a change of weather
// can be watched as it happens. Not part of the product UI.
const LABELS: Record<string, string> = { CLEAR: '晴', CLOUDY: '多云', RAIN: '雨', STORM: '雷雨', SNOW: '雪', FOG: '雾' };

export default function WeatherPreviewControls({ weather, onChange }: { weather: GardenWeather; onChange: (next: GardenWeather) => void }) {
  return <View style={styles.bar} pointerEvents="box-none">
    {WEATHER_STATES.map(state => <Pressable key={state} accessibilityRole="button" accessibilityLabel={`weather ${state}`}
      onPress={() => onChange({ ...weather, state })} style={[styles.chip, weather.state === state && styles.on]}>
      <Text style={[styles.text, weather.state === state && styles.onText]}>{LABELS[state]}</Text>
    </Pressable>)}
    <Pressable accessibilityRole="button" accessibilityLabel="weather windy" onPress={() => onChange({ ...weather, windy: !weather.windy })}
      style={[styles.chip, weather.windy && styles.on]}>
      <Text style={[styles.text, weather.windy && styles.onText]}>大风</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 64, left: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6, zIndex: 40 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(250,247,240,0.86)', borderWidth: 1, borderColor: 'rgba(170,140,90,0.5)' },
  on: { backgroundColor: 'rgba(80,66,44,0.88)' },
  text: { fontSize: 13, color: '#4a3f2e' },
  onText: { color: '#fbf6ea' },
});
