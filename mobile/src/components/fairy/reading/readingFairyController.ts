// The reading companion: while you study or work, the Fairy reads one book. Now and then she turns
// a page (READING → PAGE_PREPARATION → PAGE_LIFT → PAGE_TURN → PAGE_SETTLE → RETURN_TO_READING →
// READING), and after 10–20 minutes of active reading she pauses to think (READING → THINKING →
// RETURN_TO_READING → READING). The session (active / paused / idle) is the only input and one timer
// runs at a time, so re-renders never restart anything and stale callbacks are ignored.

export type ReadingState = 'READING' | 'PAGE_PREPARATION' | 'PAGE_LIFT' | 'PAGE_TURN' | 'PAGE_SETTLE'
  | 'RETURN_TO_READING' | 'THINKING' | 'PAUSED' | 'IDLE';
export type ReadingSession = 'active' | 'paused' | 'idle';

export type ReadingTiming = {
  // Reading time between page turns: usually `typical`, sometimes as short as `min` or as long as `max`.
  pageTurnGapMs: { min: number; typical: readonly [number, number]; max: number };
  // The page-turn sequence; lift + turn is the visible page turn (about 1–1.5 s).
  phaseMs: { preparation: number; lift: number; turn: number; settle: number; returnToReading: number };
  // Active time before she may think (re-drawn after every thought), and how long she holds it.
  thinkingAfterMs: readonly [number, number];
  thinkingHoldMs: readonly [number, number];
  // A moment of reading between a finished page turn and a thought that was already due.
  thinkingBeatMs: number;
};

export const READING_TIMING: ReadingTiming = {
  pageTurnGapMs: { min: 45_000, typical: [90_000, 180_000], max: 300_000 },
  phaseMs: { preparation: 520, lift: 420, turn: 820, settle: 480, returnToReading: 680 },
  thinkingAfterMs: [10 * 60_000, 20 * 60_000],
  thinkingHoldMs: [4_000, 8_000],
  thinkingBeatMs: 2_500,
};

// Development previews and tests only: the same sequence on a short clock.
export const READING_TIMING_FAST: ReadingTiming = {
  ...READING_TIMING,
  pageTurnGapMs: { min: 5_000, typical: [5_000, 10_000], max: 10_000 },
  thinkingAfterMs: [20_000, 20_000],
  thinkingHoldMs: [3_000, 3_000],
  thinkingBeatMs: 1_000,
};

export type ReadingClock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};
const systemClock: ReadingClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type ReadingSnapshot = {
  state: ReadingState;
  session: ReadingSession;
  // Clock time the state began and how long it lasts (null: until something happens).
  enteredAt: number;
  durationMs: number | null;
  pagesTurned: number;
};

const SEQUENCE: Partial<Record<ReadingState, ReadingState>> = {
  PAGE_PREPARATION: 'PAGE_LIFT', PAGE_LIFT: 'PAGE_TURN', PAGE_TURN: 'PAGE_SETTLE', PAGE_SETTLE: 'RETURN_TO_READING',
};
const PHASE: Partial<Record<ReadingState, keyof ReadingTiming['phaseMs']>> = {
  PAGE_PREPARATION: 'preparation', PAGE_LIFT: 'lift', PAGE_TURN: 'turn', PAGE_SETTLE: 'settle', RETURN_TO_READING: 'returnToReading',
};
export const PAGE_TURN_STATES: readonly ReadingState[] = ['PAGE_PREPARATION', 'PAGE_LIFT', 'PAGE_TURN', 'PAGE_SETTLE'];

const between = ([low, high]: readonly [number, number], random: () => number) => low + (high - low) * random();

// One draw: 80% inside the typical range, 10% shorter (down to min), 10% longer (up to max).
export function pageTurnGap(timing: ReadingTiming, random: () => number) {
  const { min, typical: [low, high], max } = timing.pageTurnGapMs;
  const r = Math.min(Math.max(random(), 0), 0.999999);
  if (r < 0.1) return min + (low - min) * (r / 0.1);
  if (r >= 0.9) return high + (max - high) * ((r - 0.9) / 0.1);
  return low + (high - low) * ((r - 0.1) / 0.8);
}

