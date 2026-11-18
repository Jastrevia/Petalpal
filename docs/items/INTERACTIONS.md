# Tea house, group visits and gatherings

## Tea house (tap-to-interact)

Code: [lib/fairy-tea.js](../../lib/fairy-tea.js). Migration `202611180007_fairy_tea`.

The app plays the mini-interaction (steps `pick → brew → pour → drink`); the server checks the rules so rewards
cannot be farmed:

- One open tea at a time; tapping again returns the same session.
- `finish` is refused before `finishAfter` (8 s after start: no instant finishes) and after `expiresAt` (10 minutes:
  the tea went cold).
- At most 3 teas per account-local day, 20 minutes apart. Each finished tea gives 3 Fairy Bond points
  (`CLOSENESS_SOURCES.TEA`, capped 3 a day).

| Route | Body | Returns |
|---|---|---|
| `GET /api/fairy/tea` | — | `{ drinks: [{ id, name }], steps, session, todayCount, dailyLimit, nextAvailableAt, waitReason }` |
| `POST /api/fairy/tea` | `{ "drink": "rose-tea" }` (`flower-tea`, `rose-tea`, `honey-coffee`) | `{ session: { id, drink, status, startedAt, finishAfter, expiresAt } }` (201). 429 `TEA_COOLDOWN` / `TEA_DAILY_LIMIT` with `nextAvailableAt` |
| `POST /api/fairy/tea/:sessionId/finish` | `{}` | `{ session, awarded, levelUp, repeated }`. 409 `TEA_TOO_FAST` (with `finishAfter`), 410 `TEA_EXPIRED` |

Other buildings can reuse the same pattern with their own drink or activity list.

## Several fairies in one Garden

- `GET /api/visits/:hostUserId/fairies` → `{ fairies: [{ id, name, avatar, role: "HOST"|"VISITOR", x, y, outfit }], visitorLimit }`.
  Each `outfit` is that person's worn fairy pieces (docs/items/ITEMS.md), so every fairy is drawn dressed. Call it
  when entering a Garden and again on the existing `visitRecordAdded` / `avatarMoved` / leave socket events.
- **Capacity**: `POST /visit` answers **409 "This Garden is full right now"** once a Garden has `GARDEN_VISITOR_LIMIT`
  visitors (Render env, 1–20, default 6). Set it from the capacity test (fps, heat, memory vs. number of fairies on
  the weakest supported phone).

## Gatherings

Code: [lib/gatherings.js](../../lib/gatherings.js). Migration `202611180008_gatherings`.

A host invites friends to a one-hour dinner, picnic or tea party in the host's Garden. During the hour, guests visit
the Garden the normal way (`POST /visit`), and the app shows the gathering scene (table, group poses) when `live` is
true. Guests must be the host's friends and not blocked; the host must allow Garden visits. Up to 3 upcoming
gatherings per host; guests up to `GARDEN_VISITOR_LIMIT`.

| Route | Body | Returns |
|---|---|---|
| `GET /api/gatherings` | — | `{ gatherings: [...], visitorLimit }` (hosting or invited; ended ones stay one day) |
| `POST /api/gatherings` | `{ "kind": "DINNER", "title": "Moon dinner", "startsAt": "2027-01-09T03:00:00Z", "guestIds": ["user_…"] }` | the gathering (201) |
| `POST /api/gatherings/:id/respond` | `{ "accept": true }` | the gathering |
| `POST /api/gatherings/:id/cancel` | `{}` (host only) | the gathering |

A gathering: `{ id, kind, title, startsAt, endsAt, status: "SCHEDULED"|"CANCELED", live, host, youAreHost, yourInvite, guests: [{ id, name, avatar, status }] }`.
Socket event `gatheringUpdated { gatheringId, status }` goes to the host and every guest on create, answer and
cancel: refetch `GET /api/gatherings`.
