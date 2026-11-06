import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// The optional argument lets this focused test run from a review/scratch directory.
const mobileRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(mobileRoot, 'package.json'));
const ts = require('typescript');
const base = path.join(mobileRoot, 'src/components/auth');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
const compile = name => ts.transpileModule(read(name), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React},
}).outputText;
const timeline = {exports: {}};
vm.runInNewContext(compile('entranceTimeline.ts'), timeline);
const {entranceFrame, entrancePhase, projectEntranceDepth, ENTRANCE_DURATION, ENTRANCE_DEPTH, ENTRANCE_TIMING} = timeline.exports;

assert.equal(ENTRANCE_DURATION, 3700);
for (const [ms, expected] of [
  [0, 'envelope_exiting'], [299, 'envelope_exiting'],
  [300, 'gates_opening'], [1099, 'gates_opening'],
  [1100, 'camera_entering'], [2799, 'camera_entering'],
  [2800, 'handoff'], [3699, 'handoff'], [3700, 'complete'],
]) {
  assert.equal(entrancePhase(ms), expected, `Phase at ${ms} ms`);
  assert.equal(entrancePhase(ms, false), 'idle', 'A stationary preview is idle');
}
assert.equal(entranceFrame(0).envelopeOpacity, 1);
assert.ok(entranceFrame(250).envelopeOpacity > 0 && entranceFrame(250).envelopeOpacity < 1);
assert.equal(entranceFrame(500).envelopeOpacity, 0);
assert.equal(entranceFrame(300).gateAngle, 0);
assert.ok(entranceFrame(1100).gateAngle > 60, 'Gates are wide open (>70%) when camera entry begins');
assert.equal(entranceFrame(1100).sceneScale, 1, 'Camera movement starts smoothly at 1100ms');
assert.ok(entranceFrame(1300).gateAngle < 84 && entranceFrame(1300).sceneScale > 1, 'Gate opening and camera entry overlap smoothly');
assert.equal(entranceFrame(1500).gateAngle, 84, 'The passage finishes opening during early camera entry');
assert.equal(entranceFrame(2800).mist, 0);
assert.equal(entranceFrame(2800).handoffOpacity, 1);
assert.equal(entranceFrame(3700).mist, 1);
assert.equal(entranceFrame(3700).handoffOpacity, 0);
assert.equal(entranceFrame(3700).handoffVeil, 0);
assert.ok(entranceFrame(3250).handoffVeil > 0.2, 'Perspective bridge veil peaks softly mid-handoff');
for (let ms = 0; ms < ENTRANCE_DURATION; ms += 10) {
  const a = entranceFrame(ms), b = entranceFrame(ms + 10);
  assert.ok(b.envelopeOpacity <= a.envelopeOpacity);
  assert.ok(b.gateAngle >= a.gateAngle);
  assert.ok(b.sceneScale >= a.sceneScale, 'Scene scale advances monotonically');
  assert.ok(b.cameraLiftY >= a.cameraLiftY, 'Camera perspective lift advances monotonically');
  assert.ok(b.gateOpacity <= a.gateOpacity, 'Gate opacity clears monotonically as camera passes through entrance');
  assert.ok(b.handoffOpacity <= a.handoffOpacity, 'Handoff opacity dissolves monotonically into the live Garden');
  assert.equal(a.distantScale, a.sceneScale, 'Distant scale matches unified scene scale');
  assert.equal(a.entranceScale, a.sceneScale, 'Entrance scale matches unified scene scale');
  assert.ok(Number.isFinite(a.sceneScale), 'Scene scale stays bounded');
  if (ms <= 2000) assert.equal(a.gateOpacity, 1, 'Gate stays fully visible while opening and entering');
  if (ms >= 2850) assert.equal(a.gateOpacity, 0, 'Gate is completely left behind before perspective handoff completes');
  const reduced = entranceFrame(ms, true);
  assert.equal(reduced.gateAngle, 0);
  assert.equal(reduced.sceneScale, 1);
  assert.equal(reduced.cameraLiftY, 0);
  assert.equal(reduced.entranceScale, 1);
  assert.equal(reduced.distantScale, 1);
  assert.equal('entranceY' in reduced, false, 'The camera has no independent entrance-plane translation');
  assert.equal(reduced.envelopeY, 0);
  assert.equal(reduced.envelopeScale, 1);
}
assert.equal(entranceFrame(300, true).gateOpacity, 1);
assert.ok(entranceFrame(900, true).gateOpacity > 0 && entranceFrame(900, true).gateOpacity < 1);
assert.equal(entranceFrame(1500, true).gateOpacity, 0, 'Reduced motion reveals the garden without rotating gates');
assert.equal(entranceFrame(ENTRANCE_DURATION).gateOpacity, 0, 'Final frame has no gate visible');
assert.equal(entranceFrame(ENTRANCE_DURATION).entranceVisible, 0, 'Final frame is fully inside the garden');

