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
  assert.equal(go('treehouse.archive', { type: 'next' }), 'treehouse.back');
});

test('mandatory steps cannot be skipped with Next or by touching the target', () => {
  for (const step of ['intro.name', 'event.nav', 'event.mood', 'event.save', 'event.flower', 'plant.place',
    'treehouse.enter', 'treehouse.back', 'friends.nav', 'friends.return', 'finale']) {
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
