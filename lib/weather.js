// Live garden weather (docs/items/WEATHER.md) from MET Norway's Locationforecast 2.0 (CC BY 4.0).
// Privacy: the owner opts in; the app sends an approximate position, and the server keeps only a
// ~11 km grid point (one decimal of latitude/longitude). Friends visiting see the weather state, never
// the place. One cached forecast per grid point serves everyone there, respecting MET's Expires and
// Last-Modified headers. When MET is unavailable the Garden shows clear weather (source "fallback").
export const WEATHER_STATES = Object.freeze(["CLEAR", "CLOUDY", "RAIN", "SNOW", "FOG", "STORM"]);
export const WEATHER_ATTRIBUTION = "Weather data: MET Norway (CC BY 4.0)";
const ENDPOINT = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const MIN_TTL_MS = 10 * 60_000, MAX_TTL_MS = 2 * 60 * 60_000, FAIL_TTL_MS = 5 * 60_000, CACHE_LIMIT = 2000;
export const WINDY_MS = 8; // wind speed (m/s) from which the Garden shows wind

export class WeatherError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// One decimal: a ~11 km grid point. The only form of the position that is stored or sent to MET.
export function gridPoint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new WeatherError("Invalid position", 400, "WEATHER_LOCATION_INVALID");
  }
  const round = value => Math.round(value * 10) / 10 || 0; // never -0
  return { lat: round(lat), lon: round(lon) };
}

// MET symbol_code (e.g. "lightrainshowers_night", "heavysnow", "fog") → Garden weather.
export function weatherFromSymbol(symbol) {
  const code = typeof symbol === "string" ? symbol.replace(/_(day|night|polartwilight)$/, "") : "";
  if (/thunder/.test(code)) return "STORM";
  if (/snow/.test(code)) return "SNOW";
  if (/rain|sleet|drizzle/.test(code)) return "RAIN";
  if (code === "fog") return "FOG";
  if (code === "cloudy" || code === "partlycloudy") return "CLOUDY";
  return "CLEAR"; // clearsky, fair, or unknown
}

// The forecast entry for now (the newest timestep that has started), shaped for the Garden.
export function presentForecast(body, now = new Date()) {
  const series = body?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) return null;
  const current = series.filter(step => Date.parse(step?.time) <= now.getTime()).at(-1) ?? series[0];
  const details = current?.data?.instant?.details ?? {};
  const symbol = current?.data?.next_1_hours?.summary?.symbol_code ?? current?.data?.next_6_hours?.summary?.symbol_code ?? null;
  const wind = Number.isFinite(details.wind_speed) ? details.wind_speed : null;
  return {
    state: weatherFromSymbol(symbol),
    windy: wind !== null && wind >= WINDY_MS,
    night: typeof symbol === "string" && /_night$|_polartwilight$/.test(symbol),
    temperatureC: Number.isFinite(details.air_temperature) ? Math.round(details.air_temperature) : null,
    windSpeedMs: wind,
    symbol,
    observedAt: typeof current?.time === "string" ? current.time : null
  };
}

const FALLBACK = Object.freeze({ state: "CLEAR", windy: false, night: false, temperatureC: null, windSpeedMs: null, symbol: null, observedAt: null });

// In-process cache keyed by grid point. Fine for one Render instance; each instance keeps its own.
export function createWeatherService({ env = process.env, fetchImpl = fetch, clock = () => new Date() } = {}) {
  const cache = new Map();
  const userAgent = () => {
    const value = env.WEATHER_USER_AGENT;
    return typeof value === "string" && /^[\x20-\x7e]{8,200}$/.test(value) ? value : null;
  };
  const ttl = (headers, now) => {
    const expires = Date.parse(headers.get("expires") ?? "");
    const left = Number.isFinite(expires) ? expires - now.getTime() : MIN_TTL_MS;
    return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, left));
  };

  async function forecast({ lat, lon }) {
    const key = `${lat.toFixed(1)},${lon.toFixed(1)}`, now = clock();
    const hit = cache.get(key);
    if (hit && hit.until > now.getTime()) return hit.value;
    const agent = userAgent();
    if (!agent) return { ...FALLBACK, source: "fallback" }; // not configured: never call MET anonymously
    try {
      const headers = { "User-Agent": agent, Accept: "application/json" };
      if (hit?.lastModified) headers["If-Modified-Since"] = hit.lastModified;
      const response = await fetchImpl(`${ENDPOINT}?lat=${lat.toFixed(1)}&lon=${lon.toFixed(1)}`, { headers, signal: AbortSignal.timeout(8_000) });
      if (response.status === 304 && hit?.body) {
        const value = { ...presentForecast(hit.body, now), source: "met" };
        cache.set(key, { ...hit, value, until: now.getTime() + ttl(response.headers, now) });
        return value;
      }
      if (!response.ok) throw new Error(`MET ${response.status}`);
      const body = await response.json();
      const shaped = presentForecast(body, now);
      if (!shaped) throw new Error("MET empty");
      const value = { ...shaped, source: "met" };
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(key, { value, body, lastModified: response.headers.get("last-modified"), until: now.getTime() + ttl(response.headers, now) });
      return value;
    } catch {
      // Stale beats clear; clear beats an error. Retry after a short pause either way.
      const value = hit?.value ? { ...hit.value, source: "stale" } : { ...FALLBACK, source: "fallback" };
      cache.set(key, { ...(hit ?? {}), value, until: now.getTime() + FAIL_TTL_MS });
      return value;
    }
  }
  return { forecast, cacheSize: () => cache.size };
}

// ---- owner settings ----

export async function setWeatherLocation(db, userId, body, { now = new Date() } = {}) {
  if (!body || typeof body !== "object" || Object.keys(body).length !== 1 || !Object.hasOwn(body, "location")) {
    throw new WeatherError("Send { location: { lat, lon } } or { location: null }", 400, "WEATHER_LOCATION_INVALID");
  }
  if (body.location === null) {
    await db.weatherLocation.deleteMany({ where: { userId } });
    return { enabled: false };
  }
  const { lat, lon } = body.location ?? {};
  if (typeof body.location !== "object" || Object.keys(body.location).some(key => !["lat", "lon"].includes(key))) {
    throw new WeatherError("Send lat and lon only", 400, "WEATHER_LOCATION_INVALID");
  }
  const point = gridPoint(lat, lon);
  await db.weatherLocation.upsert({ where: { userId }, update: { ...point, updatedAt: now }, create: { userId, ...point, updatedAt: now } });
  return { enabled: true };
}

// The Garden's weather for one owner (their own, or a friend's when visiting). No position in the answer.
export async function gardenWeather(db, service, userId) {
  const row = await db.weatherLocation.findUnique({ where: { userId }, select: { lat: true, lon: true } });
  if (!row) return { enabled: false, ...FALLBACK, source: "off", attribution: null };
  return { enabled: true, ...await service.forecast({ lat: row.lat, lon: row.lon }), attribution: WEATHER_ATTRIBUTION };
}
