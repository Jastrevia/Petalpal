import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const startup = fileURLToPath(new URL('scripts/start-integration-backend.sh', root));

// Run the shipped shell script and real npm start. Only the guard's external
// checks, Prisma invocation and server are synthetic; no provider can be reached.
function runStartup({ guardExit = 0, migrationExit = 0, serverExit = 0, realGuard = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'petalpal-startup-'));
  try {
    mkdirSync(join(directory, 'bin'));
    mkdirSync(join(directory, 'lib'));
    writeFileSync(join(directory, 'user.npmrc'), '');
    writeFileSync(join(directory, 'global.npmrc'), '');
    symlinkSync(process.execPath, join(directory, 'bin/node'));
    symlinkSync(realpathSync(join(dirname(process.execPath), 'npm')), join(directory, 'bin/npm'));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      type: 'module', scripts: { start: JSON.parse(read('package.json')).scripts.start },
    }));
    const record = "import { appendFileSync } from 'node:fs';\n";
    writeFileSync(join(directory, 'lib/integration-environment.js'), realGuard
      ? read('lib/integration-environment.js')
      : record + `appendFileSync('trace', 'guard\\n'); process.exit(${guardExit});\n`);
    writeFileSync(join(directory, 'bin/npx'), `#!/bin/sh
set -e
[ "$*" = 'prisma migrate deploy' ] || exit 99
printf 'migration\\n' >> trace
exit ${migrationExit}
`, { mode: 0o700 });
    writeFileSync(join(directory, 'server.js'), record + `
if (process.env.npm_lifecycle_event !== 'start') process.exit(99);
appendFileSync('trace', 'backend\\n');
process.exit(${serverExit});
`);
    const result = spawnSync('/bin/sh', [startup], {
      cwd: directory, encoding: 'utf8', timeout: 10000,
      // No inherited credentials, dotenv, Node options or npm configuration.
      env: {
        PATH: `${join(directory, 'bin')}:/usr/bin:/bin`,
        npm_config_userconfig: join(directory, 'user.npmrc'), npm_config_globalconfig: join(directory, 'global.npmrc'),
        npm_config_cache: join(directory, 'npm-cache'), npm_config_update_notifier: 'false',
      },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return {
      status: result.status,
      trace: existsSync(join(directory, 'trace')) ? readFileSync(join(directory, 'trace'), 'utf8').trim().split('\n') : [],
    };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('integration startup runs the guard before the existing npm migration and backend sequence', () => {
  assert.deepEqual(runStartup(), { status: 0, trace: ['guard', 'migration', 'backend'] });
});

test('integration startup stops before npm when the guard fails or is inactive', () => {
  assert.deepEqual(runStartup({ guardExit: 78 }), { status: 78, trace: ['guard'] });
  assert.deepEqual(runStartup({ realGuard: true }), { status: 78, trace: [] });
});

test('integration startup stops before the backend when migration fails', () => {
  assert.deepEqual(runStartup({ migrationExit: 7 }), { status: 7, trace: ['guard', 'migration'] });
});

test('integration startup propagates backend failure through npm', () => {
  assert.deepEqual(runStartup({ serverExit: 9 }), { status: 9, trace: ['guard', 'migration', 'backend'] });
});

test('integration startup script is included in the backend image and its allowlisted context', () => {
  assert.match(read('Dockerfile.backend'), /^COPY scripts\/ai-worker\.js scripts\/start-integration-backend\.sh \.\/scripts\/$/m);
  assert.ok(read('Dockerfile.backend.dockerignore').split('\n').includes('!scripts/start-integration-backend.sh'));
  // lib/items.js reads the item catalog at start-up; without it in the image the server cannot start.
  assert.match(read('Dockerfile.backend'), /^COPY data\/items\/catalog\.json \.\/data\/items\/catalog\.json$/m);
  assert.ok(read('Dockerfile.backend.dockerignore').split('\n').includes('!data/items/catalog.json'));
});
