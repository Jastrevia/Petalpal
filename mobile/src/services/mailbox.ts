import { apiRequest } from './api';

// The signed-in owner's Mailbox state on the server (lib/mailbox.js): which letters the server has
// as read, and which this owner deleted from their own mailbox. Delete is offered only for a
// letter the server has confirmed as read. Held in memory for the current account only and
// dropped on any account change (plantingPersistence.scopeFlowerPlacements).
let owner: string | null = null;
let generation = 0;
const confirmedRead = new Set<string>();
const deleted = new Set<string>();
const pendingRead = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

export function subscribeMailbox(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function scopeMailbox(next: string | null) {
  if (next === owner) return;
  owner = next; generation++;
  confirmedRead.clear(); deleted.clear(); pendingRead.clear(); loading = null;
  notify();
}
let loading: Promise<boolean> | null = null;
let loadedFor = -1;
/** Loads the owner's state once per account (the Garden's unread glow needs it before the Mailbox opens). */
export function ensureMailboxLoaded(): Promise<boolean> {
  if (loadedFor === generation) return Promise.resolve(true);
  if (loading) return loading;
  const current = loading = syncMailbox().finally(() => { if (loading === current) loading = null; });
  return current;
}
export const isLetterDeleted = (id: string) => deleted.has(id);
/** The server has this letter as read, so it may be deleted. */
export const isLetterReadConfirmed = (id: string) => confirmedRead.has(id) && !deleted.has(id);
export const confirmedReadLetters = () => [...confirmedRead];

/** Loads the owner's state. False when it could not be loaded (offline, signed out, older server). */
export async function syncMailbox(): Promise<boolean> {
  const started = generation;
  try {
    const state = await apiRequest<{ read?: unknown; deleted?: unknown }>('/mailbox/letters/state');
    if (started !== generation) return false;
    const ids = (value: unknown) => Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    confirmedRead.clear(); deleted.clear();
    ids(state.read).forEach(id => confirmedRead.add(id));
    ids(state.deleted).forEach(id => deleted.add(id));
    loadedFor = generation;
    notify();
    return true;
  } catch { return false; }
}
/** Records the letter as read on the server. Delete stays unavailable until this succeeds. */
export function confirmLetterRead(id: string): Promise<boolean> {
  if (confirmedRead.has(id) || deleted.has(id)) return Promise.resolve(confirmedRead.has(id));
  const running = pendingRead.get(id);
  if (running) return running;
  const started = generation;
  const request = apiRequest(`/mailbox/letters/${encodeURIComponent(id)}/read`, 'PUT').then(() => {
    if (started !== generation) return false;
    confirmedRead.add(id); notify();
    return true;
  }, () => false).finally(() => { if (pendingRead.get(id) === request) pendingRead.delete(id); });
  pendingRead.set(id, request);
  return request;
}
/** Deletes a read letter from the owner's mailbox. Throws (and changes nothing) if the server refuses. */
export async function deleteReadLetter(id: string): Promise<void> {
  const started = generation;
  await apiRequest(`/mailbox/letters/${encodeURIComponent(id)}`, 'DELETE');
  if (started !== generation) return;
  confirmedRead.delete(id); deleted.add(id);
  notify();
}
