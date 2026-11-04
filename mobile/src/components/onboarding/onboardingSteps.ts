// The first-time tour as data: where each step lives, what it points at and what moves it on.
// Pure and import-free so it runs in tests. The order matches lib/onboarding-tutorial.js.

export const ONBOARDING_STEPS = [
  'intro.name', 'intro.celebrate',
  'garden.zoom',
  'event.nav', 'event.write', 'event.mood', 'event.save', 'event.flower',
  'plant.place', 'plant.growth', 'plant.months',
  'treehouse.enter', 'treehouse.shelf', 'treehouse.books', 'treehouse.archive', 'treehouse.back',
  'mailbox',
  'friends.nav', 'friends.search', 'friends.house', 'friends.visit', 'friends.return',
  'fairy.feed', 'fairy.bond', 'fairy.keepsakes',
  'me.space', 'me.privacy',
  'finale',
  'done',
] as const;
export type OnboardingStep = typeof ONBOARDING_STEPS[number];

/** Where the step is drawn: the Garden screen, inside a panel's modal, or the Treehouse route. */
export type OnboardingSurface = 'garden' | 'events' | 'friends' | 'bookhouse';
/** Measured targets (see onboardingTargets.ts) and Garden-world targets (`world.*`). */
export type OnboardingTarget =
  | 'garden.zoom' | 'nav.events' | 'nav.friends' | 'nav.fairy' | 'nav.profile'
  | 'events.input' | 'events.moods' | 'events.save' | 'events.plant'
  | 'friends.add' | 'friends.list' | 'friends.return'
  | 'bookhouse.years' | 'bookhouse.books' | 'bookhouse.shelf' | 'bookhouse.back'
  | 'world.treehouse' | 'world.mailbox' | 'planting.banner';

export interface StepSpec {
  surface: OnboardingSurface;
  /** cinematic: no spotlight. info: Next moves on. action: only the real action moves on. */
  kind: 'cinematic' | 'info' | 'action';
  target?: OnboardingTarget;
  /** What a tap inside the highlight does: reach the real control, or act as Next. */
  hole?: 'pass' | 'next';
  /** Dim the rest of the screen (planting keeps the Garden clear: the bed itself is the target). */
  dim?: boolean;
}

export const STEP_SPECS: Record<OnboardingStep, StepSpec> = {
  'intro.name': { surface: 'garden', kind: 'cinematic' },
  'intro.celebrate': { surface: 'garden', kind: 'cinematic' },
  'garden.zoom': { surface: 'garden', kind: 'info', target: 'garden.zoom', hole: 'pass', dim: true },
  'event.nav': { surface: 'garden', kind: 'action', target: 'nav.events', hole: 'pass', dim: true },
  'event.write': { surface: 'events', kind: 'action', target: 'events.input', hole: 'pass', dim: true },
  'event.mood': { surface: 'events', kind: 'action', target: 'events.moods', hole: 'pass', dim: true },
  'event.save': { surface: 'events', kind: 'action', target: 'events.save', hole: 'pass', dim: true },
  'event.flower': { surface: 'events', kind: 'action', target: 'events.plant', hole: 'pass', dim: true },
  'plant.place': { surface: 'garden', kind: 'action', dim: false },
  'plant.growth': { surface: 'garden', kind: 'info', hole: 'next', dim: false },
  'plant.months': { surface: 'garden', kind: 'info', dim: false },
  'treehouse.enter': { surface: 'garden', kind: 'action', target: 'world.treehouse', hole: 'pass', dim: true },
  'treehouse.shelf': { surface: 'bookhouse', kind: 'info', target: 'bookhouse.years', hole: 'next', dim: true },
  'treehouse.books': { surface: 'bookhouse', kind: 'info', target: 'bookhouse.books', hole: 'next', dim: true },
  'treehouse.archive': { surface: 'bookhouse', kind: 'info', target: 'bookhouse.shelf', hole: 'next', dim: true },
  'treehouse.back': { surface: 'bookhouse', kind: 'action', target: 'bookhouse.back', hole: 'pass', dim: true },
  'mailbox': { surface: 'garden', kind: 'info', target: 'world.mailbox', hole: 'next', dim: true },
  'friends.nav': { surface: 'garden', kind: 'action', target: 'nav.friends', hole: 'pass', dim: true },
  'friends.search': { surface: 'friends', kind: 'info', target: 'friends.add', hole: 'next', dim: true },
  'friends.house': { surface: 'friends', kind: 'info', target: 'friends.list', hole: 'next', dim: true },
  'friends.visit': { surface: 'friends', kind: 'info', target: 'friends.list', hole: 'next', dim: true },
  'friends.return': { surface: 'friends', kind: 'action', target: 'friends.return', hole: 'pass', dim: true },
  'fairy.feed': { surface: 'garden', kind: 'info', target: 'nav.fairy', hole: 'next', dim: true },
  'fairy.bond': { surface: 'garden', kind: 'info', target: 'nav.fairy', hole: 'next', dim: true },
  'fairy.keepsakes': { surface: 'garden', kind: 'info', target: 'nav.fairy', hole: 'next', dim: true },
  'me.space': { surface: 'garden', kind: 'info', target: 'nav.profile', hole: 'next', dim: true },
  'me.privacy': { surface: 'garden', kind: 'info', target: 'nav.profile', hole: 'next', dim: true },
  'finale': { surface: 'garden', kind: 'cinematic' },
  'done': { surface: 'garden', kind: 'cinematic' },
};

