import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlowerPlacement } from './placementValidator';
import type { FlowerMessage } from './flowerDetailData';
import { nativeSecurityEnabled } from '../../../services/nativeSecurity';
import { createReloadObservation } from '../../../services/nativeSecurityHarness/reloadObservation';

export interface FlowerPlacementRecord extends FlowerPlacement {
  supportCount: number;
  sourceType?: import('../../../services/garden').FlowerSource;
  dailyCheckInId?: string;
  /** SERVER: planted, spot saved on the server. LOCAL: planted earlier, spot only on this device.
   * FALLBACK: not planted yet, shown at a preview spot. */
  placementOrigin?: 'SERVER' | 'LOCAL' | 'FALLBACK';
  variant?: string;
  rarity?: string;
  growthState?: string;
  season?: string;
  sourceEventId?: string;
  secondaryEmotions?: string[];
  colorAccent?: string;
  visualEffect?: string;
  notes?: string;
  ownerUserId?: string;
  meaning?: string;
  image?: string;
  messages?: FlowerMessage[];
}

/** An Event flower that has no spot yet: it joins the Garden only when its owner plants it with ✓. */
export function awaitsPlanting(flower: Pick<FlowerPlacementRecord, 'placementOrigin' | 'sourceType'>) {
  return flower.placementOrigin === 'FALLBACK' && flower.sourceType === 'EVENT';
}

// PetalPal private-store registry: placements include derived emotions/details.
// Theme/background, calibration/masks and Firebase SDK persistence are excluded.
const LEGACY_KEY = nativeSecurityEnabled ? 'petalpal_native_security_test_placements_v1' : 'petalpal_flower_placements_v1';
const ownerKey = (owner: string) => `${LEGACY_KEY}:${encodeURIComponent(owner)}`;
let activeOwner: string | null = null;
let generation = 0;
let storageReady = false;
let storageQueue: Promise<unknown> = Promise.resolve();
const pendingErasure = new Set<string>();
type StorageOperation = 'read' | 'write' | 'remove' | 'keys';
let injectedFailure: StorageOperation | null = null;
let holdNextWrite = false;
let releaseWrite: (() => void) | null = null;
let expectedOwner: string | null = null;
let cleanupResult: boolean | null = null;
let bootNamespaceKeyCount: number | null = null;
const observation=nativeSecurityEnabled?createReloadObservation(AsyncStorage):null;
const observationRuntime=nativeSecurityEnabled?`${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`:'';
let sequence = 0;
const milestones: { sequence: number; operation: StorageOperation; stage: string; generation: number }[] = [];
function milestone(operation: StorageOperation, stage: string) {
  if (!nativeSecurityEnabled) return;
  milestones.push({ sequence: ++sequence, operation, stage, generation });
  if (milestones.length > 32) milestones.shift();
}
async function nativeOperation<T>(operation: StorageOperation, action: () => Promise<T>): Promise<T> {
  milestone(operation, 'started');
  if (nativeSecurityEnabled && injectedFailure === operation) {
    injectedFailure = null; milestone(operation, 'injected-failure'); throw cacheError();
  }
  try {
    const pending = action();
    if (nativeSecurityEnabled && operation === 'write' && holdNextWrite) {
      holdNextWrite = false;
      // Dispatch the real native write first; hold its completion in the queue.
      // Attach both handlers immediately so a held rejection stays handled.
      pending.then(() => milestone(operation, 'adapter-completed'), () => milestone(operation, 'adapter-failed'));
      await new Promise<void>(resolve => {
        releaseWrite = () => { releaseWrite = null; milestone(operation, 'released'); resolve(); };
        milestone(operation, 'held');
      });
      releaseWrite = null;
    }
    const result = await pending; milestone(operation, 'completed'); return result;
  }
  catch { milestone(operation, 'failed'); throw cacheError(); }
}
export function setNativeSecurityExpectedOwner(owner: string | null) {
  if (nativeSecurityEnabled) expectedOwner = owner;
}

