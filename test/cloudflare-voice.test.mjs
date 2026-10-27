import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from '../deploy/cloudflare/node_modules/esbuild/lib/main.js';
import { chromium } from '../deploy/cloudflare/node_modules/playwright/index.mjs';
import worker from '../deploy/cloudflare/worker.js';

// Exercise the real React hook, speech service and authenticated API transport.
// Only identity, native adapters and the transcription server are fixtures.
// Synthetic Web Audio replaces microphone input; no provider or user data is used.
const adapters = {
  'react-native': `export const Platform = { OS: 'web' };
    export const AppState = { addEventListener: () => ({ remove() {} }) };`,
  'expo-file-system/legacy': `export const EncodingType = {};
    export function readAsStringAsync() { throw Error('Unexpected native file read'); }
    export const deleteAsync = readAsStringAsync, getInfoAsync = readAsStringAsync;`,
  '../services/auth': `export const useAuth = () => ({ session: { user: { id: 'fixture-owner' } } });`,
  'expo-audio': `import { useRef } from 'react';
    export const RecordingPresets = { HIGH_QUALITY: {} };
    export const AudioModule = { requestRecordingPermissionsAsync: async () => ({ granted: true }) };
    export const setAudioModeAsync = async () => {};
    export function useAudioRecorder(options) {
      const ref = useRef(null);
      if (!ref.current) ref.current = {
        uri: null,
        async prepareToRecordAsync() {
          this.context = new AudioContext();
          await this.context.resume();
          this.oscillator = this.context.createOscillator();
          const destination = this.context.createMediaStreamDestination();
          this.oscillator.connect(destination); this.oscillator.start();
          this.stream = destination.stream;
          // Same browser options as Expo's AudioRecorderWeb.createMediaRecorder.
          this.media = new MediaRecorder(this.stream, options.web);
          window.fixture.recordedBytes = 0; window.fixture.prepared++;
        },
        record() { this.media.start(); },
        getStatus() { return { isRecording: this.media?.state === 'recording' }; },
        async stop() {
          if (!this.getStatus().isRecording) return;
          const data = new Promise(resolve => this.media.addEventListener('dataavailable', e => resolve(e.data), { once: true }));
          this.media.stop();
          const blob = await data;
          window.fixture.recordedBytes = blob.size;
          this.uri = URL.createObjectURL(blob);
          this.oscillator.stop(); this.stream.getTracks().forEach(track => track.stop());
          await this.context.close();
        }
      };
      return ref.current;
    }`,
};

