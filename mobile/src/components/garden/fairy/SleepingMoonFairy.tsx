import {Image,useImage} from '@shopify/react-native-skia';
// Local bed-design coordinates: cheek rests over the existing pillows and
// curled legs follow the mattress. The foreground drape paints above her.
export default function SleepingMoonFairy(){
 const image=useImage(require('@/assets/garden/fairy/moon-sleep-v1/sleep.webp'));
 return image?<Image image={image} x={430} y={450} width={580} height={435} fit="fill"/>:null;
}
