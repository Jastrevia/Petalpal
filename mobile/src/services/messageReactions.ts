import { useEffect, useState } from 'react';
import { apiRequest } from './api';

// Likes and dislikes on Garden messages. One per person per message, and the first one stands.
export type MessageReaction = { likes: number; mine: 'LIKE' | 'DISLIKE' | null };
export const reactToMessage = (messageId: string, kind: 'LIKE' | 'DISLIKE') =>
  apiRequest<MessageReaction>(`/messages/${encodeURIComponent(messageId)}/reaction`, 'PUT', { kind });

export function useMessageReactions(messageIds: string[]) {
  const key = messageIds.slice(0, 50).join(',');
  const [reactions, setReactions] = useState<Record<string, MessageReaction>>({});
  useEffect(() => {
    if (!key) return;
    let active = true;
    // A server without this yet, or offline: the buttons simply start at nothing.
    apiRequest<{ reactions: Record<string, MessageReaction> }>(`/messages/reactions?ids=${encodeURIComponent(key)}`)
      .then(reply => { if (active) setReactions(reply.reactions ?? {}); }).catch(() => undefined);
    return () => { active = false; };
  }, [key]);
  const set = (id: string, reaction: MessageReaction) => setReactions(current => ({ ...current, [id]: reaction }));
  const like = async (id: string, current?: MessageReaction) => {
    if (current?.mine) return;
    set(id, { likes: (current?.likes ?? 0) + 1, mine: 'LIKE' });
    try { set(id, await reactToMessage(id, 'LIKE')); }
    catch { set(id, current ?? { likes: 0, mine: null }); }
  };
  const dislike = async (id: string, current?: MessageReaction) => {
    if (current?.mine) return;
    set(id, { likes: current?.likes ?? 0, mine: 'DISLIKE' });
    try { set(id, await reactToMessage(id, 'DISLIKE')); } catch { /* the report itself went through */ }
  };
  return { reactions, like, dislike };
}
