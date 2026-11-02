import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanelTheme, type PanelTheme } from '../features/PanelTheme';
import { likeFairyMoment, loadFairyMoments, setFairyMomentsAvatar, setFairyMomentsCover, type FairyMomentPost, type FairyMomentsPage } from '../../services/fairyMoments';
import { useAuth } from '../../services/auth';
import { momentLocale, momentLocationLabel, momentTimeLabel, MOMENTS_COPY, type MomentLocale } from './momentFormat';
import { MOMENT_PHOTOS, momentPhoto } from './momentPhotos';
import { avatarArt } from '../avatars/avatarArt';
import { AvatarPicker } from '../avatars/AvatarPicker';
import { CoverPicker } from './CoverPicker';
import { momentCover } from './momentCovers';

const DEFAULT_COVER = MOMENT_PHOTOS['IN_TREEHOUSE/2']; // until the owner picks a cover from the library
const DEFAULT_AVATAR = MOMENT_PHOTOS['TEA_TIME/3']; // her own photo until the owner picks a library avatar
const HEART = '#E7A3B8';

// The Fairy's own feed: photos and text-only small discoveries, newest first. Opening it
// marks her posts as seen on the server. "Find her" hands back to the Garden camera.
// `highlightNewest`: the visit that clears her new-post dot marks the newest post, until closed.
export function FairyMomentsPanel({ visible, onClose, onFindFairy, highlightNewest = false }: {
  visible: boolean; onClose: () => void; onFindFairy: () => void; highlightNewest?: boolean;
}) {
  const { theme } = usePanelTheme();
  const styles = createStyles(theme);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { experience } = useAuth();
  const [page, setPage] = useState<FairyMomentsPage | null>(null);
  const [error, setError] = useState<'' | 'loadError' | 'moreError'>('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [choosing, setChoosing] = useState(false), [savingAvatar, setSavingAvatar] = useState(false), [avatarError, setAvatarError] = useState('');
  const [choosingCover, setChoosingCover] = useState(false), [savingCover, setSavingCover] = useState(false), [coverError, setCoverError] = useState('');
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = ++request.current;
    setError('');
    try {
      const next = await loadFairyMoments();
      if (current === request.current) setPage(next);
    } catch {
      if (current === request.current) setError('loadError');
    }
  }, []);
  useEffect(() => { if (visible) void load(); else { request.current++; setPage(null); } }, [visible, load]);

  const loadMore = async () => {
    if (!page?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await loadFairyMoments(page.nextBefore);
      setPage(current => current && { ...next, posts: [...current.posts, ...next.posts] });
    } catch {
      setError('moreError');
    } finally { setLoadingMore(false); }
  };

  const toggleLike = async (post: FairyMomentPost) => {
    const liked = !post.liked;
    const set = (value: boolean) => setPage(current => current &&
      { ...current, posts: current.posts.map(item => item.id === post.id ? { ...item, liked: value } : item) });
    set(liked);
    try { await likeFairyMoment(post.id, liked); } catch { set(!liked); }
  };

  const chooseAvatar = async (avatar: string | null) => {
    if (!page || savingAvatar) return;
    if (avatar === (page.fairy.avatar ?? null)) { setChoosing(false); return; }
    setSavingAvatar(true); setAvatarError('');
    try {
      const saved = await setFairyMomentsAvatar(avatar);
      setPage(current => current && { ...current, fairy: { ...current.fairy, avatar: saved.avatar } });
      setChoosing(false);
    } catch { setAvatarError(MOMENTS_COPY[locale].avatarFailed); }
    finally { setSavingAvatar(false); }
  };

  const chooseCover = async (next: string | null) => {
    if (!page || savingCover) return;
    if (next === (page.fairy.cover ?? null)) { setChoosingCover(false); return; }
    setSavingCover(true); setCoverError('');
    try {
      const saved = await setFairyMomentsCover(next);
      setPage(current => current && { ...current, fairy: { ...current.fairy, cover: saved.cover } });
      setChoosingCover(false);
    } catch { setCoverError(MOMENTS_COPY[locale].coverFailed); }
    finally { setSavingCover(false); }
  };

  // The server's answer is authoritative; the signed-in profile covers the first load.
  const locale = momentLocale(page?.locale ?? experience?.user.preferredLocale);
  const copy = MOMENTS_COPY[locale];
  const name = page?.fairy.name ?? 'PPL';
  const avatar = avatarArt(page?.fairy.avatar) ?? DEFAULT_AVATAR;
  const cover = momentCover(page?.fairy.cover) ?? DEFAULT_COVER;
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable accessibilityLabel={copy.close} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View accessibilityViewIsModal accessibilityLabel={copy.title(name)}
        style={[styles.panel, { width: Math.min(440, width - 24), maxHeight: height - insets.top - insets.bottom - 24 }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{copy.title(name)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.findLabel(name)} onPress={onFindFairy}
            style={({ pressed }) => [styles.find, pressed && styles.pressed]}>
            <SymbolView name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={14} tintColor={theme.gold} />
            <Text style={styles.findText}>{copy.find}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.cover}>
            <Image source={cover} style={styles.coverImage} resizeMode="cover" accessibilityIgnoresInvertColors />
            {page ? <Pressable accessibilityRole="button" accessibilityLabel={copy.coverChange}
              onPress={() => { setCoverError(''); setChoosingCover(true); }}
              style={({ pressed }) => [styles.coverButton, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'photo', android: 'image', web: 'image' }} size={13} tintColor="#FFF4DC" />
              <Text style={styles.coverButtonText}>{copy.coverChange}</Text>
            </Pressable> : null}
            <View style={styles.identity}>
              <Text style={styles.name}>{name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.avatarChange(name)} disabled={!page}
                onPress={() => { setAvatarError(''); setChoosing(true); }} style={({ pressed }) => [pressed && styles.pressed]}>
                <Image source={avatar} style={styles.avatar} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.signature}>{copy.signature}</Text>
          {!page && !error ? <ActivityIndicator style={styles.status} color={theme.gold} accessibilityLabel={copy.loading} /> : null}
          {error ? <View style={styles.status}>
            <Text accessibilityRole="alert" style={styles.muted}>{copy[error]}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.link}>{copy.retry}</Text></Pressable>
          </View> : null}
          {page && !page.posts.length ? <Text style={[styles.muted, styles.status]}>
            {copy.empty(name)}</Text> : null}
          {page?.posts.map((post, index) => <MomentPost key={post.id} highlighted={highlightNewest && index === 0} post={post} name={name} avatar={avatar} locale={locale} styles={styles} mutedColor={theme.muted} onLike={() => void toggleLike(post)} />)}
          {page?.nextBefore ? <Pressable accessibilityRole="button" onPress={() => void loadMore()} style={styles.more}>
            {loadingMore ? <ActivityIndicator color={theme.gold} /> : <Text style={styles.link}>{copy.more}</Text>}
          </Pressable> : page?.posts.length ? <Text style={[styles.muted, styles.end]}>{copy.end}</Text> : null}
        </ScrollView>
      </View>
    </View>
    <AvatarPicker visible={choosing} title={copy.avatarTitle(name)} selected={page?.fairy.avatar ?? null} busy={savingAvatar}
      error={avatarError} closeLabel={copy.avatarClose} optionLabel={copy.avatarOption}
      defaultOption={{ source: DEFAULT_AVATAR, label: copy.avatarDefault(name) }}
      onSelect={next => void chooseAvatar(next)} onClose={() => setChoosing(false)} />
    <CoverPicker visible={choosingCover} title={copy.coverTitle} selected={page?.fairy.cover ?? null} busy={savingCover}
      error={coverError} closeLabel={copy.avatarClose} defaultCover={DEFAULT_COVER} defaultLabel={copy.coverDefault}
      optionLabel={copy.coverOption} onSelect={next => void chooseCover(next)} onClose={() => setChoosingCover(false)} />
  </Modal>;
}

