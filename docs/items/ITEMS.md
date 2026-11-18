# Items, fairy outfits and the shop

Code: [lib/items.js](../../lib/items.js), [lib/fairy-wardrobe.js](../../lib/fairy-wardrobe.js). Catalog:
[data/items/catalog.json](../../data/items/catalog.json). Migration `202611180003_items_wardrobe`.

One item system serves fairy outfits (now), garden decorations (Keepsake DIY) and the shop.

## Adding a piece (no code)

1. Paint the art and put it where the app loads it (the `art` key is the app's asset key, e.g. `fairy/hair/rose-braid`).
2. Add one entry to `data/items/catalog.json`:

```json
{ "id": "fairy-hair-rose-braid", "type": "FAIRY_OUTFIT", "slot": "hair", "set": "rose",
  "access": "LEVEL", "level": 5, "art": "fairy/hair/rose-braid",
  "name": { "en": "Rose braid", "zh-Hans": "玫瑰发辫" } }
```

| Field | Rules |
|---|---|
| `id` | lower-case letters, digits, dashes; never reuse or rename one that shipped |
| `type` / `slot` | `FAIRY_OUTFIT`: `body`, `hair`, `clothes`, `accessory` (may be empty). `DECORATION`: `garden` |
| `access` | `FREE` everyone · `VIP` while VIP · `LEVEL` Fairy Bond level ≥ `level` · `SHOP` bought in the store (`productId`) · `GRANT` given by the server |
| `productId` | only for `SHOP`: the App Store / Play product id (non-consumable), also attached in RevenueCat |
| `placeholder` | `true` hides the item until its art exists |
| `default` | the piece a slot falls back to; exactly one free default for body, hair and clothes |

The server refuses to start if the catalog breaks a rule (test: `test/back/items-wardrobe.test.js`).

VIP pieces are never stored as owned: a lapsed VIP wears the slot's default and gets the piece back on renewal.
Shop pieces are owned once bought (synced from RevenueCat with VIP, `POST /billing/sync`).

## API for the app

All need the signed-in token. Locked pieces answer **403** with `code: "VIP_REQUIRED"` (show the paywall) or
`"ITEM_LOCKED"` (level or shop).

| Route | Body | Returns |
|---|---|---|
| `GET /api/items?type=FAIRY_OUTFIT` | — | `{ items: [{ id, type, slot, set, art, name, access, level, productId, usable, owned, ownedAt }] }` |
| `GET /api/fairy/wardrobe` | — | `{ equipped: { body, hair, clothes, accessory }, looks: [{ id, name, equipped, complete }], pieces: [...items], vip, level }` |
| `PUT /api/fairy/wardrobe` | `{ "equipped": { "hair": "fairy-hair-rose-braid", "accessory": null } }` | the wardrobe |
| `POST /api/fairy/wardrobe/looks` | `{ "name": "Spring" }` (saves what is worn now; max 8) | the wardrobe (201) |
| `POST /api/fairy/wardrobe/looks/:lookId/wear` | `{}` | the wardrobe |
| `DELETE /api/fairy/wardrobe/looks/:lookId` | — | the wardrobe |
| `GET /users/:userId/fairy-outfit` | — | `{ equipped }` for a friend whose Garden you may visit (403 otherwise) |

Drawing: layer `body` → `clothes` → `hair` → `accessory` from each piece's `art`. `complete: false` on a look
means one of its pieces is locked now; wearing it puts the slot's default there.

## Keepsake DIY garden

Code: [lib/garden-layout.js](../../lib/garden-layout.js). Migration `202611180004_garden_layout`.

- Every fairy keepsake (lib/fairy-keepsakes.js) is also a decoration `deco-<keepsakeId>`, owned by whoever received
  that keepsake. Receiving the same keepsake 3 times lets the owner place 3 copies (at most 10).
- A keepsake decoration stays hidden until its decoration art exists: add the keepsake id to `decorationsReady` in
  the catalog. Other decorations (shop or VIP) are normal catalog entries with `"type": "DECORATION", "slot": "garden"`.
- Positions are Garden world coordinates (`worldX` 0–2399, `worldY` 0–1799, the same world as flowers). `z` orders
  overlapping pieces (higher on top), `flip` mirrors the art, `scale` is 0.5–2.

| Route | Body | Returns |
|---|---|---|
| `GET /api/items?type=DECORATION` | — | the decoration inventory; each has `copies` (how many can be placed) and `keepsakeId` |
| `GET /api/garden/layout` | — | `{ placements: [{ itemId, worldX, worldY, z, flip, scale, art }], updatedAt, world, limit }` |
| `PUT /api/garden/layout` | `{ "placements": [{ "itemId": "deco-dewdrop", "worldX": 812, "worldY": 940, "z": 3, "flip": false, "scale": 1 }] }` | the saved layout (the whole layout is replaced; max 60) |
| `GET /users/:userId/garden-layout` | — | a friend's placements, for visiting their Garden |

The editor can update the screen first and save in the background (optimistic UI); on an error, reload with
`GET /api/garden/layout`. A piece the owner can no longer use (lapsed VIP) is simply not returned.
