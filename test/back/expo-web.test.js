import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { app } from '../../server.js';
import { isWebShellRequest } from '../../lib/web-shell.js';
import { securityHeaders } from '../../lib/http-security.js';

test('Expo shell paths expose only HTML; API, write and preview paths retain auth', async t => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(r => listener.once('listening', r));
  t.after(async () => { await new Promise(r => listener.close(r)); process.env.NODE_ENV = previous; });
  const base = `http://127.0.0.1:${listener.address().port}`;
  for (const path of ['/', '/journal', '/garden-history', '/bookhouse', '/mailbox', '/reflection', '/garden-test', '/feature/fairy', '/feature/friends', '/feature/settings', '/visit/fixture-owner']) {
    for (const method of ['GET', 'HEAD']) {
      const r = await fetch(base + path, { method });
      assert.equal(r.status, 200, path);
      assert.match(r.headers.get('content-type'), /text\/html/);
      assert.match(r.headers.get('content-security-policy'), /'wasm-unsafe-eval'/);
      if (path !== '/') assert.equal(r.headers.get('cache-control'), 'no-store');
      if (method === 'GET') assert.match(await r.text(), /_expo\/static\/js\/web/);
    }
  }
  for (const path of ['/session?view=metadata', '/users/fixture-owner/journals', '/users/fixture-owner/garden', '/ai/reports', '/speech/transcribe', '/visit', '/visit/fixture-owner/private', '/dev/backend-qa', '/treehouse-test', '/feature/debug']) {
    const r = await fetch(base + path);
    assert.equal(r.status, 401, path); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(r.headers.get('content-security-policy'), /wasm-unsafe-eval/);
    assert.doesNotMatch(await r.text(), /_expo|stack|prisma|firebase/i);
  }
  const r = await fetch(base + '/visit/fixture-owner', { method: 'POST' });
  assert.equal(r.status, 401); assert.equal(r.headers.get('cache-control'), 'no-store');
  const wasm = await fetch(base + '/canvaskit.wasm');
  assert.equal(wasm.status, 200); assert.match(wasm.headers.get('content-type'), /application\/wasm/);
  assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer()).slice(0,4)], [0,97,115,109]);
  const html = readFileSync(new URL('../../client/dist/index.html', import.meta.url), 'utf8');
  for (const src of [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1])) {
    assert.ok(src.startsWith('/_expo/')); const asset = await fetch(base + src);
    assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /javascript/); await asset.arrayBuffer();
  }
});

test('WebAssembly allowance stays limited to shell, without JavaScript eval or inline scripts', () => {
  for (const path of ['/', '/feature/fairy', '/session', '/users/fixture/garden']) {
    const h = securityHeaders({ path, method: 'GET', headers: { host: 'fixture.example' } }, { NODE_ENV: 'production' });
    const script = h['Content-Security-Policy'].split(';').find(x => x.trim().startsWith('script-src'));
    assert.doesNotMatch(script, /(?:^| )'unsafe-eval'|unsafe-inline|\*/);
    assert.equal(script.includes('wasm-unsafe-eval'), isWebShellRequest({ path, method: 'GET' }));
  }
  for (const path of ['/visit/../session', '/visit/a.json', '/visit/a%2fb', '/feature/debug']) assert.equal(isWebShellRequest({ path, method: 'GET' }), false);
});

test('shell allowlist covers the actual product catalog and keeps blocked modules absent', () => {
  const catalog = readFileSync(new URL('../../mobile/src/services/featureCatalog.ts', import.meta.url), 'utf8');
  for (const [, path] of catalog.matchAll(/route: '([^']+)'/g)) assert.ok(isWebShellRequest({ path, method: 'GET' }), path);
  for (const file of ['database-resources.js', 'security-metrics.js']) assert.equal(existsSync(new URL('../../lib/' + file, import.meta.url)), false);
});
