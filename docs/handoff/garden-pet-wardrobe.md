# Handoff: Garden pet wardrobe

For whoever continues this work (a person or a coding agent). Read this first, then
[AGENTS.md](../../AGENTS.md) and [WARNING.md](../../WARNING.md), which still take precedence.
Written 2026-11-03.

## Where things stand

Branch `feat/garden-pet-wardrobe`, PR #170 (not merged yet when this was written). Migration
`202611020002_garden_pets` has already been applied to the TEST database.

Done on this branch:

- **Bond rewards and food (backend).** Fairy Bond levels open the pets' accessories: hats at
  Lv 4–8, pendants at Lv 9–15, capes last at Lv 16–20. Pet food comes from check-ins, level-ups and
  first-week plantings. Each pet keeps its own outfit. Rules and routes:
  [FAIRY_CLOSENESS_API.md §6](../product/FAIRY_CLOSENESS_API.md).
- **The puppy wears its outfit in the Garden (app).** Two outfit sets, 11 looks in all, each
  walking, galloping after the bluebird and sitting down. The Garden reads the puppy's outfit from
  `GET /api/fairy/pets` and shows the matching look.
- **Accessory icons.** One painted icon per catalog piece, 32 in all, in
  `mobile/assets/garden/pets/accessories/<id>.webp`. Not used by any screen yet: they are for the
  wardrobe.

