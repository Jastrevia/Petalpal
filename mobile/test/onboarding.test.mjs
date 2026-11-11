import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
import { TUTORIAL_STEPS, normalizeFairyName } from '../../lib/onboarding-tutorial.js';

const plain = value => JSON.parse(JSON.stringify(value)); // VM-realm objects
const load = loadPlantingModules();
const steps = load('../../onboarding/onboardingSteps');
const layout = load('../../onboarding/onboardingLayout');
const masks = load('approvedPlantingMasks');
const read = relative => fs.readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8');
const ctx = { draftHasText: false, firstFlowerId: null };
const go = (step, signal, context = ctx) => steps.onboardingTransition(step, signal, context);

test('the app tour and the server share one step order', () => {
  assert.deepEqual(plain(steps.ONBOARDING_STEPS), [...TUTORIAL_STEPS]);
  for (const step of steps.ONBOARDING_STEPS) assert.ok(steps.STEP_SPECS[step], step);
});

test('fairy names are checked on the device with the same rules the server enforces', () => {
  for (const value of ['Lumi', '  小 花  ', 'Amélie-Rose', '花'.repeat(16)]) {
    assert.equal(steps.fairyNameProblem(value), '');
    assert.doesNotThrow(() => normalizeFairyName(value));
  }
  assert.equal(steps.fairyNameProblem('   '), 'empty');
  assert.equal(steps.fairyNameProblem('花'.repeat(17)), 'long');
  assert.equal(steps.fairyNameProblem('<script>'), 'characters');
});

test('informational steps move on with Next; the zoom step also moves on with either zoom button', () => {
  assert.equal(go('garden.zoom', { type: 'next' }), 'event.nav');
  assert.equal(go('garden.zoom', { type: 'zoom' }), 'event.nav');
  assert.equal(go('mailbox', { type: 'next' }), 'friends.nav');
  assert.equal(go('fairy.feed', { type: 'next' }), 'fairy.bond');
  assert.equal(go('me.privacy', { type: 'next' }), 'finale');
  assert.equal(go('treehouse.archive', { type: 'next' }), 'treehouse.journal');
  assert.equal(go('treehouse.journal', { type: 'next' }), 'treehouse.back');
});

test('mandatory steps cannot be skipped with Next or by touching the target', () => {
  for (const step of ['intro.name', 'event.nav', 'event.mood', 'event.save', 'event.flower', 'plant.place',
    'treehouse.enter', 'treehouse.books', 'treehouse.back', 'friends.nav', 'friends.return', 'finale']) {
    assert.equal(go(step, { type: 'next' }), null, step);
    assert.equal(go(step, { type: 'zoom' }), null, step);
  }
  // Writing needs real text before Next appears to work.
  assert.equal(go('event.write', { type: 'next' }), null);
  assert.equal(go('event.write', { type: 'next' }, { ...ctx, draftHasText: true }), 'event.mood');
  // The month overview ends only when its labels have faded.
  assert.equal(go('plant.months', { type: 'next' }), null);
  assert.equal(go('plant.months', { type: 'monthsShown' }), 'treehouse.enter');
});

test('real actions drive the mandatory steps in order', () => {
  assert.equal(go('event.nav', { type: 'featureOpened', feature: 'friends' }), null);
  assert.equal(go('event.nav', { type: 'featureOpened', feature: 'events' }), 'event.write');
  assert.equal(go('event.mood', { type: 'moodSelected' }), 'event.save');
  assert.equal(go('event.save', { type: 'eventSaved', eventId: 'e1', flowerId: 'f1' }), 'event.flower');
  assert.equal(go('event.save', { type: 'eventSaved', eventId: 'e1', flowerId: null }), 'plant.growth');
  assert.equal(go('event.flower', { type: 'plantRequested', flowerId: 'f1' }), 'plant.place');
  assert.equal(go('plant.place', { type: 'planted', flowerId: 'other' }, { ...ctx, firstFlowerId: 'f1' }), null);
  assert.equal(go('plant.place', { type: 'planted', flowerId: 'f1' }, { ...ctx, firstFlowerId: 'f1' }), 'plant.growth');
  assert.equal(go('treehouse.enter', { type: 'bookhouseOpened' }), 'treehouse.shelf');
  assert.equal(go('treehouse.books', { type: 'bookOpened' }), 'treehouse.archive');
  assert.equal(go('treehouse.back', { type: 'gardenFocused' }), 'mailbox');
  assert.equal(go('treehouse.shelf', { type: 'gardenFocused' }), null);
  assert.equal(go('friends.nav', { type: 'featureOpened', feature: 'friends' }), 'friends.search');
  assert.equal(go('friends.return', { type: 'featureClosed', feature: 'friends' }), 'fairy.feed');
  assert.equal(go('finale', { type: 'finaleDone' }), 'done');
  // Closing a panel early goes back to the button that opens it.
  assert.equal(go('event.mood', { type: 'featureClosed', feature: 'events' }), 'event.nav');
  assert.equal(go('friends.house', { type: 'featureClosed', feature: 'friends' }), 'friends.nav');
});

