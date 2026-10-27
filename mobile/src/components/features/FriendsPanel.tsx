import { CommunityGuidelines } from './CommunityGuidelines';
import { SafetyActions, BlockedUsers } from './SafetyActions';
import { usePanelTheme, type PanelTheme } from './PanelTheme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useAuth } from '../../services/auth';
import { loadFriends, loadFriendRequests, searchFriends, sendFriendRequest, respondToFriendRequest,
  removeFriend, type FriendUser, type FriendRequest, type FriendRequests } from '../../services/friends';
import { FEATURE_COLORS as colors, FeatureActionButton, ui } from './FeatureUI';
import { UserAvatar } from '../avatars/UserAvatar';
import { subscribeUserRealtime, userRealtimeConnected } from '../../services/userRealtime';

export function FriendsPanel({ addingFriend = false, onAddFriend = () => {}, onCloseAddFriend = () => {}, onClose = () => {} }: {
  addingFriend?: boolean; onAddFriend?: () => void; onCloseAddFriend?: () => void; onClose?: () => void;
} = {}) {
  const { theme, light } = usePanelTheme();
  const styles = createStyles(theme, light);
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
  const refresh = useCallback(() => run('Loading friends…', reload), [run, reload]);
  useEffect(() => {
    mounted.current = true; locked.current = false;
    setFriends([]); setRequests({ incoming: [], outgoing: [] }); setResults([]);
    setSearch(''); setSearched(false); setRemoving(null); setError(''); setMessage('');
    setFilter('');
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  async function findFriends() {
    if (!search.trim()) return;
    await run('Searching…', async active => {
      setResults([]); setSearched(false);
      const users = await searchFriends(search);
      if (active()) { setResults(users.filter(user => user.id !== ownerId)); setSearched(true); }
    });
  }
  async function send(user: FriendUser) {
    if (user.id === ownerId || friends.some(friend => friend.id === user.id) ||
      requests.outgoing.some(request => request.receiverId === user.id) ||
      requests.incoming.some(request => request.senderId === user.id)) return;
    await run('Sending request…', async active => {
      const response = await sendFriendRequest(user.id);
      if (!active()) return;
      if (response.request) setRequests(current => ({ ...current, outgoing: [...current.outgoing, response.request!] }));
      setMessage(response.message || 'Friend request sent.');
      await reload(active);
    });
  }
  async function respond(request: FriendRequest, action: 'accept' | 'reject') {
    if (request.receiverId !== ownerId) return;
    await run('Updating request…', async active => {
      const response = await respondToFriendRequest(request.id, action);
      if (!active()) return;
      setRequests(current => ({ ...current, incoming: current.incoming.filter(item => item.id !== request.id) }));
      if (action === 'accept' && request.sender) setFriends(current => [...current, request.sender!]);
      setMessage(response.message || `Friend request ${action === 'accept' ? 'accepted' : 'rejected'}.`);
      await reload(active);
    });
  }
  async function confirmRemove() {
    if (!removing) return;
    const friendId = removing.id;
    await run('Removing friend…', async active => {
      const response = await removeFriend(friendId);
      if (!active()) return;
      setFriends(current => current.filter(friend => friend.id !== friendId)); setRemoving(null);
      setMessage(response.message || 'Friend removed successfully.');
      await reload(active);
    });
  }
  function visit(friend: FriendUser) {
    if (busy || !mounted.current || scope.current !== currentScope || friend.allowGardenVisits !== true) return;
    onClose();
    router.push({ pathname: '/visit/[ownerId]', params: { ownerId: friend.id } });
  }
  function identity(user?: FriendUser, showPresence = false) {
    const online = user ? live[user.id] ?? user.online === true : false;
    return <View style={styles.identity}>
      <View><UserAvatar avatar={user?.avatar} size={44} style={styles.avatar} />
        {showPresence ? <View style={[styles.presenceDot, { backgroundColor: online ? '#7FB77E' : '#9AA79F', borderColor: theme.surface }]} /> : null}</View>
      <View style={styles.name}><Text style={styles.displayName}>{user?.displayName?.trim() || user?.name?.trim() || user?.accountId || user?.id || 'PetalPal user'}</Text>
        <Text style={styles.caption}>{showPresence ? (online ? 'Online' : 'Offline') + ' · ' : ''}{user?.accountId ? `@${user.accountId}` : 'No username set'}</Text>
      </View>
    </View>;
  }

  if (!ownerId) return <Text style={styles.caption}>Sign in to see your friends.</Text>;
  return <View style={styles.body}>
    <View style={styles.hero}>
      <View style={styles.heroIdentity}>
        <Image source={require('../../../assets/friends/fairies.png')} style={styles.fairies} resizeMode="cover" accessible={false} />
        <View style={styles.name}><Text accessibilityRole="header" style={styles.title}>Friends</Text>
          <Text style={styles.subtitle}>GOOD FRIENDS{ '\n' }BRIGHTER GARDENS</Text>
          <Text testID="self-presence" style={styles.caption}>{selfOnline ? '● You’re online' : '○ You’re offline'}</Text></View>
      </View>
      <View style={styles.topActions}>
        <View style={styles.topAction}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add Friends" disabled={!!busy}
            onPress={onAddFriend} style={({ pressed }) => [styles.circle, !!busy && ui.disabled, pressed && ui.pressed]}>
            <SymbolView name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }} size={26} tintColor="#235650" />
          </Pressable><Text style={styles.actionLabel}>Add Friends</Text>
        </View>
        <View style={styles.topAction}>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh Friends" disabled={!!busy}
            onPress={() => void refresh()} style={({ pressed }) => [styles.circle, !!busy && ui.disabled, pressed && ui.pressed]}>
            <SymbolView name={{ ios: 'arrow.triangle.2.circlepath', android: 'refresh', web: 'refresh' }} size={27} tintColor="#235650" />
          </Pressable><Text style={styles.actionLabel}>Refresh</Text>
        </View>
      </View>
    </View>
    {busy ? <View style={ui.row}><ActivityIndicator accessibilityLabel={busy} color={colors.primary} />
      <Text style={styles.caption}>{busy}</Text></View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.caption}>{error}</Text> : null}
    {message ? <Text style={styles.caption}>{message}</Text> : null}
    <TextInput accessibilityLabel="Search friends" placeholder="Search friends by name / account ID…" placeholderTextColor={theme.muted}
      value={filter} onChangeText={setFilter} style={styles.input} />
    {addingFriend ? <View style={styles.section}><Text style={styles.sectionTitle}>Add Friends</Text>
      <TextInput accessibilityLabel="Search by display name" placeholder="Name / username / account ID"
        placeholderTextColor={theme.muted} value={search} editable={!busy} autoCapitalize="none"
        maxLength={80} onChangeText={value => { setSearch(value); setResults([]); setSearched(false); }}
        onSubmitEditing={() => void findFriends()} returnKeyType="search" style={styles.input} />
      <FeatureActionButton title="Search" disabled={!!busy || !search.trim()} onPress={() => void findFriends()} />
      <FeatureActionButton secondary title="Back to Friends" onPress={onCloseAddFriend} />
      {searched && !results.length ? <Text style={styles.caption}>No matching users found.</Text> : null}
      {results.map(user => {
        const isFriend = friends.some(friend => friend.id === user.id);
        const outgoing = requests.outgoing.some(request => request.receiverId === user.id);
        const incoming = requests.incoming.some(request => request.senderId === user.id);
        return <View key={user.id} style={styles.listRow}>{identity(user)}<SafetyActions userId={user.id} onBlocked={() => { setResults([]); void refresh(); }} />
          <FeatureActionButton secondary title={isFriend ? 'Already Friends' : outgoing ? 'Request Sent' : incoming ? 'Incoming Request' : 'Add Friend'}
            disabled={!!busy || isFriend || outgoing || incoming} onPress={() => void send(user)} />
        </View>;
      })}
    </View> : null}
    <CommunityGuidelines />
    <BlockedUsers />
    <Text style={styles.sectionTitle}>Friend Requests  ·  {requests.incoming.length}</Text>
    {requests.incoming.map(request => <View key={request.id} style={styles.listRow}>
      {identity(request.sender)}<SafetyActions userId={request.senderId} onBlocked={() => void refresh()} />
      <View style={styles.requestActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${request.sender?.name || 'friend request'}`}
          disabled={!!busy} onPress={() => void respond(request, 'accept')} style={({ pressed }) => [styles.smallAction, !!busy && ui.disabled, pressed && ui.pressed]}>
          <Text style={styles.actionText}>✓</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Reject ${request.sender?.name || 'friend request'}`}
          disabled={!!busy} onPress={() => void respond(request, 'reject')} style={({ pressed }) => [styles.smallAction, styles.reject, !!busy && ui.disabled, pressed && ui.pressed]}>
          <Text style={[styles.actionText, styles.rejectText]}>×</Text>
        </Pressable>
      </View>
    </View>)}
    {!busy && !requests.incoming.length ? <Text style={styles.caption}>No pending requests.</Text> : null}
    <Text style={styles.sectionTitle}>My Friends  ·  {friends.length}</Text>
      {!busy && !friends.length ? <Text style={styles.caption}>You have not added any friends yet.</Text> : null}
      {friends.filter(friend => `${friend.displayName || ''} ${friend.name} ${friend.accountId || ''} ${friend.id}`.toLowerCase().includes(filter.trim().toLowerCase())).map(friend => {
        const allowed = friend.allowGardenVisits === true;
        return <View key={friend.id} testID={`friend-${friend.id}`} style={styles.listRow}>
          <Pressable style={styles.identity} accessibilityRole="button" accessibilityLabel={`Remove ${friend.name}`}
            disabled={!!busy} onLongPress={() => setRemoving(friend)} onPress={() => setRemoving(friend)}>
            {identity(friend, true)}
          </Pressable>
          <SafetyActions userId={friend.id} onBlocked={() => void refresh()} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Visit ${friend.name}'s Garden`}
            accessibilityHint={allowed ? 'Open Garden as a visitor' : friend.allowGardenVisits === false ? 'Garden visits are private' : 'Garden access has not been verified'}
            accessibilityState={{ disabled: !allowed || !!busy }} disabled={!allowed || !!busy} testID={`visit-${friend.id}`}
            onPress={allowed && !busy ? () => visit(friend) : undefined}
            style={({ pressed }) => [styles.home, !allowed && styles.homeDisabled, allowed && pressed && styles.homeActive]}>
            <Image source={light ? require('../../../assets/friends/visitor-home-transparent.png') : require('../../../assets/friends/garden-house.png')} style={styles.houseImage} resizeMode="contain" accessible={false} />
          </Pressable>
        </View>;
      })}
      {removing ? <View style={ui.notice}>
        <Text style={styles.caption}>Remove {removing.name} from your friends list?</Text>
        <FeatureActionButton secondary title="Cancel removal" disabled={!!busy} onPress={() => setRemoving(null)} />
        <FeatureActionButton title="Confirm removal" disabled={!!busy} onPress={() => void confirmRemove()} />
      </View> : null}
    <View style={styles.section}><Text style={styles.sectionTitle}>Outgoing Requests</Text>
      {!busy && !requests.outgoing.length ? <Text style={styles.caption}>No outgoing requests.</Text> : null}
      {requests.outgoing.map(request => <View key={request.id} style={styles.pending}>
        <UserAvatar avatar={request.receiver?.avatar} size={24} />
        <Text style={styles.caption}>{request.receiver?.name || 'PetalPal user'} · Pending</Text>
      </View>)}
    </View>
  </View>;
}

