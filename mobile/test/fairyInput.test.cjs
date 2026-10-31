const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const directory = path.join(__dirname, '../src/components/garden');
const compile = code => ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const networkModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(directory, 'fairy/walkNetwork.ts'), 'utf8')),
  { module: networkModule, exports: networkModule.exports });
const { WALK_NETWORK, WALK_START, route, nearest, distance } = networkModule.exports;

// Execute the actual scene handlers without mounting the unrelated Garden artwork.
const scene = ts.createSourceFile('GardenScene.tsx', fs.readFileSync(path.join(directory, 'GardenScene.tsx'), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function expression(name) {
  let result;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === name) result = node.initializer.expression.getText(scene);
    ts.forEachChild(node, visit);
  }
  visit(scene); assert.ok(result, name); return result;
}
function inputHarness(webFairy = true, readOnly = false) {
  const calls = [], press = { current: null };
  const context = { enableFairyWalk: webFairy, readOnly, Platform: { OS: 'web' }, fairyPress: press,
    handleGardenTap: (x, y) => calls.push([x, y]), handlePointerMove() {}, fairyDebug: false };
  const handlers = Object.fromEntries(['onPointerDown', 'onPointerUp', 'onPointerMove', 'onPointerCancel'].map(name =>
    [name, vm.runInNewContext(compile(`(${expression(name)})`), context)]));
  const event = (x, y, overrides = {}) => ({ target: { tagName: 'CANVAS' },
    currentTarget: { getBoundingClientRect: () => ({ left: 202, top: 64 }) },
    nativeEvent: { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 }, ...overrides });
  return { calls, handlers, event };
}
test('ten web Fairy presses produce one destination each, independent of press duration and canvas backing size', () => {
  const { calls, handlers, event } = inputHarness();
  for (let i = 0; i < 10; i++) {
    const e = event(593 + i, 415);
    handlers.onPointerDown(e);
    // A stationary hold has no duration timeout. Pointer-up reads CSS bounds.
    handlers.onPointerMove(e); handlers.onPointerUp(e); handlers.onPointerUp(e);
    assert.equal(calls.length, i + 1);
    assert.deepEqual(Array.from(calls[i]), [391 + i, 351]);
  }
});
test('controls, right clicks, cancelled presses, drags and multi-touch never select a Fairy destination', () => {
  const { calls, handlers: h, event } = inputHarness();
  const canvas = event(593, 415);
  for (const e of [event(593, 415, { target: { tagName: 'BUTTON' } }),
    event(593, 415, { nativeEvent: { ...canvas.nativeEvent, button: 2 } })]) {
    h.onPointerDown(e); h.onPointerUp(e);
  }
  h.onPointerDown(canvas); h.onPointerCancel(); h.onPointerUp(canvas);
  h.onPointerDown(canvas); h.onPointerMove(event(620, 415)); h.onPointerUp(canvas);
  h.onPointerDown(canvas); h.onPointerDown(event(593, 415, {
    nativeEvent: { ...canvas.nativeEvent, pointerId: 2, isPrimary: false },
  })); h.onPointerUp(canvas);
  assert.equal(calls.length, 0);
  const garden = inputHarness(false);
  garden.handlers.onPointerDown(canvas); garden.handlers.onPointerUp(canvas);
  assert.equal(garden.calls.length, 0, 'Ordinary Garden retains its existing gesture handler');
  // A friend's Garden opens flowers through the same canvas press on web.
  const visit = inputHarness(false, true);
  visit.handlers.onPointerDown(canvas); visit.handlers.onPointerUp(canvas);
  assert.equal(visit.calls.length, 1);
});
test('measured paving destinations accept first try while lawns, water and narrow-path constraints remain intact', () => {
  const world = (x, y) => ({ x: (x - 202.6666667) / .3644444444, y: (y - 64) / .3644444444 });
  // Observed normal clicks in the 1280×720 browser, including points that
  // the old 8-world-unit corridor silently rejected on visible paving.
  const points = [[639,210],[746,303],[676,423],[521,321],[479,344],[448,357],[418,382],
    [639,420],[544,387],[593,415],[263,340],[356,320],[772,125],[803,268],[805,412],
    [837,560],[276,453],[751,333],[741,230],[631,618]];
  let foot = WALK_START;
  for (const [x,y] of points) {
    const path = route(foot, world(x,y)); assert.ok(path, `${x},${y}`);
    foot = path.at(-1); assert.ok(nearest(foot, WALK_NETWORK, .001));
  }
  assert.equal(nearest(world(639,210), WALK_NETWORK, 8), null, 'Previous hit corridor missed ordinary paving');
  for (const [x,y] of [[680,330],[400,380],[680,120],[900,540],[100,300]])
    assert.equal(route(foot,world(x,y)), null, `Terrain ${x},${y} stays rejected`);
  assert.ok(WALK_NETWORK.edges.some(edge => edge.width === 8), 'Stepping stones keep their narrow restriction');
  assert.ok(WALK_NETWORK.edges.some(edge => edge.width === 12), 'Internal paths stay narrow');
});