function MomentPost({ post, highlighted, name, avatar, locale, styles, mutedColor, onLike }: {
  highlighted: boolean; post: FairyMomentPost; name: string; avatar: number; locale: MomentLocale; styles: ReturnType<typeof createStyles>; mutedColor: string; onLike: () => void;
}) {
  const copy = MOMENTS_COPY[locale], photo = momentPhoto(post.photoKey), place = momentLocationLabel(post.location, locale);
  const meta = `${momentTimeLabel(post.postedAt, new Date(), locale)} · ${place}`;
  return <View testID={highlighted ? 'moment-post-new' : undefined} style={[styles.post, highlighted && styles.postNew]}>
    <Image source={avatar} style={styles.postAvatar} />
    <View style={styles.postBody}>
      <Text style={styles.postName}>{name}</Text>
      <Text style={[styles.caption, !photo && styles.textOnly]}>{post.caption}</Text>
      {photo ? <Image source={photo} style={styles.photo} accessibilityLabel={copy.photo(name, place)} /> : null}
      <View style={styles.meta}>
        <Text style={styles.metaText}>{meta}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={post.liked ? copy.unlike : copy.like} accessibilityState={{ selected: post.liked }}
          onPress={onLike} hitSlop={8} style={({ pressed }) => [styles.like, pressed && styles.pressed]}>
          <SymbolView name={{ ios: post.liked ? 'heart.fill' : 'heart', android: post.liked ? 'favorite' : 'favorite_border', web: post.liked ? 'favorite' : 'favorite_border' }}
            size={16} tintColor={post.liked ? HEART : mutedColor} />
        </Pressable>
      </View>
    </View>
  </View>;
}

