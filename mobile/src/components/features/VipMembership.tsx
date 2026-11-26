import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePanelTheme } from './PanelTheme';
import { FeatureActionButton, FeatureSection, ui } from './FeatureUI';
import { useAuth } from '../../services/auth';
import { useAppLocale, type AppLocale } from '../../services/locale';
import { loadBilling, loadServerPlans, plansToShow, syncBilling, type BillingSummary, type ShownPlan } from '../../services/billing';
import { buyPackage, manageSubscription, restoreStorePurchases, storeAvailable, storePackages } from '../../services/purchases';
import { MODAL_ORIENTATIONS } from '../../constants/orientation';

// PetalPal VIP (docs/billing/BILLING.md): Me shows where the owner stands and opens the membership
// sheet, which offers the two plans the server has on sale with the store's own prices, restores
// and manages purchases, and carries the subscription terms Apple asks for (length, price,
// auto-renewal, Terms and Privacy links). What VIP unlocks is decided by the server. On the web
// VIP is only shown: it is bought in the iPhone app.
const CREST = require('@/assets/keepsakes/crocus-brooch.webp');
const GOLD = '#C9A96E', INK = '#234A3F';

const EN = {
    section: 'PetalPal VIP', open: 'See VIP', details: 'VIP details', loading: 'Loading VIP',
    free: 'You are on the free Garden.', trials: (n: number) => `${n} AI-written Weekly ${n === 1 ? 'letter' : 'letters'} left to try.`,
    founder: 'Founding Member · VIP for life', monthly: (date: string | null, renews: boolean) => date ? (renews ? `VIP · renews ${date}` : `VIP · until ${date}`) : 'VIP',
    grace: 'There is a problem with your payment. Update it in your App Store account to keep VIP.',
    eyebrow: 'GROW A LITTLE FURTHER', title: 'PetalPal VIP', close: 'Close',
    benefits: (flowers: number) => [`${flowers} new flowers a day, instead of 2`, 'A Weekly letter written for you, every week', 'A Monthly letter that looks back on your month', '3 Petal Tarot readings every week'],
    everyone: 'Your Garden, journal, Events and emotion insights stay free for everyone.',
    lifetime: 'Founding Member', lifetimeSub: 'VIP for life', until: (date: string) => `Until ${date}`, limited: 'LIMITED',
    month: 'Monthly', monthSub: 'Cancel anytime', unitMonth: 'per month', unitOnce: 'one time',
    // What each plan includes, each with what the free Garden has instead (lib/billing.js limits).
    perks: [['3 new flowers a day', 'Free: 2'], ['A Weekly letter written for you, every week', 'Free: 2 to try'],
      ['A Monthly letter written for you', 'Free: a short summary'], ['3 Petal Tarot readings a week', 'Free: 3 in all']] as [string, string][],
    founderPerks: ['Pay once, yours for life', 'Founding Member title in Me', 'Everything VIP adds later'],
    monthlyPerks: ['Everything VIP adds later'],
    buyLifetime: 'Buy once', buyMonthly: 'Subscribe',
    restore: 'Restore purchases', manage: 'Manage subscription',
    web: 'VIP is bought in the PetalPal iPhone app. Once you join there, it shows here too.',
    soon: 'VIP opens soon.', none: 'VIP is not on sale in this build yet.',
    failed: 'That did not go through. Please try again.', retry: 'Try again',
    thanks: (founder: boolean): string => founder ? 'Welcome, Founding Member. Thank you for growing with us.' : 'Welcome to VIP. Thank you for growing with us.',
    pending: 'Your purchase went through. VIP will show here in a moment.',
    restored: 'Your purchases are restored.', nothing: 'No PetalPal purchases were found for this Apple ID.',
    terms: 'Terms of Use', privacy: 'Privacy Policy',
    legal: 'Monthly VIP renews automatically every month at the price shown unless you cancel at least 24 hours before the end of the month. Payment is charged to your Apple ID when you confirm, and renewals in the 24 hours before each month ends. Manage or cancel anytime in your App Store account settings. Founding Member is a one-time purchase.',
};
type Copy = typeof EN;
const COPY: Record<AppLocale, Copy> = {
  en: EN,
  'zh-Hans': {
    section: 'PetalPal 会员', open: '了解会员', details: '会员详情', loading: '正在加载会员信息',
    free: '你正在使用免费花园。', trials: (n: number) => `还可以试读 ${n} 封 AI 写的周报信。`,
    founder: '创始会员 · 终身会员', monthly: (date: string | null, renews: boolean) => date ? (renews ? `会员 · ${date} 自动续订` : `会员 · 有效至 ${date}`) : '会员',
    grace: '付款遇到问题。请在 App Store 账户里更新付款方式，以保留会员。',
    eyebrow: '让花园再多长一点', title: 'PetalPal 会员', close: '关闭',
    benefits: (flowers: number) => [`每天可以种 ${flowers} 朵新花（免费为 2 朵）`, '每周都有一封为你写的周报信', '每月一封回望这个月的月报信', '每周 3 次花语塔罗解读'],
    everyone: '花园、日记、事件和情绪洞察，对所有人都一直免费。',
    lifetime: '创始会员', lifetimeSub: '终身会员', until: (date: string) => `至 ${date}`, limited: '限时',
    month: '按月会员', monthSub: '可随时取消', unitMonth: '每月', unitOnce: '一次买断',
    perks: [['每天 3 朵新花', '免费 2 朵'], ['每周一封为你写的周报信', '免费可试读 2 封'],
      ['每月一封为你写的月报信', '免费为简要回顾'], ['每周 3 次花语塔罗解读', '免费共 3 次']] as [string, string][],
    founderPerks: ['一次付款，永久有效', '「我」页面的创始会员称号', '以后新增的会员内容'],
    monthlyPerks: ['以后新增的会员内容'],
    buyLifetime: '立即买断', buyMonthly: '按月订阅',
    restore: '恢复购买', manage: '管理订阅',
    web: '会员请在 PetalPal iPhone App 里购买。加入后，这里也会显示。',
    soon: '会员即将开放。', none: '这个版本暂时还不能购买会员。',
    failed: '没有成功，请再试一次。', retry: '再试一次',
    thanks: (founder: boolean) => founder ? '欢迎你，创始会员。谢谢你和我们一起生长。' : '欢迎加入会员。谢谢你和我们一起生长。',
    pending: '购买已经完成，会员状态马上就会显示。',
    restored: '已恢复你的购买。', nothing: '这个 Apple ID 下没有找到 PetalPal 的购买记录。',
    terms: '使用条款', privacy: '隐私政策',
    legal: '按月会员会在每月结束前按显示的价格自动续订，除非你在当月结束前至少 24 小时取消。确认购买时由你的 Apple ID 付款，之后在每月结束前 24 小时内续订扣款。可随时在 App Store 账户设置里管理或取消。创始会员为一次性购买。',
  },
};

