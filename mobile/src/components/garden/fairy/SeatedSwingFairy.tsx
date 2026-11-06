import { Group, Image, useImage } from '@shopify/react-native-skia';

// Swing design coordinates: the hips sit on the original seat, with the
// existing moving-front backrest painted AFTER the fairy, hiding her lap.
// The whole sprite inherits the seat's pendulum transform, never floating alone.
export default function SeatedSwingFairy() {
  const image = useImage(require('@/assets/garden/fairy/swing-seated-v3/seated-back.webp'));
  if (!image) return null;
  const height = 470;
  const width = height * image.width() / image.height();
  const art = <Image image={image} x={653 - width * .50} y={740 - height * .59}
    width={width} height={height} fit="fill" />;
  return <>
    <Group clip={{x:0,y:0,width:1312,height:740}}>{art}</Group>
    {/* The long petal train hangs below the original backrest. Its concealed
        waist seam leaves the head, wings, hands and seated hips unchanged. */}
    <Group clip={{x:0,y:740,width:1312,height:459}}>
      <Group origin={{x:653,y:740}} transform={[{scaleY:1.55}]}>{art}</Group>
    </Group>
  </>;
}