test('an interrupted tour resumes at a safe step and never repeats finished work', () => {
  const saved = (step, more = {}) => ({ step, fairyNamed: true, firstEventId: null, firstFlowerId: null, flowerPlanted: false, ...more });
  assert.equal(steps.resumeStep({ ...saved('garden.zoom'), fairyNamed: false }), 'intro.name');
  assert.equal(steps.resumeStep(saved('intro.name')), 'intro.celebrate');
  assert.equal(steps.resumeStep(saved('event.mood')), 'event.nav');
  assert.equal(steps.resumeStep(saved('event.save', { firstEventId: 'e1', firstFlowerId: 'f1' })), 'plant.place');
  assert.equal(steps.resumeStep(saved('event.flower', { firstEventId: 'e1', firstFlowerId: 'f1' })), 'plant.place');
  assert.equal(steps.resumeStep(saved('plant.place', { firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true })), 'plant.growth');
  assert.equal(steps.resumeStep(saved('event.save', { firstEventId: 'e1' })), 'plant.growth'); // no Flower that day
  assert.equal(steps.resumeStep(saved('treehouse.books', { firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true })), 'treehouse.enter');
  assert.equal(steps.resumeStep(saved('treehouse.journal', { firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true })), 'treehouse.enter');
  assert.equal(steps.resumeStep(saved('treehouse.back', { firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true })), 'mailbox');
  assert.equal(steps.resumeStep(saved('friends.visit', { firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true })), 'friends.nav');
  assert.equal(steps.resumeStep(saved('finale', { firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true })), 'finale');
});

test('the guide sits beside its target without covering it, on phone and desktop sizes', () => {
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const insets = { top: 44, bottom: 34, left: 0, right: 0 };
  for (const screen of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    const block = { width: Math.min(396, screen.width - 24), height: 150 };
    const targets = [
      { x: screen.width / 2 - 200, y: screen.height - 90, width: 400, height: 60 }, // bottom navigation
      { x: 12, y: screen.height - 130, width: 86, height: 40 }, // zoom buttons
      { x: 20, y: 80, width: screen.width - 40, height: 120 }, // a panel field
    ];
    for (const target of targets) {
      const at = layout.guidePlacement(target, screen, block, insets);
      const room = target.y - insets.top - 24 >= block.height || screen.height - insets.bottom - target.y - target.height - 24 >= block.height ||
        target.x >= block.width + 26 || screen.width - target.x - target.width >= block.width + 26;
      // Where there is room anywhere, the guide never covers the highlight.
      if (room) assert.equal(overlaps({ ...at, ...block }, target), false, JSON.stringify({ screen, target, at }));
      assert.ok(at.x >= 0 && at.x + block.width <= screen.width + .5, 'stays on screen horizontally');
    }
  }
});

test('all twelve month labels sit inside their own approved planting regions', () => {
  for (let month = 1; month <= 12; month++) {
    const centre = masks.getApprovedMonthCentroid(month);
    assert.equal(masks.isPointInApprovedMonthMaskWorld(month, centre.x, centre.y), true, `month ${month}`);
    assert.equal(masks.getApprovedRegionAtWorld(centre.x, centre.y, month), month);
    const bounds = masks.getApprovedMonthWorldBounds(month);
    assert.ok(centre.x >= bounds.x && centre.x <= bounds.x + bounds.width && centre.y >= bounds.y && centre.y <= bounds.y + bounds.height,
      `month ${month} label inside its bed`);
  }
  // The labels use exactly this mapping.
  assert.match(read('components/onboarding/MonthLabels.tsx'), /getApprovedMonthCentroid\(month\)/);
});

test('framing the current month centres its real bed within the camera limits', () => {
  const viewport = { width: 390, height: 844 };
  const fit = Math.min(viewport.width / 2400, viewport.height / 1500);
  const baseX = (viewport.width - 2400 * fit) / 2, baseY = (viewport.height - 1500 * fit) / 2;
  const insets = { top: 180, bottom: 120, left: 12, right: 12 };
  for (let month = 1; month <= 12; month++) {
    const box = masks.getApprovedMonthWorldBounds(month);
    const frame = layout.frameWorldBox(box, viewport, fit, baseX, baseY, insets, { min: 1, max: 6 }, .92);
    const screen = layout.worldBoxToScreen(box, frame, fit, baseX, baseY);
    const cx = screen.x + screen.width / 2, cy = screen.y + screen.height / 2;
    assert.ok(Math.abs(cx - viewport.width / 2) < 1, `month ${month} centred horizontally`);
    assert.ok(Math.abs(cy - (insets.top + (viewport.height - insets.top - insets.bottom) / 2)) < 1, `month ${month} centred vertically`);
    if (frame.zoom < 6) assert.ok(screen.width <= viewport.width - 24 + 1 && screen.height <= viewport.height - insets.top - insets.bottom + 1);
  }
});