const dateText = (iso: string | null, locale: AppLocale) => iso
  ? new Date(iso).toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

// On a plan card (narrow): numbers only, so it stays on one line.
const shortDate = (iso: string, locale: AppLocale) =>
  new Date(iso).toLocaleDateString(locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });

/** One line on where the owner stands (Me, and the sheet's top). */
export function vipStatus(summary: BillingSummary, copy: Copy, locale: AppLocale) {
  if (summary.vip && summary.founder) return copy.founder;
  if (summary.vip) return copy.monthly(dateText(summary.expiresAt, locale), summary.willRenew);
  return copy.free;
}

/** Me → PetalPal VIP. Hidden while the server has no billing (an older backend). */
export function VipSettings() {
  const { theme } = usePanelTheme();
  const { session } = useAuth();
  const locale = useAppLocale();
  const copy = COPY[locale];
  const [summary, setSummary] = useState<BillingSummary | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const ownerId = session?.user.id;
  useEffect(() => {
    if (!ownerId) return;
    let current = true;
    loadBilling().then(next => { if (current) setSummary(next); }).catch(() => { if (current) setSummary(null); });
    return () => { current = false; };
  }, [ownerId]);
  if (!ownerId || summary === null) return null;
  return <FeatureSection title={copy.section}>
    {summary === undefined ? <ActivityIndicator accessibilityLabel={copy.loading} color={GOLD} /> : <>
      <Text style={[ui.text, { color: theme.text }]}>{vipStatus(summary, copy, locale)}</Text>
      {summary.inGracePeriod ? <Text style={[ui.caption, { color: theme.text }]}>{copy.grace}</Text> : null}
      {!summary.vip && summary.enforced && summary.benefits.weeklyAiTrialsLeft != null
        ? <Text style={[ui.caption, { color: theme.muted }]}>{copy.trials(summary.benefits.weeklyAiTrialsLeft)}</Text> : null}
      <FeatureActionButton testID="vip-open" title={summary.vip ? copy.details : copy.open} onPress={() => setOpen(true)} />
    </>}
    {open && summary ? <VipSheet ownerId={ownerId} summary={summary} onSummary={setSummary} onClose={() => setOpen(false)} /> : null}
  </FeatureSection>;
}

