import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { MOCK_LETTERS, RELEASE_LETTERS } from './mockLetters';
import { confirmedReadLetters, ensureMailboxLoaded, isLetterDeleted, subscribeMailbox } from '../../services/mailbox';

export const MAILBOX_LETTERS = __DEV__ ? MOCK_LETTERS : RELEASE_LETTERS;

// Which letters this device has opened, remembered across visits (letter ids only, no user
// data), so the Garden mailbox can glow brighter while something is still unread. Letters the
// owner deleted from their mailbox (services/mailbox.ts) are gone and never count as unread.
const KEY = 'petalpal.mailbox.readLetters.v1';
const readIds = new Set(MAILBOX_LETTERS.filter(letter => letter.read).map(letter => letter.id));
const listeners = new Set<() => void>();
const anyUnread = () => MAILBOX_LETTERS.some(letter => !readIds.has(letter.id) && !isLetterDeleted(letter.id));
let unread = anyUnread();
const changed = () => {
  unread = anyUnread();
  listeners.forEach(listener => listener());
};
const save = () => { AsyncStorage.setItem(KEY, JSON.stringify([...readIds])).catch(() => undefined); };
AsyncStorage.getItem(KEY).then(value => {
  const ids: unknown = value ? JSON.parse(value) : [];
  if (Array.isArray(ids)) ids.forEach(id => { if (typeof id === 'string') readIds.add(id); });
  changed();
}).catch(() => undefined);
// What the server has as read (another device, an earlier sign-in) is read here too.
subscribeMailbox(() => {
  let added = false;
  for (const id of confirmedReadLetters()) if (!readIds.has(id)) { readIds.add(id); added = true; }
  if (added) save();
  changed();
});

export const isLetterRead = (id: string) => readIds.has(id);
/** The owner's mailbox: every letter they have not deleted. */
export const mailboxLetters = () => MAILBOX_LETTERS.filter(letter => !isLetterDeleted(letter.id));
export function subscribeMailboxLetters(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function markLetterRead(id: string) {
  if (readIds.has(id)) return;
  readIds.add(id);
  save();
  changed();
}
// Wherever the unread glow is shown, the owner's server state is loaded once, so letters read or
// deleted on another device do not glow as unread here.
const subscribeUnread = (listener: () => void) => { void ensureMailboxLoaded(); return subscribeMailboxLetters(listener); };
export function useUnreadMail() {
  return useSyncExternalStore(subscribeUnread, () => unread, () => unread);
}
