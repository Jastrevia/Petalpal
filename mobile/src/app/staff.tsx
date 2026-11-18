import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLocale } from '../services/locale';
import { usePanelTheme } from '../components/features/PanelTheme';
import {
  actOnReport, FeedbackStatus, isStaff, loadFeedback, loadReports, ReportAction, StaffFeedback, StaffReport, updateFeedback
} from '../services/staff';

// Staff page: user feedback and the report queue, for the team only (MODERATOR_FIREBASE_UIDS on the
// backend). Report rules: docs/release/MODERATION_RUNBOOK.md. Treat everything here as private.
const COPY = {
  en: {
    title: 'Staff', subtitle: 'Feedback and reports from players', close: 'Close', feedback: 'Feedback', reports: 'Reports',
    denied: 'This page is for the PetalPal team.', failed: 'Could not load. Pull to retry.', retry: 'Retry', empty: 'Nothing here.',
    more: 'Load more', all: 'All', NEW: 'New', READ: 'Read', DONE: 'Done', markRead: 'Mark read', markDone: 'Done', reopen: 'Reopen',
    note: 'Team note', saveNote: 'Save note', from: 'From', reply: 'Reply to', page: 'Page', version: 'Version',
    message: 'Reported message', user: 'Reported player', ai: 'AI output', actions: {
      dismiss: 'Dismiss', 'review-ai': 'Reviewed', 'remove-message': 'Remove message', 'restrict-user': 'Restrict player', 'restore-user': 'Restore player'
    } as Record<ReportAction, string>,
    kinds: { BUG: 'Bug', FEATURE: 'Idea', GENERAL: 'General', AI_CONCERN: 'AI concern', OTHER: 'Other' } as Record<string, string>,
  },
  'zh-Hans': {
    title: '员工页面', subtitle: '玩家的反馈和举报', close: '关闭', feedback: '反馈', reports: '举报',
    denied: '这个页面只给 PetalPal 团队使用。', failed: '加载失败，请重试。', retry: '重试', empty: '暂时没有内容。',
    more: '加载更多', all: '全部', NEW: '新的', READ: '已读', DONE: '已处理', markRead: '标为已读', markDone: '处理完', reopen: '重新打开',
    note: '团队备注', saveNote: '保存备注', from: '来自', reply: '回复邮箱', page: '页面', version: '版本',
    message: '被举报的留言', user: '被举报的玩家', ai: 'AI 内容', actions: {
      dismiss: '驳回', 'review-ai': '已检查', 'remove-message': '删除留言', 'restrict-user': '限制该玩家', 'restore-user': '恢复该玩家'
    } as Record<ReportAction, string>,
    kinds: { BUG: '问题', FEATURE: '建议', GENERAL: '一般', AI_CONCERN: 'AI 问题', OTHER: '其他' } as Record<string, string>,
  },
};
type Copy = typeof COPY.en;
type Theme = ReturnType<typeof usePanelTheme>['theme'];

const when = (iso: string, locale: string) => new Date(iso).toLocaleString(locale === 'zh-Hans' ? 'zh-CN' : 'en-CA',
  { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function StaffScreen() {
  const { theme } = usePanelTheme();
  const insets = useSafeAreaInsets();
  const locale = useAppLocale(), copy = COPY[locale];
  const [access, setAccess] = useState<'checking' | 'staff' | 'denied'>('checking');
  const [tab, setTab] = useState<'feedback' | 'reports'>('feedback');
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    isStaff().then(staff => { if (active) setAccess(staff ? 'staff' : 'denied'); });
    setRevision(value => value + 1);
    return () => { active = false; };
  }, []));

  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>{copy.subtitle}</Text>
      {access === 'checking' ? <ActivityIndicator color={theme.gold} /> : null}
      {access === 'denied' ? <Text style={[styles.body, { color: theme.text }]}>{copy.denied}</Text> : null}
      {access === 'staff' ? <>
        <View style={styles.row}>
          <Chip label={copy.feedback} active={tab === 'feedback'} onPress={() => setTab('feedback')} theme={theme} />
          <Chip label={copy.reports} active={tab === 'reports'} onPress={() => setTab('reports')} theme={theme} />
        </View>
        {tab === 'feedback'
          ? <FeedbackList key={`f${revision}`} copy={copy} theme={theme} locale={locale} />
          : <ReportList key={`r${revision}`} copy={copy} theme={theme} locale={locale} />}
      </> : null}
    </ScrollView>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => router.dismissTo('/')} hitSlop={6}
      style={({ pressed }) => [styles.close, { top: insets.top + 10, right: insets.right + 12, borderColor: theme.gold, backgroundColor: theme.surface }, pressed && styles.pressed]}>
      <Text style={[styles.closeText, { color: theme.text }]}>✕</Text>
    </Pressable>
  </View>;
}

