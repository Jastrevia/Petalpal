import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiRequest } from '../../services/api';
import { FeatureActionButton, ui } from './FeatureUI';
import { usePanelTheme } from './PanelTheme';
const reasons = ['HARASSMENT','HATE_SPEECH','SELF_HARM','SPAM','PRIVACY','OTHER'];
export function SafetyActions({ userId, messageId, onBlocked }: { userId?: string; messageId?: string; onBlocked?: () => void }) {
  const { theme } = usePanelTheme();
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
    <FeatureActionButton secondary title={messageId ? 'Report message' : 'Report / Block user'} onPress={() => { setStatus(''); setOpen(true); }} disabled={busy} />
    <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
        <ScrollView style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.gold }]} contentContainerStyle={{ gap: 8 }}>
          {status ? <Text accessibilityRole="alert" style={[ui.text, { color: theme.text }]}>{status}</Text> : <>
            <Text style={[ui.text, { color: theme.text }]}>Choose a reason. Your identity is not shown to the reported user. Private entries are not included.</Text>
            {reasons.map(category => <FeatureActionButton key={category} secondary title={category.replaceAll('_',' ')} disabled={busy}
              onPress={() => void run(() => apiRequest('/reports','POST',{...(messageId ? {messageId} : {reportedUserId:userId}),category}), 'Report received. Thank you.')} />)}
            {userId ? <><Text style={[ui.text, { color: theme.text }]}>Blocking stops contact and Garden access in both directions and removes friendship. Unblock in Friends.</Text>
              <FeatureActionButton title="Block user" disabled={busy} onPress={() => void run(async () => {
                await apiRequest(`/users/me/blocks/${encodeURIComponent(userId)}`,'PUT'); setBlocked(true);
              }, 'User blocked.')} /></> : null}
          </>}
          <FeatureActionButton secondary title={status ? 'Done' : 'Cancel'} disabled={busy} onPress={close} />
        </ScrollView>
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(8, 24, 22, 0.55)' },
  sheet: { width: '100%', maxWidth: 380, maxHeight: '85%', flexGrow: 0, borderRadius: 18, borderWidth: 1, padding: 16 },
});
export function BlockedUsers() {
  const [users,setUsers] = useState<{id:string;name:string}[]>([]), [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false),[cursor,setCursor]=useState<string|null>(null);
  async function load(after?:string) { setBusy(true); try { const page=await apiRequest<{users:{id:string;name:string}[];nextCursor:string|null}>(`/users/me/blocks${after?'?after='+encodeURIComponent(after):''}`);setUsers(previous=>after?[...previous,...page.users]:page.users);setCursor(page.nextCursor);setStatus(''); } catch(e) { setStatus((e as Error).message); } finally { setBusy(false); } }
  return <View style={{gap:8}}><FeatureActionButton secondary title="Blocked users" onPress={() => void load()} disabled={busy} />
    {users.map(u => <FeatureActionButton key={u.id} secondary title={`Unblock ${u.name}`} disabled={busy} onPress={async () => {
      setBusy(true); try { await apiRequest(`/users/me/blocks/${encodeURIComponent(u.id)}`,'DELETE'); await load(); } catch(e) {setStatus((e as Error).message);} finally {setBusy(false);}
    }} />)}{cursor?<FeatureActionButton secondary title="More blocked users" disabled={busy} onPress={()=>void load(cursor)}/>:null}<Text style={ui.caption}>{status || 'Unblocking does not restore friendship.'}</Text></View>;
}
