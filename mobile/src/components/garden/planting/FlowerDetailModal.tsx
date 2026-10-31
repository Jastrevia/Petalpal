import { AiOutputReport } from '../../features/AiPrivacySettings';
import { CommunityGuidelines } from '../../features/CommunityGuidelines';
import { SafetyActions } from '../../features/SafetyActions';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { usePlanting } from './PlantingContext';
import { MONTH_REGION_METAS } from './plantingRegionData';
import { resolveFlowerDetail } from './flowerDetailData';
import { sourceFlowerImageUri } from './flowerDetailApi';
import { clusterDrawing } from './flowerClusters';
import { DeleteFlowerDialog } from './DeleteFlowerDialog';
import { readEvent } from '../../../services/events';
import { useAppLocale } from '../../../services/locale';
import { flowerMeaningText, flowerNameText } from '../../../services/flowerNames';
import { useMessageReactions } from '../../../services/messageReactions';
import { PANEL_THEMES, usePanelTheme, type PanelTheme } from '../../features/PanelTheme';

const MOOD_ZH: Record<string, string> = { SUNNY_BLOOM: '开心', PEACEFUL_BLOOM: '平静', GENTLE_BLOOM: '温柔', WONDER_BLOOM: '好奇', HEALING_BLOOM: '治愈', QUIET_BLOOM: '低落', DRIFTING_BLOOM: '迷茫', FIRE_BLOOM: '愤怒', Unknown: '未知' };
const COPY = {
  en: { month: (name: string) => `${name} Garden`, garden: 'Garden', mood: 'Mood', planted: 'Planted', memory: 'Memory', meaning: 'Meaning', hideEvent: 'Hide Event ▴', viewEvent: 'View Event ▾', opening: 'Opening…',
    eventError: 'This Event can’t be opened right now.', support: (n: number) => `♥ Support received: ${n}`, messages: 'Messages', friend: 'Friend', sending: ' (sending...)', loading: 'Loading flower details…',
    supported: 'Supported today ✓', working: 'Working...', give: 'Give Support 💗', placeholder: 'Leave a kind message...', leave: 'Leave Message', signIn: 'Sign in to interact with this flower.', close: 'Close flower details', like: 'Like this message', dislike: 'Dislike this message' },
  'zh-Hans': { month: (name: string) => `${name}花园`, garden: '花园', mood: '心情', planted: '种下于', memory: '记忆', meaning: '花语', hideEvent: '收起事件 ▴', viewEvent: '查看事件 ▾', opening: '正在打开…',
    eventError: '这件事暂时打不开。', support: (n: number) => `♥ 收到的支持：${n}`, messages: '留言', friend: '朋友', sending: '（发送中…）', loading: '正在加载这朵花…',
    supported: '今天已支持 ✓', working: '处理中…', give: '送上支持 💗', placeholder: '留下一句温柔的话…', leave: '留言', signIn: '登录后才能和这朵花互动。', close: '关闭花朵详情', like: '赞这条留言', dislike: '不喜欢这条留言' },
};

const FLOWER_ASSETS: Record<string, any> = {
  pink: require('../../../../assets/garden/flowers/pink.png'),
  purple: require('../../../../assets/garden/flowers/purple.png'),
  blue: require('../../../../assets/garden/flowers/blue.png'),
  sunflower: require('../../../../assets/garden/flowers/sunflower.png'),
  tulip: require('../../../../assets/garden/flowers/tulip.png'),
};

