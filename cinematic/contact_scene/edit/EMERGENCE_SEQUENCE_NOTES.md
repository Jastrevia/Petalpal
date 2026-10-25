# Emergence sequence: V3.3 (2026-10-22)

Paid: 4 Kling O3 Pro takes, one each with no retries, $1.79 (cap $1.90). Allowance `emergence_takes_1` is retired, `PAID_GENERATION_LOCKED` is in place, and the ledger is about $25.43 of $30.

## Contact scene timeline (Contact_Scene_v3_3.mp4, 32.5 s)

| Time (s) | Shot |
|---|---|
| 0.0–3.5 | Rainy night (V01) |
| 3.5–8.5 | Phone notification and tap. The one invitation opens on screen (take A, fixed). |
| 8.5–11.5 | T1: inside the screen the view pulls back. The invitation is revealed in her hand as she flies toward the viewer in the wisteria garden. |
| 11.5–14.3 | T2: continuous forward flight through the screen glass, from approved S1 to approved S2 v2 (free animation, see below). |
| 14.3–18.3 | T3: her hips, skirt and legs slide out through the screen and she glides to her place beside the phone, reaching toward the viewer. |
| 18.3–22.3 | The approved magical hand contact (take D, fixed; unchanged). |
| 22.3–27.3 | T4: she turns, flies into the screen and away down the garden path. The camera follows her to the glass. |
| 27.3–28.1 | Pass-through of the screen. |
| 28.1– | Approved K03orb passage. |

The full film is PetalPal_Film_V3_3.mp4, 57.5 s. Everything after the passage is the same as V3.2.

## Joins
- Every take was pinned to the previous shot's last frame, and the duplicate frame is dropped.
- There are no crossfades, dissolves or holds inside the scene.
- The measured difference at each join is at the level of the takes' own frame-to-frame motion and encoding noise.

## T2: why the built animation is used
- The generated T2 (kept unmodified as takes/emerge_T2.mp4) crosses the screen well for 17 frames. Then it flies her at the camera, loops around and goes back INTO the screen to reach the end frame.
- It also leaves through the side of the phone, not over the top, so no frame of it joins T3 cleanly.
- It was replaced, at no cost, by an animation built from the SAME fairy artwork as the approved S1 and S2 v2. It starts exactly on S1 and ends exactly on S2 v2:
  - A smooth path, with growth and forward tilt.
  - The screen plane sweeps over her from head and wing tips back to the hips. Parts that have crossed are drawn in the room; the rest is visible only inside the opening.
  - Her legs swing back into the garden.
  - Wing beats, skirt flutter and a slight bob.
  - Light flows along the screen edge and along the crossing line on her body.
  - Grain and colour are matched to the neighbouring Kling frames, and the residual texture difference fades out over 10 frames at each end.
- Tools: tools/emerge_bridge.py and tools/bridge_residual.py.

## Other free fixes
- T1 and T3: Kling's card lettering drifted ("PexalPal"). The paper was cleaned and the exact lettering tracked onto the card (tools/fix_emerge_cards.py), with her fingers kept in front. In T1 the lettering fades into the card's own as it becomes too small to read.
- Pass-through: a tone match from T4's last frame relaxes into K03orb's own grade.
- Sound: tools/sound_v3_3.py (wings, a glassy shimmer at the crossing, chimes, hand-contact chord, whooshes into the portal) and tools/mix_v3_3.sh (score stretched to 57.5 s, beds re-anchored, −16 LUFS).

The original takes are untouched; their checksums are in takes/EMERGE_STREAM_MD5.txt.
