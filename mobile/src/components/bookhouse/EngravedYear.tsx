import { Image } from 'expo-image';
import { View } from 'react-native';

// Incised numeral contours: the wood remains visible between the narrow cuts.
// Three offset strokes form the lit lower bevel, dark upper recess and wood-toned floor.
const digits: Record<string, string> = {
  '0': 'M 7 2 C 1 2 1 20 7 20 C 13 20 13 2 7 2 Z',
  '1': 'M 3 6 L 7 2 L 7 20 M 3 20 L 11 20',
  '2': 'M 2 6 C 3 0 12 1 12 6 C 12 11 3 14 2 20 L 12 20 L 13 17',
  '3': 'M 2 3 C 14 -1 15 10 7 10 C 16 10 14 23 2 19',
  '4': 'M 10 20 L 10 2 L 1 14 L 13 14',
  '5': 'M 12 2 L 3 2 L 2 10 C 15 6 16 22 2 19',
  '6': 'M 12 3 C 1 -3 -2 22 8 20 C 16 18 12 6 3 11',
  '7': 'M 1 5 L 2 2 L 13 2 C 9 9 6 14 5 20',
  '8': 'M 7 10 C -2 6 2 0 8 2 C 17 4 10 10 7 10 C -3 12 1 22 8 20 C 17 18 13 12 7 10 Z',
  '9': 'M 2 19 C 13 25 16 0 6 2 C -2 4 2 16 11 11',
};
export function EngravedYear({ year, width }: { year: number; width: number }) {
  const cuts = String(year).split('').map((digit, index) =>
    `<g transform="translate(${index * 16 + 1} 2)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="${digits[digit]}" transform="translate(.2 .3)" stroke="#987247" stroke-width="1.3" opacity=".22"/>
      <path d="${digits[digit]}" transform="translate(-.25 -.3)" stroke="#513820" stroke-width="1.45" opacity=".72"/>
      <path d="${digits[digit]}" stroke="#654629" stroke-width=".65" opacity=".65"/>
    </g>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 28">${cuts}</svg>`;
  return <Image accessible={false} pointerEvents="none" source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }}
    style={{ width, height: width * .4375 }} contentFit="contain" />;
}

// Reframe only the existing carved motif. The narrow adjacent timber sample fills
// the old carving footprint; the original row-specific artwork remains intact.
export function ShelfMotif({ index, sceneWidth }: { index: number; sceneWidth: number }) {
  const scale = sceneWidth / 1024;
  const tops = [263, 472, 627, 814, 997];
  const heights = [105, 82, 111, 78, 94];
  const y = tops[index], h = heights[index];
  const rowTop = 1536 * (.127 + index * .12);
  return <View pointerEvents="none" style={{ position: 'absolute', left: 36 * scale,
    top: (y - rowTop) * scale, width: 65 * scale, height: h * scale, overflow: 'hidden' }}>
    {Array.from({ length: 8 }, (_, inset) => <View key={inset} style={{ position: 'absolute',
      left: inset * scale, right: inset * scale, top: inset * scale, bottom: inset * scale,
      overflow: 'hidden', opacity: inset === 7 ? 1 : .18 }}>
      <Image source={require('../../../assets/bookhouse/interior.webp')} contentFit="fill"
        style={{ position: 'absolute', width: 1024 * scale * 13, height: 1536 * scale,
          left: (-102 * 13 - inset) * scale, top: (-y - inset) * scale }} />
    </View>)}
    <View style={{ position: 'absolute', left: 17 * scale, top: h * .18 * scale,
      width: 65 * .64 * scale, height: h * .64 * scale, overflow: 'hidden', opacity: .72 }}>
      <Image source={require('../../../assets/bookhouse/interior.webp')} contentFit="fill"
        style={{ position: 'absolute', width: 1024 * scale * .64, height: 1536 * scale * .64,
          left: -36 * scale * .64, top: -y * scale * .64 }} />
    </View>
  </View>;
}
