import { useCallback, useEffect, useRef, useState } from 'react';
import { loadBackendQaSummary, type BackendQaSummary } from '../services/backendQa';

export function useBackendQa(ownerId: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<BackendQaSummary | null>(null);
  const [requestState, setRequestState] = useState<{ ownerId: string; loading: boolean; failed: boolean } | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled || !ownerId) return;
    const request = ++generation.current;
    setResult(null);
    setRequestState({ ownerId, loading: true, failed: false });
    try {
      const summary = await loadBackendQaSummary(ownerId);
      if (request !== generation.current) return;
      setResult(summary);
      setRequestState({ ownerId, loading: false, failed: false });
    } catch {
      if (request === generation.current) setRequestState({ ownerId, loading: false, failed: true });
    }
  }, [ownerId, enabled]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- another owner drops the old summary, then refresh() asks (generation-guarded)
    setResult(null); setRequestState(null);
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);
  return {
    summary: enabled && result?.ownerId === ownerId ? result : null,
    loading: Boolean(enabled && requestState?.ownerId === ownerId && requestState?.loading),
    failed: Boolean(enabled && requestState?.ownerId === ownerId && requestState?.failed),
    refresh,
  };
}
