import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

// Launch safety: OTA hotfixes, crash reports and the server's live switches (docs/operations/INCIDENT_RUNBOOK.md).
const require = createRequire(import.meta.url);
const ts = require('typescript');
const src = new URL('../src/', import.meta.url);
const root = new URL('../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');
function load(relative, imports = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(relative, src), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(outputText, { exports, Date, Math, Number, String, JSON, Set, Array, Promise, require: ref => {
    if (ref in imports) return imports[ref];
    throw Error(`unexpected import ${ref}`);
  } });
  return exports;
}
const config = load('services/appConfig.ts', {
  react: { useEffect() {}, useState: v => [typeof v === 'function' ? v() : v, () => {}], useSyncExternalStore() {} },
  'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'ios' } },
  'expo-application': { nativeApplicationVersion: '1.0.1' },
  './api': { apiBaseUrl: () => 'https://api.invalid' },
});

test('versions compare by number, so 1.0.10 is after 1.0.9', () => {
  assert.equal(config.compareVersions('1.0.9', '1.0.10'), -1);
  assert.equal(config.compareVersions('1.1', '1.0.9'), 1);
  assert.equal(config.compareVersions('1.0.0', '1'), 0);
});

test('an installed app older than the server minimum must update; newer, equal or unknown never does', () => {
  const minimum = ios => config.parseAppConfig({ minimumVersion: { ios } });
  assert.equal(config.updateRequired(minimum('1.0.2'), 'ios', '1.0.1'), true);
  assert.equal(config.updateRequired(minimum('1.0.1'), 'ios', '1.0.1'), false);
  assert.equal(config.updateRequired(minimum('1.0.1'), 'ios', '1.2.0'), false);
  assert.equal(config.updateRequired(minimum('9.9.9'), 'web', '1.0.0'), false);
  assert.equal(config.updateRequired(minimum('9.9.9'), 'ios', null), false);
});

test('switches from the server are read defensively: unknown features, bad versions and long text are dropped', () => {
  const parsed = config.parseAppConfig({ maintenance: { blocking: true, message: { 'zh-Hans': '维护中' } },
    minimumVersion: { ios: '1.0.1; drop', android: '2' }, paused: ['petalTarot', 'everything'] });
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), { maintenance: { blocking: true, message: { en: '维护中', 'zh-Hans': '维护中' } },
    minimumVersion: { ios: null, android: '2' }, paused: ['petalTarot'] });
  assert.equal(config.parseAppConfig(null).maintenance, null);
  assert.equal(config.parseAppConfig({ maintenance: { message: { en: 'x'.repeat(2000) } } }).maintenance.message.en.length, 600);
});

test('crash report addresses keep their shape but never whose they are', () => {
  const { scrubUrl } = load('services/monitoringScrub.ts');
  assert.equal(scrubUrl('https://petalpal-v2.onrender.com/users/8f3a2b1c-1d2e-4f5a-9b8c-7d6e5f4a3b2c/flowers/42?token=x'),
    'https://petalpal-v2.onrender.com/users/:id/flowers/:id');
  assert.equal(scrubUrl('/users/clx0abc123def456ghi789jk/journals#top'), '/users/:id/journals');
  assert.equal(scrubUrl('/garden-history'), '/garden-history');
});

test('store builds take OTA hotfixes on the production channel, keyed to the app version; dev builds never do', () => {
  const app = JSON.parse(read('app.json')).expo;
  assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
  assert.equal(app.updates.url, `https://u.expo.dev/${app.extra.eas.projectId}`);
  const eas = JSON.parse(read('eas.json'));
  assert.equal(eas.build.production.channel, 'production');
  assert.match(read('app.config.js'), /dev\?\{\.\.\.config\.updates,enabled:false\}/);
});

test('a hotfix always ships with the production settings and the production-only check', () => {
  const script = read('scripts/hotfix.mjs');
  assert.match(script, /'--channel', 'production', '--environment', 'production'/);
  assert.match(script, /PETALPAL_STORE_BUILD: '1'/);
  assert.match(script, /startsWith\('EXPO_PUBLIC_'\)\) delete env\[key\]/);
});

test('crash reports carry no identity, screenshots, view trees, console lines or bodies; web stays without Sentry', () => {
  const native = read('src/services/monitoring.native.ts');
  for (const rule of [/sendDefaultPii: false/, /attachScreenshot: false/, /attachViewHierarchy: false/, /category === 'console'/, /delete event\.user/, /delete event\.request/])
    assert.match(native, rule);
  assert.match(native, /Boolean\(dsn\) && !__DEV__/);
  assert.doesNotMatch(read('src/services/monitoring.ts'), /@sentry/);
});

test('the root layout starts crash reports, OTA checks and the switch gate', () => {
  const layout = read('src/app/_layout.tsx');
  assert.match(layout, /startMonitoring\(\);/);
  assert.match(layout, /useOtaUpdates\(\);/);
  assert.match(layout, /<AppConfigGate><AuthGate><RoutedContent \/><\/AuthGate><\/AppConfigGate>/);
});
