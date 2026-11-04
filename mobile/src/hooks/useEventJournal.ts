import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../services/auth';
import { createEvent, eventFlowers, loadFlowersToday, plantingRecord, readEvent,
  type BackendFlower, type EventResponse, type FlowersToday, type PrimaryMood } from '../services/events';
import { loadFlowerPlacements, type FlowerPlacementRecord } from '../components/garden/planting/plantingPersistence';
import { dispatchOnboarding } from '../components/onboarding/onboardingSignals';

// A Save Event response is stored only when it carries its Event (and the Event's id); anything
// else is reported instead of being rendered. The pending idempotency key is kept, so saving
// again returns the same Event rather than creating a second one.
const UNCONFIRMED_SAVE = 'PetalPal could not confirm this Event. Tap Save Event again: it will not be saved twice.';
function confirmedEvent(created: EventResponse | null | undefined): EventResponse {
  if (!created || typeof created !== 'object' || !created.event || typeof created.event.id !== 'string') {
    throw new Error(UNCONFIRMED_SAVE);
  }
  return created;
}

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
      const created = confirmedEvent(await createEvent(pending.current!.content, mood, pending.current!.key));
      if (!mounted.current) return;
      pending.current = null; setResult(created); setContent('');
      // POST can omit sourceEvent. Read the owner Garden projection before showing
      // the new Flower, including already-completed emotion enrichment.
      await refresh();
      // The first-time tour links its first Event (and the Flower it grew) to the real records.
      dispatchOnboarding({ type: 'eventSaved', eventId: created.event.id, flowerId: created.flower?.id ?? null });
      if (!mounted.current) return;
      onGardenChanged?.();
    } catch (err) { if (mounted.current) setError((err as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    if (!result?.event || !['PENDING','RUNNING'].includes(result.event.emotionStatus)) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>; let attempts = 0;
    async function poll() {
      try {
        const event = await readEvent(result!.event.id);
        if (cancelled) return;
        if (!event?.id) throw new Error('Event status is unavailable right now.');
        setPollError('');
        if (!['PENDING','RUNNING'].includes(event.emotionStatus)) {
          setResult((current) => current ? { ...current, event } : null); void refresh(); onGardenChanged?.(); return;
        }
      } catch (err) { if (!cancelled) setPollError((err as Error).message); }
      if (!cancelled && ++attempts < 4) timer = setTimeout(poll, 15000);
    }
    timer = setTimeout(poll, 10000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [result?.event?.id, result?.event?.emotionStatus, refresh, onGardenChanged]);
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
      if (!event?.id) throw new Error('Event status is unavailable right now.');
      if (mounted.current) { setResult({ ...result, event }); setPollError(''); await refresh(); onGardenChanged?.(); }
    } catch (err) { if (mounted.current) setPollError((err as Error).message); }
  }
  function placeFlower(flower: BackendFlower) {
    if (placements.some(item => item.flowerId === flower.id)) {
      router.navigate({ pathname: '/', params: { mode: 'adjust', flowerId: flower.id } });
    } else plant(flower);
  }
  const currentFlowers = result ? flowers.filter(flower => flower.sourceEventId === result.event.id) : [];
  const flowersLeft = today?.limit == null ? null : today.remaining;
  return { flowers: currentFlowers, flowersToday: today, flowersLeft, placements, content, setContent, mood, setMood, result, busy, loading,
    error, pollError, refresh, saveEvent, refreshEventStatus, placeFlower };
}