function storeHarness(responses) {
  const calls = [];
  const queue = [...responses];
  const api = {
    loadOnboarding: async () => { calls.push(['GET']); const next = queue.shift(); if (next instanceof Error) throw next; return next; },
    updateOnboarding: async update => { calls.push(['PATCH', update]); const next = queue.shift(); if (next instanceof Error) throw next; return next; },
  };
  const store = loadPlantingModules(undefined, undefined, undefined, true, {
    '../../services/onboarding': api, 'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  })('../../onboarding/onboardingStore');
  return { store, calls };
}
const progress = (more = {}) => ({ status: 'active', step: 'intro.name', fairyName: null, fairyNamed: false,
  firstEventId: null, firstFlowerId: null, flowerPlanted: false, ...more });

test('returning owners never see the tour; new owners start at naming', async () => {
  const returning = storeHarness([progress({ status: 'completed', step: 'done', fairyName: 'PPL', fairyNamed: true })]);
  await returning.store.beginOnboarding('owner');
  assert.equal(returning.store.onboardingState().phase, 'completed');
  assert.equal(returning.store.onboardingActive(), false);
  const fresh = storeHarness([progress()]);
  await fresh.store.beginOnboarding('owner');
  assert.equal(fresh.store.onboardingState().phase, 'active');
  assert.equal(fresh.store.onboardingState().step, 'intro.name');
  // An unreachable server leaves the Garden as it is.
  const offline = storeHarness([new Error('offline')]);
  await offline.store.beginOnboarding('owner');
  assert.equal(offline.store.onboardingState().phase, 'unavailable');
});

test('naming waits for the server, then the tour records the real Event, Flower and planting', async () => {
  const named = progress({ step: 'intro.celebrate', fairyName: 'Lumi', fairyNamed: true });
  const { store, calls } = storeHarness([progress(), named, named, named, named, named,
    progress({ ...named, firstEventId: 'e1', firstFlowerId: 'f1' }), progress({ ...named, firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true })]);
  await store.beginOnboarding('owner');
  await store.saveFairyName('Lumi');
  assert.deepEqual(plain(calls[1]), ['PATCH', { fairyName: 'Lumi', step: 'intro.celebrate' }]);
  assert.equal(store.onboardingState().fairyName, 'Lumi');
  assert.equal(store.onboardingState().step, 'intro.celebrate');
  store.dispatchOnboarding({ type: 'celebrated' });
  store.dispatchOnboarding({ type: 'zoom' });
  store.dispatchOnboarding({ type: 'featureOpened', feature: 'events' });
  store.dispatchOnboarding({ type: 'next' }); // no text yet: ignored
  assert.equal(store.onboardingState().step, 'event.write');
  store.dispatchOnboarding({ type: 'draftChanged', hasText: true });
  store.dispatchOnboarding({ type: 'moodSelected' });
  store.dispatchOnboarding({ type: 'eventSaved', eventId: 'e1', flowerId: 'f1' });
  assert.equal(store.onboardingState().step, 'event.flower');
  store.dispatchOnboarding({ type: 'plantRequested', flowerId: 'f1' });
  store.dispatchOnboarding({ type: 'planted', flowerId: 'f1' });
  await store.retryOnboardingSync();
  assert.equal(store.onboardingState().step, 'plant.growth');
  const patches = calls.filter(call => call[0] === 'PATCH').map(call => call[1]);
  assert.ok(patches.some(update => update.firstEventId === 'e1' && update.firstFlowerId === 'f1'), 'Event and Flower linked');
  assert.ok(patches.some(update => update.flowerPlanted === true), 'planting recorded');
});

test('a failed save is kept and sent again; completion is saved once the finale ends', async () => {
  const done = progress({ status: 'completed', step: 'done', fairyNamed: true });
  const { store, calls } = storeHarness([progress({ step: 'me.privacy', fairyNamed: true, firstEventId: 'e1', firstFlowerId: 'f1', flowerPlanted: true }),
    new Error('offline'), done]);
  await store.beginOnboarding('owner');
  store.dispatchOnboarding({ type: 'next' }); // → finale, save fails
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(store.onboardingState().step, 'finale');
  assert.equal(store.onboardingState().syncFailed, true);
  store.dispatchOnboarding({ type: 'finaleDone' });
  await store.retryOnboardingSync();
  const last = calls.at(-1)[1];
  assert.equal(last.complete, true);
  assert.equal(last.step, 'finale', 'the unsent step travels with the completion');
  assert.equal(store.onboardingState().phase, 'completed');
});

test('the tour is wired into the real screens', () => {
  const scene = read('components/garden/GardenScene.tsx');
  assert.match(scene, /onboardingTarget\('garden\.zoom'\)/);
  assert.equal((scene.match(/dispatchOnboarding\(\{ type: 'zoom' \}\)/g) || []).length, 2, 'both zoom buttons');
  assert.match(scene, /renderOverlay\(cameraApi\)/);
  assert.match(scene, /constrainGardenCamera\(viewport\.width, viewport\.height, fit, baseX, baseY,\n\s+viewport\.width \/ 2/);
  const hud = read('components/garden/GardenHud.tsx');
  assert.match(hud, /onboardingTarget\(`nav\.\$\{feature\.id\}`\)/);
  const events = read('components/features/EventsPanel.tsx');
  for (const id of ['events.input', 'events.moods', 'events.save', 'events.plant']) assert.ok(events.includes(`'${id}'`), id);
  assert.match(read('hooks/useEventJournal.ts'), /type: 'eventSaved', eventId: created\.event\.id/);
  assert.match(read('components/garden/planting/PlantingContext.tsx'), /type: 'planted', flowerId: committed\.flowerId/);
  const overlay = read('components/features/FeatureOverlay.tsx');
  assert.match(overlay, /type: 'featureOpened'/);
  assert.match(overlay, /<TourPanelLayer surface=\{feature\.id\} \/>/);
  const bookhouse = read('app/bookhouse.tsx');
  assert.match(bookhouse, /type: 'bookhouseOpened'/);
  for (const id of ['bookhouse.years', 'bookhouse.books', 'bookhouse.shelf', 'bookhouse.back']) assert.ok(bookhouse.includes(`'${id}'`), id);
  const home = read('app/index.tsx');
  assert.match(home, /enableFairyWalk=\{!tourHoldsFairy\}/);
  assert.match(home, /type: 'gardenFocused'/);
  // Friends teaching never touches privacy: the tour code has no privacy or friendship writes.
  for (const file of fs.readdirSync(new URL('../src/components/onboarding/', import.meta.url), { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name)) {
    const source = read(`components/onboarding/${file}`);
    assert.doesNotMatch(source, /saveGardenPrivacy|sendFriendRequest|respondToFriendRequest|removeFriend|visitMailbox|createEvent\(/, file);
  }
  // The mailbox step is informational: its highlight acts as Next and never opens the mailbox.
  assert.equal(steps.STEP_SPECS.mailbox.hole, 'next');
  assert.equal(steps.STEP_SPECS.mailbox.kind, 'info');
});

test('the onboarding preview is development-only and never reachable in production', () => {
  const policy = loadPlantingModules(undefined, undefined, undefined, true, {}, false)('../../../services/routePolicy');
  assert.equal(policy.routeAllowed('/onboarding-preview', false), false);
  assert.equal(policy.routeAllowed('/onboarding-preview', true), true);
  const shellProd = loadPlantingModules(undefined, undefined, undefined, true, {
    '../../../services/auth': {}, '../../../services/api': {}, '../../garden/planting/plantingPersistence': {}, './previewBackend': {},
  }, false)('../../onboarding/preview/OnboardingPreviewShell');
  assert.equal(shellProd.usesOnboardingPreviewShell('/onboarding-preview'), false);
  const shellDev = loadPlantingModules(undefined, undefined, undefined, true, {
    '../../../services/auth': {}, '../../../services/api': {}, '../../garden/planting/plantingPersistence': {}, './previewBackend': {},
  }, true)('../../onboarding/preview/OnboardingPreviewShell');
  assert.equal(shellDev.usesOnboardingPreviewShell('/bookhouse'), false, 'the real Treehouse keeps real sign-in');
  assert.equal(shellDev.usesOnboardingPreviewShell('/onboarding-preview'), true);
  assert.equal(shellDev.usesOnboardingPreviewShell('/bookhouse'), true, 'the preview Garden can open its Treehouse');
  assert.equal(shellDev.usesOnboardingPreviewShell('/'), false, 'leaving returns to the real app');
  assert.equal(shellDev.usesOnboardingPreviewShell('/bookhouse'), false);
  const layout = read('app/_layout.tsx');
  assert.match(layout, /__DEV__\s*\n?\s*\? require\('\.\.\/components\/onboarding\/preview\/OnboardingPreviewShell'\) : null/);
  assert.match(layout, /\{__DEV__ && <Stack\.Screen name="onboarding-preview"/);
  assert.match(read('app/onboarding-preview.tsx'), /if \(!__DEV__\) return <Redirect href="\/" \/>/);
});

test('the preview answers requests in memory: no network, no real account, real tour data shapes', async () => {
  const fetchCalls = [];
  const api = loadPlantingModules(undefined, undefined, undefined, true, {
    './nativeSecurity': { assertNativeSecurityClient() {} }, fetch: (...args) => { fetchCalls.push(args); throw new Error('network'); },
  }, true)('../../../services/api');
  const backendModule = loadPlantingModules(undefined, undefined, undefined, true, { '../../../services/api': api }, true)('../../onboarding/preview/previewBackend');
  api.setPreviewApiTransport((path, method, body) => backendModule.previewRequest(path, method, body));
  const tour = await api.apiRequest('/api/onboarding');
  assert.equal(tour.status, 'active'); assert.equal(tour.step, 'intro.name');
  const named = await api.apiRequest('/api/onboarding', 'PATCH', { fairyName: '  小月 ', step: 'intro.celebrate' });
  assert.deepEqual([named.fairyName, named.fairyNamed, named.step], ['小月', true, 'intro.celebrate']);
  const created = await api.apiRequest('/events', 'POST', { content: 'tea', primaryGardenMood: 'WONDER_BLOOM' });
  assert.equal(created.flower.speciesCode, 'TULIP');
  assert.equal(created.flower.sourceEventId, created.event.id);
  const garden = await api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/garden?view=metadata`);
  assert.equal(garden.flowers.length, 1);
  await assert.rejects(api.apiRequest('/users/someone-else/garden'), error => error.status === 404);
  await assert.rejects(api.apiRequest('/api/fairy/runtime'), error => error.status === 409);
  // Jumping ahead prepares exactly what the step needs.
  const atMonths = backendModule.previewBackend.prepareFor('plant.months', 'en');
  assert.deepEqual([atMonths.fairyNamed, Boolean(atMonths.firstEventId), atMonths.flowerPlanted], [true, true, true]);
  const atPlanting = backendModule.previewBackend.prepareFor('plant.place', 'en');
  assert.equal(atPlanting.flowerPlanted, false);
  backendModule.previewBackend.reset();
  assert.equal((await api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/garden`)).flowers.length, 0);
  assert.equal(fetchCalls.length, 0, 'nothing left the device');
  // In a production build the preview transport cannot be installed.
  const prodApi = loadPlantingModules(undefined, undefined, undefined, true, { './nativeSecurity': { assertNativeSecurityClient() {} } }, false)('../../../services/api');
  prodApi.setPreviewApiTransport(async () => ({ hijacked: true }));
  await assert.rejects(prodApi.apiRequest('/api/onboarding'), error => error.status === 401);
});

test('preview flower positions stay in memory and never touch browser storage', async () => {
  const writes = [];
  const storage = { getItem: () => null, setItem: (...args) => writes.push(args), removeItem: (...args) => writes.push(args), key: () => null, length: 0 };
  const persistence = loadPlantingModules(storage, undefined, {}, true, {}, true)('plantingPersistence');
  persistence.setPreviewPlacementMemory('onboarding-preview-owner');
  await persistence.addOrUpdateFlowerPlacement({ id: 'p1', flowerId: 'f1', month: 10, worldX: 1, worldY: 2, scale: 1, rotation: 0,
    placementVersion: 1, flowerName: 'Tulip', journalEntryId: '', plantedDate: '2026-10-26', supportCount: 0 });
  assert.equal((await persistence.loadFlowerPlacements()).length, 1);
  assert.deepEqual(writes, []);
  persistence.setPreviewPlacementMemory(null);
  await assert.rejects(persistence.loadFlowerPlacements().then(rows => { if (!rows.length) throw new Error('closed'); }), /closed|unavailable/);
});

import { hookHarness } from './hookHarness.mjs';

test('previewBackend handles Event creation validation, POST/PATCH flower placement, and auxiliary preview routes', async () => {
  const api = loadPlantingModules(undefined, undefined, undefined, true, {
    './nativeSecurity': { assertNativeSecurityClient() {} },
  }, true)('../../../services/api');
  const backendModule = loadPlantingModules(undefined, undefined, undefined, true, { '../../../services/api': api }, true)('../../onboarding/preview/previewBackend');
  api.setPreviewApiTransport((path, method, body) => backendModule.previewRequest(path, method, body));
  backendModule.previewBackend.reset();

  // Event validation failure when mood is missing or invalid
  await assert.rejects(
    api.apiRequest('/events', 'POST', { content: 'Missing mood', primaryGardenMood: '' }),
    error => error.status === 400 && error.code === 'MOOD_REQUIRED'
  );
  await assert.rejects(
    api.apiRequest('/events', 'POST', { content: 'Invalid mood', primaryGardenMood: 'UNKNOWN_MOOD' }),
    error => error.status === 400 && error.code === 'MOOD_REQUIRED'
  );

  // Event creation success
  const created = await api.apiRequest('/events', 'POST', { content: 'Evening walk', primaryGardenMood: 'PEACEFUL_BLOOM' });
  assert.equal(created.event.content, 'Evening walk');
  assert.equal(created.flower.speciesCode, 'LAVENDER');
  assert.ok(Array.isArray(created.flower.messages));

  // Auxiliary preview endpoints do not fail with 404 Not available in the onboarding preview
  const consent = await api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/ai-consent`);
  assert.equal(consent.aiProcessing, false);
  const avatars = await api.apiRequest('/api/avatars');
  assert.equal(avatars.equipped, 'avatar-01');
  const closeness = await api.apiRequest('/api/fairy/closeness');
  assert.equal(closeness.level, 1);

  // Planting save failure with invalid coordinates or landId
  const flowerId = created.flower.id;
  await assert.rejects(
    api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/flowers/${flowerId}/placement`, 'POST', {
      worldX: Number.NaN, worldY: 300, landId: 'Land11',
    }),
    error => error.status === 400
  );
  await assert.rejects(
    api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/flowers/${flowerId}/placement`, 'POST', {
      worldX: 1120, worldY: 320, landId: 'InvalidLand',
    }),
    error => error.status === 400
  );

  // Planting save success via POST (used by plantFlowerSpot)
  const planted = await api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/flowers/${flowerId}/placement`, 'POST', {
    worldX: 1120, worldY: 320, landId: 'Land11',
  });
  assert.equal(planted.worldX, 1120);
  assert.equal(planted.worldY, 320);
  assert.equal(planted.landId, 'Land11');

  // Garden hydration sees worldX and worldY on subsequent loads
  const garden = await api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/garden?view=metadata`);
  const savedFlower = garden.flowers.find(f => f.id === flowerId);
  assert.equal(savedFlower.worldX, 1120);
  assert.equal(savedFlower.worldY, 320);
  assert.equal(savedFlower.regionId, 'Land11');

  // Re-planting at a different spot is rejected with 409 PLACEMENT_LOCKED
  await assert.rejects(
    api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/flowers/${flowerId}/placement`, 'POST', {
      worldX: 1150, worldY: 340, landId: 'Land11',
    }),
    error => error.status === 409 && error.code === 'PLACEMENT_LOCKED'
  );
});