function Chip({ label, active, onPress, theme, disabled }: { label: string; active?: boolean; onPress: () => void; theme: Theme; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.frame : theme.surface }, (pressed || disabled) && styles.pressed]}>
    <Text style={[styles.chipText, { color: active ? '#FFF9EC' : theme.text }]}>{label}</Text>
  </Pressable>;
}

function FeedbackList({ copy, theme, locale }: { copy: Copy; theme: Theme; locale: string }) {
  const [filter, setFilter] = useState<FeedbackStatus | undefined>('NEW');
  const [items, setItems] = useState<StaffFeedback[] | null>(null);
  const [counts, setCounts] = useState<Record<FeedbackStatus, number> | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async (status: FeedbackStatus | undefined, before?: string) => {
    setFailed(false);
    try {
      const page = await loadFeedback(status, before);
      setItems(current => before && current ? [...current, ...page.items] : page.items);
      setCounts(page.counts); setNext(page.nextBefore);
    } catch { setFailed(true); }
  }, []);
  useFocusEffect(useCallback(() => { void load(filter); }, [load, filter]));
  const change = async (item: StaffFeedback, update: { status?: FeedbackStatus; staffNote?: string | null }) => {
    try {
      await updateFeedback(item.id, update);
      setItems(current => current?.map(row => row.id === item.id ? { ...row, ...update } : row) ?? null);
    } catch { setFailed(true); }
  };
  return <View style={styles.list}>
    <View style={styles.row}>
      {(['NEW', 'READ', 'DONE'] as FeedbackStatus[]).map(status =>
        <Chip key={status} label={`${copy[status]}${counts ? ` ${counts[status]}` : ''}`} active={filter === status} onPress={() => setFilter(status)} theme={theme} />)}
      <Chip label={copy.all} active={!filter} onPress={() => setFilter(undefined)} theme={theme} />
    </View>
    {failed ? <Retry copy={copy} theme={theme} onPress={() => void load(filter)} /> : null}
    {items === null && !failed ? <ActivityIndicator color={theme.gold} /> : null}
    {items?.length === 0 ? <Text style={[styles.body, { color: theme.muted }]}>{copy.empty}</Text> : null}
    {items?.map(item => <FeedbackCard key={item.id} item={item} copy={copy} theme={theme} locale={locale} onChange={update => void change(item, update)} />)}
    {next ? <Chip label={copy.more} onPress={() => void load(filter, next)} theme={theme} /> : null}
  </View>;
}

