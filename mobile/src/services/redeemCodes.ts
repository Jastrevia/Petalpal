import { useEffect, useState } from 'react';
import { ApiError, apiRequest } from './api';

// Redemption codes (lib/redeem-codes.js). The reward is recorded as "pending" until it exists.
export interface Redemption { batch: string; reward: string; status: 'pending' | 'granted'; redeemedAt: string }
export type RedeemFailure = 'INVALID_CODE' | 'CODE_USED' | 'ALREADY_REDEEMED' | 'TOO_MANY' | 'OFFLINE';

export const loadRedemptions = () => apiRequest<{ redemptions: Redemption[] }>('/api/redeem').then(result => result.redemptions);

// Shown as XXXXX-XXXXX-XXXXX-XXXXX while typing; the server accepts any spacing or case.
export function formatRedeemInput(text: string) {
  return text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 20).replace(/(.{5})(?=.)/g, '$1-');
}

export async function redeemCode(code: string): Promise<{ ok: true; redemption: Redemption } | { ok: false; reason: RedeemFailure }> {
  try {
    const redemption = await apiRequest<Redemption & { created: boolean }>('/api/redeem', 'POST', { code });
    return { ok: true, redemption };
  } catch (error) {
    if (!(error instanceof ApiError)) return { ok: false, reason: 'OFFLINE' };
    if (error.status === 429) return { ok: false, reason: 'TOO_MANY' };
    if (error.code === 'CODE_USED' || error.code === 'ALREADY_REDEEMED' || error.code === 'INVALID_CODE') return { ok: false, reason: error.code };
    if (error.status === 400) return { ok: false, reason: 'INVALID_CODE' };
    return { ok: false, reason: 'OFFLINE' };
  }
}

// Loads only when `enabled` (the Me list, signed in).
export function useRedemptions(enabled = true) {
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadRedemptions().then(list => { if (active) setRedemptions(list); }).catch(() => { if (active) setRedemptions([]); });
    return () => { active = false; };
  }, [enabled]);
  return [redemptions, setRedemptions] as const;
}
