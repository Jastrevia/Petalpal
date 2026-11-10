import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGardenLoadState, type GardenLoadStore } from './gardenReadiness';
import { WakingFlowerFacts } from '../../loading/WakingFlowerFacts';
import { PigeonLoadingScreen } from '../../loading/PigeonLoadingExperience';
import { useAppLocale } from '../../../services/locale';

// Covers the canvas until the water base and land textures decode. After
// 30 s it shrinks to a small banner so a slow or failed image never hides the
// garden. It changes nothing about rendering or quality.
// The progress bar is measured, not timed: the water base counts as one piece and each island
// texture as one more, as Skia reports them decoded. Letterwing flies along the bar at that
// fraction; only when all of them are ready do the bar and the bird reach the end and the screen
// fade, uncovering the Garden.
export function GardenLoadingOverlay({ store, title }: { store: GardenLoadStore; title?: string }) {
  const zh = useAppLocale() === 'zh-Hans';
  const load = useGardenLoadState(store);
  const ready = load.water === 'ready' && load.landsLoaded >= load.landsTotal;
  const [elapsed, setElapsed] = useState(0);
  // Ready, and the loading screen has faded: nothing left to cover.
  const [exited, setExited] = useState(false);
  useEffect(() => { if (!ready) setExited(false); }, [ready]);
  useEffect(() => {
    if (ready) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1_000);
    return () => clearInterval(timer);
  }, [ready]);
  useEffect(() => {
    if (ready || Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Image downloads that fail reject without calling Skia's onError.
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: unknown } | undefined;
      store.reportFailure(`network: ${typeof reason?.message === 'string' ? reason.message : 'request failed'}`);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [ready, store]);
  if (ready && (exited || elapsed >= 30_000)) return null;
  const progress = `${zh ? '水面' : 'Water'} ${load.water === 'ready' ? '✓' : load.water === 'failed' ? '✕' : '…'} · ${zh ? '小岛' : 'Islands'} ${load.landsLoaded}/${load.landsTotal}`;
  const failures = load.failures.length ? `${zh ? '加载失败：' : 'Couldn’t load: '}${load.failures.join(', ')}` : null;
  const reload = Platform.OS === 'web' && typeof window !== 'undefined'
    ? <Pressable accessibilityRole="button" onPress={() => window.location.reload()} style={gardenLoadingStyles.reload}>
        <Text style={gardenLoadingStyles.reloadText}>{zh ? '重新加载' : 'Reload'}</Text></Pressable> : null;
  if (!ready && elapsed >= 30_000) return <View pointerEvents="box-none" style={gardenLoadingStyles.bannerWrap} testID="garden-loading">
    <View style={gardenLoadingStyles.banner}>
      <Text style={gardenLoadingStyles.bannerText}>{zh ? '花园还在加载' : 'Garden still loading'} · {progress}</Text>
      {failures ? <Text style={gardenLoadingStyles.bannerText}>{failures}</Text> : null}
      {reload}
    </View>
  </View>;
  const pieces = 1 + load.landsTotal;
  const loaded = (load.water === 'ready' ? 1 : 0) + Math.min(load.landsLoaded, load.landsTotal);
  return <PigeonLoadingScreen overlay testID="garden-loading" progress={loaded / pieces} done={ready} onExited={() => setExited(true)}
    message={title ?? (zh ? '正在准备你的花园…' : 'Preparing your garden…')}
    hint={<>
      <Text style={gardenLoadingStyles.hint}>{progress}</Text>
      {failures ? <Text accessibilityRole="alert" style={gardenLoadingStyles.hint}>{failures}</Text> : null}
      {failures ? reload : null}
      {elapsed >= 12_000 ? <Text style={gardenLoadingStyles.hint}>{zh ? '网络较慢时，第一次打开可能要一分钟。' : 'The first visit can take up to a minute on a slow connection.'}</Text> : null}
    </>}>
    <WakingFlowerFacts delayMs={4000} showNote={false} />
  </PigeonLoadingScreen>;
}

export const gardenLoadingStyles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 5, alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 24, backgroundColor: '#eef3e6' },
  title: { fontSize: 17, fontWeight: '600', color: '#365b42' },
  hint: { fontSize: 13, color: '#5d7263', textAlign: 'center', maxWidth: 300 },
  bannerWrap: { position: 'absolute', top: 60, left: 12, right: 12, zIndex: 5, alignItems: 'center' },
  banner: { backgroundColor: '#eef3e6ee', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 4, alignItems: 'center', maxWidth: 360 },
  bannerText: { fontSize: 12, color: '#365b42', textAlign: 'center' },
  reload: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: '#365b42' },
  reloadText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
