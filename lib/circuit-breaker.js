// In-memory circuit breaker for an external AI provider on a request path.
// After `failureThreshold` consecutive failures the circuit opens and callers skip
// the provider (and its cost reservation) for `cooldownMs`, using their deterministic
// fallback instead. Then one trial call is let through: success closes the circuit,
// failure reopens it. A trial that never reports back expires after another cooldown.
// State is per backend instance; nothing is persisted.
export class CircuitBreaker {
  constructor({ failureThreshold = 5, cooldownMs = 30_000, now = () => Date.now() } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.failures = 0;
    this.openedAt = null;
    this.trialStartedAt = null;
  }

  get state() {
    if (this.openedAt === null) return "CLOSED";
    return this.now() - this.openedAt < this.cooldownMs ? "OPEN" : "HALF_OPEN";
  }

  allow() {
    const state = this.state;
    if (state === "CLOSED") return true;
    if (state === "OPEN") return false;
    if (this.trialStartedAt !== null && this.now() - this.trialStartedAt < this.cooldownMs) return false;
    this.trialStartedAt = this.now();
    return true;
  }

  record(success) {
    this.trialStartedAt = null;
    if (success) {
      this.failures = 0;
      this.openedAt = null;
      return;
    }
    this.failures += 1;
    if (this.openedAt !== null || this.failures >= this.failureThreshold) this.openedAt = this.now();
  }
}
