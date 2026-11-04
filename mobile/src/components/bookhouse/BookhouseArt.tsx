import { Image, View } from 'react-native';

// Sprite windows preserve the original transparent atlas; no runtime image processing.
// `tint` draws the same window as a single-colour silhouette (used to desaturate a locked book in place).
export function BookhouseArt({ index, width, height, tint }: { index: number; width: number; height: number; tint?: string }) {
  const narrow = index < 12;
  const cellWidth = narrow ? width / .31 : width;
  const cellHeight = index === 12 ? height / .78 : height;
  return <View pointerEvents="none" accessible={false} style={{ width, height, overflow: 'hidden' }}>
    <Image source={require('../../../assets/bookhouse/objects.png')} resizeMode="stretch" tintColor={tint} style={{
      position: 'absolute', width: cellWidth * 4, height: cellHeight * 4,
      left: -(index % 4 + (narrow ? .345 : 0)) * cellWidth, top: -(Math.floor(index / 4) + (index === 12 ? .1 : 0)) * cellHeight,
    }} />
  </View>;
}
