import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';

function runtime(path, development = false, signedIn = true) {
  let mounts = 0; const navigation = [];
  const effects = [], stateWrites = [];
  // Context reads whatever the nearest Provider above set: render() below calls a parent before its children.
  const react = { useEffect: fn => { effects.push(fn); }, useState: value => [typeof value === 'function' ? value() : value, next => stateWrites.push(next)], useRef: current => ({ current }),
    createContext: value => { const context = { value, Provider: ({ value: next, children }) => { context.value = next; return children; } }; return context; },
    useContext: context => context.value };
  const Pass = ({ children }) => children;
  const Stack = Object.assign(() => { mounts++; return 'ROUTED_SCREEN'; }, { Screen: () => null });
  const NativeTabs = Object.assign(() => { mounts++; return 'ROUTED_SCREEN'; }, { Trigger: Object.assign(Pass, { Label: Pass, Icon: () => null }) });
  const deps = {
    './features/CommunityGuidelines': { COMMUNITY_VERSION: 'fixture-version', COMMUNITY_TEXT: 'Guidelines' },
    './features/PrivacyAndSupport': { PrivacyAndSupport: () => null, PrivacyLinks: () => null },
    './auth/LoginPreviewPage': { LoginPreviewPage: () => 'INVITATION_SIGN_IN' },
    'expo-router': { Redirect: 'Redirect', ThemeProvider: Pass, DarkTheme: {}, DefaultTheme: {}, Stack, Slot: Stack, usePathname: () => path, router: { dismissTo: to => navigation.push(to) }, useLocalSearchParams: () => ({ feature: 'fairy' }) },
    'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'web' }, StyleSheet: { create: value => value }, AppState: {}, useColorScheme: () => 'light' },
    'expo-splash-screen': { preventAutoHideAsync() {}, hideAsync: async () => {} },
    '@react-navigation/native': {},
    'expo-router/unstable-native-tabs': { NativeTabs },
    '../services/auth': { AuthProvider: Pass, useAuth: () => ({ phase: signedIn ? 'signedIn' : 'signedOut', session: signedIn ? { user: { id: 'fixture' } } : null, loading: false }) },
    '../components/features/PanelTheme': { PanelThemeProvider: Pass, usePanelTheme: () => ({ theme: 'light' }) },
    '@/components/app-tabs': Stack,
    '@/components/animated-icon': { AnimatedSplashOverlay: () => null },
    '@/components/garden/world-time': { WorldTimeProvider: Pass },
    '../components/feedback': { FeedbackDraftProvider: Pass, GlobalHelpFeedback: () => null },
    '../components/auth/LoginEntranceTransitionHost': { LoginEntranceTransitionHost: Pass },
    '../constants/theme': { Fonts: {}, Spacing: { three: 3, four: 4, two: 2 } },
    '@/constants/theme': { Colors: { light: {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureRoot' },
    '@/components/garden/GardenScene': 'FairyGarden',
    '@/components/garden/flower-density-sandbox/FlowerDensitySandbox': 'Sandbox',
    '@/components/garden/planting/ProductionGrowthQA': 'QA',
  };
  const load = loadPlantingModules({}, react, null, true, deps, development);
  const nodes = [];
  function render(element) {
    if (element == null || typeof element === 'boolean') return '';
    if (typeof element !== 'object') return String(element);
    if (Array.isArray(element)) return element.map(render).join(' ');
    if (typeof element.type === 'function') return render(element.type(element.props));
    nodes.push(element); return render(element.props?.children);
  }
  return { load, render, nodes, navigation, effects, stateWrites, mounts: () => mounts };
}
const previews = ['/treehouse-test', '/swing-test', '/moon-bed-test', '/water-test', '/waterfall-test', '/tea-set-test', '/dev/backend-qa', '/explore',
  '/player-preview', '/flower-effects-test', '/fairy-test', '/fairy-swing-test', '/fairy-sprite-test',
  '/login-preview', '/fairy-loading-test'];
for (const path of previews) test(`direct production path denied before routed content: ${path}`, () => {
  const r = runtime(path); assert.match(r.render(r.load('../../../app/_layout').default()), /unavailable/); assert.equal(r.mounts(), 0);
});
test('development previews remain accessible behind AuthGate', () => {
  for (const path of previews) { const r = runtime(path, true); assert.match(r.render(r.load('../../../app/_layout').default()), /ROUTED_SCREEN/); }
});
test('real Garden/Fairy/history/feature/visit routes remain production-accessible', () => {
  for (const path of ['/', '/garden-test', '/feature/fairy', '/journal', '/garden-history', '/bookhouse', '/mailbox', '/reflection', '/feature/settings', '/visit/fixture']) {
    const r = runtime(path); assert.match(r.render(r.load('../../../app/_layout').default()), /ROUTED_SCREEN/);
  }
});
test('signed out, direct links to account or preview routes never mount and ask for an account instead', () => {
  for (const development of [false, true]) for (const path of ['/treehouse-test', '/garden-test', '/feature/fairy', '/journal', '/mailbox', '/reflection', '/garden-history', '/visit/fixture']) {
    const r = runtime(path, development, false); assert.doesNotMatch(r.render(r.load('../../../app/_layout').default()), /ROUTED_SCREEN/); assert.equal(r.mounts(), 0);
    r.effects.forEach(effect => effect()); assert.equal(r.stateWrites.includes(true), true, `${path} asks for an account`);
  }
});
test('guest mode opens only the Garden and the treehouse, and shows no sign-in form until asked', () => {
  for (const path of ['/', '/bookhouse']) {
    const r = runtime(path, false, false), page = r.render(r.load('../../../app/_layout').default());
    assert.match(page, /ROUTED_SCREEN/); assert.doesNotMatch(page, /INVITATION_SIGN_IN/);
  }
});
test('unknown and nested preview paths fail closed; no preview fixtures in production catalog', () => {
  const r = runtime('/'); const { routeAllowed } = r.load('../../../services/routePolicy');
  for (const path of ['/treehouse-test/', '/dev/backend-qa/extra', '/feature/debug', '/future-preview', '/visit/a/debug']) assert.equal(routeAllowed(path, false), false);
  for (const feature of r.load('../../../services/featureCatalog').GARDEN_FEATURES) assert.equal(previews.includes(feature.route), false);
  assert.equal(routeAllowed('/', false), true);
});
test('legacy Fairy routes redirect to the normal Garden without mounting another scene or QA controls', () => {
  for (const module of ['../../../app/garden-test', '../../../app/feature/[feature]']) {
    const r = runtime('/garden-test'); r.render(r.load(module).default());
    const redirect = r.nodes.find(n => n.type === 'Redirect'); assert.ok(redirect);
    assert.equal(typeof redirect.props.href === 'string' ? redirect.props.href : redirect.props.href.pathname, '/');
    assert.equal(r.nodes.some(n => ['FairyGarden', 'QA', 'Sandbox'].includes(n.type)), false);
  }
});

test('production tabs omit the starter demo while development retains it', () => {
  for (const development of [false, true]) {
    const r = runtime('/', development);
    const tree = r.load('../../app-tabs').default();
    const names = tree.props.children.filter(Boolean).map(node => node.props.name);
    assert.equal(names.includes('explore'), development);
    assert.ok(names.includes('garden-test')); assert.ok(names.includes('index'));
  }
});
