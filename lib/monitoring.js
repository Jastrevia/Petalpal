import * as Sentry from "@sentry/node";

// Error reports from the backend (Sentry), so a failing route reaches the founders within minutes.
// Off unless SENTRY_DSN is set (Render). Reports follow the same rule as the server logs
// (security-log.js): which route failed, the error's type and code, and where in the code. Never
// the error's own message, a request, a body, headers, cookies, a user or a breadcrumb trail.
let enabled = false;

export function startServerMonitoring(env = process.env) {
  if (!env.SENTRY_DSN || enabled) return enabled;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.PETALPAL_ENVIRONMENT || (env.NODE_ENV === "production" ? "production" : "development"),
    release: env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend: scrubServerEvent
  });
  enabled = true;
  return true;
}

export function scrubServerEvent(event) {
  delete event.request;
  delete event.user;
  delete event.extra;
  delete event.contexts?.runtime_env;
  event.breadcrumbs = [];
  // Only errors reported through reportServerError carry a message written here; any other
  // (an uncaught exception) keeps its type and stack but not its message.
  if (!event.tags?.route) {
    for (const value of event.exception?.values ?? []) value.value = "[message withheld]";
    if (event.message) event.message = "[message withheld]";
  }
  return event;
}

/** Called by logServerError for every server error it logs. */
export function reportServerError(context, error, details = {}) {
  if (!enabled) return;
  const type = typeof error?.name === "string" && /^[A-Za-z0-9_.]{1,64}$/.test(error.name) ? error.name : "Error";
  const safe = new Error(String(context).slice(0, 200));
  safe.name = type;
  // The original stack's frames say where it broke; its first line (the original message) is dropped.
  const frames = typeof error?.stack === "string" ? error.stack.split("\n").slice(1).join("\n") : "";
  safe.stack = `${type}: ${safe.message}\n${frames}`;
  Sentry.withScope(scope => {
    scope.setTag("route", String(context).slice(0, 200));
    for (const [key, value] of Object.entries(details)) scope.setTag(key, String(value));
    Sentry.captureException(safe);
  });
}
