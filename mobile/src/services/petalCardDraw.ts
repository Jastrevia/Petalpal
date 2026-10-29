import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from './api';
import { closenessChanged, onClosenessChanged } from './fairyCloseness';

// The daily petal card draw (lib/petal-card-draw.js) and its reading (lib/petal-reading.js).
// Every route answers 404 while the petal card switch leaves the owner out; that reads as
// "off" (null) here.
export type PetalTopic = 'FORTUNE' | 'DIRECTION' | 'LOVE' | 'WORK' | 'PEOPLE';
export interface PetalCardFace {
  id: string; name: string; line: string; text: string; disclaimer: string; reversed?: boolean; keywords?: string[] | null;
}
// Whether this owner can have a reading of today's card, and how far it got. FAILED: hidden.
export type PetalReading = { available: false } | {
  available: true; needsConsent: boolean; status: 'NONE' | 'GENERATING' | 'READY' | 'FAILED'; paragraphs?: string[];
};
export interface PetalDrawn {
  id: string; position: number; drawnAt: string; topic: PetalTopic | null; topicLabel: string | null; card: PetalCardFace | null;
  reading?: PetalReading;
}
export interface PetalToday {
  locale: 'en' | 'zh-Hans'; localDate: string; deckSize: number; back: 'lilac' | 'violet';
  topics: { id: PetalTopic; label: string }[]; drawn: PetalDrawn | null;
}
export interface PetalDrawResult extends PetalDrawn { created: boolean; locale: 'en' | 'zh-Hans'; localDate: string }

async function orOff<T>(request: Promise<T>): Promise<T | null> {
  try { return await request; } catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
}

// deck=full: this app sends a topic and can show all 78 cards, reversed ones too.
export const loadPetalToday = () => orOff(apiRequest<PetalToday>('/api/petal-cards/today?deck=full'));
export async function drawPetalCard(position: number, topic: PetalTopic) {
  const result = await orOff(apiRequest<PetalDrawResult>('/api/petal-cards/draw', 'POST', { position, topic }));
  if (result?.created) closenessChanged(); // the calendar shows the day's card
  return result;
}

// Writes today's reading if this owner can have one (at most two model attempts), else reports why not.
export const requestPetalReading = () => orOff(apiRequest<PetalReading>('/api/petal-cards/reading', 'POST', {}));

// Today's draw state; reloads with `refreshKey` and after anything that changes the day.
export function usePetalToday(refreshKey: unknown) {
  const [today, setToday] = useState<PetalToday | null>(null);
  const [changes, setChanges] = useState(0);
  useEffect(() => onClosenessChanged(() => setChanges(count => count + 1)), []);
  useEffect(() => {
    let active = true;
    loadPetalToday().then(result => { if (active) setToday(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [refreshKey, changes]);
  return today;
}