async function fixtureBundle() {
  const result = await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { useEventVoiceInput } from './src/hooks/useEventVoiceInput';
      import { configureApi } from './src/services/api';
      window.fixture = { violations: [], unauthorized: 0, recordedBytes: 0, prepared: 0 };
      document.addEventListener('securitypolicyviolation', e => {
        window.fixture.violations.push({ directive: e.effectiveDirective, blocked: e.blockedURI });
      });
      configureApi(new URLSearchParams(location.search).has('anonymous') ? null : {
        apiBaseUrl: location.origin,
        getAccessToken: async () => 'synthetic-test-identity',
        onUnauthorized: () => { window.fixture.unauthorized++; }
      });
      function Input() {
        const [content, setContent] = useState('Typed draft');
        const voice = useEventVoiceInput(content, setContent, false);
        return React.createElement('main', null,
          React.createElement('textarea', { value: content, readOnly: true }),
          React.createElement('button', { onClick: voice.start }, 'Record'),
          React.createElement('button', { onClick: voice.done }, 'Done'),
          React.createElement('output', { id: 'phase' }, voice.phase),
          React.createElement('p', { role: 'alert' }, voice.error));
      }
      createRoot(document.getElementById('root')).render(React.createElement(Input));
    `, resolveDir: fileURLToPath(new URL('../mobile/', import.meta.url)) },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    // Resolve the mobile package's installed dependencies, independent of parent workspaces.
    alias: Object.fromEntries(['react', 'react-dom', 'scheduler'].map(name =>
      [name, fileURLToPath(new URL(`../mobile/node_modules/${name}`, import.meta.url))])),
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
    plugins: [{ name: 'synthetic-native-adapters', setup(builder) {
      builder.onResolve({ filter: /^(react-native|expo-audio|expo-file-system\/legacy|\.\.\/services\/auth)$/ },
        args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: adapters[args.path], resolveDir: fileURLToPath(new URL('../mobile/', import.meta.url))
      }));
    } }],
  });
  return result.outputFiles[0].text;
}

test('Events voice input: CSP failure is before API; blob correction preserves draft and auth boundaries', { timeout: 120000 }, async t => {
  const script = await fixtureBundle();
  const calls = [];
  const otherWrites = [];
  let apiStatus = 200;
  const consentRequests = [];
  let consentEnabled = true;
  const server = createServer(async (req, res) => {
    // Owner-scoped AI consent, as the hook reads it before any recording.
    const consentOwner = req.url.match(/^\/users\/([^/?]+)\/ai-consent$/)?.[1];
    if (consentOwner) {
      const authorized = req.headers.authorization === 'Bearer synthetic-test-identity';
      consentRequests.push({ method: req.method, authorized, owner: consentOwner });
      const status = req.method !== 'GET' ? 405 : !authorized ? 401 : consentOwner !== 'fixture-owner' ? 403 : 200;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { aiProcessing: consentEnabled } : { error: 'Fixture consent rejected' }));
      return;
    }
    if (req.url === '/speech/transcribe') {
      let body = ''; for await (const chunk of req) body += chunk;
      const audio = JSON.parse(body);
      calls.push({ method: req.method, authorized: req.headers.authorization === 'Bearer synthetic-test-identity',
        mimeType: audio.mimeType, bytes: Buffer.from(audio.audio, 'base64').length });
      res.writeHead(apiStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(apiStatus === 200 ? { text: ' Synthetic transcript. ' } : { error: 'Fixture transcription unavailable' }));
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) otherWrites.push(req.url);
    const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`);
    const response = await worker.fetch(request, { ASSETS: { fetch: async asset => {
      const path = new URL(asset.url).pathname;
      if (path === '/index.html') return new Response('<div id="root"></div><script src="/fixture.js"></script>',
        { headers: { 'Content-Type': 'text/html' } });
      if (path === '/fixture.js') return new Response(script, { headers: { 'Content-Type': 'text/javascript' } });
      return new Response('Not found', { status: 404 });
    } } });
    const headers = Object.fromEntries(response.headers);
    if (new URL(request.url).searchParams.has('old')) {
      // Exact previous policy: remove only the new connect-src token.
      headers['content-security-policy'] = headers['content-security-policy'].replace("connect-src 'self' blob:", "connect-src 'self'");
    }
    res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
  t.after(() => browser.close());
  let externalAttempts = 0;
  let bitrateWarnings = 0;

  async function open(query = '') {
    const page = await browser.newPage();
    page.on('console', message => { if (/clamp.*(?:video|bitrate)|(?:video|bitrate).*clamp/i.test(message.text())) bitrateWarnings++; });
    // Defense in depth: even a broken policy cannot reach any provider.
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      externalAttempts++; return route.abort();
    });
    await page.goto(origin + '/' + query);
    await page.getByRole('button', { name: 'Record', exact: true }).waitFor();
    return page;
  }
  async function record(page) {
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#phase').textContent === 'recording');
    // A short synthetic tone supplies actual encoded audio, not microphone data.
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#phase').textContent === 'idle');
    assert.ok(await page.evaluate(() => window.fixture.recordedBytes > 0));
  }

  await t.test('old policy reproduces Events Failed to fetch, with zero transcription requests', async () => {
    const page = await open('?old');
    try {
      await record(page);
      assert.equal(await page.getByRole('alert').textContent(), 'Failed to fetch');
      assert.equal(await page.locator('textarea').inputValue(), 'Typed draft');
      await page.waitForFunction(() => window.fixture.violations.some(v => v.directive === 'connect-src' && v.blocked === 'blob'));
      assert.equal(calls.length, 0);
    } finally { await page.close(); }
  });
  await t.test('corrected policy transcribes actual browser audio into the draft without saving an Event', async () => {
    const page = await open();
    try {
      await record(page);
      assert.equal(await page.getByRole('alert').textContent(), '');
      assert.equal(await page.locator('textarea').inputValue(), 'Typed draft\nSynthetic transcript.');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].authorized, true);
      assert.equal(calls[0].mimeType, 'audio/webm'); assert.ok(calls[0].bytes > 0);
      assert.deepEqual(await page.evaluate(() => window.fixture.violations), []);
      assert.deepEqual(otherWrites, [], 'dictation must not save Events or other application data');
    } finally { await page.close(); }
  });
  await t.test('disabled AI Processing consent blocks recording and transcription', async () => {
    consentEnabled = false;
    const page = await open();
    try {
      const before = consentRequests.length;
      await page.getByRole('button', { name: 'Record', exact: true }).click();
      await page.waitForFunction(() => /AI Processing must be on/.test(document.querySelector('[role=alert]').textContent) &&
        document.querySelector('#phase').textContent === 'idle');
      assert.deepEqual(consentRequests.slice(before), [{ method: 'GET', authorized: true, owner: 'fixture-owner' }]);
      assert.equal(await page.evaluate(() => window.fixture.prepared), 0, 'no recorder may start without consent');
      assert.equal(calls.length, 1, 'no transcription may be dispatched without consent');
      assert.equal(await page.locator('textarea').inputValue(), 'Typed draft');
    } finally { consentEnabled = true; await page.close(); }
  });
  await t.test('API failure remains visible; draft is preserved independently of the CSP fix', async () => {
    apiStatus = 503;
    const page = await open();
    try {
      await record(page);
      assert.equal(await page.getByRole('alert').textContent(), 'Fixture transcription unavailable');
      assert.equal(await page.locator('textarea').inputValue(), 'Typed draft');
      assert.equal(calls.length, 2);
    } finally { await page.close(); }
  });
  await t.test('missing and expired authentication still reject transcription', async () => {
    apiStatus = 401;
    for (const query of ['?anonymous', '']) {
      const page = await open(query);
      try {
        if (query) {
          // Anonymous: the consent read is rejected locally, before any request or recording.
          const before = consentRequests.length;
          await page.getByRole('button', { name: 'Record', exact: true }).click();
          await page.waitForFunction(() => /[Ss]ign in/.test(document.querySelector('[role=alert]').textContent) &&
            document.querySelector('#phase').textContent === 'idle');
          assert.equal(consentRequests.length, before);
          assert.equal(await page.evaluate(() => window.fixture.prepared), 0);
        } else await record(page);
        assert.match(await page.getByRole('alert').textContent(), /[Ss]ign in/);
        assert.equal(await page.locator('textarea').inputValue(), 'Typed draft');
        assert.equal(calls.length, query ? 2 : 4); // No anonymous request; one refresh on 401.
        assert.equal(await page.evaluate(() => window.fixture.unauthorized), query ? 0 : 1);
      } finally { await page.close(); }
    }
  });
  await t.test('unlisted connections and Insights scripts remain blocked by CSP, before network', async () => {
    const page = await open();
    try {
      assert.equal(await page.evaluate(async () => {
        try { await fetch('https://unlisted.example.invalid/probe'); return false; } catch { return true; }
      }), true);
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = 'https://static.cloudflareinsights.com/beacon.min.js'; document.head.append(script);
      });
      await page.waitForFunction(() => window.fixture.violations.some(v => v.directive === 'connect-src') &&
        window.fixture.violations.some(v => v.directive === 'script-src-elem'));
      assert.equal(externalAttempts, 0, 'CSP must block requests before the fallback interceptor');
    } finally { await page.close(); }
  });
  t.diagnostic(`MediaRecorder bitrate-clamping warnings observed: ${bitrateWarnings}; real audio capture tested above.`);
});
