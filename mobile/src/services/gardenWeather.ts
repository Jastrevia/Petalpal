import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from './api';
import { WEATHER_STATES, type GardenWeather, type GardenWeatherState } from '../components/garden/weather/weatherPreview';

// The Garden's live weather (docs/items/WEATHER.md, lib/weather.js): the owner's own from
// GET /api/weather, a friend's (on a visit) from GET /users/:id/weather, never their place. Off until
// the owner turns it on (Me → Garden weather, which sends an approximate position once); off, not
// configured on the server, or no answer: clear.
export type WeatherAnswer = { enabled: boolean; state: GardenWeatherState; windy: boolean; source?: string; attribution: string | null };
export const WEATHER_CREDIT = 'Weather data: MET Norway (CC BY 4.0)';

function clean(answer: Partial<WeatherAnswer> | null | undefined): WeatherAnswer {
  const state = WEATHER_STATES.includes(answer?.state as GardenWeatherState) ? answer!.state! : 'CLEAR';
  return { enabled: answer?.enabled === true, state, windy: answer?.windy === true, source: answer?.source, attribution: answer?.attribution ?? null };
}

export async function loadWeather(friendId?: string): Promise<WeatherAnswer | null> {
  try { return clean(await apiRequest<WeatherAnswer>(friendId ? `/users/${encodeURIComponent(friendId)}/weather` : '/api/weather')); }
  catch (error) {
    // A server from before weather (404), signed out (401) or not a friend (403): clear, quietly.
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return null;
    throw error;
  }
}

/** Turns the owner's Garden weather on (an approximate position) or off (`null`, the server forgets it). */
export async function saveWeatherLocation(location: { lat: number; lon: number } | null) {
  const answer = clean(await apiRequest<WeatherAnswer>('/api/weather/location', 'PUT', { location }));
  listeners.forEach(listener => listener());
  return answer;
}
const listeners = new Set<() => void>();
function onWeatherChanged(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

// MET's forecasts change every 10 minutes to 2 hours; the server caches them per place.
export const WEATHER_REFRESH_MS = 15 * 60 * 1000;

/** The Garden's weather while it is open (`active`), or null before the first answer or with none. */
export function useLiveWeather(active: boolean, { signedIn, friendId }: { signedIn: boolean; friendId?: string }): GardenWeather | null {
  const [weather, setWeather] = useState<GardenWeather | null>(null);
  const [changes, setChanges] = useState(0);
  useEffect(() => onWeatherChanged(() => setChanges(n => n + 1)), []);
  useEffect(() => {
    if (!active || !signedIn) return;
    let live = true;
    const check = () => {
      loadWeather(friendId)
        .then(answer => { if (live) setWeather(answer && answer.enabled ? { state: answer.state, windy: answer.windy } : { state: 'CLEAR', windy: false }); })
        .catch(() => undefined); // offline: keep what we knew
    };
    check();
    const timer = setInterval(check, WEATHER_REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [active, signedIn, friendId, changes]);
  return signedIn ? weather : null;
}

/** Weather in which the dogs go home to their house: rain, a storm or snow falling. */
export const dogsShelterIn = (state: GardenWeatherState) => state === 'RAIN' || state === 'STORM' || state === 'SNOW';
