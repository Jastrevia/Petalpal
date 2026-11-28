import { ApiError, apiRequest } from './api';

// PetalPal VIP (docs/billing/BILLING.md, lib/billing.js). The server decides who is VIP and what
// free accounts may do; the app only shows it and sells the two plans through the store
// (services/purchases*.ts). Prices always come from the store, never from here.
export type BillingPlanId = 'MONTHLY' | 'LIFETIME';
export type BillingSummary = {
  vip: boolean; plan: BillingPlanId | null; founder: boolean; expiresAt: string | null; willRenew: boolean;
  inGracePeriod: boolean; store: string | null; enforced: boolean;
  benefits: { weeklyAi: boolean; monthlyAi: boolean; weeklyAiTrialsLeft: number | null; dailyFlowers: number; tarotReadingsPerWeek: number | null };
};
export type ServerPlan = { plan: BillingPlanId; productId: string; referencePriceUsd: number; period: string | null; available: boolean; endsAt: string | null };

/** The owner's VIP state, or null with no billing on the server yet (404). */
export async function loadBilling(): Promise<BillingSummary | null> {
  try { return await apiRequest<BillingSummary>('/billing/me'); }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
}

export async function loadServerPlans(): Promise<ServerPlan[]> {
  try { return (await apiRequest<{ plans: ServerPlan[] }>('/billing/plans')).plans ?? []; }
  catch (error) { if (error instanceof ApiError && error.status === 404) return []; throw error; }
}

/** After a purchase or a restore: the server re-reads the store, so VIP shows at once. */
export async function syncBilling(): Promise<BillingSummary> {
  return apiRequest<BillingSummary>('/billing/sync', 'POST', {});
}

// A store package as RevenueCat describes it (the fields used here).
export type StorePackage = { packageType: string; product: { identifier: string; priceString: string } };
export type ShownPlan<P extends StorePackage = StorePackage> = { plan: BillingPlanId; price: string; endsAt: string | null; pkg: P };

/**
 * The plans to offer: each plan the server has on sale, with the store package that sells it (its
 * product id first, else RevenueCat's standard package type) and its localized store price.
 * Founding Member first while it lasts. A plan the store does not offer (not set up yet) is left out.
 */
export function plansToShow<P extends StorePackage>(serverPlans: ServerPlan[], packages: P[], now = new Date()): ShownPlan<P>[] {
  const shown: ShownPlan<P>[] = [];
  for (const id of ['LIFETIME', 'MONTHLY'] as const) {
    const plan = serverPlans.find(p => p.plan === id);
    if (!plan?.available || (plan.endsAt && Date.parse(plan.endsAt) <= now.getTime())) continue;
    const pkg = packages.find(p => p.product.identifier === plan.productId) ?? packages.find(p => p.packageType === id);
    if (pkg) shown.push({ plan: id, price: pkg.product.priceString, endsAt: plan.endsAt, pkg });
  }
  return shown;
}
