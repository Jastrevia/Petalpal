// In-app feedback (bug reports and ideas) and the staff views of feedback and reports
// (docs/release/MODERATION_RUNBOOK.md). Users send feedback with POST /feedback; staff (Firebase uids in
// MODERATOR_FIREBASE_UIDS, behind the existing /moderation gate) read and close it in the staff page.
// A new item only pings the team channel with its kind (lib/staff-notify.js), never its text.
import { notifyStaff } from "./staff-notify.js";

// The app's categories (mobile/src/components/feedback/feedbackTypes.ts), stored upper-case.
export const FEEDBACK_KINDS = Object.freeze(["BUG", "FEATURE", "GENERAL", "AI_CONCERN", "OTHER"]);
export const FEEDBACK_STATUSES = Object.freeze(["NEW", "READ", "DONE"]);
export const FEEDBACK_LIMITS = Object.freeze({ messageChars: 2000, subjectChars: 120, perDay: 5, noteChars: 1000, pageSize: 50 });
const PLATFORMS = new Set(["ios", "android", "web"]);
const FIELDS = new Set(["category", "subject", "message", "email", "route", "clientVersion", "platform"]);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,185}\.[^\s@]{2,}$/;

export class FeedbackError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const clean = value => value.normalize("NFC").replace(/\r\n?/g, "\n").trim();

// Validates the body; returns the row fields or throws FeedbackError(400). `email` is optional and only
// kept when the person typed one to get a reply.
export function parseFeedback(body) {
  if (!body || typeof body !== "object" || Object.keys(body).some(key => !FIELDS.has(key))) throw new FeedbackError("Unsupported feedback fields", 400);
  const { category, subject, message, email, route, clientVersion, platform } = body;
  const kind = typeof category === "string" ? category.toUpperCase() : null;
  if (!FEEDBACK_KINDS.includes(kind)) throw new FeedbackError("Choose a feedback category", 400);
  if (typeof message !== "string") throw new FeedbackError("Write a message", 400);
  const text = clean(message);
  if (!text || [...text].length > FEEDBACK_LIMITS.messageChars) throw new FeedbackError(`Feedback must be 1-${FEEDBACK_LIMITS.messageChars} characters`, 400);
  if (subject !== undefined && (typeof subject !== "string" || [...clean(subject)].length > FEEDBACK_LIMITS.subjectChars)) throw new FeedbackError("Subject is too long", 400);
  const replyEmail = typeof email === "string" ? email.trim() : "";
  if (email !== undefined && (typeof email !== "string" || (replyEmail && (replyEmail.length > 254 || !EMAIL.test(replyEmail))))) throw new FeedbackError("Invalid email", 400);
  if (route !== undefined && (typeof route !== "string" || !/^\/[0-9A-Za-z/_\-[\]]{0,119}$/.test(route))) throw new FeedbackError("Invalid page", 400);
  if (clientVersion !== undefined && (typeof clientVersion !== "string" || !/^[0-9A-Za-z.+-]{1,32}$/.test(clientVersion))) throw new FeedbackError("Invalid app version", 400);
  if (platform !== undefined && !PLATFORMS.has(platform)) throw new FeedbackError("Invalid platform", 400);
  return { kind, subject: subject ? clean(subject) || null : null, message: text, replyEmail: replyEmail || null,
    route: route ?? null, appVersion: clientVersion ?? null, platform: platform ?? null };
}

export async function createFeedback(db, userId, body, { now = new Date(), notify = notifyStaff } = {}) {
  const fields = parseFeedback(body);
  const recent = await db.appFeedback.count({ where: { userId, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } });
  if (recent >= FEEDBACK_LIMITS.perDay) throw new FeedbackError("Feedback limit reached. Try again tomorrow.", 429);
  const row = await db.appFeedback.create({ data: { userId, ...fields }, select: { id: true, kind: true, createdAt: true } });
  void notify("FEEDBACK", fields.kind);
  return row;
}

const pageQuery = query => {
  const keys = Object.keys(query);
  if (keys.some(key => !["status", "before"].includes(key))) throw new FeedbackError("Invalid query", 400);
  if (query.status !== undefined && !FEEDBACK_STATUSES.includes(query.status)) throw new FeedbackError("Invalid status", 400);
  let before = null;
  if (query.before !== undefined) {
    before = new Date(String(query.before));
    if (Number.isNaN(before.getTime())) throw new FeedbackError("Invalid cursor", 400);
  }
  return { status: query.status, before };
};

// Staff list, newest first, paged by createdAt. Shows the sender's display name and PP number, and the
// reply email only if they typed one into the form; never their account email or other private data.
export async function listFeedback(db, query = {}) {
  const { status, before } = pageQuery(query);
  const rows = await db.appFeedback.findMany({
    where: { ...(status ? { status } : {}), ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" }, take: FEEDBACK_LIMITS.pageSize,
    select: { id: true, kind: true, subject: true, message: true, replyEmail: true, route: true, appVersion: true, platform: true, status: true, staffNote: true,
      createdAt: true, reviewedAt: true, user: { select: { name: true, accountId: true } } }
  });
  const counts = await db.appFeedback.groupBy({ by: ["status"], _count: { _all: true } });
  return {
    items: rows,
    counts: Object.fromEntries(FEEDBACK_STATUSES.map(name => [name, counts.find(row => row.status === name)?._count._all ?? 0])),
    nextBefore: rows.length === FEEDBACK_LIMITS.pageSize ? rows.at(-1).createdAt.toISOString() : null
  };
}

export async function updateFeedback(db, id, body, { now = new Date() } = {}) {
  if (typeof id !== "string" || !/^[a-z0-9]{10,40}$/.test(id)) throw new FeedbackError("Feedback not found", 404);
  if (!body || typeof body !== "object" || Object.keys(body).some(key => !["status", "staffNote"].includes(key)) || !Object.keys(body).length) {
    throw new FeedbackError("Send status and/or staffNote", 400);
  }
  const data = {};
  if (body.status !== undefined) {
    if (!FEEDBACK_STATUSES.includes(body.status)) throw new FeedbackError("Invalid status", 400);
    data.status = body.status; data.reviewedAt = body.status === "NEW" ? null : now;
  }
  if (body.staffNote !== undefined) {
    if (body.staffNote !== null && (typeof body.staffNote !== "string" || [...body.staffNote].length > FEEDBACK_LIMITS.noteChars)) throw new FeedbackError("Invalid note", 400);
    data.staffNote = body.staffNote ? body.staffNote.trim() : null;
  }
  const { count } = await db.appFeedback.updateMany({ where: { id }, data });
  if (!count) throw new FeedbackError("Feedback not found", 404);
  return { success: true };
}
