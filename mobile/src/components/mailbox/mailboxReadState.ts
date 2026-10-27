import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { MOCK_LETTERS, RELEASE_LETTERS } from './mockLetters';

export const MAILBOX_LETTERS = __DEV__ ? MOCK_LETTERS : RELEASE_LETTERS;

// Which letters this device has opened, remembered across visits (letter ids only, no user
// data), so the Garden mailbox can glow brighter while something is still unread.
const KEY = 'petalpal.mailbox.readLetters.v1';
const readIds = new Set(MAILBOX_LETTERS.filter(letter => letter.read).map(letter => letter.id));
const listeners = new Set<() => void>();
let unread = MAILBOX_LETTERS.some(letter => !readIds.has(letter.id));
const changed = () => {
  unread = MAILBOX_LETTERS.some(letter => !readIds.has(letter.id));
  listeners.forEach(listener => listener());
};
AsyncStorage.getItem(KEY).then(value => {
  const ids: unknown = value ? JSON.parse(value) : [];
  if (Array.isArray(ids)) ids.forEach(id => { if (typeof id === 'string') readIds.add(id); });
  changed();
}).catch(() => undefined);

export const isLetterRead = (id: string) => readIds.has(id);
export function markLetterRead(id: string) {
  if (readIds.has(id)) return;
  readIds.add(id);
  AsyncStorage.setItem(KEY, JSON.stringify([...readIds])).catch(() => undefined);
  changed();
}
export function useUnreadMail() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => unread, () => unread);
}
