# Reading companion

The Fairy reads one book beside the user during a study or work session.
`<ReadingFairy session="active" | "paused" | "idle" />` is the whole API; the
session owner (the future Focus screen) passes its own state. Preview it at
`/reading-fairy-test` (development builds only).

## Art

`assets/garden/fairy/reading-v1/reading_01–06.webp` (502 × 502) come from the
3 × 2 reading storyboard. The panels share one camera (background offset
0, 0 px), so each pose was composited onto panel 1 through a feathered mask
around the arm, hand, book and page: face, hair, wings and room never change
between poses. The 5 × 3 captioned storyboard was used for order and intent
only; its panels are about 155 px wide and carry captions, so none of its
pixels are used.

| Frame | Storyboard panel | Used for |
|---|---|---|
| 01 | top left: hand under the book | READING, RETURN_TO_READING, PAUSED, IDLE |
| 02 | top middle: hand gathering at the chest | PAGE_PREPARATION, THINKING |
| 03 | top right: fingers reach the page edge | PAGE_LIFT |
| 04 | bottom left: page lifts and curls | PAGE_TURN, first half |
| 05 | bottom middle: page arcs over | PAGE_TURN, second half |
| 06 | bottom right: page settles, hand lowers | PAGE_SETTLE |

## Timing

`READING_TIMING` in `readingFairyController.ts`: a page every 45 s–5 min
(80% within 90–180 s), lift + turn 1.24 s, a thought after 10–20 min of
active time held 4–8 s. `READING_TIMING_FAST` is for the preview and tests.

## Limits of the supplied art

- No storyboard panel at full size shows her looking up to think, so THINKING
  holds frame 02. A same-camera "looking up" pose would replace it directly.
- Poses change by crossfade: six key poses, no in-betweens. The page reads
  as lifting and arcing over, but it is not a continuous page simulation.
  Two or three in-between frames per half of the turn would make it fluid.
- Frames are 502 px; on large or high-density screens they look soft. A
  1024 px re-export of the same storyboard would fix that.
