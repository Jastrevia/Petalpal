# PetalPal Film: V3 audit, corrected V3.1 edit, and shot-by-shot replacement plan

## 1. V3 timeline audit (from `film_v3/edit/edl_v3.json` and the rendered file)
Order in V3: rain, phone, A01, present, reach, passage, garden, pavilion, journal, crocus, letter, dawn, title. The title
is at 53.1-58.1 s in both the file here and the copy on your computer (identical video checksum 3c53bed1...); I could not
find a title at about 27 s in any V3 file. What *is* wrong in V3:

| V3 time | Segment | Problem |
| --- | --- | --- |
| 3.5-10.0 | phone | **R2 still used as footage** (screen and lights animated over the still) |
| 17.0-20.0 | presents invitation | **R1 still used as footage** |
| 20.0-23.5 | reach and touch | **R3 still used as footage** |
| 23.5-26.5 | passage | **R4 still used as footage** (parallax warp of the still) |
| 41.6-49.6 | letter | **R6 still used as footage** (envelope and hands cut from the still) |
| 49.6-53.1 | morning | **R2 still used as footage** (re-lit) |
| 10.0-17.0 | fairy | On blank ivory paper, not in the room |
| 36.6-41.6 | crocus | OK: original V13 flower kept; R5 used only as a style target for the surroundings |

V3 is withdrawn as a production edit. The six reference files are untouched (`film_v3/refs/`, read-only).

## 2. V3.1 ordered review cut (free, no reference image used as footage)
`edit/PetalPal_Film_V3_1.mp4`, 60.0 s, storyboard order. Edit list: `edit/edl_v3_1.json`.

| # | Time | Beat | Clip | Status |
| --- | --- | --- | --- | --- |
| 1 | 0.0-3.5 | Dreamy rainy night | V01 | Reuse |
| 2-3 | 3.5-12.2 | Phone notification; the viewer opens the invitation; it lifts off the screen | S02 (v2) | Reuse now; **needs genuine animation** (see 3) |
| 4 | 12.2-19.2 | Fairy emerges from the invitation's light into the room | **A01 accepted performance, now composited into the rainy room** (A01 file unchanged) | New free composite |
| 5-6 | 19.2-22.2 | She offers her palm; the viewer's hands reach; contact light | S06 re-rendered in the same room | Reuse now; **needs genuine animation** |
| 7 | 22.2-30.0 | Magic swirl; wisteria passage; her light leads | S07 + K03orb (approved Kling 03) | Reuse; petals to be upgraded to volumetric (free) |
| 8 | 30.0-36.1 | Garden reveal; pavilion over the water | S09a, S09b | Reuse |
| 9 | 36.1-40.1 | Journal entry; words become a seed | S10 | Reuse |
| 10 | 40.1-45.1 | Seed and the preserved crocus bloom | V3 crocus (original flower, restyled surroundings) | Reuse |
| 11 | 45.1-53.1 | Treehouse mailbox; the letter comes to the viewer and opens | S13 + S14 (v2, app art) | Reuse now; **needs genuine animation** |
| 12 | 53.1-56.1 | Return to the real world at dawn | S15 | Reuse now; restyle later |
| 13 | 56.1-60.0 | PetalPal logo and slogan | S19 | Reuse |

Score and sound design: First Cut v2's (this timeline is identical, so they stay in sync). Watermark lower right on every
shot, off for the title.

## 3. What each weak shot needs (the references are style targets only)
Method for every new shot: (a) a new keyframe still made with the approved fairy master (plus Pose A / Mid-Glide / Reach)
as the identity reference and the matching reference image as a style reference only; free master-face check and fix;
(b) Kling O3 Pro with pinned start/end frames so the motion is genuine and identity is anchored at both ends;
(c) exact text and UI composited afterwards. Each step is one labelled take, no automatic retries.

| Beat | New keyframes (Nano Banana Pro, $0.15 each) | Motion (Kling O3 Pro, $0.112/s) | Target look | Est. |
| --- | --- | --- | --- | --- |
| 2-3 Phone | Room-at-night plate with the viewer's hands holding the phone (no fairy) | 5 s: notification arrives, thumb taps (screen re-composited exactly) | R2 | 0.71 |
| 4 Emergence | Start: glowing invitation rising out of the phone in that room | 5 s: the same fairy emerges from the invitation light; end = A01-in-room first frame | R1/R2 | 0.71 |
| 5 Present + reach | Key: fairy in the room holding the invitation, free hand reaching to the viewer (master + Reach identity) | 4 s: from A01-in-room last frame to that key | R3 | 0.60 |
| 6 Touch | End key: viewer's fingertips touching her palm, same room and light | 5 s: the viewer's hands move in and touch; she responds | R3 | 0.71 |
| 7 Passage | none | none (free: volumetric petal pass over K03orb with matched camera motion) | R4 | 0.00 |
| 11 Mailbox | Start: mailbox with the letter glowing; end: viewer's hands holding the envelope | 5 s: envelope emerges, floats, is caught; 4 s: hands open it (message composited exactly) | R6 | 1.31 |
| 12 Dawn | Morning room plate, phone showing the garden (screen composited) | none or 3 s gentle motion | R2 at dawn | 0.15-0.49 |
| Sound | MMAudio over the finished cut (2 x 30 s) | | | 0.06 |
| Reserve | Retakes for about half the shots | | | 2.00 |
| **Total** | | | | **about 6.3** of the $9.80 remaining |

Order of work if approved: stills for beats 4-6 first (identity check, your approval), then their motion; then phone and
mailbox; then dawn; then sound and the final grade (restrained bloom).
