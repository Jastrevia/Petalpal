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
// Painted art: the moonlit (or morning) garden over the sheet's title, the same scene as Our Bond's
// garden deck; a crocus in bloom inside a gold laurel for Founding Member (FLUX.2 klein, 2026-11-26,
// cut out) and, for Monthly, a quieter posy of two crocuses tied with a lavender ribbon (same style, no gold).
const ART = {
  header: { dark: require('@/assets/vip/header-dark.webp'), light: require('@/assets/vip/header-light.webp') },
  founder: require('@/assets/vip/founder-emblem.webp'),
  monthly: require('@/assets/vip/monthly-emblem.webp'),
};
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
    perks: [['3 flowers a day', 'Free: 2'], ['Weekly letter, every week', 'Free: 2 to try'],
      ['Monthly letter', 'Free: a short summary'], ['3 tarot readings a week', 'Free: 3 in all']] as [string, string][],
    founderPerks: ['Yours forever', 'Founding Member title', 'Future VIP extras'],
    monthlyPerks: ['Future VIP extras'],
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
    perks: [['每天 3 朵新花', '免费 2 朵'], ['每周一封周报信', '免费试读 2 封'],
      ['每月一封月报信', '免费为简要回顾'], ['每周 3 次塔罗', '免费共 3 次']] as [string, string][],
    founderPerks: ['永久有效', '创始会员称号', '未来新增内容'],
    monthlyPerks: ['未来新增内容'],
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
  const { theme, light } = usePanelTheme();
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
  const cards = offer && Boolean(plans?.length);
  const empty = plans && !plans.length;
  // The quiet card follows the panel: dark glass on the night panel, warm paper on the light one.
  const quiet = light ? { card: '#FFFBF1', text: theme.text, muted: theme.muted, border: 'rgba(160, 130, 80, 0.45)' }
    : { card: 'rgba(255, 244, 220, 0.06)', text: theme.text, muted: theme.muted, border: 'rgba(201, 169, 110, 0.5)' };
  return <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View testID="vip-sheet" style={[styles.panel, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* The painted garden over the title, fading into the panel. */}
          <View style={styles.hero} accessible={false}>
            <Image source={light ? ART.header.light : ART.header.dark} style={styles.heroImage} resizeMode="cover" />
            {FADE.map((opacity, i) => <View key={i} style={[styles.fadeBand, { bottom: 0, height: (i + 1) * 3, opacity, backgroundColor: theme.background }]} />)}
          </View>
          <View style={styles.content}>
            <Text style={[styles.eyebrow, { color: light ? '#8A7A55' : '#D8C59A' }]}>{copy.eyebrow}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
            <Text style={[styles.status, { color: theme.muted }]}>{vipStatus(summary, copy, locale)}</Text>

            {cards ? <Text style={[styles.small, styles.center, { color: theme.muted }]}>{copy.everyone}</Text> : <View style={styles.benefits}>
              {copy.benefits(3).map(line => <View key={line} style={styles.benefit}>
                <View style={styles.dot} /><Text style={[styles.body, { color: theme.text }]}>{line}</Text>
              </View>)}
              <Text style={[styles.small, { color: theme.muted }]}>{copy.everyone}</Text>
            </View>}

            {offer && plans === null ? <ActivityIndicator accessibilityLabel={copy.loading} color={GOLD} style={{ marginTop: 16 }} /> : null}
            {/* Side by side, as on a shop shelf: Founding Member (while it lasts), the warm raised card
                with its laurel, beside the quieter Monthly. Each lists what it includes, with what the
                free Garden has instead under each line. Stacked only on a very narrow screen. */}
            {cards ? <View style={styles.shelf}>
              {plans!.map(plan => {
                const lifetime = plan.plan === 'LIFETIME';
                const text = lifetime ? FOUNDER.text : quiet.text, muted = lifetime ? FOUNDER.muted : quiet.muted;
                return <View key={plan.plan} testID={`vip-plan-${plan.plan}`}
                  style={[styles.plan, lifetime ? styles.founder : { backgroundColor: quiet.card, borderColor: quiet.border }]}>
                  {lifetime ? <View pointerEvents="none" style={styles.founderInset} /> : null}
                  {lifetime ? <View style={styles.ribbon}><Text style={styles.ribbonText}>{copy.limited}</Text></View> : null}
                  <View style={styles.planTop}>
                    <Image source={lifetime ? ART.founder : ART.monthly} style={lifetime ? styles.emblem : styles.bud} resizeMode="contain" accessible={false} />
                    <Text style={[styles.planTitle, { color: lifetime ? FOUNDER.title : text }]}>{lifetime ? copy.lifetime : copy.month}</Text>
                    <Text style={[styles.planPrice, { color: text }]} adjustsFontSizeToFit numberOfLines={1}>{plan.price}</Text>
                    <Text style={[styles.planUnit, { color: muted }]}>{lifetime ? copy.unitOnce : copy.unitMonth}</Text>
                    <Text style={[styles.planNote, { color: lifetime ? FOUNDER.accent : muted }]}>
                      {lifetime ? (plan.endsAt ? copy.until(shortDate(plan.endsAt, locale)) : copy.lifetimeSub) : copy.monthSub}</Text>
                    <View style={[styles.rule, { backgroundColor: lifetime ? 'rgba(185, 138, 78, 0.45)' : quiet.border }]} />
                    {(lifetime ? copy.founderPerks : copy.monthlyPerks).map(line => <View key={line} style={styles.perk}>
                      <View style={[styles.mark, lifetime ? styles.markFounder : { borderColor: GOLD }]} />
                      <Text style={[styles.perkText, { color: lifetime ? FOUNDER.title : text }, lifetime && styles.perkStrong]}>{line}</Text>
                    </View>)}
                    {copy.perks.map(([line, free]) => <View key={line} style={styles.perk}>
                      <View style={[styles.mark, { borderColor: GOLD }]} />
                      <View style={styles.perkBody}>
                        <Text style={[styles.perkText, { color: text }]}>{line}</Text>
                        <Text style={[styles.perkFree, { color: muted }]}>{free}</Text>
                      </View>
                    </View>)}
                  </View>
                  <Pressable testID={`vip-buy-${plan.plan}`} accessibilityRole="button"
                    accessibilityLabel={`${lifetime ? copy.lifetime : copy.month}, ${plan.price} ${lifetime ? copy.unitOnce : copy.unitMonth}`}
                    disabled={busy} onPress={() => void buy(plan)}
                    style={({ pressed }) => [styles.buy, lifetime ? styles.buyFounder : { borderColor: GOLD }, busy && ui.disabled, pressed && ui.pressed]}>
                    <Text style={[styles.buyText, { color: lifetime ? INK : text }]} numberOfLines={1}>{lifetime ? copy.buyLifetime : copy.buyMonthly}</Text>
                  </Pressable>
                </View>;
              })}
            </View> : null}
            {offer && empty ? <Text style={[styles.body, styles.center, { color: theme.text, marginTop: 12 }]}>
              {Platform.OS === 'web' ? copy.web : loadFailed ? copy.failed : storeAvailable ? copy.none : copy.soon}</Text> : null}
            {offer && empty && loadFailed ? <FeatureActionButton title={copy.retry} secondary onPress={() => setReloads(n => n + 1)} /> : null}

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
              <Pressable accessibilityRole="link" onPress={() => openUrl(process.env.EXPO_PUBLIC_TERMS_URL)} hitSlop={8}><Text style={[styles.linkSmall, { color: theme.muted }]}>{copy.terms}</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={() => openUrl(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL)} hitSlop={8}><Text style={[styles.linkSmall, { color: theme.muted }]}>{copy.privacy}</Text></Pressable>
            </View>
          </View>
        </ScrollView>
        <View pointerEvents="none" style={styles.inset} />
        <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={onClose} hitSlop={10} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

// The header painting's fade into the panel: bands from the bottom up, opaque to clear.
// (Many thin bands, each a little less opaque, so no band edge shows.)
const FADE = Array.from({ length: 22 }, (_, i) => Math.pow(1 - i / 22, 1.6) * 0.32);
// Founding Member's warm card (the same on both panel themes).
const FOUNDER = { title: '#6E4519', text: INK, muted: '#6F6650', accent: '#9A6A3A' };
const serif = Platform.select({ ios: 'Georgia', default: 'serif' });
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24 },
  backdrop: { backgroundColor: 'rgba(8, 20, 18, 0.6)' },
  panel: { width: '100%', maxWidth: 460, maxHeight: '100%', borderRadius: 30, borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden' },
  inset: { position: 'absolute', top: 5, right: 5, bottom: 5, left: 5, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(201, 169, 110, 0.4)' },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 3, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16, 40, 37, 0.55)', borderWidth: 1, borderColor: 'rgba(201, 169, 110, 0.6)' },
  closeText: { fontSize: 22, lineHeight: 24, color: '#FFF4DC' },
  scroll: { paddingBottom: 22 },
  hero: { height: 132, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  fadeBand: { position: 'absolute', left: 0, right: 0 },
  content: { paddingHorizontal: 18, marginTop: -34, gap: 8 },
  eyebrow: { fontSize: 11.5, letterSpacing: 2.6, textAlign: 'center' },
  title: { fontFamily: serif, fontSize: 31, lineHeight: 37, textAlign: 'center' },
  status: { fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  benefits: { gap: 8, marginTop: 8 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginTop: 8 },
  body: { flex: 1, fontSize: 15, lineHeight: 22 },
  small: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  center: { textAlign: 'center', flex: 0 },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'stretch', marginTop: 18 },
  plan: { flexGrow: 1, flexBasis: 130, borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12,
    justifyContent: 'space-between', gap: 14 },
  founder: { backgroundColor: '#FCEFD9', borderWidth: 1.5, borderColor: GOLD,
    shadowColor: '#F0B86E', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  founderInset: { position: 'absolute', top: 4, right: 4, bottom: 4, left: 4, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(185, 138, 78, 0.45)' },
  ribbon: { position: 'absolute', top: -12, alignSelf: 'center', zIndex: 2, backgroundColor: '#A87A3E', borderRadius: 12, borderWidth: 1, borderColor: '#F3D6A0',
    paddingHorizontal: 14, paddingVertical: 3 },
  ribbonText: { fontFamily: serif, fontSize: 12, letterSpacing: 2, color: '#FFF6E4' },
  planTop: { alignItems: 'center' },
  emblem: { width: 74, height: 74, marginTop: 2 },
  bud: { width: 68, height: 68, marginTop: 4, marginBottom: 2 },
  planTitle: { fontFamily: serif, fontSize: 17.5, textAlign: 'center', marginTop: 2 },
  planPrice: { fontFamily: serif, fontSize: 31, lineHeight: 38, marginTop: 4 },
  planUnit: { fontSize: 12, letterSpacing: 0.4 },
  planNote: { fontSize: 12, textAlign: 'center', marginTop: 3 },
  rule: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth * 2, marginTop: 12, marginBottom: 6 },
  perk: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingVertical: 3.5 },
  mark: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, marginTop: 5.5 },
  markFounder: { borderColor: '#B98A4E', backgroundColor: '#B98A4E' },
  perkBody: { flex: 1 },
  perkText: { flex: 1, fontSize: 13, lineHeight: 18 },
  perkStrong: { fontWeight: '700' },
  perkFree: { fontSize: 11, lineHeight: 15, marginTop: 1 },
  buy: { minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1 },
  buyFounder: { backgroundColor: '#F2B784', borderColor: '#C9935A' },
  buyText: { fontFamily: serif, fontSize: 16 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 22, flexWrap: 'wrap', marginTop: 6 },
  link: { fontSize: 14, textDecorationLine: 'underline', minHeight: 24 },
  linkSmall: { fontSize: 13, textDecorationLine: 'underline', minHeight: 24 },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 },
});
