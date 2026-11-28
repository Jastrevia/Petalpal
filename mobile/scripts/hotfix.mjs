// Ships a JavaScript-only fix to store builds over the air (EAS Update), without a new App Store review.
//
//   npm run hotfix -- "Fix the tarot share button"
//
// The update is bundled here, so it must carry the production settings, never this machine's .env files:
// it loads the EAS "production" environment and runs the same production-only check as a store build
// (release-config.cjs), so an update pointed at the TEST backend stops before anything is published.
// A fresh Metro cache keeps an older API origin from being inlined. Native changes (a new package with
// native code, app.json plugins, permissions) cannot ship this way: they need a new store build and a
// version bump (see docs/operations/INCIDENT_RUNBOOK.md).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('Say what the update fixes:  npm run hotfix -- "Fix the tarot share button"');
  process.exit(1);
}
const cache = mkdtempSync(path.join(tmpdir(), 'petalpal-hotfix-'));
const env = { ...process.env, TMPDIR: cache, PETALPAL_STORE_BUILD: '1' };
// Local settings must not leak into a store update.
for (const key of Object.keys(env)) if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
const run = (args) => spawnSync('npx', ['-y', 'eas-cli@27.9.0', ...args], { cwd: root, env, stdio: 'inherit' });
try {
  const result = run(['update', '--channel', 'production', '--environment', 'production', '--message', message, '--non-interactive']);
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (process.env.SENTRY_AUTH_TOKEN) {
    // Readable stack traces for this update in Sentry (needs SENTRY_ORG and SENTRY_PROJECT too).
    spawnSync('npx', ['sentry-expo-upload-sourcemaps', 'dist'], { cwd: root, env, stdio: 'inherit' });
  }
} finally {
  rmSync(cache, { recursive: true, force: true });
}
