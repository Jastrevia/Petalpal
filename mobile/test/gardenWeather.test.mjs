import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
function service(answer) {
  const calls = [];
  const api = { ApiError, apiRequest: async (path, method = 'GET', body) => { calls.push({ path, method, body }); return answer(path, method, body); } };
  const load = loadPlantingModules(undefined, undefined, undefined, true, { './api': api });
  return { weather: load('../../../services/gardenWeather'), calls };
}
const source = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('the owner reads their own weather, a visitor their friend\'s, never a place', async () => {
  const { weather, calls } = service(() => ({ enabled: true, state: 'RAIN', windy: true, source: 'met', attribution: 'Weather data: MET Norway (CC BY 4.0)', temperatureC: 6 }));
  assert.deepEqual({ ...await weather.loadWeather() }, { enabled: true, state: 'RAIN', windy: true, source: 'met', attribution: 'Weather data: MET Norway (CC BY 4.0)' });
  await weather.loadWeather('friend/1');
  assert.deepEqual(calls.map(call => call.path), ['/api/weather', '/users/friend%2F1/weather']);
});

test('off, unknown or unavailable weather is clear; a real failure is not hidden', async () => {
  const unknown = service(() => ({ enabled: true, state: 'HAIL', windy: 'yes' }));
  const answer = await unknown.weather.loadWeather();
  assert.equal(answer.state, 'CLEAR'); assert.equal(answer.windy, false);
  assert.equal((await service(() => ({ enabled: false, state: 'CLEAR', source: 'off' })).weather.loadWeather()).enabled, false);
  for (const status of [401, 403, 404]) assert.equal(await service(() => { throw new ApiError('no', status); }).weather.loadWeather(), null);
  await assert.rejects(service(() => { throw new ApiError('down', 500); }).weather.loadWeather(), /down/);
});

test('turning Garden weather on sends one rounded position; off sends null', async () => {
  const { weather, calls } = service((path, method, body) => ({ enabled: body.location !== null, state: 'CLEAR', windy: false }));
  assert.equal((await weather.saveWeatherLocation({ lat: 49.3, lon: -123.1 })).enabled, true);
  assert.equal((await weather.saveWeatherLocation(null)).enabled, false);
  assert.deepEqual(calls.map(({ path, method, body }) => ({ path, method, body: JSON.parse(JSON.stringify(body)) })), [
    { path: '/api/weather/location', method: 'PUT', body: { location: { lat: 49.3, lon: -123.1 } } },
    { path: '/api/weather/location', method: 'PUT', body: { location: null } },
  ]);
  // The settings round to one decimal (~11 km) before sending, and ask only for the lowest accuracy.
  const settings = source('components/features/GardenWeatherSettings.tsx');
  assert.match(settings, /Math\.round\(value \* 10\) \/ 10/);
  assert.match(settings, /Accuracy\.Lowest/);
  assert.ok(!/requestBackgroundPermissionsAsync/.test(settings));
  assert.ok(settings.includes('WEATHER_CREDIT'));
});

test('the dogs go home in rain, storms and snow only', () => {
  const { weather } = service(() => ({}));
  assert.deepEqual(['CLEAR', 'CLOUDY', 'RAIN', 'STORM', 'SNOW', 'FOG'].filter(weather.dogsShelterIn), ['RAIN', 'STORM', 'SNOW']);
  const scene = source('components/garden/GardenScene.tsx');
  assert.match(scene, /shelter=\{dogsShelterIn\(weather\.state\)\}/);
  // The dev ?weather= preview wins over the live sky.
  assert.match(scene, /if \(!liveWeather \|\| weather\.preview\) return;/);
});

test('the house clip covers both dogs at the door and its sheet matches its cells', () => {
  const clip = source('components/garden/critters/DogHouseOccupants.tsx');
  const [, columns, count, w, h] = clip.match(/columns: (\d+), count: (\d+), w: (\d+), h: (\d+)/).map(Number);
  const [, cx, cy, cw, ch] = clip.match(/crop: \{ x: (\d+), y: (\d+), w: (\d+), h: (\d+) \}/).map(Number);
  const state = source('components/garden/dogHouseState.ts');
  for (const [, x, y] of state.matchAll(/(?:puppy|maltese): \{ x: ([\d.]+), y: ([\d.]+) \}/g)) {
    assert.ok(+x > cx && +x < cx + cw && +y > cy && +y <= cy + ch, `door spot ${x},${y} inside the crop`);
  }
  // VP8X WebP header: canvas width/height minus one, 24-bit little endian, at bytes 24 and 27.
  const webp = fs.readFileSync(new URL('../assets/garden/landmarks/dog-house/dogs-enter.webp', import.meta.url));
  const size = offset => 1 + webp.readUIntLE(offset, 3);
  assert.equal(webp.toString('ascii', 12, 16), 'VP8X');
  assert.deepEqual([size(24), size(27)], [columns * w, Math.ceil(count / columns) * h]);
  assert.ok(webp.length < 1.3 * 1024 * 1024);
});