function fairyHarness() {
  const slots = [], effects = [], queue = new Map(), host = {}, ref = { current: null };
  let cursor = 0, request = 0, now = 0, props;
  const callbacks={entry:0,exit:0,mail:0};
  const react = {
    forwardRef: fn => fn,
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; },
    useState: value => { const i = cursor++; const slot = slots[i] ??= { value };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
    useEffect: (fn, deps) => { const i = cursor++, old = slots[i];
      if (!old || deps.some((d, j) => d !== old.deps[j])) {
        slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      } },
    useImperativeHandle: (target, fn) => { target.current = fn(); },
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies=new Map();
  function loadNavigation(file) {
    if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
    if(dependencies.has(file))return dependencies.get(file).exports;
    const loaded={exports:{}};dependencies.set(file,loaded);
    vm.runInNewContext(compile(fs.readFileSync(file,'utf8')),{module:loaded,exports:loaded.exports,
      require:request=>request.startsWith('@/')?request:loadNavigation(path.resolve(path.dirname(file),request+(path.extname(request)?'':'.ts')))});
    return loaded.exports;
  }
  const module = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.join(directory, 'fairy/GardenFairy.tsx'), 'utf8')), {
    module, exports: module.exports, __DEV__: true, window: host, performance: { now: () => now },
    requestAnimationFrame: fn => { queue.set(++request, fn); return request; },
    cancelAnimationFrame: id => queue.delete(id),
    require: name => name === 'react' ? react : name === './walkNetwork' ? networkModule.exports
      : name === './FairyNavigation' ? loadNavigation(path.join(directory,'fairy/FairyNavigation.ts'))
      : name === './fairyMetrics' ? loadNavigation(path.join(directory,'fairy/fairyMetrics.ts'))
      : name === './swingDestination' ? loadNavigation(path.join(directory,'fairy/swingDestination.ts'))
      : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx }
      : name === 'react-native-reanimated' ? {
        useSharedValue: value => react.useRef({ value }).current, useDerivedValue: fn => ({ value: fn() }),
      } : name === '@shopify/react-native-skia' ? { Group: 'Group', Path: 'Path', Circle: 'Circle' } : name,
  });
  props = { active: true, debug: false, blocked: () => false, onStatus: s => { harness.status = s; },
    onTreehouseEntered:()=>callbacks.entry++,onTreehouseExited:()=>callbacks.exit++,onMailboxOpened:()=>callbacks.mail++ };
  const render = () => { cursor = 0; module.exports.default(props, ref); while (effects.length) effects.shift()(); };
  const harness = {
    move: p => { const accepted = ref.current.move(p); render(); return accepted; },
    state: () => host.__fairyDebug.getState(), callbacks, controls:()=>ref.current, loops:()=>queue.size,
    clockAdvance: ms => { now += ms; },
    frameAt: timestamp => { const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach(fn => fn(timestamp)); render(); },
    step: () => { now += 50; const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach(fn => fn(now)); render(); },
    finish: () => { let frames = 0; while (harness.state().remaining.length || ['flying','flyingToSwing','flyingToMoonBed','flyingToTea','flyingToTreehouse','flyingToMailbox'].includes(harness.state().state)) {
      harness.step(); if(harness.state().state==='walking')assert.ok(nearest(harness.state().position, WALK_NETWORK, .001)); assert.ok(++frames < 5000);
    } assert.equal(harness.state().target, null); assert.equal(harness.state().frame, 0, 'standing: her painting (WALK_IDLE)'); },
    active: value => { props = { ...props, active: value }; render(); },
  };
  render(); harness.step(); return harness;
}
test('actual Fairy hooks complete ten sequential routes, accept mid-walk retargeting and clear idle state', () => {
  const fairy = fairyHarness();
  for (const index of [1, 4, 0, 7, 11, 2, 5, 0, 3, 1]) {
    const target = WALK_NETWORK.nodes[index]; assert.equal(fairy.move(target), true);
    fairy.finish(); assert.ok(distance(fairy.state().position, target) < .001);
    assert.equal(fairy.state().state, 'idle');
  }
  assert.equal(fairy.move(WALK_NETWORK.nodes[8]), true);
  for (let i = 0; i < 5; i++) fairy.step();
  const before = fairy.state().position;
  assert.equal(fairy.move(WALK_START), true);
  assert.deepEqual(fairy.state().position, before, 'Retargeting does not teleport');
  const remaining = JSON.stringify(fairy.state().remaining);
  assert.equal(fairy.move({ x: -100, y: -100 }), false);
  assert.equal(JSON.stringify(fairy.state().remaining), remaining, 'Invalid input preserves the current walk');
  fairy.finish(); assert.ok(distance(fairy.state().position, WALK_START) < .001);
  assert.equal(fairy.move(WALK_START), true);
  assert.equal(fairy.state().state, 'idle', 'Selecting the current foot position cannot leave a false moving state');
  fairy.move(WALK_NETWORK.nodes[2]); fairy.active(false);
  const paused = JSON.stringify(fairy.state());
  for (let i = 0; i < 100; i++) fairy.step();
  assert.equal(JSON.stringify(fairy.state()), paused, 'Covered Garden preserves the current route and pose');
  fairy.active(true); fairy.finish();
  assert.ok(distance(fairy.state().position, WALK_NETWORK.nodes[2]) < .001);
});
test('actual animation advances at 220 world units per second without teleporting or changing sprite cadence', () => {
  const fairy = fairyHarness(); fairy.move(WALK_NETWORK.nodes[1]);
  for (let i = 0; i < 10; i++) fairy.step();
  assert.ok(Math.abs(distance(WALK_START, fairy.state().position) - 110) < .001, 'half a second');
  assert.ok(fairy.state().remaining.length > 0);
  fairy.finish();
});

