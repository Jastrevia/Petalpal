import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGardenLoadState, type GardenLoadStore } from './gardenReadiness';
import { WakingFlowerFacts } from '../../loading/WakingFlowerFacts';
import { useAppLocale } from '../../../services/locale';

// Covers the canvas until the water base and land textures decode. After
// 30 s it shrinks to a small banner so a slow or failed image never hides the
// garden. It changes nothing about rendering or quality.
export function GardenLoadingOverlay({ store, title }: { store: GardenLoadStore; title?: string }) {
  const zh = useAppLocale() === 'zh-Hans';
  const load = useGardenLoadState(store);
  const ready = load.water === 'ready' && load.landsLoaded >= load.landsTotal;
  const [elapsed, setElapsed] = useState(0);
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
  if (ready) return null;
  const progress = `${zh ? '水面' : 'Water'} ${load.water === 'ready' ? '✓' : load.water === 'failed' ? '✕' : '…'} · ${zh ? '小岛' : 'Islands'} ${load.landsLoaded}/${load.landsTotal}`;
  const failures = load.failures.length ? `${zh ? '加载失败：' : 'Couldn’t load: '}${load.failures.join(', ')}` : null;
  const reload = Platform.OS === 'web' && typeof window !== 'undefined'
    ? <Pressable accessibilityRole="button" onPress={() => window.location.reload()} style={gardenLoadingStyles.reload}>
        <Text style={gardenLoadingStyles.reloadText}>{zh ? '重新加载' : 'Reload'}</Text></Pressable> : null;
  if (elapsed >= 30_000) return <View pointerEvents="box-none" style={gardenLoadingStyles.bannerWrap} testID="garden-loading">
    <View style={gardenLoadingStyles.banner}>
      <Text style={gardenLoadingStyles.bannerText}>{zh ? '花园还在加载' : 'Garden still loading'} · {progress}</Text>
      {failures ? <Text style={gardenLoadingStyles.bannerText}>{failures}</Text> : null}
      {reload}
    </View>
  </View>;
  return <View pointerEvents="box-none" style={gardenLoadingStyles.root} testID="garden-loading">
    <ActivityIndicator color="#365b42" accessibilityLabel={zh ? '正在加载花园' : 'Loading your garden'} />
    <Text accessibilityLiveRegion="polite" style={gardenLoadingStyles.title}>{title ?? (zh ? '花园正在生长…' : 'Growing your garden…')}</Text>
    <Text style={gardenLoadingStyles.hint}>{progress}</Text>
    {failures ? <Text style={gardenLoadingStyles.hint}>{failures}</Text> : null}
    {elapsed >= 12_000 ? <Text style={gardenLoadingStyles.hint}>{zh ? '网络较慢时，第一次打开可能要一分钟。' : 'The first visit can take up to a minute on a slow connection.'}</Text> : null}
    <WakingFlowerFacts delayMs={4000} showNote={false} />
  </View>;
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
