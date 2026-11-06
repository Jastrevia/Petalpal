import { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

const structure = require('../../../assets/bookhouse/continuous-structure.webp');
const outdoor = require('../../../assets/bookhouse/interior.webp');
// All positions use the original artwork's width, including the extended tabletop.
export const SCENE_ASPECT = 2.25;
// Back edge of the tabletop in the shared artwork; the book sits just in front.
export const DESK_Y = 1.24;
const lamps = [{ x: .19, y: .107, size: .055 }, { x: .79, y: .107, size: .055 }, { x: .075, y: 1.185, size: .075 }];
const Pool = memo(function Pool({ x, y, width, height, strength }: { x: number; y: number; width: number; height: number; strength: number }) {
  return <View style={{ position: 'absolute', left: x - width / 2, top: y - height / 2, width, height }}>
    {Array.from({ length: 20 }, (_, i) => <View key={i} style={{ position: 'absolute', left: `${i * 2.3}%`, right: `${i * 2.3}%`, top: `${i * 2.3}%`, bottom: `${i * 2.3}%`, borderRadius: 9999, backgroundColor: '#FFD695', opacity: strength * .035 }} />)}
  </View>;
});

export function BookhouseEnvironment({ width, night }: { width: number; night: boolean }) {
  return <View pointerEvents="none" testID="bookhouse-continuous-environment" style={[StyleSheet.absoluteFill, { width, height: width * SCENE_ASPECT, backgroundColor: '#493120' }]}>
    {/* Outdoor imagery is behind the window cutouts, not a separate scenic strip. */}
    <Image source={outdoor} blurRadius={3} style={{ position: 'absolute', width, height: width * 1.5 }} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: night ? '#081C3E' : '#D8E4DF', opacity: night ? .7 : .16 }]} />
    <Image source={structure} style={[StyleSheet.absoluteFill, { width, height: width * SCENE_ASPECT }]} resizeMode="contain" />
  </View>;
}

export function SceneLighting({ width, night }: { width: number; night: boolean }) {
  return <View pointerEvents="none" testID={night ? 'bookhouse-lanterns-on' : 'bookhouse-lanterns-off'} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: night ? '#091528' : '#CBDCE4', opacity: night ? .42 : .045 }]} />
    {night && lamps.map(lamp => <View key={lamp.x} style={StyleSheet.absoluteFill}>
      <Pool x={lamp.x * width} y={lamp.y * width} width={width * .31} height={width * .34} strength={.32} />
      <Pool x={lamp.x * width} y={lamp.y * width} width={width * lamp.size} height={width * lamp.size * 1.28} strength={2.6} />
    </View>)}
    {night && <Pool x={width * .21} y={width * 1.52} width={width * .8} height={width * .65} strength={.28} />}
  </View>;
}
