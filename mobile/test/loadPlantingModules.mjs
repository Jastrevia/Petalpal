import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
export function loadPlantingModules(storage, react, nativeStorage, web = true, dependencies = {}, development = false) {
  const cache = new Map();
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../src/components/garden/planting');
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    if (file.endsWith('.json')) {
      module.exports = JSON.parse(fs.readFileSync(file, 'utf8'));
      return module.exports;
    }
    const requireLocal = (request) => {
      if (request in dependencies) return dependencies[request];
      if (request === 'react' && react) return react;
      if (request === 'expo-router' && react) return { useFocusEffect: (fn) => react.useEffect(fn, [fn]) };
      if (request === '@react-native-async-storage/async-storage') return nativeStorage ?? {};
      if (request.startsWith('@/assets/') || /\.(png|webp)$/.test(request)) return request;
      if (request.startsWith('.')) {
        let target = path.resolve(path.dirname(file), request);
        if (!path.extname(target)) target += fs.existsSync(target + '.ts') ? '.ts' : '.tsx';
        return load(target);
      }
      return require(request);
    };
    const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const run = vm.runInNewContext('(function(exports, require, module) {\n' + outputText + '\n})', {
      ...(web ? { localStorage: storage, window: { localStorage: storage } } : {}), console, Uint8Array, URL,
      process: { env: dependencies.env ?? {} }, __DEV__: development, fetch: dependencies.fetch ?? globalThis.fetch,
      ...(dependencies.globalThis ? { globalThis: dependencies.globalThis } : {}),
      ...(dependencies.runtimeGlobals ?? {}),
    }, { filename: file });
    run(module.exports, requireLocal, module);
    return module.exports;
  }
  return (name) => {
    const file = path.join(directory, name);
    return load(file + (fs.existsSync(file + '.ts') ? '.ts' : '.tsx'));
  };
}
