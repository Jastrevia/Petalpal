import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { sourceFlowerImageUri } from './flowerDetailApi';
import { clusterPicture } from './flowerClusters';

// A flower's picture for lists: its painted cluster, the same art the Garden draws. Only a
// flower without bundled art falls back to the server's image or emoji.
export function FlowerThumb({ speciesCode, name, image, size, style }: {
  speciesCode?: string; name: string; image: string; size: number; style?: StyleProp<ViewStyle>;
}) {
  const cluster = clusterPicture(speciesCode, name);
  if (cluster) {
    return <View accessibilityLabel={name} style={[styles.frame, { width: size, height: size }, style]}>
      <Image source={cluster.source} resizeMode="contain" style={{ width: size * 0.92, height: size * 0.92 }} />
    </View>;
  }
  const uri = sourceFlowerImageUri(image);
  return <View accessibilityLabel={name} style={[styles.frame, { width: size, height: size }, style]}>
    {uri ? <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" />
      : <Text style={{ fontSize: size * 0.62, lineHeight: size, textAlign: 'center' }}>{image}</Text>}
  </View>;
}

const styles = StyleSheet.create({ frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' } });
