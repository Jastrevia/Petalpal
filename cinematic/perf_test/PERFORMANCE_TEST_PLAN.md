# Fairy performance test: plan and cost (awaiting owner approval; paid generation LOCKED)

Goal: one continuous 5 s shot. She notices the viewer, smiles softly, floats toward the camera, and extends her open
palm in invitation. No crossfades, no layer puppetry.

## Endpoints (free, prepared)
- **Start:** `start_frame_poseA.png`. Approved Pose A (unchanged file), multiply-blended onto the end frame's own
  paper, so both frames share one background. She is farther away (her face is about half its end size), slightly
  left of where she ends.
- **End:** `end_frame_reach.png`. The approved Reach key pose, byte-identical.
- Both use the master face (Pose A by transplant, Reach by transplant), so identity is pinned at both ends of the shot.

## Tools available on your fal key (prices checked 2026-10-20)
| Option | How it anchors identity | Cost |
| --- | --- | --- |
| **A. Kling O3 Pro reference-to-video (recommended)** | Start frame + end frame, plus the fairy as a character "element" (front = master; references = Pose A and Reach) that guides the in-between frames | 5 s × $0.112 = **$0.56** |
| B. Kling 3.0 Pro start/end frame | Start + end frame only | 5 s × $0.112 = $0.56 |
| C. Veo 3.1 first/last frame | Start + end frame; smoother acting, but it drifted from the keyframes in our earlier test | 6 s × $0.20 = $1.20 (4 s: $0.80) |

Recommendation: ONE take with option A ($0.56). Optional comparison take with option B (+$0.56, total $1.12).
Remaining budget: about $11.41 of $30 (ledger estimate).

## Direction given to the model (summary)
- A slight downward settle and a breath, her eyes brightening as she notices the viewer.
- A subtle smile.
- Anticipation: a small dip, then wings beat as she glides forward.
- Her weight leads with the chest; her legs drift back into the floating pose.
- She raises her right arm from the shoulder and opens her palm, settling into the end frame on the final frames.
- Gentle continuous wing movement; hair and petals follow through. The camera is static.
- Negative prompt: morphing, flicker, extra fingers, identity change, crossfade.

## After generation (free)
- Frame-by-frame identity check against the master: face, eyes, hair, crocus side, wings, dress, shoes.
- Motion review: continuity, anticipation and follow-through, hand anatomy, any morphing.
- If the face drifts mid-shot, a free per-frame master-face lock is possible (her head stays near the master angle
  throughout), shown to you as a separate version.

## Honest limits
- "Notices the viewer" will be subtle. Both approved poses already have eye contact, and a look-away key pose would need
  eyes that aren't in the master, so it couldn't use the exact face transplant.
- Mid-motion frames can soften the face, change wing shapes, or simplify the dress gold; fast arm movement risks the hand.
- This is a plain-paper test. Placing her into film backgrounds is a later, separate step (start and end frames
  composited onto the scene plate before generation).
