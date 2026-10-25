# REJECTED (owner, 2026-10-20 21:41): robotic, stiff, disconnected from the scene. The 18-layer rig is no longer used for fairy acting (secondary motion only). Active plan: KEYPOSE_PLAN.md

# Fairy animation test v1 (free, no AI redraw)

`fairy_test_v1.mp4`: 14 s, 1920×1080, 24 fps. The approved fairy over the approved K2 garden.

**Source of every fairy pixel:** `Resources/fairy/production/master/fairy_first_approved.png` (sha256 c395f4d9…) and its
18 registered layers. Rendering the rig at rest reproduces the master exactly (max difference 0).

## What moves
- Appears from gathering golden light, holding the invitation (the app's invitation card art).
- Breathing: chest and shoulders rise and fall about every 3.7 s.
- Wings flutter fast and slowly, pivoting from their roots.
- Loose hair strands, trailing petal panels and skirt sway; legs dangle slightly; she floats with a gentle bob.
- At about 5–7 s, a head tilt toward the viewer with a small nod and a shoulder lift; her original gaze keeps eye contact.
- At about 7–13 s, the forearm lifts and the wrist turns to present the invitation, then lowers.
- Scene integration: warm back-light rim from the K2 sun, light wrap, translucent glow, bloom, motes, 180° motion blur.

## Limits of the existing layers
- The layers contain only what is visible in the single 3/4-front painting. Nothing behind her arms, hair or wings exists.
- The forearm can lift only about 12° before the dress behind it is exposed (`limitation_reach.jpg`; red = no
  original artwork). The test stays at 11° and uses a small automatic fill there; it is visible only on close inspection.
- A full reach toward the viewer, fingertip contact, a closing grip on the card or letter, a smile and blinks all need
  new artwork.

## Minimum additional artwork (face and identity otherwise untouched)
1. Behind-the-forearm patch: the dress and sheer drape under her screen-right forearm (about 80×300 px at master scale).
2. One reaching forearm and hand: foreshortened, fingertip extended toward the viewer (for the touch, shot 6).
3. Optional: the same hand closing on a card or letter edge (holding and presenting).
4. Face only: a gentle smile (mouth curve, slight lower-lid lift) for your approval.
5. Face only: half-closed and closed eyelids (2 blink frames).
Free work I can still do: separate the lower wings from the drape layers, so wing beats can be larger.
