# V2 fairy path movement

Integrated into the existing main-checkout `mobile/src/app/garden-test.tsx`.
Open `http://localhost:8082/garden-test`, tap near the center of a paved path,
and use **Path debug** to see the network, foot pivot, target, route and pointer status.
Drag/pinch camera controls remain available. The test scene opts in with
`enableFairyWalk`; other garden screens retain their existing behavior.

## Movement and art

- Standing: the approved painting `assets/garden/fairy/walk-v2/walk_04.png`.
- Walking: `walk-video-v1/walk.webp`, one painted stride (25 frames over 2.08 s) cut from a
  generated walking clip back onto walk_04's canvas, so scale and foot pivot are unchanged.
  Horizontal runtime flip for leftward travel.
- Flying: `fly-video-v1/fly.webp`, 12 frames at 12 fps from a generated flying clip, cut
  back onto the original glide canvas (`fly-v1/glide.png`, kept as the reference) and
  cross-faded at the loop seam. Both sheets are built with `scripts/critters/video-frames.py`.
- Movement uses shortest paths on explicitly traced, connected paving centerlines.
  Every movement step advances on the remaining route; there is no world-space
  tween to the destination, spline smoothing, corner-cutting or free-map fallback.
- The click corridor is deliberately conservative: six world units from a
  centerline, about three pixels at the standard desktop framing. Grass and
  distant clicks are ignored, leaving any existing valid route intact.
- The graph covers the main island paths, connecting roads, B01/B02 bridges,
  ST01 stairs and the SS01 stepping-stone crossing. It does not authorize lawns,
  scenery or landmark interiors. Fine paths use short straight segments.
- The existing planting region mask overlaps some visible paving and is not a
  reliable navigation mask. Navigation therefore uses an independent positive
  whitelist; it never treats the inverse of planting regions as walkable.
- Plant/adjust mode and flower-hit handling run first and are unchanged. Movement
  stops while planting, while viewing flower details, while the scene is inactive,
  while editing the map, or while road infrastructure is hidden.
- Fairy animation runs on its own retained Canvas plane using shared values;
  it does not rerender the whole garden on every movement frame.

## Validation

`node test/fairyWalk.test.cjs` verifies graph connectivity, rejected lawn/water
targets, detours, mid-route retargeting, segment-constrained simulation, closure
vetoes, V2 ordering and idle selection. `npx tsc --noEmit` passes.
The existing `npm test` planting, mask-refinement and flower-detail suites pass.
Browser tests exercise actual road/grass clicks, arrival, all eight animation
frames, left facing, neutral idle, and a mobile viewport. No new artwork was
generated and no existing map asset or placement was changed.

## Scope and removal

This is the requested initial garden-test integration, not a production rollout.
Remove `enableFairyWalk` from the test route to disable it. Debug visuals default
off; the toggle and `window.__fairyDebug` are development-only. Centerlines are
locked to the current authored layout and must be reviewed if that layout changes.
Native-device rendering has not been verified in this task.