export default function FlowerDetailModal() {
  const {
    selectedFlower,
    closeFlowerDetail,
    supportFlower,
    leaveMessage,
    deleteSelectedFlower,
    selectedFlowerIsOwner,
    currentUserId,
    flowerDetailSource,
    isDetailLoading,
    isDetailWorking,
    detailError,
  } = usePlanting();
  const [messageText, setMessageText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locale = useAppLocale(), zh = locale === 'zh-Hans', copy = COPY[locale];
  const theme = usePanelTheme().theme ?? PANEL_THEMES.dark;
  const styles = stylesFor(theme);
  // (Its messages come from the detail below; hooks stay above the early return.)
  const messageIds = (selectedFlower ? resolveFlowerDetail(selectedFlower, flowerDetailSource).messages : [])
    .filter(message => message.id && !message.pending && (message.authorUserId || message.userId) !== currentUserId).map(message => message.id as string);
  const { reactions, like, dislike } = useMessageReactions(messageIds);
  // Owner-only, on tap: the Event this flower grew from (GET /events/:id is owner-scoped).
  const [sourceEvent, setSourceEvent] = useState<{ id: string; state: 'loading' | 'ready' | 'error'; text?: string } | null>(null);
  const eventId = selectedFlowerIsOwner ? selectedFlower?.sourceEventId : undefined;

  useEffect(() => {
    setConfirmDelete(false);
    setSourceEvent(null);
    if (!selectedFlower) setMessageText('');
  }, [selectedFlower?.flowerId]);

  const toggleSourceEvent = () => {
    if (!eventId) return;
    if (sourceEvent?.id === eventId) { setSourceEvent(null); return; }
    setSourceEvent({ id: eventId, state: 'loading' });
    readEvent(eventId).then(
      (event) => setSourceEvent((current) => current?.id === eventId ? { id: eventId, state: 'ready', text: event.content } : current),
      () => setSourceEvent((current) => current?.id === eventId ? { id: eventId, state: 'error' } : current),
    );
  };

  if (!selectedFlower) return null;

  const meta = MONTH_REGION_METAS[selectedFlower.month];
  const monthName = zh ? `${selectedFlower.month}月` : meta?.monthName || `Month ${selectedFlower.month}`;
  const detail = resolveFlowerDetail(selectedFlower, flowerDetailSource);

  const getImage = (name?: string) => {
    if (!name) return FLOWER_ASSETS.pink;
    const lower = name.toLowerCase();
    if (lower.includes('sunflower')) return FLOWER_ASSETS.sunflower;
    if (lower.includes('tulip')) return FLOWER_ASSETS.tulip;
    if (lower.includes('purple') || lower.includes('lavender')) return FLOWER_ASSETS.purple;
    if (lower.includes('blue') || lower.includes('lotus')) return FLOWER_ASSETS.blue;
    return FLOWER_ASSETS.pink;
  };

  const existingImage = detail.image.split('/').pop()?.toLowerCase().replace('.png', '');
  const imageUri = sourceFlowerImageUri(detail.image);
  // The same painted cluster the Garden draws for this flower's land.
  const cluster = clusterDrawing({ ...selectedFlower, flowerName: detail.name });
  const flowerImg = cluster?.source ?? (existingImage && FLOWER_ASSETS[existingImage]
    ? FLOWER_ASSETS[existingImage]
    : imageUri ? { uri: imageUri } : getImage(detail.name));

  const plantedDate = new Date(selectedFlower.plantedDate);
  const formattedDate = Number.isNaN(plantedDate.getTime()) ? '' : plantedDate.toLocaleDateString(
    zh ? 'zh-CN' : 'en',
    { month: 'short', day: 'numeric', year: 'numeric' }
  );
  const supportedToday = !!detail.supportState?.supportedToday;
  const supportDisabled = !currentUserId || isDetailLoading || isDetailWorking || supportedToday ||
    detail.supportState?.canSupport === false;

  const sendMessage = async () => {
    const clean = messageText.trim();
    if (!clean) return;
    setMessageText('');
    if (!(await leaveMessage(clean))) setMessageText(clean);
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!selectedFlower}
      onRequestClose={closeFlowerDetail}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.backdropPressable} onPress={closeFlowerDetail} />

        <View style={styles.modalCard} accessibilityViewIsModal>
          {/* Close button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.close}
            onPress={closeFlowerDetail}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>

          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent}>
          <View style={styles.imageWrapper}>
            <View style={styles.flowerImage}>
            <Image
              source={flowerImg}
              style={styles.flowerImage}
              resizeMode="contain"
            />
            </View>
          </View>

          {/* Details */}
          <Text style={styles.flowerName}>
            {zh ? flowerNameText(detail.name, locale) : detail.name.toUpperCase()}
          </Text>
          <Text style={styles.locationSubtitle}>
            {copy.month(monthName)} • {selectedFlower.landId || meta?.landId || copy.garden}
          </Text>

            <View style={styles.tagRow}>
              <View style={styles.moodTag}>
                <Text style={styles.moodTagText}>{copy.mood}: {zh ? MOOD_ZH[detail.mood] ?? detail.mood : detail.mood}</Text>
              </View>
              {!!formattedDate && <View style={styles.dateTag}>
                <Text style={styles.dateTagText}>{copy.planted}: {formattedDate}</Text>
              </View>}
            </View>

          {detail.memory ? (
            <View style={styles.notesContainer}>
              <Text style={styles.detailLabel}>{copy.memory}</Text>
              <Text style={styles.notesText}>{detail.memory}</Text>
            </View>
          ) : null}
          {detail.meaning ? <View style={styles.notesContainer}>
            <Text style={styles.detailLabel}>{copy.meaning}</Text>
            <Text style={styles.notesText}>{flowerMeaningText(detail.meaning, locale)}</Text>
          </View> : null}

          {eventId && !detail.memory ? <View style={styles.notesContainer}>
            <Pressable accessibilityRole="button" onPress={toggleSourceEvent}>
              <Text style={styles.detailLabel}>{sourceEvent?.id === eventId ? copy.hideEvent : copy.viewEvent}</Text>
            </Pressable>
            {sourceEvent?.id === eventId && sourceEvent.state === 'loading' ? <Text style={styles.notesText}>{copy.opening}</Text> : null}
            {sourceEvent?.id === eventId && sourceEvent.state === 'ready' ? <Text selectable style={styles.notesText}>{sourceEvent.text}</Text> : null}
            {sourceEvent?.id === eventId && sourceEvent.state === 'error' ? <Text accessibilityRole="alert" style={styles.notesText}>{copy.eventError}</Text> : null}
          </View> : null}
          {selectedFlowerIsOwner && selectedFlower?.sourceEventId ? <AiOutputReport kind="event" outputId={selectedFlower.sourceEventId} /> : null}
          <Text style={styles.receivedSupport}>{copy.support(detail.supportCount)}</Text>
          {detail.messages.length > 0 && <View style={styles.notesContainer}>
            <Text style={styles.detailLabel}>{copy.messages}</Text>
            {detail.messages.map((message, index) => {
              const authorId = message.authorUserId || message.userId;
              const votable = message.id && !message.pending && authorId !== currentUserId;
              const reaction = votable ? reactions[message.id as string] : undefined;
              return <View key={message.id || index} style={styles.messageRow}>
                <Text style={[styles.messageText, styles.messageBody]}>
                  {message.author || message.senderName || copy.friend}: {message.text}{message.pending ? copy.sending : ''}
                </Text>
                {votable ? <View style={styles.reactions}>
                  <Pressable testID="message-like" accessibilityRole="button" accessibilityLabel={copy.like} accessibilityState={{ selected: reaction?.mine === 'LIKE', disabled: Boolean(reaction?.mine) }}
                    disabled={Boolean(reaction?.mine)} onPress={() => void like(message.id as string, reaction)} hitSlop={6} style={styles.reaction}>
                    <Text style={[styles.reactionIcon, reaction?.mine === 'LIKE' && styles.reactionChosen]}>👍🏻</Text>
                    {reaction?.likes ? <Text style={styles.reactionCount}>{reaction.likes}</Text> : null}
                  </Pressable>
                  {/* A dislike asks why first (the same reasons as a report), and counts once a reason is sent. */}
                  <SafetyActions dislike messageId={message.id} userId={authorId} onBlocked={closeFlowerDetail}
                    onReported={() => void dislike(message.id as string, reaction)}
                    trigger={open => <Pressable testID="message-dislike" accessibilityRole="button" accessibilityLabel={copy.dislike} accessibilityState={{ selected: reaction?.mine === 'DISLIKE', disabled: Boolean(reaction?.mine) }}
                      disabled={Boolean(reaction?.mine)} onPress={open} hitSlop={6} style={styles.reaction}>
                      <Text style={[styles.reactionIcon, reaction?.mine === 'DISLIKE' && styles.reactionChosen]}>👎🏻</Text>
                    </Pressable>} />
                </View> : null}
              </View>;
            })}
          </View>}
          {isDetailLoading && <Text style={styles.statusText}>{copy.loading}</Text>}

          <View style={styles.actionRow}>
            {!selectedFlowerIsOwner && <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: supportDisabled }}
              disabled={supportDisabled}
              onPress={() => supportFlower(selectedFlower.flowerId)}
              style={({ pressed }) => [
                styles.supportButton,
                supportDisabled && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.supportButtonText}>
                {supportedToday ? copy.supported : isDetailWorking ? copy.working : copy.give}
              </Text>
            </Pressable>
            </>}
            {selectedFlowerIsOwner && <>
            <Pressable accessibilityRole="button" disabled={isDetailWorking || isDetailLoading}
              style={styles.deleteButton} onPress={() => setConfirmDelete(true)}>
              <Text style={styles.deleteButtonText}>{zh ? '删除这朵花' : 'Delete Flower'}</Text>
            </Pressable>
            </>}
          </View>
          {!selectedFlowerIsOwner && <View style={styles.messageForm}><CommunityGuidelines />
            <TextInput accessibilityLabel={copy.placeholder} multiline maxLength={300}
              placeholder={copy.placeholder} placeholderTextColor={theme.muted} value={messageText} onChangeText={setMessageText}
              editable={!!currentUserId && !isDetailWorking} style={styles.messageInput} />
            <Pressable accessibilityRole="button" onPress={sendMessage}
              disabled={!currentUserId || !messageText.trim() || isDetailWorking}
              style={[styles.supportButton, styles.messageSubmitButton,
                (!currentUserId || !messageText.trim() || isDetailWorking) && styles.buttonDisabled]}>
              <Text style={styles.supportButtonText}>{copy.leave}</Text>
            </Pressable>
          </View>}
          {detailError ? <Text accessibilityRole="alert" style={styles.actionError}>{detailError}</Text> : null}
          {!selectedFlowerIsOwner && !currentUserId && <Text style={styles.statusText}>{copy.signIn}</Text>}
          </ScrollView>
        </View>
      </View>
      <DeleteFlowerDialog visible={confirmDelete && selectedFlowerIsOwner} flowerName={flowerNameText(detail.name, locale)} busy={isDetailWorking}
        error={confirmDelete ? detailError : ''} onCancel={() => setConfirmDelete(false)}
        onDelete={async () => { if (await deleteSelectedFlower()) setConfirmDelete(false); }} />
    </Modal>
  );
}