function FeedbackCard({ item, copy, theme, locale, onChange }: { item: StaffFeedback; copy: Copy; theme: Theme; locale: string;
  onChange: (update: { status?: FeedbackStatus; staffNote?: string | null }) => void }) {
  const [note, setNote] = useState(item.staffNote ?? '');
  const meta = [item.user ? `${copy.from} ${item.user.name ?? '—'} · ${item.user.accountId ?? ''}` : null,
    item.route ? `${copy.page} ${item.route}` : null,
    item.appVersion || item.platform ? `${copy.version} ${[item.platform, item.appVersion].filter(Boolean).join(' ')}` : null].filter(Boolean);
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Text style={[styles.cardHead, { color: theme.text }]}>{copy.kinds[item.kind] ?? item.kind} · {copy[item.status]} · {when(item.createdAt, locale)}</Text>
    {item.subject ? <Text style={[styles.cardTitle, { color: theme.text }]}>{item.subject}</Text> : null}
    <Text selectable style={[styles.body, { color: theme.text }]}>{item.message}</Text>
    {meta.map(line => <Text key={line} style={[styles.meta, { color: theme.muted }]}>{line}</Text>)}
    {item.replyEmail ? <Text selectable style={[styles.meta, { color: theme.muted }]}>{copy.reply} {item.replyEmail}</Text> : null}
    <TextInput value={note} onChangeText={setNote} placeholder={copy.note} placeholderTextColor={theme.muted} multiline maxLength={1000}
      style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} />
    <View style={styles.row}>
      {item.status === 'NEW' ? <Chip label={copy.markRead} onPress={() => onChange({ status: 'READ' })} theme={theme} /> : null}
      {item.status !== 'DONE' ? <Chip label={copy.markDone} onPress={() => onChange({ status: 'DONE' })} theme={theme} />
        : <Chip label={copy.reopen} onPress={() => onChange({ status: 'READ' })} theme={theme} />}
      <Chip label={copy.saveNote} disabled={note === (item.staffNote ?? '')} onPress={() => onChange({ staffNote: note.trim() || null })} theme={theme} />
    </View>
  </View>;
}

function ReportList({ copy, theme, locale }: { copy: Copy; theme: Theme; locale: string }) {
  const [reports, setReports] = useState<StaffReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setFailed(false);
    try { setReports(await loadReports()); } catch { setFailed(true); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const act = async (report: StaffReport, action: ReportAction) => {
    setBusy(report.id);
    try { await actOnReport(report.id, action); setReports(current => current?.filter(row => row.id !== report.id) ?? null); }
    catch { setFailed(true); }
    finally { setBusy(null); }
  };
  return <View style={styles.list}>
    {failed ? <Retry copy={copy} theme={theme} onPress={() => void load()} /> : null}
    {reports === null && !failed ? <ActivityIndicator color={theme.gold} /> : null}
    {reports?.length === 0 ? <Text style={[styles.body, { color: theme.muted }]}>{copy.empty}</Text> : null}
    {reports?.map(report => {
      const actions: ReportAction[] = report.aiOutputKind ? ['review-ai', 'dismiss']
        : [...(report.messageId ? ['remove-message' as const] : []), 'restrict-user', 'restore-user', 'dismiss'];
      return <View key={report.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardHead, { color: theme.text }]}>{report.category} · {when(report.createdAt, locale)}</Text>
        {report.aiOutputKind ? <Text style={[styles.meta, { color: theme.muted }]}>{copy.ai}: {report.aiOutputKind} · {report.aiOutputId}</Text> : null}
        {report.reportedUser ? <Text style={[styles.meta, { color: theme.muted }]}>{copy.user}: {report.reportedUser.name ?? '—'} · {report.reportedUser.accountId ?? ''}</Text> : null}
        {report.message ? <>
          <Text style={[styles.meta, { color: theme.muted }]}>{copy.message}</Text>
          <Text selectable style={[styles.body, { color: theme.text }]}>{report.message.text}</Text>
        </> : null}
        <View style={styles.row}>
          {actions.map(action => <Chip key={action} label={copy.actions[action]} disabled={busy === report.id} onPress={() => void act(report, action)} theme={theme} />)}
        </View>
      </View>;
    })}
  </View>;
}

function Retry({ copy, theme, onPress }: { copy: Copy; theme: Theme; onPress: () => void }) {
  return <View style={styles.row}>
    <Text style={[styles.body, { color: theme.text }]}>{copy.failed}</Text>
    <Chip label={copy.retry} onPress={onPress} theme={theme} />
  </View>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18, gap: 12 },
  close: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20 },
  pressed: { opacity: 0.6 },
  title: { fontFamily: 'serif', fontSize: 30, fontWeight: '600', marginTop: 6 },
  subtitle: { fontFamily: 'serif', fontSize: 15, marginTop: -6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  list: { gap: 12 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardHead: { fontSize: 13, fontWeight: '600' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  meta: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 44, fontSize: 14 },
});
