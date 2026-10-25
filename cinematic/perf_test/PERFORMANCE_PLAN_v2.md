# Fairy performance v2: analysis and plan (no paid generation; both approved endpoints unchanged)

## Why take 1 behaved as it did
A start/end video model only knows the two ends. Everything between is its own invention, so it:
- spent time holding the start pose and then rushed (it has no notion of our beats);
- chose a generic "take-off" (arms out, legs apart) because nothing showed it a better posture;
- routed the arm by the shortest path (down past the thigh) to reach the end pose;
- let the face and skirt drift mid-move, where the endpoints no longer constrain it.

## What prompting alone can fix (partly)
- Eye contact held throughout, restrained arms, legs together, "no pause at the start": usually improves, not guaranteed.
- A smile that grows: limited. Pose A already smiles slightly, so there's little room to grow (see the option below).
- Spreading the timing: weak. Kling follows timestamps loosely; a second take with the same two endpoints would likely
  repeat the hold-then-rush pattern.

## What needs intermediate keyframes
- **Take-off posture:** a drawn mid-flight key (M2) defines the elegant transition: legs together, arms close, body
  inclined, petals streaming.
- **Arm arc:** M2 shows the right forearm already forward in front of her chest, so the arm can't swing past the thigh.
- **Costume and identity mid-shot:** M2 carries the long trailing panels and the master face (transplanted), adding a
  third identity anchor in the middle of the move.
- **Timing:** each segment is pinned at both ends, so the segment lengths set the pacing. This is the strongest lever.

## Is 5 seconds enough?
No. Notice → smile → prepare → soft take-off → glide → reach is six beats; done gracefully they need about **7 s**.
Proposed: two chained segments, Pose A → M2 (4 s) and M2 → Reach (3 s).

## Precise timeline (7.0 s, 24 fps, 168 frames)
| Time | Expression | Body / wings / costume |
| --- | --- | --- |
| 0.0–0.8 | Calm, eyes on the viewer | Gentle breath; wings slowly open and close once; hair strands drift |
| 0.8–1.6 | "Notices": a tiny lift of the head, eyes soften and brighten | Hand at her chest relaxes slightly; weight settles |
| 1.6–2.4 | Smile gently blossoms; slight head tilt | Left hand drifts down to her side |
| 2.4–3.0 | Smile held, eyes on the viewer | Preparation: small knee dip, inhale (shoulders rise), wings lift high |
| 3.0–4.0 | Same | **Soft take-off:** heels rise, toes leave last, legs stay together, slight forward lean; one downbeat lifts the petal panels; the right forearm comes forward to chest height. Ends exactly on **M2** |
| 4.0–5.4 | Warm, eye contact held | **Glide** toward the camera (she grows in frame); slow, strong wing beats; panels stream back |
| 5.0–6.4 | Smile softens into invitation | **Reach arc** in front of her body: elbow leads, then forearm and wrist; the palm opens last |
| 6.4–7.0 | Same | Small deceleration and settle; final frame exactly the approved Reach |

## New asset: keyframe M2 (mid-glide), for your approval before any video
Floating, body inclined forward about 20°, legs together trailing slightly back, toes pointed; left arm soft at her
side; right forearm forward at chest height, palm beginning to turn up; wings mid-downbeat; long petal panels streaming
back. Head at the master's angle, eyes to the viewer, gentle smile (so the master face can be transplanted). Size
about midway between Pose A and Reach.
Made like the Reach: one image (master + Pose A + Reach as references, plus a free blocking sketch), then a free face
transplant and costume check.

## Joins and risks
- Joining two segments at M2 can cause a slight speed change at the join. Both prompts state "already in motion", and
  if needed I re-time a few frames around the join locally (optical-flow re-timing, not a crossfade).
- Even with three anchors, mid-motion frames can still soften the face or simplify gold details. A free per-frame
  master-face lock remains available, because her head stays near the master angle throughout.
- Kling outputs about 1928×1072; mid-motion frames are softer. Sharpening and upscaling come later.

## Optional: making the smile visibly grow
Use the neutral-face sibling of Pose A (identical transplant without the 1 px mouth lift) as the start frame, and the
smiling Pose A face for M2. This would replace the approved start image with its unsmiling twin; it needs your approval.

## Cost (fal list prices)
| Item | Cost |
| --- | --- |
| M2 keyframe (1 image) | $0.15 |
| Reserve: masked hand/face fix on M2, only if needed | $0.15 |
| Segment 1, Pose A → M2, 4 s Kling O3 | $0.45 |
| Segment 2, M2 → Reach, 3 s Kling O3 | $0.34 |
| **Total** | **≈ $0.94 (≈ $1.09 with reserve)** |
Budget: about $19.15 of $30 used (ledger), so $10.85 remains. Staged approvals: M2 first, video only after you approve M2.
