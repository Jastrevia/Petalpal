import { useEffect, useRef, useState } from 'react';
import {
  makeMutable, runOnJS, useAnimatedReaction, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { GardenWeather, GardenWeatherState } from './weatherPreview';

// One description of the Garden's weather that every layer reads, so a change of weather is the
// same painting re-lit and moving differently, never a sheet laid over it. Each value is 0..1:
// overcast  how much sun the sky lets through (soft, cool, flatter light)
// wet       wet paint, stone and leaves (deeper values)
// snow      snow lying on the painting and its cold, bright light
// fog       mist hanging in the air (lifted, low-contrast values)
// clouds    cloud shadows drifting over the ground (by day)
// wind      how hard the air moves plants, leaves, water, rain, snow and clouds
// rain      falling rain;  flakes  falling snow;  storm  lightning
export type WeatherLook = {
  overcast: number; wet: number; snow: number; fog: number; clouds: number;
  wind: number; rain: number; flakes: number; storm: number;
};
const KEYS: (keyof WeatherLook)[] = ['overcast', 'wet', 'snow', 'fog', 'clouds', 'wind', 'rain', 'flakes', 'storm'];

export const LOOKS: Record<GardenWeatherState, WeatherLook> = {
  CLEAR: { overcast: 0, wet: 0, snow: 0, fog: 0, clouds: 0, wind: 0.12, rain: 0, flakes: 0, storm: 0 },
  CLOUDY: { overcast: 0.5, wet: 0, snow: 0, fog: 0, clouds: 0.62, wind: 0.3, rain: 0, flakes: 0, storm: 0 },
  RAIN: { overcast: 1, wet: 1, snow: 0, fog: 0.22, clouds: 0.95, wind: 0.32, rain: 0.71, flakes: 0, storm: 0 },
  STORM: { overcast: 1, wet: 1, snow: 0, fog: 0.18, clouds: 1, wind: 0.9, rain: 1, flakes: 0, storm: 1 },
  SNOW: { overcast: 0.55, wet: 0, snow: 1, fog: 0.06, clouds: 0.5, wind: 0.22, rain: 0, flakes: 1, storm: 0 },
  FOG: { overcast: 0.45, wet: 0.3, snow: 0, fog: 1, clouds: 0, wind: 0.06, rain: 0, flakes: 0, storm: 0 },
};

export function lookFor(weather: GardenWeather): WeatherLook {
  const look = { ...LOOKS[weather.state] };
  if (weather.windy) look.wind = Math.max(look.wind, 0.85);
  return look;
}

/** Wind strength (0 calm, 1 gale) for Garden entities that sway, read without passing props down. */
export const gardenWind = makeMutable(LOOKS.CLEAR.wind);

/** Above this wind the planted flowers bend (below it they stay cached as a still picture). */
export const FLOWER_WIND = 0.25;

/** Seconds on the weather clock, for entities that move with the wind (it runs while the weather moves). */
export const gardenWeatherSeconds = makeMutable(0);

/** True while the wind is strong enough to bend the planted flowers (they are cached still otherwise). */
export function useWindBendsFlowers() {
  const [bends, setBends] = useState(() => gardenWind.value > FLOWER_WIND);
  useAnimatedReaction(() => gardenWind.value > FLOWER_WIND, (now, before) => {
    if (now !== before) runOnJS(setBends)(now);
  });
  return bends;
}
/** The wind's heading over the Garden (world units): from the upper left toward the lower right. */
export const WIND_DIR = { x: 0.97, y: 0.24 };

/**
 * Gusts sweeping across the Garden in bands, 0..1. The same bands drive rain curtains, rings on the
 * water, flowers bending and leaves lifting, so one gust visibly crosses everything together.
 */
export function windGust(x: number, y: number, t: number) {
  'worklet';
  const along = x * WIND_DIR.x + y * WIND_DIR.y;
  const v = 0.5 + 0.34 * Math.sin(along * 0.0024 - t * 0.9) + 0.18 * Math.sin((y * 0.8 - x * 0.35) * 0.005 + t * 0.53);
  return Math.min(1, Math.max(0, v));
}

const TRANSITION_MS = 3200;

function blend(a: WeatherLook, b: WeatherLook, t: number): WeatherLook {
  'worklet';
  return {
    overcast: a.overcast + (b.overcast - a.overcast) * t, wet: a.wet + (b.wet - a.wet) * t,
    snow: a.snow + (b.snow - a.snow) * t, fog: a.fog + (b.fog - a.fog) * t, clouds: a.clouds + (b.clouds - a.clouds) * t,
    wind: a.wind + (b.wind - a.wind) * t, rain: a.rain + (b.rain - a.rain) * t, flakes: a.flakes + (b.flakes - a.flakes) * t,
    storm: a.storm + (b.storm - a.storm) * t,
  };
}

/**
 * The weather as it eases from one state to the next over a few seconds (rain thins, cloud shadows
 * fade, snow settles), plus which parts need drawing at all: during a change, both the old and the
 * new state's layers stay until the old one has faded.
 */
export function useWeatherLook(weather: GardenWeather) {
  const reduced = useReducedMotion();
  const target = lookFor(weather);
  const from = useSharedValue(target), to = useSharedValue(target), t = useSharedValue(1);
  const look = useDerivedValue(() => blend(from.value, to.value, t.value));
  const [shown, setShown] = useState(target);
  const first = useRef(true);
  const key = `${weather.state}:${weather.windy}`;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const next = lookFor(weather);
    from.set(look.value);
    to.set(next);
    t.set(0);
    t.set(withTiming(1, { duration: reduced ? 0 : TRANSITION_MS }));
    setShown(previous => {
      const both = { ...next };
      KEYS.forEach(k => { both[k] = Math.max(previous[k], next[k]); });
      return both;
    });
    const settle = setTimeout(() => setShown(next), reduced ? 0 : TRANSITION_MS + 100);
    return () => clearTimeout(settle);
    // `key` carries the weather; the shared values are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
  useAnimatedReaction(() => look.value.wind, wind => { gardenWind.value = wind; });
  useEffect(() => () => { gardenWind.value = LOOKS.CLEAR.wind; }, []);
  return { look, shown };
}

/**
 * Seconds and the wind's accumulated travel (world units) for clouds, mist, snow and leaves. The
 * travel is integrated frame by frame so a change in wind speeds things up without a jump.
 */
export function useWeatherClock(active: boolean, look: SharedValue<WeatherLook>) {
  const reduced = useReducedMotion();
  const seconds = useSharedValue(0);
  const travel = useSharedValue(0);
  const frame = useFrameCallback(info => {
    const dt = Math.min(0.064, Math.max(0, (info.timeSincePreviousFrame ?? 16.667) / 1000));
    seconds.value += dt;
    gardenWeatherSeconds.value = seconds.value;
    // Calm air still moves the sky a little; a gale drives it hard.
    travel.value += dt * (9 + 95 * look.value.wind * look.value.wind);
  }, false);
  useEffect(() => {
    frame.setActive(active && !reduced);
    return () => frame.setActive(false);
  }, [frame, active, reduced]);
  return { seconds, travel };
}

// ── Scene grade ──────────────────────────────────────────────────────────────────────────────
// The weather re-lights the whole painted Garden through the scene's one colour layer (with the
// night grade after it), so every painted layer is graded together. Rain reproduces the overcast
// grade approved for the rain sample: saturation 0.72, gain (0.74, 0.79, 0.86), lift (0.03, 0.042, 0.062).
const LUMA = [0.2126, 0.7152, 0.0722];

function gradeMatrix(sat: number, gain: number[], lift: number[]) {
  'worklet';
  const m: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const s = (row === col ? sat : 0) + (1 - sat) * LUMA[col];
      m.push(s * gain[row]);
    }
    m.push(0, lift[row]);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}

