import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiRequest } from '../../services/api';
import { FeatureActionButton, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
import { useAppLocale } from '../../services/locale';
const reasons = ['HARASSMENT','HATE_SPEECH','SELF_HARM','SPAM','PRIVACY','OTHER'];
const COPY = {
  en: { reportMessage: 'Report message', reportUser: 'Report / Block user', reason: (r: string) => r.replaceAll('_',' '),
    intro: 'Choose a reason. Your identity is not shown to the reported user. Private entries are not included.', received: 'Report received. Thank you.',
    blockNote: 'Blocking stops contact and Garden access in both directions and removes friendship. Unblock in Friends.', block: 'Block user', blocked: 'User blocked.',
    done: 'Done', cancel: 'Cancel', blockedUsers: 'Blocked users', unblock: (n: string) => `Unblock ${n}`, more: 'More blocked users', unblockNote: 'Unblocking does not restore friendship.' },
  'zh-Hans': { reportMessage: '举报留言', reportUser: '举报 / 屏蔽', reason: (r: string) => ({ HARASSMENT: '骚扰', HATE_SPEECH: '仇恨言论', SELF_HARM: '自我伤害', SPAM: '垃圾信息', PRIVACY: '隐私', OTHER: '其他' } as Record<string, string>)[r] ?? r,
    intro: '选一个原因。被举报的人看不到是你举报的，也不会附上你的私人内容。', received: '已收到举报，谢谢你。',
    blockNote: '屏蔽后双方都不能再联系、也不能进对方的花园，好友关系也会解除。可以在「好友」里解除屏蔽。', block: '屏蔽这个人', blocked: '已屏蔽。',
    done: '完成', cancel: '取消', blockedUsers: '已屏蔽的人', unblock: (n: string) => `解除屏蔽 ${n}`, more: '更多已屏蔽的人', unblockNote: '解除屏蔽不会恢复好友关系。' },
};
// `trigger` replaces the default button, e.g. the ⚠ circle on a Friends row.
export function SafetyActions({ userId, messageId, onBlocked, trigger }: { userId?: string; messageId?: string; onBlocked?: () => void;
  trigger?: (open: () => void, busy: boolean) => ReactNode }) {
  const { theme } = usePanelTheme();
  const copy = COPY[useAppLocale()];
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [status,setStatus] = useState('');
  const [blocked,setBlocked] = useState(false);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setStatus('');
    try { await action(); setStatus(success); }
    catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }
  // The parent refreshes (and usually removes this row) only after the sheet closes, so the
  // confirmation stays readable and the list never re-lays out under the open choices.
  function close() { setOpen(false); setStatus(''); if (blocked) { setBlocked(false); onBlocked?.(); } }
  return <View>
    {trigger ? trigger(() => { setStatus(''); setOpen(true); }, busy)
      : <FeatureActionButton secondary title={messageId ? copy.reportMessage : copy.reportUser} onPress={() => { setStatus(''); setOpen(true); }} disabled={busy} />}
    <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
        <ScrollView style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.gold }]} contentContainerStyle={{ gap: 8 }}>
          {status ? <Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{status}</Text> : <>
            <Text style={[ui.text, { color: theme.text }]}>{copy.intro}</Text>
            {reasons.map(category => <FeatureActionButton key={category} secondary title={copy.reason(category)} disabled={busy}
              onPress={() => void run(() => apiRequest('/reports','POST',{...(messageId ? {messageId} : {reportedUserId:userId}),category}), copy.received)} />)}
            {userId ? <><Text style={[ui.text, { color: theme.text }]}>{copy.blockNote}</Text>
              <FeatureActionButton title={copy.block} disabled={busy} onPress={() => void run(async () => {
                await apiRequest(`/users/me/blocks/${encodeURIComponent(userId)}`,'PUT'); setBlocked(true);
              }, copy.blocked)} /></> : null}
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
});
// `button` replaces the default "Blocked users" button, e.g. with a quiet pill in Friends.
export function BlockedUsers({ button }: { button?: (label: string, load: () => void, busy: boolean) => ReactNode } = {}) {
  const [users,setUsers] = useState<{id:string;name:string}[]>([]), [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false),[cursor,setCursor]=useState<string|null>(null);
  const copy = COPY[useAppLocale()];
  async function load(after?:string) { setBusy(true); try { const page=await apiRequest<{users:{id:string;name:string}[];nextCursor:string|null}>(`/users/me/blocks${after?'?after='+encodeURIComponent(after):''}`);setUsers(previous=>after?[...previous,...page.users]:page.users);setCursor(page.nextCursor);setStatus(''); } catch(e) { setStatus((e as Error).message); } finally { setBusy(false); } }
  return <View style={{gap:8}}>{button ? button(copy.blockedUsers, () => void load(), busy) : <FeatureActionButton secondary title={copy.blockedUsers} onPress={() => void load()} disabled={busy} />}
    {users.map(u => <FeatureActionButton key={u.id} secondary title={copy.unblock(u.name)} disabled={busy} onPress={async () => {
      setBusy(true); try { await apiRequest(`/users/me/blocks/${encodeURIComponent(u.id)}`,'DELETE'); await load(); } catch(e) {setStatus((e as Error).message);} finally {setBusy(false);}
    }} />)}{cursor?<FeatureActionButton secondary title={copy.more} disabled={busy} onPress={()=>void load(cursor)}/>:null}<Text style={ui.caption}>{status || copy.unblockNote}</Text></View>;
}
