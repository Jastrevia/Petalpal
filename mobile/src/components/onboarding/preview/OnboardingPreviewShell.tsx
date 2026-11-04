import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { PreviewAuthProvider } from '../../../services/auth';
import { configureApi, setPreviewApiTransport } from '../../../services/api';
import { setPreviewPlacementMemory } from '../../garden/planting/plantingPersistence';
import { PREVIEW_OWNER_ID, previewBackend, previewRequest, previewUser } from './previewBackend';

// DEV-only shell for /onboarding-preview. It replaces the real AuthProvider with a synthetic,
// already signed-in preview owner and answers every API request in memory, so the real
// Garden and the real tour run without Render, Firebase or any shared data.

// Routes the preview Garden opens itself (the Treehouse, the mailbox …) stay inside the
// preview while it is in use; any other path returns to the real app and its sign-in.
const PREVIEW_CHILD_ROUTES = new Set(['/bookhouse', '/mailbox', '/garden-history', '/reflection', '/journal']);
let inPreview = false;
export function usesOnboardingPreviewShell(pathname: string) {
  if (!__DEV__) return false;
  if (pathname === '/onboarding-preview') inPreview = true;
  else if (!PREVIEW_CHILD_ROUTES.has(pathname)) inPreview = false;
  return inPreview;
}

// The preview's language, switchable from the preview controls.
let locale: 'en' | 'zh-Hans' = 'zh-Hans';
const listeners = new Set<() => void>();
export function setPreviewLocale(next: 'en' | 'zh-Hans') { locale = next; listeners.forEach(listener => listener()); }
export const usePreviewLocale = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => locale, () => locale);

export function OnboardingPreviewShell({ children }: { children: ReactNode }) {
  const current = usePreviewLocale();
  const user = previewUser(current);
  previewBackend.setUser(user);
  // Installed during the first render, before any child can make a request (and again by the
  // effect, so a development remount never leaves the preview pointing at the real API).
  useState(installPreview);
  useEffect(() => { installPreview(); return uninstallPreview; }, []);
  return <PreviewAuthProvider user={user}>{children}</PreviewAuthProvider>;
}

function installPreview() {
  configureApi(null);
  setPreviewApiTransport((path, method, body) => previewRequest(path, method, body as Record<string, unknown> | undefined));
  // Placements stay in memory: the browser's saved Garden cache is never touched.
  setPreviewPlacementMemory(PREVIEW_OWNER_ID);
  return true;
}
function uninstallPreview() {
  setPreviewApiTransport(null);
  setPreviewPlacementMemory(null);
}