export function weatherMatrix(l: WeatherLook): number[] {
  'worklet';
  const sat = 1 - 0.18 * l.overcast - 0.1 * l.wet - 0.22 * l.snow - 0.34 * l.fog - 0.08 * l.storm;
  // Fog flattens contrast toward its own pale grey; snow light is cold and bright.
  // A storm sky is heavier than rain: darker still between the flashes.
  const flat = (1 - 0.2 * l.fog) * (1 - 0.16 * l.storm);
  const gain = [
    (1 - 0.12 * l.overcast - 0.14 * l.wet - 0.05 * l.snow) * flat,
    (1 - 0.1 * l.overcast - 0.11 * l.wet - 0.01 * l.snow) * flat,
    (1 - 0.07 * l.overcast - 0.07 * l.wet + 0.03 * l.snow) * flat,
  ];
  const lift = [
    0.01 * l.overcast + 0.02 * l.wet + 0.01 * l.snow + 0.17 * l.fog,
    0.015 * l.overcast + 0.027 * l.wet + 0.02 * l.snow + 0.18 * l.fog,
    0.025 * l.overcast + 0.037 * l.wet + 0.045 * l.snow + 0.19 * l.fog,
  ];
  return gradeMatrix(sat, gain, lift);
}

/**
 * Snow at night: the midnight grade turns white snow an electric blue, so after it the snowy scene
 * is drained back toward a grey, moonlit blue and lifted a little (snow holds the night's light).
 */
export function nightSnowMatrix(snow: number, night: number): number[] {
  'worklet';
  const k = snow * night;
  return gradeMatrix(1 - 0.5 * k, [1 + 0.18 * k, 1 + 0.16 * k, 1 + 0.05 * k], [0.025 * k, 0.03 * k, 0.035 * k]);
}

/** Lightning: the whole Garden lit for an instant by a cold white sky, over day or night. */
export function flashMatrix(f: number): number[] {
  'worklet';
  // Gain, not lift: the painting's own lights and darks stay, as under a real flash.
  const g = 1 + 0.62 * f;
  return gradeMatrix(1 - 0.18 * f, [g * 0.97, g, g * 1.08], [0.015 * f, 0.025 * f, 0.05 * f]);
}

export function needsGrade(l: WeatherLook) {
  return l.overcast > 0 || l.wet > 0 || l.snow > 0 || l.fog > 0 || l.storm > 0;
}
