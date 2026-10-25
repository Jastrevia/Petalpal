# PetalPal film: production plan v2, first-person only (DRAFT, awaiting owner approval)

Status: the owner's definitive creative direction, 2026-10-20. Paid generation stays LOCKED (`../PAID_GENERATION_LOCKED`)
until the owner approves this plan. This replaces the earlier storyboard and the protagonist sections of
`CHARACTER_ART_DIRECTION.md`. Everything in `../REJECTED_character_art/` stays rejected and is never an input.

## 1. Locked rules

- **First person, start to finish.** The viewer is the user. Only the viewer's hands may appear, and only for an
  interaction. Never a face, body, reflection or outside camera. No protagonist and no character sheets: the girl and
  boy tasks are removed.
- **The fairy is exactly `Resources/fairy/production/master/fairy_first_approved.png`** (sha256 `c395f4d9…`) in every
  shot. Her pixels come from the master or its 18 registered layers. She becomes three-dimensional through depth,
  staging, light, motion and compositing, never through a redesign. Any new pose is a controlled edit that the owner
  approves before use.
- **Art direction:** a dreamy, healing, high-budget animated fantasy feature. Refined Chinese garden aesthetics lead:
  poetic landscape composition, curved slate roofs and pavilions, stone paths, bridges, mist and water, negative
  space, and a turquoise, lavender, ivory and soft-gold palette. Western botanical fantasy enriches it: the fairy, the
  gilded floral invitation, Art Nouveau ornament, wisteria and gentle light. Avoid European castles, fairy-tale
  villages, excess gold, neon magic, childish cartoons and clutter. Light, depth, reflections, camera and interaction
  are physically convincing; the rendering stays painterly.

## 2. How each element is made

