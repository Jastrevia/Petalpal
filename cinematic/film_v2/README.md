# PetalPal film v2: First Cut v2 (first person, free build)

`edit/PetalPal_FirstCut_v2.mp4`: 60.0 s, 1920x1080, 24 fps, H.264 + AAC, -16 LUFS. Built with no paid generation.
Edit decision list: `edit/edl_v2.json`. Storyboard: `edit/FirstCut_v2_storyboard.jpg`. Budget proposal for the remaining
improvements: `PRODUCTION_BUDGET_PROPOSAL.md` (paid generation stays locked).

## Rules kept
- First person throughout; only the viewer's hands (PetalPal's own illustrated palm art) appear.
- The fairy on screen is the accepted A01 shot (unmodified) and the approved Reach key pose; elsewhere she is her light.
- Approved artwork is never overwritten: every derived image (upscales, composites) is a new file in this folder.

## Folders
| Folder | Contents |
| --- | --- |
| `accepted/` | A01 fairy opening, ACCEPTED (owner, 2026-10-21) + ACCEPTED_SHOTS.md register |
| `shots/` | One script and one mp4 per new shot (S02 phone, S06 touch, S07 swirl, S09a/b garden, S10 journal, S12 crocus, S13 mailbox, S14 letter, S15 dawn) |
| `tools/` | fx.py (compositing), phone.py (phone UI), esrgan_np.py (Real-ESRGAN x4 in numpy, official weights), sound.py (procedural SFX), assemble.py, mix.sh, review_sheet.py |
| `sr/` | Local 4x upscales of approved/app art used as plates (K2, Mailbox, invitation card) |
| `audio/` | sfx_proc.wav (procedural accents for this cut) |
| `edit/` | Picture-only assembly, final cut, EDL, storyboard |
| `fonts/` | OFL / Apache Google Fonts used for on-screen writing (Caveat, Dancing Script, Cormorant Garamond) |

## Reused (unchanged) sources
V01 rain, V13 crocus bloom, K03orb (Kling 03 with light), S19 title, score_v2, MMAudio sfx_a/sfx_b (film_v1); approved
K1/K2; approved Reach end frame; PetalPal app art (invitation card, palms, Mailbox scene, heirloom paper, letter paper, garden
art, crocus logo from the title still).
