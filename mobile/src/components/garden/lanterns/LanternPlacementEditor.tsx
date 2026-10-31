import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { LanternPlacement } from './lanternPlacement';
import { LANTERN_STORAGE_KEY } from './lanternPlacement';
import { useWorldTime } from '../world-time/WorldTimeProvider';

type Camera = { baseX: number; baseY: number; fit: number;
  cameraX: SharedValue<number>; cameraY: SharedValue<number>; cameraZoom: SharedValue<number> };
type Props = Camera & {
  placements: LanternPlacement[]; ready: boolean; status: string;
  update: (p: LanternPlacement) => void; save: () => Promise<void>;
  focus: (x: number, y: number) => void;
};
const button = { padding: 8, borderRadius: 6, backgroundColor: '#e3d5bc', margin: 2 };

function Handle({ placement: p, camera, selected, select, update }: {
  placement: LanternPlacement; camera: Camera; selected: boolean;
  select: () => void; update: Props['update'];
}) {
  const current = useRef({ p, camera, select, update });
  current.current = { p, camera, select, update };
  const start = useRef(p);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { start.current = current.current.p; current.current.select(); },
    onPanResponderMove: (_, gesture) => {
      const c = current.current.camera;
      const scale = c.fit * c.cameraZoom.value;
      if (scale > 0) current.current.update({ ...start.current,
        x: start.current.x + gesture.dx / scale, y: start.current.y + gesture.dy / scale });
    },
    onPanResponderTerminationRequest: () => false,
  }), []);
  const style = useAnimatedStyle(() => ({
    left: camera.baseX + camera.cameraX.value + p.x * camera.fit * camera.cameraZoom.value - 18,
    top: camera.baseY + camera.cameraY.value + p.y * camera.fit * camera.cameraZoom.value - 18,
  }), [camera.baseX, camera.baseY, camera.fit, p.x, p.y]);
  return <Animated.View {...responder.panHandlers} style={[{ position: 'absolute', width: 36, height: 36,
    borderWidth: 2, borderRadius: 18, borderColor: selected ? '#ffdc79' : '#fff',
    backgroundColor: selected ? '#76539dcc' : '#293c52aa', alignItems: 'center', justifyContent: 'center',
  }, style]} accessibilityLabel={`Drag ${p.id}`}>
    <Text style={{ color: 'white', fontSize: 11 }}>{p.kind === 'ground' ? 'G' : 'L'}{p.id.slice(-2)}</Text>
  </Animated.View>;
}

export default function LanternPlacementEditor(props: Props) {
  const pathname = usePathname();
  const worldTime = useWorldTime();
  const [copyStatus, setCopyStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(props.placements[0].id);
  const p = props.placements.find(p => p.id === selected)!;
  async function copySavedPlacements() {
    try {
      // Read only the saved string. Never save current editor state or reserialize it.
      const raw = window.localStorage.getItem(LANTERN_STORAGE_KEY);
      if (raw === null) {
        setCopyStatus('Copy failed: no saved placements found. Nothing was changed.');
        return;
      }
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length !== 16) {
        setCopyStatus('Copy failed: saved JSON does not contain 16 placements. Nothing was changed.');
        return;
      }
      await navigator.clipboard.writeText(raw);
      setCopyStatus('Copied all 16 saved placements as exact JSON. Paste it into the chat.');
    } catch {
      setCopyStatus('Copy failed: saved data or clipboard unavailable. Nothing was changed.');
    }
  }
  if (!__DEV__) return null;
  return <>
    {open && <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0 }}>
      {props.placements.map(item => <Handle key={item.id} placement={item} camera={props}
        selected={item.id === selected} select={() => setSelected(item.id)} update={props.update} />)}
    </View>}
    <View style={{ position: 'absolute', right: 10, top: 70, maxWidth: 310, borderRadius: 10,
      backgroundColor: '#253747f2', padding: 8, zIndex: 10000 }}>
      <Pressable style={button} disabled={!props.ready} onPress={() => setOpen(!open)}>
        <Text>{open ? 'Close lantern editor' : 'Edit 16 lanterns'}</Text>
      </Pressable>
      {open && <>
        <View style={{ flexDirection: 'row' }}>{(['auto', 'day', 'night'] as const).map(phase =>
          <Pressable key={phase} style={[button, worldTime.override === phase && { backgroundColor: '#e9bfe8' }]}
            onPress={() => worldTime.setOverride(phase)}><Text>{phase}</Text></Pressable>)}</View>
        <Text style={{ color: '#ffe5a6', margin: 4 }}>{p.id}</Text>
        <Text style={{ color: 'white', margin: 4 }}>Drag the circular base handle. Pan elsewhere; use +/− to zoom.</Text>
        <ScrollView style={{ maxHeight: 130 }}>
          {props.placements.map(item => <Pressable key={item.id} style={[button,
            item.id === selected && { backgroundColor: '#e9bfe8' }]} onPress={() => {
            setSelected(item.id); props.focus(item.x, item.y - (item.kind === 'ground' ? 65 : 20));
          }}><Text>{item.id}</Text></Pressable>)}
        </ScrollView>
        <Text style={{ color: 'white', margin: 4 }}>x {p.x.toFixed(1)} · y {p.y.toFixed(1)}
          {'\n'}Scale {p.scale.toFixed(2)} · Rotation {p.rotation.toFixed(0)}°</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {[['Smaller', -0.05], ['Larger', 0.05]].map(([label, delta]) =>
            <Pressable key={label} style={button} onPress={() => props.update({ ...p, scale: +(p.scale + Number(delta)).toFixed(2) })}><Text>{label}</Text></Pressable>)}
          {[-5, 5].map(delta => <Pressable key={delta} style={button} onPress={() => props.update({ ...p, rotation: p.rotation + delta })}><Text>Rotate {delta}°</Text></Pressable>)}
        </View>
        <Pressable style={button} onPress={() => void props.save()}><Text>Save all placements</Text></Pressable>
        {Platform.OS === 'web' && pathname === '/lantern-preview' && <>
          <Pressable accessibilityRole="button" style={button} onPress={() => void copySavedPlacements()}>
            <Text>Copy All Placements JSON</Text>
          </Pressable>
          {!!copyStatus && <Text accessibilityLiveRegion="polite" style={{ color: '#fff3d0', margin: 4 }}>{copyStatus}</Text>}
        </>}
        <Text accessibilityLiveRegion="polite" style={{ color: '#fff3d0', margin: 4 }}>{props.status}</Text>
      </>}
    </View>
  </>;
}