// In-memory hooks wrap only the application's isolated placement operations.
// Firebase's adapter and normal placement namespace are never modified.
if (__DEV__ && nativeSecurityEnabled) {
  const preferenceKey = 'petalpal_native_security_test_global_preference_v1';
  const requireNative = () => {
    if (typeof window !== 'undefined' && window.localStorage) throw new Error('Use the isolated native runtime');
  };
  const diagnostics = {
    async inspect() {
      requireNative();
      try {
        const keys = await AsyncStorage.getAllKeys();
        const scoped = keys.filter(key => key === LEGACY_KEY || key.startsWith(`${LEGACY_KEY}:`));
        const stored = activeOwner ? await AsyncStorage.getItem(ownerKey(activeOwner)) : null;
        const records = stored ? JSON.parse(stored) : [];
        return { available: true, namespaceKeyCount: scoped.length,
          ownerCachePresent: !!activeOwner && scoped.includes(ownerKey(activeOwner)),
          scopedRecordCount: Array.isArray(records) ? records.length : 0,
          memoryCachePresent: memoryPlacementsStore !== null,
          memoryRecordCount: memoryPlacementsStore?.length ?? 0,
          bootNamespaceKeyCount,
          activeOwnerMatchesExpected: activeOwner === expectedOwner,
          ownerActive: activeOwner !== null, generation, storageReady,
          pendingErasureCount: pendingErasure.size, cleanupResult,
          globalPreferencePreserved: (await AsyncStorage.getItem(preferenceKey)) === 'safe-test-preference',
          failureArmed: injectedFailure, writeHeld: releaseWrite !== null,
          milestones: milestones.map(item => ({ ...item })) };
      } catch { return { available: false }; }
    },
    failNext(operation: StorageOperation) {
      requireNative();
      if (!['read', 'write', 'remove', 'keys'].includes(operation)) throw new Error('Unknown placement operation');
      injectedFailure = operation;
    },
    holdNextWrite() { requireNative(); holdNextWrite = true; },
    releaseWrite() { releaseWrite?.(); },
    resetHooks() { injectedFailure = null; holdNextWrite = false; releaseWrite?.(); milestones.length = 0; },
    async prepareGlobalPreference() { requireNative(); await AsyncStorage.setItem(preferenceKey, 'safe-test-preference'); },
    async removeGlobalPreference() { requireNative(); await AsyncStorage.removeItem(preferenceKey); },
    async armReloadObservation(){requireNative();await observation!.arm(observationRuntime)},
    async reloadObservationPassed(){requireNative();return observation!.passed(observationRuntime)},
  };
  (globalThis as typeof globalThis & { __PETALPAL_NATIVE_SECURITY__?: typeof diagnostics }).__PETALPAL_NATIVE_SECURITY__ = diagnostics;
}
export interface PlacementSession { owner: string | null; generation: number }
export const capturePlacementSession = (): PlacementSession => ({ owner: activeOwner, generation });
const current = (session: PlacementSession) => session.owner !== null &&
  session.owner === activeOwner && session.generation === generation;
const cacheError = () => new Error('Private device cache is unavailable. Please sign in again.');
function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(action);
  storageQueue = result.catch(() => {});
  return result;
}
async function eraseKey(key: string) {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key);
  else await nativeOperation('remove', () => AsyncStorage.removeItem(key));
}
// Invalidate synchronously; physical erasure follows any already-started write.
// Each activation starts fresh, including after process restart/failed cleanup.
export function scopeFlowerPlacements(owner: string | null): Promise<boolean> {
  const outgoing = activeOwner;
  activeOwner = owner; generation++; storageReady = false; memoryPlacementsStore = null;
  if (nativeSecurityEnabled) cleanupResult = null;
  const session = capturePlacementSession();
  pendingErasure.add(LEGACY_KEY);
  if (outgoing) pendingErasure.add(ownerKey(outgoing));
  if (owner) pendingErasure.add(ownerKey(owner));
  return enqueue(async () => {
    try {
      // Recover orphaned owner caches from earlier processes/accounts, using
      // only the PetalPal placement namespace. Never clear the storage adapter.
      const browser = typeof window !== 'undefined' ? window.localStorage : null;
      const persistedKeys = browser
        ? Array.from({ length: browser.length }, (_, index) => browser.key(index))
        : await nativeOperation('keys', () => AsyncStorage.getAllKeys());
      if (nativeSecurityEnabled && bootNamespaceKeyCount === null) {
        bootNamespaceKeyCount = persistedKeys.filter(key => key === LEGACY_KEY || key?.startsWith(`${LEGACY_KEY}:`)).length;
      }
      if(observation&&!browser)await observation.observe(observationRuntime,bootNamespaceKeyCount!);
      for (const key of persistedKeys) {
        if (key === LEGACY_KEY || key?.startsWith(`${LEGACY_KEY}:`)) pendingErasure.add(key);
      }
      for (const key of pendingErasure) {
        await eraseKey(key);
        pendingErasure.delete(key);
      }
      if (session.generation === generation) {
        storageReady = true;
        if (nativeSecurityEnabled) cleanupResult = true;
      }
      return true;
    } catch {
      if (nativeSecurityEnabled && session.generation === generation) cleanupResult = false;
      // Never log storage errors: adapters can embed private payloads in errors.
      return false; // Reads/writes remain closed until a successful activation.
    }
  });
}

