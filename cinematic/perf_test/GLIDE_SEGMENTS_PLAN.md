# Fairy glide: two pinned segments, 3.5 s + 3.5 s (staged; paid generation LOCKED, nothing generated)

## Pinned frames (same 2752x1536 canvas, shared paper; verified in `staging/alignment_report.json`)
| Frame | File | Source | Eyes (px) | Eye distance | Head roll vs master |
| --- | --- | --- | --- | --- | --- |
| Start, 0.0 s | `start_frame_poseA.png` (unchanged) | approved Pose A | (1905, 225) | 61.5 | -2 deg |
| Middle, 3.5 s | `mid_frame_midglide.png` (new) | approved Mid-Glide, multiply-blended onto the shared paper exactly like the start frame; not resized, moved or redrawn | (1838, 281) | 72.7 | 0 deg |
| End, 7.0 s | `end_frame_reach.png` (unchanged, byte-identical to approved Reach) | approved Reach | (1766, 388) | 118.5 | 0 deg |

- Middle frame vs approved Mid-Glide: background replaced by the shared paper; her pixels change only by the paper-white
  ratio (mean 1.4 levels, 99% within 6 levels of 255). Approved file `approved/fairy_midglide_approved.png` untouched.
- Paper: start and middle share identical grain (mean diff 0.03); the end frame keeps its own grain (mean diff 1.8
  levels, p99 5); same median colour (253, 245-246, 237).

## Join inspection (middle frame)
- Head moves screen-left in two even steps (x -67 then -72 px) and her head angle never changes.
- **Approach rate jumps 2.9x at the join**: she grows x1.18 in segment 1 and x1.63 in segment 2 (eye distance 61.5 ->
  72.7 -> 118.5). Segment 1 is mostly the take-off and segment 2 the glide toward the viewer, so the pacing is right, but
  Kling eases into and out of pinned frames and may produce a slight settle at 3.5 s. Mitigations: both prompts say
  "already gliding / no stop"; and because each segment is generated at 4 s and conformed to 3.5 s locally, the
  conform can use a speed curve that removes any settle at the join (free optical-flow retime, never a crossfade).
- **Right hand** (in eye-widths from her eyes): Pose A (+1.7, +2.5) at her chest -> Mid-Glide (+1.2, +5.6) in front of
  her waist -> Reach (-5.1, +3.6) extended at chest height. So the approved Mid-Glide makes the hand lower about 3
  eye-widths during segment 1 (elbow relaxing, palm turning up), then rise 2 while the forearm unfolds. Lowest point is
  210 px above the skirt hem: it never approaches the thigh. On screen, segment 2 moves the hand ~780 px leftward in
  front of her body (mostly her body turning toward the viewer as the arm extends): the highest-risk motion.
- Lead foot slows (232 -> 86 px/s): legs swing back during take-off, then trail. Left hand drifts down steadily.

## Generation (not run; needs your approval of a per-segment allowance)
Kling O3 Pro reference-to-video, start + end frame pinned, element = master (front) + approved Pose A, Mid-Glide and
Reach (references), audio off, 16:9. Kling accepts whole seconds only (3-15 s), so 3.5 s cannot be requested directly.

| Segment | Frames | Generated | Final | Price |
| --- | --- | --- | --- | --- |
| 1 | Pose A -> Mid-Glide | 4 s | conformed to 3.5 s | 4 x $0.112 = **$0.448** |
| 2 | Mid-Glide -> Reach | 4 s | conformed to 3.5 s | 4 x $0.112 = **$0.448** |
| Total | | 8 s | 7.0 s | **$0.896** |

fal list price, checked 2026-10-21: "$0.112 (audio off)" per second. Ledger: about $19.30 of $30 spent; after both
segments about $20.20. One take per segment, no retries. Prompts are in `staging/generate_segments.py`.
Alternatives: 3 s + 4 s native ($0.784, timing 3 + 4, no conform) or 4 s + 4 s played at native speed ($0.896, 8 s).
