import { Image, View } from 'react-native';

// Decorative artwork only; mood values and Event results remain backend-owned.
export function EventIllustration({ index, size = 32 }: { index: number; size?: number }) {
  return <View pointerEvents="none" accessible={false} style={{ width: size, height: size, overflow: 'hidden', flexShrink: 0 }}>
    <Image source={require('../../../assets/events/illustrated-icons.webp')} accessible={false}
      style={{ position: 'absolute', width: size * 3, height: size * 3,
        left: -(index % 3) * size, top: -Math.floor(index / 3) * size }} />
  </View>;
}
