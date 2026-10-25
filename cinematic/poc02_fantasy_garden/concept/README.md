# POC02 concept frames: the Hidden Valley look

Four concept frames set the film's visual identity before any 3D, animation or video work.
This folder contains specifications, prompts and references only; there are no images yet.
Claude cannot generate images in its session, so the frames are made in an external image tool
(your Codex `image_gen` workflow, optionally Midjourney for the look test). Nothing here is a placeholder render.

Full specifications, rationale and review rubric: the "v4 · Concept frames" tab in the production doc.

## Contents

| Path | What it is |
| --- | --- |
| `prompts/frame2_grand_reveal.txt` | Complete prompt for the hero frame (generate first) |
| `prompts/frame1_invitation_passage.txt` | Complete prompt, Frame 1 |
| `prompts/frame3_fairy_treehouse.txt` | Complete prompt, Frame 3 |
| `prompts/frame4_every_feeling_blooms.txt` | Complete prompt, Frame 4 |
| `prompts/00_world_bible.txt`, `99_closing.txt` | The shared opening and closing blocks (already included in each frame file) |
| `prompts/midjourney_variants.txt` | Short variants for the Midjourney look test |
| `reference/motif_board.png` | Approved PetalPal motifs and palette, for design reference only |
| `reference/SOURCES.md` | Which approved files the board was built from (read only, unchanged) |
| `candidates/` | Save every generated candidate here |
| `approved/` | Approved frames go here; they become the reference for all later work |

## Order of work

1. Frame 2 first: 4-8 candidates in Codex `image_gen` (attach the motif board), optionally 4 in Midjourney.
   Save as `candidates/f2_codex_01.png`, `candidates/f2_mj_01.png`, ...
2. Ask Claude to review: it scores every candidate against the rubric and writes the exact edit prompts.
3. Refine and approve Frame 2; copy it to `approved/frame2_grand_reveal.png`. Use the same tool from here on.
4. Frames 1, 3, 4: attach `approved/frame2_grand_reveal.png` and the motif board; 4 candidates each; same review loop.
5. Consistency pass across all four, then upscale to at least 2560 px wide, 16:9.

## Codex instruction you can paste

> Generate 4 candidates using the prompt in `cinematic/poc02_fantasy_garden/concept/prompts/frame2_grand_reveal.txt`
> (everything below the `# ---` line) with `cinematic/poc02_fantasy_garden/concept/reference/motif_board.png` attached as a
> design-motif and palette reference only. Landscape, largest size. Save them to
> `cinematic/poc02_fantasy_garden/concept/candidates/` as `f2_codex_01.png` to `f2_codex_04.png`. Do not edit any other file.

No app code, approved character asset or POC01 file is touched by this folder.
