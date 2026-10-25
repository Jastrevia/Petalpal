# Mid-Glide key pose: review (awaiting owner decision; nothing approved yet)

Paid: exactly one Nano Banana Pro edit, label `midglide_1`, $0.15 (ledger entry 61). Paid generation re-locked
(`film_v1/PAID_GENERATION_LOCKED`; allowance renamed `PILOT_ALLOWANCE_midglide_1.USED.json`). No retries, no
corrections, no video. Approved assets (master, Pose A, Reach, start/end frames) are unchanged.

## Files
| File | What |
| --- | --- |
| `midglide_1.png` | Raw paid candidate (2752x1536) |
| `midglide_1_clean.png` | Free: stray blocking-sketch text in the empty top-left removed (blank paper cloned from below); invented pointed ear tip replaced with hair (same rule as Pose A / C) |
| `midglide_1_facefix_native.png` | Free: the above plus master-face transplant (jaw warp to master proportions, skin-tone match, smile 1.2 as Reach). **Proposed Mid-Glide** |
| `../MIDGLIDE_comparison_board.jpg` | Master, Pose A, raw, corrected, Reach; full figure and face |
| `../MIDGLIDE_sequence_board.jpg` | The three frames on the shared canvas plus an onion skin |
| `../facefix/poseA_NEUTRAL_free.png`, `../../perf_test/start_frame_poseA_neutral.png` | Free neutral-mouth sibling of Pose A (82 px mouth box only). Separate asset; approved Pose A not replaced |

## Brief check
Lean ~20 deg, floating: yes. Legs together, trailing, toes pointed: yes. Wings open behind her: yes. Long petal panels
streaming back: yes. Left arm relaxed by her side: yes. Right forearm forward, palm opening upward: yes, but at
waist / star-clasp height rather than chest height. Head at the master angle, eye contact, subtle smile: yes (after the
free transplant). No take-off pose: yes. Crocus on her right (screen-left), gold vine bands, necklace, star clasp, gold
heels with petal toes: yes. Pointed ear: removed. Earrings: none.

## Sequence assessment (Pose A -> Mid-Glide -> Reach)
- Head angle identical in all three; crocus side consistent; same arm (her right) carries the gesture throughout.
- Head path x 1906 -> 1837 -> 1766 (even), y 229 -> 281 -> 388; body upright -> ~20 deg -> ~45 deg; feet trail
  screen-left monotonically; wings open progressively. Reads as one continuous approach.
- Scale (eye distance) 52 -> 73 -> 117 px: x1.40 over 4 s, then x1.60 over 3 s. The approach roughly doubles its rate
  at the join (log-rate 0.084/s -> 0.157/s). A free fix: stage the Mid-Glide ~1.13x larger (eye ~83 px) for an even
  rate, or set segment lengths ~3.5 s + 3.5 s.
- Right hand: chest -> front of the waist (segment 1, ~320 px down) -> out to screen-left (segment 2, ~960 px sweep in
  front of her torso in 3 s). This sweep is the main risk: the hand passes in front of her body, where perf test 1
  blurred. Prompt it as "the forearm unfolds outward from in front of her waist toward the viewer".
- Paper tone differs by ~2 levels (251,245,239 vs 253,246,238); match with a per-channel gain when staging.
