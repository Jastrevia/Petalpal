import { SafetyActions, BlockedUsers } from './SafetyActions';
import { usePanelTheme, type PanelTheme } from './PanelTheme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useAuth } from '../../services/auth';
import { useAppLocale } from '../../services/locale';
import { loadFriends, loadFriendRequests, searchFriends, sendFriendRequest, respondToFriendRequest,
  removeFriend, type FriendUser, type FriendRequest, type FriendRequests } from '../../services/friends';
import { FEATURE_COLORS as colors, FeatureActionButton, ui } from './FeatureUI';
import { UserAvatar } from '../avatars/UserAvatar';
import { GardenVisitLog } from './GardenVisitLog';
import { subscribeUserRealtime, userRealtimeConnected } from '../../services/userRealtime';

const COPY = {
  en: {
    title: 'Friends', tagline: 'GOOD FRIENDS\nBRIGHTER GARDENS', selfOnline: 'You’re online', selfOffline: 'You’re offline',
    tabFriends: 'Friends', tabVisitors: 'Visitors', myFriends: 'My friends', add: 'Add friend', filter: 'Search friends by name or ID…',
    online: 'Online', offline: 'Offline', noUsername: 'No username set', someone: 'PetalPal user',
    requests: 'Friend requests', outgoing: 'Requests you sent', pending: 'Pending',
    none: 'You have not added any friends yet.', noMatch: 'No friends match that search.',
    manage: 'Delete friends', done: 'Done', removeAsk: (name: string) => `Remove ${name} from your friends?`,
    cancelRemoval: 'Cancel removal', confirmRemoval: 'Confirm removal',
    remove: (name: string) => `Remove ${name}`, report: (name: string) => `Report or block ${name}`,
    visit: (name: string) => `Visit ${name}'s Garden`, visitOpen: 'Open Garden as a visitor',
    visitPrivate: 'Garden visits are private', visitUnknown: 'Garden access has not been verified',
    accept: (name: string) => `Accept ${name}`, reject: (name: string) => `Reject ${name}`,
    addTitle: 'Add Friends', addPlaceholder: 'Name / username / account ID', search: 'Search', back: 'Back to Friends',
    noUsers: 'No matching users found.', already: 'Already Friends', sent: 'Request Sent', incoming: 'Incoming Request', addOne: 'Add Friend',
    retry: 'Try again', loading: 'Loading friends…', searching: 'Searching…', sending: 'Sending request…', updating: 'Updating request…',
    removing: 'Removing friend…', requestSent: 'Friend request sent.', accepted: 'Friend request accepted.', rejected: 'Friend request rejected.',
    removed: 'Friend removed.', signIn: 'Sign in to see your friends.', refresh: 'Refresh Friends', addLabel: 'Add Friends',
  },
  'zh-Hans': {
    title: '好友', tagline: '好朋友\n让花园更美', selfOnline: '你在线', selfOffline: '你离线',
    tabFriends: '好友列表', tabVisitors: '访客记录', myFriends: '我的好友', add: '添加好友', filter: '搜索好友的名字或 ID…',
    online: '在线', offline: '离线', noUsername: '还没有设置用户名', someone: 'PetalPal 用户',
    requests: '好友申请', outgoing: '我发出的申请', pending: '等待对方同意',
    none: '你还没有添加好友。', noMatch: '没有找到匹配的好友。',
    manage: '删除好友', done: '完成', removeAsk: (name: string) => `把 ${name} 从好友里删除吗？`,
    cancelRemoval: '取消', confirmRemoval: '确认删除',
    remove: (name: string) => `删除 ${name}`, report: (name: string) => `举报或屏蔽 ${name}`,
    visit: (name: string) => `去 ${name} 的花园`, visitOpen: '以访客身份打开花园',
    visitPrivate: '对方的花园不开放参观', visitUnknown: '还不确定能否参观',
    accept: (name: string) => `同意 ${name}`, reject: (name: string) => `拒绝 ${name}`,
    addTitle: '添加好友', addPlaceholder: '名字 / 用户名 / 账号 ID', search: '搜索', back: '返回好友列表',
    noUsers: '没有找到匹配的用户。', already: '已经是好友', sent: '已发送申请', incoming: '对方已向你申请', addOne: '加为好友',
    retry: '再试一次', loading: '正在加载好友…', searching: '正在搜索…', sending: '正在发送申请…', updating: '正在处理申请…',
    removing: '正在删除好友…', requestSent: '好友申请已发送。', accepted: '已同意好友申请。', rejected: '已拒绝好友申请。',
    removed: '已删除好友。', signIn: '登录后可以查看好友。', refresh: '重新加载好友', addLabel: '添加好友',
  },
};

