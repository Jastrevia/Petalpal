import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

// Scrollkeeper, the bookhouse's spirit squirrel (journal paper with a ruff of paper leaves, its
// tail a scroll), resting on top of the bookcase. It sits and looks about: a generated clip made
// from the Garden spirits design sheet itself, so its colours are the sheet's, looped (first
// frame = last). 58 frames, 175 × 150 cells, 10 to a row, 12 fps, painted facing right;
// `ground` is the row its feet rest on. Folding into a journal on the shelf will come back with
// a clip made from this squirrel.
const IDLE = { source: require('../../../assets/bookhouse/scrollkeeper-idle.webp'), count: 58, rows: 6 };
const CELL = { w: 175, h: 150, columns: 10, ground: 148, fps: 12 };

export function Scrollkeeper({ x, y, height, still }: { x: number; y: number; height: number; still: boolean }) {
  // x, y: where its feet rest (scene units); height: drawn cell height.
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setFrame(f => (f + 1) % IDLE.count), 1000 / CELL.fps);
    return () => clearInterval(timer);
  }, [still]);
  const shown = still ? 0 : frame;
  const k = height / CELL.h, w = CELL.w * k;
  return <View pointerEvents="none" accessible={false} testID="bookhouse-scrollkeeper"
    style={{ position: 'absolute', left: x - w / 2, top: y - CELL.ground * k, width: w, height, overflow: 'hidden' }}>
    <Image source={IDLE.source} resizeMode="stretch" style={{
      position: 'absolute', width: w * CELL.columns, height: height * IDLE.rows,
      left: -(shown % CELL.columns) * w, top: -Math.floor(shown / CELL.columns) * height,
    }} />
  </View>;
}
