import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { readJournalCover, saveJournalCover } from '../../services/bookhouse';
import { BookhouseArt } from './BookhouseArt';
import { tt } from '../../services/treehouseCopy';

/** `readOnly` (a journal being read): the photo, if there is one, with no Add, Change or Remove controls. */
export function JournalCover({ userId, journalId, size, readOnly = false }: { userId: string; journalId: string; size: number; readOnly?: boolean }) {
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    readJournalCover(userId, journalId).then(result => { if (alive.current) setCover(result.coverImage); })
      .catch(() => { if (alive.current) setError(tt('Unable to load photo.')); })
      .finally(() => { if (alive.current) setBusy(false); });
    return () => { alive.current = false; };
  }, [userId, journalId]);
  const choose = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
      if (result.canceled || !alive.current) return;
      const asset = result.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize(asset.width >= asset.height ? { width: Math.min(1000, asset.width) } : { height: Math.min(1000, asset.height) });
      const image = await context.renderAsync();
      const resized = await image.saveAsync({ format: SaveFormat.JPEG, compress: .7, base64: true });
      if (!resized.base64 || resized.base64.length > 699052) throw new Error(tt('Choose a smaller photo (up to 512 KB).'));
      if (!alive.current) return;
      const saved = await saveJournalCover(userId, journalId, `data:image/jpeg;base64,${resized.base64}`);
      if (alive.current) setCover(saved.coverImage);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : tt('Unable to save photo. Please try again.')); }
    finally { if (alive.current) setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try { await saveJournalCover(userId, journalId, null); if (alive.current) setCover(null); }
    catch { if (alive.current) setError(tt('Unable to remove photo. Please try again.')); }
    finally { if (alive.current) setBusy(false); }
  };
  if (readOnly) return cover ? <View style={{ alignItems: 'center', width: '100%' }}>
    <View style={{ padding: 5, backgroundColor: '#F8E9CE', borderWidth: 1, borderColor: '#C1A47A', transform: [{ rotate: '-2deg' }] }}>
      <Image accessibilityLabel={tt('Private journal photo')} source={{ uri: cover }} style={{ width: size, height: size * .8 }} resizeMode="cover" />
    </View>
  </View> : null;
  return <View style={{ alignItems: 'center', width: '100%' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={tt(cover ? 'Change journal photo' : 'Add journal photo')} disabled={busy} onPress={() => void choose()}
      style={{ alignItems: 'center', minWidth: 44, minHeight: 44, padding: 5, backgroundColor: cover ? '#F8E9CE' : 'transparent', borderWidth: cover ? 1 : 0, borderColor: '#C1A47A', transform: [{ rotate: '-2deg' }] }}>
      {cover ? <Image accessibilityLabel={tt('Private journal photo')} source={{ uri: cover }} style={{ width: size, height: size * .8 }} resizeMode="cover" /> : <BookhouseArt index={14} width={size * .8} height={size * .85} />}
      <Text style={{ color: '#79613F', fontSize: 11, marginTop: 7 }}>{tt(busy ? 'Loading…' : cover ? 'Change photo' : 'Add a photo')}</Text>
    </Pressable>
    {busy && <ActivityIndicator size="small" color="#79613F" />}
    {!!cover && !busy && <Pressable accessibilityRole="button" accessibilityLabel={tt('Remove journal photo')} onPress={() => void remove()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#79613F', fontSize: 11 }}>{tt('Remove photo')}</Text></Pressable>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#82472D', fontSize: 11, textAlign: 'center' }}>{error}</Text>}
  </View>;
}