test('planting Cancel works before save, during save (ignoring late save responses), and after save failure', async () => {
  const hooks = hookHarness();
  const items = new Map();
  let holdSave = false;
  let failSave = false;
  let resolveHeldSave = null;
  const rows = [{
    id: 'f-cancel', userId: 'alice', name: 'Sunflower', speciesCode: 'SUNFLOWER',
    mood: 'SUNNY_BLOOM', img: 'sunflower.png', createdAt: '2026-09-29T01:00:00Z', supportCount: 0,
    sourceEventId: null,
  }];
  const signals = [];
  const fetch = async (url, init = {}) => {
    if (init.method === 'POST') {
      if (failSave) {
        return { ok: false, status: 500, json: async () => ({ error: 'Unable to plant here. Try again.' }) };
      }
      if (holdSave) {
        await new Promise(resolve => { resolveHeldSave = resolve; });
      }
      const body = JSON.parse(init.body);
      return { ok: true, status: 201, json: async () => ({ flowerId: 'f-cancel', ...body }) };
    }
    return { ok: true, status: 200, json: async () => ({ owner: { id: 'alice' }, flowers: rows.map(r => ({ ...r })) }) };
  };

  const load = loadPlantingModules(
    { getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value) },
    hooks.react,
    undefined,
    true,
    {
      fetch,
      '../../onboarding/onboardingSignals': {
        dispatchOnboarding: signal => signals.push(signal),
      },
      './flowerDetailApi': {
        loadFlowerSession: async () => null,
        subscribeToFlowerUpdates: () => () => {},
        loadFlowerSource: async () => null,
        deleteSourceFlower: async () => {},
      },
    }
  );
  load('../../../services/api').configureApi({ apiBaseUrl: '', getAccessToken: async () => 'fixture-token' });
  const Provider = load('PlantingContext').PlantingProvider;
  const props = { children: null, backendMode: true, session: { user: { id: 'alice', timezone: 'UTC' } } };
  hooks.mount(() => { const wrapper = Provider(props); return wrapper.type(wrapper.props).props.value; });

  const validator = load('placementValidator');
  const c9 = masks.getApprovedMonthCentroid(9);
  let validPoint = null;
  for (let ring = 0; ring < 30 && !validPoint; ring++) {
    for (let dx = -ring; dx <= ring && !validPoint; dx++) {
      for (let dy = -ring; dy <= ring && !validPoint; dy++) {
        const pt = { x: c9.x + dx * 12, y: c9.y + dy * 12 };
        if (validator.validateFlowerPlacement({
          flowerId: 'f-cancel', month: 9, worldX: pt.x, worldY: pt.y, existingPlacements: [],
          flowerName: 'Sunflower', speciesCode: 'SUNFLOWER',
        }).isValid) validPoint = pt;
      }
    }
  }
  assert.ok(validPoint, 'found valid Month 9 point');

  let current = await hooks.flush();

  // 1. Cancel before selecting a location & after selecting a location (before save)
  await current.startPlanting({ flowerId: 'f-cancel', month: 9, flowerName: 'Sunflower' });
  current = await hooks.flush();
  assert.equal(current.activeMode, 'planting');
  current.updatePreview(validPoint.x, validPoint.y);
  current = await hooks.flush();
  assert.equal(current.validationResult?.isValid, true);
  current.cancelPlacement();
  current = await hooks.flush();
  assert.equal(current.activeMode, 'normal');
  assert.equal(current.targetFlower, null);
  assert.equal(current.previewCoords, null);
  assert.equal(current.validationResult, null);

  // 2. Cancel after a failed save
  failSave = true;
  await current.startPlanting({ flowerId: 'f-cancel', month: 9, flowerName: 'Sunflower' });
  current = await hooks.flush();
  current.updatePreview(validPoint.x, validPoint.y);
  current = await hooks.flush();
  assert.equal(await current.confirmPlacement(), false);
  current = await hooks.flush();
  assert.equal(current.activeMode, 'planting');
  // A failed save keeps the valid preview (Plant can be retried) and shows the error.
  assert.equal(current.validationResult?.isValid, true);
  assert.equal(current.placementNotice?.kind, 'error');
  current.cancelPlacement();
  current = await hooks.flush();
  assert.equal(current.activeMode, 'normal');
  assert.equal(current.targetFlower, null);
  assert.equal(current.previewCoords, null);
  assert.equal(current.validationResult, null);
  assert.equal(current.detailError, '');
  failSave = false;

  // 3. Cancel during an in-flight save + late save response after cancellation is ignored
  holdSave = true;
  await current.startPlanting({ flowerId: 'f-cancel', month: 9, flowerName: 'Sunflower' });
  current = await hooks.flush();
  current.updatePreview(validPoint.x, validPoint.y);
  current = await hooks.flush();

  const pendingConfirm = current.confirmPlacement();
  current = await hooks.flush();
  assert.equal(current.isSaving, true);

  // User clicks Cancel while save is still in-flight
  current.cancelPlacement();
  current = await hooks.flush();
  assert.equal(current.activeMode, 'normal');
  assert.equal(current.isSaving, false);
  assert.equal(current.targetFlower, null);
  assert.equal(current.previewCoords, null);

  // Late response arrives after cancellation
  resolveHeldSave();
  const lateResult = await pendingConfirm;
  current = await hooks.flush();
  assert.equal(lateResult, false, 'cancelled save resolves false');
  assert.equal(current.activeMode, 'normal', 'remains in normal mode after late save response');
  assert.equal(signals.length, 0, 'cancelled save must not emit planted signal');
  holdSave = false;

  // 4. Re-entering planting after Cancel succeeds cleanly
  await current.startPlanting({ flowerId: 'f-cancel', month: 9, flowerName: 'Sunflower' });
  current = await hooks.flush();
  current.updatePreview(validPoint.x, validPoint.y);
  current = await hooks.flush();
  assert.equal(await current.confirmPlacement(), true);
  current = await hooks.flush();
  assert.equal(current.activeMode, 'normal');
  assert.deepEqual(plain(signals), [{ type: 'planted', flowerId: 'f-cancel' }]);
});