const createStyles = (theme: PanelTheme, light: boolean) => StyleSheet.create({
  body: { gap: 14 },
  hero: { gap: 12 },
  heroIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fairies: { width: 106, height: 76, borderRadius: 12 },
  title: { fontFamily: 'serif', fontSize: 34, color: theme.text },
  subtitle: { fontSize: 9, lineHeight: 16, letterSpacing: 2, color: theme.muted },
  topActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18 },
  topAction: { alignItems: 'center', gap: 6 },
  circle: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: light ? theme.gold : '#CCAA69',
    backgroundColor: light ? theme.input : '#EAE8D7', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 3px #fff8e4' },
  actionLabel: { color: theme.text, fontSize: 12, fontFamily: 'serif' },
  input: { padding: 13, borderRadius: light ? 14 : 24, backgroundColor: theme.input, borderWidth: 1,
    borderColor: light ? theme.border : '#BCA46E', fontSize: 14, color: theme.text },
  section: { gap: 12, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: light ? 20 : 16, backgroundColor: theme.surface },
  sectionTitle: { fontFamily: 'serif', fontSize: 20, color: theme.text, marginTop: 6 },
  caption: { fontSize: 12, lineHeight: 18, color: theme.muted },
  presenceDot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 10,
    borderWidth: 1, borderRadius: light ? 20 : 16, borderColor: light ? theme.gold : theme.border, backgroundColor: theme.surface, flexWrap: 'wrap' },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 100 },
  avatar: { backgroundColor: light ? theme.input : '#315B52', borderColor: light ? theme.gold : '#C7A86B', borderWidth: 1 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, gap: 4 }, displayName: { fontFamily: 'serif', fontSize: 17, color: theme.text },
  requestActions: { flexDirection: 'row', gap: 8 },
  smallAction: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22,
    borderWidth: 2, borderColor: '#CBA365', backgroundColor: '#E2E5D3' },
  actionText: { fontSize: 28, fontWeight: '700', color: '#265D54' },
  reject: { backgroundColor: '#F4C5B9', borderColor: '#DEAC77' }, rejectText: { color: '#A53E37' },
  home: { width: 66, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 10, overflow: 'hidden' },
  houseImage: { width: 66, height: 52 },
  homeDisabled: { opacity: .38, filter: [{ grayscale: 1 }, { brightness: .7 }] },
  homeActive: { opacity: .8, transform: [{ scale: .96 }] },
});
