import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const source = fs.readFileSync(new URL('../src/components/garden/webNativeHandles.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

// Simulates iOS: classes defined while Symbol.dispose was missing, symbol added later.
test('dispose survives a Symbol.dispose that appears after Skia classes load', () => {
  const fakeSymbol = Object.assign(function (d) { return Symbol(d); }, { for: Symbol.for });
  const context = { exports: {}, Symbol: fakeSymbol, WeakSet, FinalizationRegistry };
  vm.runInNewContext(`
    class Base { constructor(ref){ this.ref = ref; } dispose(){ this[Symbol.dispose](); } [Symbol.dispose](){ this.ref.delete(); } }
    class Surface extends Base { [Symbol.dispose](){ this.ref.dispose(); } }
    exports.Base = Base; exports.Surface = Surface;`, context);
  const { Base, Surface } = context.exports;
  fakeSymbol.dispose = Symbol('late');
  const deleted = [];
  const handle = name => ({ delete: () => deleted.push(name), dispose: () => deleted.push(name + ':dispose'), isDeleted: () => false });
  assert.throws(() => new Base(handle('before')).dispose(), /not a function/, 'reproduces the iOS failure');
  const api = { exports: {} };
  vm.runInNewContext(code, { exports: api.exports, Symbol: fakeSymbol, WeakSet, FinalizationRegistry });
  api.exports.configureGardenWebDispose([Base.prototype]);
  new Base(handle('base')).dispose();
  new Surface(handle('surface')).dispose();
  new Base({ delete: () => deleted.push('raw'), isDeleted: () => false }).dispose();
  assert.deepEqual(deleted, ['base', 'surface:dispose', 'raw']);
});

test('the polyfill defines the well-known disposal symbols only when missing', () => {
  const fakeSymbol = Object.assign(function (d) { return Symbol(d); }, {});
  const polyfill = fs.readFileSync(new URL('../src/polyfills/symbolDispose.js', import.meta.url), 'utf8');
  vm.runInNewContext(polyfill, { Symbol: fakeSymbol, Object });
  assert.equal(typeof fakeSymbol.dispose, 'symbol'); assert.equal(typeof fakeSymbol.asyncDispose, 'symbol');
  const native = Symbol.dispose;
  vm.runInNewContext(polyfill, { Symbol, Object });
  assert.equal(Symbol.dispose, native, 'native symbol untouched');
});

// A friend's Garden closing can release an image another root still draws this frame.
test('drawing a released image skips that draw instead of crashing the page', () => {
  const api = { exports: {} };
  const scope = { exports: api.exports, Symbol, WeakSet, FinalizationRegistry, globalThis: {} };
  scope.globalThis = scope;
  vm.runInNewContext(code, scope);
  const drawn = [];
  class Canvas {
    drawImage(image) { if (image.ref.isDeleted()) throw Error('Cannot pass deleted object as a pointer of type Image const*'); drawn.push(image.name); }
    drawImageRect(image) { this.drawImage(image); }
  }
  class Image { constructor(name, deleted) { this.name = name; this.ref = { isDeleted: () => deleted }; }
    width() { if (this.ref.isDeleted()) throw Error('Cannot pass deleted object as a pointer of type Image const*'); return 300; }
    height() { return this.width() / 2; }
    makeShaderOptions() { if (this.ref.isDeleted()) throw Error('deleted'); return 'shader:' + this.name; } }
  assert.throws(() => new Canvas().drawImage(new Image('gone', true)), /deleted object/, 'reproduces the crash');
  api.exports.configureGardenWebDeletedImageGuard(Canvas.prototype, Image.prototype, () => 'transparent');
  const canvas = new Canvas();
  canvas.drawImage(new Image('live', false));
  canvas.drawImage(new Image('gone', true));
  canvas.drawImageRect(new Image('gone too', true));
  assert.deepEqual(drawn, ['live']);
  assert.equal(new Image('live', false).makeShaderOptions(), 'shader:live');
  assert.equal(new Image('gone', true).makeShaderOptions(), 'transparent');
  // ImageShader reads the size first (the crash seen when coming back from a friend's Garden).
  assert.equal(new Image('live', false).width(), 300);
  assert.equal(new Image('gone', true).width(), 1);
  assert.equal(new Image('gone', true).height(), 1);
  assert.equal(scope.__gardenSkippedImages, 5);
});