// Unified scene scaling: background, gates, and pillars scale together with identical scale factor
const midway = entranceFrame((ENTRANCE_TIMING.camera[0] + ENTRANCE_TIMING.camera[1]) / 2);
const ending = entranceFrame(ENTRANCE_TIMING.camera[1]);
assert.equal(midway.entranceScale, midway.distantScale, 'Gate and garden scale with identical scale factor at midway');
assert.equal(midway.sceneScale, midway.distantScale);
assert.ok(midway.sceneScale > 1 && midway.sceneScale < (timeline.exports.SCENE_MAX_SCALE || 2.25), 'Midway scale is smooth intermediate value');
assert.equal(ending.entranceScale, ending.distantScale, 'Gate and garden scale with identical scale factor at completion');
assert.equal(ending.sceneScale, timeline.exports.SCENE_MAX_SCALE || 2.25, 'Scale reaches SCENE_MAX_SCALE smoothly');

// Render the real scene with inert element/animation stubs to inspect its actual
// viewport and sprite geometry, including transparent pillar margins.
function sceneGeometry(width, height) {
  const createElement = (type, props, ...children) => ({type, props: {...props, children: children.flat()}});
  const track = options => ({options, interpolate: track});
  const scene = {
    exports: {},
    require(name) {
      if (name === 'react') return {__esModule: true, default: {createElement}, memo: fn => fn, useRef: value => ({current: value})};
      if (name === 'react-native') return {
        Animated: {Image: 'animated-image', View: 'animated-view', multiply: (a, b) => ({a, b})},
        Image: 'image', View: 'view', Platform: {OS: 'web'},
        StyleSheet: {absoluteFill: {}, absoluteFillObject: {}, create: styles => styles},
        useWindowDimensions: () => ({width, height}),
      };
      if (name === './entranceTimeline') return timeline.exports;
      if (/\.(png|jpg|webp)$/.test(name)) return name;
      assert.fail(`Unexpected entrance scene dependency: ${name}`);
    },
  };
  vm.runInNewContext(compile('LoginEntranceScene.tsx'), scene);
  const root = scene.exports.LoginEntranceScene({progress: {interpolate: track}, reduced: false, onReady() {}, onError() {}});
  const nodes = [];
  const visit = node => { if (!node || typeof node !== 'object') return; nodes.push(node); node.props?.children?.forEach(visit); };
  visit(root);
  const flatten = style => Array.isArray(style) ? Object.assign({}, ...style) : style;
  const floralArch = flatten(nodes.find(node => node.props.testID === 'floral-arch')?.props.style);
  assert.ok(floralArch, 'Floral arch is rendered as the primary entrance landmark');
  const leftArch = flatten(nodes.find(node => node.props.testID === 'left-arch')?.props.style);
  const rightArch = flatten(nodes.find(node => node.props.testID === 'right-arch')?.props.style);
  assert.equal(leftArch.transformOrigin.startsWith('22%'), true, 'Left arch anchors to left post');
  assert.equal(rightArch.transformOrigin.startsWith('78%'), true, 'Right arch anchors to right post');
  return {
    unifiedScene: flatten(nodes.find(node => node.props.testID === 'unified-scene-container').props.style),
    plane: flatten(nodes.find(node => node.props.testID === 'entrance-plane').props.style),
    garden: flatten(nodes.find(node => node.props.testID === 'scenic-background' || node.props.source?.endsWith?.('floral_entrance_clean_bg.jpg')).props.style),
    geom: scene.exports.ENTRANCE_GEOMETRY,
  };
}
const project = (coordinate, vanishing, scale) => vanishing + (coordinate - vanishing) * scale;
for (const [width, height] of [[430, 932], [1365, 900]]) {
  const {unifiedScene, plane, garden, geom} = sceneGeometry(width, height);
  const imageScale = Math.max(width / geom.imgWidth, height / geom.imgHeight);
  const offsetX = (width - geom.imgWidth * imageScale) / 2;
  const offsetY = (height - geom.imgHeight * imageScale) / 2;
  const vanish = {
    x: offsetX + geom.vanishX * imageScale,
    y: offsetY + geom.vanishY * imageScale,
  };
  assert.equal(unifiedScene.transformOrigin, `${vanish.x}px ${vanish.y}px`, 'The unified scene container uses the shared camera origin');
  assert.ok(unifiedScene.transform && unifiedScene.transform.some(t => 'scale' in t), 'Unified scene container has scale transform');
  assert.equal(plane.transform, undefined, 'Entrance plane does not have an independent scale transform');
  assert.equal(garden.transform, undefined, 'Garden background does not have an independent scale transform');
  const pathPoint = {x: width * .61, y: height * .76};
  assert.ok(project(pathPoint.x, vanish.x, midway.sceneScale) > pathPoint.x, 'Scenery moves away from the shared vanishing point');
  assert.ok(project(pathPoint.y, vanish.y, midway.sceneScale) > pathPoint.y, 'Foreground path detail approaches as the camera advances');
}