Not done yet (next work, in the owner's order):

1. **Tap a pet → ring menu** with three actions: feed, pat its head, dress up.
2. **Wardrobe screen** that feels like a closet: every piece shows; pieces not yet opened show a
   small lock. Choosing a piece calls `PUT /api/fairy/pets/:petId/outfit`.
3. **Eating and being-patted animations** for the puppy, as natural as its walk. These need new
   painted motion clips (see "Art" below). *Started 2026-11-05:* set 2's petal cape (look `cape2`)
   has both (`PUPPY_ACTIONS` in `puppyLooks.ts`, `eat-cape2.webp` / `pat-cape2.webp`): oil-motion
   clips (minimax h3 highspeed, 6 s, 24 fps kept at 12) that start and end on that look's sitting
   frame, the eating clip from a key frame with a painted bowl added (gpt-image edit). Owner
   approved them as made. Prompts, key frames and the packer (`action_sheet.py`) are in
   `~/dev/petalpal-motion/dressed/actions/`. The ring menu plays them (Feed after a food is eaten,
   Pat) and steps aside meanwhile; every other look still shows only rising hearts. Still to make:
   the bare puppy and set 1's cape (4 clips, 2 bowl key frames), then hats and necklaces tracked
   onto them like the walks.
4. **The other four pets** (hedgehog, butterfly, rabbit, bluebird) have no outfit art yet.
   *New pet, 2026-11-05:* a Maltese, the puppy's tiny best friend (`maltese` in `critterVisits.ts`,
   `maltese-walk.webp` / `maltese-sit.webp`). The owner chose its look (a realistic fluffy white
   puppy, gpt-image key frame `~/dev/petalpal-motion/maltese/M0-chosen.png`; it need not match the
   puppy's painted style) and asked that it be small. Walk loop and walk-to-sit are oil-motion clips
   (minimax h3 highspeed) cut with crop 190,30,920,690 into 293 × 220 cells. It comes only with the
   puppy (`planFriendVisit`, a little way from it), then follows it along the paths and sits beside
   it facing it (`planFollow`). No ring menu or wardrobe for it yet.
   *Playing together (2026-11-05):* the Maltese leads about 7 walks in 10 (the puppy is clingy),
   the puppy the rest (`pickLeader`); they never stand inside each other (`APART`). Now and then,
   when close: a chase (either one runs, on its painted run; `planPlay`), a tug-of-war with a rope
   toy, or a hug (`planScene`: one oil-motion clip of both, `pair-tug.webp` / `pair-hug.webp`,
   anchored on the puppy's paws). Clips, prompts and the packer (`pair/pair_sheet.py`) are in
   `~/dev/petalpal-motion/maltese/`. The golden's sitting frames had a dark patch under the belly:
   Kiro repainted it (one oil-motion edit, `~/dev/petalpal-motion/dressed/belly/NOTES.md`) in all
   seven bare-body sit sheets; the hug clip was regenerated with a clean belly.
   *Every outfit eats and is patted (2026-11-05):* eat/pat clips for bare, velvet cape and petal
   cape (minimax h3 highspeed; h3-max is not on the ZenMux key's allowed models), hats and
   necklaces laid on by Kiro's head tracking (`~/dev/petalpal-motion/dressed/actions/build_looks.sh`),
   and the belly gap filled in every frame from Kiro's repaint (`belly_paste.py`). The puppy never
   changes outfit while running: it stops, sits, then changes, and no game or chase starts
   meanwhile. Dressed, it only plays chase with the Maltese (the tug and hug clips paint it bare).
5. **Per-pet catalogs.** The catalog is still 32 generic pieces shared by all pets. The puppy maps
   pieces to its art like this: `flower-sprig`, `petal-capelet` and `crystal-drop` are its set 2;
   every other piece shows its set 1 art. That is a stand-in until each pet has its own pieces.

The owner has the reference mock-ups for the ring menu and the wardrobe; ask for them.

## The owner's rules (do not break these)

- **Same dog, same size, in every look.** Bare or dressed, walking, running or sitting, it must
  read as the same puppy. No look may change its face, size or proportions.
- **Each set is the puppy's own.** A pet only wears pieces painted for it; never mix sets in one
  look. When two sets' pieces are on at once, the cape's set wins, else the hat's, and the other
  set's pieces are left off.
- **A cape carries its own crystal clasp.** So a pendant shows only without a cape, as a necklace.
- **Changing outfit is plain.** No glow, petals or other effects: the new look fades on in 0.25 s
  and carries on in the same step (`MATCHING_FRAME` in `puppyLooks.ts`).
- **Changing outfit while running:** the puppy stops, sits down, and changes sitting.
- **Ornaments must be whole.** No broken stems, flicker or paper fringe in any frame.
- **Art looks worn, not pasted on.** Capes have folds and soft contact shadows.

## Acceptance checklist

Kept from the first web-edited version of this file (commit `33bb60d0`), checked against the code:
its reward levels, look count and Git steps were out of date and are not repeated here.

Character and art
- [ ] The same dog, same size and proportions, in every look (bare, dressed, walking, running, sitting).
- [ ] Every ornament is whole in every frame: no broken stems, flicker or paper fringe.
- [ ] A cape look always shows its crystal clasp; a pendant shows only without a cape, as a necklace.

Motion
- [ ] Walking, galloping after the bluebird and sitting down all work in every look.
- [ ] Changing outfit is a plain 0.25 s fade that keeps the step; no glow, petals or other effects.
- [ ] Changing outfit while running: the puppy stops, sits down, and changes sitting.

Ring menu
- [ ] Tapping the puppy opens the one-third ring (120°): feed, pat, dress up.
- [ ] Each action does real work (feed calls the API and the count goes down); the ring closes on a tap
  outside it, and works on phone-sized screens.

Wardrobe
- [ ] Every piece shows; pieces not yet opened show a small lock and cannot be chosen.
- [ ] The pieces worn are marked; choosing one calls `PUT /api/fairy/pets/:petId/outfit` with all
  three slots (the server sets a missing slot to null) and the Garden puppy changes.
- [ ] The outfit is still on after a reload (it is stored on the server).
- [ ] Mixed sets follow the set rule above (the cape's set wins, else the hat's); the server only
  accepts opened pieces in their own row.

Regression
- [ ] Rewards, food and existing API contracts unchanged; backend and app tests pass; report any test
  that could not be run, and why.

## Where the code is

| What | Where |
| --- | --- |
| Catalog, unlock bands, food, outfits | `lib/garden-pets.js` |
| Closeness and pet routes | `lib/fairy-closeness.js`, `server.js` (`/api/fairy/pets…`) |
| Backend tests | `test/back/fairy-closeness.test.js` |
| App: pets API | `mobile/src/services/gardenPets.ts` |
| App: looks, sets, frame matching | `mobile/src/components/garden/critters/puppyLooks.ts` |
| App: drawing walkers, outfit change | `mobile/src/components/garden/critters/GardenCritters.tsx` |
| App: visits, chase, sit | `mobile/src/components/garden/critters/critterVisits.ts` |
| Frame sheets (walk / run / sit per look) | `mobile/assets/garden/critters/puppy-looks/` |
| Sheet packer | `mobile/scripts/critters/video-frames.py` |
| App tests | `mobile/test/gardenCritters.test.mjs` |

## How to check your work

- Backend: `DEV_DATABASE_URL=postgresql://test:test@localhost:5432/petalpal_test node --test test/back/fairy-closeness.test.js`
- App: `cd mobile && npx tsc --noEmit -p . && node --test test/gardenCritters.test.mjs`
- Local preview: `cd mobile && npm run web:local`, then sign in with the fake account shown on
  the page. `/critters-test` shows the puppy large, with buttons for every look and for walk,
  run and sit.
- In the Garden (development builds only), `window.__gardenCritters` brings a visitor in and
  dresses the puppy: `.spawn('puppy')`, `.dress('cape2-hat')` (`undefined` goes back to the
  server's outfit), `.chase({ x, y })`, `.visits()`.

## Art: what a cloud sandbox cannot do

New outfits and new motion (eating, being patted, the other pets) are made outside this repo, on
the owner's Mac, in `~/dev/petalpal-motion/dressed/`. That pipeline needs paid image and video
models whose keys live only in the owner's local keychain. A cloud sandbox has neither the
pipeline nor the keys, and must not ask for the keys. Build the screens and logic against the
existing sheets; ask the owner when new art is needed.

How the existing looks were made, for reference:

1. The outfit is painted onto the dog (Holopix "Outfit Transfer"), then only the outfit is kept:
   the dog's own pixels always come from the original painting.
2. An image model refits the outfit so it looks worn (folds, shadows) and cleans its edges; the
   head, lower legs and tail still come from the original.
3. Each cape gets its own generated walk, run and run-to-sit clips. Hats and necklaces are
   tracked onto the bare dog's clips, frame by frame.
4. `video-frames.py` cuts each loop into a frame sheet. Pack with `--masks <dir> --keep-near 40`,
   or thin stems are dropped and flicker.

## Git

Commit on a branch; the owner pushes, opens and merges pull requests, runs migrations and deploys.