const createStyles = (theme: PanelTheme) => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  backdrop: { backgroundColor: '#00000045' },
  panel: { flexShrink: 1, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.input },
  closeText: { fontSize: 24, lineHeight: 28, color: theme.muted },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: theme.text },
  find: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: theme.gold, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  findText: { fontSize: 12, color: theme.gold },
  pressed: { opacity: .7 },
  content: { paddingBottom: 8 },
  cover: { height: 150 },
  coverImage: { width: '100%', height: 150 },
  coverButton: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: '#103431BF' },
  coverButtonText: { fontSize: 11, color: '#FFF4DC' },
  identity: { position: 'absolute', right: 14, bottom: -26, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  name: { marginBottom: 30, paddingHorizontal: 8, borderRadius: 8, overflow: 'hidden', fontSize: 15, fontWeight: '600', color: '#FFF4DC', backgroundColor: '#103431BF' },
  avatar: { width: 62, height: 62, borderRadius: 12, borderWidth: 2, borderColor: theme.gold },
  signature: { marginTop: 34, marginHorizontal: 14, marginBottom: 10, textAlign: 'right', fontSize: 12, color: theme.muted },
  status: { padding: 20, alignItems: 'center', gap: 8, textAlign: 'center' },
  muted: { fontSize: 13, lineHeight: 19, color: theme.muted, textAlign: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: theme.gold },
  post: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
  postNew: { backgroundColor: `${theme.gold}40`, borderLeftWidth: 4, borderLeftColor: theme.gold },
  postAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: theme.gold },
  postBody: { flex: 1, minWidth: 0 },
  postName: { fontSize: 13, fontWeight: '600', color: theme.gold },
  caption: { marginTop: 2, marginBottom: 8, fontSize: 14, lineHeight: 21, color: theme.text },
  textOnly: { fontSize: 15, lineHeight: 23, padding: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.surface },
  photo: { width: 210, height: 210, maxWidth: '100%', borderRadius: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  metaText: { fontSize: 11, color: theme.muted },
  like: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.input },
  more: { padding: 16, alignItems: 'center' },
  end: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
});
