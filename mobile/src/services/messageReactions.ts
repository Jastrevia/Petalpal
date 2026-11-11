import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';

// Likes and dislikes on Garden messages. Each person has at most one reaction per message: LIKE,
// DISLIKE or none. Pressing your current reaction again removes it; pressing the other one
// replaces it. The server keeps one row per person per message and returns the authoritative count.
export type ReactionKind = 'LIKE' | 'DISLIKE';
export type MessageReaction = { likes: number; mine: ReactionKind | null };
export const setMessageReaction = (messageId: string, kind: ReactionKind | null) =>
  apiRequest<MessageReaction>(`/messages/${encodeURIComponent(messageId)}/reaction`, 'PUT', { kind });
/** Deletes a message the signed-in person wrote (the server checks the author). */
export const deleteOwnMessage = (messageId: string) =>
  apiRequest<{ success: boolean; messageId: string }>(`/messages/${encodeURIComponent(messageId)}`, 'DELETE');

/** What a tap on `pressed` leads to: the same reaction again removes it, the other one replaces it. */
export const nextReaction = (mine: ReactionKind | null, pressed: ReactionKind): ReactionKind | null => mine === pressed ? null : pressed;
/** What to show at once, before the server answers. */
export function optimisticReaction(current: MessageReaction | undefined, next: ReactionKind | null): MessageReaction {
  const likes = (current?.likes ?? 0) - (current?.mine === 'LIKE' ? 1 : 0) + (next === 'LIKE' ? 1 : 0);
  return { likes: Math.max(0, likes), mine: next };
}

export function useMessageReactions(messageIds: string[]) {
  const key = messageIds.slice(0, 50).join(',');
  const [reactions, setReactions] = useState<Record<string, MessageReaction>>({});
  const latest = useRef<Record<string, MessageReaction>>({});
  // One request per message at a time: taps while one is on its way are ignored, so rapid tapping
  // can never send duplicates or leave the count out of step.
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const update = useCallback((change: (current: Record<string, MessageReaction>) => Record<string, MessageReaction>) =>
    setReactions(current => { const next = change(current); latest.current = next; return next; }), []);
  useEffect(() => {
    if (!key) return;
    let active = true;
    // A server without this yet, or offline: the buttons simply start at nothing.
    apiRequest<{ reactions: Record<string, MessageReaction> }>(`/messages/reactions?ids=${encodeURIComponent(key)}`)
      .then(reply => { if (active) update(current => ({ ...current, ...(reply.reactions ?? {}) })); }).catch(() => undefined);
    return () => { active = false; };
  }, [key, update]);
  /** Sets this person's reaction (null removes it): shown at once, undone if the server refuses. */
  const react = useCallback(async (id: string, next: ReactionKind | null) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setBusy(current => ({ ...current, [id]: true }));
    setFailed(current => current === id ? null : current);
    const before = latest.current[id];
    update(current => ({ ...current, [id]: optimisticReaction(before, next) }));
    try {
      const saved = await setMessageReaction(id, next);
      update(current => ({ ...current, [id]: saved }));
    } catch {
      update(current => ({ ...current, [id]: before ?? { likes: 0, mine: null } }));
      setFailed(id);
    } finally {
      inFlight.current.delete(id);
      setBusy(current => ({ ...current, [id]: false }));
    }
  }, [update]);
  const toggle = useCallback((id: string, pressed: ReactionKind) =>
    react(id, nextReaction(latest.current[id]?.mine ?? null, pressed)), [react]);
  return { reactions, busy, failed, react, toggle };
}
