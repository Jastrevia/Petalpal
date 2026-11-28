import { Platform } from 'react-native';
import Purchases, { PURCHASES_ERROR_CODE, type PurchasesPackage } from 'react-native-purchases';
import type { StorePackage } from './billing';

// The store on iPhone (and later Android), through RevenueCat (docs/billing/BILLING.md). Its
// customer id is the PetalPal account id, as the server expects, set only once the owner opens VIP
// (nothing reaches RevenueCat before that). The public SDK keys are build settings
// (EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY, meant to ship in the app); without one the store is
// not available and the VIP sheet says it opens soon. Same exports as purchases.ts (web).
export type StoreResult = 'bought' | 'cancelled';

const KEY = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
  : Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : undefined;
export const storeAvailable = Boolean(KEY);

let customer: string | null = null;
let switching: Promise<void> | null = null;
async function ready(userId: string) {
  if (!KEY) throw new Error('The store is not set up in this build');
  if (customer === userId) return;
  // (One at a time: two quick taps must not configure twice.)
  if (!switching) switching = (async () => {
    if (customer === null && !(await Purchases.isConfigured())) Purchases.configure({ apiKey: KEY, appUserID: userId });
    else await Purchases.logIn(userId); // another account signed in on this phone since
    customer = userId;
  })().finally(() => { switching = null; });
  await switching;
  if (customer !== userId) await ready(userId);
}

export async function storePackages(userId: string): Promise<(StorePackage & PurchasesPackage)[]> {
  await ready(userId);
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function buyPackage(userId: string, pkg: StorePackage): Promise<StoreResult> {
  await ready(userId);
  try {
    await Purchases.purchasePackage(pkg as PurchasesPackage);
    return 'bought';
  } catch (error) {
    const code = (error as { code?: string; userCancelled?: boolean | null })?.code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || (error as { userCancelled?: boolean | null })?.userCancelled) return 'cancelled';
    throw error;
  }
}

export async function restoreStorePurchases(userId: string): Promise<void> {
  await ready(userId);
  await Purchases.restorePurchases();
}

export async function manageSubscription(): Promise<void> {
  await Purchases.showManageSubscriptions();
}
