import type { Letter } from '../mailbox/types';

// Words and small pure helpers for daily Garden encouragement (Support and notes).
// Times show in the phone's local time zone; the server decides the day and stores UTC.

export interface EncouragementSender { id: string; name: string; avatar?: string | null }
export interface ReceivedNote { id: string; text: string; createdAt: string; read: boolean; sender: EncouragementSender }
export interface ReceivedEncouragement {
  localDate: string;
  resetsAt: string;
  support: { today: number; total: number; unread: number };
  messages: { today: number; unread: number; items: ReceivedNote[]; nextCursor: string | null };
}
export interface VisitorEncouragementState {
  owner: EncouragementSender;
  localDate: string;
  resetsAt: string;
  hasSupportedToday: boolean;
  hasMessagedToday: boolean;
  messageMaxLength: number;
}

export const NOTE_LETTER_PREFIX = 'note:';
export const DEFAULT_NOTE_MAX_LENGTH = 200;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
function clock(date: Date) {
  const hours = date.getHours() % 12 || 12;
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
}

// "Today · 2:41 PM", "Yesterday · 9:05 AM", "Oct 21 · 2:41 PM", "Dec 31, 2025".
export function noteDateLabel(createdAt: string, now = new Date()) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return `Today · ${clock(date)}`;
  if (days === 1) return `Yesterday · ${clock(date)}`;
  if (date.getFullYear() === now.getFullYear()) return `${MONTHS[date.getMonth()]} ${date.getDate()} · ${clock(date)}`;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Characters as people count them (an emoji is one), the same rule as the server.
export const noteLength = (text: string) => [...text.trim()].length;

export function noteProblem(text: string, max = DEFAULT_NOTE_MAX_LENGTH): '' | 'empty' | 'long' {
  const length = noteLength(text);
  return length === 0 ? 'empty' : length > max ? 'long' : '';
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// The owner's quiet summary. Null when there is nothing to say.
export function supportSummary(support: ReceivedEncouragement['support']) {
  if (support.today > 0) {
    return `${plural(support.today, 'friend', 'friends')} supported your garden today`;
  }
  if (support.total > 0) return `${plural(support.total, 'kind visit', 'kind visits')} so far`;
  return null;
}

export function unreadNotesLabel(count: number) {
  return count > 0 ? `${plural(count, 'new note', 'new notes')} in your mailbox` : null;
}

export function msUntilReset(resetsAt: string, now = new Date()) {
  const at = new Date(resetsAt).getTime();
  if (Number.isNaN(at)) return null;
  // Re-read a moment after the visitor's local midnight; never spin on a stale value.
  return Math.min(Math.max(at - now.getTime() + 1_500, 5_000), 24 * 3_600_000);
}

const firstLine = (text: string, length: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  const characters = [...flat];
  return characters.length > length ? `${characters.slice(0, length).join('').trimEnd()}…` : flat;
};

// A received note becomes a letter in the Garden mailbox, signed by its sender.
export function noteToLetter(note: ReceivedNote, now = new Date()): Letter {
  const date = noteDateLabel(note.createdAt, now);
  return {
    id: `${NOTE_LETTER_PREFIX}${note.id}`,
    sender: note.sender.name,
    senderAvatar: note.sender.avatar ?? null,
    subject: 'A note left in your garden',
    snippet: firstLine(note.text, 56),
    date,
    category: 'friend',
    botanicalIcon: 'bellflower',
    headline: 'Left beside your flowers',
    body: note.text,
    illustrationType: 'none',
    signoff: 'From a friend who visited,',
    signature: note.sender.name,
    footerQuote: 'SMALL CARE. A BRIGHTER WORLD.',
    postmarkText: 'Left in your garden',
    read: note.read,
    paperTone: 'rose',
    estimatedHeight: 360,
  };
}

export const noteIdFromLetter = (letterId: string) =>
  letterId.startsWith(NOTE_LETTER_PREFIX) ? letterId.slice(NOTE_LETTER_PREFIX.length) : null;
