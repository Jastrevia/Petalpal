# PetalPal Garden/Fairy integration optimization reference

**Canonical engineering reference; reconciled 2026-10-12 (America/Vancouver).** Read after [WARNING.md](WARNING.md), which remains authoritative for privacy and credential safety, and alongside [AGENTS.md](AGENTS.md), [MOBILE.md](MOBILE.md) and [INTEGRATION_DEPLOYMENT.md](INTEGRATION_DEPLOYMENT.md). This document grants no permission to benchmark, change infrastructure, publish, merge or deploy.

**Current decision: root cause UNDETERMINED; Stage 1 is not suitable for merge.** Two bounded preparation/optimization attempts, the final diagnostic and the subsequent independent review did not establish performance acceptance. Preserve both candidates and all features. Do not restart rejected experiments or another optimization loop without new evidence and explicit task scope.

## 1. Source and evidence map

Historical records remain intact. This is the single entry point for future Garden/Fairy performance work; the older `optimization.md` and specialized reports are historical evidence, not competing operating procedures. Their old service-restoration/login instructions are superseded by current MOBILE/SOP guidance and the user's scope; do not execute them just to reproduce a benchmark.

| Identity | Exact source / disposition |
| --- | --- |
| Recorded main baseline | `1b40b75cf84ff66701e98878d2afb52c35dda6f9` (PR #33 documentation merge); not a claim about current deployed production |
| Complete V2 | [PR #34](https://github.com/JX-Technologies-Inc/Petalpal/pull/34), Draft; `integration/garden-fairy-v2`, `4b613417b87e3d4370143f1c66652a708b01dcb2`; preserved unchanged |
| Stage 1 | `integration/garden-fairy-stage1`: **uncommitted** candidate on the recorded main, preserved by `candidate.patch` in S below; no candidate commit, push or PR |
| Teammate source | `garden-fairy-interactions-v2`: `c40ae1430c9c08683ed65bfa0791b1fc3c98c31f`, then `2cb0c0f76e794d8dc825441ccfa6c66e61259ae2` |
| Earlier visual reference | `d26700d08b22ec264622c646671b16c9488f7bc2`; historical artwork/composition reference, not a matched October 11 performance control |

Local evidence links below are machine-local, mostly ignored/untracked, and will **not** arrive with a Git clone. Preserve the originals; do not commit raw traces/logs or recreate missing results. Labels H–A are used below.

| ID | Available evidence and location |
| --- | --- |
| H | [Garden/Fairy Optimization Baseline](/Users/xingranma/Desktop/PetalPal_JX-integration/optimization.md), existing untracked historical document, preserved without edits |
| L | [Rendering/lifecycle record](docs/integration/integration.md#garden-rendering--adaptive-quality); [growth performance record](docs/flower-visuals/PRODUCTION_GROWTH_PERFORMANCE.md) |
| V0 | [Original integration comparison](/tmp/petalpal-garden-fairy-v2-evidence/report.json); temporary, no SHA/variant identity embedded; associate with the original PR #34 task record, not a guessed experimental variant |
| V | [Full-feature bounded pass](/Users/xingranma/Documents/ChatGPT/jev/petalpal-garden-fairy-v2/output/garden-fairy-performance-pass-4b613417/report.json); same directory: `attempt.patch`, `before-entry.js`, `petalpal-garden-isolation.mjs`, `petalpal-garden-acceptance.mjs`, `petalpal-garden-vector-pixel-check.mjs`, `pixels/report.json`, rejected `attempt-export/` |
| S | [Stage 1 assessment](/Users/xingranma/Documents/ChatGPT/jev/petalpal-garden-fairy-stage1/output/garden-fairy-stage1-assessment-20261011/report.json); same directory: `candidate.patch`, `comparison.mjs`, five screenshots |
| D | [Final diagnostic](/Users/xingranma/Documents/ChatGPT/jev/petalpal-garden-fairy-stage1/output/garden-fairy-final-diagnostic-20261011/report.json); same directory: `diagnostic.mjs`; numeric summaries only, no retained raw browser trace |
| A | Astra Ultra's independent review: [REVIEW.txt](/Users/xingranma/Documents/ChatGPT/jev/output/garden-independent-review-20261011/REVIEW.txt), [report.json](/Users/xingranma/Documents/ChatGPT/jev/output/garden-independent-review-20261011/report.json), adjacent `experiment.mjs`; chat “Review Garden/Fairy performance”, ID `01a12ed9-38b5-78c0-bc7c-6b75c8ffa0d0` |

V's original numeric copies also remain in `/tmp/petalpal-garden-perf-pass/{initial,isolation,report}.json`, `acceptance/{isolation,report}.json` and `pixels/report.json`. Prefer the preserved V directory. Its `attempt-export/` is a **rejected experiment**, not an export of retained `4b613417`.

**Evidence gaps:** H does not link a separate sanitized input/static-picture or shoreline benchmark report; exact early browser/version, hardware, viewport, sample counts and pre-change measurement SHA are absent. Do not infer those from later runs or read raw `.expo` traces to fill them. The growth report's `output/production-growth-performance/{before,after,equivalence-and-timing,render-preparation}.json`, `output/production-growth-integration-checks/verified-results.json` and approved `output/flower-visual-checkpoints/PRODUCTION_GROWTH_V1_1_VISUAL_APPROVED/reference.json` were not found in searched local project/worktree locations. Their historical results remain document-backed. No independently attributable numeric report was located for the early raster-petal-cache experiment or deferred full-screen water rewrite. Native/device and actual presented-frame performance acceptance remain unavailable.

## 2. VERIFIED retained optimizations

“VERIFIED” here preserves the recorded validation scope, not a new test run or universal performance guarantee. The five Garden checkpoints below are ancestors of the recorded main.

| Checkpoint | Preserve this behavior | Historical evidence |
| --- | --- | --- |
| `a66d87f719dbe2741276c0a8c553208619a0c348` | Direct web pointer-release input; clear completed targets and retarget while moving; corrected B01 deck trace; ordinary destination tolerance 8→24 world units without widening narrow-path/stepping-stone constraints; speed 85→110 world units/s; immediate transform publication; remove redundant RAF/state/debug waits | H: responsive real-browser movement, 20/20 first clicks, retarget/completion/off-path/pan/zoom/navigation PASS |
| Same `a66d87f7` | Reuse static Skia/vector pictures instead of recording 2,000+ static nodes on animated frames; stable scene/growth children and renderer scheduling | H: pixel equivalence, input/static-picture/resource checks; 76/76 relevant historical tests and typecheck PASS |
| `abf310de041ab3dcd1217b169a46ce872b7ec805` | Cache conservative shoreline coverage once per decoded image; skip only guaranteed transparent output; retain contributing shader math/sampling and native rendering | H: exact GPU pixels across all seven islands, rotations and zoom; interaction/navigation PASS; 123 tests PASS, five pre-existing failures |
| `f5e49b4efe7ad06fd40b7248d1b324e6ab7f70fd` | Dispose replaced pictures, native handles, images, surfaces/contexts and registrations; block resource resurrection by late unmount submissions; release inactive Web surface while retaining canonical state | L: settled logout/unmount reaches 0 images/pictures/deferred resources/surfaces/GPU cache; repeated cycles stop accumulating; historical cache ceiling 384 MiB |
| `3e60ef2aa22b07e4d5478d0807b0cf8ab4f83ddd` | Lossless transparent-padding crops of 17 runtime layers, preserving visible pixels, registration/order and original artwork | L: decoded RGBA ~280.16→6.11 MiB; CanvasKit heap ~647.125→382.375 MiB (~40.9%). Later ~318.6 MiB across five warmed cycles is not a universal budget |
| `015673269676b02fdc78d713a734e1ed0bf59500` | Existing live-DPR/adaptive Web backing policy remains separate from logical geometry/camera; native renderer unchanged | L: reference-detail checks, 58 focused checks/typecheck/export and five resource cycles. **Historical implementation, not permission to lower the fixed 2× acceptance quality** |

Static pictures cache **commands**, not finished terrain pixels: shaders and image draws still replay. Preserve source-change invalidation, image references and disposal; “cached” does not mean GPU work disappears.

Production growth computation is separately verified in L, recorded at `280b6d759fd92bfadc82f6d7b57ceb7b84c75d4b`: static mask domains, bounded alpha/coverage/origin reuse, stable draw order and asset requests preserve deterministic output. Desktop Node 24.11.0, same module harness/inputs with CPU profiling, after module load: cold 30 parents **13,270.92→513.97 ms**, unchanged **0.102→0.079**, move **10,722.97→178.65**, Cancel **0.264→0.220**, add 29→30 **9,979.45→463.14**. Separate equivalence run: cold 566.80, move 186.59, add 476.67 ms. Stubbed preparation of 591 pieces over 500 unchanged calls: **0.284→0.067 ms**. These measure generation/JS preparation, **not startup, React reconciliation, decode/upload, GPU or FPS**; retain the specialized report's exact composition and cache limits.

### Historical timing baselines (H)

All values below are milliseconds. H calls some values “frame” timings but does not establish physical presentation; retain that limitation.

| Input/static-picture metric at DPR 2 (`a66d87f7`) | Before | After |
| --- | ---: | ---: |
| Movement start median / p95 | 23.4 / 40.9 | 1.8 / 7.6 |
| Canvas submission median | 80.9 | 16.6 |
| Scene recording p90 | 33.5 | 2.9 |
| Historical “frame p95” | 83.3 | 66.7 |

Shoreline (`abf310de`), matched warm runs in the same browser/scene at DPR 2: p50/p90/p95 **50.0/66.6/66.7→49.9/50.5/50.9 ms**. Some runs still reached ~67 ms. Early conditions missing from H must remain **UNKNOWN**, not backfilled with later viewport/hardware data. Neither baseline covers cold loading or guarantees a <40 ms p95.

### Native iOS texture budget (D, 2026-10-30)

First physical-device measurement: iPhone 15 Pro, Release, free signing, idle Garden, Time Profiler. Texture cache eviction forced PNG re-decoding every frame (about 93% of a saturated main thread, hangs near 0.8 s, thermal Serious to Critical). 512 MB did not change it; 1.5 GB did. Retained: native limit of a quarter of device memory, clamped to 512 MB–1.5 GB. After: main thread about 35%, thermal Fair, footprint about 1.65 GB. Limits: one device, idle camera, short runs; no presented-frame measurement, and no devices under 6 GB tested. Details in [MOBILE.md](MOBILE.md).

## 3. PR #34 and Stage 1 results

**Measurement vocabulary:** WebGL draw calls count submissions per scene redraw, not displayed frames. RAF callback intervals measure scheduling cadence, not FPS. JS/Skia CPU durations exclude unmeasured GPU work and may overlap. GPU elapsed queries include command-stream execution/scheduling within their scope; fences add queueing/polling delay. Headless compositor swap events do not establish physical scanout. Never invert callback intervals, draws, flushes or GPU queries and label the result “presented FPS.”

October 11 comparisons use Apple M2 / Chromium / ANGLE Metal, viewport **1280×800**, canvas **1280×736 CSS / 2560×1472 backing**, DPR **2**, existing BALANCED tier fixed at **2×** by the isolated harness, same initial camera and idle active animations, one visible Canvas, synthetic loopback fixtures and blocked external traffic. Each normal run samples **120 callbacks**; comparison warmup 4 s, final diagnostic 6 s. D and A explicitly use headless Chrome; older scripts default headless but their saved reports do not record the `HEADED` invocation value or exact browser version. Do not compare these numbers directly with H's 1280×656 scene.

Reused export paths: main `petalpal-cloudflare-migration/mobile/dist`, Stage 1 `petalpal-garden-fairy-stage1/mobile/dist`, under `/Users/xingranma/Documents/ChatGPT/jev/`. S pins the main/base and full-feature SHA; V pins `4b613417` but not its baseline SHA; D records preservation rather than self-contained source SHAs. Preserve this provenance limitation instead of inventing a Stage 1 commit or silently substituting a fresh build.

| Record / order | Main callback means | Candidate callback means | Other evidence / disposition |
| --- | --- | --- | --- |
| V0, original pair | 34.0267 | 52.0817 | Median/p95 main **33.3/50.0**, PR **50.0/66.7**; slower candidate; V0 alone does not identify a particular experimental variant |
| V, initial main/PR pair | 38.7483 | 41.8042 | ~**141→352 WebGL draws/scene redraw**; median 33.4→49.9; p95 66.6 both. Single pair, not acceptance |
| S, main/Stage1/main/Stage1/main | 41.6642, 43.6092, 40.9700 | 49.7200, 47.7767 | Run-mean **42.0811→48.7483 (+15.8%)**; Stage 1 median/p95 **50.0/66.7** both; main medians 33.5/49.9/33.4, p95 50.1/66.7/50.1; ~**141→148 draws**; FAIL |
| D, same interleaved order | 41.9433, 39.4425, 43.4700 | 48.4692, 50.1375 | Run-mean **41.6186→49.3033 (+18.5%)**; main median/p95 33.4/66.6, 33.4/50.1, 49.9/66.6; Stage 1 **50.0/66.7**, **50.0/66.8**; FAIL |
| A, controls bracket both Stage1/clip orders | 41.943, 44.720, 41.109 | Stage 1 48.332, 51.248; clip 50.554, 48.748 | Main mean **42.591**, Stage 1 **49.790**, clip **49.651**; clip rejected (§4) |

**Scope of Stage 1:** Fairy interactions, Treehouse/Mailbox, navigation/masks, terrain and 11 supporting PNGs retained. New koi/wakes, lotus contacts/ripples, floating petals and water/contact grading deferred intact on V2. Main's water/fish/lotus/waterfalls, combined land/shore rendering, cache ceiling, Canvas/renderer and quality policy restored. The full-screen V2 water-material/mineral-floor rewrite was separately deferred by owner decision; do not restore it or describe it as a retained optimization. All eventual teammate features remain preserved, not abandoned.

### Final diagnostic: what it does and does not isolate (D)

- Entire bounded pass: **107.745 s**. Normal timing windows above; separate **90-callback profile windows on the first pair only**. No parallel build/test load, browser errors or external requests.
- JS CPU per scene draw: main **8.85/5.38/6.88 ms**, Stage 1 **8.92/5.74**. Skia replay CPU: main **4.03/2.78/3.38**, Stage 1 **4.41/2.87**. These small differences do not explain the callback gap; native/minified/WASM samples do not reliably attribute component cost.
- Five identifiable terrain-runtime-shader submissions per Stage 1 scene redraw, absent in main. This establishes additional work, **not its GPU cost or the root cause**.
- Warm texture uploads: **0**. Cache residency stable within runs: main **318.374 MiB**, Stage 1 **356.849 MiB**, both ceiling **384 MiB**. WASM capacity main ~**648–650 MiB**, Stage 1 ~**750 MiB**, stable within each run. No observed warm growth/churn; larger residency still does not rule out bandwidth or hardware memory pressure.
- `EXT_disjoint_timer_query_webgl2`: main **22** valid samples, mean/median/p95 **84.782/75.100/116.650 ms**; Stage 1 **34**, **89.808/95.496/108.679**; no disjoint samples. Broad overlap, unequal sample counts and instrumentation/queueing prevent exclusive shader, physical-frame or throughput conclusions.
- Both Stage 1 run means exceed all three main means, reproducing S despite drift in controls; A independently reproduces slower Stage 1 callbacks. That supports a **repeatable callback-cadence regression in this harness**, not proof of the same percentage regression in presented FPS. Physical presentation and exact GPU/compositor/terrain attribution remain **UNDETERMINED**.

### Existing acceptance boundaries

Reuse V2 interaction/TypeScript/synthetic browser evidence and [CI run 38210831248](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38210831248): isolated security + Expo boundary PASS at the unchanged PR head. [CodeQL run 38210831200](https://github.com/JX-Technologies-Inc/Petalpal/actions/runs/38210831200) was **SKIPPED for Draft**, not PASS. V2 browser ordinary movement, Treehouse/Mailbox returns, pan/zoom and Back passed; this is not performance acceptance.

S records **29 targeted tests PASS**, Flower boundary PASS, changed-scope TypeScript **29 roots / 0 diagnostics**, synthetic export PASS and 11 source-identical assets. **Stage 1-specific browser interaction/pan/zoom/visual acceptance was not completed after the performance stop**; equivalent V2 interaction evidence remains separate. Do not infer Stage 1 acceptance from code equivalence. Historical failing fixtures/source hashes/HUD mocks and unavailable approved planting checkpoints must not be invented or rewritten to manufacture green checks.

## 4. REJECTED experiments and diagnostic-only exclusions

None of the following is a retained optimization. Preserve each failure and all control runs; best isolated windows are not a result. In historical rows, triples mean p50/p90/p95 milliseconds, **not presented FPS**.

| Attempt / evidence | Measurement and reason not retained |
| --- | --- |
| Spray trajectory/support exits (H) | DPR 2, default Fairy camera, 1280×656 CSS / 2560×1312 backing, query-free warm samples: original **1,021 samples: 33.3/33.8/50.0**; candidate **875: 33.3/34.4/50.0**. Conservative candidate passed **112 exact GPU pixel comparisons** (7 emitters ×8 times ×2 scales) but no repeatable gain. Additional per-particle branches failed one-byte pixel differences. Earlier ~50→33 median did not repeat; sparse GPU ranges ~10.6–16.7 vs ~12.9–17.2 ms overlapped |
| Flower atlas batching / AA clipping / grouped hard clips (H) | ~950 image-program draws for 1,955 pieces. Atlas failed exact pixels; AA clipping increased work. Conservative hard clips passed **12/12 exact pixels**. Early p95 50→34.1 did not survive final active implementation: original **1,132: 33.3/50.0/50.0**, candidate **998: 33.3/49.9/50.0**. Same 1280×656/DPR2, first 15 s excluded, no GPU queries/pixel work during timing; all candidates reverted |
| Water occlusion path clips / cached visibility early exit (H, October 6) | Each passed **36 exact pixels** (4 times ×9 views). Path clip added overhead. Metadata candidate **1,125: 33.3/33.4/33.5**, original **1,182: 33.3/33.4/33.4**, repeat candidate **783: 33.3/33.4/49.9**; restored original **733: 33.3/50.0/50.0**. Same 1280×656/DPR2. No repeatable gain; variable broad-water GPU ~7.5–11.5 / full GPU ~40–47 ms and SVG parsing ~0.05 ms/draw did not prove a fix |
| WebGL `high-performance` preference (H, October 6) | Same IAB/Apple M2/ANGLE Metal, default-vs-high-performance context, idle animations/reload camera, 1280×656/DPR2; 15 s warmup, no detailed wrappers/fences. Pair 1 control **790: 33.4/50.0/50.1**, candidate **981: 33.3/50.0/50.0**; pair 2 control **756: 50.0/50.1/50.4**, candidate **763: 50.0/50.1/50.5**. No reproducible gain; reverted; no candidate exact-pixel certification |
| Extra per-frame WebGL flush (H) | Control **33.3/49.9/50.0**, flush **33.3/66.6/83.3**, repeated control **33.4/50.0/50.1**. Worse; removed |
| Early procedural raster petal cache (prior integration task record) | Rejected for visual/performance failure and removed. Temporary `cache-petal.png` / `vector-petal.png` remain under `/tmp/petalpal-garden-fairy-v2-pixel-evidence/`; no independently identified timing report recovered. The directory's current report labels `covered`/`uncovered`, so do not attribute its numbers to raster caching by filename proximity |
| Vector-command petal cache + zero-edge lotus noise shortcut (V) | Preserved petal drift/glints and contributing lotus math. **0 differing bytes** in initial/zoom/pan views; lotus 8 assets ×6 phases ×3 zooms exact; 12 affected tests, scoped TS/export PASS. Interleaved means: main **29.9983**, patch **41.8033**, main **32.6375**, patch **43.4700**, main **30.8325**, patch **54.3033**, main **47.6367**. Cadence FAIL; late host drift affects both. Entire patch/tests reverted, evidence archived |
| Stage 1 feature split (S) | Authorized staging decision, not an equivalent optimization: draw count returned **352→148**, but callback mean still **+15.8%** vs main; final diagnostic **+18.5%**. Candidate preserved locally, not accepted/published; no further feature splitting |
| Conservative zero-coverage terrain clip (A) | Runtime-only non-AA Difference clip inside transparent center of `GardenOuterBasin`'s 7200×7000 rectangle; same shaders/sampling/backing/animation. Order mainA/Stage1A/clipA/mainB/clipB/Stage1B/mainC, 120 callbacks then separate 64-callback GPU windows. Stage 1 pooled **49.790**, clip **49.651 ms**; paired changes **+2.223 / −2.500 ms**, ~0.28% pooled difference not repeatable. ~148 draws both. GPU means Stage 1 **105.876/92.940**, clip **102.347/111.283 ms** (15–16 samples/run) overlap/reverse; main **76.252/87.184/94.549**. No pixel/interaction acceptance run after performance stop. Browser close removed hook; source/export files untouched. Rejects this intervention, not every fill-rate hypothesis |

**V omission diagnostics were not fixes:** full-PR controls mean 40.8317/45.415 ms; no fish 38.8867, no wake 38.7483, no petals 39.0258, no lotus contacts+ripples 34.4433, no terrain 37.3592. Removing petals reduced ~352→188 draws and script CPU/scene ~9.3→5.6 ms. Those single noisy omissions identify marginal work, not repeated causal estimates or permission to remove features. `noDraw` median/p95 16.7/16.8 isolates update work but removes rendering. Cache ceiling 384 diagnostic mean 37.9158 with unchanged ~364 MiB residency did not establish a cache fix; full V2 ceiling was 512 MiB, Stage 1/main 384. Both compared variants had three active **Reanimated** callbacks; this is not the count of all browser RAF callbacks. Inactive DEV audit counters do not prove zero React commits.

### Historical GPU queue/RAF correlation (H): no optimization retained

Same idle scene/reload camera/DPR2, 2560×1312 backing, first 15 s excluded. Sparse non-disjoint queries every 60 submissions, zero-timeout fences, no added flush/blocking/readback. Query-free controls: **748 samples 33.3/33.5/34.3**, **735 samples 33.3/33.4/33.5**; sparse diagnostics: **762 samples 33.3/33.4/33.8**, **747 samples 33.3/33.4/34.1**. Lower p95 also occurred in unchanged controls. Dense every-sixth-frame probes produced **33.6/50.1/50.6** and perturbed CPU timing; never use them as clean acceptance windows.

Sparse GPU elapsed medians **39.1/38.6**, p95 **43.0/39.8 ms** include scheduling. Second-run fence head median/p95 **102.2/108.8**, tail **127.3/136.4**, observed head→tail **32.2/33.8 ms**; polling uncertainty ~10–14 ms, three later submissions before head signaled. Earlier ~110–150 ms completion observations likewise include queueing/polling. Record median/p95 **2.1/2.6**, renderer draw **6.9/7.3** including flush **1.4/1.6**, publication→draw **0/0.1 ms**, one submission/RAF; no warm long tasks or observed exposed slow sync/readback calls. Same-size/DPR compositor-only control ~16.7 ms. Buffered completion/backpressure is observed; exact driver/swap stall, queue depth and presentation deadlines remain unresolved. Temporary probes removed, original source restored; no new optimization.

## 5. UNDETERMINED causes; UNTESTED opportunities

There is no evidence-backed source patch ready to implement. Stable uploads, small measured CPU differences and near-main draw counts do not isolate Stage 1's regression. Neither repeated picture recording, per-frame React rendering, duplicate idle submissions, texture thrashing nor a particular terrain shader has been proven responsible.

The independent review establishes that main and Stage 1 share the Canvas/static-picture/cache implementation; full-canvas replay is shared behavior. Terrain has no time uniform or explicit new `saveLayer`/per-frame surface allocation; shore raster creation depends on its memoized image. A transparent-region clip failed. Do not convert any of these observations into a confirmed root cause.

| UNTESTED opportunity | Evidence and the new result required before implementation |
| --- | --- |
| Actual batching/composition for deferred water effects | V establishes extra petal/lotus submission work; existing vector picture caching did not remove enough GPU work. If separately authorized, evaluate actual atlas/vertices batching of compatible petals, koi/wakes and lotus sampling while preserving source-over order, clipping, blur/glints, per-instance phase/motion, density and original dynamic behavior. Require lower measured submission/render cost **and** exact/approved visual and interleaved performance acceptance. This is a follow-up plan, not proof of a Stage 1 fix; prior flower-atlas pixel failure remains a warning |
| Submission clustering by RAF timestamp/input event | A: Fairy idle clock plus queued draw microtasks can publish separate generations, but ~121–122 scene draws per 120 intervals argues against substantial sustained idle duplication. Need allowlisted `setPicture`/draw counts grouped by RAF timestamp and input, without changing clocks. No scheduling rewrite is justified yet |
| GPU state transitions / composition or bandwidth | A: shader/image batches can cost more than their draw count; no explicit terrain intermediate surface found. Need bounded numeric framebuffer/program switches, resolves and wait/readback attribution without per-draw state polling; separate instrumentation from clean timing. No demonstrated synchronization or terrain bottleneck yet |
| Presented-frame attribution | Current headless evidence cannot measure physical scanout. A future explicitly authorized investigation would need a demonstrably reliable presented-frame facility and matching hardware/browser/workload before making FPS claims. If unavailable, retain UNDETERMINED and stop; do not substitute another cadence loop |

These are research candidates, not authorization or a queue to exhaust. The completed bounded passes remain closed. Do not repeat transparent-terrain clipping, vector petal caching, lotus shortcuts, quality changes or speculative cache infrastructure under a new name.

## 6. Source paths and non-regression gates

Paths are repository-relative unless a preserved branch is named. Existing main implementation:

- Input/movement: `mobile/src/app/garden-test.tsx`; `mobile/src/components/garden/fairy/{GardenFairy.tsx,walkNetwork.ts}`.
- Rendering/caching/lifecycle: `mobile/src/components/garden/{GardenCanvas.web.tsx,GardenScene.tsx,GardenStaticPicture.tsx,GardenStaticPicture.web.tsx,gardenWebRenderer.ts,webNativeHandles.ts,webCanvasCache.ts,LandLayer.tsx,registeredArtwork.ts}`.
- Shore/water: `mobile/src/components/garden/water/{GardenShoreContact.tsx,FishLayer.tsx}`; growth: `mobile/src/components/garden/planting/{ProductionGrowthLayer.tsx,ProductionPlantedFlowers.tsx,landAwareGrowth.ts}` and `mobile/src/components/garden/flower-density-sandbox/monthly-growth/`.
- Stage 1/V2 additions: `mobile/src/components/garden/{GardenOuterBasin.tsx,GardenRightPondShore.tsx}`, `mobile/src/components/garden/fairy/{FairyNavigation.ts,groundNavigation.ts,gardenGround.ts,treehouseDestination.ts,mailboxDestination.ts}`, `mobile/src/components/garden/performance/{runtimeAudit.ts,GardenRuntimePanel.tsx}`. Read from the preserved candidates, not main; terrain replay paths are the focus of A.
- Deferred water feature reference at V2 `4b613417`: `mobile/src/components/garden/water/{FishLayer.tsx,FishSurfaceWake.tsx,fishMotion.ts,FloatingPetalLayer.tsx,floatingPetalConfig.ts,LotusSurfaceRipples.tsx,GardenLotusContact.tsx,terrain/koi-atlas-v2.png}`. The independent full-screen water rewrite remains in the original teammate source, not in retained V2's main water material.
- Regression evidence: `mobile/test/{fairyInput.test.cjs,fairyWalk.test.cjs,gardenStaticPicture.test.cjs,gardenRuntimeResources.test.mjs,gardenShoreCoverage.test.cjs,gardenRenderQuality.test.mjs,gardenArtworkBudget.test.mjs,productionGrowthPerformance.test.mjs,productionGrowthRenderCache.test.mjs,growthCoverageCache.test.mjs,growthStaticData.test.mjs}`; candidate-only `gardenFairyV2.test.cjs` plus `mobile/scripts/{checkTreehouseEntry.cjs,checkMailboxInteraction.cjs,checkGardenGround.cjs}`.

**Mandatory constraints:** no lower DPR/backing resolution, sampling/image quality, animation density/detail/fidelity, target frame rate or frame skipping; no static replacements or feature removal presented as an equivalent optimization. Preserve original Garden artwork, camera/world geometry, free pan/zoom, navigation constraints, 110-unit/s responsive Fairy movement, retargeting, exactly-once interaction handoffs and existing main water material. Do not make all terrain walkable. No delayed gesture recognition, per-frame React state, repeated static-picture recording, leaks or late resource resurrection. No weakened auth/owner/data/security boundary.

**Decision guide for the next agent:**

1. Read this document before proposing performance work. Identify exact source/patch, changed paths and authorized scope; leave V2, Stage 1 and historical evidence intact.
2. If the relevant source/config/dependencies are unchanged, reuse accepted tests and reports. Documentation needs only diff/link/reference checks, not builds, tests or benchmarks. Do not restore old services or reopen provider/credential investigations.
3. If a proposal repeats §4, stop unless concrete new evidence explains why the failed mechanism/test no longer applies. Neither a low draw count nor a best p95 sample establishes acceptance.
4. For newly authorized work, define one bounded hypothesis and stopping condition. Match browser mode/version, hardware, viewport/backing/DPR/tier, camera, fixtures/flower counts, active animations, warmup and workload; interleave main controls and retain all runs/drift. Keep GPU/trace instrumentation separate from normal timing. Record only safe numeric metadata.
5. A retained change needs the claimed metric to improve repeatably without meaningful regression, visual/animation equivalence, interaction/pan/zoom correctness and lifecycle/memory safety. Run only affected existing tests and the changed-scope TypeScript check from the SOP; use exact-source CI when available. Missing historical fixtures are missing evidence, not permission to recreate approvals.
6. If attribution or acceptance remains unavailable, report **UNDETERMINED / NOT VERIFIED**, preserve the functional work and stop. Stage 1 remains **not suitable for merge**; PR #34 remains Draft. Source review can proceed only with those blockers explicit. No automatic commit/push/merge, build/deployment, migration or provider action follows from this reference.