function harness({dev = true, reduced = false, deferReduced = false, callbacks} = {}) {
  let index = 0, writes = 0, accessibilityRemoved = false, accessibilityListener;
  let resolveInitialReduced;
  const initialReduced = new Promise(resolve => { resolveInitialReduced = resolve; });
  if (!deferReduced) resolveInitialReduced(reduced);
  const slots = [], pendingEffects = [], cleanups = [], animations = [], values = [];
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useRef(value) { const i = index++; return slots[i] ?? (slots[i] = {current: value}); },
    useState(value) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], next => { writes++; slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useEffect(callback, deps) {
      const i = index++;
      if (!equalDeps(slots[i], deps)) {
        slots[i] = deps;
        pendingEffects.push(() => { cleanups[i]?.(); cleanups[i] = callback(); });
      }
    },
    useCallback(callback, deps) {
      const i = index++;
      if (!slots[i] || !equalDeps(slots[i].deps, deps)) slots[i] = {callback, deps};
      return slots[i].callback;
    },
  };
  const Animated = {
    Value: class {
      constructor(value) { this.value = value; this.listeners = new Map(); this.listenerId = 0; values.push(this); }
      setValue(value) { this.value = value; for (const listener of this.listeners.values()) listener({value}); }
      addListener(listener) { const id = String(++this.listenerId); this.listeners.set(id, listener); return id; }
      removeListener(id) { this.listeners.delete(id); }
      removeAllListeners() { this.listeners.clear(); }
    },
    timing(value, options) {
      const animation = {
        options,
        start(callback) { this.callback = callback; },
        stop() { this.stopped = true; this.callback?.({finished: false}); },
        advance(ms) { value.setValue(ms); },
        finish() { value.setValue(options.toValue); this.callback?.({finished: true}); },
        staleFinish() { this.callback?.({finished: true}); },
      };
      animations.push(animation);
      return animation;
    },
  };
  const context = {
    exports: {}, __DEV__: dev,
    setTimeout() { assert.fail('The cinematic must not use delayed Garden mount/navigation timers'); },
    clearTimeout() {},
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return {
        Animated, Easing: {linear: value => value},
        AccessibilityInfo: {
          isReduceMotionEnabled: () => initialReduced,
          addEventListener: (_, listener) => { accessibilityListener = listener; return {remove() { accessibilityRemoved = true; }}; },
        },
      };
      if (name === './entranceTimeline') return timeline.exports;
      assert.fail(`Unexpected dependency in preview cinematic: ${name}`);
    },
  };
  vm.runInNewContext(compile('useLoginEntrance.ts'), context);
  const render = () => {
    index = 0;
    const api = context.exports.useLoginEntrance(callbacks);
    pendingEffects.splice(0).forEach(effect => effect());
    return api;
  };
  return {
    render, animations, values,
    writes: () => writes,
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
    accessibilityRemoved: () => accessibilityRemoved,
    changeReduced: value => accessibilityListener?.(value),
    resolveReduced: value => resolveInitialReduced(value),
  };
}
async function readyHarness(options) {
  const h = harness(options);
  let api = h.render();
  await Promise.resolve();
  api.assetsReady();
  api = h.render();
  assert.equal(api.ready, true, 'Decoded assets immediately enable the DEV preview');
  assert.equal('gardenMounted' in api, false, 'The preview does not pre-mount the real Garden');
  return [h, api];
}