| Element | Method | Why |
| --- | --- | --- |
| **Fairy** (every shot) | 2.5D animation of the master's own 18 layers: float, breathing, wing flutter, head tilt, and arm articulation (both arms have upper/lower layers). Composited with matched colour temperature, rim light, soft glow, contact light on what she touches, depth of field, motion blur and a soft shadow where she is near a surface | Identity exact by construction; the same method the app already uses |
| Fairy holding the invitation or letter | The card or envelope composited into her hand layer, moving with the arm | No redraw |
| Fairy gentle smile (if wanted) | One controlled edit of the master's face only, at master resolution, with the rest of the pixels untouched; owner approval before use | The master's expression is calm and reserved |
| Viewer's hands | Illustrated hands in the app's existing hand style (the user's hands in the Mailbox screen); generated as hand-only plates, no person | Hands only, matching the app |
| Phone screen | Composited from real app art: the invitation card, crocus logo, garden screen | Exact branding and readable UI |
| Environments | Character-free painted plates (image model), animated with character-free video where motion helps; K1, K2 and Kling 03 reused | Video models never draw the fairy |
| Text (journal, letter, title) | Composited exactly; handwriting revealed behind the pen (existing tool) | Exact spelling |
| Music and sound | A new score timed to the new cut; sound effects matched to the final picture | The old score's timing no longer fits |

Known limit: the master is a single 3/4-front view. She can tilt, turn slightly, float, reach and glide, but cannot
turn her back or show a profile. In a first-person film she is almost always facing the viewer, and leading means
flying ahead while looking back, so this suits the story. If a shot truly needs another angle, it becomes a
controlled-pose request for approval. Layer articulation can also expose small hidden areas (for example behind a
raised arm); those would be retouched minimally from the master's own pixels and shown to the owner.

## 3. Storyboard and shot list (about 60 s)

| # | Time | Shot (all first person) | Build | Reuse / new |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:04 | Rain streaks down the window at night; blurred city bokeh; quiet and lonely | Existing rain shot, painterly grade | **Reuse V01** |
| 2 | 0:04–0:09 | Looking down: the viewer's hands hold the phone at the desk by the rainy window; unread notifications, a cold cup of tea | Painted room plate with hands and phone; slow drift | New plate + video |
| 3 | 0:09–0:12 | A PetalPal invitation appears on the phone screen; the thumb taps it | Real app invitation art on screen; tap animated | New composite |
| 4 | 0:12–0:16 | The invitation lifts off the screen and unfolds into a real gilded card floating in the room, gold motes, warm light on the hands | The app invitation card as a 3D-tilted card, particles, light spill | New composite (free) |
| 5 | 0:16–0:20 | Light gathers; **the fairy appears holding the invitation**, floats into the room, meets the viewer's eyes | Fairy layers + card in hand over the room plate | New composite |
| 6 | 0:20–0:24 | **She reaches toward the viewer; the viewer's hand reaches in; fingertip touch**, and a soft bloom of light (emotional centre) | Arm articulation of the fairy layers; generated hand plate; contact glow | New hand plate + composite |
| 7 | 0:24–0:27 | Magic surrounds the viewer: petals and light swirl, and the room dissolves into the wisteria passage, landing on K1 | Character-free transition video ending on K1 + fairy layers | New video + composite |
| 8 | 0:27–0:32 | Through the passage, the fairy flies just ahead and glances back; sunlight floods in | **Kling 03** + fairy layers (replacing the light orb) | **Reuse Kling 03** + composite |
| 9 | 0:32–0:37 | Into the garden: lake, pavilion with curved slate roof, stone bridge, waterfall, mist; the fairy glides ahead over the water | Character-free garden plate from K2, gentle forward video + fairy layers | New plate + video + composite |
| 10 | 0:37–0:41 | At a stone table in the pavilion, the viewer's hand writes "Today was harder than I expected." | Painted table plate with the viewer's hand + pen; handwriting composited (existing tool) | New plate + video; tool reused |
| 11 | 0:41–0:43 | The words rise as golden motes into one glowing seed | Existing seed effect re-run on the new plate | Tool reused (free) |
| 12 | 0:43–0:47 | The seed becomes a crocus that blooms in gentle rain; the fairy hovers quietly beside it | Bloom shot + fairy layers (rain-lit) | **Reuse V13** if its look fits after grading, else repaint |
| 13 | 0:47–0:51 | Following the fairy to the wisteria treehouse (turquoise-tiled hood, round door, crocus-bud mailbox); she draws out a letter | Painted treehouse plate from the app design + fairy layers + envelope | New plate + composite |
| 14 | 0:51–0:55 | She offers the letter; the viewer's palms receive it; the letter reads "You don't have to have it all figured out today." | The app's illustrated palms as the design reference; letter text composited | New hand plate + composite |
| 15 | 0:55–0:58 | Back in the room at dawn, rain stopped; the viewer's hands hold the phone, now showing PetalPal | Morning version of the room plate; app screen composited | New plate + composite |
| 16 | 0:58–1:01 | PetalPal: "Let every feeling bloom." | Existing petal plate and title | **Reuse V19 + S19** |

## 4. Reuse and rebuild

| Keep and reuse | Reuse after a check | Rebuild | Never reuse |
| --- | --- | --- | --- |
| K1, K2 (approved stills), Kling 03, title plate V19 and title S19, all tools (budget ledger, edit, handwriting reveal, seed effect, mix, review) | V01 rain (painterly grade); V13 crocus bloom (looks photographic, so repaint if it clashes); the music (timing no longer fits, expect a new score) | Room, phone, hand, garden-wide, pavilion-table, treehouse and dawn plates; every fairy shot (now composited from layers); sound effects | Everything in `REJECTED_character_art/` |

## 5. Budget

| | USD (list-price estimates; the fal dashboard shows the exact amount) |
| --- | --- |
| Cap | 30.00 |
| Spent (ledger) | 17.84 |
| **Remaining** | **12.16** |

Estimated cost of this plan:

| Item | Estimate |
| --- | --- |
| About 12 character-free plates and hand plates, two options for the key ones ($0.15 each) | ≈ 2.40 |
| Up to 2 controlled fairy edits, only if approved (smile, extra hand area) | ≈ 0.30 |
| About 7 character-free motion plates, 5 s Kling ($0.56 each) | ≈ 3.90 |
| New score ($0.60) and sound effects | ≈ 0.70 |
| Retake reserve | ≈ 2.00 |
| **Expected total** | **≈ 9.30 (fits within the remaining 12.16)** |

The fairy compositing, card effects, text and edit are local and cost nothing.

## 6. Order of work after approval (spend stays locked until then)

1. Free, first: a fairy layer-animation test (float, wings, reach, holding the card) over K2, to prove identity and
   motion before spending anything.
2. Plates and hands (images), shown together on one approval board.
3. Motion plates, compositing, music, edit, then an end-to-end review and delivery of the next cut for owner review.