test('input accounts for elapsed time immediately without counting it again in an older queued frame', () => {
  const fairy = fairyHarness();
  fairy.move(WALK_NETWORK.nodes[1]);
  fairy.clockAdvance(20); fairy.move(WALK_NETWORK.nodes[1]);
  const immediately = fairy.state().position;
  assert.ok(Math.abs(distance(WALK_START, immediately) - 4.4) < .001);
  fairy.frameAt(60);
  assert.deepEqual(fairy.state().position, immediately, 'An older RAF timestamp cannot rewind movement time');
  fairy.clockAdvance(30); fairy.frameAt(100);
  assert.ok(Math.abs(distance(WALK_START, fairy.state().position) - 11) < .001, 'Exactly 50ms of movement was accounted for');
});

test('registered B01 bridge foot chords stay on the actual integrated deck image', async () => {
  const initialize = require('canvaskit-wasm');
  const kit = await initialize({ wasmBinary: fs.readFileSync(path.join(__dirname, '../public/canvaskit.wasm')) });
  const image = kit.MakeImageFromEncoded(fs.readFileSync(path.join(__dirname, '../assets/garden/runtime/infrastructure/final/B01_bridge.png')));
  try {
    const width = image.width(), height = image.height();
    const pixels = image.readPixels(0, 0, { width, height, colorType: kit.ColorType.RGBA_8888,
      alphaType: kit.AlphaType.Premul, colorSpace: kit.ColorSpace.SRGB });
    const deck = [[923,814],[952,790],[982,768],[1015,744]].map(([x,y]) => ({x:(x-76)/.52,y:(y-64)/.52}));
    for (const point of deck) assert.ok(WALK_NETWORK.nodes.some(node => distance(node, point) < .001));
    for (let i = 1; i < deck.length; i++) for (let step = 0; step <= 10; step++) {
      const t = step / 10, a = deck[i-1], b = deck[i];
      const x = Math.floor(a.x + (b.x-a.x)*t - 1571), y = Math.floor(a.y + (b.y-a.y)*t - 1236);
      assert.ok(x >= 0 && x < width && y >= 0 && y < height);
      assert.ok(pixels[(y*width+x)*4+3] >= 250, `Foot is on the deck, not transparent water: ${x},${y}`);
    }
  } finally { image.delete(); }
});


