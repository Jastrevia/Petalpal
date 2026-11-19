// A short heads-up to the team's shared channel when a report or feedback arrives
// (docs/release/MODERATION_RUNBOOK.md). Only the kind and category are sent, never what the user
// wrote, who they are or any id: the content is read in the staff page, behind staff sign-in.
// STAFF_NOTIFY_WEBHOOK_URL is a Discord or Slack incoming-webhook URL (https only); unset sends nothing.
// Fire-and-forget: a failed notice never fails the user's request.

const LABELS = Object.freeze({
  REPORT: { en: "New report", zh: "新举报" },
  AI_REPORT: { en: "New AI output report", zh: "新 AI 内容举报" },
  FEEDBACK: { en: "New feedback", zh: "新反馈" }
});
const CATEGORY = /^[A-Z_]{1,32}$/;

export function staffNotice(kind, category) {
  const label = LABELS[kind];
  if (!label) return null;
  const tag = typeof category === "string" && CATEGORY.test(category) ? ` · ${category}` : "";
  return `${label.zh} / ${label.en}${tag} — PetalPal staff page`;
}

function webhookUrl(env) {
  const value = env.STAFF_NOTIFY_WEBHOOK_URL;
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch { return null; }
}

export function notifyStaff(kind, category, { env = process.env, fetchImpl = fetch } = {}) {
  const url = webhookUrl(env), text = staffNotice(kind, category);
  if (!url || !text) return Promise.resolve(false);
  // Discord reads `content`, Slack reads `text`; each ignores the other.
  return fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error",
    body: JSON.stringify({ content: text, text }), signal: AbortSignal.timeout(5_000) })
    .then(response => { void response.body?.cancel?.().catch(() => {}); return response.ok; })
    .catch(() => false);
}
