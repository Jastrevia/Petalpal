import { SafetyActions, BlockedUsers } from './SafetyActions';
import { usePanelTheme, type PanelTheme } from './PanelTheme';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useAuth } from '../../services/auth';
import { useAppLocale } from '../../services/locale';
import { loadFriends, loadFriendRequests, searchFriends, sendFriendRequest, respondToFriendRequest,
  removeFriend, type FriendUser, type FriendRequest, type FriendRequests } from '../../services/friends';
import { FEATURE_COLORS as colors, ui } from './FeatureUI';
import { UserAvatar } from '../avatars/UserAvatar';
import { GardenVisitLog } from './GardenVisitLog';
import { subscribeUserRealtime, userRealtimeConnected } from '../../services/userRealtime';

const ART = {
  banner: { dark: require('@/assets/friends/banner-dark.webp'), light: require('@/assets/friends/banner-light.webp') },
  path: { dark: require('@/assets/friends/path-dark.webp'), light: require('@/assets/friends/path-light.webp') },
  // The two fairies cut out of their old dark square, so they stand in the forest in both modes.
  fairies: require('@/assets/friends/fairies-cutout.webp'),
  // PetalPal's own flower, the same painted crocus as the Our Bond check-in.
  blossom: require('@/assets/bond/checkin-bloom.webp'),
};
// The overlay pads its content by 20; the banner and the forest path run to the panel's edges.
const BLEED = 20;

const COPY = {
  en: {
    title: 'Friends', tagline: 'GOOD FRIENDS\nBRIGHTER GARDENS', selfOnline: 'You’re online', selfOffline: 'You’re offline',
    tabs: { friends: 'My friends', requests: 'Requests', visitors: 'Visitors' },
    myFriends: 'My friends', add: 'Add friend', filter: 'Search friends by name or ID…', filterLabel: 'Search friends',
    online: 'Online', offline: 'Offline', noUsername: 'No username set', someone: 'PetalPal user',
    none: 'You have not added any friends yet.', noMatch: 'No friends match that search.',
    manage: 'Delete friends', done: 'Done', removeAsk: (name: string) => `Remove ${name} from your friends?`,
    cancelRemoval: 'Cancel removal', confirmRemoval: 'Confirm removal',
    remove: (name: string) => `Remove ${name}`, report: (name: string) => `Report or block ${name}`,
    visit: (name: string) => `Visit ${name}'s Garden`, visitOpen: 'Open Garden as a visitor',
    visitPrivate: 'Garden visits are private', visitUnknown: 'Garden access has not been verified',
    find: 'Search by nickname or ID…', findLabel: 'Search by display name', search: 'Search', clear: 'Clear search', back: 'Back',
    received: 'Received', sentTab: 'Sent', receivedTitle: 'Requests you received', sentTitle: 'Requests you sent',
    noReceived: 'No requests waiting for you.', noSent: 'You have no requests waiting.',
    requestedYou: (when: string) => `Asked ${when}`, youRequested: (when: string) => `Sent ${when}`, waiting: 'Waiting for them',
    accept: (name: string) => `Accept ${name}`, reject: (name: string) => `Reject ${name}`, acceptText: 'Accept', rejectText: 'Decline', requested: 'Requested',
    results: 'Search results', noUsers: 'No matching users found.',
    sendTo: (name: string) => `Send request to ${name}`, sendText: 'Send request', already: 'Already Friends', sent: 'Request Sent', incoming: 'Incoming Request',
    sentPopupTitle: 'Friend request sent', sentPopupBody: (who: string) => `Your friend request is on its way to ${who}.\nOnce they accept, you’ll be friends.`, ok: 'OK', closePopup: 'Close',
    retry: 'Try again', refresh: 'Refresh Friends', loading: 'Loading friends…', searching: 'Searching…', sending: 'Sending request…', updating: 'Updating request…',
    removing: 'Removing friend…', accepted: 'Friend request accepted.', rejected: 'Friend request rejected.',
    removed: 'Friend removed.', signIn: 'Sign in to see your friends.',
  },
  'zh-Hans': {
    title: '好友', tagline: '好朋友\n让花园更美', selfOnline: '你在线', selfOffline: '你离线',
    tabs: { friends: '我的好友', requests: '好友申请', visitors: '访客记录' },
    myFriends: '我的好友', add: '添加好友', filter: '搜索好友的名字或 ID…', filterLabel: '搜索好友',
    online: '在线', offline: '离线', noUsername: '还没有设置用户名', someone: 'PetalPal 用户',
    none: '你还没有添加好友。', noMatch: '没有找到匹配的好友。',
    manage: '删除好友', done: '完成', removeAsk: (name: string) => `把 ${name} 从好友里删除吗？`,
    cancelRemoval: '取消', confirmRemoval: '确认删除',
    remove: (name: string) => `删除 ${name}`, report: (name: string) => `举报或屏蔽 ${name}`,
    visit: (name: string) => `去 ${name} 的花园`, visitOpen: '以访客身份打开花园',
    visitPrivate: '对方的花园不开放参观', visitUnknown: '还不确定能否参观',
    find: '输入对方的昵称或 ID 搜索…', findLabel: '搜索用户', search: '搜索', clear: '清除搜索', back: '返回',
    received: '收到的申请', sentTab: '我发出的申请', receivedTitle: '收到的申请', sentTitle: '我发出的申请',
    noReceived: '还没有人向你发出申请。', noSent: '你还没有等待中的申请。',
    requestedYou: (when: string) => `${when}申请了你`, youRequested: (when: string) => `已发送申请 · ${when}`, waiting: '等待对方通过',
    accept: (name: string) => `同意 ${name}`, reject: (name: string) => `拒绝 ${name}`, acceptText: '✓ 接受', rejectText: '× 拒绝', requested: '已申请',
    results: '搜索结果', noUsers: '没有找到匹配的用户。',
    sendTo: (name: string) => `向 ${name} 发送申请`, sendText: '发送申请', already: '已经是好友', sent: '已申请', incoming: '对方已申请',
    sentPopupTitle: '好友申请已发送', sentPopupBody: (who: string) => `已向 ${who} 发送好友申请。\n等待对方通过后，你们就会成为好友。`, ok: '好的', closePopup: '关闭',
    retry: '再试一次', refresh: '重新加载好友', loading: '正在加载好友…', searching: '正在搜索…', sending: '正在发送申请…', updating: '正在处理申请…',
    removing: '正在删除好友…', accepted: '已同意好友申请。', rejected: '已拒绝好友申请。',
    removed: '已删除好友。', signIn: '登录后可以查看好友。',
  },
};

