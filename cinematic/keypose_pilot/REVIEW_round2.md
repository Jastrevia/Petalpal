# Review package: Pose C v2 (free), Reach paid result and free face correction

Spend this round: one Nano Banana Pro image, $0.15 (ledger estimate). Batch total about $18.44 of $30. Paid generation re-locked.

## Pose C v2 (free; provisional)
- Forehead: the master face is extended over the candidate's higher brows, while the candidate's bangs (dark hair
  connected to the main hair mass) stay on top. The pale band and the double brow are gone.
- Hair: hue shifted −10° and value/saturation matched to the master's hair, so it's less glossy and closer to the master.
- Crocus side, checked by geometry: in the master the crocus is on her right side. In C she has turned toward the left
  of the frame and looks back, so her right side faces away from the camera, toward the back right. The crocus behind
  the bun on that side is therefore correct. Its petals are more violet, with less of the blue-teal base than the master's.
- Mirror cost: the face is the mirrored master, so her slight asymmetry and light direction are flipped.

## Reach (paid, 1 image)
Met:
- The hand is the closest and largest form; the arm is strongly foreshortened behind it.
- Head at the master's angle; no earrings; no pointed ear visible; gold heels with lavender petal toes; costume, wings
  and necklace right; style close to the master.

Not met:
- **Fingertip direction:** the fingers droop down and to the left; the index finger lies along the picture plane
  instead of pointing into the lens.
- **Hand size:** about 2.5–3× her face height (the plan was about 1.8–2×), and it looks slightly rubbery.
- **Arm attachment:** the forearm seems to emerge from the middle of her chest; the shoulder-to-arm connection is unclear.
- **Raw face:** rounder, with larger eyes than the master.

Free correction: master-face transplant at native resolution (the master face is upscaled 2.13× and lightly
sharpened). Identity is now the master's; the face is a little softer than the surrounding linework.

Recommendation: keep the body and composition. Fix the hand separately: a hand-only masked edit (index finger pointing
straight at the lens, hand about 2× the face, wrist joining a visible forearm), composited only inside the hand area.
Estimated $0.08–0.15; needs your authorisation.

## Reach hand correction (2026-10-21; NOT yet approved)
- One masked edit: Nano Banana Pro, $0.15 (ledger estimate; batch total about $18.59 of $30). Paid generation re-locked.
- Input: the face-corrected Reach, with the master and Pose A as character and hand-style references. The prompt
  changed only the right hand and forearm, asking for a soft, open-palm invitation.
- The result was aligned to the original (sub-pixel) and composited back ONLY inside the hand/forearm polygon, with a
  6 px feather. Verified: 0 pixels changed outside the edit area, so the face transplant, wings, hair and costume are
  untouched.
- Result: the arm now comes from her bare right shoulder (with the gold vine band); the elbow is softly bent; the hand
  is held out at chest height, palm up and open, five relaxed fingers; about the size of her face; it does not cover her
  face.
- Output: `reach/reach_handfix_composite.png`. Raw model output: `reach/reach_hand_fix_1.png` (it redrew the whole
  image; only its hand area is used).
