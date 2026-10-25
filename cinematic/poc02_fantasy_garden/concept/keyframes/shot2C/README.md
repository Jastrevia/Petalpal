# Shot 2C: the passage push-in, two keyframes

Purpose: two visually consistent keyframes of the same place before any camera animation.

| Keyframe | What | File |
| --- | --- | --- |
| K1 (start) | First person, deeper inside the same passage | K1_inside_wisteria_passage.png (accepted 2026-10-20; do not edit) |
| K2 (end) | Approved anchor | ../../approved/frame2_grand_reveal.png (do not edit) |

The camera move between them is a straight, level dolly forward along the path centreline at standing eye height:
about 6 m in 4–5 s at a gentle walking pace, the pace of the fairy leading the viewer by the hand. During the push the
mouth grows to full size; the waterfall (right), the sun and mountains (above) and the lake (below) are revealed.

## K1 principles (owner direction, 2026-10-20)
1. Same location, architecture, landscape and time of day as K2.
2. A real camera genuinely farther back inside a continuous 3D passage, not a scaled-down K2.
3. Walls, wisteria trunks, hanging racemes and flagstones fill more of the frame.
4. The exit looks smaller through perspective, with real parallax and occlusion.
5. The pavilion stays consistent, but is not forced to an exact screen size or position.
6. The waterfall and most of the lake are hidden by the passage and appear naturally during the approach.
7. K2's lighting direction, architecture, palette and identity are preserved.
8. No scale-and-fill image as final artwork; the layout plate is a composition guide only.
9. K2's level of cinematic fantasy realism: coherent stone, botanical structure, atmospheric depth, physical light.

## Light continuity (why K1 is lit as it is)
The sun is about 14 degrees above the horizon, straight ahead and a little left. Sunlight entering under the lintel
reaches the floor as a pool that runs from the exit part of the way back down the passage. From K1 the sun is behind
the vault, so the camera stands in shade, looking at a warm, dappled pool of light ahead. In K2 the sun sits just
behind the arch filigree and sunlit glints reach the bottom of the frame. During the push, the camera walks into the
light.

## K1 geometry, approximate (from a straight move back of about 6 m; the final prompt governs)
- Everything at the mouth (stone vault, gilded arch, lanterns, landing, crocus beside the path) appears at **half**
  its K2 size, scaled about the frame centre. The mouth spans about x 688–1056 and y 272–592 of 1672 × 941.
- The distant valley barely changes: the pavilion stays close to its K2 size and position (x ≈ 735–895, y ≈ 438–588), give or take what perspective requires.
- The sun, at the same screen position, is now above the top of the mouth and hidden; its glow pours over the arch.
- The waterfall falls behind the right side of the mouth; only its mist shows at the opening's right edge.
- The landing lip now hides most of the lake, leaving only a sliver of turquoise.
- New content fills everything around the mouth: the passage's walls, vault, hanging wisteria and the near path.

## Files
- prompts/frame2C_K1_final.txt: **the K1 prompt to use.** Attach K2 only; ask for a new image.
- prompts/frame2C_K1_passage_interior.txt, prompts/frame2C_K1_fill_mode.txt: superseded, kept for the record.
- guides/frame2C_K1_layout_plate.png: K2 rearranged into the K1 geometry. The transparent surround is to be painted.
  _grey.png is the same with a grey surround; frame2C_K1_fill_mask.png is the mask (white = paint);
  frame2C_K1_layout_annotated.png has notes; make_k1_layout_plate.py rebuilds them from the approved file.
  The guides are rough composition aids made from the approved image. They are never K1 artwork, and should not be
  used as an image to edit.
- candidates/: save K1 candidates as f2C_K1_<tool>_<nn>.png.

Motion test K1 → K2: ../../../../poc03_shot2C_motion/ (external first/last-frame generation workflow, review tools).
