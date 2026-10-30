// Builds PetalPal Dev onto a connected iPhone with free (Personal Team) signing. docs/usability-testing.md explains the steps.
//   npm run ios:device            Debug with hot reload, TEST backend by default (.env.ios.development)
//   npm run ios:device:release    Release for testers, runs without the Mac (.env.ios.usability-test)
// Extra arguments after `--` go to `expo run:ios`, e.g. npm run ios:device:release -- --device "Xingran's iPhone".
// Prints no configuration values.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv, parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { DEV_BUNDLE_ID, devBundleId } = createRequire(import.meta.url)('../release-config.cjs');
export const PRODUCTION_API_HOST = 'petalpal-v2.onrender.com';
export const PRODUCTION_FIREBASE_PROJECT = 'petalpal-b212c';
const REQUIRED = ['EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_FIREBASE_API_KEY', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_APP_ID'];
const XCODE_MINIMUM = [26, 4];

// The checked environment for one build; throws with a message naming keys only.
export function buildEnvironment(fileValues, inherited, envName) {
  const missing = REQUIRED.filter(key => !fileValues[key]?.trim());
  if (missing.length) throw new Error(`.env.ios.${envName} is missing: ${missing.join(', ')}`);
  let api;
  try { api = new URL(fileValues.EXPO_PUBLIC_API_BASE_URL); } catch { throw new Error('EXPO_PUBLIC_API_BASE_URL is not a valid URL'); }
  if (envName === 'usability-test') {
    if (api.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(api.hostname)) throw new Error('The usability-test backend must be a hosted HTTPS service');
    if (api.hostname === PRODUCTION_API_HOST) throw new Error('The usability-test build cannot use the production API');
    if (fileValues.EXPO_PUBLIC_FIREBASE_PROJECT_ID === PRODUCTION_FIREBASE_PROJECT) throw new Error('The usability-test build cannot use the production Firebase project');
  }
  // Only this file's public values reach the app: nothing inherited from the shell, no store-build settings.
  const clean = Object.fromEntries(Object.entries(inherited).filter(([key]) =>
    !key.startsWith('EXPO_PUBLIC_') && !['EAS_BUILD_PROFILE', 'PETALPAL_STORE_BUILD', 'PETALPAL_IOS_BUNDLE_ID'].includes(key)));
  const publicValues = Object.fromEntries(Object.entries(fileValues).filter(([key]) => key.startsWith('EXPO_PUBLIC_') || key === 'PETALPAL_IOS_DEV_BUNDLE_ID'));
  return { ...clean, ...publicValues, EXPO_PUBLIC_APP_VARIANT: 'dev', EXPO_NO_DOTENV: '1' };
}

export function xcodeProblem(versionText) {
  const match = /Xcode (\d+)\.?(\d+)?/.exec(versionText ?? '');
  if (!match) return 'Xcode is not installed. Install it from the Mac App Store (it needs a recent macOS), open it once and add the iOS platform.';
  const [major, minor] = [Number(match[1]), Number(match[2] ?? 0)];
  if (major < XCODE_MINIMUM[0] || (major === XCODE_MINIMUM[0] && minor < XCODE_MINIMUM[1])) return `Expo SDK 57 needs Xcode ${XCODE_MINIMUM.join('.')} or later; found ${major}.${minor}.`;
  return null;
}

function run(command, args, env, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const { values } = parseArgs({ allowPositionals: true, strict: false,
    options: { env: { type: 'string' }, configuration: { type: 'string' } } });
  const envName = values.env, configuration = values.configuration;
  if (!['development', 'usability-test'].includes(envName) || !['Debug', 'Release'].includes(configuration)) {
    throw new Error('Use --env development|usability-test and --configuration Debug|Release');
  }
  const file = path.join(root, `.env.ios.${envName}`);
  if (!fs.existsSync(file)) throw new Error(`Create ${path.basename(file)} from ${path.basename(file)}.example first`);
  const env = buildEnvironment(parseEnv(fs.readFileSync(file, 'utf8')), process.env, envName);

  const xcode = spawnSync('xcodebuild', ['-version'], { encoding: 'utf8' });
  const problem = xcodeProblem(xcode.status === 0 ? xcode.stdout : '');
  if (problem) throw new Error(problem);
  if (spawnSync('pod', ['--version'], { stdio: 'ignore' }).status !== 0) throw new Error('CocoaPods is not installed. Run: brew install cocoapods');

  // ios/ is generated (CNG) and holds the bundle ID, so it is rebuilt when this build's differs. Prebuild rewrites the
  // package.json scripts; they are put back so a build never leaves a change to commit.
  const bundleId = devBundleId(env), stamp = path.join(root, 'ios', '.petalpal-bundle-id');
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8').trim() !== bundleId) {
    const manifest = path.join(root, 'package.json'), saved = fs.readFileSync(manifest);
    try { run('npx', ['expo', 'prebuild', '--platform', 'ios', '--clean'], env); }
    finally { fs.writeFileSync(manifest, saved); }
    fs.writeFileSync(stamp, `${bundleId}\n`);
  }
  // EXPO_PUBLIC_ values are inlined and Metro's cache can keep old ones, so a Release build starts from an empty cache.
  // A Debug build keeps one cache per environment, for speed.
  const cache = configuration === 'Release' ? fs.mkdtempSync(path.join(os.tmpdir(), 'petalpal-ios-release-'))
    : path.join(os.tmpdir(), `petalpal-ios-${envName}`);
  fs.mkdirSync(cache, { recursive: true });
  console.log(`PetalPal Dev · ${configuration} · ${envName} · ${bundleId}${bundleId === DEV_BUNDLE_ID ? '' : ' (custom)'}`);
  const extra = passthrough();
  run('npx', ['expo', 'run:ios', ...(extra.includes('--device') ? [] : ['--device']), '--configuration', configuration, ...extra], { ...env, TMPDIR: cache });
}
// Everything after our own two options, unchanged (a device name may contain spaces).
function passthrough() {
  const args = process.argv.slice(2), out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' || args[i] === '--configuration') { i++; continue; }
    if (args[i] !== '--') out.push(args[i]);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