test('actual Fairy hooks own Treehouse and Mailbox sequences with one loop and exactly-once handoffs',()=>{
  const fairy=fairyHarness();
  function until(state){let frames=0;while(fairy.state().state!==state){fairy.step();assert.equal(fairy.loops(),1);assert.ok(++frames<2000,state);}}
  assert.equal(fairy.controls().visitTreehouse(),true);until('enteringTreehouse');
  assert.equal(fairy.move(WALK_START),false);until('insideTreehouse');
  assert.equal(fairy.callbacks.entry,1);
  fairy.active(false); for(let i=0;i<20;i++)fairy.step(); fairy.active(true); fairy.step();
  assert.equal(fairy.state().state,'insideTreehouse');assert.equal(fairy.callbacks.entry,1);
  assert.equal(fairy.controls().returnFromTreehouse(),true);assert.equal(fairy.controls().returnFromTreehouse(),false);
  until('idle');assert.equal(fairy.callbacks.exit,1);
  assert.equal(fairy.controls().visitMailbox(),true);until('retrievingMail');
  assert.equal(fairy.controls().visitMailbox(),false);assert.equal(fairy.controls().visitTreehouse(),false);
  until('mailboxTransition');assert.equal(fairy.callbacks.mail,1);
  fairy.active(false);for(let i=0;i<20;i++)fairy.step();fairy.active(true);fairy.step();
  assert.equal(fairy.state().state,'mailboxTransition');assert.equal(fairy.callbacks.mail,1);
  assert.equal(fairy.controls().returnFromMailbox(),true);assert.equal(fairy.state().state,'idle');
  assert.equal(fairy.controls().returnFromMailbox(),false);assert.equal(fairy.loops(),1);
});

