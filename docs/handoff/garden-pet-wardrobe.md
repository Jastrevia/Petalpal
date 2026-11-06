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
   *New Maltese painting and its outfit (2026-11-05, branch `feat/maltese-holopix`):* the owner
   dressed the Maltese on Holopix (Outfit Transfer template, `creativeTemplateId=139`) after its
   design sheet (flower clip, lilac capelet, bow and charms) and chose that painting for the dog
   itself, so it replaces M0: on green it is the petal look (`dressed.png`, the capelet refitted
   over the back by one gpt-image edit), and the same painting with every piece taken off is the bare
   look (`bare.png`), both in `~/dev/petalpal-motion/maltese/v2/`. Each look has its own walk, walk-to-
   sit and gallop (`MALTESE_LOOKS` in GardenCritters.tsx; `maltese-*.webp`, `maltese-petal-*.webp`);
   tug and hug were regenerated with the new bare Maltese. Its head is bigger than M0's, so it is
   drawn at 0.8 of the old size (`MALTESE_SIZE` 49.6, about 0.44 of the puppy), and the pair first
   frames use that scale (the tug frame is itself at 0.79 of the puppy's video scale: k 0.342).
   The bare sit clip's backdrop turned pink half way: it is keyed per frame (`sit-masks/`). The
   videos paint a dark shadow between its legs and belly (dark on the lawn): in all six sheets, dark
   patches of 25 px or more in the bottom 22% of each cell fade to transparent (`maltese/v2/belly_clear.py`;
   originals in `maltese/v2/sheets-before-belly/`); the bottom band keeps the red bow out.
   It walks at the puppy's pace (`MALTESE_SPEED` 38, the owner's choice): its frames follow the
   ground covered, so the painted stride stays and its steps come quicker; it gallops at the puppy's
   RUN_SPEED too (`MALTESE_RUN_SPEED` 145), its short strides about 4.4 a second.
   *Its own menu and wardrobe (2026-11-05, owner's choices):* a tap on Xiaobai opens the same ring
   menu in the Garden's forest green (`TONES` in `PetRingMenu.tsx`; the Skia ring takes its tone as
   a prop, context does not reach a Skia canvas). Its closet holds only its own three pieces, each
   kept under a catalog id and opening with it: flower clip `flower-sprig`, lilac capelet
   `petal-capelet`, pink bow `crystal-drop` (`PET_OWN_PIECES` in `petRing.ts` and, enforced, in
   `lib/garden-pets.js`; icons painted from its own art, `maltese-*.webp`). Feed and Pat play its
   painted clips, then hearts (see "eats and is patted in every look" below). The server has `maltese` in `GARDEN_PETS` (no migration: `petId` is a
   string); until that is deployed the menu says it is almost ready and Xiaobai keeps following the
   puppy's outfit. It wears its own outfit (`malteseLookOfOutfit`): hat, necklace, cape, any of them
   together (all three: its petal look), a necklace with its cape too. When dressing happens (the owner's rules, 2026-11-05): both dogs change together, and only
   walking or sitting. Running (the bluebird chase, a game of chase, the Maltese catching up) is cut
   short: both sit down where they are (`sitDown`), then change. A hug or a tug-of-war is never
   interrupted: a tap does nothing during it, and an outfit waits until it has played out, then
   both sit and change. Tapping either dog (its ring menu) sits both down where they are,
   and both get up when the menu closes. A change loads only the new look's
   sheets. Eight looks: bare, hat, necklace, hat-necklace, cape, cape-hat, cape-necklace, petal.
   *Its own pieces (2026-11-05):* the owner chose Xiaobai's own flower clip (its hat) and pink bow
   with two charms on the ribbon from under its ear (its necklace), cut from the Holopix painting
   where it differs from the bare one (`maltese/v2/pieces/cut_pieces.py`). They are laid onto the
   bare walk, sit and run clips frame by frame (`pieces/overlay_maltese.py`, after Kiro's head
   tracking: the flower rides the head, the bow the throat, the ribbon skinned between them and
   tucked under the ear, the charms swing; in the gallop the throat is searched only near where
   the head puts it, as its fur looks like the legs), then packed with the bare sheets' loops and
   crops and the belly shadow cleared (`pieces/pack_looks.sh` → `maltese-looks/*.webp`), so hat,
   necklace and bare walk in step.
   *Its cape (2026-11-05):* the capelet alone has its own clips (owner approved: 2 gpt-image-2.5-flare
   edits, 3 minimax h3 highspeed videos). First frames: the petal painting and its gallop key with
   only the head top and throat taken from an edit that took off the flower clip and the bow and
   fastened the capelet with a small gold clasp set with a pink crystal (owner's choice;
   `maltese/v2/cape/compose_keys.py`). The walk's backdrop turned black after its first frame, so
   every frame is keyed by its own border (`cape/key_frames.py`, keeping eyes and nose, and fading
   the dark crease under the curled tail). Flower and bow are laid on as on the bare clips (the bow
   over the clasp, without its ribbon: the capelet has its own collar) and packed with one loop per
   move (`cape/pack_cape.sh`: walk 49+40, sit 0+80 → 20, run 61+60); strides scaled from the petal
   look's (walk 34.6, run 71.2).
   *Its Noble outfit (2026-11-05, commit `f01364e0`):* the owner's second reference for Xiaobai (the
   Noble sheet: lilac flower headpiece with gold bead strands, deep violet capelet with gold
   embroidery, violet crystal clasp). Holopix redrew the dog and left fur over the cape, so the owner
   chose oil-motion: one gpt-image edit of `v2/bare.png` with the Noble reference, only the outfit
   pasted back (`maltese/noble/noble.png`); the gallop key `v2/run-key-fit.png` dressed the same way;
   then three minimax h3 highspeed videos (walk, walk-to-sit, run), no retries. The sit video's
   backdrop went near-black halfway: keyed per frame keeping the eyes and the cape's dark purple;
   the belly-shadow clear was changed to leave purple fabric alone (it had cut the hem). Loops: walk
   43 frames, run 59. Look `noble` in `MALTESE_LOOKS` (GardenCritters.tsx), drawn whole (no Noble
   hat-only or cape-only clips of its own).
   *Its Noble pieces one by one (2026-11-05, Kiro, owner's request):* Xiaobai's closet now holds two
   pieces per shelf, light then Noble: headpiece `golden-circlet`, capelet `midnight-cape`, clasp
   `crystal-spire` (Kiro's pick of catalog ids by likeness; `PET_OWN_PIECES` in `lib/garden-pets.js`,
   now a list per slot, and in `petRing.ts`; **backend change, needs a deploy**). It wears one set at a
   time like the puppy (`malteseLookOfOutfit`: the cape's set wins, else the hat's, else the
   pendant's; `malteseHiddenPieces` marks the other set's pieces "not shown"), and the Noble capelet
   carries its clasp, so a pendant under it adds nothing. Looks `noble-hat`, `noble-necklace`,
   `noble-hat-necklace` (the headpiece cut from `noble.png`, `pieces/cut_noble.py`; the clasp on a
   fine gold chain from one gpt-image edit of `v2/bare.png`, `pieces/cut_necklace.py`; laid onto the
   bare walk, sit and run by `pieces/overlay_noble.py`, packed by `pieces/build.sh` with the bare
   loops), `noble-cape` (its own clips: the Noble painting and gallop key with the headpiece taken
   off, `cape/compose_cape.py`, no paid edit; 3 minimax videos plus one walk retry because the first
   walk's backdrop turned grey and keyed into the fur; walk 41+46, sit 0+80 → 20, run 24+59; strides
   from the measured paw slide, 30.6 and 66.9), and `noble` (capelet and headpiece; since 2026-11-06
   the capelet's clips with the headpiece laid on, `pieces/rebuild_noble.sh`, so its sit matches its
   eat and pat: its own Noble clips from `f01364e0` sat differently and patting jumped at both ends;
   the capelet's loops and strides). All
   in `~/dev/petalpal-motion/maltese/noble/`. Closet icons from its own art (`pieces/make_icons.py`
   → `maltese-noble-*.webp`). Paid this round: 1 gpt-image edit, 4 videos.
   *Xiaobai eats and is patted in every look (2026-11-05, Kiro, owner's request: the patting hand
   must be the golden's hand):* `MALTESE_ACTIONS` in `puppyLooks.ts` (13 looks × eat, pat;
   `assets/garden/critters/maltese-actions/`), played from its ring menu like the puppy's, hearts
   after. Everything is in `~/dev/petalpal-motion/maltese/actions/` (`build.sh` makes all 26 sheets
   from the clips). Each clip starts and ends on the look's held sitting frame (`f077` of its sit clip,
   `find_sit.py`, `make_bases.py`); eating's first frame is that frame with only the bowl taken from a
   gpt-image edit (`paste_bowl.py`: the golden's cream bowl with the lilac band). The pat prompts use
   the golden's hand words unchanged (`write_prompts.py`). Own clips: bare, light capelet, petal,
   Noble capelet (eat and pat); the whole Noble look's eat and pat are the capelet's with the
   headpiece laid on (its own Noble eating clip is no longer used). Pieces laid on with a frame-to-frame head and
   throat track (`maltese_track.py`, after the golden's `action_track.py`; `--probe`, `--track`,
   `--hand` added to `overlay_maltese.py` / `overlay_noble.py`): light and Noble hat/necklace/both on
   the bare clips, light hat and bow (no ribbon) on the light capelet's, and **Noble's pat is the
   Noble capelet's pat with the headpiece laid on**: both of Noble's own pat clips painted a long lace
   sleeve hanging down the frame, unlike the golden's hand (`noble-pat*.mp4`, not used). For these
   clips only, the flower clip and Noble headpiece layers have the patch of ear fur cut with them
   removed (`clean_layers.py` → `*-action.png`): it showed when the ear swung into the bowl. Packed
   at the sit sheets' scale (`action_sheet.py`, 8 columns, 71 frames at 12 fps; cells cut from video
   x 110, 80 px left of the sit sheets' crop, because the capelets' tails reach past it: eat 319 × 230,
   pat 393 × 239 reaching the frame's top right for the hand, its sheer lace's green taken off;
   `anchorX` 172 is the sit cell's centre; the belly shadow cleared left of the bowl). Its
   `--hand-match` (skin tinted to the golden's hand, `hand_colour.py`) is not used: its mask caught
   the apricot ear beside the hand and turned it green. Retakes: the light capelet's and petal's first pat clips had a
   different hand (level from the right, a solid sleeve; stroking the chin), so they were redone with
   the hand's way in pinned down (`write_pat2.py`, seed 7). Paid: 5 gpt-image edits, 14 videos (10 +
   3 pat retakes + 1 more Noble pat retake that also failed: black backdrop, sleeve again). The
   preview page has eat and pat for the Maltese (`critters-test`, not with "with puppy"). Committed
   on `feat/maltese-noble-pieces` (after the Noble pieces commit `b617fe2d`), not pushed. Next:
   the owner reviews it in the preview; if Noble should get a pat clip of its own (now the capelet's
   pat with the headpiece laid on), that needs a new prompt approach (both tries painted a hanging
   sleeve). Do not put the `noble-pat*.mp4` clips or `--hand-match` back.
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
