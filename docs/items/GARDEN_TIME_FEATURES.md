# Monthly flower deity and pet homes

Both follow the owner's local clock (`User.timezone`); rules in [time.md](../../time.md).

## Monthly flower deity

Code: [lib/flower-deity.js](../../lib/flower-deity.js). One deity per month of the year (12 in all). Names and
stories in the file are drafts: rewrite them freely, but never change an `id` once it has shipped.

- A deity shows only when its art is ready: set `ready: true` in the file, or list its id in the Render env
  `FLOWER_DEITIES_READY` (comma-separated, no code change), e.g. `deity-snowdrop,deity-violet`.
- Art key: `garden/deities/<flower>` (e.g. `garden/deities/snowdrop`).
- The Monthly report for a month (`periodKey` `YYYY-MM`) can show the same deity: `monthOfYear` = the month number.

`GET /api/garden/deity` →

```json
{ "month": "2027-01",
  "deity": { "id": "deity-snowdrop", "monthOfYear": 1, "flower": "snowdrop", "name": "…", "story": "…",
             "art": "garden/deities/snowdrop", "ready": true },
  "album": [{ "month": "2027-01", "id": "deity-snowdrop", "ready": true, "name": "…" }, { "month": "2026-12", "id": "deity-holly", "ready": false }] }
```

`deity` is `null` in a month whose deity has no art yet.

## Pet homes

Code: [lib/pet-homes.js](../../lib/pet-homes.js). Migration `202611180005_pet_homes`.

- Every pet sleeps 21:30–07:00 local; each next pet in the list 12 minutes later, so they go in one by one.
- The owner places each pet's bed; positions are Garden world coordinates (same as flowers and decorations).
- The app plays "going in" when `state` turns `ASLEEP` and "coming out" when it turns `AWAKE`; schedule a refresh at
  `nextChangeAt`.

| Route | Body | Returns |
|---|---|---|
| `GET /api/fairy/pets/homes` | — | `{ pets: [{ petId, state: "ASLEEP"\|"AWAKE", nextChangeAt, home: { worldX, worldY } \| null }], world }` |
| `PUT /api/fairy/pets/:petId/home` | `{ "home": { "worldX": 1200, "worldY": 300 } }` or `{ "home": null }` | same as GET |
| `GET /users/:userId/pet-homes` | — | a friend's pets (by the friend's clock), for visits |
