# Emotion routing

Daily Grow uses this order:

1. No journal: `NO_AI`.
2. Journal: Natural Bayes runs locally first.
3. A valid local result whose normalized routing score and top-label margin meet the configured thresholds uses `LOCAL_CLASSIFIER`.
4. Low-score, ambiguous, or invalid local results use the existing Fast Llama Worker as `FAST_LLM_FALLBACK`.
5. If that fallback fails, Daily Grow continues with `DETERMINISTIC_FALLBACK`.

`confidence` on the local path is a normalized routing score derived from Natural's class scores. It is not a calibrated probability and must not be presented as a classification accuracy percentage.

Routing is configured with `EMOTION_LLM_FALLBACK_THRESHOLD` (default `0.75`) and `EMOTION_CLASSIFIER_AMBIGUITY_MARGIN` (default `0.20`). Distribution can be grouped by `EmotionResult.inferencePath`; indexes support time-window queries.

Event secondary emotions on the Workers AI path (`POST /events`) sit behind an in-memory circuit breaker (`lib/circuit-breaker.js`): after `AI_CIRCUIT_FAILURE_THRESHOLD` (default 5) consecutive provider failures the backend skips the call and its cost reservation for `AI_CIRCUIT_COOLDOWN_MS` (default 30000), recording `SKIPPED` / `CIRCUIT_OPEN`, so Events keep the user's Primary and a deterministic Flower. One trial call then decides whether the circuit closes. State is per instance and resets on restart.
