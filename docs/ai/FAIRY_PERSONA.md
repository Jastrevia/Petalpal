# Fairy persona: a fairy with a mind of her own

Code: [lib/fairy-persona.js](../../lib/fairy-persona.js), used by [lib/haiku-fairy-moment.js](../../lib/haiku-fairy-moment.js).
Migration `202611180010_fairy_persona`. Switch: `AI_FAIRY_PERSONA=true` (default off; needs `AI_FAIRY_MOMENT_MODEL`).

## What changes

Her Moments (posts) were already written by Claude Haiku 5.5 from her own place, mood and recent posts. With persona on:

- **Personality**: one of four personas (little botanist, tea lover, stargazer, explorer), each with traits, likes,
  dislikes and a voice. Every fairy gets one picked from her id (stable), until the owner chooses; the owner can change
  it once every 30 days. Rewrite the personas freely in the file; keep their ids.
- **Long-term memory**: her own earlier model-written posts (older than the last five she must not repeat), same place
  first, up to six, sent with short ids `e1…`. She may mention one as something she remembers and must return its id;
  an id she was not given fails the consistency check and the preset caption stays.
- **Opinions and the garden**: likes and dislikes include weather types, drinks and places; she gets today's Garden
  weather type (from live weather, if the owner turned it on) and the month's flower deity, so a rainy day or the
  snowdrop deity can show up in her posts.

Privacy is unchanged: she never sees the owner's Events, Journals or memories. The weather is sent as a type only
(`RAIN`), never a place.

Safety is unchanged too: the existing caption validator (language, length, no links or tags, community content check,
no repeat of a recent post) runs on every persona post.

Posting times are the existing Fairy Moments plan (posts are laid out over the time since the owner last opened the
app, and captions are filled when Moments are opened). No separate scheduler was added.

## API

| Route | Body | Returns |
|---|---|---|
| `GET /api/fairy/persona` | — | `{ id, name, chosen, nextChangeAt, options: [{ id, name }] }` |
| `PUT /api/fairy/persona` | `{ "personaId": "stargazer" }` | the same; 409 `PERSONA_TOO_SOON` within 30 days of the last change |

## Cost

Same model and number of calls as before (Haiku, one per post); a slightly larger input (input cap raised to 8 KB):
well under $0.001 per post.

## Not done

- No live model call was made (injected responses in `test/back/haiku-fairy-moment.test.js`).
- A human consistency review of real posts over a few weeks (the plan's evidence item) needs a paid TEST run.
