import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { apiRequest } from '../services/api';
import { useAuth } from '../services/auth';
import { createEvent, eventFlowers, loadFlowersToday, plantingRecord, readEvent,
  type BackendFlower, type EventResponse, type FlowersToday, type PrimaryMood } from '../services/events';
import { loadFlowerPlacements, type FlowerPlacementRecord } from '../components/garden/planting/plantingPersistence';
import { answerQuestion } from '../services/reflections';
import { takeAnswer } from '../services/questionAnswer';

// Existing Event orchestration, kept independent of the replaceable panel.
export function useEventJournal(onGardenChanged?: () => void) {
  const { session } = useAuth();
  const [flowers, setFlowers] = useState<BackendFlower[]>([]);
  const [placements, setPlacements] = useState<FlowerPlacementRecord[]>([]);
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<PrimaryMood | null>(null);
  const [result, setResult] = useState<EventResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [today, setToday] = useState<FlowersToday | null>(null);
  const pending = useRef<{ content: string; mood: PrimaryMood; key: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError('');
    try {
      const [remote, layout] = await Promise.all([eventFlowers(session.user.id), loadFlowerPlacements()]);
      if (mounted.current) { setFlowers(remote); setPlacements(layout); }
      // An older server without the route just shows no count.
      loadFlowersToday().then(count => { if (mounted.current) setToday(count); }).catch(() => undefined);
    } catch (err) { if (mounted.current) setError((err as Error).message); }
    finally { if (mounted.current) setLoading(false); }
  }, [session]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function saveEvent() {
    if (busy || !content.trim() || !session || !mood) return;
    setBusy(true); setError('');
    const draft = pending.current;
    // Keep the same key after transport failure; a retry cannot duplicate an Event.
    if (!draft || draft.content !== content.trim() || draft.mood !== mood) pending.current = {
      content: content.trim(), mood, key: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    try {
      const created = await createEvent(pending.current!.content, mood, pending.current!.key);
      if (!mounted.current) return;
      pending.current = null; setResult(created); setContent('');
      // 回答问题: this Event answers the Weekly question the owner chose to answer; a failed link only loses the quote.
      const answering = takeAnswer();
      if (answering) void answerQuestion(answering.reportId, created.event.id).catch(() => undefined);
      // POST can omit sourceEvent. Read the owner Garden projection before showing
      // the new Flower, including already-completed emotion enrichment.
      await refresh();
      if (!mounted.current) return;
      onGardenChanged?.();
    } catch (err) { if (mounted.current) setError((err as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    if (!result || !['PENDING','RUNNING'].includes(result.event.emotionStatus)) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>; let attempts = 0;
    async function poll() {
      try {
        const event = await readEvent(result!.event.id);
        if (cancelled) return;
        setPollError('');
        if (!['PENDING','RUNNING'].includes(event.emotionStatus)) {
          setResult((current) => current ? { ...current, event } : null); void refresh(); onGardenChanged?.(); return;
        }
      } catch (err) { if (!cancelled) setPollError((err as Error).message); }
      if (!cancelled && ++attempts < 6) timer = setTimeout(poll, 6000);
    }
    timer = setTimeout(poll, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [result?.event.id, result?.event.emotionStatus, refresh, onGardenChanged]);
  // SKIPPED also covers AI being paused or disabled on the server, so read the owner's own
  // AI Processing consent before telling them to turn it on in Me.
  const [aiProcessingOn, setAiProcessingOn] = useState<boolean | null>(null);
  const skipped = result?.event.emotionStatus === 'SKIPPED';
  useEffect(() => {
    if (!skipped || !session) return;
    let active = true;
    apiRequest<{ aiProcessing: boolean }>(`/users/${session.user.id}/ai-consent`)
      .then(c => { if (active) setAiProcessingOn(c.aiProcessing === true); }).catch(() => undefined);
    return () => { active = false; };
  }, [skipped, session]);
  function plant(flower: BackendFlower) {
    const record = plantingRecord(flower, session?.user.timezone, result?.flower?.id === flower.id ? result.event.localDate : undefined);
    router.navigate({ pathname: '/', params: { mode: 'plant', flowerId: record.flowerId,
      journalEntryId: '', plantedDate: record.plantedDate, month: String(record.month),
      flowerName: record.flowerName, speciesCode: record.speciesCode, mood: record.mood } });
  }
  async function refreshEventStatus() {
    if (!result) return;
    try {
      const event = await readEvent(result.event.id);
      if (mounted.current) { setResult({ ...result, event }); setPollError(''); await refresh(); onGardenChanged?.(); }
    } catch (err) { if (mounted.current) setPollError((err as Error).message); }
  }
  // A planted flower never moves: if it already has its spot, just show it in the Garden.
  function placeFlower(flower: BackendFlower) {
    if (flower.worldX != null || placements.some(item => item.flowerId === flower.id)) {
      router.navigate({ pathname: '/', params: { mode: 'focus', flowerId: flower.id } });
    } else plant(flower);
  }
  // Back to an empty Event after one was saved (the saved one stays in the Garden).
  function reset() {
    pending.current = null; setResult(null); setContent(''); setMood(null); setError(''); setPollError('');
  }
  const currentFlowers = result ? flowers.filter(flower => flower.sourceEventId === result.event.id) : [];
  const flowersLeft = today?.limit == null ? null : today.remaining;
  return { flowers: currentFlowers, flowersToday: today, flowersLeft, placements, content, setContent, mood, setMood, result, busy, loading,
    error, pollError, aiProcessingOn, refresh, saveEvent, refreshEventStatus, placeFlower, reset };
}
