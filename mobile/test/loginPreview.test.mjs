import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Optional roots permit focused checks of a draft without replacing live source.
// All interaction values below are synthetic and are never included in output.
const mobileRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(mobileRoot, 'src/components/auth/LoginPreviewPage.tsx');
const require = createRequire(path.join(mobileRoot, 'package.json'));
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(pagePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

function harness({ width = 390, phase = 'idle', platform = 'web', props = {} } = {}) {
  let index = 0;
  let tree;
  let playCount = 0;
  const slots = [];
  const pendingEffects = [];
  const cleanups = [];
  const keyboardListeners = new Map();
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const createElement = (type, props, ...children) => {
    const node = { type, props: { ...props, children: children.flat(Infinity) } };
    if (type === 'TextInput' && props?.ref && typeof props.ref === 'object') {
      props.ref.current = { focus() {} };
    }
    return node;
  };
  const react = {
    createElement,
    memo: component => component,
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = index++;
      return slots[slot] ?? (slots[slot] = { current: initial });
    },
    useCallback(callback, deps) {
      const slot = index++;
      if (!slots[slot] || !equalDeps(slots[slot].deps, deps)) slots[slot] = { callback, deps };
      return slots[slot].callback;
    },
    useMemo(callback, deps) {
      const slot = index++;
      if (!slots[slot] || !equalDeps(slots[slot].deps, deps)) slots[slot] = { value: callback(), deps };
      return slots[slot].value;
    },
    useEffect(callback, deps) {
      const slot = index++;
      if (!equalDeps(slots[slot], deps)) {
        slots[slot] = deps;
        pendingEffects.push(() => { cleanups[slot]?.(); cleanups[slot] = callback(); });
      }
    },
  };
  const animation = () => ({ start() {}, stop() {} });
  const Animated = {
    View: 'Animated.View', Image: 'Animated.Image',
    Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate() { return 0; } },
    timing: animation, loop: animation, sequence: animation, parallel: animation,
    add: () => 0, multiply: () => 0,
  };
  const entrance = {
    phase, active: phase !== 'idle', entered: phase === 'complete',
    reduced: false, ready: true, failedAsset: false,
    progress: new Animated.Value(0),
    play() { playCount++; }, reset() {}, seek() {}, assetsReady() {}, assetError() {},
  };
  const native = {
    Animated,
    Easing: { sin: value => value, linear: value => value, inOut: fn => fn, out: fn => fn, quad: value => value },
    Platform: { OS: platform, select: options => options[platform] ?? options.default },
    StyleSheet: { create: styles => styles, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width, height: 844, scale: 1, fontScale: 1 }),
    Keyboard: {
      dismiss() {},
      addListener(event, callback) {
        keyboardListeners.set(event, callback);
        return { remove() { keyboardListeners.delete(event); } };
      },
    },
  };
  for (const component of ['Image', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'ActivityIndicator']) native[component] = component;
  const sandbox = {
    exports: {}, __DEV__: true,
    fetch() { assert.fail('Login preview must not send credentials'); },
    setTimeout() { assert.fail('Login preview must not schedule simulated authentication'); },
    clearTimeout() {},
    require(name) {
      if (name === 'react') return { __esModule: true, default: react, ...react };
      if (name === 'react-native') return native;
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
      if (name === '../mailbox/ExpandedLetter') return { FONT_BODY: 'body', FONT_DISPLAY: 'display', FONT_TITLE: 'title' };
      if (name === '../mailbox/FloatingPetalsOverlay') return { FloatingPetalsOverlay: 'FloatingPetalsOverlay' };
      if (name === './LoginEntranceScene') return { LoginEntranceScene: 'LoginEntranceScene', entranceTrack: () => 0 };
      if (name === './useLoginEntrance') return { useLoginEntrance: () => entrance };
      if (name === './entranceTimeline') return { ENTRANCE_STILLS: [] };
      if (name === './FairyLoadingExperience') return { FairyLoadingExperience: 'FairyLoadingExperience' };
      if (name === 'expo-router') return { Link: 'Link' };
      if (/\.(png|jpg|webp)$/.test(name)) return name;
      assert.fail(`Unexpected preview dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, sandbox, { filename: 'LoginPreviewPage.tsx' });
  const render = () => {
    index = 0;
    tree = sandbox.exports.LoginPreviewPage(props);
    pendingEffects.splice(0).forEach(effect => effect());
    return tree;
  };
  const nodes = () => {
    const result = [];
    const visit = (node, parent) => {
      if (!node || typeof node !== 'object') return;
      result.push({ node, parent });
      node.props?.children?.forEach(child => visit(child, node));
    };
    visit(tree, null);
    return result;
  };
  const text = node => typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : node?.props?.children?.map(text).join('') ?? '';
  const input = label => {
    const match = nodes().find(({ node }) => node.type === 'TextInput' && node.props.accessibilityLabel === label)?.node;
    assert.ok(match, `A field is labeled ${label}`);
    return match;
  };
  const button = label => {
    const match = nodes().find(({ node }) => node.type === 'Pressable' && (node.props.accessibilityLabel === label || text(node).trim() === label))?.node;
    assert.ok(match, `Control is available: ${label}`);
    return match;
  };
  const byId = id => nodes().find(({ node }) => node.props.testID === id)?.node;
  const type = (label, value) => { input(label).props.onChangeText(value); render(); };
  const press = label => {
    const control = button(label);
    assert.ok(!control.props.disabled, `Control is enabled: ${label}`);
    control.props.onPress(); render();
  };
  const assertIdle = () => {
    assert.equal(playCount, 0, 'Form interaction never starts the preview cinematic');
    assert.equal(entrance.phase, 'idle', 'Form interaction keeps the cinematic idle');
  };
  const visibleText = () => text(tree);
  render();
  return {
    render, nodes, text, input, button, byId, type, press, assertIdle, visibleText,
    setPhase(next) { entrance.phase = next; entrance.active = next !== 'idle'; render(); },
    keyboard(event) {
      const listener = keyboardListeners.get(event);
      assert.ok(listener, 'Native keyboard event has a registered listener');
      listener(); render();
    },
    keyboardListenerCount: () => keyboardListeners.size,
    dispose() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}

const h = harness();
assert.equal(h.input('Username / PP number').props.autoComplete, 'username', 'The login supports username autofill');
assert.equal(h.input('Username / PP number').props.textContentType, 'username', 'iOS login autofill uses the username hint');
assert.equal(h.input('Password').props.autoComplete, 'current-password', 'Password supports existing-password autofill');
assert.equal(h.input('Password').props.secureTextEntry, true, 'Password starts concealed');
for (const label of ['Username / PP number', 'Password']) {
  assert.ok(h.nodes().some(({ node }) => node.type === 'Text' && h.text(node).trim() === label), `${label} has a visible persistent label`);
}

const login = () => h.nodes().find(({ node }) => node.type === 'Pressable' && /\bLog In\b/.test(h.text(node)) && !/DEV/.test(h.text(node)))?.node;
function submit() {
  const action = login();
  assert.ok(action && !action.props.disabled, 'Primary login action is available');
  action.props.onPress(); h.render(); h.assertIdle();
}
submit();
assert.ok(h.byId('email-error'), 'Empty submit shows a login error');
assert.ok(h.byId('password-error'), 'Empty submit shows a password error');

h.type('Username / PP number', 'invalid-address');
assert.equal(Boolean(h.byId('email-error')), false, 'Editing the login clears its previous error');
h.type('Password', 'x');
assert.equal(Boolean(h.byId('password-error')), false, 'Editing password clears its previous error');
submit();
assert.equal(Boolean(h.byId('email-error')), false, 'A name is not an email, and is not refused for it');
assert.ok(h.byId('password-error'), 'Too-short password is rejected');

h.type('Username / PP number', '  preview@example.invalid  ');
h.type('Password', 'synthetic-preview-only');
submit();
assert.equal(Boolean(h.byId('email-error')), false, 'Whitespace-trimmed login validates');
assert.equal(Boolean(h.byId('password-error')), false, 'Valid synthetic password validates');
assert.match(h.text(h.byId('login-notice')), /preview|not connected|unavailable/i, 'Valid form clearly identifies unavailable authentication');
for (const label of ['Username / PP number', 'Password']) {
  assert.ok(h.nodes().some(({ node }) => node.type === 'Text' && h.text(node).trim() === label), 'Labels remain visible when fields contain values');
}
h.press('Show password');
assert.equal(h.input('Password').props.secureTextEntry, false, 'Visibility toggle reveals the field locally');
h.press('Hide password');
assert.equal(h.input('Password').props.secureTextEntry, true, 'Visibility toggle conceals the field again');
h.assertIdle();

for (const provider of ['Apple', 'Google']) {
  h.press(`Continue with ${provider}`);
  assert.match(h.text(h.byId('login-notice')), /not connected|not available|unavailable|preview|not enabled|not yet/i, 'Provider notice honestly describes unavailable sign-in');
  h.assertIdle();
}

const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style && typeof style === 'object' ? style : {};
const styleOf = node => flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false, hovered: false, focused: false }) : node.props.style);
const explicitHeight = node => {
  const style = styleOf(node);
  return Math.max(typeof style.height === 'number' ? style.height : 0, typeof style.minHeight === 'number' ? style.minHeight : 0);
};
for (const control of [login(), h.button('Continue with Apple'), h.button('Continue with Google'), h.button('Show password')]) {
  assert.ok(explicitHeight(control) >= 44, 'Primary, provider, and visibility controls retain a 44px minimum height');
}
for (const label of ['Username / PP number', 'Password']) {
  const control = h.input(label);
  const parent = h.nodes().find(({ node }) => node === control)?.parent;
  assert.ok(Math.max(explicitHeight(control), explicitHeight(parent)) >= 44, 'Input surface retains a 44px minimum height');
  assert.ok(styleOf(control).minHeight >= 44, 'Inner input cannot shrink below its 44px touch height');
  assert.ok(styleOf(parent).height >= 44, 'Input column has an explicit height for native flex layout');
  assert.ok(styleOf(control).fontSize >= 16, 'Input text remains readable at mobile size');
}

h.setPhase('camera_entering');
for (const label of ['Username / PP number', 'Password']) {
  assert.equal(h.input(label).props.editable, false, 'Transition disables editing');
  assert.equal(h.input(label).props.tabIndex, -1, 'Transition removes fields from tab order');
}
assert.equal(login().props.disabled, true, 'Transition disables primary submit');
assert.equal(h.button('Continue with Apple').props.disabled, true, 'Transition disables provider action');
h.dispose();

const native = harness({ platform: 'ios' });
assert.ok(native.byId('entrance-dev-controls'), 'DEV controls are available before the native keyboard opens');
native.keyboard('keyboardDidShow');
assert.equal(Boolean(native.byId('entrance-dev-controls')), false, 'Native keyboard opening hides the DEV overlay');
native.keyboard('keyboardDidHide');
assert.ok(native.byId('entrance-dev-controls'), 'Native keyboard dismissal restores the DEV overlay');
native.assertIdle();
native.dispose();
assert.equal(native.keyboardListenerCount(), 0, 'Native keyboard listeners are removed on unmount');
// Real sign-in (AuthGate): the same card submits through the provided sign-in, with no simulated controls.
const signIns = [];
const live = harness({ props: {
  onSignIn: async (...values) => { signIns.push(values); }, onCreateAccount: () => signIns.push('create'),
  footer: 'POLICY_LINKS', authError: 'Synthetic sign-in error.',
} });
const visible = label => live.nodes().some(({ node }) => node.type === 'Pressable' && (node.props.accessibilityLabel === label || live.text(node).trim() === label));
for (const label of ['Continue with Apple', 'Continue with Google', 'Forgot password?', 'DEV · Preview Successful Login']) {
  assert.equal(visible(label), false, `Unconnected control is hidden in real sign-in: ${label}`);
}
assert.equal(Boolean(live.byId('entrance-dev-controls')), false, 'Real sign-in hides the DEV overlay');
assert.match(live.text(live.byId('login-footer')), /POLICY_LINKS/, 'Terms and Privacy links stay on the card');
assert.match(live.text(live.byId('login-notice')), /Synthetic sign-in error/, 'The account error is shown on the card');
live.type('Username / PP number', ' fixture@example.test ');
live.type('Password', 'synthetic password');
live.nodes().find(({ node }) => node.type === 'Pressable' && /\bLog In\b/.test(live.text(node)))?.node.props.onPress();
await new Promise(resolve => setImmediate(resolve));
live.render();
assert.deepEqual(signIns, [['fixture@example.test', 'synthetic password']], 'Log In sends the trimmed login and password to the real sign-in once');
assert.equal(live.input('Password').props.value, '', 'The password field is cleared after an attempt');
live.press('Create account');
assert.equal(signIns.at(-1), 'create', 'Create account opens real registration');
live.assertIdle();
live.dispose();
console.log('Login preview UI: synthetic validation, error recovery, persistent labels, autofill, password visibility, honest provider notices, 44px controls, readable inputs, transition disabling, native keyboard overlay handling, and cinematic isolation passed.');
