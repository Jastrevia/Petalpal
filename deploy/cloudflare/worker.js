import { isWebShellRequest } from '../../lib/web-shell.js';
import { buildContentSecurityPolicy, resolveHostingConfig } from './hosting-config.js';

// Expo names exported art and scripts by their content (a 32-hex hash in assets/, a hash in
// _expo/static/): such a file never changes under its name, so a browser may keep it for good.
const HASHED_ASSET = /^\/(?:assets\/.+\.[a-f0-9]{32}\.[a-z0-9]+|_expo\/static\/.+-[a-f0-9]{16,}\.(?:js|css))$/;
// Pages and errors are never stored. Behind Cloudflare Access every request carries its cookie:
// static files then stay in that one browser only (private), so the Garden's ~100 MB of art is not
// downloaded again on every visit; a hashed file is kept, anything else is revalidated.
function cacheControl({ request, response, path, page }) {
  if (page || response.status >= 400 || request.headers.has('Authorization')) return 'no-store';
  if (response.status === 200 && HASHED_ASSET.test(path)) return 'private, max-age=31536000, immutable';
  return request.headers.has('Cookie') ? 'private, max-age=0, must-revalidate' : 'public, max-age=0, must-revalidate';
}

// Static hosting only. All dynamic calls go directly to the configured backend
// origin (see hosting-config.js; defaults are the existing production values).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hosting = resolveHostingConfig(env);
    if (!hosting) {
      return new Response('Hosting environment configuration required', { status: 503,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const contentSecurityPolicy = buildContentSecurityPolicy(hosting);
    let response;
    const shell = isWebShellRequest({ method: request.method, path: url.pathname });
    if (!['GET', 'HEAD'].includes(request.method)) {
      response = Response.json({ error: 'Use the configured backend origin' }, { status: 405 });
    } else {
      // Expo output is "single". Only actual public product routes get the
      // shell; missing JS/WASM and API paths must remain 404, never index.html.
      const assetUrl = new URL(request.url);
      if (shell) assetUrl.pathname = '/index.html';
      assetUrl.search = '';
      response = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }));
    }
    const headers = new Headers(response.headers);
    // Delivery-only preview: the retained synthetic export cannot contact
    // Render or Firebase. Real-auth preview is a separate approval gate.
    const policy = env.STATIC_PREVIEW_ONLY === '1'
      ? contentSecurityPolicy
        .replace(/connect-src[^;]+/, "connect-src 'self'")
        .replace(/frame-src[^;]+/, "frame-src 'none'")
        .replace(' https://apis.google.com', '')
      : contentSecurityPolicy;
    headers.set('Content-Security-Policy', policy);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (url.protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=15552000');
    const html = headers.get('Content-Type')?.includes('text/html');
    headers.set('Cache-Control', cacheControl({ request, response, path: url.pathname, page: shell || html }));
    return new Response(response.body, { status: response.status, headers });
  }
};
