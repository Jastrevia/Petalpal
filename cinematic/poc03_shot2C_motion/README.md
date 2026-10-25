# POC 03 · Shot 2C motion test (K1 → K2)

A 6-second continuous first-person camera move from K1 (inside the wisteria passage) to K2 (the approved Grand
Reveal), 16:9 at 24 fps. This is the first motion test. It does not start the rest of the film, and it changes no
keyframe, app file or existing asset.

**Status:** no video can be generated from Claude's session. It has no video-generation tool or connector, no GPU,
and no network route to video-model services. So this folder is a **ready-to-run external workflow**, plus the tools
to review and conform the takes once they come back. Nothing here is a slideshow, crossfade or stand-in render.

## Recommended method: first-frame + last-frame AI video generation

| | First/last-frame video model (recommended) | Depth-guided 2.5D compositing |
| --- | --- | --- |
| Moving ~5 m through a tunnel | Invents the in-between 3D world: walls sliding past, parallax, objects revealed from behind others | Single-image depth breaks: walls beside the lens stretch, and surfaces never seen in K1 leave holes |
| Joining K1 to K2 | Built for it: conditioned on both frames | K1 and K2 are not one consistent 3D scene (the pavilion sits 123 px apart and differs 16% in scale; leaves and stones differ). Joining two 2.5D scenes needs a dissolve or morph, which is exactly what must be avoided |
| Living world (swaying wisteria, water, mist, exposure, motion blur) | Native | Must be faked layer by layer |
| Exact camera path and end frame | Approximate; the end frame is usually close, not pixel-exact | Exact |
| Main risks | Arch filigree or pavilion morphing; speed curve only loosely followed | Stretching, holes, a cardboard look |

So the strongest practical route is **first/last-frame generation on two or three leading models, several takes
each**, then objective review, then conform. Depth-guided work keeps a role later: as a guide video for a
structure-controlled video-to-video pass if the arch morphs, and in the eventual 3D build.

## What the two keyframes say about the move (measured)

- The pavilion matches by design (normalised correlation 0.76). In K1 it is at x 938, in K2 at x 815, so the camera
  **turns about 6° to the right** during the move and tilts up about 0.7°.
- The pavilion is 0.84× its K2 size in K1, so K1 was framed slightly wider (about 20 mm against 24 mm). A real camera
  would ease the lens from about 20 to 24 mm during the push; a video model will absorb this naturally.
- The exit is 0.45× its K2 width, which puts K1 about 1.9× as far from the arch: **about 5 m of travel** (an estimate).
- The waterfall, sun and most of the lake are hidden by the passage in K1 and appear during the approach, as planned.

plan/motion_plan.png and plan/motion_plan.json give the target curve: a slow creep of about 0.45 m/s (0–2 s), smooth acceleration
to about 2 m/s at about 4 s, deceleration into a settle by 5.8 s, with the pan, the lens ease and the sunlight bloom
as the camera crosses into the light at about 4.4 s.

## Run it (external services)

Upload **inputs/K1_first_frame.png** as the first/start frame and **inputs/K2_last_frame.png** as the last/end frame.
These are byte-identical copies of the keyframes, so the originals are never touched. Prompt: prompts/motion_prompt.txt
(below the `# ---` line). Negative prompt: prompts/negative_prompt.txt. 16:9, 6 s, 1080p, 24 fps if offered,
**4 takes per service**, no audio (or discard it). Field names change between releases; match by meaning.

| Order | Service and model | Where | Settings | Approx. cost (Sept 2026 list prices) |
| --- | --- | --- | --- | --- |
| 1 | Google **Veo 3.1** (first and last frame) | Google Flow ("Frames to Video"), Gemini API / AI Studio, Vertex AI | Duration 6 s (4/6/8 allowed), 16:9, 1080p, negative prompt, 4 outputs. Explore with Veo 3.1 Fast, finish with Standard | Fast ≈ $0.10/s (≈ $0.60/take); Standard ≈ $0.40/s (≈ $2.40/take) |
| 2 | **Kling 3.0** Pro (start + end frame) | Kling app or API (also through fal or ComfyUI partner nodes) | Start frame K1, end frame K2, 6 s (3–15 s allowed), Pro/1080p, negative prompt, relevance toward the prompt, no camera preset | ≈ $0.084/s silent |
| 3 | **Luma Ray3.2** (keyframes) | lumalabs.ai/ray or Luma API | Keyframe K1 at 0 s, K2 at 6 s, 1080p; optional HDR/EXR export for grading | ≈ $0.24/s at 1080p |
| alt | **Seedance 2.0/2.5** (first + last frame) | BytePlus ModelArk / Dreamina | 6 s, 1080p, 16:9 | ≈ $0.15–0.23/s |

Twelve takes across the first three services cost roughly $10–35. Short prompt version: prompts/motion_prompt_short.txt.

Save every download unchanged to `takes/` as `2C_veo_01.mp4`, `2C_kling_01.mp4`, `2C_luma_01.mp4` ...

## Review and conform (Claude does this when takes arrive)

`python tools/review_take.py takes/2C_veo_01.mp4 inputs/K1_first_frame.png inputs/K2_last_frame.png review/2C_veo_01 [--conform]`

It writes report.md, contact_sheet.jpg, first_last_compare.jpg and curves.png. With `--conform` it also writes a
24 fps 1920×1080 H.264 master. Self-tested on synthetic clips (not delivered): it flags a crossfade (blend R² 1.00)
and a flat 2D zoom (affine residual 0.03), and passes a layered parallax clip.

| ID | Requirement | How it is judged | Threshold |
| --- | --- | --- | --- |
| M1 | Continuous camera travel, no crossfade or slideshow | K1/K2 pixel-blend R² over the middle 40% | < 0.9 everywhere |
| M2 | Real 3D travel, not a zoom | Flow not explained by one affine warp | ≥ 0.08 (2D zoom ≈ 0.03) |
| M3 | Strong parallax | Edge/centre flow ratio while moving | ≥ 3 |
| M4 | Starts on K1, ends on K2 | SSIM first frame vs K1, last frame vs K2 | ≥ 0.80 (closer is better) |
| M5 | Natural acceleration, no jolts | Flow spikes against the local trend | 0 jumps; speed curve resembles the plan |
| M6 | Plausible exposure change | Largest frame-to-frame mean-luminance step | < 3 L* |
| M7 | Pavilion does not warp or change | Multi-scale correlation with the K2 pavilion, second half | ≥ 0.5 every sampled frame |
| M8 | Arch, lanterns and pavilion: no warping, melting or duplication | Frame-by-frame visual review | None visible |
| M9 | Living world, motion blur, the moment of entering sunlight | Visual review | Your judgement |
| M10 | Format | 16:9, 24 fps, ≥ 1080p after conform | Exact |

If the best take lands near but not exactly on K2, the fix is a short motion-tracked settle over the last few frames,
never a dissolve. If every take warps the arch: (1) add a mid-passage keyframe and generate two shorter segments, or
(2) use a structure-guided video-to-video pass (for example Luma Modify, Runway Aleph or Wan VACE) over the best
take. Both are next steps, not part of this test.

## Files
| Path | What |
| --- | --- |
| inputs/ | Upload copies of K1 and K2 (byte-identical; sha256 in INPUTS.sha256) |
| prompts/ | Motion prompt, short version, negative prompt |
| plan/ | Target camera curve (JSON + PNG) from tools/motion_plan.py |
| tools/ | motion_plan.py, review_take.py |
| takes/, review/ | Downloads and review outputs (git-ignored: large media) |
