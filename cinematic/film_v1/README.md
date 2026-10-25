# PetalPal cinematic film: first cut v1 — REJECTED (character art)

> **2026-10-20: the owner rejected the character designs. The first cut and every character keyframe/shot were moved to `REJECTED_character_art/` (see REJECTED.md). Paid generation is locked (`PAID_GENERATION_LOCKED`). Do not reuse any rejected art. Active plan: `artdirection/PRODUCTION_PLAN_v2_first_person.md` (first-person only, no protagonist).**

**Not approved; for owner review.** `edit/PetalPal_FirstCut_v1.mp4`: 59.7 s, 1920×1080, 24 fps, H.264 + AAC, about −14 LUFS.
A smaller review copy is `edit/PetalPal_FirstCut_v1_review.mp4`.

Approved references (unchanged originals): the approved fairy master `Resources/fairy/production/master/fairy_first_approved.png`, K1, K2, Kling 03. The generated fairy A / girl A designs are REJECTED.

## Edit decision list
| Starts | Shot | Source |
| --- | --- | --- |
|  0.00 s | 01 rain | `shots/V01.mp4` 0.0–3.50 s |
|  3.50 s | 02 girl at desk | `shots/V02.mp4` 0.4–4.40 s |
|  7.50 s | 03 lights | `shots/V03.mp4` 0.6–3.10 s |
| 10.00 s | 04 invitation | `shots/V04r.mp4` 1.0–4.20 s |
| 13.21 s | 05 touch, fairy | `shots/V05.mp4` 1.6–4.60 s |
| 16.21 s | 06 take my hand | `shots/V06a.mp4` 1.5–5.04 s |
| 19.75 s | 07 pull-through | `shots/V07a.mp4` 0.0–5.04 s |
| 24.79 s | 08 passage (K03) | `vfx/K03orb.mp4` 0.0–5.25 s |
| 29.62 s | 09 garden entrance | `shots/V09a.mp4` 0.0–3.00 s |
| 32.62 s | 10 wide garden | `shots/V10.mp4` 0.5–3.60 s |
| 35.71 s | 11 journal | `vfx/S11.mp4` 0.0–2.60 s |
| 38.29 s | 12 words to seed | `vfx/S12.mp4` 0.0–1.75 s |
| 39.71 s | 13 crocus blooms | `shots/V13.mp4` 0.0–3.50 s |
| 43.21 s | 14 fairy stays | `shots/V14.mp4` 0.5–3.00 s |
| 45.71 s | 15 mailbox | `shots/V15.mp4` 0.3–2.80 s |
| 48.21 s | 16 a letter for you | `shots/V16.mp4` 1.5–4.00 s |
| 50.71 s | 17 the letter | `shots/V17.mp4` 0.5–3.00 s |
| 53.21 s | 18 morning | `shots/V18.mp4` 1.3–4.80 s |
| 56.21 s | 19 title | `vfx/S19.mp4` 0.0–3.50 s |

## How it was made
- Keyframes: Nano Banana Pro edit with the approved character sheets, invitation, K1/K2 and treehouse (`tools/keyframes.py`).
- Shots: Kling O3 Pro reference-to-video with the fairy or girl attached as an element; Kling 3.0 Pro for shots without characters (`tools/shots.py`).
- Composites (`tools/vfx_*.py`): handwriting written behind the tracked pen tip; words to golden seed; the fairy's light leading through Kling 03 into V09a; end title keyed from the approved title still.
- Music: ElevenLabs Music `audio/score_v2.mp3`. Sound effects: MMAudio over the cut. Mix: `tools/mix.sh`.
- Assembly: `tools/edit.py` (cuts, three dissolves, light grain, fades).

## Spend (list-price estimates; the fal dashboard shows the exact amount)
$17.84 of the $30 cap. Every paid call is in `ledger.json`.