let h = harness(), api = h.render();
assert.equal(api.phase, 'idle');
api.play();
assert.equal(h.animations.length, 0, 'Wait for gate and background decoding');
[h, api] = await readyHarness();
api.play(); api.play();
assert.equal(h.animations.length, 1, 'Repeated success clicks start only one timeline');
assert.equal(h.animations[0].options.duration, ENTRANCE_DURATION);
assert.equal(h.animations[0].options.useNativeDriver, true);
for (const [ms, phase] of [[0, 'envelope_exiting'], [300, 'gates_opening'], [1100, 'camera_entering'], [2800, 'handoff']]) {
  h.animations[0].advance(ms);
  assert.equal(h.render().phase, phase, 'UI phase follows the Animated clock');
  assert.equal(h.render().active, true);
  const before = h.writes();
  h.animations[0].advance(ms + 1);
  h.animations[0].advance(ms + 2);
  assert.equal(h.writes(), before, 'Frames inside one phase do not trigger React state updates');
}
h.animations[0].finish();
api = h.render();
assert.equal(api.phase, 'complete');
assert.equal(api.entered, true);
assert.equal(api.active, false);
api.play();
assert.equal(h.animations.length, 1, 'Completion stays stable until Reset or Replay');

// Verify handoff callbacks across 6 repeated playback cycles, mid-run reset, and seek isolation
let starts = 0, completes = 0, resets = 0;
[h, api] = await readyHarness({
  callbacks: {
    onStart: () => { starts++; },
    onComplete: () => { completes++; },
    onReset: () => { resets++; },
  },
});
for (let cycle = 1; cycle <= 6; cycle++) {
  api = h.render();
  api.play();
  api.play(); // duplicate click ignored
  assert.equal(starts, cycle, `Cycle ${cycle}: onStart fires exactly once`);
  h.animations[cycle - 1].advance(1400);
  h.animations[cycle - 1].finish();
  assert.equal(completes, cycle, `Cycle ${cycle}: onComplete fires exactly once`);
  api = h.render();
  assert.equal(api.phase, 'complete');
  api.reset();
  assert.equal(resets, cycle, `Cycle ${cycle}: onReset fires when resetting from completed entrance`);
  assert.equal(h.render().phase, 'idle');
}

[h, api] = await readyHarness();
api.play();
const oldRun = h.animations[0];
oldRun.advance(1800);
api = h.render(); api.reset();
assert.equal(api.progress.value, 0);
assert.equal(h.render().phase, 'idle');
oldRun.staleFinish();
assert.equal(h.render().phase, 'idle', 'A cancelled callback cannot complete a reset preview');
api = h.render(); api.play();
assert.equal(h.animations.length, 2, 'Reset permits replay');
h.animations[1].advance(1800);
oldRun.staleFinish();
assert.equal(h.render().phase, 'camera_entering', 'A previous run cannot complete the current run');
h.animations[1].finish();
assert.equal(h.render().phase, 'complete');

[h, api] = await readyHarness();
api.play();
api.seek(950);
assert.equal(api.progress.value, 950);
assert.equal(h.render().phase, 'gates_opening');
h.animations[0].staleFinish();
assert.equal(h.render().phase, 'gates_opening', 'Inspecting a still invalidates an earlier run');
api = h.render(); api.reset();
assert.equal(h.render().phase, 'idle');

[h, api] = await readyHarness();
api.play();
h.unmount();
const writesAfterUnmount = h.writes();
h.animations[0].staleFinish();
assert.equal(h.writes(), writesAfterUnmount, 'Unmounted completion cannot update state');
assert.equal(h.animations[0].stopped, true);
assert.ok(h.values.every(value => value.listeners.size === 0), 'Animated listeners are removed on unmount');
assert.equal(h.accessibilityRemoved(), true);

