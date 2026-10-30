import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildEnvironment, xcodeProblem } from '../scripts/ios-device.mjs';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const require = createRequire(import.meta.url);
const appConfig = require('../app.config.js'), appJson = require('../app.json'), packageJson = require('../package.json');
const { DEV_BUNDLE_ID } = require('../release-config.cjs');
const configWith = values => {
  const saved = { ...process.env };
  for (const key of ['EXPO_PUBLIC_APP_VARIANT', 'PETALPAL_IOS_DEV_BUNDLE_ID', 'PETALPAL_IOS_BUNDLE_ID', 'EAS_BUILD_PROFILE', 'PETALPAL_STORE_BUILD']) delete process.env[key];
  Object.assign(process.env, values);
  try { return appConfig({ config: appJson.expo }); }
  finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
};

test('dev variant has its own name, scheme and bundle ID; the store app is unchanged', () => {
  const store = configWith({ PETALPAL_IOS_BUNDLE_ID: 'com.jastrevia.petalpal' });
  assert.equal(store.name, 'PetalPal'); assert.equal(store.scheme, 'mobile'); assert.equal(store.ios.bundleIdentifier, 'com.jastrevia.petalpal');
  const dev = configWith({ EXPO_PUBLIC_APP_VARIANT: 'dev', PETALPAL_IOS_BUNDLE_ID: 'com.jastrevia.petalpal' });
  assert.equal(dev.name, 'PetalPal Dev'); assert.equal(dev.scheme, 'petalpal-dev'); assert.equal(dev.ios.bundleIdentifier, DEV_BUNDLE_ID);
  assert.notEqual(dev.ios.bundleIdentifier, store.ios.bundleIdentifier);
  assert.equal(configWith({ EXPO_PUBLIC_APP_VARIANT: 'dev', PETALPAL_IOS_DEV_BUNDLE_ID: 'com.example2.petalpal.dev' }).ios.bundleIdentifier, 'com.example2.petalpal.dev');
  assert.throws(() => configWith({ EXPO_PUBLIC_APP_VARIANT: 'dev', PETALPAL_IOS_DEV_BUNDLE_ID: 'not valid' }), /Invalid/);
  assert.throws(() => configWith({ EXPO_PUBLIC_APP_VARIANT: 'staging' }), /unset or "dev"/);
  assert.throws(() => configWith({ EXPO_PUBLIC_APP_VARIANT: 'dev', PETALPAL_STORE_BUILD: '1' }), /cannot be a store build/);
  assert.throws(() => configWith({ EXPO_PUBLIC_APP_VARIANT: 'dev', EAS_BUILD_PROFILE: 'production' }), /cannot be a store build/);
});

test('free signing: the app declares no capability a Personal Team cannot sign', () => {
  assert.equal(appJson.expo.ios.entitlements, undefined);
  assert.equal(appJson.expo.ios.associatedDomains, undefined);
  assert.equal(appJson.expo.ios.usesAppleSignIn, undefined);
  assert.equal(appJson.expo.ios.usesIcloudStorage, undefined);
  for (const name of ['expo-notifications', 'expo-apple-authentication', 'expo-in-app-purchases', 'react-native-iap', 'expo-background-task', 'expo-maps']) {
    assert.equal(packageJson.dependencies[name], undefined, name);
  }
  const plugins = appJson.expo.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin);
  assert.equal(plugins.includes('expo-sharing'), false, 'its plugin adds a share extension and App Group');
});

