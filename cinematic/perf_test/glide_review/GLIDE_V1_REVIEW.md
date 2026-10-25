# Glide v1 review (two paid Kling O3 Pro segments; paid generation re-locked)

Spend: glide_seg1 $0.448 + glide_seg2 $0.448 = $0.896 (cap $0.90). One take each, no retries. Ledger total ~$20.20 of
$30. Allowance retired as `film_v1/PILOT_ALLOWANCE_glide_segments_1.USED.json`.

## Files
| File | What |
| --- | --- |
| `../glide_seg1.mp4`, `../glide_seg2.mp4` (+ read-only copies in `../glide_originals/` with SHA256SUMS.txt) | Original Kling outputs, unchanged. 1928x1072, 24 fps, 97 frames (4.04 s) each |
| `glide_v1_8s_join.mp4` | All of seg1 + seg2 minus its first frame (the shared Mid-Glide keyframe appears once). 193 frames, 8.04 s. Frames match the originals within 0.22 levels (encode only) |
| `glide_v1_7s_retimed.mp4` | Separate comparison: 168 frames, 7.00 s, made only by re-timing existing drawings (see below) |
| `GLIDE_V1_review_board.jpg` | Arm path key drawings, face strip, speed curves, read-outs |
| `glide_seg1_drawings.jpg`, `glide_seg2_drawings.jpg`, `glide_seg*_arm.jpg`, `wings_sheet.jpg`, `face_strip_drawings.jpg`, `join_frames_pm10.jpg`, `curves.png`, `speed_8s_vs_7s.png` | Inspection sheets |

## Findings
- **Cadence.** Kling rendered both segments "on threes": a new drawing every 3rd frame (8 drawings/s), with
  near-identical frames between. Every region (head, wings, arm, legs) steps together. It reads as limited TV-anime
  animation rather than fully fluid motion. (Performance test 1 was full 24 fps; nothing in our prompt asked for this.)
- **Join.** Frame-continuous, no jump: the two keyframe frames differ by 1.2 levels. But there is a **~0.5 s stall**
  (frames 87-99): seg1 settles into the keyframe and seg2 waits before its first new drawing. Wings and hair stop too.
  This is a visible hesitation in the 8 s version.
- **Identity.** Face holds well (master-face match mean 0.91). Weakest during take-off, 1.0-2.1 s: head rolls ~10 deg
  and the face reads rounder and younger (match 0.68-0.80), then recovers. A pointed ear tip shows in parts of both
  segments (visible in the approved Reach, painted out in Pose A and Mid-Glide), so it comes and goes. Crocus side,
  hair colour and style are consistent.
- **Body.** Seg1: about 1.3 s of breathing and wing opening in place, then a smooth take-off (1.4-2.5 s) into the
  glide, legs together, no superhero pose. Seg2: slow start, approach mostly 1.2-2.8 s into the segment, soft settle on
  Reach. Overall a believable approach.
- **Right arm.** Never near the thigh. Seg1: hand leaves the chest, both hands briefly meet at the chest (f45-51), the
  right palm lifts forward at chest height (f57-75), then lowers to the waist for the keyframe; the left arm also swings
  out and back (busier than asked). Seg2: **not the direct unfold you specified**. The forearm folds across her waist
  with a limp hand (f126-141), rises to her left shoulder (f144-150), crosses the chest (f153-165), then turns out and
  extends to Reach (f168-192): a wind-up arc.
- **Hands.** Seg1 mostly clean; the two hands merge at the chest around f45-51. Seg2: hand smeared and oversized
  around f153-165, fingers blurred around f174-180. Final Reach hand correct.
- **Wings.** No frantic flapping. They open quickly at the very start (2 drawings) and then mostly hold their shape
  with small shifts; little visible supporting beat during the glide.
- **Dress and hair.** Consistent; petal panels trail and follow the motion; gold vine detail softens in mid-motion
  frames.

## 7 s comparison version
No frame invented, blended, interpolated or held longer than generated:
1. The 13-frame join stall is cut to one normal 3-frame exposure (frames 95, 96 = pinned keyframe, 97).
2. 15 drawings, spread evenly, are shown for 2 frames instead of 3 (frame order in `retime_7s_order.json`).
The stall disappears, but the slow-in/slow-out around the keyframe remains (about half normal speed for ~0.4 s),
and the cadence now mixes 2- and 3-frame drawings. No artifacts by construction; judge the rhythm by eye.

## Verdict
A continuous approach and invitation with identity held and no broken join, but not yet the graceful performance asked
for: the seg2 arm wind-up, mid-motion hand smears, the stall at the join (8 s) and the on-threes cadence.
