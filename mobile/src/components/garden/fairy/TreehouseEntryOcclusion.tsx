import { Group, Image, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { TREEHOUSE_MAP_X as x, TREEHOUSE_MAP_Y as y, TREEHOUSE_MAP_SCALE as scale } from '../treehouseMapPlacement';

// Fixed source-space contour of the painted LEFT doorway jamb and front trunk.
// It excludes the stairs, sill, ground and open doorway. The fairy itself is
// never clipped: her complete sprite walks behind these original art pixels.
// Inward travel carries her left, deeper behind the trunk; exit reverses it.
const frontTrunk = 'M 620 535 L 792 535 C 795 566 802 593 813 617 C 800 634 790 654 787 677 C 783 704 791 729 807 750 L 797 781 C 762 795 723 792 689 813 L 620 810 Z';

export default function TreehouseEntryOcclusion({depth}:{depth:SharedValue<number>}) {
  const insideDoorway=useDerivedValue(()=>depth.value>0?1:0);
  const base=useImage(require('@/assets/garden/landmarks/treehouse/tree-base.webp'));
  return base?<Group opacity={insideDoorway} transform={[{translateX:x},{translateY:y},{scale}]}>
    <Group clip={frontTrunk}>
      <Image image={base} x={0} y={0} width={1448} height={1086} fit="contain" />
    </Group>
  </Group>:null;
}
