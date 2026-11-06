import { Image, View } from 'react-native';

const cells: Record<string, number> = { profile: 0, events: 1, friends: 2, settings: 3 };

// Only the approved sidebar icons use this atlas; panel artwork stays independent.
export function SidebarIllustration({ id, active, size = 30 }: { id: string; active: boolean; size?: number }) {
  if (id === 'garden') return <Image accessible={false}
    source={require('../../../assets/friends/visitor-home-transparent.webp')}
    resizeMode="contain" style={{ width: size, height: size }} />;
  if (id === 'fairy') return <Image accessible={false}
    source={require('../../../assets/garden/fairy/walk-v2/walk_04.webp')}
    resizeMode="contain" style={{ width: size, height: size }} />;
  const cell = cells[id];
  if (cell === undefined) return null;
  return <View accessible={false} pointerEvents="none" style={{ width: size, height: size, overflow: 'hidden',
    opacity: id === 'profile' && !active ? .55 : 1 }}>
    <Image accessible={false} source={require('../../../assets/navigation/sidebar-illustrations.webp')}
      style={{ position: 'absolute', width: size * 2, height: size * 2,
        left: -(cell % 2) * size, top: -Math.floor(cell / 2) * size }} />
  </View>;
}
