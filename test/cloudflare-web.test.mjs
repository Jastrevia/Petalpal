import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { unstable_dev } from '../deploy/cloudflare/node_modules/wrangler/wrangler-dist/cli.js';
import { chromium } from '../deploy/cloudflare/node_modules/playwright/index.mjs';
import { existsSync } from 'node:fs';

test('real Cloudflare runtime serves the actual Expo export, routes, artwork and WASM safely', { timeout: 90000 }, async t => {
  const worker = await unstable_dev('deploy/cloudflare/worker.js', {
    config: 'deploy/cloudflare/wrangler.jsonc', local: true, ip: '127.0.0.1', port: 0,
    persist: false, envFiles: [], logLevel: 'error', experimental: { disableExperimentalWarning: true }
  });
  t.after(() => worker.stop());
  const get = (path, options) => worker.fetch(path, options);
  for (const path of ['/', '/journal', '/garden-history', '/bookhouse', '/mailbox', '/reflection', '/garden-test',
    '/feature/daily', '/feature/fairy', '/feature/friends', '/feature/settings', '/visit/synthetic-owner']) {
    for (const method of ['GET', 'HEAD']) {
      const r = await get(path, { method });
      assert.equal(r.status, 200, path); assert.match(r.headers.get('content-type'), /text\/html/);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.match(r.headers.get('content-security-policy'), /connect-src[^;]+https:\/\/petalpal-v2.onrender.com[^;]+wss:\/\/petalpal-v2.onrender.com/);
      assert.match(r.headers.get('content-security-policy'), /'wasm-unsafe-eval'/);
      assert.doesNotMatch(r.headers.get('content-security-policy'), /'unsafe-eval'|script-src[^;]+'unsafe-inline'/);
      if (method === 'GET') assert.match(await r.text(), /_expo\/static\/js\/web/);
    }
  }
  for (const path of ['/session', '/users/owner/journals', '/api/fairies', '/socket.io/', '/internal/ai-jobs',
    '/missing.js', '/missing.wasm', '/feature/debug', '/visit/a%2fb']) {
    const r = await get(path, { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } });
    assert.equal(r.status, 404, path); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await r.text(), /_expo\/static\/js\/web/);
  }
  const write = await get('/session', { method: 'POST', body: '{}' });
  assert.equal(write.status, 405); assert.equal(write.headers.get('cache-control'), 'no-store');
  const wasm = await get('/canvaskit.wasm');
  assert.equal(wasm.status, 200); assert.match(wasm.headers.get('content-type'), /application\/wasm/);
  assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer()).slice(0, 4)], [0, 97, 115, 109]);
  const html = await readFile(new URL('../mobile/dist/index.html', import.meta.url), 'utf8');
  for (const [, path] of html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)) {
    const r = await get(path); assert.equal(r.status, 200, path);
    assert.match(r.headers.get('content-type'), /javascript|text\/css/); await r.arrayBuffer();
  }
  const root = new URL('../mobile/dist/', import.meta.url);
  const files = await readdir(root, { recursive: true });
  for (const file of files) {
    const s = await stat(new URL(file, root));
    if (s.isFile()) assert.ok(s.size <= 25 * 1024 * 1024, `Cloudflare per-asset limit: ${file}`);
  }
  assert.ok(files.length < 20000, 'Cloudflare free-plan asset count');
  // Exported art remains byte-identical to the approved source, including the
  // recovered bridge/paving/entrance and other product images. Compare bytes,
  // not new deployment manifests or application integrity infrastructure.
  for (const area of ['garden', 'bookhouse', 'reflection']) {
    const art = files.filter(f => f.startsWith(`assets/assets/${area}/`) && f.endsWith('.png'));
    assert.ok(art.length, `${area} artwork exported`);
    for (const file of art) {
      const source = file.replace(/^assets\/assets\//, '').replace(/\.[a-f0-9]{32}(\.png)$/, '$1');
      const [input, output] = await Promise.all([
        readFile(new URL(`../mobile/assets/${source}`, import.meta.url)), readFile(new URL(file, root))
      ]);
      assert.ok(input.equals(output), `Artwork preserved: ${source}`);
    }
    const r = await get('/' + art[0]); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /image\/png/);
  }
  const authorized = await get('/canvaskit.wasm', { headers: { Authorization: 'Bearer synthetic' } });
  assert.equal(authorized.headers.get('cache-control'), 'no-store');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  // Actual application export, fresh synthetic context, no external auth/API traffic.
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://${worker.address}:${worker.port}/bookhouse`);
  // Signed out: the partner invitation card is the sign-in screen, with the policy links kept below it.
  await page.getByText('Log In', { exact: true }).waitFor({ timeout: 20000 });
  await page.getByText('Terms of Use', { exact: true }).waitFor();
  assert.equal(failures.length, 0, 'Expo runtime has no uncaught browser errors');
  assert.equal(await page.evaluate(async () => (await fetch('/canvaskit.wasm')).headers.get('content-type')), 'application/wasm');
});