export function FriendsPanel({ addingFriend = false, onAddFriend = () => {}, onCloseAddFriend = () => {}, onClose = () => {} }: {
  addingFriend?: boolean; onAddFriend?: () => void; onCloseAddFriend?: () => void; onClose?: () => void;
} = {}) {
  const { theme, light } = usePanelTheme();
  const styles = createStyles(theme, light);
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
  const [tab, setTab] = useState<'friends' | 'visitors'>('friends');
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
    setFilter(''); setManaging(false);
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
  async function send(user: FriendUser) {
    if (user.id === ownerId || friends.some(friend => friend.id === user.id) ||
      requests.outgoing.some(request => request.receiverId === user.id) ||
      requests.incoming.some(request => request.senderId === user.id)) return;
    await run(copy.sending, async active => {
      const response = await sendFriendRequest(user.id);
      if (!active()) return;
      if (response.request) setRequests(current => ({ ...current, outgoing: [...current.outgoing, response.request!] }));
      setMessage(copy.requestSent);
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
  function identity(user?: FriendUser, showPresence = false) {
    const online = user ? live[user.id] ?? user.online === true : false;
    return <View style={styles.identity}>
      <View><UserAvatar avatar={user?.avatar} size={52} style={styles.avatar} />
        {showPresence ? <View style={[styles.presenceDot, { backgroundColor: online ? '#7FB77E' : '#9AA79F', borderColor: theme.surface }]} /> : null}</View>
      <View style={styles.name}><Text numberOfLines={1} style={styles.displayName}>{nameOf(user)}</Text>
        <Text numberOfLines={1} style={styles.caption}>{showPresence ? (online ? copy.online : copy.offline) + ' · ' : ''}{user?.accountId ? `@${user.accountId}` : copy.noUsername}</Text>
      </View>
    </View>;
  }
  // A thin gold rule with a small star in the middle, as between the mockup's sections.
  const ornament = <View style={styles.ornament} accessible={false}>
    <View style={styles.ornamentLine} /><Text style={styles.ornamentStar}>✦</Text><View style={styles.ornamentLine} />
  </View>;

  if (!ownerId) return <Text style={styles.caption}>{copy.signIn}</Text>;
  const shown = friends.filter(friend => `${friend.displayName || ''} ${friend.name} ${friend.accountId || ''} ${friend.id}`
    .toLowerCase().includes(filter.trim().toLowerCase()));
  return <View style={styles.body}>
    <View style={styles.hero}>
      <Image source={require('../../../assets/friends/fairies.png')} style={styles.fairies} resizeMode="cover" accessible={false} />
      <View style={styles.heroText}><Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.tagline}</Text>
        <View style={styles.selfRow}><View style={[styles.selfDot, { backgroundColor: selfOnline ? '#7FB77E' : '#9AA79F' }]} />
          <Text testID="self-presence" style={styles.caption}>{selfOnline ? copy.selfOnline : copy.selfOffline}</Text></View></View>
    </View>

    <View accessibilityRole="tablist" style={styles.tabs}>
      {(['friends', 'visitors'] as const).map(id => {
        const selected = tab === id;
        return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setTab(id)}
          style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && ui.pressed]}>
          <SymbolView name={id === 'friends' ? { ios: 'person.fill', android: 'person', web: 'person' } : { ios: 'clock', android: 'schedule', web: 'schedule' }}
            size={18} tintColor={selected ? '#1E4F4C' : theme.muted} />
          <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{id === 'friends' ? copy.tabFriends : copy.tabVisitors}</Text>
        </Pressable>;
      })}
    </View>

    {tab === 'visitors' ? <GardenVisitLog ownerId={ownerId} locale={locale} theme={theme} /> : <>
      {busy ? <View style={ui.row}><ActivityIndicator accessibilityLabel={busy} color={colors.primary} />
        <Text style={styles.caption}>{busy}</Text></View> : null}
      {error ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.caption}>{error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.refresh} disabled={!!busy} onPress={() => void refresh()}
          style={({ pressed }) => [styles.pill, pressed && ui.pressed]}><Text style={styles.pillText}>{copy.retry}</Text></Pressable></View> : null}
      {message ? <Text style={styles.caption}>{message}</Text> : null}

      {addingFriend ? <View style={styles.section}><Text style={styles.sectionTitle}>{copy.addTitle}</Text>
        <TextInput accessibilityLabel="Search by display name" placeholder={copy.addPlaceholder}
          placeholderTextColor={theme.muted} value={search} editable={!busy} autoCapitalize="none"
          maxLength={80} onChangeText={value => { setSearch(value); setResults([]); setSearched(false); }}
          onSubmitEditing={() => void findFriends()} returnKeyType="search" style={styles.input} />
        <FeatureActionButton title={copy.search} disabled={!!busy || !search.trim()} onPress={() => void findFriends()} />
        <FeatureActionButton secondary title={copy.back} onPress={onCloseAddFriend} />
        {searched && !results.length ? <Text style={styles.caption}>{copy.noUsers}</Text> : null}
        {results.map(user => {
          const isFriend = friends.some(friend => friend.id === user.id);
          const outgoing = requests.outgoing.some(request => request.receiverId === user.id);
          const incoming = requests.incoming.some(request => request.senderId === user.id);
          return <View key={user.id} style={styles.resultRow}>{identity(user)}<SafetyActions userId={user.id} onBlocked={() => { setResults([]); void refresh(); }} />
            <FeatureActionButton secondary title={isFriend ? copy.already : outgoing ? copy.sent : incoming ? copy.incoming : copy.addOne}
              disabled={!!busy || isFriend || outgoing || incoming} onPress={() => void send(user)} />
          </View>;
        })}
      </View> : null}

      {/* Requests only take room when there are some. */}
      {requests.incoming.length ? <>
        <View style={styles.heading}><Text style={styles.headingFlower}>✿</Text>
          <Text style={styles.sectionTitle}>{copy.requests}</Text><Text style={styles.count}>{requests.incoming.length}</Text></View>
        {requests.incoming.map(request => <View key={request.id} style={styles.listRow}>
          {identity(request.sender)}
          <Pressable accessibilityRole="button" accessibilityLabel={copy.accept(request.sender?.name || 'friend request')}
            disabled={!!busy} onPress={() => void respond(request, 'accept')} style={({ pressed }) => [styles.circle, styles.acceptCircle, !!busy && ui.disabled, pressed && ui.pressed]}>
            <Text style={[styles.circleText, { color: '#7FB77E' }]}>✓</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.reject(request.sender?.name || 'friend request')}
            disabled={!!busy} onPress={() => void respond(request, 'reject')} style={({ pressed }) => [styles.circle, styles.removeCircle, !!busy && ui.disabled, pressed && ui.pressed]}>
            <Text style={[styles.circleText, { color: '#E0897D' }]}>×</Text>
          </Pressable>
        </View>)}
      </> : null}
      {requests.outgoing.length ? <View style={styles.pending}>
        <Text style={styles.caption}>{copy.outgoing}:</Text>
        {requests.outgoing.map(request => <View key={request.id} style={styles.pendingItem}>
          <UserAvatar avatar={request.receiver?.avatar} size={22} />
          <Text style={styles.caption}>{request.receiver?.name || copy.someone} · {copy.pending}</Text>
        </View>)}
      </View> : null}

      <View style={styles.heading}><Text style={styles.headingFlower}>✿</Text>
        <Text style={styles.sectionTitle}>{copy.myFriends}</Text><Text style={styles.count}>{friends.length}</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={copy.addLabel} disabled={!!busy} onPress={onAddFriend}
          style={({ pressed }) => [styles.pill, !!busy && ui.disabled, pressed && ui.pressed]}>
          <Text style={styles.pillText}>{copy.add}</Text><Text style={styles.pillPlus}>+</Text>
        </Pressable>
      </View>
      <View style={styles.search}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={18} tintColor={theme.muted} />
        <TextInput accessibilityLabel="Search friends" placeholder={copy.filter} placeholderTextColor={theme.muted}
          value={filter} onChangeText={setFilter} style={styles.searchInput} />
      </View>

      {!busy && !friends.length ? <Text style={styles.caption}>{copy.none}</Text> : null}
      {friends.length && !shown.length ? <Text style={styles.caption}>{copy.noMatch}</Text> : null}
      {shown.map(friend => {
        const allowed = friend.allowGardenVisits === true, name = nameOf(friend);
        return <View key={friend.id}>
          <View testID={`friend-${friend.id}`} style={styles.listRow}>
            {identity(friend, true)}
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
              <Pressable accessibilityRole="button" accessibilityLabel={copy.cancelRemoval} disabled={!!busy} onPress={() => setRemoving(null)}
                style={({ pressed }) => [styles.pill, !!busy && ui.disabled, pressed && ui.pressed]}><Text style={styles.pillText}>{copy.cancelRemoval}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.confirmRemoval} disabled={!!busy} onPress={() => void confirmRemove()}
                style={({ pressed }) => [styles.pill, styles.pillDanger, !!busy && ui.disabled, pressed && ui.pressed]}><Text style={[styles.pillText, { color: '#F3C2BA' }]}>{copy.confirmRemoval}</Text></Pressable>
            </View>
          </View> : null}
        </View>;
      })}

      {ornament}
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel={managing ? copy.done : copy.manage} accessibilityState={{ selected: managing }}
          disabled={!friends.length && !managing} onPress={() => { setManaging(on => !on); setRemoving(null); }}
          style={({ pressed }) => [styles.pill, managing && styles.pillOn, !friends.length && !managing && ui.disabled, pressed && ui.pressed]}>
          {managing ? null : <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={16} tintColor={theme.text} />}
          <Text style={[styles.pillText, managing && styles.tabTextSelected]}>{managing ? copy.done : copy.manage}</Text>
        </Pressable>
      </View>
      {/* Blocked people are managed alongside removing friends. */}
      {managing ? <BlockedUsers button={(label, load, loading) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={loading} onPress={load}
        style={({ pressed }) => [styles.pill, styles.pillQuiet, loading && ui.disabled, pressed && ui.pressed]}>
        <SymbolView name={{ ios: 'nosign', android: 'block', web: 'block' }} size={15} tintColor={theme.muted} />
        <Text style={[styles.pillText, { color: theme.muted }]}>{label}</Text></Pressable>} /> : null}
    </>}
  </View>;
}

