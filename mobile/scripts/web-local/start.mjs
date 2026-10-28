// npm run web:local — the real app in a browser at http://localhost:8081 with a fake sign-in and
// fake data, so the team can look at screens without production accounts or keys.
// Expo's dev server runs on 8082; this proxy on 8081 adds scripts/web-local/fixtures.js before
// the app loads. Nothing here is part of the app bundle or any release build.
// npm run web:phone — the same preview, also reachable from a phone on the same Wi-Fi, to try
// the app on a real phone browser (Safari, Chrome) before a release. Still fake data only.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.LOCAL_PREVIEW_PORT || 8081), EXPO_PORT = PORT + 1;
const PHONE = process.argv.includes('--lan');
// This computer's Wi-Fi address, for the phone to open.
const lanAddress = Object.values(networkInterfaces()).flat()
  .find(item => item && item.family === 'IPv4' && !item.internal && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(item.address))?.address;
const HOST = PHONE && lanAddress ? lanAddress : 'localhost';
const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '../..');
const fixtures = path.join(here, 'fixtures.js');

// A fresh Metro cache: a shared one can serve another checkout's code or API address.
// Windows reads TEMP/TMP instead of TMPDIR, and npx there is npx.cmd, which needs a shell.
const cache = mkdtempSync(path.join(tmpdir(), 'petalpal-web-local-'));
const windows = process.platform === 'win32';
const expo = spawn(windows ? 'npx.cmd' : 'npx', ['expo', 'start', '--port', String(EXPO_PORT)], {
  cwd: mobile, stdio: ['ignore', 'inherit', 'inherit'], shell: windows,
  env: { ...process.env, TMPDIR: cache, TEMP: cache, TMP: cache, EXPO_NO_TELEMETRY: '1',
    EXPO_PUBLIC_API_BASE_URL: 'https://api.synthetic.invalid',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'synthetic-public-build-fixture', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'fixture.invalid',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'petalpal-synthetic', EXPO_PUBLIC_FIREBASE_APP_ID: 'synthetic-public-app',
    // The published legal pages from public/legal, served by this preview like the real Web build.
    EXPO_PUBLIC_PRIVACY_POLICY_URL: `http://${HOST}:${PORT}/legal/privacy.html`,
    EXPO_PUBLIC_TERMS_URL: `http://${HOST}:${PORT}/legal/terms.html`,
    EXPO_PUBLIC_DELETION_URL: `http://${HOST}:${PORT}/legal/account-deletion.html` },
});

const server = http.createServer((req, res) => {
  if (req.url === '/__local-preview-fixtures.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return res.end(readFileSync(fixtures));
  }
  const headers = { ...req.headers, host: `127.0.0.1:${EXPO_PORT}` };
  delete headers['accept-encoding'];
  const upstream = http.request({ host: '127.0.0.1', port: EXPO_PORT, path: req.url, method: req.method, headers }, response => {
    if (!(response.headers['content-type'] || '').includes('text/html')) {
      res.writeHead(response.statusCode, response.headers); response.pipe(res); return;
    }
    let html = ''; response.setEncoding('utf8');
    response.on('data', chunk => { html += chunk; });
    response.on('end', () => {
      const out = html.replace('<head>', '<head><script src="/__local-preview-fixtures.js"></script>');
      const outHeaders = { ...response.headers }; delete outHeaders['content-length'];
      res.writeHead(response.statusCode, outHeaders); res.end(out);
    });
  });
  upstream.on('error', () => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('Expo is still starting. Reload in a few seconds.'); });
  req.pipe(upstream);
});
// Live reload (Metro's websocket) passes straight through.
server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(EXPO_PORT, '127.0.0.1', () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries({ ...req.headers, host: `127.0.0.1:${EXPO_PORT}` })
      .map(([key, value]) => `${key}: ${value}`).join('\r\n') + '\r\n\r\n');
    upstream.write(head); upstream.pipe(socket); socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
});
server.listen(PORT, PHONE ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`\n  PetalPal local preview: http://localhost:${PORT}`);
  if (PHONE) console.log(lanAddress ? `  On your phone (same Wi-Fi): http://${lanAddress}:${PORT}` : '  No Wi-Fi address found: connect this computer to Wi-Fi to open the preview on a phone.');
  console.log('  Sign in with preview@example.invalid / preview-only (fake data; the first load takes about a minute).\n');
});

const stop = () => { server.close(); expo.kill('SIGINT'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
expo.on('exit', code => { server.close(); process.exit(code ?? 0); });