test('normal Garden taps prioritize placement and flower details before all Fairy destinations', () => {
  let source;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(scene) === 'handleGardenTap') source = node.initializer.arguments[0].getText(scene);
    ts.forEachChild(node, visit);
  }
  visit(scene); assert.ok(source);
  const calls = [], context = {
    readOnly: false, fit: 1, selectedFlower: null, cameraZoom: { value: 1 }, cameraX: { value: 0 }, cameraY: { value: 0 }, baseX: 0, baseY: 0,
    __DEV__: false, perfFixtureRef: { current: false }, fairyStateRef: { current: 'idle' }, activeModeRef: { current: 'normal' }, placementsRef: { current: [] }, useMonthlyGrowth: true,
    hitCluster: () => null, updatePreview: () => calls.push('placement'), openFlowerDetail: () => calls.push('detail'),
    // Planting zooms in on its month's lawn; a tap well away from it leaves planting.
    plantingMonthRef: { current: null }, nearLawn: () => true, cancelPlacement: () => calls.push('cancel'),
    // A lawn with flowers opens Events (owner's Garden only).
    onOpenEventsRef: { current: () => {} }, plantedLawnAt: () => null, openLawnEvents: () => calls.push('events'),
    enableFairyWalk: true, treehousePlacement: {}, swingPlacement: {}, teaSetPlacement: {}, moonBedPlacement: {}, Platform: { OS: 'web' },
    canvasRef: { current: { redraw: () => calls.push('redraw') } },
    // A tap that may send her somewhere holds her schedule off (fairySchedule.ts).
    notes: 0, noteFairyUser: () => { context.notes++; },
    // …and earns closeness with her (services/fairyCloseness.ts), counted like the hold.
    interactions: 0, noteFairyInteraction: () => { context.interactions++; },
    fairyRef: { current: { isMailboxBusy: () => false, getPosition: () => ({ x: 100, y: 120 }), move: () => { calls.push('move'); return true; } } },
    // The treehouse and the mailbox open straight away; she is not involved.
    tapTreehouse: { current: () => calls.push('bookhouse') }, tapMailbox: { current: () => calls.push('mailbox') },
  };
  for (const [hit, action] of [['hitsSwing','visitSwing'],['hitsTeaArea','visitTea'],['hitsMoonBed','visitMoonBed']]) {
    context[hit] = () => false; context.fairyRef.current[action] = () => calls.push(action);
  }
  context.hitsMailbox = () => false; context.hitsTreehouse = () => false;
  const tap = vm.runInNewContext(compile(`(${source})`), context);
  const expect = (expected, noted = expected.some(call => call === 'move' || call.startsWith('visit'))) => {
    calls.length = 0; context.notes = 0; context.interactions = 0; tap(100, 100); assert.deepEqual(calls, expected);
    assert.equal(context.notes, noted ? 1 : 0, String(expected)); assert.equal(context.interactions, context.notes, String(expected));
  };
  expect(['move', 'redraw']);
  context.hitsMailbox = () => true; context.fairyRef.current.isMailboxBusy = () => true;
  context.activeModeRef.current = 'plant'; expect(['placement']);
  context.plantingMonthRef.current = 10; expect(['placement']);
  context.nearLawn = () => false; expect(['cancel']); context.nearLawn = () => true; context.plantingMonthRef.current = null;
  context.activeModeRef.current = 'normal'; context.hitCluster = () => ({ id: 'synthetic-flower' }); expect(['detail']);
  context.selectedFlower = {}; expect([]); context.selectedFlower = null;
  context.hitCluster = () => null; expect([]);
  context.fairyRef.current.isMailboxBusy = () => false; context.hitsMailbox = () => false;
  context.hitsMailbox = () => true; expect(['mailbox'], false); context.hitsMailbox = () => false;
  context.hitsTreehouse = () => true; expect(['bookhouse'], false); context.hitsTreehouse = () => false;
  for (const [hit, action] of [['hitsSwing','visitSwing'],['hitsTeaArea','visitTea'],['hitsMoonBed','visitMoonBed']]) {
    context[hit] = () => true; expect([action]); context[hit] = () => false;
  }
  // A tap never makes her talk (she speaks up on her own): seated, the swing, tea set or moon bed still sends her there.
  for (const [state, hit, action] of [['sittingOnSwing','hitsSwing','visitSwing'],['drinkingTea','hitsTeaArea','visitTea'],['sleepingOnMoonBed','hitsMoonBed','visitMoonBed']]) {
    context.fairyStateRef.current = state; context[hit] = () => true; expect([action]); context[hit] = () => false;
  }
  context.fairyStateRef.current = 'idle';
  // A lawn with flowers opens Events and leaves her be (no hold, no closeness); landmarks first.
  context.plantedLawnAt = () => 10; expect(['events']);
  context.hitsSwing = () => true; expect(['visitSwing']); context.hitsSwing = () => false;
  context.onOpenEventsRef.current = undefined; expect(['move', 'redraw']); context.onOpenEventsRef.current = () => {};
  context.plantedLawnAt = () => null;
  context.readOnly = true; expect([]);
  // A friend's Garden still opens its flowers (support and messages), never planting or the Fairy.
  context.hitCluster = () => ({ id: 'synthetic-flower' }); expect(['detail'], false);
  context.hitCluster = () => null; context.activeModeRef.current = 'plant'; expect([]);
});
