import { useEffect, useState } from 'react';
import { apiRequest } from './api';

// The name the owner gave their Garden Fairy at sign-up (many fairies may share one). Older
// accounts and anyone signed out keep the starter name, PPL (lib/fairy-config.js). Copy that
// names her writes {fairy}; withFairyName fills it in.
export const STARTER_FAIRY_NAME = 'PPL';

let current: string | null = null;
let inflight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<(name: string | null) => void>();
const publish = () => listeners.forEach(listener => listener(current));

interface FairyList { fairies: { id: string; name: string }[]; activeFairyId: string | null }

export function refreshFairyName(): Promise<void> {
  const asked = generation;
  inflight ??= apiRequest<FairyList>('/api/fairies').then(({ fairies, activeFairyId }) => {
    if (asked !== generation) return; // an answer for the account that just signed out
    const active = fairies.find(fairy => fairy.id === activeFairyId) ?? fairies[0];
    if (active?.name) { current = active.name; publish(); }
  }).catch(() => undefined).finally(() => { inflight = null; });
  return inflight;
}

// The Garden's runtime answer carries her name too, so it keeps this one current for free.
export function noteFairyName(name: string | null | undefined) {
  if (name && name !== current) { current = name; publish(); }
}

// Signing out forgets her, so the next account never sees the last one's fairy.
export function forgetFairyName() { generation++; inflight = null; current = null; publish(); }

// Her name if already known, without asking the server (the waking screen must not add a request).
export const peekFairyName = () => current || STARTER_FAIRY_NAME;

export function useFairyName(): string {
  const [name, setName] = useState(current);
  useEffect(() => {
    listeners.add(setName);
    if (!current) void refreshFairyName();
    return () => { listeners.delete(setName); };
  }, []);
  return name || STARTER_FAIRY_NAME;
}

type Named<T> = T extends string ? string : T extends (...args: never[]) => unknown ? T : { [K in keyof T]: Named<T[K]> };
// Every {fairy} in a copy table's strings (nested tables included) becomes her name.
export function withFairyName<T>(copy: T, name: string): Named<T> {
  if (typeof copy === 'string') return copy.split('{fairy}').join(name) as Named<T>;
  if (!copy || typeof copy !== 'object') return copy as Named<T>;
  return Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, withFairyName(value, name)])) as Named<T>;
}
