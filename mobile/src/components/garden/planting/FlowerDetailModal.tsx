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
  const zh = useAppLocale() === 'zh-Hans';
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
  const monthName = meta?.monthName || `Month ${selectedFlower.month}`;
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
    undefined,
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
            accessibilityLabel="Close flower details"
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
            {detail.name.toUpperCase()}
          </Text>
          <Text style={styles.locationSubtitle}>
            {monthName} Garden • {selectedFlower.landId || meta?.landId || 'Garden'}
          </Text>

            <View style={styles.tagRow}>
              <View style={styles.moodTag}>
                <Text style={styles.moodTagText}>Mood: {detail.mood}</Text>
              </View>
              {!!formattedDate && <View style={styles.dateTag}>
                <Text style={styles.dateTagText}>Planted: {formattedDate}</Text>
              </View>}
            </View>

          {detail.memory ? (
            <View style={styles.notesContainer}>
              <Text style={styles.detailLabel}>Memory</Text>
              <Text style={styles.notesText}>{detail.memory}</Text>
            </View>
          ) : null}
          {detail.meaning ? <View style={styles.notesContainer}>
            <Text style={styles.detailLabel}>Meaning</Text>
            <Text style={styles.notesText}>{detail.meaning}</Text>
          </View> : null}

          {eventId && !detail.memory ? <View style={styles.notesContainer}>
            <Pressable accessibilityRole="button" onPress={toggleSourceEvent}>
              <Text style={styles.detailLabel}>{sourceEvent?.id === eventId ? 'Hide Event ▴' : 'View Event ▾'}</Text>
            </Pressable>
            {sourceEvent?.id === eventId && sourceEvent.state === 'loading' ? <Text style={styles.notesText}>Opening…</Text> : null}
            {sourceEvent?.id === eventId && sourceEvent.state === 'ready' ? <Text selectable style={styles.notesText}>{sourceEvent.text}</Text> : null}
            {sourceEvent?.id === eventId && sourceEvent.state === 'error' ? <Text accessibilityRole="alert" style={styles.notesText}>This Event can’t be opened right now.</Text> : null}
          </View> : null}
          {selectedFlowerIsOwner && selectedFlower?.sourceEventId ? <AiOutputReport kind="event" outputId={selectedFlower.sourceEventId} /> : null}
          <Text style={styles.receivedSupport}>♥ Support received: {detail.supportCount}</Text>
          {detail.messages.length > 0 && <View style={styles.notesContainer}>
            <Text style={styles.detailLabel}>Messages</Text>
            {detail.messages.map((message, index) => <View key={message.id || index}><Text style={styles.messageText}>
              {message.author || message.senderName || 'Friend'}: {message.text}{message.pending ? ' (sending...)' : ''}
            </Text>{message.id && !message.pending && (message.authorUserId || message.userId) !== currentUserId ? <SafetyActions messageId={message.id} userId={message.authorUserId || message.userId} onBlocked={closeFlowerDetail} /> : null}</View>)}
          </View>}
          {isDetailLoading && <Text style={styles.statusText}>Loading flower details…</Text>}

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
                {supportedToday ? 'Supported today ✓' : isDetailWorking ? 'Working...' : 'Give Support 💗'}
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
            <TextInput accessibilityLabel="Leave a kind message" multiline maxLength={300}
              placeholder="Leave a kind message..." value={messageText} onChangeText={setMessageText}
              editable={!!currentUserId && !isDetailWorking} style={styles.messageInput} />
            <Pressable accessibilityRole="button" onPress={sendMessage}
              disabled={!currentUserId || !messageText.trim() || isDetailWorking}
              style={[styles.supportButton, styles.messageSubmitButton,
                (!currentUserId || !messageText.trim() || isDetailWorking) && styles.buttonDisabled]}>
              <Text style={styles.supportButtonText}>Leave Message</Text>
            </Pressable>
          </View>}
          {detailError ? <Text accessibilityRole="alert" style={styles.actionError}>{detailError}</Text> : null}
          {!selectedFlowerIsOwner && !currentUserId && <Text style={styles.statusText}>Sign in to interact with this flower.</Text>}
          </ScrollView>
        </View>
      </View>
      <DeleteFlowerDialog visible={confirmDelete && selectedFlowerIsOwner} flowerName={detail.name} busy={isDetailWorking}
        error={confirmDelete ? detailError : ''} onCancel={() => setConfirmDelete(false)}
        onDelete={async () => { if (await deleteSelectedFlower()) setConfirmDelete(false); }} />
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  imageWrapper: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 60,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  flowerImage: {
    width: 90,
    height: 90,
  },
  flowerName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  locationSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
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
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dateTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  notesContainer: {
    backgroundColor: '#F8FAFC',
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
    color: '#334155',
    lineHeight: 18,
    textAlign: 'center',
  },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  messageText: { fontSize: 12, color: '#334155', lineHeight: 18, marginBottom: 4 },
  receivedSupport: { fontSize: 13, fontWeight: '700', color: '#BE185D', marginBottom: 12 },
  statusText: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 8 },
  actionError: { fontSize: 12, color: '#B91C1C', textAlign: 'center', marginTop: 8 },
  messageForm: { width: '100%', gap: 8, marginTop: 12 },
  messageSubmitButton: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  messageInput: { minHeight: 76, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    padding: 10, fontSize: 13, color: '#334155', textAlignVertical: 'top' },
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
