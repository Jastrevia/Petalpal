// The Mailbox's letters are app content (mobile/src/components/mailbox/mockLetters.ts), the same
// for everyone. The server keeps only each owner's own state for them: read, and deleted from
// their mailbox. Everything here acts on the signed-in owner's rows and nobody else's.
// The ids must match the app's letters (test/back/mailbox.test.js checks).
export const MAILBOX_LETTER_IDS = Object.freeze(["letter-garden-1", "letter-meadow-2", "letter-moonbed-3", "letter-friend-4", "letter-news-5"]);
const known = new Set(MAILBOX_LETTER_IDS);

export function installMailbox(app, { db }) {
  const fail = (res, error, what) => { console.error(what, error?.code || "error"); res.status(500).json({ error: "Mailbox is unavailable right now" }); };
  const bare = req => !Object.keys(req.body ?? {}).length && !Object.keys(req.query ?? {}).length;

  app.get("/mailbox/letters/state", async (req, res) => {
    try {
      const rows = await db.mailboxLetterState.findMany({ where: { userId: req.auth.userId }, select: { letterId: true, deletedAt: true } });
      res.set("Cache-Control", "no-store").json({
        read: rows.filter(row => !row.deletedAt).map(row => row.letterId),
        deleted: rows.filter(row => row.deletedAt).map(row => row.letterId)
      });
    } catch (error) { fail(res, error, "GET mailbox state error"); }
  });

  // Opening a letter records it as read. Repeating it changes nothing.
  app.put("/mailbox/letters/:letterId/read", async (req, res) => {
    const { letterId } = req.params, userId = req.auth.userId;
    if (!known.has(letterId) || !bare(req)) return res.status(400).json({ error: "Unsupported request" });
    try {
      const row = await db.mailboxLetterState.upsert({ where: { userId_letterId: { userId, letterId } },
        create: { userId, letterId }, update: {}, select: { deletedAt: true } });
      if (row.deletedAt) return res.status(404).json({ error: "Letter not found", code: "LETTER_DELETED" });
      res.json({ letterId, read: true });
    } catch (error) { fail(res, error, "PUT mailbox read error"); }
  });

  // Removes a letter from the signed-in owner's mailbox, only once the server has it as read.
  // The write itself is conditional on "this owner, read, not yet deleted", so it is safe to repeat.
  app.delete("/mailbox/letters/:letterId", async (req, res) => {
    const { letterId } = req.params, userId = req.auth.userId;
    if (!known.has(letterId) || !bare(req)) return res.status(400).json({ error: "Unsupported request" });
    try {
      const removed = await db.mailboxLetterState.updateMany({ where: { userId, letterId, deletedAt: null }, data: { deletedAt: new Date() } });
      if (removed.count === 1) return res.json({ success: true, letterId });
      const row = await db.mailboxLetterState.findUnique({ where: { userId_letterId: { userId, letterId } }, select: { deletedAt: true } });
      if (row?.deletedAt) return res.json({ success: true, letterId }); // already deleted
      res.status(409).json({ error: "Read this letter before deleting it", code: "LETTER_UNREAD" });
    } catch (error) { fail(res, error, "DELETE mailbox letter error"); }
  });
}