type Note = { text: string; kind: 'info' | 'error' } | null;

export function VipSheet({ ownerId, summary, onSummary, onClose }: {
  ownerId: string; summary: BillingSummary; onSummary: (next: BillingSummary) => void; onClose: () => void;
}) {
  const { theme } = usePanelTheme();
  const locale = useAppLocale();
  const copy = COPY[locale];
  const [plans, setPlans] = useState<ShownPlan[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  useEffect(() => {
    let current = true;
    Promise.all([loadServerPlans(), storeAvailable ? storePackages(ownerId) : Promise.resolve([])])
      .then(([server, packages]) => { if (current) { setLoadFailed(false); setPlans(plansToShow(server, packages)); } })
      .catch(() => { if (current) { setLoadFailed(true); setPlans([]); } });
    return () => { current = false; };
  }, [ownerId, reloads]);

  const afterStore = async (bought: boolean) => {
    try {
      const next = await syncBilling();
      onSummary(next);
      setNote({ kind: 'info', text: next.vip ? (bought ? copy.thanks(next.founder) : copy.restored) : (bought ? copy.pending : copy.nothing) });
    } catch {
      setNote({ kind: 'info', text: bought ? copy.pending : copy.failed });
    }
  };
  const buy = async (plan: ShownPlan) => {
    if (busy) return;
    setBusy(true); setNote(null);
    try { if (await buyPackage(ownerId, plan.pkg) === 'bought') await afterStore(true); }
    catch { setNote({ kind: 'error', text: copy.failed }); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try { await restoreStorePurchases(ownerId); await afterStore(false); }
    catch { setNote({ kind: 'error', text: copy.failed }); }
    finally { setBusy(false); }
  };
  const openUrl = (url?: string) => { if (url) void Linking.openURL(url); };

  const offer = !summary.vip;
  const empty = plans && !plans.length;
  return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View testID="vip-sheet" style={[styles.panel, { backgroundColor: theme.background }]}>
        <View pointerEvents="none" style={styles.inset} />
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} hitSlop={10} style={styles.close}>
          <Text style={[styles.closeText, { color: theme.text }]}>×</Text>
        </Pressable>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Image source={CREST} style={styles.crest} resizeMode="contain" accessible={false} />
          <Text style={[styles.eyebrow, { color: theme.muted }]}>{copy.eyebrow}</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
          <Text style={[styles.status, { color: theme.text }]}>{vipStatus(summary, copy, locale)}</Text>

          {/* With plan cards each card lists what it includes; otherwise (already VIP, or the web) one list. */}
          {offer && plans?.length ? <Text style={[styles.small, styles.center, { color: theme.muted }]}>{copy.everyone}</Text> : <View style={styles.benefits}>
            {copy.benefits(3).map(line => <View key={line} style={styles.benefit}>
              <View style={styles.dot} /><Text style={[styles.body, { color: theme.text }]}>{line}</Text>
            </View>)}
            <Text style={[styles.small, { color: theme.muted }]}>{copy.everyone}</Text>
          </View>}

          {offer ? <View style={styles.plans}>
            {plans === null ? <ActivityIndicator accessibilityLabel={copy.loading} color={GOLD} /> : null}
            {/* Side by side, like a shop shelf: Founding Member (while it lasts) beside Monthly, the same
                height, prices in the same row; stacked only on a very narrow screen. */}
            {plans?.length ? <View style={styles.shelf}>
              {plans.map(plan => {
                const lifetime = plan.plan === 'LIFETIME';
                return <View key={plan.plan} testID={`vip-plan-${plan.plan}`} style={[styles.plan, lifetime && styles.planForward]}>
                  {lifetime ? <View style={styles.ribbon}><Text style={styles.ribbonText}>{copy.limited}</Text></View> : null}
                  <View style={styles.planTop}>
                    <Text style={[styles.planTitle, lifetime && styles.planTitleForward]}>{lifetime ? copy.lifetime : copy.month}</Text>
                    <Text style={styles.planPrice} adjustsFontSizeToFit numberOfLines={1}>{plan.price}</Text>
                    <Text style={styles.planUnit}>{lifetime ? copy.unitOnce : copy.unitMonth}</Text>
                    <Text style={styles.planUntil}>{lifetime ? (plan.endsAt ? copy.until(shortDate(plan.endsAt, locale)) : copy.lifetimeSub) : copy.monthSub}</Text>
                    <View style={[styles.rule, lifetime && styles.ruleForward]} />
                    {(lifetime ? copy.founderPerks : copy.monthlyPerks).map(line => <View key={line} style={styles.perk}>
                      <Text style={[styles.check, lifetime && styles.checkForward]}>✓</Text>
                      <Text style={[styles.perkText, lifetime && styles.perkForward]}>{line}</Text>
                    </View>)}
                    {copy.perks.map(([line, free]) => <View key={line} style={styles.perk}>
                      <Text style={styles.check}>✓</Text>
                      <View style={styles.perkBody}><Text style={styles.perkText}>{line}</Text><Text style={styles.perkFree}>{free}</Text></View>
                    </View>)}
                  </View>
                  <Pressable testID={`vip-buy-${plan.plan}`} accessibilityRole="button"
                    accessibilityLabel={`${lifetime ? copy.lifetime : copy.month}, ${plan.price} ${lifetime ? copy.unitOnce : copy.unitMonth}`}
                    disabled={busy} onPress={() => void buy(plan)}
                    style={({ pressed }) => [styles.buy, lifetime && styles.buyForward, busy && ui.disabled, pressed && ui.pressed]}>
                    <Text style={styles.buyText} numberOfLines={1}>{lifetime ? copy.buyLifetime : copy.buyMonthly}</Text>
                  </Pressable>
                </View>;
              })}
            </View> : null}
            {empty ? <Text style={[styles.body, styles.center, { color: theme.text }]}>
              {Platform.OS === 'web' ? copy.web : loadFailed ? copy.failed : storeAvailable ? copy.none : copy.soon}</Text> : null}
            {empty && loadFailed ? <FeatureActionButton title={copy.retry} secondary onPress={() => setReloads(n => n + 1)} /> : null}
          </View> : null}

          {busy ? <ActivityIndicator color={GOLD} /> : null}
          {note ? <Text accessibilityRole={note.kind === 'error' ? 'alert' : 'text'} style={[styles.body, styles.center, { color: theme.text }]}>{note.text}</Text> : null}

          {storeAvailable ? <View style={styles.links}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()} hitSlop={8}>
              <Text style={[styles.link, { color: theme.text }]}>{copy.restore}</Text>
            </Pressable>
            {summary.vip && summary.plan === 'MONTHLY' ? <Pressable accessibilityRole="button" onPress={() => void manageSubscription().catch(() => setNote({ kind: 'error', text: copy.failed }))} hitSlop={8}>
              <Text style={[styles.link, { color: theme.text }]}>{copy.manage}</Text>
            </Pressable> : null}
          </View> : null}

          {offer ? <Text style={[styles.legal, { color: theme.muted }]}>{copy.legal}</Text> : null}
          <View style={styles.links}>
            <Pressable accessibilityRole="link" onPress={() => openUrl(process.env.EXPO_PUBLIC_TERMS_URL)} hitSlop={8}><Text style={[styles.link, { color: theme.muted }]}>{copy.terms}</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => openUrl(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)} hitSlop={8}><Text style={[styles.link, { color: theme.muted }]}>{copy.privacy}</Text></Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const serif = Platform.select({ ios: 'Georgia', default: 'serif' });
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24 },
  backdrop: { backgroundColor: 'rgba(8, 20, 18, 0.55)' },
  panel: { width: '100%', maxWidth: 440, maxHeight: '100%', borderRadius: 30, borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  inset: { position: 'absolute', top: 5, right: 5, bottom: 5, left: 5, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(201, 169, 110, 0.4)' },
  close: { position: 'absolute', top: 12, right: 14, zIndex: 2, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 26, lineHeight: 28 },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 24, gap: 10, alignItems: 'stretch' },
  crest: { width: 84, height: 84, alignSelf: 'center' },
  eyebrow: { fontSize: 12, letterSpacing: 2.4, textAlign: 'center' },
  title: { fontFamily: serif, fontSize: 30, lineHeight: 36, textAlign: 'center' },
  status: { fontSize: 14, lineHeight: 20, textAlign: 'center', opacity: 0.9 },
  benefits: { gap: 8, marginTop: 6 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginTop: 8 },
  body: { flex: 1, fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  center: { textAlign: 'center', flex: 0 },
  plans: { gap: 12, marginTop: 14 },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' },
  plan: { flexGrow: 1, flexBasis: 130, backgroundColor: '#EEE8D8', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(201, 169, 110, 0.7)',
    paddingHorizontal: 11, paddingTop: 18, paddingBottom: 12, justifyContent: 'space-between', gap: 12 },
  // Founding Member: the warm, raised card with a ribbon on its top edge.
  planForward: { borderWidth: 2, borderColor: GOLD, backgroundColor: '#FCEFD9',
    shadowColor: '#E9B470', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  ribbon: { position: 'absolute', top: -11, alignSelf: 'center', backgroundColor: '#B98A4E', borderRadius: 11, borderWidth: 1, borderColor: '#F6D9A8',
    paddingHorizontal: 12, paddingVertical: 3 },
  ribbonText: { fontSize: 10.5, letterSpacing: 1.8, color: '#FFF9EC', fontWeight: '700' },
  planTop: { alignItems: 'center', gap: 2 },
  planTitle: { fontFamily: serif, fontSize: 17, color: INK, textAlign: 'center' },
  planTitleForward: { color: '#7A4E1E' },
  planPrice: { fontSize: 27, lineHeight: 33, fontWeight: '700', color: INK, marginTop: 4 },
  planUnit: { fontSize: 12.5, color: INK, opacity: 0.8 },
  planUntil: { fontSize: 12, color: '#9A6A3A', textAlign: 'center', marginTop: 2 },
  rule: { alignSelf: 'stretch', height: 1, backgroundColor: 'rgba(201, 169, 110, 0.45)', marginTop: 10, marginBottom: 6 },
  ruleForward: { backgroundColor: 'rgba(185, 138, 78, 0.6)' },
  perk: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3 },
  check: { fontSize: 12.5, lineHeight: 17, color: '#8A9F86', fontWeight: '700' },
  checkForward: { color: '#B98A4E' },
  perkBody: { flex: 1 },
  perkText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: INK },
  perkForward: { fontWeight: '700', color: '#7A4E1E' },
  perkFree: { fontSize: 11, lineHeight: 15, color: '#7C8C84' },
  buy: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
    backgroundColor: '#FFF9EC', borderWidth: 1, borderColor: GOLD },
  buyForward: { backgroundColor: '#F2B784' },
  buyText: { fontFamily: serif, fontSize: 15.5, color: INK },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 22, flexWrap: 'wrap', marginTop: 4 },
  link: { fontSize: 14, textDecorationLine: 'underline', minHeight: 24 },
  legal: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 6 },
});
