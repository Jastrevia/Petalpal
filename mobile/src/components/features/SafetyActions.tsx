import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiRequest } from '../../services/api';
import { sendFriendRequest } from '../../services/friends';
import { UserAvatar } from '../avatars/UserAvatar';
import { FeatureActionButton, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
import { useAppLocale } from '../../services/locale';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';
const reasons = ['HARASSMENT','HATE_SPEECH','SELF_HARM','SPAM','PRIVACY','OTHER'];
const COPY = {
  en: { dislikeIntro: 'Why don’t you like this message? Your identity is not shown to them. Private entries are not included.', dislikeReceived: 'Got it. Thank you for telling us.', reportMessage: 'Report message', reportUser: 'Report / Block user', reason: (r: string) => r.replaceAll('_',' '),
    intro: 'Choose a reason. Your identity is not shown to the reported user. Private entries are not included.', received: 'Report received. Thank you.',
    blockNote: 'Blocking stops contact and Garden access in both directions and removes friendship. You can let them back in Me → Blocked users.', block: 'Block user', blockAsk: 'Block this person? You won’t be able to find each other until you let them back in.', blockYes: 'Yes, block', blocked: 'User blocked. You can let them back in Me → Blocked users.',
    done: 'Done', cancel: 'Cancel', unblock: 'Unblock', more: 'More blocked users', none: 'You haven’t blocked anyone.', loading: 'Loading…',
    unblockAsk: (n: string) => `Let ${n} back in?`, unblockNote: 'You’ll be able to find each other again. You won’t be friends unless you add them.', unblockYes: 'Yes, unblock',
    released: (n: string) => `${n} is unblocked.`, addAsk: 'Would you like to add them as a friend?', add: 'Add friend', adding: 'Sending…', added: 'Friend request sent.', someone: 'PetalPal user' },
  'zh-Hans': { dislikeIntro: '为什么不喜欢这条留言？对方看不到是你提交的，也不会附上你的私人内容。', dislikeReceived: '收到了，谢谢你告诉我们。', reportMessage: '举报留言', reportUser: '举报 / 屏蔽', reason: (r: string) => ({ HARASSMENT: '骚扰', HATE_SPEECH: '仇恨言论', SELF_HARM: '自我伤害', SPAM: '垃圾信息', PRIVACY: '隐私', OTHER: '其他' } as Record<string, string>)[r] ?? r,
    intro: '选一个原因。被举报的人看不到是你举报的，也不会附上你的私人内容。', received: '已收到举报，谢谢你。',
    blockNote: '屏蔽后双方都不能再联系、也不能进对方的花园，好友关系也会解除。之后可以在「我 → 已屏蔽的人」里把对方放出来。', block: '屏蔽这个人', blockAsk: '确定要屏蔽这个人吗？放出来之前，你们都搜不到对方。', blockYes: '确定屏蔽', blocked: '已屏蔽。可以在「我 → 已屏蔽的人」里把对方放出来。',
    done: '完成', cancel: '取消', unblock: '放出来', more: '更多已屏蔽的人', none: '你还没有屏蔽任何人。', loading: '正在加载…',
    unblockAsk: (n: string) => `把 ${n} 放出来吗？`, unblockNote: '放出来后，你们可以重新搜索到对方。除非你加对方，否则不会恢复好友关系。', unblockYes: '确定放出来',
    released: (n: string) => `已把 ${n} 放出来。`, addAsk: '要加对方为好友吗？', add: '加为好友', adding: '正在发送…', added: '好友申请已发送。', someone: 'PetalPal 用户' },
};
// `trigger` replaces the default button, e.g. the ⚠ circle on a Friends row.
// `onReported`: a reason was sent (a message's 👎 counts only then); `dislike` words the sheet for it.
export function SafetyActions({ userId, messageId, onBlocked, trigger, onReported, dislike = false }: { userId?: string; messageId?: string; onBlocked?: () => void;
  trigger?: (open: () => void, busy: boolean) => ReactNode; onReported?: () => void; dislike?: boolean }) {
  const { theme } = usePanelTheme();
  const copy = COPY[useAppLocale()];
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [status,setStatus] = useState('');
  const [blocked,setBlocked] = useState(false), [confirming,setConfirming] = useState(false);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setStatus('');
    try { await action(); setStatus(success); }
    catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }
  // The parent refreshes (and usually removes this row) only after the sheet closes, so the
  // confirmation stays readable and the list never re-lays out under the open choices.
  function close() { setOpen(false); setStatus(''); setConfirming(false); if (blocked) { setBlocked(false); onBlocked?.(); } }
  return <View>
    {trigger ? trigger(() => { setStatus(''); setOpen(true); }, busy)
      : <FeatureActionButton secondary title={messageId ? copy.reportMessage : copy.reportUser} onPress={() => { setStatus(''); setOpen(true); }} disabled={busy} />}
    <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible={open} animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
        <ScrollView style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.gold }]} contentContainerStyle={{ gap: 8 }}>
          {status ? <Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{status}</Text> : <>
            <Text style={[ui.text, { color: theme.text }]}>{dislike ? copy.dislikeIntro : copy.intro}</Text>
            {reasons.map(category => <FeatureActionButton key={category} secondary title={copy.reason(category)} disabled={busy}
              onPress={() => void run(async () => { await apiRequest('/reports','POST',{...(messageId ? {messageId} : {reportedUserId:userId}),category}); onReported?.(); }, dislike ? copy.dislikeReceived : copy.received)} />)}
            {userId ? <><Text style={[ui.text, { color: theme.text }]}>{copy.blockNote}</Text>
              {/* Asked twice: blocking cuts both people off, so it must not happen by a stray tap. */}
              {confirming ? <><Text accessibilityRole="alert" style={[ui.text, { color: theme.text, fontWeight: '700' }]}>{copy.blockAsk}</Text>
                <FeatureActionButton danger title={copy.blockYes} disabled={busy} onPress={() => void run(async () => {
                  await apiRequest(`/users/me/blocks/${encodeURIComponent(userId)}`,'PUT'); setBlocked(true); setConfirming(false);
                }, copy.blocked)} /></>
                : <FeatureActionButton secondary title={copy.block} disabled={busy} onPress={() => setConfirming(true)} />}</> : null}
          </>}
          <FeatureActionButton secondary title={status ? copy.done : copy.cancel} disabled={busy} onPress={close} />
        </ScrollView>
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(8, 24, 22, 0.55)' },
  sheet: { width: '100%', maxWidth: 380, maxHeight: '85%', flexGrow: 0, borderRadius: 18, borderWidth: 1, padding: 16 },
  blockedRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
