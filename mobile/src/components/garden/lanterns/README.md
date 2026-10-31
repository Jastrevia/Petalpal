# Garden lantern placement

`placements.json` is the authoritative owner-approved world-coordinate roster: 12 ground lanterns and
4 lotus lanterns. Each sprite is reused for every instance of its kind. The anchor
is the ground contact/waterline; rotation and scale pivot around that anchor.

For a credential-free preview, run the existing synthetic preview from `mobile`:

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_OFFLINE='1'
$env:LOCAL_PREVIEW_PORT='8281'
npm run web:local
```

Open `http://127.0.0.1:8281/lantern-preview` and use the synthetic sign-in shown by
the preview. Select **Edit 16 lanterns**. The list focuses any of the 16 IDs,
including ones outside the viewport. Drag its circular base handle, change scale
or rotation, and **Save all placements**. Pan on the map away from handles; the
existing +/− controls zoom. Day/night/auto uses `WorldTimeProvider`, including its
evening lighting condition. No separate clock exists.

AsyncStorage saves only these transforms under `petalpal.dev.lantern-placements.v1`.
Loading validates the complete fixed roster and terrain footprints. Invalid data
falls back to approved defaults with a visible notice. Storage errors are shown;
failed saves never report success. Refresh preserves saved transforms, without
redistributing them. The placement editor and local overrides are restricted to the development-only
`/lantern-preview` route. Every normal Garden uses `placements.json`, including in
development: stale local storage never changes its transforms. Refresh, login,
server restart and future builds all use those same exact configured numbers.
`approved-placements.backup.json` preserves the owner-provided export before finalization.
No deployment has been performed.

Use the preview time controls, then **Open normal Garden**, to inspect the actual
Garden with the same shared time state. This link performs client navigation.

All lanterns share the Garden camera transform. Light fades run only when the
shared lighting condition changes; there are no new clocks, particles or repeating
light animations. Lotus reflections are included in that same fade. Swing and
Treehouse rendering code is unchanged.

Validation: `npx tsc --noEmit` and
`node --test test/lanternPlacement.test.mjs test/fairySwingInteraction.test.mjs test/gardenHudLayer.test.mjs`.
Finalization QA used the actual `/` Garden route on the synthetic local server:
no editor controls, shared daytime/nighttime/daytime activation, zoom and pan.
Day and night screenshots use the same initial Garden camera framing.
Eight focused checks pass, including exact backup/configuration equality and
normal-mode refusal to read or write editor storage. TypeScript passes.
Production deployment and physical-device performance have not been tested.
Graphify update could not run because its CLI is unavailable.
