import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { GARDEN_NOTE_MAX_LENGTH } from '../../lib/garden-encouragement.js';

const ts = createRequire(import.meta.url)('typescript');
const src = new URL('../src/', import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value)); // VM-realm objects
function load(relative) {
  const exports = {};
  const source = fs.readFileSync(new URL(relative, src), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, { exports, Date, Math, Number, String, require: ref => { throw Error(`unexpected import ${ref}`); } });
  return exports;
}
const format = load('components/encouragement/encouragementFormat.ts');
const read = relative => fs.readFileSync(new URL(relative, src), 'utf8');

test('the note limit matches the server and counts characters as people see them', () => {
  assert.equal(format.DEFAULT_NOTE_MAX_LENGTH, GARDEN_NOTE_MAX_LENGTH);
  assert.equal(format.noteLength('  🌷🌷 hi  '), 5);
  assert.equal(format.noteProblem('   '), 'empty');
  assert.equal(format.noteProblem('a'.repeat(200)), '');
  assert.equal(format.noteProblem('🌷'.repeat(201)), 'long');
});

test('note dates read Today / Yesterday / a date, in the phone\'s local time', () => {
  const now = new Date(2026, 9, 25, 16, 0);
  assert.equal(format.noteDateLabel(new Date(2026, 9, 25, 14, 41).toISOString(), now), 'Today · 2:41 PM');
  assert.equal(format.noteDateLabel(new Date(2026, 9, 24, 9, 5).toISOString(), now), 'Yesterday · 9:05 AM');
  assert.equal(format.noteDateLabel(new Date(2026, 9, 21, 0, 15).toISOString(), now), 'Oct 21 · 12:15 AM');
  assert.equal(format.noteDateLabel(new Date(2025, 11, 31, 12, 0).toISOString(), now), 'Dec 31, 2025');
  assert.equal(format.noteDateLabel('not a date', now), '');
});

test('a received note becomes a mailbox letter signed by its sender', () => {
  const now = new Date(2026, 9, 25, 16, 0);
  const letter = plain(format.noteToLetter({ id: 'n1', text: 'Your flowers look especially peaceful today.',
    createdAt: new Date(2026, 9, 25, 14, 41).toISOString(), read: false,
    sender: { id: 'jean', name: 'Jean', avatar: 'fairy-3' } }, now));
  assert.equal(letter.id, 'note:n1');
  assert.equal(letter.sender, 'Jean');
  assert.equal(letter.signature, 'Jean');
  assert.equal(letter.senderAvatar, 'fairy-3');
  assert.equal(letter.body, 'Your flowers look especially peaceful today.');
  assert.equal(letter.date, 'Today · 2:41 PM');
  assert.equal(letter.read, false);
  assert.equal(letter.category, 'friend');
  assert.equal(format.noteIdFromLetter('note:n1'), 'n1');
  assert.equal(format.noteIdFromLetter('letter-garden-1'), null);
  const long = plain(format.noteToLetter({ id: 'n2', text: 'x'.repeat(120), createdAt: now.toISOString(), read: true,
    sender: { id: 'a', name: 'A' } }, now));
  assert.ok(long.snippet.endsWith('…') && [...long.snippet].length === 57);
  assert.equal(long.senderAvatar, null);
});

test('the owner summary is quiet and has no counters to chase', () => {
  assert.equal(format.supportSummary({ today: 1, total: 4, unread: 1 }), '1 friend supported your garden today');
  assert.equal(format.supportSummary({ today: 3, total: 4, unread: 0 }), '3 friends supported your garden today');
  assert.equal(format.supportSummary({ today: 0, total: 4, unread: 0 }), '4 kind visits so far');
  assert.equal(format.supportSummary({ today: 0, total: 0, unread: 0 }), null);
  assert.equal(format.unreadNotesLabel(0), null);
  assert.equal(format.unreadNotesLabel(2), '2 new notes in your mailbox');
});

test('the visitor re-reads its state shortly after local midnight', () => {
  const now = new Date('2026-10-25T19:00:00Z');
  assert.equal(format.msUntilReset('2026-10-26T07:00:00.000Z', now), 12 * 3_600_000 + 1_500);
  assert.equal(format.msUntilReset('2026-10-25T18:00:00.000Z', now), 5_000, 'a stale day re-reads soon, never in a tight loop');
  assert.equal(format.msUntilReset('nonsense', now), null);
});

test('the visit screen and Garden use the server state, not local flags', () => {
  const visit = read('app/visit/[ownerId].tsx');
  assert.match(visit, /<VisitorEncouragement key=\{`encouragement:\$\{viewerId\}:\$\{ownerId\}`\} ownerId=\{ownerId\} \/>/);
  const visitor = read('components/encouragement/VisitorEncouragement.tsx');
  assert.match(visitor, /loadVisitorEncouragement\(ownerId\)/);
  assert.match(visitor, /AppState\.addEventListener/);
  assert.match(visitor, /Supported Today ✓/);
  assert.match(visitor, /Message Left Today ✓/);
  assert.match(visitor, /ALREADY_SUPPORTED_TODAY/);
  assert.match(visitor, /ALREADY_MESSAGED_TODAY/);
  assert.doesNotMatch(visitor, /AsyncStorage|localStorage/, 'today\'s state is never kept only on the device');
  assert.match(read('components/garden/GardenHud.tsx'), /<OwnerEncouragementChip \/>/);
  const mailbox = read('components/mailbox/MailboxPage.tsx');
  assert.match(mailbox, /loadReceivedEncouragement\(\)/);
  assert.match(mailbox, /markEncouragementRead\(\{ messageIds: \[noteId\] \}\)/);
  const service = read('services/gardenEncouragement.ts');
  assert.match(service, /`\/users\/\$\{encodeURIComponent\(ownerId\)\}\/garden-encouragement`/);
  assert.match(service, /'\/users\/me\/garden-encouragements\/read', 'POST'/);
});
