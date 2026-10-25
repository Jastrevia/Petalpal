> SUPERSEDED in part (2026-10-20): the film is now first-person only, so section 5 (the anime girl) and every protagonist task are removed. The fairy authority, identity checklist and the analysis of why the earlier workflow failed (sections 1-3) still stand. Active plan: PRODUCTION_PLAN_v2_first_person.md.

# PetalPal film: corrected character art direction (DRAFT, awaiting owner approval)

Status: paid generation is LOCKED (`../PAID_GENERATION_LOCKED`). Nothing in this document has been generated. The
rejected work is in `../REJECTED_character_art/` and must never be used as an input.

## 1. Authoritative fairy reference

| | |
| --- | --- |
| File | `Resources/fairy/production/master/fairy_first_approved.png` |
| sha256 | `c395f4d96c4b3c8848d0f4e63d945bc4d6a3bb7c6c095353827d5c17845fee42` |
| Format | 1254 × 1254 RGBA, transparent background, single 3/4-front view |
| Status | Approved 2026-09-30; `master/source_manifest.json` names it the sole current authority |
| Exact pieces | 18 extracted layers of the same pixels in `Resources/fairy/production/layers/first_approved/` (face, hair front/back, braided updo, crocus, wings L/R, dress layers, arms, legs) |

Not authorities (never inputs): Blender Fairy V1/V2, `Resources/Icon/fairy.png`, the generated master V2
(rejected), app pose sheets such as `mailbox-v1/poses.png` (long dress, different proportions), and every generated
"cinematic fairy". The original structure sheet (`Resources/Icon/fairy structure.png`) is superseded. It may be shown
only as a back/side reference for a view the master doesn't contain, and only if the owner agrees.

Identity checklist (every fairy image must pass all items, compared side by side with the master at the same scale):
1. Face: soft anime-illustration face, large grey-violet eyes, small nose and mouth, calm, slightly reserved expression.
2. Hair: plum-violet (darker plum shadows), loose low braided updo, wispy strands framing the face and neck.
3. Crocus ornament: violet crocus with a blue-teal base and gold sprigs, on the same side as in the master.
4. Wings: two pairs, translucent lavender to pale blue, fine gold veins, scattered sparkle; same shape and size relative to her body.
5. Dress: violet bodice with gold vine trim, gold star clasp at the waist, sheer petal drapes from the shoulders, lavender petals over pale blue-teal petals, short front, long translucent trailing panels.
6. Jewellery: fine gold necklace; gold vine bands on the upper arms.
7. Shoes: gold stiletto heels with lavender petal toes and gold laces crossing the ankles.
8. Proportions: about 5.5 to 6 heads tall, slender, legs as in the master.
9. Rendering: soft watercolour-anime illustration, fine violet-brown linework, translucent pastel washes, paper-light shading, delicate gold highlights. Never 3D, photoreal or "semi-real".
10. Scale in the world: about 15 cm tall (hand-sized), the same in every shot.

## 2. Why the previous workflow failed

1. **I misread "realism".** You meant believable motion, light and depth. I wrote "photorealistic live-action" into the girl's prompt and told the fairy prompt to "translate into cinematic fantasy realism… realistic skin… not anime". The models did what I asked. That was my error.
2. **Text prompts led the design, not your art.** The prompts described the fairy in words, and the image model re-imagined her from that description. The master was attached only as loose guidance.
3. **Copies of copies.** I then used my generated "fairy sheet A", not your master, as the reference for every keyframe and as the Kling character element. Each step drifted further from the master, and the master was never used again after the first step.
4. **Mixed references.** Other art went in alongside the master (the old structure sheet, the long-dress mailbox poses), which blurred her identity.
5. **A false checkpoint.** Both options (A and B) were already semi-realistic, so the approval offered no real choice. I also didn't run my own side-by-side check against the master before going on.

## 3. Revised character-generation strategy

**Exact-pixel first.** The safest way to preserve her is to animate her real pixels. Wherever a shot allows it (hovering,
gliding, presenting, sitting beside the crocus, leading the way), she is the master's own 18 layers, articulated and
composited over the scene with matched light, glow and motion blur. This is the same method the app already uses, and her
identity is exact by construction. No AI redraws her in these shots.

**Master-guided stills only where a new pose is unavoidable** (both hands around a fingertip, opening the mailbox):
- The input is always the master itself (plus crops of its face and crocus at full resolution), never a generated image.
- The prompt asks to *edit or pose this exact illustration in its own style*, lists the checklist, and excludes photoreal,
  3D, CGI, realistic skin and redesigns.
- Every still is checked against the checklist next to the master (palette hue match on hair, dress and wings; crocus
  side; wing count) and goes to you for approval before it's used anywhere.

**Video only from approved stills.** A shot with complex motion is generated only with your approved start (and where
possible end) frame. Character elements, if used, are made only from the master and approved stills. A shot whose
fairy fails the checklist is rejected, not graded or patched.

**No new derivative becomes a reference unless you approve it, and the master is always included alongside it.**

## 4. Corrected film art direction

A dreamy, romantic, high-budget animated fantasy feature: richly painted backgrounds with hand-drawn-style characters,
in the tradition of hand-painted animated films. Characters use soft watercolour-anime rendering. Light is cinematic:
golden rim light, gentle bloom, haze and atmospheric depth. Camera moves are smooth and motivated; characters move
believably and touch things physically. Avoid photoreal faces, live-action looks, realistic skin, 3D-doll rendering,
exaggerated anime expressions and generic AI-portrait faces.

**The approved environments stay as they are.** K1, K2, Kling 03 and the other garden shots act as painted
backgrounds; painted backgrounds with drawn characters is the convention of the form. Proposed (optional, decided
later): a light, uniform painterly grade over the whole cut, applied to copies, never to the approved files.

## 5. The anime girl (to be designed after approval)

- Same visual family as the fairy: the same watercolour-anime rendering, linework weight and paper-light shading, so
  the two clearly belong to one film.
- Early twenties, gentle and thoughtful, natural adult proportions (about 7 heads), never chibi or exaggerated.
- Soft dark-brown hair, shoulder length, loosely tied with a few strands loose; warm brown eyes; a quiet, tired
  expression that can soften.
- Wardrobe: an oversized lavender-grey knit cardigan over a cream top. Muted, so the fairy stays the colour focus.
- Model sheet for approval: front, 3/4, profile, seated at the desk, her hands (needed for the POV shots, in the style
  of the app's illustrated hands), and three expressions (tired, wonder, small smile). Shown next to the fairy master
  so the style match can be judged.
- Generated with the fairy master attached as a style reference only, with an explicit instruction that she is a
  different person. No generated art is used as input.

## 6. Proposed next step (needs your explicit authorization to spend)

One small identity test before any production:
- 2 fairy pose stills from the master (the fingertip hold and presenting the letter);
- 1 exact-pixel layer animation test (free, done locally);
- 2 girl model-sheet options.

About $0.75 in image generation. The results come back to you side by side with the master for approval. No video
until both characters are approved. Running budget: about $17.84 of $30 used, according to the ledger.
