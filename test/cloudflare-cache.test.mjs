import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../deploy/cloudflare/worker.js';

// deploy/cloudflare/worker.js Cache-Control. Behind Cloudflare Access every request carries its
// cookie; the Garden's art (about 100 MB on a first visit) must still be kept by the browser, or it
// is downloaded again on every visit. Pages, errors and authorized requests are never stored.
const env = { ASSETS: { fetch: async request => {
  const path = new URL(request.url).pathname;
  if (path === '/missing.webp') return new Response('missing', { status: 404 });
  const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.wasm') ? 'application/wasm'
    : path.endsWith('.js') ? 'text/javascript' : 'image/webp';
  return new Response('body', { status: 200, headers: { 'Content-Type': type } });
} } };
const get = (path, headers = {}) => worker.fetch(new Request(`https://app.example.test${path}`, { headers }), env)
  .then(response => response.headers.get('cache-control'));
const cookie = { Cookie: 'CF_Authorization=synthetic' };
const art = '/assets/assets/garden/land/central-land.0123456789abcdef0123456789abcdef.webp';
const script = '/_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js';

test('content-hashed art and scripts are kept by the browser, also behind the Access cookie', async () => {
  for (const path of [art, script]) {
    assert.equal(await get(path), 'private, max-age=31536000, immutable', path);
    assert.equal(await get(path, cookie), 'private, max-age=31536000, immutable', path);
  }
});

test('unhashed files are revalidated, privately behind the Access cookie', async () => {
  assert.equal(await get('/canvaskit.wasm'), 'public, max-age=0, must-revalidate');
  assert.equal(await get('/canvaskit.wasm', cookie), 'private, max-age=0, must-revalidate');
  assert.equal(await get('/assets/assets/garden/land/central-land.webp', cookie), 'private, max-age=0, must-revalidate',
    'a name without the content hash is never kept for good');
});

test('pages, errors and authorized requests are never stored', async () => {
  for (const path of ['/', '/reflection', '/bookhouse']) assert.equal(await get(path, cookie), 'no-store', path);
  assert.equal(await get('/missing.webp', cookie), 'no-store');
  assert.equal(await get(art, { Authorization: 'Bearer synthetic' }), 'no-store');
  assert.equal(await get('/canvaskit.wasm', { Authorization: 'Bearer synthetic' }), 'no-store');
});
