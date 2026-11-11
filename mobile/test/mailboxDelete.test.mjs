import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

// Mailbox: a letter can be deleted only once the server has it as read; a deleted letter is gone
// from this owner's mailbox and never counts as unread. Letters and Help & Feedback are untouched.
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
function server() {
  const state = {}; const calls = []; let fail = null;
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET'; calls.push(`${method} ${url}`);
    if (fail === method) return reply({ error: 'Mailbox is unavailable right now' }, 500);
    if (url === '/mailbox/letters/state') return reply({ read: Object.keys(state).filter(id => state[id] === 'read'), deleted: Object.keys(state).filter(id => state[id] === 'deleted') });
    const id = url.split('/')[3];
    if (method === 'PUT') { state[id] = 'read'; return reply({ letterId: id, read: true }); }
    if (method === 'DELETE') {
      if (!state[id]) return reply({ error: 'Read this letter before deleting it', code: 'LETTER_UNREAD' }, 409);
      state[id] = 'deleted'; return reply({ success: true, letterId: id });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };
  return { fetch, state, calls, failOn(method) { fail = method; } };
}
function app(backend, stored = null) {
  const items = new Map(stored ? [['petalpal.mailbox.readLetters.v1', JSON.stringify(stored)]] : []);
  const load = loadPlantingModules(undefined, { useSyncExternalStore: (_s, get) => get() },
    { getItem: async key => items.get(key) ?? null, setItem: async (key, value) => { items.set(key, value); } }, true, { fetch: backend.fetch }, true);
  load('../../../services/api').configureApi({ apiBaseUrl: '', getAccessToken: async () => 'token' });
  return { mailbox: load('../../../services/mailbox'), view: load('../../mailbox/mailboxReadState'), items };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Delete is available only after the server records the read; deleting removes the letter for good', async () => {
  const backend = server();
  const { mailbox, view } = app(backend);
  await tick();
  assert.equal(await mailbox.syncMailbox(), true);
  const id = 'letter-garden-1';
  assert.equal(view.mailboxLetters().length, 5);
  assert.equal(mailbox.isLetterReadConfirmed(id), false, 'unread: no Delete');
  // An unread letter cannot be deleted, even if asked directly.
  await assert.rejects(mailbox.deleteReadLetter(id), /Read this letter/);
  assert.equal(view.mailboxLetters().some(letter => letter.id === id), true);
  // Opening it records the read; a second open sends nothing more.
  const reading = mailbox.confirmLetterRead(id);
  assert.equal(mailbox.isLetterReadConfirmed(id), false, 'not before the server answers');
  assert.equal(await reading, true);
  assert.equal(mailbox.isLetterReadConfirmed(id), true);
  await mailbox.confirmLetterRead(id);
  assert.equal(backend.calls.filter(call => call.startsWith('PUT')).length, 1);
  assert.equal(view.isLetterRead(id), true, 'and it no longer counts as unread');
  await mailbox.deleteReadLetter(id);
  assert.deepEqual([...view.mailboxLetters().map(letter => letter.id)], ['letter-meadow-2', 'letter-moonbed-3', 'letter-friend-4', 'letter-news-5']);
  assert.equal(mailbox.isLetterReadConfirmed(id), false);
  // "Refresh": a fresh app against the same server still has it deleted.
  const again = app(backend);
  await again.mailbox.syncMailbox();
  assert.equal(again.view.mailboxLetters().some(letter => letter.id === id), false);
  assert.equal(again.view.mailboxLetters().length, 4);
});

test('a failed read keeps Delete unavailable; a failed delete keeps the letter', async () => {
  const backend = server();
  const { mailbox, view } = app(backend);
  await mailbox.syncMailbox();
  backend.failOn('PUT');
  assert.equal(await mailbox.confirmLetterRead('letter-news-5'), false);
  assert.equal(mailbox.isLetterReadConfirmed('letter-news-5'), false);
  backend.failOn(null);
  assert.equal(await mailbox.confirmLetterRead('letter-news-5'), true);
  backend.failOn('DELETE');
  await assert.rejects(mailbox.deleteReadLetter('letter-news-5'));
  assert.equal(view.mailboxLetters().some(letter => letter.id === 'letter-news-5'), true, 'still in the mailbox');
  assert.equal(mailbox.isLetterReadConfirmed('letter-news-5'), true, 'and can be tried again');
});

test('the unread glow follows read and deleted letters, and another account starts clean', async () => {
  const backend = server();
  const { mailbox, view } = app(backend);
  await tick(); await mailbox.syncMailbox();
  const unreadIds = () => view.mailboxLetters().filter(letter => !view.isLetterRead(letter.id)).map(letter => letter.id);
  const before = unreadIds();
  assert.ok(before.length >= 2);
  for (const id of before.slice(0, -1)) { await mailbox.confirmLetterRead(id); await mailbox.deleteReadLetter(id); }
  assert.deepEqual([...unreadIds()], [...before.slice(-1)], 'deleting read letters leaves the unread one unread');
  assert.equal(view.useUnreadMail(), true);
  await mailbox.confirmLetterRead(before.at(-1));
  assert.equal(view.useUnreadMail(), false);
  // Another account on this device: nothing of the first owner's deletions carries over.
  mailbox.scopeMailbox('someone-else');
  assert.equal(view.mailboxLetters().length, 5);
  assert.equal(mailbox.isLetterReadConfirmed(before.at(-1)), false);
});

test('the dialog says what was asked, and Help & Feedback is not a letter', async () => {
  const read = file => fs.readFileSync(new URL(`../src/components/mailbox/${file}`, import.meta.url), 'utf8');
  const copy = /en: \{ title: '([^']+)', body: '([^']+)',\s+cancel: '([^']+)', delete: '([^']+)'/.exec(read('DeleteLetterDialog.tsx'));
  assert.deepEqual(copy.slice(1), ['Delete this letter?', 'This letter will be permanently removed from your mailbox. This action cannot be undone.', 'Cancel', 'Delete']);
  // Delete is passed to the open letter only when the server has confirmed the read.
  assert.match(read('MailboxPage.tsx'), /onDeleteActive=\{canDeleteOpenLetter \? askDeleteOpenLetter : undefined\}/);
  assert.match(read('MailboxPage.tsx'), /isLetterReadConfirmed\(openLetterId/);
  assert.doesNotMatch(read('HelpFeedbackPanel.tsx'), /deleteReadLetter|services\/mailbox/);
});
