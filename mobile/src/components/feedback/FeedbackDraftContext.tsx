/**
 * PetalPal Feedback Draft Context & Persistence
 *
 * Preserves user drafts across screen navigation, panel open/close,
 * and page reloads via AsyncStorage / localStorage.
 * Ensures typed text is never lost unintentionally while providing
 * an explicit "Discard draft" action.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FeedbackDraft,
  INITIAL_FEEDBACK_DRAFT,
} from './feedbackTypes';

const STORAGE_KEY = '@petalpal/feedback_draft_v1';

async function getStoredDraft(): Promise<string | null> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const val = window.localStorage.getItem(STORAGE_KEY);
      if (val) return val;
    } catch {}
  }
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function setStoredDraft(value: string): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {}
  }
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value);
  } catch {}
}

async function removeStoredDraft(): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

interface FeedbackDraftContextValue {
  draft: FeedbackDraft;
  updateDraft: (updates: Partial<FeedbackDraft>) => void;
  clearDraft: () => void;
  hasDraft: boolean;
  isLoaded: boolean;
}

const FeedbackDraftContext = createContext<FeedbackDraftContextValue | null>(
  null
);

export function FeedbackDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<FeedbackDraft>(INITIAL_FEEDBACK_DRAFT);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<any>(null);

  // 1. Load saved draft on mount
  useEffect(() => {
    let isMounted = true;
    async function loadSavedDraft() {
      try {
        const stored = await getStoredDraft();
        if (stored && isMounted) {
          const parsed = JSON.parse(stored);
          setDraft((prev) => ({
            ...prev,
            category: parsed.category || prev.category,
            subject: parsed.subject || '',
            message: parsed.message || '',
            email: parsed.email || '',
            // Exclude persisted binary attachments for privacy/storage limits
            attachments: [],
            updatedAt: parsed.updatedAt || Date.now(),
          }));
        }
      } catch (err) {
        if (__DEV__) console.warn('Failed to load feedback draft:', err);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    }
    loadSavedDraft();
    return () => {
      isMounted = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // 2. Persist draft changes with 300ms debounce
  const persistDraft = useCallback((nextDraft: FeedbackDraft) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Only persist text fields, never binary image data
        const toSave = {
          category: nextDraft.category,
          subject: nextDraft.subject,
          message: nextDraft.message,
          email: nextDraft.email,
          updatedAt: Date.now(),
        };
        await setStoredDraft(JSON.stringify(toSave));
      } catch (err) {
        if (__DEV__) console.warn('Failed to persist feedback draft:', err);
      }
    }, 300);
  }, []);

  const updateDraft = useCallback(
    (updates: Partial<FeedbackDraft>) => {
      setDraft((prev) => {
        const next: FeedbackDraft = {
          ...prev,
          ...updates,
          updatedAt: Date.now(),
        };
        persistDraft(next);
        return next;
      });
    },
    [persistDraft]
  );

  const clearDraft = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setDraft(INITIAL_FEEDBACK_DRAFT);
    try {
      await removeStoredDraft();
    } catch (err) {
      if (__DEV__) console.warn('Failed to remove feedback draft:', err);
    }
  }, []);

  const hasDraft = useMemo(() => {
    return (
      draft.message.trim().length > 0 ||
      draft.subject.trim().length > 0 ||
      draft.email.trim().length > 0 ||
      draft.attachments.length > 0
    );
  }, [draft]);

  const value = useMemo(
    () => ({
      draft,
      updateDraft,
      clearDraft,
      hasDraft,
      isLoaded,
    }),
    [draft, updateDraft, clearDraft, hasDraft, isLoaded]
  );

  return (
    <FeedbackDraftContext.Provider value={value}>
      {children}
    </FeedbackDraftContext.Provider>
  );
}

export function useFeedbackDraft(): FeedbackDraftContextValue {
  const ctx = useContext(FeedbackDraftContext);
  if (!ctx) {
    throw new Error(
      'useFeedbackDraft must be used within a FeedbackDraftProvider'
    );
  }
  return ctx;
}
