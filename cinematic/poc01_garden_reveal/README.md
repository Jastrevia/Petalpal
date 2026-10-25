# POC 01 — Garden reveal (Blender reconstruction test)

A 6.25-second camera move (150 frames at 24 fps) that tests one question: can a Blender reconstruction built
from the approved PetalPal garden art reach the film's cinematic bar? It is a test, not a film shot, and
nothing here changes the app.

The camera starts low among the crocuses on the south bank, crests the bank lip, skims across the turquoise lake,
and climbs to 26 m to reveal the waterfall (top centre), the pavilion island (lower right) and the treehouse (left).

## Run it (Windows)

1. Blender 5.2 LTS must be installed (it was used for earlier fairy work). If it is somewhere unusual, open a
   Command Prompt in this folder and run `set BLENDER=C:\path\to\blender.exe` first.
2. Double-click **`1_preview_stills.bat`**. EEVEE, 960×540, five frames across the shot. This should take minutes.
3. Look in `output\stills_preview\`. `output\build_report_preview.json` lists timings and any Blender
   setting that could not be applied.
4. If the preview is promising, run **`2_final_stills.bat`** (Cycles, 1920×1080, GPU if found), then
   **`3_final_animation.bat`** for all 150 frames. The full animation can take hours.
5. `0_build_only.bat` saves `output\poc01_garden_reveal_preview.blend` without rendering, for inspection in Blender.

Tell Claude when renders exist: they can be read straight from this folder, scored against the criteria below,
and encoded to MP4.

## What is in this folder

| File | Purpose |
| --- | --- |
| `scene_manifest.json` | Every layer, transform, height, camera key, light and water setting. Generated; do not hand-edit. |
| `build_scene.py` | Blender script: builds the scene from the manifest, saves the .blend, renders. |
| `poclib.py` | Geometry and camera maths shared by Blender, the tests and the previs. No Blender dependency. |
| `*.bat` | Windows launchers. `_find_blender.bat` locates `blender.exe`. |
| `tools/make_manifest.py` | Regenerates the manifest from values read in the app source (each value cites its file). |
| `tools/test_poclib.py` | 14 checks against the real asset alphas: clearance, framing, continuity, smoothness. |
| `tools/layout_check.py` | Top-down rebuild of the manifest, compared with the app's own screenshots. |
| `tools/previs.py` | Numpy ray-marcher previs of geometry and camera (not Blender, no lighting quality). |
| `previs/` | Previs stills, contact sheet and the full move as a GIF. |
| `layout_check.jpg` | The top-down layout rebuilt from the manifest. |

Approved assets are only read, from their original paths (`mobile/assets/...`, `mobile/src/components/garden/...`).
Everything generated goes to `output/`, which is git-ignored locally.

## How the scene is built

| Element | Method | Source |
| --- | --- | --- |
| Layout | Every layer placed at the app's own world coordinates, scale, rotation and draw order | `gardenMapLayout.ts`, placement files, `layers.json`, infrastructure manifest |
| Lake | Real refractive water surface with depth absorption over the app's painted lake floor, mirror-tiled as the app does | `ornamental-water-floor.png`, `GardenWaterField.tsx` |
| Islands | Approved land paintings on meshes raised from their own alpha (top 0.55 m above water) | `mobile/assets/garden/land/` |
| Paths, bridges, garden overlays | Flat approved overlays just above the land, in app draw order | infrastructure, environment layers |
| Waterfall | Approved short-r1 bands: pool flat on the water, fall standing at 72°, source on the cliff top | `waterfall-v2-compact-r3.png`, `waterfallV2Proportions.ts` |
| Pavilion, treehouse, arch | Fixed panels perpendicular to the final view, pivoting at each painting's measured base | landmark PNGs |
| Cliffs and far scenery | Matte panels; the part of each painting the app shows on the ground stays on the ground | terrain PNGs |
| Foreground | 90 approved flower and foliage sprites on the bank, turning only about the vertical | `environment/flowers`, `environment/foliage` |
| Light | Physical sun (19° elevation, from WSW), physical sky, volumetric haze, waterfall mist | — |
| Camera | 24 mm fixed lens, focus pull 2.6 m → 30 m, f/1.8 → f/4, 180° motion blur | — |

## Already verified here (before any Blender run)

- **Layout** matches the app: `layout_check.jpg` against app screenshots.
- **14 automated checks pass** (`python tools/test_poclib.py <repo>`): camera clearance ≥ 0.77 m on every frame;
  start on dry ground; skim over open water; pavilion, treehouse (base to top) and waterfall lip inside the final
  frame; waterfall bands continuous; 90 flowers on dry ground; lake-bed tiling; peak acceleration 8.7 m/s² with
  the camera settling to 0.13 m/s.
- **The build script runs end to end** against a stand-in Blender module using the real images: 141 objects,
  about 237,000 vertices, 54 textures, 150 camera keys.
- **Not verified:** the script has not run inside real Blender 5.2. Version-sensitive settings use fallbacks and
  are logged in `build_report_*.json`, but the first real run may need small fixes.

## Acceptance criteria

Status: **PASS** = already met by construction or measured from geometry; **RENDER** = judged on the Blender stills.

| ID | Criterion | Threshold | Status |
| --- | --- | --- | --- |
| L1 | Shadow direction consistent with the sun on every panel, flower and island edge | One direction (from WSW) in all five stills | RENDER |
| L2 | Highlight and shadow range | ≤ 0.5% of pixels clipped (except foam, glints); ≤ 1% crushed to black | RENDER (measurable) |
| L3 | Palette fidelity | Water median hue within ±10° of `#5AA4AB` (184°); wisteria within ±10° of `#A67EB7` (281°) | RENDER (measurable) |
| L4 | Painted light integrates with real light | Panels shade with the sun; none reads as self-lit | RENDER |
| D1 | Aerial perspective | Far backdrop contrast ≤ 70% of the central island's in the final frame | RENDER (measurable) |
| D2 | Depth of field | Frame 1: flowers sharp, backdrop soft. Final: pavilion sharp | RENDER |
| D3 | Parallax | Near/far screen-motion ratio ≥ 3 while moving | PASS: 8.4 (frames 30→60), 4.7 (60→100); 1.8 in the final settle, as expected |
| F1 | Approved assets untouched | Only this folder changes | PASS by design (assets read in place) |
| F2 | Layout fidelity | Landmarks where the app has them | PASS (app coordinates; framing tests) |
| F3 | No texture stretching | No surface over 2% of frame stretched beyond 2:1 | RENDER. Known risk: cliff fold lines |
| F4 | No visible seams or panel edges in the reveal | None in frames ≥ 100 | RENDER. Known risks: cliff fold bottom-left; backdrop tops against sky |
| F5 | Texture sharpness where in focus | ≤ 2 screen px per texel | Pavilion 0.22 PASS; nearest island at frame 100: 3.9 FAIL (soft); lake bed 4 m ahead at frame 60: 13 (seen through water) |
| F6 | Identity | Palette, landmark designs, composition read as PetalPal | RENDER (your judgement, side by side with the app) |
| C1 | Clearance | ≥ 0.35 m every frame | PASS: 0.77 m |
| C2 | Smooth motion | Peak ≤ 10 m/s²; starts and settles at rest | PASS: 8.7 m/s², final 0.13 m/s |
| C3 | No zoom, level horizon | Fixed 24 mm; zero roll | PASS by construction |
| C4 | Motion blur | 24 fps, 180° shutter, no strobing on water or foliage | RENDER |
| C5 | Stability | No card popping or flicker | RENDER |

