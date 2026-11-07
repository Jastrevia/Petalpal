import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from './api';

// The Garden pets' outfits (GET /api/fairy/pets, docs/product/FAIRY_CLOSENESS_API.md §6). The
// route answers 404 while the closeness switch leaves the owner out; that reads as "nothing on".
export type PetId = 'puppy' | 'hedgehog' | 'butterfly' | 'rabbit' | 'bluebird' | 'maltese';
export interface PetOutfit { hat: string | null; collar: string | null; pendant: string | null }
export interface PetsSummary {
  locale: 'en' | 'zh-Hans'; level: number;
  accessories: { id: string; row: 'hat' | 'collar' | 'pendant'; collection: string; name: string; unlocked: boolean; unlockedAtLevel: number | null }[];
  // A server from before the Maltese (2026-11-05) has no `maltese` outfit.
  outfits: Partial<Record<PetId, PetOutfit>>;
  // Each dressing pet's own pieces: accessory id → the level that opened it for that pet, or null
  // (a server from before per-pet unlocks has none: `accessories[].unlocked` then counts for both).
  petPieces?: Partial<Record<PetId, Record<string, number | null>>>;
  // The owner's names for the golden puppy and Xiaobai (null: their own) and when each may be renamed again.
  petNames?: Partial<Record<PetId, { name: string | null; nextRenameAt: string | null }>>;
  foods: { id: string; name: string; count: number }[];
}

export async function loadPets() {
  try { return await apiRequest<PetsSummary>('/api/fairy/pets'); }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
}

// Renames the golden puppy or Xiaobai (once per pet every 7 days: 429 RENAME_TOO_SOON says when).
export async function renamePet(petId: PetId, name: string) {
  const result = await apiRequest<{ petId: PetId; name: string; nextRenameAt: string }>(`/api/fairy/pets/${petId}/name`, 'PUT', { name });
  petsChanged();
  return result;
}

// Feeds `petId` one of `foodId` (409 NO_FOOD when none are left): the count left comes back.
export const feedPet = (petId: PetId, foodId: string) =>
  apiRequest<{ foodId: string; count: number }>(`/api/fairy/pets/${petId}/feed`, 'POST', { foodId });
// Puts on a whole outfit, all three slots (null takes one off); the outfit saved comes back.
export const dressPet = (petId: PetId, outfit: PetOutfit) =>
  apiRequest<{ outfit: PetOutfit }>(`/api/fairy/pets/${petId}/outfit`, 'PUT', outfit);

// Whoever changes an outfit (the wardrobe) calls petsChanged(), so the Garden redresses its pets.
const changeListeners = new Set<() => void>();
export function onPetsChanged(listener: () => void) { changeListeners.add(listener); return () => { changeListeners.delete(listener); }; }
export const petsChanged = () => changeListeners.forEach(listener => listener());

// What the pets are wearing, reloaded whenever the Garden becomes `active` again or an outfit
// changes; null until the server answers (and while it is off or unreachable). A pet the server
// does not know yet has no entry.
export function usePetOutfits(active: boolean) {
  const [outfits, setOutfits] = useState<PetsSummary['outfits'] | null>(null);
  const [changes, setChanges] = useState(0);
  useEffect(() => onPetsChanged(() => setChanges(count => count + 1)), []);
  useEffect(() => {
    if (!active) return;
    let live = true;
    loadPets()
      .then(pets => { if (live) setOutfits(pets?.outfits ?? null); })
      .catch(() => undefined); // offline: keep what they had on
    return () => { live = false; };
  }, [active, changes]);
  return outfits;
}
