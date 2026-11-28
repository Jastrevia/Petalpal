# Reading companion

The Fairy reads one book beside the user during a study or work session.
`<ReadingFairy session="active" | "paused" | "idle" />` is the whole API; the
session owner (the future Focus screen) passes its own state. Preview it at
`/reading-fairy-test` (development builds only).

## Art

- `reading_01.webp` (502 × 502): the reading pose, the whole scene.
- `reading_sheet.webp`: 42 frames of the area that moves (arm, hand, book,
  page; 334 × 384 each, 7 × 6 grid), drawn over the reading pose.

Source: the 3 × 2 reading storyboard. Its panels share one camera (background
offset 0, 0 px), so each pose was composited onto panel 1 through a feathered
mask: face, hair, wings and room never change. The 5 × 3 captioned storyboard
was used for order only (its panels are about 155 px wide).

In-betweens: the forearm is a bone from a fixed elbow to a hand point measured
in each pose; between poses the bone swings and both poses are sampled along
it, so the hand travels instead of fading (optical flow alone loses it). Book
and page use DIS optical flow.

| Strip frame | Storyboard panel | Pose |
|---|---|---|
| 0 and 41 | top left | reading, hand under the book |
| 7 | top middle | hand gathers at the chest (also THINKING) |
| 13 | top right | fingers reach the page edge |
| 20 | bottom left | page lifts and curls |
| 27 | bottom middle | page arcs over |
| 33 | bottom right | page settles, hand lowers |

## Playback

One `Animated.Value` moves a fractional position along the strip and
neighbouring frames crossfade, so motion is continuous. A page turn is one
sweep from 0 to 41 (eased only at its start and end), then wraps to 0, which
is the same image. Thinking goes 0 → 7 and back. Pausing finishes any movement
gently. `readingMotion` in `readingFairyController.ts` holds this mapping.

## Timing

`READING_TIMING`: a page every 45 s–5 min (80% within 90–180 s), the whole
turn about 3.5 s of which lift + turn is 1.4 s, a thought after 10–20 min of
active time held 4–8 s. `READING_TIMING_FAST` is for the preview and tests.

## Limits of the supplied art

- In-betweens are synthesised; the hand is softer mid-motion than in the key
  poses, and the turning page dissolves between its two drawn shapes.
- No full-size panel shows her looking up to think, so THINKING holds frame 7.
- Frames are 502 px wide; large or high-density screens show them softly.