export function createReadingFairyController({ timing = READING_TIMING, clock = systemClock, random = Math.random }: {
  timing?: ReadingTiming; clock?: ReadingClock; random?: () => number;
} = {}) {
  const listeners = new Set<() => void>();
  let snapshot: ReadingSnapshot = { state: 'IDLE', session: 'idle', enteredAt: clock.now(), durationMs: null, pagesTurned: 0 };
  // Remaining READING time before the next page turn, and remaining active time before she may think.
  let pageDueIn = 0, thinkingDueIn = 0, lastAt = clock.now();
  let timer: unknown = null, generation = 0, returningFromThought = false;

  const emit = () => listeners.forEach(listener => listener());
  // Spend the time since the last look: thinking eligibility counts all active time except the
  // thought itself (page turns do not reset it); the page-turn gap counts quiet reading only.
  const account = () => {
    const now = clock.now(), elapsed = Math.max(0, now - lastAt);
    lastAt = now;
    if (snapshot.session !== 'active') return;
    if (snapshot.state !== 'THINKING' && !returningFromThought) thinkingDueIn -= elapsed;
    if (snapshot.state === 'READING') pageDueIn -= elapsed;
  };
  const enter = (state: ReadingState, durationMs: number | null, session = snapshot.session) => {
    snapshot = { ...snapshot, state, session, enteredAt: clock.now(), durationMs,
      pagesTurned: snapshot.pagesTurned + (snapshot.state === 'PAGE_TURN' && state === 'PAGE_SETTLE' ? 1 : 0) };
    if (state === 'READING') {
      if (returningFromThought) thinkingDueIn = between(timing.thinkingAfterMs, random);
      returningFromThought = false;
      thinkingDueIn = Math.max(thinkingDueIn, timing.thinkingBeatMs);
    }
    schedule();
    emit();
  };
  const schedule = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    generation += 1;
    if (snapshot.session !== 'active') return;
    const { state, enteredAt, durationMs } = snapshot;
    const delay = state === 'READING' ? Math.min(pageDueIn, thinkingDueIn) : enteredAt + (durationMs ?? 0) - clock.now();
    const mine = generation;
    timer = clock.setTimeout(() => { if (mine === generation) { timer = null; account(); advance(); } }, Math.max(0, delay));
  };
  const advance = () => {
    const { state } = snapshot;
    if (state === 'READING') {
      // A thought that came due waits for any page turn to finish; it never interrupts one.
      if (thinkingDueIn <= 0) return enter('THINKING', between(timing.thinkingHoldMs, random));
      if (pageDueIn <= 0) return enter('PAGE_PREPARATION', timing.phaseMs.preparation);
      return schedule();
    }
    if (state === 'THINKING') {
      returningFromThought = true;
      return enter('RETURN_TO_READING', timing.phaseMs.returnToReading);
    }
    if (state === 'RETURN_TO_READING') {
      if (!returningFromThought) pageDueIn = pageTurnGap(timing, random);
      return enter('READING', null);
    }
    const next = SEQUENCE[state];
    if (next) enter(next, timing.phaseMs[PHASE[next]!]);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    // Idempotent: calling it again with the same session (a re-render) changes nothing.
    setSession(session: ReadingSession) {
      if (session === snapshot.session) return;
      account();
      if (session === 'idle') {
        returningFromThought = false;
        return enter('IDLE', null, 'idle');
      }
      if (session === 'paused') {
        if (snapshot.session === 'idle') return;
        // An interrupted page turn is not replayed: the next one gets a fresh gap. An interrupted
        // thought counts as finished. Remaining thinking eligibility is kept as it was.
        if (PAGE_TURN_STATES.includes(snapshot.state) || (snapshot.state === 'RETURN_TO_READING' && !returningFromThought)) {
          pageDueIn = pageTurnGap(timing, random);
        }
        if (snapshot.state === 'THINKING' || returningFromThought) {
          returningFromThought = false;
          thinkingDueIn = between(timing.thinkingAfterMs, random);
        }
        return enter('PAUSED', null, 'paused');
      }
      if (snapshot.session === 'idle') {
        pageDueIn = pageTurnGap(timing, random);
        thinkingDueIn = between(timing.thinkingAfterMs, random);
        snapshot = { ...snapshot, pagesTurned: 0 };
      }
      lastAt = clock.now();
      enter('READING', null, 'active');
    },
    // Remaining times as of now, for previews and tests.
    remaining() {
      const elapsed = snapshot.session === 'active' ? Math.max(0, clock.now() - lastAt) : 0;
      return {
        pageTurnInMs: snapshot.state === 'READING' ? pageDueIn - elapsed : pageDueIn,
        thinkingInMs: snapshot.state === 'THINKING' || returningFromThought ? null : thinkingDueIn - elapsed,
      };
    },
    dispose() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      generation += 1;
      returningFromThought = false;
      snapshot = { ...snapshot, state: 'IDLE', session: 'idle', enteredAt: clock.now(), durationMs: null };
    },
  };
}
export type ReadingFairyController = ReturnType<typeof createReadingFairyController>;

// What to show for a state: art frames (index into the six reading poses) with the moment each
// appears (ms after the state begins) and how long it crossfades in. Missing frames fall back to
// the reading pose; with no reading pose at all, nothing is drawn.
export type ReadingFrameCue = { frame: number; atMs: number; fadeMs: number };
export const READING_FRAME_COUNT = 6;
export function readingFrameCues(state: ReadingState, durationMs: number | null): ReadingFrameCue[] {
  switch (state) {
    case 'PAGE_PREPARATION': return [{ frame: 1, atMs: 0, fadeMs: 360 }];
    case 'PAGE_LIFT': return [{ frame: 2, atMs: 0, fadeMs: 240 }];
    case 'PAGE_TURN': return [{ frame: 3, atMs: 0, fadeMs: 220 }, { frame: 4, atMs: Math.round((durationMs ?? 0) / 2), fadeMs: 220 }];
    case 'PAGE_SETTLE': return [{ frame: 5, atMs: 0, fadeMs: 260 }];
    case 'THINKING': return [{ frame: 1, atMs: 0, fadeMs: 900 }];
    case 'RETURN_TO_READING': return [{ frame: 0, atMs: 0, fadeMs: durationMs ?? 600 }];
    default: return [{ frame: 0, atMs: 0, fadeMs: 400 }];
  }
}
export function resolveReadingFrame(frame: number, available: readonly unknown[]) {
  if (available[frame]) return frame;
  return available[0] ? 0 : null;
}
