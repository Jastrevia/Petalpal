// Preview-only weather for the Garden while the app does not read GET /api/weather yet.
// Dev web only: add ?weather=cloudy|rain|storm|snow|fog|clear (and optionally &windy=1) to the
// Garden URL; a small switcher then lets you change it live and watch the Garden ease between them.
// Release builds always get clear weather from this file.
export type GardenWeatherState = 'CLEAR' | 'CLOUDY' | 'RAIN' | 'SNOW' | 'FOG' | 'STORM';
export type GardenWeather = { state: GardenWeatherState; windy: boolean; preview?: boolean };

const CLEAR: GardenWeather = { state: 'CLEAR', windy: false };
export const WEATHER_STATES: GardenWeatherState[] = ['CLEAR', 'CLOUDY', 'RAIN', 'STORM', 'SNOW', 'FOG'];

export function readWeatherPreview(): GardenWeather {
  if (!__DEV__ || typeof window === 'undefined' || !window.location?.search) return CLEAR;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('weather')) return CLEAR;
  const state = (params.get('weather') || '').toUpperCase() as GardenWeatherState;
  return { state: WEATHER_STATES.includes(state) ? state : 'CLEAR', windy: params.get('windy') === '1', preview: true };
}
