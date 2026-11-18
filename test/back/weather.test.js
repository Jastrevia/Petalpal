import assert from "node:assert/strict";
import test from "node:test";
import { createWeatherService, gardenWeather, gridPoint, presentForecast, setWeatherLocation, weatherFromSymbol, WEATHER_ATTRIBUTION } from "../../lib/weather.js";

const NOW = new Date("2026-11-18T20:10:00Z");
const met = (symbol, { temp = 6.4, wind = 3.2 } = {}) => ({ properties: { timeseries: [
  { time: "2026-11-18T19:00:00Z", data: { instant: { details: { air_temperature: 1, wind_speed: 1 } }, next_1_hours: { summary: { symbol_code: "clearsky_day" } } } },
  { time: "2026-11-18T20:00:00Z", data: { instant: { details: { air_temperature: temp, wind_speed: wind } }, next_1_hours: { summary: { symbol_code: symbol } } } },
  { time: "2026-11-18T21:00:00Z", data: { instant: { details: { air_temperature: 9, wind_speed: 9 } }, next_1_hours: { summary: { symbol_code: "heavysnow" } } } }
] } });

test("only a ~11 km grid point is kept; bad positions are refused", () => {
  assert.deepEqual(gridPoint(49.28273, -123.12074), { lat: 49.3, lon: -123.1 });
  assert.deepEqual(gridPoint(-0.04, 0.04), { lat: 0, lon: 0 });
  for (const [lat, lon] of [[91, 0], [0, 181], [NaN, 0], ["49", "-123"]]) assert.throws(() => gridPoint(lat, lon), { code: "WEATHER_LOCATION_INVALID" });
});

test("MET symbols become Garden weather", () => {
  const cases = { clearsky_day: "CLEAR", fair_night: "CLEAR", partlycloudy_day: "CLOUDY", cloudy: "CLOUDY", fog: "FOG",
    lightrainshowers_day: "RAIN", sleet: "RAIN", heavysnowshowers_polartwilight: "SNOW", rainandthunder: "STORM", lightssnowshowersandthunder_day: "STORM", unknown: "CLEAR" };
  for (const [symbol, state] of Object.entries(cases)) assert.equal(weatherFromSymbol(symbol), state, symbol);
  assert.deepEqual(presentForecast(met("lightrain_night", { wind: 9.5 }), NOW),
    { state: "RAIN", windy: true, night: true, temperatureC: 6, windSpeedMs: 9.5, symbol: "lightrain_night", observedAt: "2026-11-18T20:00:00Z" });
  assert.equal(presentForecast({}, NOW), null);
});

test("one cached MET call per grid point, with the app's User-Agent, If-Modified-Since and Expires; clear when MET is down", async () => {
  const calls = [];
  let reply = () => new Response(JSON.stringify(met("cloudy")), { status: 200,
    headers: { "content-type": "application/json", expires: "Wed, 18 Nov 2026 20:40:00 GMT", "last-modified": "Wed, 18 Nov 2026 20:05:00 GMT" } });
  let now = NOW;
  const service = createWeatherService({ env: { WEATHER_USER_AGENT: "PetalPal/1.0 jastrevia.com" }, clock: () => now,
    fetchImpl: async (url, options) => { calls.push({ url, headers: options.headers }); return reply(); } });
  const first = await service.forecast({ lat: 49.3, lon: -123.1 });
  assert.equal(first.state, "CLOUDY"); assert.equal(first.source, "met");
  assert.deepEqual(calls[0], { url: "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=49.3&lon=-123.1",
    headers: { "User-Agent": "PetalPal/1.0 jastrevia.com", Accept: "application/json" } });
  await service.forecast({ lat: 49.3, lon: -123.1 });
  assert.equal(calls.length, 1, "served from cache until Expires");
  now = new Date("2026-11-18T20:41:00Z");
  reply = () => new Response(null, { status: 304, headers: { expires: "Wed, 18 Nov 2026 21:30:00 GMT" } });
  assert.equal((await service.forecast({ lat: 49.3, lon: -123.1 })).state, "CLOUDY");
  assert.equal(calls[1].headers["If-Modified-Since"], "Wed, 18 Nov 2026 20:05:00 GMT");
  now = new Date("2026-11-18T22:00:00Z");
  reply = () => new Response("busy", { status: 429 });
  const stale = await service.forecast({ lat: 49.3, lon: -123.1 });
  assert.equal(stale.source, "stale"); assert.equal(stale.state, "CLOUDY");
  const fresh = await service.forecast({ lat: 10, lon: 10 });
  assert.equal(fresh.source, "fallback"); assert.equal(fresh.state, "CLEAR");
  // No User-Agent configured: MET is never called.
  const silent = createWeatherService({ env: {}, fetchImpl: async () => assert.fail("no anonymous MET calls") });
  assert.equal((await silent.forecast({ lat: 1, lon: 1 })).source, "fallback");
});

test("owner opt-in stores the grid point only; off deletes it; answers never include the place", async () => {
  let row = null;
  const db = { weatherLocation: {
    findUnique: async () => row,
    upsert: async ({ create, update }) => (row = row ? { ...row, ...update } : create),
    deleteMany: async () => { row = null; }
  } };
  const service = { forecast: async point => ({ state: "SNOW", windy: false, night: false, temperatureC: -2, windSpeedMs: 1, symbol: "snow", observedAt: null, source: "met", point }) };
  assert.deepEqual(await gardenWeather(db, service, "user_1"), { enabled: false, state: "CLEAR", windy: false, night: false, temperatureC: null,
    windSpeedMs: null, symbol: null, observedAt: null, source: "off", attribution: null });
  await setWeatherLocation(db, "user_1", { location: { lat: 49.28273, lon: -123.12074 } }, { now: NOW });
  assert.deepEqual({ lat: row.lat, lon: row.lon }, { lat: 49.3, lon: -123.1 });
  const on = await gardenWeather(db, service, "user_1");
  assert.equal(on.state, "SNOW"); assert.equal(on.attribution, WEATHER_ATTRIBUTION);
  assert.equal("lat" in on || "lon" in on, false);
  for (const body of [{}, { location: { lat: 1 } }, { location: { lat: 1, lon: 2, city: "x" } }, { location: "Vancouver" }, { location: null, extra: 1 }]) {
    await assert.rejects(setWeatherLocation(db, "user_1", body), { code: "WEATHER_LOCATION_INVALID" });
  }
  assert.deepEqual(await setWeatherLocation(db, "user_1", { location: null }), { enabled: false });
  assert.equal(row, null);
});
