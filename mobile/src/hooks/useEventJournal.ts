import { dispatchOnboarding, onboardingActive } from '../components/onboarding/onboardingSignals';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, usePathname } from 'expo-router';
import { apiRequest } from '../services/api';
import { useAuth } from '../services/auth';
import { createEvent, deleteEvent, eventFlowers, loadFlowersToday, plantingRecord, readEvent,
  type BackendFlower, type EventResponse, type FlowersToday, type PrimaryMood } from '../services/events';
import { clearEventDraft, loadEventDraft, saveEventDraft, settleDraftFlower, unfinishedEventFlower,
  type EventDraft, type EventDraftStep } from '../services/eventDraft';
import { answerQuestion } from '../services/reflections';
import { takeAnswer } from '../services/questionAnswer';

// Existing Event orchestration, kept independent of the replaceable panel.
export function useEventJournal(onGardenChanged?: () => void) {
  const { session } = useAuth();
  const [flowers, setFlowers] = useState<BackendFlower[]>([]);
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
  useEffect(() => {
    dispatchOnboarding({ type: 'draftChanged', hasText: Boolean(content.trim()) });
  }, [content]);
  const ownerId = session?.user.id;
  const refresh = useCallback(async (): Promise<BackendFlower[] | null> => {
    if (!session) return null;
    setLoading(true); setError('');
    try {
      const remote = await eventFlowers(session.user.id);
      if (mounted.current) setFlowers(remote);
      // An older server without the route just shows no count.
      loadFlowersToday().then(count => { if (mounted.current) setToday(count); }).catch(() => undefined);
      return remote;
    } catch (err) { if (mounted.current) setError((err as Error).message); return null; }
    finally { if (mounted.current) setLoading(false); }
  }, [session]);

  // An unfinished Event (services/eventDraft.ts): asked about once, when the Event flow opens,
  // before a new Event starts. A draft is never a planted flower.
  const [draftPrompt, setDraftPrompt] = useState<EventDraft | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  // Until the unfinished Event has been looked up, the empty new form must not overwrite it.
  const [draftReady, setDraftReady] = useState(false);
  const draftChecked = useRef(false);
  const resolveDraft = useCallback((remote: readonly BackendFlower[]): EventDraft | null => {
    const memory = loadEventDraft(ownerId);
    if (memory) {
      const flower = memory.flowerId ? remote.find(item => item.id === memory.flowerId) : undefined;
      if (memory.flowerId ? flower && flower.worldX == null : memory.content.trim() || memory.mood) return memory;
      clearEventDraft(ownerId); // Planted, deleted or empty since: nothing is unfinished.
    }
    const unfinished = unfinishedEventFlower(remote);
    return unfinished?.sourceEventId ? { step: 'review', content: '', mood: null,
      eventId: unfinished.sourceEventId, flowerId: unfinished.id } : null;
  }, [ownerId]);
  useEffect(() => {
    void refresh().then(remote => {
      if (!mounted.current || draftChecked.current) return;
      draftChecked.current = true;
      // The first-time tour runs its own Event; it is never interrupted by this question.
      // Offline, only this session's own draft can be offered.
      if (!onboardingActive()) setDraftPrompt(remote ? resolveDraft(remote) : loadEventDraft(ownerId));
      setDraftReady(true);
    });
  }, [refresh, resolveDraft, ownerId]);
  async function saveEvent() {
    if (busy || !session || !mood) return;
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
      // The first-time tour links its first Event (and the Flower it grew) to the real records.
      dispatchOnboarding({ type: 'eventSaved', eventId: created.event.id, flowerId: created.flower?.id ?? null });
      if (!mounted.current) return;
      onGardenChanged?.();
    } catch (err) { if (mounted.current) setError((err as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  // Still pending after the last check: say so plainly (the Event and flower are saved) instead
  // of showing "AI is reading" forever. Checking again only re-reads the Event; it never re-runs AI.
  const [analysisTimedOut, setAnalysisTimedOut] = useState(false);
  useEffect(() => {
    setAnalysisTimedOut(false);
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
      if (cancelled) return;
      if (++attempts < 6) timer = setTimeout(poll, 6000);
      else setAnalysisTimedOut(true);
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
  // Keep the draft current, so leaving the Event flow on purpose (closing it, Back, Cancel while
  // planting) never loses progress. Nothing here saves or plants anything on the server.
  useEffect(() => {
    if (!ownerId || !draftReady || draftPrompt) return; // Not before the owner chose Continue or Discard.
    const current = loadEventDraft(ownerId);
    if (!result) {
      if (content.trim() || mood) saveEventDraft(ownerId, { step: 'editing', content, mood });
      else if (current?.step === 'editing') clearEventDraft(ownerId);
      return;
    }
    const flower = flowers.find(item => item.sourceEventId === result.event.id)
      ?? (result.flower?.sourceEventId === result.event.id ? result.flower : undefined);
    if (flower && flower.worldX == null) {
      const step: EventDraftStep = current?.flowerId === flower.id && current.step === 'placing' ? 'placing' : 'review';
      saveEventDraft(ownerId, { step, content: '', mood: result.event.primaryGardenMood, eventId: result.event.id, flowerId: flower.id });
    } else if (current && (current.step === 'editing' || current.eventId === result.event.id)) {
      clearEventDraft(ownerId); // Saved without a flower, or already planted: the Event is complete.
    }
  }, [ownerId, draftReady, draftPrompt, content, mood, result, flowers]);

  /** Continue: back to where the owner left off. Returns the step and, when placing, its flower. */
  async function continueDraft(): Promise<{ step: EventDraftStep; flower?: BackendFlower } | null> {
    const draft = draftPrompt;
    if (!draft || draftBusy) return null;
    if (draft.step === 'editing' || !draft.eventId) {
      setContent(draft.content); setMood(draft.mood); setDraftPrompt(null);
      return { step: 'editing' };
    }
    setDraftBusy(true); setError('');
    try {
      const [event, remote] = await Promise.all([readEvent(draft.eventId), refresh()]);
      if (!mounted.current) return null;
      const flower = (remote ?? flowers).find(item => item.id === draft.flowerId);
      setResult({ event, flower: flower ?? null, emotion: { status: event.emotionStatus, labels: event.secondaryEmotions }, memoryJob: null });
      setContent(''); setMood(event.primaryGardenMood);
      setDraftPrompt(null);
      // Still not planted: Plant (✓) in the Garden is what plants it.
      return draft.step === 'placing' && flower && flower.worldX == null ? { step: 'placing', flower } : { step: 'review', flower };
    } catch (err) { if (mounted.current) setError((err as Error).message); return null; }
    finally { if (mounted.current) setDraftBusy(false); }
  }
  /** Discard: remove the draft completely, including a saved Event and its unplanted flower. */
  async function discardDraft(): Promise<boolean> {
    const draft = draftPrompt;
    if (!draft || draftBusy || !ownerId) return false;
    setDraftBusy(true); setError('');
    try {
      if (draft.eventId) {
        // Read it again first: a flower that has been planted since is never discarded.
        const remote = await eventFlowers(ownerId);
        const flower = remote.find(item => item.id === draft.flowerId);
        if (flower && flower.worldX != null) {
          if (draft.flowerId) settleDraftFlower(ownerId, draft.flowerId);
          clearEventDraft(ownerId);
          if (mounted.current) setDraftPrompt(null);
          return false;
        }
        await deleteEvent(draft.eventId);
        if (draft.flowerId) settleDraftFlower(ownerId, draft.flowerId);
      }
      clearEventDraft(ownerId);
      if (!mounted.current) return true;
      pending.current = null; setResult(null); setContent(''); setMood(null); setPollError('');
      setDraftPrompt(null);
      if (draft.eventId) { await refresh(); onGardenChanged?.(); }
      return true;
    } catch (err) { if (mounted.current) setError((err as Error).message); return false; }
    finally { if (mounted.current) setDraftBusy(false); }
  }

  const pathname = usePathname();
  function plant(flower: BackendFlower) {
    dispatchOnboarding({ type: 'plantRequested', flowerId: flower.id });
    const record = plantingRecord(flower, session?.user.timezone, result?.flower?.id === flower.id ? result.event.localDate : undefined);
    const targetPath = pathname === '/onboarding-preview' ? '/onboarding-preview' : '/';
    router.navigate({ pathname: targetPath, params: { mode: 'plant', flowerId: record.flowerId,
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
  // A planted flower never moves: if the server has its spot, just show it in the Garden.
  // Otherwise the owner goes to choose its spot; until Plant succeeds it is still a draft.
  function placeFlower(flower: BackendFlower) {
    const targetPath = pathname === '/onboarding-preview' ? '/onboarding-preview' : '/';
    if (flower.worldX != null) {
      router.navigate({ pathname: targetPath, params: { mode: 'focus', flowerId: flower.id } });
      return;
    }
    if (ownerId && flower.sourceEventId) saveEventDraft(ownerId, { step: 'placing', content: '', mood: (result?.event.primaryGardenMood ?? null),
      eventId: flower.sourceEventId, flowerId: flower.id });
    plant(flower);
  }
  // Back to an empty Event after one was saved (the saved one stays in the Garden).
  function reset() {
    pending.current = null; setResult(null); setContent(''); setMood(null); setError(''); setPollError('');
    setAnalysisTimedOut(false);
  }
  const currentFlowers = result ? flowers.filter(flower => flower.sourceEventId === result.event.id) : [];
  const flowersLeft = today?.limit == null ? null : today.remaining;
  return { flowers: currentFlowers, flowersToday: today, flowersLeft, content, setContent, mood, setMood, result, busy, loading,
    error, pollError, analysisTimedOut, aiProcessingOn, refresh, saveEvent, refreshEventStatus, placeFlower, reset,
    draftPrompt, draftBusy, continueDraft, discardDraft };
}
