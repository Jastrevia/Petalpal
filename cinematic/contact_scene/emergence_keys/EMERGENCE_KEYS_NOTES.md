# Emergence keyframes: review set (2026-10-22)

Paid this batch: 2 Nano Banana Pro stills ($0.30, allowance `emergence_keys_1`, now retired). Ledger total is about $23.6 of the $30 cap. `PAID_GENERATION_LOCKED` is in place and no allowance is active.

| Key | File | What it is |
|---|---|---|
| Start (existing) | frames/A_end_txt.png | Tap end. The one invitation fills the screen. |
| S1 (new) | stills/emerge_S1_comp.png | Fairy entirely INSIDE the screen, holding the invitation. The screen shows the wisteria garden entrance. |
| S2 (new) | stills/emerge_S2_fixed.png | Mid-crossing. Upper body, arms, wings and invitation are out in the room. Waist, dress and legs are still inside, cut by the bezel. |
| Contact (existing) | frames/D_first_fixed.png | Unchanged. |

## S1
- The paid S1 (`emerge_S1.png`, kept unedited) did not follow the brief. It put the fairy outside the screen and enlarged and redrew the phone and hands.
- The S1 used here is a free composite:
  - The existing tap frame. Outside the screen it is pixel-identical.
  - The garden screen from the approved contact take.
  - The generated fairy, matted and placed inside the screen opening.
  - The exact invitation lettering on her card.

## S2
- The paid S2 (`emerge_S2.png`, kept unedited) used S1 as its base.
- Phone edges match the existing frame to within about 3 px.
- The one free fix: the generated card read "Invitation" with garbled text and had its seal at the bottom. It was replaced by the established invitation with the exact text. Her fingers stay in front.

## Known caveats
- The golden ripple ring is drawn as a flat horizontal ellipse around her waist. It reads more like a halo than a ring on the screen surface.
- The hands are lightly redrawn by the model. Phone geometry is preserved.

No video has been generated. Video takes stay locked until the keyframes are approved.

## S2 v2 (2026-10-22, free local composite, no credits): `stills/emerge_S2b.png`
- This is the same fairy render as S1, so face, hair, costume, wings and card are identical between S1 and S2. She is sized between S1 and the contact frame, with her head about 2x S1 and about 0.55x the contact frame.
- Pose: she is tilted 16° forward toward the viewer with her wings open.
  - The portal plane cuts her at the hips.
  - Her hips, trailing skirt and legs are behind the glass. They bend back and shrink as they recede toward the garden's vanishing point. They are visible only inside the opening, and the left bezel hides the skirt beyond it.
  - Her head, torso, both arms, wings and the invitation are in the room, over the top bezel.
- Light: the ring is removed. Light now runs along the screen boundary, strongest where she crosses. A soft band and rim light sit on her body at the hips, with a few drifting motes.
- Base is the existing tap frame, so the room, phone and hands are identical to S1. The screen shows the same garden as S1 and the contact frame.
- Tools: tools/emerge_s2b.py (parameters rot / scale / tx / ty / fore / bend) and tools/emerge_boards_v2.py.
- Note on the existing contact frame: at its size, the "t" in "PetalPal" on the card reads like an "r" ("PeralPal"). The lettering asset is correct; this is a small-size legibility issue. The contact frame was left unchanged.
