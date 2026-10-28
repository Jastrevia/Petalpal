import { readEvent } from '../../../services/events';
import { loadGarden, plantFlowerSpot } from '../../../services/garden';
import { gardenPlantingRecord, loadGardenPlacements } from './gardenHydration';
import { useFocusEffect } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  FlowerPlacementRecord,
  capturePlacementSession,
  addOrUpdateFlowerPlacement,
  removeFlowerPlacement,
  loadFlowerPlacements,
  resetFlowerPlacements,
} from './plantingPersistence';
import {
  ValidationResult,
  validateFlowerPlacement,
} from './placementValidator';
import { getApprovedMonthCentroid } from './approvedPlantingMasks';
import { MONTH_REGION_METAS } from './plantingRegionData';
import { findJournalEntry } from '../../../data/journalEntries';
import { mergeFlowerSource, ownsFlower, type FlowerSourceDetail } from './flowerDetailData';
import {
  deleteSourceFlower,
  giveFlowerSupport,
  leaveFlowerMessage,
  loadFlowerSession,
  loadFlowerSource,
  subscribeToFlowerUpdates,
  type FlowerSession,
} from './flowerDetailApi';

/** There is no adjust mode: once planted, a flower's spot never changes. */
export type PlantingMode = 'normal' | 'planting';

interface PlantingContextValue {
  placements: FlowerPlacementRecord[];
  /** Signed-in owner's account timezone (time.md), for day-bound visuals. */
  accountTimeZone?: string;
  isGardenLoading: boolean;
  gardenError: string;
  refreshGarden: () => Promise<void>;
  activeMode: PlantingMode;
  targetFlower: FlowerPlacementRecord | null;
  previewCoords: { worldX: number; worldY: number } | null;
  validationResult: ValidationResult | null;
  selectedFlower: FlowerPlacementRecord | null;
  isSaving: boolean;
  currentUserId?: string;
  gardenOwnerUserId?: string;
  selectedFlowerIsOwner: boolean;
  flowerDetailSource: FlowerSourceDetail | null;
  isDetailLoading: boolean;
  isDetailWorking: boolean;
  detailError: string;
  // DEV Toggles
  showDevPlantingRegions: boolean;
  showDevFootprints: boolean;
  showDevHitboxes: boolean;
  showPlacementDebug: boolean;

  // Actions
  startPlanting: (
    flower: Partial<FlowerPlacementRecord> & { flowerId: string; month: number; flowerName: string }
  ) => void;
  updatePreview: (worldX: number, worldY: number) => void;
  confirmPlacement: () => Promise<boolean>;
  cancelPlacement: () => void;
  openFlowerDetail: (flower: FlowerPlacementRecord) => void;
  closeFlowerDetail: () => void;
  supportFlower: (flowerId: string) => Promise<void>;
  leaveMessage: (text: string) => Promise<boolean>;
  deleteSelectedFlower: () => Promise<boolean>;
  resetAllPlacements: () => Promise<void>;

  setShowDevPlantingRegions: (fn: (v: boolean) => boolean) => void;
  setShowDevFootprints: (fn: (v: boolean) => boolean) => void;
  setShowDevHitboxes: (fn: (v: boolean) => boolean) => void;
  setShowPlacementDebug: (fn: (v: boolean) => boolean) => void;
}

export const PlantingContext = createContext<PlantingContextValue | null>(null);

export interface PlantingProviderProps {
  children: React.ReactNode;
  value?: PlantingContextValue;
  gardenOwnerUserId?: string;
  session?: FlowerSession;
  backendMode?: boolean;
}

export function PlantingProvider({ children, value, gardenOwnerUserId, session, backendMode }: PlantingProviderProps) {
  // If an existing context value is provided (e.g. bridging across React Native Skia Canvas boundary),
  // re-inject the exact same context value so that descendant nodes share the exact same state.
  if (value) {
    return (
      <PlantingContext.Provider value={value}>
        {children}
      </PlantingContext.Provider>
    );
  }

  return <PlantingProviderRoot gardenOwnerUserId={gardenOwnerUserId} session={session} backendMode={backendMode}>{children}</PlantingProviderRoot>;
}