type Tab = 'friends' | 'requests' | 'visitors';

// `addingFriend` (the overlay's Add Friends route) opens straight on Requests, where search lives.
export function FriendsPanel({ addingFriend = false, onClose = () => {} }: {
  addingFriend?: boolean; onAddFriend?: () => void; onCloseAddFriend?: () => void; onClose?: () => void;
} = {}) {
  const { theme, light } = usePanelTheme();
  const styles = createStyles(theme, light);
  const mode = light ? 'light' : 'dark';
  const locale = useAppLocale(), copy = COPY[locale];
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequests>({ incoming: [], outgoing: [] });
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FriendUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<FriendUser | null>(null);
  const [filter, setFilter] = useState('');
  // The list shows Home buttons; "Delete friends" swaps them for remove and report circles.
  const [managing, setManaging] = useState(false);
  const [tab, setTab] = useState<Tab>(addingFriend ? 'requests' : 'friends');
  const [requestView, setRequestView] = useState<'incoming' | 'outgoing'>('incoming');
  const [sentTo, setSentTo] = useState<FriendUser | null>(null);
  useEffect(() => { if (addingFriend) setTab('requests'); }, [addingFriend]);
  // Live online/offline from the owner's user-room connection; the friends list gives the start.
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [selfOnline, setSelfOnline] = useState(userRealtimeConnected());
  useEffect(() => subscribeUserRealtime({
    presence: ({ userId, online }) => setLive(current => ({ ...current, [userId]: online })),
    connection: setSelfOnline,
  }), []);
  const mounted = useRef(false);
  const locked = useRef(false);
  const scope = useRef({ ownerId });
  if (scope.current.ownerId !== ownerId) scope.current = { ownerId };
  const currentScope = scope.current;

  const run = useCallback(async (label: string, work: (active: () => boolean) => Promise<void>) => {
    const active = () => mounted.current && scope.current === currentScope;
    if (!ownerId || !active() || locked.current) return;
    locked.current = true; setBusy(label); setError(''); setMessage('');
    try { await work(active); }
    catch (err) { if (active()) setError((err as Error).message); }
    finally { if (active()) { locked.current = false; setBusy(''); } }
  }, [ownerId, currentScope]);

  const reload = useCallback(async (active: () => boolean) => {
    if (!ownerId) return;
    const [list, pending] = await Promise.all([loadFriends(ownerId), loadFriendRequests(ownerId)]);
    if (active()) {
      setFriends(Array.from(new Map(list.filter(user => user.id !== ownerId).map(user => [user.id, user])).values()));
      setRequests(pending);
    }
  }, [ownerId]);
  const refresh = useCallback(() => run(copy.loading, reload), [run, reload, copy.loading]);
  useEffect(() => {
    mounted.current = true; locked.current = false;
    setFriends([]); setRequests({ incoming: [], outgoing: [] }); setResults([]);
    setSearch(''); setSearched(false); setRemoving(null); setError(''); setMessage('');
    setFilter(''); setManaging(false); setSentTo(null);
    void refresh();
    return () => { mounted.current = false; };
  // A language switch only relabels; it must not reload or reset the list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  async function findFriends() {
    if (!search.trim()) return;
    await run(copy.searching, async active => {
      setResults([]); setSearched(false);
      const users = await searchFriends(search);
      if (active()) { setResults(users.filter(user => user.id !== ownerId)); setSearched(true); }
    });
  }
  // Back from search results to Requests as it was (2.1).
  function leaveSearch() { setSearch(''); setResults([]); setSearched(false); setError(''); }
  async function send(user: FriendUser) {
    if (user.id === ownerId || friends.some(friend => friend.id === user.id) ||
      requests.outgoing.some(request => request.receiverId === user.id) ||
      requests.incoming.some(request => request.senderId === user.id)) return;
    await run(copy.sending, async active => {
      const response = await sendFriendRequest(user.id);
      if (!active()) return;
      if (response.request) setRequests(current => ({ ...current, outgoing: [...current.outgoing, response.request!] }));
      setSentTo(user);
      await reload(active);
    });
  }
  async function respond(request: FriendRequest, action: 'accept' | 'reject') {
    if (request.receiverId !== ownerId) return;
    await run(copy.updating, async active => {
      await respondToFriendRequest(request.id, action);
      if (!active()) return;
      setRequests(current => ({ ...current, incoming: current.incoming.filter(item => item.id !== request.id) }));
      if (action === 'accept' && request.sender) setFriends(current => [...current, request.sender!]);
      setMessage(action === 'accept' ? copy.accepted : copy.rejected);
      await reload(active);
    });
  }
  async function confirmRemove() {
    if (!removing) return;
    const friendId = removing.id;
    await run(copy.removing, async active => {
      await removeFriend(friendId);
      if (!active()) return;
      setFriends(current => current.filter(friend => friend.id !== friendId)); setRemoving(null);
      setMessage(copy.removed);
      await reload(active);
    });
  }
  function visit(friend: FriendUser) {
    if (busy || !mounted.current || scope.current !== currentScope || friend.allowGardenVisits !== true) return;
    onClose();
    router.push({ pathname: '/visit/[ownerId]', params: { ownerId: friend.id } });
  }
  const nameOf = (user?: FriendUser) => user?.displayName?.trim() || user?.name?.trim() || user?.accountId || user?.id || copy.someone;
  const handle = (user?: FriendUser) => user?.accountId ? `@${user.accountId}` : copy.noUsername;
  // How long ago a request was made, short enough for a list row: "2 days ago" / "2天前".
  const when = (iso?: string) => {
    const minutes = iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)) : NaN;
    if (Number.isNaN(minutes)) return '';
    const zh = locale === 'zh-Hans', hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
    if (minutes < 1) return zh ? '刚刚' : 'just now';
    if (hours < 1) return zh ? `${minutes}分钟前` : `${minutes} min ago`;
    if (days < 1) return zh ? `${hours}小时前` : `${hours} h ago`;
    return zh ? `${days}天前` : `${days} ${days === 1 ? 'day' : 'days'} ago`;
  };
  function identity(user: FriendUser | undefined, detail?: ReactNode, presence = false) {
    const online = user ? live[user.id] ?? user.online === true : false;
    return <View style={styles.identity}>
      <View><UserAvatar avatar={user?.avatar} size={46} style={styles.avatar} />
        {presence ? <View style={[styles.presenceDot, { backgroundColor: online ? '#7FB77E' : '#9AA79F', borderColor: theme.surface }]} /> : null}</View>
      <View style={styles.name}><Text numberOfLines={1} style={styles.displayName}>{nameOf(user)}</Text>
        <Text numberOfLines={1} style={styles.caption}>{presence ? (online ? copy.online : copy.offline) + ' · ' : ''}{handle(user)}</Text>
        {detail ? <Text numberOfLines={1} style={styles.caption}>{detail}</Text> : null}
      </View>
    </View>;
  }
  const heading = (title: string, count?: number, extra?: ReactNode) => <View style={styles.heading}>
    <Image source={ART.blossom} style={styles.blossom} accessible={false} />
    <Text style={styles.sectionTitle}>{title}</Text>{count != null ? <Text style={styles.count}>{count}</Text> : null}
    {extra ? <><View style={{ flex: 1 }} />{extra}</> : null}
  </View>;
  const pill = (label: string, text: string, onPress: () => void, options: { disabled?: boolean; icon?: ReactNode; tone?: 'cream' | 'danger' | 'quiet' | 'muted'; compact?: boolean } = {}) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={options.disabled === true} onPress={onPress}
      style={({ pressed }) => [styles.pill, options.compact && styles.pillCompact, options.tone === 'cream' && styles.pillCream, options.tone === 'danger' && styles.pillDanger,
        options.tone === 'quiet' && styles.pillQuiet, options.tone === 'muted' && styles.pillMuted, options.disabled && options.tone !== 'muted' && ui.disabled, pressed && ui.pressed]}>
      {options.icon}<Text style={[styles.pillText, options.tone === 'cream' && styles.darkText, options.tone === 'danger' && { color: '#F3C2BA' },
        (options.tone === 'quiet' || options.tone === 'muted') && { color: theme.muted }]}>{text}</Text>
    </Pressable>;
  // Fades a painted edge into the panel colour so the art has no seam.
  const fade = (direction: 'to top' | 'to bottom') => Platform.OS === 'web'
    ? { backgroundImage: `linear-gradient(${direction}, ${theme.background} 0%, ${theme.background}00 100%)` } as object
    : { backgroundColor: `${theme.background}66` };

  if (!ownerId) return <Text style={styles.caption}>{copy.signIn}</Text>;
  const inSearch = tab === 'requests' && searched;
  const typing = tab === 'requests' && !searched && search.trim().length > 0;
  const shown = friends.filter(friend => `${friend.displayName || ''} ${friend.name} ${friend.accountId || ''} ${friend.id}`
    .toLowerCase().includes(filter.trim().toLowerCase()));

  const status = <>
    {busy ? <View style={ui.row}><ActivityIndicator accessibilityLabel={busy} color={colors.primary} />
      <Text style={styles.caption}>{busy}</Text></View> : null}
    {error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.caption}>{error}</Text>
      {!inSearch ? pill(copy.refresh, copy.retry, () => void refresh(), { disabled: !!busy }) : null}</View> : null}
    {message ? <Text style={styles.caption}>{message}</Text> : null}
  </>;

  const findBox = <View style={styles.search}>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.search} disabled={!!busy || !search.trim()} onPress={() => void findFriends()} hitSlop={8}>
      <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={20} tintColor={theme.muted} />
    </Pressable>
    <TextInput accessibilityLabel={copy.findLabel} placeholder={copy.find} placeholderTextColor={theme.muted}
      value={search} editable={!busy} autoCapitalize="none" maxLength={80}
      onChangeText={value => { setSearch(value); setResults([]); setSearched(false); }}
      onSubmitEditing={() => void findFriends()} returnKeyType="search" style={styles.searchInput} />
    {search ? <Pressable accessibilityRole="button" accessibilityLabel={copy.clear} onPress={leaveSearch} hitSlop={10} style={styles.clear}>
      <Text style={styles.clearText}>×</Text></Pressable> : null}
  </View>;

  const friendsTab = <>
    {heading(copy.myFriends, friends.length, pill(copy.add, copy.add, () => setTab('requests'), { disabled: !!busy, icon: null }))}
    <View style={styles.search}>
      <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={20} tintColor={theme.muted} />
      <TextInput accessibilityLabel={copy.filterLabel} placeholder={copy.filter} placeholderTextColor={theme.muted}
        value={filter} onChangeText={setFilter} style={styles.searchInput} />
    </View>
    {!busy && !friends.length ? <Text style={styles.caption}>{copy.none}</Text> : null}
    {friends.length && !shown.length ? <Text style={styles.caption}>{copy.noMatch}</Text> : null}
    {shown.map(friend => {
      const allowed = friend.allowGardenVisits === true, name = nameOf(friend);
      return <View key={friend.id}>
        <View testID={`friend-${friend.id}`} style={styles.listRow}>
          {identity(friend, undefined, true)}
          {managing ? <>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.remove(friend.name)} disabled={!!busy} onPress={() => setRemoving(friend)}
              style={({ pressed }) => [styles.circle, styles.removeCircle, !!busy && ui.disabled, pressed && ui.pressed]}>
              <Text style={[styles.circleText, { color: '#E0897D' }]}>−</Text>
            </Pressable>
            <SafetyActions userId={friend.id} onBlocked={() => void refresh()} trigger={(open, reporting) =>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.report(name)} disabled={reporting} onPress={open}
                style={({ pressed }) => [styles.circle, styles.reportCircle, pressed && ui.pressed]}>
                <SymbolView name={{ ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' }} size={20} tintColor="#D8B45E" />
              </Pressable>} />
          </> : <Pressable accessibilityRole="button" accessibilityLabel={copy.visit(friend.name)}
            accessibilityHint={allowed ? copy.visitOpen : friend.allowGardenVisits === false ? copy.visitPrivate : copy.visitUnknown}
            accessibilityState={{ disabled: !allowed || !!busy }} disabled={!allowed || !!busy} testID={`visit-${friend.id}`}
            onPress={allowed && !busy ? () => visit(friend) : undefined}
            style={({ pressed }) => [styles.home, !allowed && styles.homeDisabled, allowed && pressed && styles.homeActive]}>
            <Image source={light ? require('../../../assets/friends/visitor-home-transparent.png') : require('../../../assets/friends/garden-house.png')} style={styles.houseImage} resizeMode="contain" accessible={false} />
            <Text style={styles.chevron}>›</Text>
          </Pressable>}
        </View>
        {removing?.id === friend.id ? <View style={styles.notice}>
          <Text style={[styles.caption, { color: theme.text }]}>{copy.removeAsk(name)}</Text>
          <View style={styles.noticeActions}>
            {pill(copy.cancelRemoval, copy.cancelRemoval, () => setRemoving(null), { disabled: !!busy })}
            {pill(copy.confirmRemoval, copy.confirmRemoval, () => void confirmRemove(), { disabled: !!busy, tone: 'danger' })}
          </View>
        </View> : null}
      </View>;
    })}
    <View style={styles.rule} />
    <View style={styles.footer}>
      {pill(managing ? copy.done : copy.manage, managing ? copy.done : copy.manage, () => { setManaging(on => !on); setRemoving(null); }, {
        disabled: !friends.length && !managing, tone: managing ? 'cream' : undefined,
        icon: managing ? null : <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={16} tintColor={theme.text} /> })}
    </View>
    {/* Blocked people are managed alongside removing friends. */}
    {managing ? <BlockedUsers button={(label, load, loading) => pill(label, label, load, { disabled: loading, tone: 'quiet',
      icon: <SymbolView name={{ ios: 'nosign', android: 'block', web: 'block' }} size={15} tintColor={theme.muted} /> })} /> : null}
  </>;

  const requestsTab = <>
    {inSearch ? pill(copy.back, `←  ${copy.back}`, leaveSearch, { tone: 'quiet' }) : null}
    {findBox}
    {inSearch ? <>
      {heading(copy.results, results.length)}
      {!busy && !results.length ? <Text style={styles.caption}>{copy.noUsers}</Text> : null}
      {results.map(user => {
        const isFriend = friends.some(friend => friend.id === user.id);
        const outgoing = requests.outgoing.some(request => request.receiverId === user.id);
        const incoming = requests.incoming.some(request => request.senderId === user.id);
        const state = isFriend ? copy.already : outgoing ? copy.sent : incoming ? copy.incoming : null;
        return <View key={user.id} style={styles.listRow}>{identity(user)}
          {state ? pill(state, state, () => {}, { disabled: true, tone: 'muted', compact: true })
            : pill(copy.sendTo(nameOf(user)), copy.sendText, () => void send(user), { disabled: !!busy, tone: 'cream', compact: true,
              icon: <SymbolView name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }} size={16} tintColor="#1E4F4C" /> })}
        </View>;
      })}
    </> : typing ? null : <>
      <View accessibilityRole="tablist" style={styles.subTabs}>
        {(['incoming', 'outgoing'] as const).map(id => {
          const selected = requestView === id, count = requests[id].length;
          return <Pressable key={id} accessibilityRole="tab" accessibilityLabel={id === 'incoming' ? copy.received : copy.sentTab} accessibilityState={{ selected }} disabled={false} onPress={() => setRequestView(id)}
            style={({ pressed }) => [styles.subTab, selected && styles.tabSelected, pressed && ui.pressed]}>
            <Text style={[styles.subTabText, selected && styles.darkText]}>{id === 'incoming' ? copy.received : copy.sentTab}{count ? `  ${count}` : ''}</Text>
          </Pressable>;
        })}
      </View>
      {requestView === 'incoming' ? <>
        {heading(copy.receivedTitle, requests.incoming.length)}
        {!busy && !requests.incoming.length ? <Text style={styles.caption}>{copy.noReceived}</Text> : null}
        {requests.incoming.map(request => <View key={request.id} style={styles.listRow}>
          {identity(request.sender, request.createdAt ? copy.requestedYou(when(request.createdAt)) : undefined)}
          {pill(copy.accept(request.sender?.name || 'friend request'), copy.acceptText, () => void respond(request, 'accept'), { disabled: !!busy, tone: 'cream', compact: true })}
          {pill(copy.reject(request.sender?.name || 'friend request'), copy.rejectText, () => void respond(request, 'reject'), { disabled: !!busy, compact: true })}
        </View>)}
      </> : <>
        {heading(copy.sentTitle, requests.outgoing.length)}
        {!busy && !requests.outgoing.length ? <Text style={styles.caption}>{copy.noSent}</Text> : null}
        {requests.outgoing.map(request => <View key={request.id} style={styles.listRow}>
          {identity(request.receiver, request.createdAt ? copy.youRequested(when(request.createdAt)) : copy.waiting)}
          {pill(copy.requested, copy.requested, () => {}, { disabled: true, tone: 'muted', compact: true })}
        </View>)}
      </>}
    </>}
  </>;

  return <View style={styles.body}>
    {inSearch ? null : <View style={styles.hero}>
      <Image source={ART.banner[mode]} style={styles.heroArt} resizeMode="cover" accessible={false} />
      <View style={[styles.heroFade, fade('to top')]} pointerEvents="none" />
      {/* Keeps the title readable over the painted forest. */}
      <View style={[styles.heroScrim, Platform.OS === 'web'
        ? { backgroundImage: `linear-gradient(to right, ${theme.background}00 35%, ${theme.background}${light ? '66' : '99'} 100%)` } as object
        : { backgroundColor: `${theme.background}33` }]} pointerEvents="none" />
      <View style={styles.heroRow}>
        <Image source={ART.fairies} style={styles.fairies} resizeMode="contain" accessible={false} />
        <View style={styles.heroText}>
          {/* The owner's own status sits beside the title, leaving the tagline room. */}
          <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
            <View accessible accessibilityLabel={selfOnline ? copy.selfOnline : copy.selfOffline} style={styles.selfPill}>
              <View style={[styles.selfDot, { backgroundColor: selfOnline ? '#7FB77E' : '#9AA79F' }]} />
              <Text testID="self-presence" style={styles.selfText}>{selfOnline ? copy.online : copy.offline}</Text></View></View>
          <Text style={styles.subtitle}>{copy.tagline}</Text></View>
      </View>
    </View>}

    {inSearch ? null : <View accessibilityRole="tablist" style={styles.tabs}>
      {(['friends', 'requests', 'visitors'] as const).map(id => {
        const selected = tab === id;
        return <Pressable key={id} accessibilityRole="tab" accessibilityLabel={copy.tabs[id]} accessibilityState={{ selected }} disabled={false} onPress={() => { setTab(id); setManaging(false); setRemoving(null); }}
          style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && ui.pressed]}>
          <SymbolView name={id === 'friends' ? { ios: 'person.fill', android: 'person', web: 'person' }
            : id === 'requests' ? { ios: 'person.badge.plus', android: 'person_add', web: 'person_add' } : { ios: 'clock', android: 'schedule', web: 'schedule' }}
            size={16} tintColor={selected ? '#1E4F4C' : theme.muted} />
          <Text numberOfLines={1} style={[styles.tabText, selected && styles.darkText]}>{copy.tabs[id]}</Text>
        </Pressable>;
      })}
    </View>}

    {tab === 'visitors' ? <GardenVisitLog ownerId={ownerId} locale={locale} theme={theme} />
      : <>{status}{tab === 'friends' ? friendsTab : requestsTab}</>}

    {/* The forest path closes the panel, as in the design. */}
    <View style={styles.path} pointerEvents="none">
      <Image source={ART.path[mode]} style={styles.pathArt} resizeMode="cover" accessible={false} />
      <View style={[styles.pathFade, fade('to bottom')]} />
    </View>

    {sentTo ? <Modal transparent visible animationType="fade" onRequestClose={() => setSentTo(null)}>
      <View style={styles.popupBackdrop}>
        <Pressable accessibilityLabel={copy.closePopup} style={StyleSheet.absoluteFill} onPress={() => setSentTo(null)} />
        <View accessibilityViewIsModal style={styles.popup}>
          <Image source={ART.blossom} style={[styles.popupBlossom, { top: -10, left: -10 }]} accessible={false} />
          <Image source={ART.blossom} style={[styles.popupBlossom, { bottom: -10, right: -10, transform: [{ rotate: '140deg' }] }]} accessible={false} />
          <Pressable accessibilityRole="button" accessibilityLabel={copy.closePopup} onPress={() => setSentTo(null)} hitSlop={8} style={styles.popupClose}>
            <Text style={styles.popupCloseText}>×</Text></Pressable>
          <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>
          <Text accessibilityRole="header" style={styles.popupTitle}>{copy.sentPopupTitle}</Text>
          <Text style={styles.popupBody}>{copy.sentPopupBody(`${nameOf(sentTo)}${sentTo.accountId ? ` (@${sentTo.accountId})` : ''}`)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.ok} disabled={false} onPress={() => setSentTo(null)}
            style={({ pressed }) => [styles.popupButton, pressed && ui.pressed]}><Text style={styles.popupButtonText}>{copy.ok}</Text></Pressable>
        </View>
      </View>
    </Modal> : null}
  </View>;
}

