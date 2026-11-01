import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { unstable_dev } from '../deploy/cloudflare/node_modules/wrangler/wrangler-dist/cli.js';
import { chromium } from '../deploy/cloudflare/node_modules/playwright/index.mjs';

test('synthetic preview signs into the unchanged Expo Garden without provider traffic', { timeout: 60000 }, async t => {
  const worker = await unstable_dev('deploy/cloudflare/preview-worker.js', {
    config: 'deploy/cloudflare/wrangler.preview.jsonc', local: true, ip: '127.0.0.1', port: 0,
    persist: false, envFiles: [], logLevel: 'error', experimental: { disableExperimentalWarning: true }
  });
  t.after(() => worker.stop());
  const r = await worker.fetch('/bookhouse');
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /connect-src 'self';/); assert.match(csp, /frame-src 'none';/);
  assert.doesNotMatch(csp, /onrender\.com|googleapis\.com|apis\.google\.com|firebaseapp\.com/);
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // A network backstop guarantees even a failing CSP assertion cannot reach
  // a provider. CSP violations must happen before any intercepted request.
  let escaped = 0;
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    escaped++; return route.abort();
  });
  // A page that needs an account (the Garden and the treehouse open as a guest).
  await page.goto(`http://${worker.address}:${worker.port}/reflection`);
  // The invitation card signs in through the real (here synthetic) Firebase email/password flow.
  const logIn = page.getByText('Log In', { exact: true });
  await logIn.waitFor();
  await page.getByLabel('Email address', { exact: true }).fill('preview@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('preview-only');
  // The card breathes (a gentle idle animation), so submit from the field instead of waiting for it to settle.
  await page.getByLabel('Password', { exact: true }).press('Enter');
  // The button reads "Opening…" while the account opens; the card leaves only once signed in.
  await page.getByLabel('Email address', { exact: true }).waitFor({ state: 'hidden', timeout: 25000 });
  await page.goto(`http://${worker.address}:${worker.port}/`);
  await page.getByTestId('main-navigation').waitFor({ timeout: 25000 });
  assert.equal(await page.getByRole('note').count(), 1);
  const blocked = await page.evaluate(async () => {
    const base = 'https://petalpal-v2.onrender.com';
    // The fixture identity cannot perform privileged writes or read another owner.
    const options = { headers: { Authorization: 'Bearer public.synthetic' } };
    const paths = ['/users/other/garden', '/internal/ai-jobs'];
    const statuses = await Promise.all(paths.map(async path => (await fetch(base + path, options)).status));
    const write = await fetch(base + '/events', { ...options, method: 'POST', body: '{}' });
    const noIdentity = await fetch(base + '/session');
    return { statuses, write: write.status, noIdentity: noIdentity.status, cache: write.headers.get('Cache-Control') };
  });
  assert.deepEqual(blocked.statuses, [403, 403]);
  assert.equal(blocked.write, 403); assert.equal(blocked.noIdentity, 401); assert.equal(blocked.cache, 'no-store');
  const violations = await page.evaluate(async () => {
    const directives = [];
    document.addEventListener('securitypolicyviolation', e => directives.push(e.effectiveDirective));
    for (const target of ['https://petalpal-v2.onrender.com/session',
      'https://identitytoolkit.googleapis.com/blocked-synthetic-probe']) {
      // XHR bypasses the fixture fetch adapter and exercises the actual CSP.
      await new Promise(resolve => {
        const xhr = new XMLHttpRequest(); xhr.open('GET', target);
        xhr.onloadend = resolve; xhr.send();
      });
    }
    try { new WebSocket('wss://petalpal-v2.onrender.com/socket.io/'); } catch { /* Expected. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
    return directives;
  });
  assert.ok(violations.filter(d => d === 'connect-src').length >= 3);
  assert.equal(escaped, 0, 'No provider request escaped preview CSP');
  assert.equal((await worker.fetch('/socket.io/')).status, 404);
});
