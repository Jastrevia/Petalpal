# Deeper tarot reading (VIP agent)

Code: [lib/tarot-agent.js](../../lib/tarot-agent.js), wired in [lib/petal-reading.js](../../lib/petal-reading.js).
Migration `202611180009_tarot_agent_sources`. Switch: `AI_PETAL_READING_AGENT=true` (default off).

## Who gets it

VIP owners (lib/billing.js) with AI Processing, Personalization and Long-term Memory on. Everyone else, or any failure
in the agent, gets the existing plain reading. It counts against the VIP's 3 readings per local week like any reading.

## How it works (plan → tools → write)

1. **Plan** — Claude Haiku 5.5, gateway action `TAROT_PLAN`. Input: card name/orientation/keywords, topic, the tool
   list. No owner content. Output: 1–3 tool calls (schema-validated).
2. **Tools** — run by the server from a fixed allowlist, each argument validated, every query scoped to the owner:
   - `mood_stats { days: 7 | 30 }` — counts of the owner's Garden moods.
   - `memory_search { query: 2–60 chars }` — semantic search (BGE + pgvector) over the owner's own Event memories,
     at most 3 summaries, each cut to 240 characters, given short ids `m1…`; database ids never reach the model.
   - `past_readings { count: 1–5 }` — earlier cards and topics, never their text.
3. **Write** — Claude Opus 5.5, gateway action `PETAL_READING_DEEP`. The same voice rules and validator as the plain
   reading, plus the tool results. It may connect the card to at most two memories and must list their ids; an id the
   tools did not return fails the grounding check and the plain reading is written instead.

Both calls go through `CloudflareAiGateway`: cost reservation, consent re-checks (the deep call needs full memory
consent through the cost gate), per-action daily limits (`AI_TAROT_PLAN_DAILY_LIMIT`,
`AI_PETAL_READING_DEEP_DAILY_LIMIT`, default 3) and the user/global USD caps. The stored reading keeps `sources`
(`[{ kind: "MEMORY", eventDate }]`, no text) so the app can show "drew on your note from 28 Oct".

## Cost (estimate, list prices)

Plan ≈ $0.0005 (Haiku). Write ≈ $0.04–0.05 (Opus, a little more input than the plain reading). So about the same as a
plain reading per VIP reading.

## Not done / needs the owner

- No live model call has been made; tested with injected responses only. A paid TEST run needs your approval.
- `AI_DISCLOSURE_VERSION` was not bumped (the feature is off by default). Decide whether turning it on should ask
  everyone to re-read the AI disclosure.
- Reports (Weekly/Monthly) still use their existing pipelines; the same plan → tools → write pattern can be applied
  to the Monthly report later.

## App

`GET /api/petal-cards/today` and the reading response are unchanged except `sources` on a READY reading.