test('step changes and preview jumps exit planting mode and transition Event -> Planting -> Treehouse -> Mailbox cleanly', async () => {
  const api = loadPlantingModules(undefined, undefined, undefined, true, {
    './nativeSecurity': { assertNativeSecurityClient() {} },
  }, true)('../../../services/api');
  const backendModule = loadPlantingModules(undefined, undefined, undefined, true, { '../../../services/api': api }, true)('../../onboarding/preview/previewBackend');
  api.setPreviewApiTransport((path, method, body) => backendModule.previewRequest(path, method, body));
  backendModule.previewBackend.reset();

  const onboardingApi = {
    loadOnboarding: () => api.apiRequest('/api/onboarding'),
    updateOnboarding: update => api.apiRequest('/api/onboarding', 'PATCH', update),
  };
  const store = loadPlantingModules(undefined, undefined, undefined, true, {
    '../../services/onboarding': onboardingApi,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  }, true)('../../onboarding/onboardingStore');

  await store.beginOnboarding(backendModule.PREVIEW_OWNER_ID);
  await store.saveFairyName('小月');
  store.dispatchOnboarding({ type: 'celebrated' });
  store.dispatchOnboarding({ type: 'zoom' });
  store.dispatchOnboarding({ type: 'featureOpened', feature: 'events' });
  assert.equal(store.onboardingState().step, 'event.write');

  // Event creation flow: write text -> choose mood -> save Event -> request plant
  store.dispatchOnboarding({ type: 'draftChanged', hasText: true });
  store.dispatchOnboarding({ type: 'moodSelected' });
  assert.equal(store.onboardingState().step, 'event.save');

  const created = await api.apiRequest('/events', 'POST', {
    content: '今天种下第一朵向日葵',
    primaryGardenMood: 'SUNNY_BLOOM',
  });
  store.dispatchOnboarding({ type: 'eventSaved', eventId: created.event.id, flowerId: created.flower.id });
  assert.equal(store.onboardingState().step, 'event.flower');

  store.dispatchOnboarding({ type: 'plantRequested', flowerId: created.flower.id });
  assert.equal(store.onboardingState().step, 'plant.place');

  // Confirm placement in previewBackend and emit planted
  const c = masks.getApprovedMonthCentroid(11);
  await api.apiRequest(`/users/${backendModule.PREVIEW_OWNER_ID}/flowers/${created.flower.id}/placement`, 'POST', {
    worldX: c.x, worldY: c.y, landId: 'Land11',
  });
  store.dispatchOnboarding({ type: 'planted', flowerId: created.flower.id });
  assert.equal(store.onboardingState().step, 'plant.growth');

  // Advance through plant.growth -> plant.months -> Treehouse -> Mailbox
  store.dispatchOnboarding({ type: 'next' });
  assert.equal(store.onboardingState().step, 'plant.months');
  store.dispatchOnboarding({ type: 'monthsShown' });
  assert.equal(store.onboardingState().step, 'treehouse.enter');
  store.dispatchOnboarding({ type: 'bookhouseOpened' });
  assert.equal(store.onboardingState().step, 'treehouse.shelf');
  store.dispatchOnboarding({ type: 'next' });
  assert.equal(store.onboardingState().step, 'treehouse.books');
  store.dispatchOnboarding({ type: 'bookOpened' });
  assert.equal(store.onboardingState().step, 'treehouse.archive');
  store.dispatchOnboarding({ type: 'next' });
  assert.equal(store.onboardingState().step, 'treehouse.journal');
  store.dispatchOnboarding({ type: 'next' });
  assert.equal(store.onboardingState().step, 'treehouse.back');
  store.dispatchOnboarding({ type: 'gardenFocused' });
  assert.equal(store.onboardingState().step, 'mailbox');

});

