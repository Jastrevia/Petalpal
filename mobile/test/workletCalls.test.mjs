import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// On a phone, the callbacks given to Reanimated's hooks run on the UI thread. A plain function they call
// there throws, and in a release build that kills the app (TestFlight 1.0 (3), 2026-11-23: the pet ring's
// feed panel called `arcOffset`, which had no 'worklet' line, and every tap on Feed closed the app). The web
// runs the same callbacks on the JS thread, so no web test catches it. This finds every function imported
// from our own files and called inside such a callback, and asks that it be a worklet.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const files = [];
const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) walk(full); else if (/\.tsx?$/.test(e.name) && !/\.web\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(full);
} };
walk(src);

// Gesture callbacks (Gesture.Pan().onUpdate(...)) run on the UI thread too.
const HOOK = /(\buseDerivedValue|\buseAnimatedStyle|\buseAnimatedReaction|\buseAnimatedProps|\buseFrameCallback|\.onBegin|\.onStart|\.onUpdate|\.onChange|\.onEnd|\.onFinalize|\.onTouchesDown|\.onTouchesMove|\.onTouchesUp|\.onTouchesCancelled)\(/g;
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}
function resolve(from, spec) {
  const base = spec.startsWith('@/') ? path.join(src, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}
function isWorklet(file, name) {
  const text = fs.readFileSync(file, 'utf8');
  const def = new RegExp(`(?:function\\s+${name}\\s*[(<]|(?:const|let)\\s+${name}\\s*(?::[^=]+)?=)`).exec(text);
  if (!def) return null; // re-exported or not a function: not ours to judge here
  return /['"]worklet['"]/.test(text.slice(def.index, def.index + 300));
}

test('every own function called from a UI-thread callback is a worklet', () => {
  const problems = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const imports = new Map();
    for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"]((?:\.{1,2}\/|@\/)[^'"]+)['"]/g)) {
      const target = resolve(file, m[2]);
      if (!target) continue;
      for (const part of m[1].split(',')) {
        const [orig, alias] = part.replace(/\btype\s+/, '').trim().split(/\s+as\s+/);
        if (orig) imports.set((alias || orig).trim(), { target, name: orig.trim() });
      }
    }
    for (const m of text.matchAll(HOOK)) {
      // A gesture built with .runOnJS(true) runs its callbacks on the JS thread.
      if (m[1].startsWith('.')) {
        const start = text.lastIndexOf('Gesture.', m.index), end = text.indexOf(';', m.index);
        if (start >= 0 && /\.runOnJS\(true\)/.test(text.slice(start, end < 0 ? undefined : end))) continue;
      }
      const body = balanced(text, m.index + m[0].length - 1);
      for (const call of body.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const imported = imports.get(call[1]);
        if (!imported) continue;
        if (isWorklet(imported.target, imported.name) === false)
          problems.push(`${path.relative(root, file)}: ${m[1]} calls ${call[1]} (${path.relative(root, imported.target)}) without 'worklet'`);
      }
    }
  }
  assert.deepEqual([...new Set(problems)], []);
});
