import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { hookHarness } from './flowerDetail.test.mjs';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/hooks/useEventVoiceInput.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness({ permission = async () => ({ granted: true }), transcribe = async () => 'spoken words', maxLength = 4000, inputName = 'Event', aiProcessing = true, os = 'ios' } = {}) {
  const hooks = hookHarness(); let content = 'Typed'; let tick, background, now = 0;
  const calls = { requests: 0, deleted: [], records: 0 };
  const recorder = { uri: 'file:///temporary.m4a', recording: false,
    prepareToRecordAsync: async () => {}, record(options) { calls.records++; assert.equal(options.forDuration, 180); this.recording = true; },
    getStatus() { return { isRecording: this.recording }; }, stop: async () => { recorder.recording = false; } };
  const deps = {
    react: hooks.react,
    '../services/api': { apiRequest: async path => { assert.equal(path, '/users/owner/ai-consent'); return { aiProcessing }; } },
    'react-native': { Platform: { OS: os }, AppState: { addEventListener: (_, fn) => { background = fn; return { remove() {} }; } } },
    'expo-audio': { useAudioRecorder: () => recorder, RecordingPresets: { HIGH_QUALITY: {} },
      AudioModule: { requestRecordingPermissionsAsync: permission }, setAudioModeAsync: async () => {} },
    '../services/auth': { useAuth: () => ({ session: { user: { id: 'owner' } } }) },
    '../services/speech': { discardRecording: async uri => { calls.deleted.push(uri); },
      transcribeRecording: async (...args) => { calls.requests++; return transcribe(...args); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    AbortController, setTimeout, clearTimeout, Date: { now: () => now },
    setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { tick = null; },
  })(name => { if (!(name in deps)) throw Error(name); return deps[name]; }, module, module.exports);
  let voice = hooks.mount(() => module.exports.useEventVoiceInput(content, text => { content = text; }, false, maxLength, inputName));
  return { calls, recorder, content: () => content, voice: () => voice,
    flush: async () => { voice = await hooks.flush(); return voice; },
    edit: text => { content = text; voice = hooks.render(); },
    limit: () => { now = 180000; tick(); }, background: () => background('background'),
  };
}
test('voice Done appends to latest editable draft and deletes audio without Event submission', async () => {
  let finish;
  const h = harness({ transcribe: () => new Promise(resolve => { finish = resolve; }) });
  await h.voice().start(); await h.flush(); assert.equal(h.voice().phase, 'recording');
  const done = h.voice().done(); await h.flush(); assert.equal(h.voice().phase, 'transcribing');
  h.edit('Edited while uploading'); finish('spoken words'); await done; await h.flush();
  assert.equal(h.content(), 'Edited while uploading\nspoken words');
  assert.equal(h.calls.requests, 1); assert.ok(h.calls.deleted.length); assert.equal(h.voice().active, false);
});
test('voice permission denial and provider errors preserve draft', async () => {
  for (const options of [{ permission: async () => ({ granted: false }) }, { transcribe: async () => { throw Error('Unavailable'); } }]) {
    const h = harness(options); await h.voice().start(); await h.flush();
    if (h.voice().phase === 'recording') await h.voice().done(); await h.flush();
    assert.equal(h.content(), 'Typed'); assert.ok(h.voice().error); assert.equal(h.voice().active, false);
  }
});
test('voice Cancel aborts transcription and ignores its late result', async () => {
  let finish, signal;
  const h = harness({ transcribe: (_, s) => { signal = s; return new Promise(resolve => { finish = resolve; }); } });
  await h.voice().start(); await h.flush(); const done = h.voice().done(); await h.flush();
  await h.voice().cancel(); finish('must not append'); await done; await h.flush();
  assert.equal(signal.aborted, true); assert.equal(h.content(), 'Typed'); assert.ok(h.calls.deleted.length);
});
test('voice stops at three minutes and preserves excess transcript at the text limit', async () => {
  const h = harness({ transcribe: async () => 'extra words' }); h.edit('x'.repeat(3998));
  await h.voice().start(); await h.flush(); h.limit(); await h.flush();
  assert.equal(h.content().length, 4000); assert.equal(h.voice().overflow, 'xtra words');
  assert.equal(h.calls.requests, 1); assert.equal(h.voice().active, false);
});
test('voice background cancellation discards audio without upload', async () => {
  const h = harness(); await h.voice().start(); await h.flush(); h.background(); await h.flush();
  assert.equal(h.calls.requests, 0); assert.equal(h.recorder.recording, false); assert.ok(h.calls.deleted.length);
});

test('Journal dictation preserves draft, limits to 2000, and retains overflow', async () => {
  const h = harness({ maxLength: 2000, inputName: 'journal', transcribe: async () => 'extra words' });
  h.edit('x'.repeat(1998));
  await h.voice().start(); await h.flush(); await h.voice().done(); await h.flush();
  assert.equal(h.content(), 'x'.repeat(1998) + '\ne');
  assert.equal(h.voice().overflow, 'xtra words');
  assert.match(h.voice().error, /journal reached 2000/);
});
test('voice explains AI Processing and browsers that cannot record, before asking for the microphone', async () => {
  let asked = 0;
  const off = harness({ aiProcessing: false, permission: async () => { asked++; return { granted: true }; } });
  await off.voice().start(); await off.flush();
  assert.match(off.voice().error, /AI Processing must be on\. Turn it on in Me → Settings → AI & privacy/);
  assert.equal(asked, 0); assert.equal(off.voice().active, false); assert.equal(off.content(), 'Typed');
  const inApp = harness({ os: 'web' });
  await inApp.voice().start(); await inApp.flush();
  assert.match(inApp.voice().error, /This browser can’t record audio\. Open PetalPal in Safari or Chrome/);
  assert.equal(inApp.calls.records, 0);
});