// The sheet follows the panel theme, like every other panel (never a white card in dark mode).
const themedStyles = new Map<PanelTheme, ReturnType<typeof createStyles>>();
function stylesFor(theme: PanelTheme) {
  let styles = themedStyles.get(theme);
  if (!styles) { styles = createStyles(theme); themedStyles.set(theme, styles); }
  return styles;
}
const createStyles = (theme: PanelTheme) => StyleSheet.create({
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  messageBody: { flex: 1 },
  reactions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 28, minHeight: 28, justifyContent: 'center' },
  reactionIcon: { fontSize: 15, opacity: .55 },
  reactionChosen: { opacity: 1 },
  reactionCount: { fontSize: 11, color: theme.muted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    position: 'relative',
  },
  detailScroll: { width: '100%', maxHeight: 560, flexShrink: 1 },
  detailContent: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.input,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.muted,
  },
  imageWrapper: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.input,
    borderRadius: 60,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.border,
  },
  flowerImage: {
    width: 90,
    height: 90,
  },
  flowerName: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 4,
  },
  locationSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.muted,
    marginBottom: 10,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  moodTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  moodTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  dateTag: {
    backgroundColor: theme.input,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dateTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.muted,
  },
  notesContainer: {
    backgroundColor: theme.input,
    padding: 10,
    borderRadius: 10,
    width: '100%',
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  notesText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: theme.text,
    lineHeight: 18,
    textAlign: 'center',
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: theme.text, marginBottom: 6 },
  messageText: { fontSize: 12, color: theme.text, lineHeight: 18, marginBottom: 4 },
  receivedSupport: { fontSize: 13, fontWeight: '700', color: theme === PANEL_THEMES.dark ? '#F19CBF' : '#BE185D', marginBottom: 12 },
  statusText: { fontSize: 12, color: theme.muted, textAlign: 'center', marginTop: 8 },
  actionError: { fontSize: 12, color: '#B91C1C', textAlign: 'center', marginTop: 8 },
  messageForm: { width: '100%', gap: 8, marginTop: 12 },
  messageSubmitButton: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  messageInput: { minHeight: 76, borderWidth: 1, borderColor: theme.border, borderRadius: 10,
    padding: 10, fontSize: 13, color: theme.text, textAlignVertical: 'top' },
  deleteButton: { flex: 1, paddingVertical: 10, backgroundColor: '#FEF2F2', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FCA5A5' },
  deleteButtonText: { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
  buttonDisabled: { opacity: 0.55 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 4,
  },
  supportButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#FDF2F8',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F472B6',
  },
  supportButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#BE185D',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