const createStyles = (theme: PanelTheme, light: boolean) => StyleSheet.create({
  body: { gap: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 40 },
  fairies: { width: 128, height: 88, borderRadius: 14 },
  heroText: { flex: 1, gap: 3 },
  title: { fontFamily: 'serif', fontSize: 32, color: theme.text },
  subtitle: { fontSize: 9, lineHeight: 14, letterSpacing: 2, color: theme.muted },
  selfRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  selfDot: { width: 8, height: 8, borderRadius: 4 },
  tabs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: light ? theme.input : '#123A36' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 999 },
  tabSelected: { backgroundColor: '#F6EBCF', borderWidth: 1.5, borderColor: theme.gold },
  tabText: { fontSize: 14, color: theme.muted, fontWeight: '600' },
  tabTextSelected: { color: '#1E4F4C' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  headingFlower: { fontSize: 16, color: theme.gold },
  sectionTitle: { fontFamily: 'serif', fontSize: 18, color: theme.text },
  count: { fontSize: 14, color: theme.muted },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: theme.gold, backgroundColor: light ? theme.surface : '#173C39' },
  pillOn: { backgroundColor: '#F6EBCF' },
  pillDanger: { borderColor: '#D9796D', backgroundColor: '#D9796D26' },
  pillQuiet: { alignSelf: 'flex-start', borderColor: theme.border },
  pillText: { fontSize: 13, color: theme.text },
  pillPlus: { fontSize: 18, lineHeight: 18, color: theme.gold },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.input },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: theme.text },
  input: { padding: 13, borderRadius: 14, backgroundColor: theme.input, borderWidth: 1, borderColor: theme.border, fontSize: 14, color: theme.text },
  section: { gap: 12, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 16, backgroundColor: theme.surface },
  caption: { fontSize: 12, lineHeight: 18, color: theme.muted },
  presenceDot: { position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderRadius: 16, borderColor: light ? theme.gold : theme.border, backgroundColor: theme.surface },
  resultRow: { gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 16, borderColor: theme.border, backgroundColor: theme.background },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  avatar: { backgroundColor: light ? theme.input : '#315B52', borderColor: theme.gold, borderWidth: 1.5 },
  pending: { gap: 6 },
  pendingItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, gap: 3, minWidth: 0 }, displayName: { fontFamily: 'serif', fontSize: 17, color: theme.text },
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  circleText: { fontSize: 24, lineHeight: 26, fontWeight: '700' },
  removeCircle: { borderColor: '#D9796D', backgroundColor: '#D9796D1A' },
  reportCircle: { borderColor: '#D8B45E', backgroundColor: '#D8B45E1A' },
  acceptCircle: { borderColor: '#7FB77E', backgroundColor: '#7FB77E1A' },
  home: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 10 },
  houseImage: { width: 62, height: 50 },
  chevron: { fontSize: 24, color: theme.muted, marginLeft: 2 },
  homeDisabled: { opacity: .38, filter: [{ grayscale: 1 }, { brightness: .7 }] },
  homeActive: { opacity: .8, transform: [{ scale: .96 }] },
  notice: { gap: 8, padding: 12, marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: theme.surface },
  noticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: theme.gold },
  ornamentStar: { fontSize: 12, color: theme.gold },
  footer: { flexDirection: 'row' },
});
