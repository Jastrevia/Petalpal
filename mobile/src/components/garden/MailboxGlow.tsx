import { Circle, Group, RadialGradient } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { TreehousePlacement } from './TreehouseCalibrationEditor';

// A soft light around the treehouse mailbox so it reads as its own place to tap, not part
// of the treehouse. Faint and slow normally; a little brighter and quicker while a letter
// is unread. Centred on the mailbox hit area (tree-local 988, 802).
export default function MailboxGlow({ placement, clock, unread }: {
  placement: TreehousePlacement; clock: SharedValue<number>; unread: boolean;
}) {
  const x = placement.x + 988 * placement.scale, y = placement.y + 790 * placement.scale;
  const r = 230 * placement.scale;
  const opacity = useDerivedValue(() => {
    const wave = 0.5 + 0.5 * Math.sin(clock.value * Math.PI * 2 / (unread ? 2.6 : 4.5));
    return unread ? 0.7 + 0.3 * wave : 0.38 + 0.14 * wave;
  }, [unread]);
  return <Group blendMode="screen" opacity={opacity}>
    <Circle cx={x} cy={y} r={r}>
      <RadialGradient c={{ x, y }} r={r}
        colors={['rgba(255, 238, 170, 0.95)', 'rgba(255, 214, 130, 0.45)', 'rgba(255, 205, 120, 0)']}
        positions={[0, 0.38, 1]} />
    </Circle>
  </Group>;
}
