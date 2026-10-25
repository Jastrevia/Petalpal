# Fairy acting: key-pose animation plan (DRAFT for owner approval; paid generation LOCKED)

`fairy_test_v1.mp4` (18-layer deformation rig) is REJECTED. The rig is kept only for limited secondary motion; it is
not used for acting. Authority stays `Resources/fairy/production/master/fairy_first_approved.png`, unchanged.

## 1. Assets required for the invitation and first-person sequence

Each key pose is a complete, newly drawn illustration of the fairy (not cut-out layers), guided by the master: same
face, eyes, hair, crocus, skin tone, palette, wings, dress, accessories, proportions and watercolour-anime style.

| Key | Beat | Pose | Notes and risk |
| --- | --- | --- | --- |
| K1 Emerge | 1 | Rising out of the opening invitation's light, wings half-folded, eyes lowered, one hand on the card | Card from app art; medium risk |
| K2 Float | 2 | Hovering, wings fully open, feet pointed down, weight balanced, body 3/4 to camera | Closest to the master; low risk |
| K3 Notice | 3 | Head and eyes turned straight into the lens, slight surprise, same body | Face-angle change; medium risk |
| K4 Smile | 4 | Same as K3, gentle closed-mouth smile with soft lower lids | Face-only change from K3; the expression needs your approval |
| K5 Approach | 5 | Leaning toward the camera, larger in frame, wings swept back, hands slightly forward, anticipation | Perspective; medium risk |
| K6 Reach | 6 | Arm extended straight toward the camera, correct foreshortening, index fingertip forward, smiling | Hand anatomy and foreshortening; high risk; most candidates needed |
| K7 Contact | 7 | Her fingertip touching the viewer's fingertip (Mailbox-style hand entering from the lower right), soft light at the contact point | K6 plus the viewer's hand in one illustration; high risk |
| K8 Turn and lead | 8 | Turned 3/4 away toward the garden, looking back over her shoulder, still holding the viewer's fingertip, wings spread | Back/over-the-shoulder view: the master shows no back, so highest identity risk |

Plus: the viewer's hand in the Mailbox style (pointing and receiving), and background plates for the room and the
passage entrance (no characters).

## 2. Workflow

1. **Pose stills.** An image-editing model with the master always attached as the primary reference (never a
   generated image as the only reference), a written pose description plus the identity checklist, output at 2K on a
   plain, softly lit background. 2–3 candidates per key.
2. **Identity check, then your approval** of each key, side by side with the master at the same scale. An approved key
   becomes an additional reference for the next keys, alongside the master.
3. **Staging.** Each approved key is placed into its background plate with matched light (rim, colour, depth of
   field) to make start and end frames for each shot.
4. **In-betweens.** Short image-to-video segments (2–4 s) between two approved keys: K1→K2, K2→K3, K4→K5, K5→K6, K6→K7,
   K7→K8. Start and end are both pinned, so the model only animates the transition and identity is anchored at both
   ends. Frame-by-frame review; failed segments are rejected, not patched.
5. **Finish.** Composite effects (invitation light, contact glow, petals). An optional anime-style hold on twos (12
   drawings per second) for the character if it reads better. Grade the fairy and environment together so she sits in
   the scene rather than on top of it.

## 3. Tools (checked today with free validation calls; all reachable with your key)

| Purpose | Tool | Price (fal list) | Why |
| --- | --- | --- | --- |
| Key poses (primary) | Nano Banana Pro edit | ~$0.15 per 2K image | Strongest at keeping a referenced character while changing pose; good with illustration styles |
| Key poses (comparison) | Seedream 4.5 edit | ~$0.04 per image, up to 10 references | Cheap second opinion; strong at style fidelity |
| Key poses (fallback) | FLUX Kontext Max Multi | ~$0.08 per image | Precise local edits (for example a face-only smile) |
| In-betweens (primary) | Kling 3.0 Pro start + end frame | $0.112/s | Best-behaved first/last-frame motion in our earlier tests |
| In-betweens (option) | Kling O3 Pro reference-to-video, start/end plus approved keys as character references | $0.112/s | Extra identity anchoring |
| In-betweens (comparison) | Veo 3.1 first/last frame | $0.20/s | Smoother acting, but drifted from the keyframes in our test |

Not available here: anime-specific in-betweening such as ToonCrafter, or training a character model on a GPU. A
character LoRA trained on fal would need 10+ consistent images. It only becomes possible after several keys are
approved, and probably doesn't fit the remaining budget.

## 4. Where identity can NOT be guaranteed

- **Every new pose is a redraw.** Face, hair and colours can be held closely, but fine details will vary slightly
  between poses: the gold vine patterns, petal count and shape, wing veins, sandal straps, crocus petals.
- **K8 (turn and lead).** The master shows no back. The model must invent her back, the wing roots and the back of the
  dress. The original structure sheet has painted back views of the same design, but it was superseded as an authority,
  so it is used only if you allow it.
- **K6/K7 (hand toward camera).** Foreshortened hands are a common failure (finger count, joints). Expect to discard
  candidates; a light manual retouch may be needed.
- **In-betweens.** Mid-motion frames can soften her face or change wing shape and dress detail, especially in fast
  turns (K7→K8) and big perspective changes (K5→K6). Short segments, pinned ends and rejection keep this contained, but
  can't make every frame identical to the master.
- **Style match with the painted garden.** Her watercolour-anime rendering against the semi-real painted environment
  needs grading and light integration; it's a craft step, not guaranteed by the tools.

## 5. Proposed next step (needs your authorization; still locked)

A pose pilot on the three hardest and most important keys: **K4 smile, K6 reach and K8 turn and lead**.
- Nano Banana Pro: 3 keys × 3 candidates = 9 images ≈ $1.35
- Seedream 4.5 comparison: 3 keys × 3 candidates = 9 images ≈ $0.36
- Total ≈ **$1.71**. No video.

Result: one board, each candidate beside the master, with my identity notes. Then you choose. Budget: ≈ $17.84 of $30
used (ledger), so $12.16 remains. If the pilot works, the remaining keys are ≈ $1.50–2.50 and the six in-between
segments ≈ $3.50–4.50.
