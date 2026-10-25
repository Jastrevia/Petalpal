# Identity-preserving face correction: findings and proposal (paid generation LOCKED)

All three pilot candidates are rejected as final assets; their poses and compositions are kept as working material.

## Finding: a free, exact face transplant works when the head angle matches the master
`facefix/FACEFIX_test_board.jpg` is a local prototype on Pose A, with no generation and no cost:
1. Bring the candidate to the master's scale (eye distance matched), so the master's pixels are never enlarged.
2. Warp the candidate's head so its jaw and chin sit where the master's do (a thin-plate warp with anchors on the
   hair, eyes and neck). This removes the "rounder, longer face" drift without redrawing.
3. Transplant the master's own eyes, brows, nose, mouth and jawline, feathered into the candidate.
4. Shift the candidate's skin tone to the master's measured skin colour.
5. Optional subtle smile: lift the mouth corners by warping the master's own mouth pixels (about 1 px at master scale).

Result: her exact eye shape and size, facial proportions, nose, mouth and rendering, inside the new pose. Still to do,
all free: soften the seam where loose strands cross the cheek, remove the small earring, clean a pale patch at the neck.

Limits:
- **Head angle.** The master shows one face angle (3/4 toward screen right, eyes to camera). Transplants are exact only
  for heads at roughly that angle, or its mirror image (mirroring flips her light and hair-parting asymmetry, so it
  needs your approval). Frontal or profile faces cannot be transplanted.
- **Smile.** Warping master pixels gives only a faint smile. A clearly visible, genuine smile needs new mouth and
  lower-eyelid drawing: a paid edit restricted to that small area, judged against the master.
- **Close-ups.** The master's face is about 120 px wide. That is enough while she fills up to about 1,100–1,200 px
  of frame height; tighter close-ups would need an upscaled master face.

## Per-candidate plan
| | Status | Correction |
| --- | --- | --- |
| **A, smile (best starting point)** | Head angle matches the master | Free transplant (prototype done) + cleanup; then optionally ONE paid masked edit for a clearer smile and seam harmonisation, kept only inside the face mask |
| C, turn and lead | Head turned the other way | Mirrored transplant (needs your OK) + replace the elf ear with hair (free clone, or paid masked fill) |
| B, reach | Frontal face, flat sandals, earrings, proportions, sideways gesture | Not correctable: rebuild (below) |

## Reach pose: separate rebuild
- **Pose at the master's head angle** (3/4 toward screen right), so the master face can be transplanted exactly.
- **A free blocking sketch** I draw: camera at her chest height, her hand nearest the lens and larger than her head,
  forearm foreshortened, elbow behind the hand. It goes in as a composition reference with the master as the
  identity reference, then the face is transplanted and the shoes and costume checked.
- Alternative: build the near hand as its own drawn element, with depth of field, joined to an arm in a mid-distance
  pose.

## Rules for every new pose from now on
- Head kept at the master's angle (or its mirror) whenever her face is visible, so the master face can be transplanted.
- After each generation: transplant the face, correct skin tone, remove invented details, verify shoes and costume
  against the master, and review side by side before approval.
- Paid edits are always composited back through our own mask, so pixels outside the corrected region stay unchanged.

## Proposed single controlled test (needs authorization)
Pose A only: finish the free cleanup, then ONE masked paid edit (Nano Banana Pro $0.15, or FLUX Kontext Max $0.08) for
a clearer gentle smile and seamless blending, composited back inside the face mask only. Max cost $0.15.
