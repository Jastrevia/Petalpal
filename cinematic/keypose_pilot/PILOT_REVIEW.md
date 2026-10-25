# Key-pose pilot 1: review (NOT approved; for owner decision)

Nano Banana Pro edit, one candidate per pose, 2K, the master as the primary reference (Pose C also had the old sheet's
back views as a supplementary reference). Spend: $0.45 of the $0.60 pilot cap (ledger estimate). No retries. Paid
generation re-locked afterwards.

| | A Gentle smile | B Reach | C Turn and lead |
| --- | --- | --- | --- |
| Overall identity | Closest; reads as her | Reads as a sister, not her | Reads as her from behind; face drifted |
| Face and eyes | Smile is gentle and natural; eyes larger and sparklier than the master; blush added | Clearly rounder, younger "cute" face with large sparkle eyes: the biggest drift | Rounder face, larger eyes; **pointed elf ear** (from the old sheet; not in the master) |
| Hair and crocus | Updo and strands right; crocus on the correct side (her right) | Correct side; ornament slightly simplified | Correct side; back of the updo plausible |
| Wings | Correct shape and translucency; one pair hidden by the turned pose | Two pairs, larger and more symmetrical than the master | Two pairs, plausible roots from behind |
| Dress | Very close: bodice, star clasp, petals, trailing panels | Close | Close; the back construction follows the sheet (gold star at the back) |
| Accessories | Necklace and heels right | **Gold earrings added; the heels became flat sandals** | Heels right; necklace right |
| Proportions | Right | Slightly shorter legs, larger head | Right |
| Anatomy | Good | Good, but the reach goes to the side at waist height, **not toward the camera**: the brief was missed | Good; the arm reaching back toward the viewer works |
| Pose versus brief | Changed the pose (turned away, hand to chest) instead of keeping the master pose | Failed: no foreshortening toward the lens | Met: turning away, looking back, leading |
| Style | Matches the master's watercolour well | Brighter and cleaner than the master | Brighter and cleaner than the master |
| Palette (measured) | Hair hue 292° vs master 284° (slightly more magenta); dress, gold and blue within 3° | Same | Hair 296°; blue slightly lighter |

**Conclusion:** the model holds her costume, colours and style well. **It does not hold her face.** It drifts toward a
rounder, younger generic-anime face with big sparkle eyes, the strongest identity risk. It also adds and removes
details (earrings, an elf ear, flat sandals) and doesn't reliably follow camera-relative perspective (B).
None of the three should be approved as-is. A is the best basis.

**Corrections that would address this (not run; need authorization):**
1. Lock the face: send a full-resolution crop of the master's face as a second reference. Name the face traits in the
   prompt: narrow chin, smaller, calmer half-lidded eyes, small nose and mouth, no blush. Explicitly forbid earrings,
   pointed ears and flat shoes.
2. Pose A again with "keep the master's exact pose; change only the mouth and eyes"; or an inpainting edit limited to
   the face, which keeps every other pixel of the master.
3. Pose B: describe the camera position concretely ("the hand is the closest object to the lens and appears larger
   than her head") and offer a rough pose sketch as a reference.
4. Pose C: keep the structure, but tell the model the ears are hidden by hair as in the master.