[h, api] = await readyHarness({dev: false});
api.play(); api.seek(950);
assert.equal(h.animations.length, 0, 'Release builds cannot simulate login success');
assert.equal(api.progress.value, 0, 'Release builds cannot inspect cinematic stills');

[h, api] = await readyHarness();
api.assetError();
api = h.render();
assert.equal(api.failedAsset, true);
assert.equal(api.ready, false);
api.play();
assert.equal(h.animations.length, 0, 'Missing art prevents starting the sequence');

[h, api] = await readyHarness({reduced: true});
assert.equal(api.reduced, true, 'Initial OS preference is honored');
h.changeReduced(false);
assert.equal(h.render().reduced, false, 'Changes to OS preference are observed');
h.unmount();

h = harness({deferReduced: true});
api = h.render(); api.assetsReady();
api = h.render(); api.play();
h.animations[0].advance(900);
assert.equal(h.render().phase, 'gates_opening');
h.resolveReduced(true);
await Promise.resolve();
api = h.render();
assert.equal(api.reduced, true, 'A delayed initial OS preference is applied');
assert.equal(api.phase, 'idle', 'Resolving reduced motion cancels an in-flight normal-motion preview');
assert.equal(api.active, false);
assert.equal(api.progress.value, 0);
assert.equal(h.animations[0].stopped, true);
h.animations[0].staleFinish();
assert.equal(h.render().phase, 'idle', 'Cancelled normal-motion completion cannot hand off later');
h.unmount();

h = harness({deferReduced: true});
api = h.render(); api.assetsReady();
h.changeReduced(true);
api = h.render();
assert.equal(api.reduced, true);
api.play();
h.animations[0].advance(1800);
const writesBeforeLatePreference = h.writes();
h.resolveReduced(false);
await Promise.resolve();
api = h.render();
assert.equal(api.reduced, true, 'A newer OS event supersedes the stale initial preference result');
assert.equal(api.phase, 'camera_entering', 'The stale initial result cannot cancel a newer preview');
assert.equal(h.writes(), writesBeforeLatePreference, 'The stale result performs no React state writes');
h.unmount();

h = harness({deferReduced: true});
h.render(); h.unmount();
const writesBeforeUnmountedPreference = h.writes();
h.resolveReduced(true);
await Promise.resolve();
assert.equal(h.writes(), writesBeforeUnmountedPreference, 'An initial OS preference resolved after unmount is ignored');

const page = read('LoginPreviewPage.tsx');
const submitStart = page.indexOf('const handleLoginSubmit');
const submitEnd = page.indexOf('// Forgot password', submitStart);
assert.ok(submitStart >= 0 && submitEnd > submitStart, 'Inspect the complete form-submit handler');
const submit = page.slice(submitStart, submitEnd);
assert.ok(!/entrance\.play|setTimeout|verified/i.test(submit), 'Form input does not pretend to authenticate');
assert.ok(!/fetch\(|localStorage|AsyncStorage/.test(submit), 'Submitting the mock form sends or persists no credentials');
assert.ok(!/GardenExperience|gardenMounted/.test(page), 'The preview does not mount a duplicate Garden inside LoginPreviewPage');
const host = read('LoginEntranceTransitionHost.tsx');
const playerPreviewRoute = fs.readFileSync(new URL('../src/app/player-preview.tsx', import.meta.url), 'utf8');
assert.ok(/router\.replace\('\/player-preview'\)/.test(host), 'Transition host navigates to /player-preview once');
assert.ok(/router\.replace\('\/login-preview'\)/.test(host), 'Transition host returns to /login-preview on reset');
assert.equal((host.match(/<GardenExperience\s+mode="player"\s*\/>/g) || []).length, 1, 'Transition host mounts exactly one retained GardenExperience instance');
assert.ok(/useIsHostedByLoginTransition/.test(playerPreviewRoute), 'player-preview route delegates to the hosted Garden instance when inside LoginEntranceTransitionHost');
console.log('Login cinematic & Garden handoff: phases, overlapping gate-opening and camera entry, perspective lift & dissolve, single-Garden route handoff, 6-cycle replay, reduced motion and preference races, immediate asset readiness, duplicate clicks, stale callback cancellation, still inspection, unmount cleanup, DEV isolation and non-authenticating form passed.');