export type OnboardingFeature = 'events' | 'friends';
export type OnboardingSignal =
  | { type: 'next' }
  | { type: 'zoom' }
  | { type: 'nameSaved' }
  | { type: 'celebrated' }
  | { type: 'featureOpened'; feature: OnboardingFeature }
  | { type: 'featureClosed'; feature: OnboardingFeature }
  | { type: 'draftChanged'; hasText: boolean }
  | { type: 'moodSelected' }
  | { type: 'eventSaved'; eventId: string; flowerId: string | null }
  | { type: 'plantRequested'; flowerId: string }
  | { type: 'planted'; flowerId: string }
  | { type: 'monthsShown' }
  | { type: 'bookhouseOpened' }
  | { type: 'gardenFocused' }
  | { type: 'finaleDone' };

export interface TransitionContext { draftHasText: boolean; firstFlowerId: string | null }

export const stepIndex = (step: string) => ONBOARDING_STEPS.indexOf(step as OnboardingStep);
export const isOnboardingStep = (step: unknown): step is OnboardingStep =>
  typeof step === 'string' && stepIndex(step) >= 0;

const NEXT: Partial<Record<OnboardingStep, OnboardingStep>> = {
  'garden.zoom': 'event.nav',
  'plant.growth': 'plant.months',
  'treehouse.shelf': 'treehouse.books',
  'treehouse.books': 'treehouse.archive',
  'treehouse.archive': 'treehouse.back',
  'mailbox': 'friends.nav',
  'friends.search': 'friends.house',
  'friends.house': 'friends.visit',
  'friends.visit': 'friends.return',
  'fairy.feed': 'fairy.bond',
  'fairy.bond': 'fairy.keepsakes',
  'fairy.keepsakes': 'me.space',
  'me.space': 'me.privacy',
  'me.privacy': 'finale',
};

/** The next step for a signal, or null when the signal does not move this step on.
 * Mandatory steps ignore Next; only the real action (a saved Event, a planted Flower …) counts. */
