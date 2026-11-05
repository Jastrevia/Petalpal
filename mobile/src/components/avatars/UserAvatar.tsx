import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { avatarArt } from './avatarArt';

// A library portrait, or the legacy emoji avatar for accounts that have not chosen one.
export function UserAvatar({ avatar, size, radius = size / 2, fallback = '🦋', style }: {
  avatar?: string | null; size: number; radius?: number; fallback?: string; style?: StyleProp<ViewStyle>;
}) {
  const art = avatarArt(avatar);
  // Medallion portraits carry their own rim and clear corners, so only emoji get the lilac ground.
  return <View style={[styles.frame, { width: size, height: size, borderRadius: radius }, art ? styles.clear : null, style]}>
    {art ? <Image source={art} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      : <Text style={{ fontSize: size * 0.5 }}>{avatar || fallback}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE7F6' },
  clear: { backgroundColor: 'transparent' },
});