// P0 regression: the tour layer is always mounted in the Garden. It cancelled every planting
// outside the tour (an Event's Plant entered planting and was cancelled at once). It may only end
// planting that belongs to the tour: when the tour leaves plant.place / ends, or while the tour
// runs on another step.
test('the tour layer never cancels an owner planting outside the tour, and still ends tour planting', () => {
  const hooks = hookHarness();
  let tour = { phase: 'completed', step: 'done' };
  let planting = { activeMode: 'normal' };
  let cancels = 0;
  const stub = () => null;
  const load = loadPlantingModules(undefined, hooks.react, undefined, true, {
    'react-native': { Image: 'Image', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles, absoluteFill: {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../bond/keepsakeArt': { KEEPSAKE_ART: {} },
    '../garden/planting/PlantingContext': { usePlanting: () => planting },
    './onboardingStore': { useOnboarding: () => tour, dispatchOnboarding() {},
      tourRunning: value => value.phase === 'active' && value.step !== 'done' },
    './FairyFinale': { FairyFinale: stub }, './FairyIntro': { FairyIntro: stub },
    './MonthLabels': { MonthLabels: stub, monthLabelAnchors: () => [] },
    './OnboardingGuide': { OnboardingGuide: stub, serif: 'serif' },
    './OnboardingStepView': { OnboardingStepView: stub, useTourLocale: () => 'en' },
    './onboardingTargets': { useOnboardingTargetRect: () => null },
  });
  const { OnboardingGardenLayer } = load('../../onboarding/OnboardingGardenLayer');
  const camera = { fit: 0, viewport: { width: 0, height: 0 }, baseX: 0, baseY: 0, animateTo: async () => true };
  const render = () => hooks.render();
  const set = (nextTour, mode) => {
    tour = nextTour;
    planting = { activeMode: mode, cancelPlacement: () => { cancels++; }, refreshGarden: async () => {} };
  };
  set(tour, 'normal');
  hooks.mount(() => OnboardingGardenLayer({ camera, onOpenTreehouse() {} }));
  // Tour finished: the owner taps Plant on an Event, planting starts and stays.
  set({ phase: 'completed', step: 'done' }, 'planting'); render(); render();
  assert.equal(cancels, 0, 'Planting outside the tour is never cancelled by the tour layer');
  set({ phase: 'idle', step: 'intro.name' }, 'planting'); render();
  assert.equal(cancels, 0);
  // The tour's own planting step: kept while on plant.place …
  set({ phase: 'active', step: 'plant.place' }, 'planting'); render();
  assert.equal(cancels, 0);
  // … and ended when the tour moves on or ends.
  set({ phase: 'active', step: 'plant.growth' }, 'planting'); render();
  assert.equal(cancels, 1);
  set({ phase: 'active', step: 'plant.place' }, 'planting'); render();
  set({ phase: 'completed', step: 'done' }, 'planting'); render();
  assert.equal(cancels, 2, 'Ending the tour on plant.place ends its planting');
});

test('per-user onboarding persistence: new accounts start at intro, returning completed stay completed, incomplete resumes safe step, users are isolated', async () => {
  const storeMap = new Map();
  const mockAsyncStorage = {
    getItem: async (key) => storeMap.get(key) || null,
    setItem: async (key, val) => { storeMap.set(key, val); },
    removeItem: async (key) => { storeMap.delete(key); },
  };

  let serverAvailable = false;
  let activeUser = 'user-alice-123';
  const completedUsers = new Set();

  const mockApi = {
    apiRequest: async (path, method, body) => {
      if (path === '/api/onboarding') {
        if (!serverAvailable) {
          const err = new Error('Service Unavailable');
          err.status = 503;
          throw err;
        }
        if (method === 'PATCH') {
          if (body?.complete) completedUsers.add(activeUser);
          const isDone = completedUsers.has(activeUser);
          return {
            status: isDone ? 'completed' : 'active',
            step: isDone ? 'done' : (body?.step || 'intro.name'),
            fairyName: 'Lumi',
            fairyNamed: true,
            firstEventId: null,
            firstFlowerId: null,
            flowerPlanted: true,
          };
        }
        if (completedUsers.has(activeUser)) {
          return {
            status: 'completed',
            step: 'done',
            fairyName: 'Lumi',
            fairyNamed: true,
            firstEventId: null,
            firstFlowerId: null,
            flowerPlanted: true,
          };
        }
        const err = new Error('Onboarding in progress');
        err.status = 404;
        throw err;
      }
      throw new Error(`Unexpected path ${path}`);
    },
  };

  const loader = loadPlantingModules(undefined, undefined, mockAsyncStorage, true, {
    './api': mockApi,
    '../../../services/api': mockApi,
  }, false);

  const onboardingService = loader('../../../services/onboarding');
  const store = loadPlantingModules(undefined, undefined, mockAsyncStorage, true, {
    '../../services/onboarding': onboardingService,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  }, false)('../../onboarding/onboardingStore');

  // Scenario A: Brand-new user starts at intro.name
  await store.beginOnboarding('user-alice-123');
  assert.equal(store.onboardingState().phase, 'active');
  assert.equal(store.onboardingState().step, 'intro.name');
  assert.equal(store.onboardingState().userId, 'user-alice-123');

  // Alice makes progress: names fairy and reaches event.write
  await store.saveFairyName('Lumi');
  assert.equal(store.onboardingState().fairyName, 'Lumi');
  assert.equal(store.onboardingState().step, 'intro.celebrate');
  store.dispatchOnboarding({ type: 'celebrated' });
  store.dispatchOnboarding({ type: 'zoom' });
  store.dispatchOnboarding({ type: 'featureOpened', feature: 'events' });
  assert.equal(store.onboardingState().step, 'event.write');
  await store.retryOnboardingSync();

  // Alice logs out or app unmounts
  store.endOnboardingSession();
  assert.equal(store.onboardingState().phase, 'idle');
  assert.equal(store.onboardingState().userId, null);

  // Scenario B: Returning user Bob with existing completed status
  await store.beginOnboarding('user-bob-completed', true);
  assert.equal(store.onboardingState().phase, 'completed');
  assert.equal(store.onboardingState().step, 'done');
  store.endOnboardingSession();

  // Scenario C: Returning user Alice logs back in (interrupted at event.write) -> resumes safe step event.nav
  await store.beginOnboarding('user-alice-123');
  assert.equal(store.onboardingState().phase, 'active');
  assert.equal(store.onboardingState().step, 'event.nav');
  assert.equal(store.onboardingState().fairyName, 'Lumi');
  assert.equal(store.onboardingState().fairyNamed, true);

  // Advance Alice to Finale
  store.dispatchOnboarding({ type: 'featureOpened', feature: 'events' });
  store.dispatchOnboarding({ type: 'draftChanged', hasText: true });
  store.dispatchOnboarding({ type: 'moodSelected' });
  store.dispatchOnboarding({ type: 'eventSaved', eventId: 'evt-1', flowerId: 'flw-1' });
  store.dispatchOnboarding({ type: 'plantRequested', flowerId: 'flw-1' });
  store.dispatchOnboarding({ type: 'planted', flowerId: 'flw-1' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'monthsShown' });
  store.dispatchOnboarding({ type: 'bookhouseOpened' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'bookOpened' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'gardenFocused' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'featureOpened', feature: 'friends' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'next' });
  store.dispatchOnboarding({ type: 'featureClosed', feature: 'friends' });
  store.dispatchOnboarding({ type: 'next' }); // fairy.feed -> fairy.bond
  store.dispatchOnboarding({ type: 'next' }); // fairy.bond -> fairy.keepsakes
  store.dispatchOnboarding({ type: 'next' }); // fairy.keepsakes -> me.space
  store.dispatchOnboarding({ type: 'next' }); // me.space -> me.privacy
  store.dispatchOnboarding({ type: 'next' }); // me.privacy -> finale
  assert.equal(store.onboardingState().step, 'finale');

  // Scenario F: Finale completes while backend is temporarily unavailable
  store.dispatchOnboarding({ type: 'finaleDone' });
  await store.retryOnboardingSync();
  assert.equal(store.onboardingState().step, 'done');
  assert.equal(store.onboardingState().syncFailed, true);
  // Local completion is preserved in AsyncStorage
  const localAlice = JSON.parse(storeMap.get('petalpal_onboarding_progress_v1:user-alice-123'));
  assert.equal(localAlice.status, 'completed');
  assert.equal(localAlice.step, 'done');

  // Backend becomes available again and retry succeeds
  serverAvailable = true;
  await store.retryOnboardingSync();
  assert.equal(store.onboardingState().step, 'done');
  assert.equal(store.onboardingState().phase, 'completed');
  assert.equal(store.onboardingState().syncFailed, false);
  assert.equal(completedUsers.has('user-alice-123'), true, 'server must acknowledge database completion');

  // Next session (or fresh login on another device): Alice stays completed
  store.endOnboardingSession();
  activeUser = 'user-alice-123';
  await store.beginOnboarding('user-alice-123');
  assert.equal(store.onboardingState().phase, 'completed');
  assert.equal(store.onboardingState().step, 'done');
  store.endOnboardingSession();

  // Scenario D: Multi-user isolation on the same device - user Charlie is untouched and fresh
  activeUser = 'user-charlie-fresh';
  await store.beginOnboarding('user-charlie-fresh');
  assert.equal(store.onboardingState().phase, 'active');
  assert.equal(store.onboardingState().step, 'intro.name');
  assert.equal(store.onboardingState().fairyName, null);
  store.endOnboardingSession();
});