function PlantingProviderRoot({ children, gardenOwnerUserId, session: suppliedSession, backendMode = false }: Omit<PlantingProviderProps, 'value'>) {
  const [placements, setPlacements] = useState<FlowerPlacementRecord[]>([]);
  const [isGardenLoading, setIsGardenLoading] = useState(true);
  const [gardenError, setGardenError] = useState('');
  const gardenVersion = useRef(0);
  const gardenRequest = useRef(0);
  const [activeMode, setActiveMode] = useState<PlantingMode>('normal');
  const [targetFlower, setTargetFlower] = useState<FlowerPlacementRecord | null>(null);
  const [previewCoords, setPreviewCoords] = useState<{ worldX: number; worldY: number } | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [selectedFlower, setSelectedFlower] = useState<FlowerPlacementRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [session, setSession] = useState<FlowerSession | null>(suppliedSession || null);
  const [flowerDetailSource, setFlowerDetailSource] = useState<FlowerSourceDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isDetailWorking, setIsDetailWorking] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailVersion = useRef(0);
  const detailWorking = useRef(false);

  const access = {
    currentUserId: session?.user.id,
    gardenOwnerUserId,
    localOwner: !gardenOwnerUserId || gardenOwnerUserId === session?.user.id,
  };
  const selectedFlowerIsOwner = selectedFlower
    ? (!gardenOwnerUserId || gardenOwnerUserId === session?.user.id) &&
      (flowerDetailSource?.supportState?.isOwner ?? ownsFlower(selectedFlower, access))
    : false;

  // DEV Toggles
  const [showDevPlantingRegions, setShowDevPlantingRegions] = useState(false);
  const [showDevFootprints, setShowDevFootprints] = useState(false);
  const [showDevHitboxes, setShowDevHitboxes] = useState(false);
  const [showPlacementDebug, setShowPlacementDebug] = useState(false);

  const refreshGarden = useCallback(async () => {
    const version = ++gardenRequest.current;
    const lifecycle = gardenVersion.current;
    const current = () => version === gardenRequest.current && lifecycle === gardenVersion.current;
    setIsGardenLoading(true); setGardenError('');
    try {
      if (backendMode && !suppliedSession) throw new Error("Sign in to load your Garden.");
      const loaded = backendMode && suppliedSession
        ? await loadGardenPlacements(gardenOwnerUserId || suppliedSession.user.id,
          suppliedSession.user.id, suppliedSession.user.timezone)
        : await loadFlowerPlacements();
      if (current()) setPlacements(loaded);
    } catch {
      if (current()) setGardenError('Your Garden could not load. Please try again.');
    } finally {
      if (current()) setIsGardenLoading(false);
    }
  }, [backendMode, suppliedSession, gardenOwnerUserId]);
  useFocusEffect(useCallback(() => {
    void refreshGarden();
    return () => { gardenVersion.current++; };
  }, [refreshGarden]));

  useEffect(() => {
    if (suppliedSession) { setSession(suppliedSession); return; }
    let mounted = true;
    loadFlowerSession().then((loaded) => {
      if (mounted) setSession(loaded);
    }).catch((error) => {
      if (mounted) setDetailError(error.message || 'Unable to verify your PetalPal session.');
    });
    return () => { mounted = false; };
  }, [suppliedSession]);

  useEffect(() => {
    detailVersion.current++;
    detailWorking.current = false;
    setSelectedFlower(null); setFlowerDetailSource(null);
    setIsDetailLoading(false); setIsDetailWorking(false); setDetailError('');
  }, [suppliedSession?.user.id, session?.user.id, gardenOwnerUserId]);

  useEffect(() => {
    if (!selectedFlower || (suppliedSession && suppliedSession.user.id !== session?.user.id)) return;
    const ownerId = selectedFlower.ownerUserId || gardenOwnerUserId || session?.user.id;
    if (!session || !ownerId) return;
    let mounted = true;
    const version = detailVersion.current;
    const refreshBase = flowerDetailSource;
    setIsDetailLoading(true);
    loadFlowerSource(ownerId, selectedFlower.flowerId).then((source) => {
      if (mounted && version === detailVersion.current) {
        setFlowerDetailSource((current) => mergeFlowerSource(current, source, 'refresh', refreshBase));
        setDetailError('');
      }
    }).catch((error) => {
      if (mounted && version === detailVersion.current) setDetailError(error.message || 'Unable to load flower details.');
    }).finally(() => { if (mounted && version === detailVersion.current) setIsDetailLoading(false); });
    return () => { mounted = false; };
  }, [selectedFlower?.flowerId, selectedFlower?.ownerUserId, gardenOwnerUserId, session, suppliedSession?.user.id]);

  useEffect(() => {
    const ownerId = selectedFlower?.ownerUserId || gardenOwnerUserId || session?.user.id;
    if (!session || !selectedFlower || !ownerId) return;
    const version = detailVersion.current;
    return subscribeToFlowerUpdates(ownerId, selectedFlower.flowerId, (source) => {
      if (version !== detailVersion.current) return;
      // Personal daily state only comes from the viewer's own responses.
      setFlowerDetailSource((current) => mergeFlowerSource(current, source, 'broadcast'));
      setPlacements((current) => current.map((flower) => flower.flowerId === source.id
        ? { ...flower, supportCount: Math.max(flower.supportCount || 0, source.supportCount) } : flower));
    });
  }, [selectedFlower?.flowerId, selectedFlower?.ownerUserId, gardenOwnerUserId, session]);

  const validateAt = useCallback(
    (
      worldX: number,
      worldY: number,
      month: number,
      flowerName?: string,
      speciesCode?: string
    ) => {
      return validateFlowerPlacement({
        flowerId: targetFlower?.flowerId || 'preview-flower',
        month,
        worldX,
        worldY,
        existingPlacements: placements,
        flowerName,
        speciesCode,
      });
    },
    [placements, targetFlower]
  );

  const startPlanting = useCallback(
    async (flower: Partial<FlowerPlacementRecord> & { flowerId: string; month: number; flowerName: string }) => {
      if (gardenOwnerUserId && gardenOwnerUserId !== session?.user.id) return;
      if (backendMode) {
        if (!session) return;
        try {
          const version = gardenVersion.current;
          const source = (await loadGarden(session.user.id, session.user.id)).find(item => item.id === flower.flowerId);
          if (!source) throw new Error('Choose one of your saved flowers.');
          const record = gardenPlantingRecord(source, session.user.timezone);
          if (source.sourceEventId) {
            const event = await readEvent(source.sourceEventId);
            record.month = Number(event.localDate.slice(5, 7));
            record.secondaryEmotions = event.secondaryEmotions;
          }
          if (version !== gardenVersion.current) return;
          flower = { ...flower, ...record };
        } catch (error) { setDetailError((error as Error).message); return; }
      }
      const journal = backendMode ? undefined : findJournalEntry(flower.flowerId, flower.journalEntryId);
      // Pick initial preview at calibrated month centroid or fallback
      const centroid = getApprovedMonthCentroid(flower.month);
      const fullRecord: FlowerPlacementRecord = {
        id: flower.id || `flower-${flower.flowerId}`,
        flowerId: flower.flowerId,
        journalEntryId: backendMode ? '' : flower.journalEntryId || journal?.id || `entry-${flower.flowerId}`,
        plantedDate: flower.plantedDate || new Date().toISOString(),
        month: flower.month,
        landId: MONTH_REGION_METAS[flower.month].landId,
        worldX: centroid.x,
        worldY: centroid.y,
        scale: flower.scale ?? 1,
        rotation: flower.rotation ?? 0,
        placementVersion: 1,
        flowerName: flower.flowerName,
        speciesCode: flower.speciesCode,
        mood: flower.mood || 'Happy',
        supportCount: flower.supportCount ?? 0,
        sourceEventId: flower.sourceEventId,
        sourceType: flower.sourceType, dailyCheckInId: flower.dailyCheckInId,
        variant: flower.variant, rarity: flower.rarity, growthState: flower.growthState, season: flower.season,
        colorAccent: flower.colorAccent, visualEffect: flower.visualEffect,
        secondaryEmotions: flower.secondaryEmotions,
        notes: backendMode ? undefined : flower.notes || '',
        ownerUserId: flower.ownerUserId || session?.user.id,
        meaning: flower.meaning,
        image: flower.image,
        messages: flower.messages,
      };

      setTargetFlower(fullRecord);
      setPreviewCoords({ worldX: centroid.x, worldY: centroid.y });
      setActiveMode('planting');
      setSelectedFlower(null);
      detailVersion.current++; detailWorking.current = false; setIsDetailWorking(false);

      // Validate at initial centroid
      const res = validateFlowerPlacement({
        flowerId: fullRecord.flowerId,
        month: fullRecord.month,
        worldX: centroid.x,
        worldY: centroid.y,
        existingPlacements: placements,
        flowerName: fullRecord.flowerName,
        speciesCode: fullRecord.speciesCode,
      });
      setValidationResult(res);
    },
    [placements, gardenOwnerUserId, session, backendMode]
  );

  const updatePreview = useCallback(
    (worldX: number, worldY: number) => {
      if (!targetFlower || activeMode === 'normal') return;
      setPreviewCoords({ worldX, worldY });

      const res = validateFlowerPlacement({
        flowerId: targetFlower.flowerId,
        month: targetFlower.month,
        worldX,
        worldY,
        existingPlacements: placements,
        flowerName: targetFlower.flowerName,
        speciesCode: targetFlower.speciesCode,
      });
      setValidationResult(res);
    },
    [activeMode, targetFlower, placements]
  );

  const confirmPlacement = useCallback(async (): Promise<boolean> => {
    if (!targetFlower || !previewCoords || !validationResult?.isValid || isSaving) {
      return false;
    }
    if (!ownsFlower(targetFlower, access)) return false;

    const cacheSession = capturePlacementSession();
    const version = gardenVersion.current;
    setIsSaving(true);
    try {
      // Revalidate against the approved mask and every planted footprint before writing.
      // A flower that already has a spot is never planted again.
      if (placements.some(p => p.flowerId === targetFlower.flowerId && p.placementOrigin !== 'FALLBACK')) return false;
      const confirmed = validateAt(previewCoords.worldX, previewCoords.worldY, targetFlower.month,
        targetFlower.flowerName, targetFlower.speciesCode);
      if (!confirmed.isValid) {
        setValidationResult(confirmed);
        return false;
      }
      const committed: FlowerPlacementRecord = {
        ...targetFlower,
        worldX: previewCoords.worldX,
        worldY: previewCoords.worldY,
        landId: MONTH_REGION_METAS[targetFlower.month].landId,
        placementVersion: 1,
        placementOrigin: backendMode ? 'SERVER' : 'LOCAL',
      };

      // The server keeps the spot for good and refuses any later move.
      if (backendMode && session) await plantFlowerSpot(session.user.id, committed.flowerId,
        { worldX: committed.worldX, worldY: committed.worldY, landId: committed.landId! });
      if (version !== gardenVersion.current) return false;
      const updated = await addOrUpdateFlowerPlacement(committed, cacheSession);
      if (version !== gardenVersion.current) return false;
      if (backendMode) setPlacements(current => current.some(p => p.flowerId === committed.flowerId)
        ? current.map(p => p.flowerId === committed.flowerId ? committed : p) : [...current, committed]);
      else setPlacements(updated);
      setActiveMode('normal');
      setTargetFlower(null);
      setPreviewCoords(null);
      setValidationResult(null);
      return true;
    } catch (err) {
      console.error('[PlantingContext] Unable to save placement.');
      setValidationResult({ isValid: false, userFeedback: err instanceof Error && err.message ? err.message : 'Unable to plant here. Try again.' });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [targetFlower, previewCoords, validationResult, isSaving, placements, validateAt, session, gardenOwnerUserId, backendMode]);

  const cancelPlacement = useCallback(() => {
    setActiveMode('normal');
    setTargetFlower(null);
    setPreviewCoords(null);
    setValidationResult(null);
  }, []);

  const openFlowerDetail = useCallback((flower: FlowerPlacementRecord) => {
    detailVersion.current++; detailWorking.current = false; setIsDetailWorking(false);
    setSelectedFlower((current) => current?.flowerId === flower.flowerId ? null : flower);
    setFlowerDetailSource(null);
    setDetailError('');
    setIsDetailLoading(selectedFlower?.flowerId !== flower.flowerId &&
      Boolean(session && (flower.ownerUserId || gardenOwnerUserId || session.user.id)));
  }, [session, gardenOwnerUserId, selectedFlower?.flowerId]);

  const closeFlowerDetail = useCallback(() => {
    detailVersion.current++; detailWorking.current = false; setIsDetailWorking(false);
    setSelectedFlower(null);
    setFlowerDetailSource(null);
    setDetailError('');
    setIsDetailLoading(false);
  }, []);

  const supportFlower = useCallback(async (flowerId: string) => {
    if (!selectedFlower || selectedFlower.flowerId !== flowerId || detailWorking.current) return;
    const ownerId = flowerDetailSource?.userId || selectedFlower.ownerUserId || gardenOwnerUserId || session?.user.id;
    if (!session || !ownerId) {
      setDetailError('Sign in to PetalPal to give Support.');
      return;
    }
    if (session.user.id === ownerId) {
      setDetailError('You cannot Support your own flower.');
      return;
    }
    const version = detailVersion.current;
    detailWorking.current = true; setIsDetailWorking(true); setDetailError('');
    try {
      const source = await giveFlowerSupport(ownerId, flowerId);
      if (version !== detailVersion.current) return;
      setFlowerDetailSource((current) => mergeFlowerSource(current, source));
      setPlacements((current) => current.map((flower) => flower.flowerId === flowerId
        ? { ...flower, supportCount: Math.max(flower.supportCount || 0, source.supportCount) } : flower));
    } catch (error) {
      if (version === detailVersion.current) setDetailError(error instanceof Error ? error.message : 'Failed to give support.');
    } finally {
      if (version === detailVersion.current) { detailWorking.current = false; setIsDetailWorking(false); }
    }
  }, [selectedFlower, session, gardenOwnerUserId, flowerDetailSource, isDetailWorking]);

  const leaveMessage = useCallback(async (text: string): Promise<boolean> => {
    const clean = text.trim();
    if (!selectedFlower || !clean || detailWorking.current || selectedFlowerIsOwner) return false;
    const ownerId = flowerDetailSource?.userId || selectedFlower.ownerUserId || gardenOwnerUserId;
    if (!session || !ownerId) { setDetailError('Sign in to PetalPal to leave a message.'); return false; }
    const original = flowerDetailSource;
    const version = detailVersion.current;
    const pendingId = `pending-${Date.now()}`;
    if (original) setFlowerDetailSource({ ...original, messages: [...(original.messages || []),
      { id: pendingId, author: session.user.name || 'Friend', text: clean, pending: true }] });
    detailWorking.current = true; setIsDetailWorking(true); setDetailError('');
    try {
      const source = await leaveFlowerMessage(ownerId, selectedFlower.flowerId, clean);
      if (version !== detailVersion.current) return true;
      // The existing message endpoint returns Flower + messages, without viewer
      // support state. Preserve the separately loaded state for this supporter.
      setFlowerDetailSource((current) => mergeFlowerSource(current || original, source));
      return true;
    } catch (error) {
      if (version !== detailVersion.current) return true;
      setFlowerDetailSource((current) => current ? { ...current,
        messages: (current.messages || []).filter((message) => message.id !== pendingId) } : original);
      setDetailError(error instanceof Error ? error.message : 'Failed to leave message.');
      return false;
    } finally {
      if (version === detailVersion.current) { detailWorking.current = false; setIsDetailWorking(false); }
    }
  }, [selectedFlower, selectedFlowerIsOwner, flowerDetailSource, session, gardenOwnerUserId, isDetailWorking]);

  const deleteSelectedFlower = useCallback(async (): Promise<boolean> => {
    if (!selectedFlower || !selectedFlowerIsOwner || detailWorking.current) return false;
    const cacheSession = capturePlacementSession();
    const version = detailVersion.current;
    detailWorking.current = true; setIsDetailWorking(true); setDetailError('');
    try {
      const ownerId = flowerDetailSource?.userId || selectedFlower.ownerUserId || gardenOwnerUserId;
      if (ownerId) {
        // A failed detail refresh must never turn remote deletion into a local
        // success. Only the existing unlinked device records delete locally.
        if (!session || session.user.id !== ownerId) throw new Error('Only this flower’s owner can delete it.');
        await deleteSourceFlower(ownerId, selectedFlower.flowerId);
      }
      const updated = await removeFlowerPlacement(selectedFlower.flowerId, cacheSession);
      if (version !== detailVersion.current) return true;
      if (backendMode) setPlacements(current => current.filter(p => p.flowerId !== selectedFlower.flowerId));
      else setPlacements(updated);
      if (version === detailVersion.current) closeFlowerDetail();
      return true;
    } catch (error) {
      if (version === detailVersion.current) setDetailError(error instanceof Error ? error.message : 'Failed to delete flower.');
      return false;
    } finally {
      if (version === detailVersion.current) { detailWorking.current = false; setIsDetailWorking(false); }
    }
  }, [selectedFlower, selectedFlowerIsOwner, flowerDetailSource, session, isDetailWorking, closeFlowerDetail]);

  const resetAllPlacements = useCallback(async () => {
    if (backendMode) return;
    const version = gardenVersion.current;
    const defaults = await resetFlowerPlacements(capturePlacementSession());
    if (version !== gardenVersion.current) return;
    setPlacements(defaults);
    cancelPlacement();
  }, [cancelPlacement, backendMode]);

  return (
    <PlantingContext.Provider
      value={{
        placements,
        isGardenLoading, gardenError, refreshGarden,
        activeMode,
        targetFlower,
        previewCoords,
        validationResult,
        selectedFlower,
        isSaving,
        currentUserId: session?.user.id,
        accountTimeZone: session?.user.timezone,
        gardenOwnerUserId,
        selectedFlowerIsOwner,
        flowerDetailSource,
        isDetailLoading,
        isDetailWorking,
        detailError,
        showDevPlantingRegions,
        showDevFootprints,
        showDevHitboxes,
        showPlacementDebug,
        startPlanting,
        updatePreview,
        confirmPlacement,
        cancelPlacement,
        openFlowerDetail,
        closeFlowerDetail,
        supportFlower,
        leaveMessage,
        deleteSelectedFlower,
        resetAllPlacements,
        setShowDevPlantingRegions,
        setShowDevFootprints,
        setShowDevHitboxes,
        setShowPlacementDebug,
      }}
    >
      {children}
    </PlantingContext.Provider>
  );
}

export function usePlanting() {
  const ctx = useContext(PlantingContext);
  if (!ctx) {
    throw new Error('usePlanting must be used within a PlantingProvider');
  }
  return ctx;
}