export function onboardingTransition(step: OnboardingStep, signal: OnboardingSignal,
  context: TransitionContext): OnboardingStep | null {
  switch (signal.type) {
    case 'next':
      if (step === 'event.write') return context.draftHasText ? 'event.mood' : null;
      if (step === 'plant.months') return null; // the overview finishes on its own
      return NEXT[step] ?? null;
    case 'zoom': return step === 'garden.zoom' ? 'event.nav' : null;
    case 'nameSaved': return step === 'intro.name' ? 'intro.celebrate' : null;
    case 'celebrated': return step === 'intro.celebrate' ? 'garden.zoom' : null;
    case 'featureOpened':
      if (signal.feature === 'events' && step === 'event.nav') return 'event.write';
      if (signal.feature === 'friends' && step === 'friends.nav') return 'friends.search';
      return null;
    case 'featureClosed':
      if (signal.feature === 'events') {
        // Leaving before the Event is saved returns to the Events button; after it is saved
        // the Garden takes over and plants the new Flower itself.
        if (step === 'event.write' || step === 'event.mood' || step === 'event.save') return 'event.nav';
        if (step === 'event.flower') return 'plant.place';
      }
      if (signal.feature === 'friends') {
        if (step === 'friends.return') return 'fairy.feed';
        if (step === 'friends.search' || step === 'friends.house' || step === 'friends.visit') return 'friends.nav';
      }
      return null;
    case 'draftChanged': return null;
    case 'moodSelected':
      if (step === 'event.mood') return 'event.save';
      if (step === 'event.write' && context.draftHasText) return 'event.save';
      return null;
    case 'eventSaved':
      if (step !== 'event.save' && step !== 'event.mood' && step !== 'event.write') return null;
      return signal.flowerId ? 'event.flower' : 'plant.growth';
    case 'plantRequested': return step === 'event.flower' ? 'plant.place' : null;
    case 'planted':
      return step === 'plant.place' && (!context.firstFlowerId || context.firstFlowerId === signal.flowerId)
        ? 'plant.growth' : null;
    case 'monthsShown': return step === 'plant.months' ? 'treehouse.enter' : null;
    case 'bookhouseOpened': return step === 'treehouse.enter' ? 'treehouse.shelf' : null;
    case 'gardenFocused': return step === 'treehouse.back' ? 'mailbox' : null;
    case 'finaleDone': return step === 'finale' ? 'done' : null;
  }
}

export interface SavedProgress {
  step: OnboardingStep;
  fairyNamed: boolean;
  firstEventId: string | null;
  firstFlowerId: string | null;
  flowerPlanted: boolean;
}

/** Where a reopened app continues. Steps that need a screen which is gone (an open panel,
 * the Treehouse) restart at the button that opens it; finished work is never repeated. */
export function resumeStep(saved: SavedProgress): OnboardingStep {
  const { step } = saved;
  if (!saved.fairyNamed) return 'intro.name';
  if (step === 'intro.name') return 'intro.celebrate';
  const eventDone = Boolean(saved.firstEventId);
  const plantingDone = saved.flowerPlanted || (eventDone && !saved.firstFlowerId);
  if (stepIndex(step) >= stepIndex('event.write') && !eventDone) return 'event.nav';
  if (stepIndex(step) >= stepIndex('event.write') && !plantingDone) return 'plant.place';
  if (step === 'event.write' || step === 'event.mood' || step === 'event.save' || step === 'event.flower' ||
      step === 'plant.place') return 'plant.growth';
  if (step === 'treehouse.shelf' || step === 'treehouse.books' || step === 'treehouse.archive') return 'treehouse.enter';
  if (step === 'treehouse.back') return 'mailbox';
  if (step === 'friends.search' || step === 'friends.house' || step === 'friends.visit' || step === 'friends.return') return 'friends.nav';
  return step;
}

/** Steps during which the tour, not the player, moves the Garden camera. */
export const cameraOwnedBy = (step: OnboardingStep) =>
  step === 'plant.place' || step === 'plant.growth' || step === 'plant.months' ||
  step === 'treehouse.enter' || step === 'mailbox' || step === 'finale';

/** Same rules as the server (lib/onboarding-tutorial.js normalizeFairyName), checked before saving. */
export const FAIRY_NAME_MAX_LENGTH = 16;
export function fairyNameProblem(value: string): '' | 'empty' | 'long' | 'characters' {
  const name = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!name) return 'empty';
  if ([...name].length > FAIRY_NAME_MAX_LENGTH) return 'long';
  if (!/^[\p{L}\p{M}\p{N} '’·.\-_]+$/u.test(name)) return 'characters';
  return '';
}
