import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
function service(answer) {
  const calls = [];
  const api = { ApiError, apiRequest: async (path, method = 'GET', body) => { calls.push({ path, method, body }); return answer(path, method, body); } };
  return { billing: loadPlantingModules(undefined, undefined, undefined, true, { './api': api })('../../../services/billing'), calls };
}
const source = file => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const server = (lifetime = { available: true, endsAt: '2027-02-24T23:59:59.000Z' }) => [
  { plan: 'MONTHLY', productId: 'petalpal_vip_monthly', referencePriceUsd: 3, period: 'P1M', available: true, endsAt: null },
  { plan: 'LIFETIME', productId: 'petalpal_vip_lifetime', referencePriceUsd: 10, period: null, ...lifetime },
];
const pkg = (packageType, identifier, priceString) => ({ packageType, product: { identifier, priceString } });

test('plans: Founding Member first while on sale, each with its store price; nothing the store lacks', () => {
  const { billing } = service(() => ({}));
  const now = new Date('2026-12-01T00:00:00Z');
  const packages = [pkg('MONTHLY', 'petalpal_vip_monthly', 'CA$4.49'), pkg('LIFETIME', 'petalpal_vip_lifetime', 'CA$14.99')];
  assert.deepEqual(plain(billing.plansToShow(server(), packages, now)).map(p => [p.plan, p.price, p.endsAt]),
    [['LIFETIME', 'CA$14.99', '2027-02-24T23:59:59.000Z'], ['MONTHLY', 'CA$4.49', null]]);
  // The offer over (by the server, or its end date passed while the app was open): monthly only.
  assert.deepEqual(plain(billing.plansToShow(server({ available: false, endsAt: null }), packages, now).map(p => p.plan)), ['MONTHLY']);
  assert.deepEqual(plain(billing.plansToShow(server(), packages, new Date('2027-03-01T00:00:00Z')).map(p => p.plan)), ['MONTHLY']);
  // Matched by product id first, else by RevenueCat's package type; the store not set up: nothing.
  assert.equal(billing.plansToShow(server(), [pkg('CUSTOM', 'petalpal_vip_lifetime', '$9.99'), pkg('MONTHLY', 'other_monthly', '$2.99')], now).length, 2);
  assert.deepEqual(plain(billing.plansToShow(server(), [], now)), []);
  assert.deepEqual(plain(billing.plansToShow([], packages, now)), []);
});

test('the app asks the server who is VIP, and syncs it after buying or restoring', async () => {
  const { billing, calls } = service(path => (path === '/billing/plans' ? { plans: server() } : { vip: true, plan: 'LIFETIME', founder: true }));
  assert.equal((await billing.loadBilling()).founder, true);
  assert.equal((await billing.loadServerPlans()).length, 2);
  assert.equal((await billing.syncBilling()).vip, true);
  assert.deepEqual(plain(calls), [{ path: '/billing/me', method: 'GET' }, { path: '/billing/plans', method: 'GET' }, { path: '/billing/sync', method: 'POST', body: {} }]);
  // A server from before billing: no VIP section, no plans. A real failure is not hidden.
  const old = service(() => { throw new ApiError('Not found', 404); }).billing;
  assert.equal(await old.loadBilling(), null);
  assert.deepEqual(plain(await old.loadServerPlans()), []);
  await assert.rejects(service(() => { throw new ApiError('down', 500); }).billing.loadBilling(), /down/);
});

test('the store: RevenueCat customer is the PetalPal account, a cancel is not an error, web never sells', () => {
  const native = source('services/purchases.native.ts');
  assert.match(native, /Purchases\.configure\(\{ apiKey: KEY, appUserID: userId \}\)/);
  assert.match(native, /Purchases\.logIn\(userId\)/);
  assert.match(native, /PURCHASE_CANCELLED_ERROR/);
  assert.match(native, /EXPO_PUBLIC_REVENUECAT_IOS_KEY/);
  const web = source('services/purchases.ts');
  assert.match(web, /const preview = __DEV__ &&/);
  assert.match(web, /export const storeAvailable = preview;/);
  assert.ok(!/react-native-purchases/.test(web), 'the web bundle carries no store SDK');
});

test('the sheet shows what Apple asks for: price per period, auto-renewal, restore, Terms and Privacy', () => {
  const sheet = source('components/features/VipMembership.tsx');
  for (const text of ['renews automatically', 'cancel at least 24 hours', 'Apple ID', 'Restore purchases', 'Terms of Use', 'Privacy Policy', '/ month', '自动续订', '恢复购买']) {
    assert.ok(sheet.includes(text), text);
  }
  assert.match(sheet, /EXPO_PUBLIC_TERMS_URL/);
  assert.match(sheet, /EXPO_PUBLIC_PRIVACY_POLICY_URL/);
  // Prices come from the store only (plan.price), never a number written in the app.
  assert.ok(!/\$\d/.test(sheet.replace(/\$\{[^}]*\}/g, '')), 'no hard-coded price');
});
