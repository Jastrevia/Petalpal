// Live switches for the apps, set in the backend's environment (Render) and read by every app at launch
// and when it returns to the front (mobile services/appConfig.ts). Changing one takes effect without a
// release: Render restarts the service with the new value.
//
//   APP_MAINTENANCE_EN / APP_MAINTENANCE_ZH  a notice shown at the top of the app (either one turns it on)
//   APP_MAINTENANCE_BLOCKING=1               the notice covers the app instead (planned downtime)
//   APP_MIN_VERSION_IOS / APP_MIN_VERSION_ANDROID
//                                            older installed versions are asked to update before going on
//   APP_PAUSED_FEATURES=friendMessages,petalTarot
//                                            pauses those features in the apps and on this server
//
// docs/operations/INCIDENT_RUNBOOK.md says when to use which.
export const PAUSABLE_FEATURES = Object.freeze(["friendMessages", "petalTarot"]);

const text = value => (typeof value === "string" ? value.trim().slice(0, 600) : "");
const version = value => (typeof value === "string" && /^\d+(?:\.\d+){0,2}$/.test(value.trim()) ? value.trim() : null);

export function featurePaused(env, feature) {
  return String(env?.APP_PAUSED_FEATURES ?? "").split(",").map(item => item.trim()).includes(feature);
}

export function readAppConfig(env = process.env) {
  const en = text(env.APP_MAINTENANCE_EN), zh = text(env.APP_MAINTENANCE_ZH);
  return {
    maintenance: en || zh ? { blocking: env.APP_MAINTENANCE_BLOCKING === "1", message: { en: en || zh, "zh-Hans": zh || en } } : null,
    minimumVersion: { ios: version(env.APP_MIN_VERSION_IOS), android: version(env.APP_MIN_VERSION_ANDROID) },
    paused: PAUSABLE_FEATURES.filter(feature => featurePaused(env, feature))
  };
}

// Mounted before sign-in is required: an app too old to sign in must still learn it has to update.
// /healthz answers for the uptime monitor and includes the database; its answer is reused for a few
// seconds so polling it can never become load on the database.
const HEALTH_CACHE_MS = 10_000, HEALTH_TIMEOUT_MS = 3_000;
export function installAppConfig(app, database, { env = process.env, now = () => Date.now() } = {}) {
  app.get("/app-config", (_req, res) => {
    res.set("Cache-Control", "public, max-age=60").json(readAppConfig(env));
  });
  let health = { at: -Infinity, ok: false, pending: null };
  const check = async () => {
    let timer;
    try {
      await Promise.race([
        database.$queryRaw`SELECT 1`,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), HEALTH_TIMEOUT_MS); })
      ]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  app.get("/healthz", async (_req, res) => {
    if (now() - health.at > HEALTH_CACHE_MS) {
      health.pending ??= check().then(ok => { health = { at: now(), ok, pending: null }; return ok; });
      await health.pending;
    }
    res.set("Cache-Control", "no-store").status(health.ok ? 200 : 503).json({ ok: health.ok });
  });
}