**Go / no-go.** The reconstruction approach is viable for the film if L1–L4, D1–D3 and C1–C5 pass, and F3–F5
fail only where this README already expects new film-angle paintings. If, in the final stills, the water, light
and landmarks still read as paintings on cards, the approach needs the hero-painting step (or an AI
video-to-video enrichment pass) before it can reach the target. Deciding that is the purpose of this test.

## Production-quality vs provisional

| Production-quality (would carry into the film) | Provisional (stand-ins or estimates, not final art) |
| --- | --- |
| Layout read from the app's own coordinates, scales and draw order | World scale (0.03 m per map pixel), relief heights, lake depth |
| Camera system: waypoints, acceleration-limited timing, clearance and framing tests | Cliff and backdrop panels folded from the app's 3/4 paintings: fold seams; need a new film-angle matte painting |
| Physically based lake: refraction, depth absorption, reflections | No distant horizon or sky painting exists; physical sky only |
| Physical sun, sky, haze; Cycles with depth, mist, normal and cryptomatte passes | Outer basin: the app's masking shaders approximated with feathered planes |
| Reproducible build, tests and previs | Waterfall is static (the app's flow shader is not reproduced); mist is rough |
| | Flowers are flat approved sprites; no depth within a plant |
| | Ground textures soften at close range (F5) |
| | Missing: lotus, koi, stepping-stone detail, swing, tea set, moon bed, floating petals |
| | Water ripples are procedural noise, not the app's painterly ripples |
| | No colour grade or compositing pass (AgX view transform only) |
| | Shot length 6.25 s: a gentle move over this path needs about 6 s. 5 s is possible at about 1 g |

## Findings from the previs

1. **Height-from-alpha relief smears painted cliffs** into streaked walls. Cliffs are therefore standing matte
   panels, which reads far better.
2. **The app paints the treehouse over its cliff**, so any straight fold of that painting into 3D leaves a visible
   line or puts the cliff in front of the tree. The proper fix is a newly painted matte of that cliff from the film
   angle.
3. **The app art has no distant horizon.** Early frames show bare sky above the backdrop panels; a far-distance
   matte painting (mountains, sky) is new artwork the film will need.
4. **Close-range ground is soft** at the app's texture resolution. Low, slow shots near the ground need
   higher-resolution textures or a painted detail layer.

## Regenerate or change the shot

```
python tools/make_manifest.py <repo> scene_manifest.json   # after editing camera waypoints, light or heights
python tools/test_poclib.py <repo>                          # must report 0 failed
python tools/previs.py <repo> previs                        # five stills and a contact sheet
python tools/previs.py <repo> previs/anim --all --size 384x216   # whole move as a GIF
```

These tools need Python 3 with numpy and Pillow. Blender itself only needs `build_scene.py`, `poclib.py` and the manifest.
