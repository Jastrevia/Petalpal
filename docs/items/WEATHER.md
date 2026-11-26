# Live garden weather

Code: [lib/weather.js](../../lib/weather.js). Migration `202611180006_weather_location`. Data: MET Norway
Locationforecast 2.0 (free, commercial use allowed under CC BY 4.0 with credit). Open-Meteo was not used: its free
tier is non-commercial only.

## Privacy

- Off until the owner turns it on. The app asks for location permission (approximate is enough: on iOS use reduced
  accuracy; `expo-location` `Accuracy.Lowest`), then sends `{ lat, lon }` once.
- The server keeps only a ~11 km grid point (one decimal, e.g. 49.3, −123.1) and sends only that to MET. Turning
  weather off deletes it. Friends who visit see the weather, never the place.
- The privacy policy must mention this (approximate location, used for garden weather, sent to MET Norway as a
  rounded point) before launch.

## Owner setup

1. Read and accept MET's terms of service yourself (https://api.met.no/doc/TermsOfService): MET requires a person,
   not an AI, to accept them.
2. Render env `WEATHER_USER_AGENT` = the app name, version and a contact site or email, e.g.
   `PetalPal/1.0 jastrevia.com`. Without it the server never calls MET and every Garden shows clear weather.
3. Show the credit "Weather data: MET Norway (CC BY 4.0)" where the weather appears (the API returns it as
   `attribution`).

## App (release/1.0.1, 2026-11-26)

- Me → **Garden weather** ([GardenWeatherSettings.tsx](../../mobile/src/components/features/GardenWeatherSettings.tsx)):
  off by default. On asks for foreground location (`expo-location`, `Accuracy.Lowest`, a last-known fix up to an hour
  old first), rounds to one decimal and sends `PUT /api/weather/location` once; off sends `{ location: null }`. Shows
  the MET credit while on. No background location (plugin flags off; Android `ACCESS_FINE_LOCATION` blocked).
- The Garden ([services/gardenWeather.ts](../../mobile/src/services/gardenWeather.ts)) reads `GET /api/weather` (or
  `GET /users/:id/weather` in a friend's Garden) when it opens and every 15 minutes while it is open; anything
  unknown, off or unreachable is clear. The dev web `?weather=` preview still wins.
- Rain, storms and snow send the puppy and the Maltese home: they run to the door, go in (painted clip,
  [DogHouseOccupants.tsx](../../mobile/src/components/garden/critters/DogHouseOccupants.tsx)) and rest in the doorway
  until it clears; a tap on the house then shows them asleep ([DogsAsleepCard.tsx](../../mobile/src/components/garden/DogsAsleepCard.tsx)).
- Needs a new native build (`expo-location`). Until the owner setup below is done every Garden stays clear.

## API

| Route | Body | Returns |
|---|---|---|
| `GET /api/weather` | — | the owner's Garden weather (below) |
| `PUT /api/weather/location` | `{ "location": { "lat": 49.28, "lon": -123.12 } }` or `{ "location": null }` | the Garden weather after the change |
| `GET /users/:userId/weather` | — | a friend's Garden weather, for visits |

```json
{ "enabled": true, "state": "RAIN", "windy": false, "night": true, "temperatureC": 6, "windSpeedMs": 3.2,
  "symbol": "lightrain_night", "observedAt": "2026-11-18T20:00:00Z", "source": "met",
  "attribution": "Weather data: MET Norway (CC BY 4.0)" }
```

- `state`: `CLEAR`, `CLOUDY`, `RAIN`, `SNOW`, `FOG`, `STORM` (thunder). `windy` is true from 8 m/s. `night` follows
  MET's day/night symbol.
- `source`: `met` (fresh), `stale` (MET failed, last known), `fallback` (no data: clear), `off` (owner has not
  turned it on).
- Forecasts are cached per grid point until MET's `Expires` time (10 minutes to 2 hours). The app should not poll more
  than every 10 minutes and only while open.