// Initial seed flowers for demonstration and verification
export const DEFAULT_SEED_PLACEMENTS: FlowerPlacementRecord[] = [
  {
    id: 'flower-seed-1',
    flowerId: 'fl-jan-01',
    journalEntryId: 'entry-jan-01',
    plantedDate: '2026-01-15T10:00:00.000Z',
    month: 1,
    worldX: 1200.0,
    worldY: 562.0,
    scale: 1,
    rotation: 0,
    placementVersion: 1,
    flowerName: 'pink',
    speciesCode: 'PINK_LILY',
    mood: 'Peaceful',
    supportCount: 5,
    notes: 'A quiet morning reflection in the January meadow.',
  },
  {
    id: 'flower-seed-2',
    flowerId: 'fl-may-01',
    journalEntryId: 'entry-may-01',
    plantedDate: '2026-05-12T14:30:00.000Z',
    month: 5,
    worldX: 1524.0,
    worldY: 352.0,
    scale: 1,
    rotation: 0,
    placementVersion: 1,
    flowerName: 'purple',
    speciesCode: 'PURPLE_BELL',
    mood: 'Grateful',
    supportCount: 12,
    notes: 'Planted after a productive coding session.',
  },
  {
    id: 'flower-seed-3',
    flowerId: 'fl-jun-01',
    journalEntryId: 'entry-jun-01',
    plantedDate: '2026-06-20T09:15:00.000Z',
    month: 6,
    worldX: 1838.0,
    worldY: 320.0,
    scale: 1,
    rotation: 0,
    placementVersion: 1,
    flowerName: 'sunflower',
    speciesCode: 'SUNFLOWER',
    mood: 'Energized',
    supportCount: 8,
    notes: 'Summer sun warming the northeastern bluffs.',
  },
  {
    id: 'flower-seed-4',
    flowerId: 'fl-sep-01',
    journalEntryId: 'entry-sep-01',
    plantedDate: '2026-09-08T16:45:00.000Z',
    month: 9,
    worldX: 1166.0,
    worldY: 1332.0,
    scale: 1,
    rotation: 0,
    placementVersion: 1,
    flowerName: 'tulip',
    speciesCode: 'ORANGE_TULIP',
    mood: 'Hopeful',
    supportCount: 3,
    notes: 'Welcoming autumn near the southern gate.',
  },
];

// Cache only; browser and native storage remain the durable source of truth.
let memoryPlacementsStore: FlowerPlacementRecord[] | null = null;

export async function loadFlowerPlacements(
  session = capturePlacementSession()
): Promise<FlowerPlacementRecord[]> {
  return enqueue(async () => {
    if (!current(session)) return [];
    if (!storageReady) throw cacheError();
    try {
      const key = ownerKey(session.owner!);
      const stored = typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem(key) : await nativeOperation('read', () => AsyncStorage.getItem(key));
      if (!current(session)) return [];
      const parsed = stored ? JSON.parse(stored) : [];
      memoryPlacementsStore = Array.isArray(parsed) ? parsed : [];
      return memoryPlacementsStore;
    } catch { storageReady = false; memoryPlacementsStore = null; throw cacheError(); }
  });
}

export async function saveFlowerPlacements(
  placements: FlowerPlacementRecord[], session = capturePlacementSession()
): Promise<void> {
  return enqueue(async () => {
    if (!current(session)) return;
    if (!storageReady) throw cacheError();
    try {
      const key = ownerKey(session.owner!);
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(placements));
      } else await nativeOperation('write', () => AsyncStorage.setItem(key, JSON.stringify(placements)));
      if (current(session)) memoryPlacementsStore = placements;
      // A transition during setItem queued erasure behind this write.
    } catch { storageReady = false; memoryPlacementsStore = null; throw cacheError(); }
  });
}

export async function addOrUpdateFlowerPlacement(
  placement: FlowerPlacementRecord, session = capturePlacementSession()
): Promise<FlowerPlacementRecord[]> {
  const loaded = await loadFlowerPlacements(session);
  if (!current(session)) return [];
  const existingIdx = loaded.findIndex(
    (p) => p.flowerId === placement.flowerId || p.id === placement.id
  );

  let updated: FlowerPlacementRecord[];
  const existing = loaded[existingIdx];
  // A planted flower never moves: its details may refresh, its spot may not.
  if (existing && (existing.worldX !== placement.worldX || existing.worldY !== placement.worldY)) {
    throw new Error('This flower is already planted. Its spot can’t change.');
  }
  if (existingIdx >= 0) {
    updated = [...loaded];
    updated[existingIdx] = {
      ...loaded[existingIdx],
      ...placement,
      placementVersion: 1,
    };
  } else {
    updated = [...loaded, { ...placement, placementVersion: 1 }];
  }

  await saveFlowerPlacements(updated, session);
  return current(session) ? updated : [];
}

export async function removeFlowerPlacement(
  flowerId: string, session = capturePlacementSession()
): Promise<FlowerPlacementRecord[]> {
  const loaded = await loadFlowerPlacements(session);
  if (!current(session)) return [];
  const updated = loaded.filter((p) => p.flowerId !== flowerId && p.id !== flowerId);
  await saveFlowerPlacements(updated, session);
  return current(session) ? updated : [];
}

export async function resetFlowerPlacements(session = capturePlacementSession()): Promise<FlowerPlacementRecord[]> {
  const defaults = [...DEFAULT_SEED_PLACEMENTS];
  await saveFlowerPlacements(defaults, session);
  return current(session) ? defaults : [];
}
