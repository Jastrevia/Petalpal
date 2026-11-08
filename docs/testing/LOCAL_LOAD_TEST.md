# Local backend load test — 2026-11-07

A local, synthetic-data load test of the PetalPal backend on `main` (`bff9e5a2`), the CPU
profile that explains its limits, and the measured effect of caching timezone formatters
(branch `perf/date-formatter-cache`). These are laptop numbers, not production capacity.

## Result in one paragraph

With 25 concurrent users the API served about 535 requests per second at p95 69 ms with no
errors. Throughput fell and latency rose past that point because the single Node process
saturated its CPU (about 98%) while PostgreSQL stayed near 3% per backend, so the database
was not the bottleneck. A CPU profile found per-request construction of
`Intl.DateTimeFormat` among the hotspots. Caching validated zones and formatters lowered p95
by about 12% and p99 by about 18% at 100 users; throughput changed by about +5%, inside the
run-to-run noise.

## Setup

| Item | Value |
| --- | --- |
| Code | `main` at `bff9e5a2` (baseline) and `perf/date-formatter-cache` (fix) |
| Machine | Apple M2, 8 cores, 8 GB, macOS 27.2; load generator on the same machine |
| Runtime | Node v24.7.0 (bundled tzdata 2025b), PostgreSQL 17.11 with pgvector (Postgres.app) |
| Database | Fresh local cluster on `127.0.0.1:55432`, database `petalpal_load_test`, all migrations applied; `DEV_DATABASE_URL` only, so `lib/database-isolation.js` confirms isolation |
| Identity | Synthetic users through the existing `setFirebaseTokenVerifierForTests` hook; no Firebase project, credentials or `.env` values involved |
| Users | One synthetic account per virtual user, created through `POST /auth/session` |
| Requests | Read-only `GET /session` and `GET /users/:userId/garden`, alternating; `/api/fairy/runtime` was left out because it returns 409 until onboarding is finished |
| Rate limits | Raised through the existing `RATE_LIMIT_*_MAX` variables so the limiter did not cap the measurement |
| Duration | 60 seconds per level after seeding |
| Connection pool | Prisma `PrismaPg` default unless stated |

Not touched: hosted TEST, production, AI endpoints (no paid inference), GitHub Actions.

## Baseline: `main` at `bff9e5a2`

| Concurrent users | Requests per second | p50 | p95 | p99 | Errors |
| --- | --- | --- | --- | --- | --- |
| 25 | 535 | 46 ms | 69 ms | 119 ms | 0 |
| 50 | 467 | 108 ms | 188 ms | 235 ms | 0 |
| 100 | 280–366 over four runs | 271–373 ms | 471–608 ms | 557–757 ms | 0 |

At 100 users `/session` was about twice as slow as `/garden` (p95 about 650 ms versus about
270 ms): it reads the user, upserts `FairyState`, reads today's check-in and builds the full
Garden response.

## What limits throughput

- **CPU, not the database.** Sampled mid-run at 100 users: the Node server about 98% CPU, the
  load generator about 11%, each PostgreSQL backend about 3%.
- **Connection pool is not the fix.** A 30-connection pool raised one 100-user run to
  401 req/s, within the baseline's own run-to-run range, and combined with the formatter fix
  in a scratch copy it gave no further benefit. The default pool was kept.
- **Profile** (50 users, 20 s, `node --cpu-prof`): Prisma client code about 23% of self time,
  socket writes about 14%, `getSupportCalendarDay` about 4% plus `normalizeTimezone` and
  `getLocalDate`, each building a new `Intl.DateTimeFormat` on every call.

## Fix: cached timezone validation and formatters

`normalizeIanaTimezone` in `lib/ai-periods.js` now remembers valid zone names, and
`localDateForInstant` already reused one formatter per zone. `getLocalDate` and
`normalizeTimezone` in `server.js` and `getSupportCalendarDay` in `lib/flower-support.js`
now delegate to them instead of building formatters per call. Unknown zones are never cached
and each cache resets at 1,000 entries, so client-supplied strings cannot grow memory without
bound. Behavior is unchanged; see `time.md` §5 and `test/back/timezone-cache.test.js`.

Before and after, alternating runs at 100 users, 60 s each, default pool:

| Run | Requests per second | p50 | p95 | p99 | Errors |
| --- | --- | --- | --- | --- | --- |
| `main`, round 1 | 316 | 271 ms | 608 ms | 756 ms | 0 |
| fix, round 1 | 306 | 350 ms | 539 ms | 629 ms | 0 |
| `main`, round 2 | 280 | 373 ms | 602 ms | 730 ms | 0 |
| fix, round 2 | 320 | 339 ms | 521 ms | 586 ms | 0 |
| **`main` average** | **298** | | **605 ms** | **743 ms** | |
| **fix average** | **313 (+5%)** | | **530 ms (−12%)** | **608 ms (−18%)** | |

p95 and p99 were lower with the fix in both rounds; the throughput difference is within
noise. An earlier exploratory run in a scratch copy showed a much larger gain, but it did not
repeat and is not counted.

## Limits of this test

- One laptop runs the server, PostgreSQL and the load generator, so they compete for CPU and
  runs vary by up to about 30%.
- Synthetic accounts are new, with small Gardens; real accounts with more flowers send larger
  responses.
- Two read endpoints only; no writes, sockets or AI paths.
- Not a statement of production capacity; production runs on different hardware and network.

## How to repeat

1. Start an isolated PostgreSQL 17 with pgvector on a spare local port and create a database
   whose name ends in `_test`.
2. In a checkout of the code under test: `npm ci --ignore-scripts`, then with only
   `DEV_DATABASE_URL` set run `npx prisma generate` and `npx prisma migrate deploy`.
3. Start the server from a small harness outside the repo that sets `DEV_DATABASE_URL`,
   raises `RATE_LIMIT_ADMISSION_MAX`, `RATE_LIMIT_GENERAL_MAX`, `RATE_LIMIT_AUTH_MAX`,
   `RATE_LIMIT_AUTH_ACCOUNT_MAX` and `RATE_LIMIT_NEW_ACCOUNT_MAX`, installs a synthetic verifier
   with `setFirebaseTokenVerifierForTests` from `lib/auth.js`, then imports `server.js` and
   calls `server.listen` on `127.0.0.1`.
4. Create one account per virtual user with `POST /auth/session`
   (`name`, `communityTermsVersion` from `lib/community-policy.js`), then run each virtual
   user against `/session` and `/users/:userId/garden` for 60 s and summarize with `report()`
   from `scripts/load-test.mjs`.
5. Compare code versions by alternating runs, never back-to-back runs of one version.

Never point the harness at hosted TEST or production, and never include AI endpoints.
