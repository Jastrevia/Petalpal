import type { StorePackage } from './billing';

// The store, for buying PetalPal VIP. This file is the web (and any non-native) version: VIP is
// bought in the iPhone app, so here the store is simply not available. The iPhone and Android
// version is purchases.native.ts (RevenueCat), with the same exports.
// Dev web only: ?store=preview stands in a pretend store (prices like the App Store's, every
// purchase succeeds) to look at the VIP sheet; release builds never read it.
export type StoreResult = 'bought' | 'cancelled';

const preview = __DEV__ && typeof window !== 'undefined' && new URLSearchParams(window.location?.search ?? '').get('store') === 'preview';
const PREVIEW_PACKAGES: StorePackage[] = [
  { packageType: 'MONTHLY', product: { identifier: 'petalpal_vip_monthly', priceString: '$2.99' } },
  { packageType: 'LIFETIME', product: { identifier: 'petalpal_vip_lifetime', priceString: '$9.99' } },
];
const unavailable = () => Promise.reject(new Error('The store is not available here'));
const pause = () => new Promise(resolve => setTimeout(resolve, 600));

/** Whether this device can buy here (the SDK and its public key are present). */
export const storeAvailable = preview;

export async function storePackages(_userId: string): Promise<StorePackage[]> { return preview ? PREVIEW_PACKAGES : []; }
export async function buyPackage(_userId: string, _pkg: StorePackage): Promise<StoreResult> { if (!preview) return unavailable(); await pause(); return 'bought'; }
export async function restoreStorePurchases(_userId: string): Promise<void> { if (!preview) return unavailable(); await pause(); }
export async function manageSubscription(): Promise<void> { return unavailable(); }