type BlockedUser={id:string;name:string;avatar?:string|null;accountId?:string|null};
// Me → Blocked users: everyone this person has blocked. Tapping one asks first; once let back in,
// the next step offers to add them as a friend, and the window's own × or a tap outside just leaves.
export function BlockedUsers() {
  const [users,setUsers] = useState<BlockedUser[]>([]), [status,setStatus] = useState('');
  const [busy,setBusy] = useState(true),[cursor,setCursor]=useState<string|null>(null);
  const [asking,setAsking] = useState<BlockedUser|null>(null), [released,setReleased] = useState<BlockedUser|null>(null), [added,setAdded] = useState(false);
  const copy = COPY[useAppLocale()];
  const { theme } = usePanelTheme();
  const text=[ui.text,{color:theme.text}];
  const nameOf=(user:BlockedUser)=>user.name?.trim()||user.accountId||copy.someone;
  const load=useCallback(async(after?:string)=>{
    setBusy(true);
    try { const page=await apiRequest<{users:BlockedUser[];nextCursor:string|null}>(`/users/me/blocks${after?'?after='+encodeURIComponent(after):''}`);
      setUsers(previous=>after?[...previous,...page.users]:page.users);setCursor(page.nextCursor);setStatus(''); }
    catch(e) { setStatus((e as Error).message); }
    finally { setBusy(false); }
  },[]);
  useEffect(()=>{void load();},[load]);
  async function unblock(user:BlockedUser){
    setBusy(true);setStatus('');
    try { await apiRequest(`/users/me/blocks/${encodeURIComponent(user.id)}`,'DELETE');
      setUsers(previous=>previous.filter(item=>item.id!==user.id));setAsking(null);setReleased(user);setAdded(false); }
    catch(e) { setStatus((e as Error).message); }
    finally { setBusy(false); }
  }
  async function addFriend(user:BlockedUser){
    setBusy(true);setStatus('');
    try { await sendFriendRequest(user.id);setAdded(true); }
    catch(e) { setStatus((e as Error).message); }
    finally { setBusy(false); }
  }
  if(released) return <View testID="blocked-released" style={{gap:12}}>
    <Text accessibilityRole="alert" style={text}>{copy.released(nameOf(released))}</Text>
    {added?<Text accessibilityRole="alert" style={text}>{copy.added}</Text>:<><Text style={text}>{copy.addAsk}</Text>
      <FeatureActionButton title={busy?copy.adding:copy.add} disabled={busy} onPress={()=>void addFriend(released)}/></>}
    {status?<Text accessibilityRole="alert" style={[ui.caption,{color:theme.text}]}>{status}</Text>:null}
  </View>;
  if(asking) return <View testID="blocked-confirm" style={{gap:12}}>
    <Text accessibilityRole="header" style={[...text,{fontWeight:'700'}]}>{copy.unblockAsk(nameOf(asking))}</Text>
    <Text style={[ui.caption,{color:theme.muted}]}>{copy.unblockNote}</Text>
    <View style={[ui.row,{flexWrap:'wrap',gap:8}]}>
      <FeatureActionButton title={copy.unblockYes} disabled={busy} onPress={()=>void unblock(asking)}/>
      <FeatureActionButton secondary title={copy.cancel} disabled={busy} onPress={()=>setAsking(null)}/>
    </View>
    {status?<Text accessibilityRole="alert" style={[ui.caption,{color:theme.text}]}>{status}</Text>:null}
  </View>;
  return <View testID="blocked-list" style={{gap:4}}>
    {busy&&!users.length?<ActivityIndicator accessibilityLabel={copy.loading} color={theme.gold}/>:null}
    {!busy&&!users.length&&!status?<Text style={text}>{copy.none}</Text>:null}
    {users.map((user,index)=><Pressable key={user.id} testID={`blocked-${user.id}`} accessibilityRole="button" accessibilityLabel={`${copy.unblock}: ${nameOf(user)}`} disabled={busy} onPress={()=>{setStatus('');setAsking(user);}}
      style={({pressed})=>[styles.blockedRow,{borderColor:theme.border},index===0&&{borderTopWidth:0},pressed&&{opacity:.6}]}>
      <UserAvatar avatar={user.avatar??undefined} size={38}/>
      <View style={{flex:1,minWidth:0}}>
        <Text numberOfLines={1} style={[ui.linkText,{color:theme.text}]}>{nameOf(user)}</Text>
        {user.accountId?<Text numberOfLines={1} style={[ui.caption,{color:theme.muted}]}>@{user.accountId}</Text>:null}
      </View>
      <Text style={[ui.caption,{color:theme.text,fontWeight:'700'}]}>{copy.unblock} ›</Text>
    </Pressable>)}
    {cursor?<FeatureActionButton secondary title={copy.more} disabled={busy} onPress={()=>void load(cursor)}/>:null}
    {status?<Text accessibilityRole="alert" style={[ui.caption,{color:theme.text}]}>{status}</Text>:null}
  </View>;
}