const createStyles = (theme: PanelTheme, light: boolean) => StyleSheet.create({
  body: { gap: 12 },
  hero: { marginHorizontal: -BLEED, marginTop: -BLEED, height: 172, justifyContent: 'flex-end', overflow: 'hidden' },
  heroArt: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36 },
  heroScrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingLeft: 6, paddingRight: 10, paddingBottom: 12 },
  fairies: { width: 124, height: 86, marginLeft: 12, marginBottom: 8 },
  heroText: { flex: 1, gap: 3, paddingBottom: 4 },
  title: { fontFamily: 'serif', fontSize: 29, color: theme.text, textShadowColor: `${theme.background}AA`, textShadowRadius: 8 },
  subtitle: { fontSize: 9, lineHeight: 14, letterSpacing: 2, color: theme.text, opacity: 0.85 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  selfPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    borderWidth: 1, borderColor: `${theme.gold}99`, backgroundColor: `${theme.background}B3` },
  selfDot: { width: 8, height: 8, borderRadius: 4 },
  selfText: { fontSize: 11, color: theme.text },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: light ? theme.input : '#123A36' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 999 },
  tabSelected: { backgroundColor: '#F6EBCF', borderWidth: 1.5, borderColor: theme.gold },
  tabText: { fontSize: 13, color: theme.muted, fontWeight: '600', flexShrink: 1 },
  darkText: { color: '#1E4F4C' },
  subTabs: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 999, borderWidth: 1, borderColor: theme.border },
  subTab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  subTabText: { fontSize: 13, color: theme.muted, fontWeight: '600' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  blossom: { width: 22, height: 22 },
  sectionTitle: { fontFamily: 'serif', fontSize: 18, color: theme.text },
  count: { fontSize: 14, color: theme.muted },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: theme.gold, backgroundColor: light ? theme.surface : '#173C39' },
  pillCompact: { paddingHorizontal: 10, gap: 4 },
  pillCream: { backgroundColor: '#F6EBCF' },
  pillDanger: { borderColor: '#D9796D', backgroundColor: '#D9796D26' },
  pillQuiet: { alignSelf: 'flex-start', borderColor: theme.border },
  pillMuted: { borderColor: theme.border, backgroundColor: light ? theme.input : '#2A4D49' },
  pillText: { fontSize: 13, color: theme.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.input },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: theme.text },
  clear: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: theme.muted },
  clearText: { fontSize: 16, lineHeight: 18, color: theme.muted },
  caption: { fontSize: 12, lineHeight: 18, color: theme.muted },
  presenceDot: { position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 10,
    borderWidth: 1, borderRadius: 16, borderColor: light ? theme.gold : theme.border, backgroundColor: theme.surface },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  avatar: { backgroundColor: light ? theme.input : '#315B52', borderColor: theme.gold, borderWidth: 1.5 },
  name: { flex: 1, gap: 2, minWidth: 0 }, displayName: { fontFamily: 'serif', fontSize: 17, color: theme.text },
  circle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  circleText: { fontSize: 24, lineHeight: 26, fontWeight: '700' },
  removeCircle: { borderColor: '#D9796D', backgroundColor: '#D9796D1A' },
  reportCircle: { borderColor: '#D8B45E', backgroundColor: '#D8B45E1A' },
  home: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 10 },
  houseImage: { width: 62, height: 50 },
  chevron: { fontSize: 24, color: theme.muted, marginLeft: 2 },
  homeDisabled: { opacity: .38, filter: [{ grayscale: 1 }, { brightness: .7 }] },
  homeActive: { opacity: .8, transform: [{ scale: .96 }] },
  notice: { gap: 8, padding: 12, marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.gold, marginTop: 4 },
  footer: { flexDirection: 'row' },
  path: { marginHorizontal: -BLEED, marginBottom: -BLEED, marginTop: 4, height: 150, overflow: 'hidden' },
  pathArt: { width: '100%', height: '100%' },
  pathFade: { position: 'absolute', left: 0, right: 0, top: 0, height: 96 },
  popupBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#0B1F1B99' },
  popup: { width: '100%', maxWidth: 340, alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 20,
    borderRadius: 22, borderWidth: 1.5, borderColor: '#CBB17C', backgroundColor: '#FBF3DF' },
  popupBlossom: { position: 'absolute', width: 44, height: 44 },
  popupClose: { position: 'absolute', top: 8, right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  popupCloseText: { fontSize: 24, color: '#163F45' },
  check: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E4F4C', borderWidth: 2, borderColor: '#CBB17C' },
  checkText: { fontSize: 28, color: '#FFF4DC', fontWeight: '700' },
  popupTitle: { fontFamily: 'serif', fontSize: 20, color: '#163F45', marginTop: 4 },
  popupBody: { fontSize: 14, lineHeight: 21, color: '#3F5A56', textAlign: 'center' },
  popupButton: { marginTop: 6, minWidth: 120, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, borderRadius: 999, backgroundColor: '#6F7A5A' },
  popupButtonText: { fontSize: 15, color: '#FFF4DC', fontWeight: '600' },
});