const TEST_SET = { EXPO_PUBLIC_API_BASE_URL: 'https://backend.test.invalid', EXPO_PUBLIC_FIREBASE_API_KEY: 'synthetic-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'fixture.test.invalid', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'fixture', EXPO_PUBLIC_FIREBASE_APP_ID: 'fixture-app' };

test('device build environment: a complete, matched set; never production for testers; nothing inherited', () => {
  const env = buildEnvironment(TEST_SET, { PATH: '/bin', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'inherited', EAS_BUILD_PROFILE: 'production', PETALPAL_IOS_BUNDLE_ID: 'x.y' }, 'usability-test');
  assert.equal(env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, 'fixture'); assert.equal(env.PATH, '/bin');
  assert.equal(env.EXPO_PUBLIC_APP_VARIANT, 'dev'); assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.EAS_BUILD_PROFILE, undefined); assert.equal(env.PETALPAL_IOS_BUNDLE_ID, undefined);
  assert.equal(buildEnvironment({ ...TEST_SET, PETALPAL_IOS_DEV_BUNDLE_ID: 'com.example2.petalpal.dev', OTHER: 'ignored' }, {}, 'development').PETALPAL_IOS_DEV_BUNDLE_ID, 'com.example2.petalpal.dev');
  assert.equal(buildEnvironment({ ...TEST_SET, OTHER: 'ignored' }, {}, 'development').OTHER, undefined);
  // A missing Firebase value would silently fall back to the production project.
  for (const key of Object.keys(TEST_SET)) assert.throws(() => buildEnvironment({ ...TEST_SET, [key]: '' }, {}, 'usability-test'), new RegExp(key));
  assert.throws(() => buildEnvironment({ ...TEST_SET, EXPO_PUBLIC_API_BASE_URL: 'https://petalpal-v2.onrender.com' }, {}, 'usability-test'), /production API/);
  assert.throws(() => buildEnvironment({ ...TEST_SET, EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'petalpal-b212c' }, {}, 'usability-test'), /production Firebase/);
  assert.throws(() => buildEnvironment({ ...TEST_SET, EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000' }, {}, 'usability-test'), /hosted HTTPS/);
  assert.doesNotThrow(() => buildEnvironment({ ...TEST_SET, EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000' }, {}, 'development'));
  try { buildEnvironment({ ...TEST_SET, EXPO_PUBLIC_API_BASE_URL: '' }, {}, 'development'); } catch (error) { assert.equal(error.message.includes('synthetic-key'), false); }
  for (const name of ['development', 'usability-test']) assert.match(fs.readFileSync(new URL(`../.env.ios.${name}.example`, import.meta.url), 'utf8'), /petalpal-backend-test/);
});

test('Xcode check matches Expo SDK 57', () => {
  assert.match(xcodeProblem(''), /not installed/);
  assert.match(xcodeProblem('Xcode 16.2\nBuild version 1'), /26\.4/);
  assert.match(xcodeProblem('Xcode 26.3'), /26\.4/);
  assert.equal(xcodeProblem('Xcode 26.4\nBuild version 1'), null);
  assert.equal(xcodeProblem('Xcode 27.2'), null);
});

function resetModule(env, fakes) {
  return loadPlantingModules(undefined, undefined, {}, false, { env, ...fakes })('../../../services/deviceReset');
}

test('device reset only exists in the dev variant', () => {
  assert.equal(resetModule({}).devVariant, false);
  assert.equal(resetModule({ EXPO_PUBLIC_APP_VARIANT: 'store' }).devVariant, false);
  assert.equal(resetModule({ EXPO_PUBLIC_APP_VARIANT: 'dev' }).devVariant, true);
});

test('device reset signs out first, then clears storage, images and cached files; a failure does not stop the rest', async () => {
  const log = [];
  const fakes = {
    '@react-native-async-storage/async-storage': { default: { clear: async () => log.push('storage') } },
    'expo-image': { Image: { clearDiskCache: async () => log.push('disk'), clearMemoryCache: async () => log.push('memory') } },
    'expo-file-system/legacy': { cacheDirectory: 'cache/', readDirectoryAsync: async () => ['a.m4a', 'b.png'], deleteAsync: async uri => log.push(uri) },
  };
  const { deviceResetSteps, runDeviceReset } = resetModule({ EXPO_PUBLIC_APP_VARIANT: 'dev' }, fakes);
  const logout = async () => log.push('logout');
  const result = await runDeviceReset(deviceResetSteps(logout, true));
  assert.equal(result.ok, true);
  assert.deepEqual([...log], ['logout', 'storage', 'disk', 'memory', 'cache/a.m4a', 'cache/b.png']);
  log.length = 0;
  await runDeviceReset(deviceResetSteps(logout, false));
  assert.equal(log.includes('logout'), false, 'a guest has no session to end');
  log.length = 0;
  const partial = await runDeviceReset(deviceResetSteps(async () => { throw new Error('offline'); }, true));
  assert.deepEqual([...partial.failed], ['session']); assert.equal(partial.ok, false);
  assert.equal(log.includes('storage'), true, 'storage is still cleared after a failed sign-out');
});
