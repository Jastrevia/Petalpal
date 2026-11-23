import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// The Garden ships lossless WebP copies of some PNG artwork: the same pixels in about two thirds of the bytes
// (2026-11-22, a first visit downloads about 3.5 MB less). The PNG stays the source (asset pipelines and their
// hash baselines under Resources/ read it); the app loads the WebP. This keeps the two identical: every runtime
// WebP with a PNG beside it must decode to exactly the same pixels, alpha included.
const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const init = require('canvaskit-wasm/bin/full/canvaskit.js');
const ck = await init({ locateFile: file => path.join(root, 'node_modules/canvaskit-wasm/bin/full', file) });

function pairs(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pairs(full));
    else if (entry.name.endsWith('.webp') && fs.existsSync(full.replace(/\.webp$/, '.png'))) found.push(full);
  }
  return found;
}
const decode = file => {
  const image = ck.MakeImageFromEncoded(fs.readFileSync(file));
  assert.ok(image, `${path.relative(root, file)} decodes`);
  const info = { width: image.width(), height: image.height(), colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB };
  const pixels = image.readPixels(0, 0, info);
  image.delete();
  return { width: info.width, height: info.height, pixels };
};

const copies = [...pairs(path.join(root, 'assets/garden')), ...pairs(path.join(root, 'src/components/garden'))];

test('runtime WebP copies exist for the converted Garden artwork', () => {
  assert.ok(copies.length >= 30, `found ${copies.length}`);
});

test('every runtime WebP copy has exactly its PNG source\'s pixels', () => {
  for (const webp of copies) {
    const a = decode(webp.replace(/\.webp$/, '.png')), b = decode(webp);
    const name = path.relative(root, webp);
    assert.equal(b.width, a.width, name); assert.equal(b.height, a.height, name);
    assert.ok(Buffer.from(a.pixels).equals(Buffer.from(b.pixels)), `${name} differs from its PNG`);
  }
});

test('the app loads the WebP copy, not the PNG, wherever one exists', () => {
  const sources = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full); else if (/\.(ts|tsx)$/.test(e.name)) sources.push(full);
  } };
  walk(path.join(root, 'src'));
  const pngs = new Set(copies.map(file => file.replace(/\.webp$/, '.png')));
  for (const file of sources) {
    if (file.endsWith('nativeRegisteredArtwork.ts')) continue;
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/require\(['"]([^'"]+\.png)['"]\)/g)) {
      const spec = match[1];
      const resolved = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(file), spec);
      assert.ok(!pngs.has(resolved), `${path.relative(root, file)} still requires ${spec}`);
    }
  }
});
