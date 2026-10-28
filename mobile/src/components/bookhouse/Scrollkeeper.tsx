import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

// Scrollkeeper, the bookhouse's spirit squirrel (journal paper, its tail a scroll), resting on
// top of the bookcase. It sits and looks about (a whole generated clip, first frame = last);
// now and then, when it is back in that first pose, it folds into a journal standing on the
// shelf (a generated clip from the squirrel to the journal, so the paper really folds), stays a
// book for a while, and unfolds again (the same frames backwards). Frames: 204 × 200 cells, 10
// to a row, 12 fps, painted facing right; `ground` is the row its feet and the book stand on.
const IDLE = { source: require('../../../assets/bookhouse/scrollkeeper-idle.webp'), count: 62, rows: 7 };
const FOLD = { source: require('../../../assets/bookhouse/scrollkeeper-fold.webp'), count: 49, rows: 5 };
const CELL = { w: 204, h: 200, columns: 10, ground: 196, fps: 12 };
const between = (low: number, high: number) => low + Math.random() * (high - low);

type Phase = { clip: 'idle' | 'fold'; frame: number; step: 1 | -1 | 0; until: number };

export function Scrollkeeper({ x, y, height, still }: { x: number; y: number; height: number; still: boolean }) {
  // x, y: where its feet rest (scene units); height: drawn cell height.
  const [phase, setPhase] = useState<Phase>({ clip: 'idle', frame: 0, step: 1, until: Date.now() + between(25, 50) * 1000 });
  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setPhase(p => {
      const now = Date.now();
      if (p.clip === 'idle') {
        const frame = (p.frame + 1) % IDLE.count;
        // Fold only from its first pose, where the folding clip starts.
        return frame === 0 && now > p.until ? { clip: 'fold', frame: 0, step: 1, until: 0 } : { ...p, frame };
      }
      if (p.step === 0) return now > p.until ? { ...p, step: -1 } : p;
      const frame = p.frame + p.step;
      if (frame >= FOLD.count) return { clip: 'fold', frame: FOLD.count - 1, step: 0, until: now + between(15, 40) * 1000 };
      if (frame < 0) return { clip: 'idle', frame: 0, step: 1, until: now + between(25, 50) * 1000 };
      return { ...p, frame };
    }), 1000 / CELL.fps);
    return () => clearInterval(timer);
  }, [still]);
  const sheet = phase.clip === 'idle' ? IDLE : FOLD;
  const frame = still ? 0 : phase.frame;
  const k = height / CELL.h, w = CELL.w * k;
  return <View pointerEvents="none" accessible={false} testID="bookhouse-scrollkeeper"
    style={{ position: 'absolute', left: x - w / 2, top: y - CELL.ground * k, width: w, height, overflow: 'hidden' }}>
    <Image source={sheet.source} resizeMode="stretch" style={{
      position: 'absolute', width: w * CELL.columns, height: height * sheet.rows,
      left: -(frame % CELL.columns) * w, top: -Math.floor(frame / CELL.columns) * height,
    }} />
  </View>;
}
