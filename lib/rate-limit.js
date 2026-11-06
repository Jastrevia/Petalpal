function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

import { ipKeyGenerator } from "express-rate-limit";
import { emitSecurityEvent, securityRouteClass } from "./security-events.js";
import { normalizeUsername } from "./accounts.js";

export function createRateLimiter({
  limit,
  windowMs,
  key = (req) => req.auth?.userId || req.ip,
  now = Date.now,
  maxKeys = 10_000,
  skipSuccessfulRequests = false,
  skipFailedRequests = false
}) {
  const requests = new Map();
  // Exact earliest expiry, or null after that bucket was reset/refunded away.
  // Recompute lazily at capacity; denials before expiry do no table traversal.
  let nextExpiration = Infinity;

  return (req, res, next) => {
    const timestamp = now();
    const identifier = String(key(req) || "unknown");
    let entry = requests.get(identifier);

    if (!entry && requests.size >= maxKeys) {
      if (nextExpiration === null || timestamp >= nextExpiration) {
        nextExpiration = Infinity;
        for (const [storedKey, stored] of requests) {
          if (timestamp >= stored.resetAt) requests.delete(storedKey);
          else nextExpiration = Math.min(nextExpiration, stored.resetAt);
        }
      }
      if (requests.size >= maxKeys) {
        // Never reset an active attacker's budget to make room for another key.
        res.set("Retry-After", String(Math.max(1, Math.ceil((nextExpiration - timestamp) / 1000))));
        emitSecurityEvent({ eventType: "rate_limit_exceeded", outcome: "denied", correlationId: req.requestId, routeClass: securityRouteClass(req), safeReason: "rate_limit", resourceClass: "rate_limiter" });
        return res.status(429).json({ error: "Too many requests. Try again later." });
      }
    }

    if (!entry || timestamp >= entry.resetAt) {
      if (entry?.resetAt === nextExpiration) nextExpiration = null;
      entry = { count: 0, resetAt: timestamp + windowMs };
      requests.set(identifier, entry);
      // Also covers a new earlier expiry after the wall clock moves backward.
      if (nextExpiration !== null) nextExpiration = Math.min(nextExpiration, entry.resetAt);
    }

    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000));
    res.set({
      "RateLimit-Limit": String(limit),
      "RateLimit-Remaining": String(remaining),
      "RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000))
    });

    if (entry.count > limit) {
      emitSecurityEvent({ eventType: "rate_limit_exceeded", outcome: "denied", correlationId: req.requestId, routeClass: securityRouteClass(req), safeReason: "rate_limit", resourceClass: "rate_limiter", count: entry.count });
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }

    if (skipSuccessfulRequests || skipFailedRequests) {
      res.once("finish", () => {
        if ((skipSuccessfulRequests ? res.statusCode < 400 : res.statusCode >= 400) && requests.get(identifier) === entry) {
          entry.count = Math.max(0, entry.count - 1);
          if (entry.count === 0) {
            requests.delete(identifier);
            if (entry.resetAt === nextExpiration) nextExpiration = null;
          }
        }
      });
    }

    // ponytail: in-process limits fit the current single-instance MVP; use a shared
    // store when Render runs multiple instances or limits must survive restarts.
    return next();
  };
}

export function rateLimiters(env = process.env) {
  const windowMs = positiveInteger(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
  return {
    // Coarse admission before Firebase/profile work, shared across interactive
    // API routes. Keep headroom for shared-IP users; retain all per-user limits.
    // Count successes too: every admitted request can incur verification cost.
    admission: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_ADMISSION_MAX, 1200),
      windowMs: positiveInteger(env.RATE_LIMIT_ADMISSION_WINDOW_MS, 60 * 1000),
      // Express resolves req.ip using TRUST_PROXY; never read raw forwarding
      // headers. The existing helper normalizes IPv4/mapped IPv4 and IPv6 /56.
      key: (req) => ipKeyGenerator(req.ip)
    }),
    general: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_GENERAL_MAX, 300),
      windowMs
    }),
    auth: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_AUTH_MAX, 20),
      windowMs,
      key: (req) => ipKeyGenerator(req.ip),
      skipSuccessfulRequests: true
    }),
    authAccount: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_AUTH_ACCOUNT_MAX, 20),
      windowMs,
      // Call only after token verification. Never trust a submitted email/UID.
      key: (req) => req.firebase.uid
    }),
    // Free accounts each get AI use, so how many one network can make is limited. A refused
    // attempt (a name already taken) costs nothing. Generous enough for a shared school network.
    newAccount: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_NEW_ACCOUNT_MAX, 10),
      windowMs: positiveInteger(env.RATE_LIMIT_NEW_ACCOUNT_WINDOW_MS, 24 * 60 * 60 * 1000),
      key: (req) => ipKeyGenerator(req.ip),
      skipFailedRequests: true
    }),
    // Wrong passwords against one name, from anywhere. Never keyed on anything but the submitted name.
    passwordLogin: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_PASSWORD_LOGIN_MAX, 10),
      windowMs,
      key: (req) => normalizeUsername(req.body?.login).slice(0, 100),
      skipSuccessfulRequests: true
    }),
    // Wrong current passwords (and refused new ones) against one signed-in account, from any network:
    // a stolen session can't guess the old password by moving between IPs. Call after sign-in is checked.
    passwordChange: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_PASSWORD_CHANGE_MAX, 10),
      windowMs,
      key: (req) => req.auth?.userId,
      skipSuccessfulRequests: true
    }),
    ai: createRateLimiter({
      limit: positiveInteger(env.RATE_LIMIT_AI_MAX, 30),
      windowMs
    })
  };
}
