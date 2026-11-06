import { Group, Image, useImage } from '@shopify/react-native-skia';
import { GARDEN_WORLD_HEIGHT, GARDEN_WORLD_WIDTH } from './gardenMapLayout';

type GardenReferenceLayerProps = {
  opacity: number;
};

/** DEV calibration only: 1448x1086 and 2400x1800 are both exactly 4:3. */
export default function GardenReferenceLayer({ opacity }: GardenReferenceLayerProps) {
  const reference = useImage(require('@/assets/garden/reference/structure-final-version.webp'));
  if (!__DEV__ || !reference || opacity <= 0) return null;

  return (
    <Group opacity={opacity}>
      <Image
        image={reference}
        x={0}
        y={0}
        width={GARDEN_WORLD_WIDTH}
        height={GARDEN_WORLD_HEIGHT}
        fit="contain"
      />
    </Group>
  );
}
