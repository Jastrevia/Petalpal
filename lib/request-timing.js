// One JSON line per finished API request, so p50/p95 latency can be read from the
// Render logs (scripts/latency-summary.mjs). Logs only the matched route pattern
// ("/users/:userId/garden"), never the URL, ids, query, headers or body.
export function requestTimingEnabled(env = process.env) {
  return env.REQUEST_TIMING_LOG === "1" || (env.NODE_ENV === "production" && env.REQUEST_TIMING_LOG !== "0");
}

export function requestTiming({ log = line => console.log(line), now = () => performance.now() } = {}) {
  return (req, res, next) => {
    const started = now();
    res.on("finish", () => {
      // Static files, the web shell and unmatched paths have no Express route.
      if (!req.route?.path || typeof req.route.path !== "string") return;
      log(JSON.stringify({
        msg: "http_request",
        method: req.method,
        route: `${req.baseUrl || ""}${req.route.path}`,
        status: res.statusCode,
        ms: Math.round(now() - started)
      }));
    });
    next();
  };
}
