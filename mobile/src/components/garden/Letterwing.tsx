import { Group, useImage } from '@shopify/react-native-skia';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import SheetFrame from './SheetFrame';
import type { TreehousePlacement } from './TreehouseCalibrationEditor';

// Letterwing, the mailbox's spirit bird (letter paper, handwriting and blossoms): it circles the
// mailbox so the mailbox reads as its own place to tap; with an unread letter its loop is closer
// and a little quicker. One sheet of painted frames from two generated clips sharing one crop
// (220 × 150 cells, 11 to a row, 12 fps, painted facing right): FLY, a whole flying clip
// (several wingbeats, first frame = last), then TURN, the bird turning round in the air from
// facing right to facing left through a front view, then FOLD, the bird opening out into a sheet
// of letter paper that folds itself into a sealed envelope. One sheet, so one draw per frame.
// Most of the time it is a sealed envelope resting beside the mailbox (REST seconds); then it
// unfolds (FOLD backwards) into the bird, flies LOOPS laps, glides back down while it folds, and
// rests again. The cycle starts as the envelope, so that is what the Garden opens on. In flight
// it flies one whole FLY loop along each side of its
// circuit, so it always reaches a turn in the pose the turn starts from; at the right end it
// plays TURN, at the left end TURN mirrored (left to right). It never flips flat like a card.
const ART = require('@/assets/garden/spirits/letterwing.webp');
const FLY = { count: 62 }, TURN = { count: 26 }, FOLD = { count: 62 };
const LOOPS = 2, REST = 80;
const CELL = { w: 220, h: 150, columns: 11, fps: 12 };
const STRAIGHT = FLY.count / CELL.fps, TURNING = TURN.count / CELL.fps, FOLDING = FOLD.count / CELL.fps;
const LAP = 2 * (STRAIGHT + TURNING), CYCLE = LOOPS * LAP + 2 * FOLDING + REST;
// Half a circuit's angle spent turning at each end (radians).
const TURN_ARC = 0.7;

// Where in its cycle it is: angle on the loop, which way it faces, the frame in the sheet, and
// how far it has gone down to the mailbox (`rest`, 0 on the loop … 1 resting as an envelope).
function circuit(seconds: number) {
  'worklet';
  // Shifted so time 0 falls in the middle of a rest: the Garden opens on the envelope.
  const shifted = seconds + LOOPS * LAP + FOLDING + REST / 2;
  const c = ((shifted % CYCLE) + CYCLE) % CYCLE;
  if (c >= LOOPS * LAP) {
    // The visit starts where a lap starts (facing right, first flight frame = first fold frame).
    const v = c - LOOPS * LAP;
    const fold = v < FOLDING ? v / FOLDING : v < FOLDING + REST ? 1 : Math.max(0, 1 - (v - FOLDING - REST) / FOLDING);
    const k = Math.min(FOLD.count - 1, Math.floor(fold * FOLD.count));
    return { angle: Math.PI + TURN_ARC / 2, facing: 1, flying: false, frame: FLY.count + TURN.count + k, along: 0, rest: fold * fold * (3 - 2 * fold) };
  }
  const period = LAP, t = c % period;
  const half = t < STRAIGHT + TURNING ? 0 : 1, u = t - half * (STRAIGHT + TURNING);
  // Half 0: along the far side to the right, then the turn at the right end; half 1 mirrors it.
  const flying = u < STRAIGHT;
  const along = flying ? u / STRAIGHT : (u - STRAIGHT) / TURNING;
  const start = Math.PI + half * Math.PI + (flying ? TURN_ARC / 2 : Math.PI - TURN_ARC / 2);
  const angle = start + along * (flying ? Math.PI - TURN_ARC : TURN_ARC);
  const frame = Math.min(flying ? FLY.count - 1 : TURN.count - 1, Math.floor(along * (flying ? FLY.count : TURN.count)));
  return { angle, facing: half === 0 ? 1 : -1, flying, frame: flying ? frame : FLY.count + frame, along, rest: 0 };
}

export default function Letterwing({ placement, clock, unread }: {
  placement: TreehousePlacement; clock: SharedValue<number>; unread: boolean;
}) {
  const sheet = useImage(ART);
  const reduced = useReducedMotion();
  const k = placement.scale;
  // The mailbox in treehouse-local units (its hit area is around 988, 802).
  const mailboxX = placement.x + 988 * k, mailboxY = placement.y + 760 * k;
  // The cell is wider than the bird (room for its turn): 230 treehouse units across its wings.
  const drawScale = 230 * k * (1126 / 777) / CELL.w;
  const rate = reduced ? 0.4 : unread ? 1.25 : 1;
  const frame = useDerivedValue(() => (reduced ? 0 : circuit(clock.value * rate).frame), [rate, reduced]);
  const transform = useDerivedValue(() => {
    const c = circuit(clock.value * rate);
    const rx = (unread ? 230 : 310) * k, ry = (unread ? 70 : 96) * k;
    const centreY = mailboxY - (unread ? 175 : 245) * k;
    // Resting: the envelope, smaller than in flight, lies on the ground beside the mailbox, just
    // right of its foot (treehouse 1095, 805, measured on screen in the Garden).
    const restX = placement.x + 1095 * k, restY = placement.y + 805 * k;
    const x = (mailboxX + rx * Math.cos(c.angle)) * (1 - c.rest) + restX * c.rest;
    const y = (centreY + ry * Math.sin(c.angle)) * (1 - c.rest) + restY * c.rest;
    // The near half of the loop is a little larger; it banks gently on the straights.
    const depth = (0.92 + 0.1 * Math.sin(c.angle)) * (1 - c.rest) + 0.6 * c.rest;
    const bank = c.flying ? 0.12 * Math.cos(c.angle) * c.facing * Math.sin(Math.PI * c.along) : 0;
    return [{ translateX: x }, { translateY: y }, { rotate: bank },
      { scaleX: c.facing * depth * drawScale }, { scaleY: depth * drawScale },
      { translateX: -CELL.w / 2 }, { translateY: -CELL.h / 2 }];
  }, [k, mailboxX, mailboxY, drawScale, unread, rate, placement.x, placement.y]);
  // Development only: window.__letterwing() is where it is now (Garden world units) and its state.
  if (__DEV__ && typeof window !== 'undefined') (window as unknown as { __letterwing?: unknown }).__letterwing = () => {
    const c = circuit(clock.value * rate), t = transform.value as { translateX?: number; translateY?: number }[];
    return { x: t[0].translateX, y: t[1].translateY, rest: c.rest, flying: c.flying, frame: c.frame };
  };
  if (!sheet) return null;
  return <Group transform={transform}>
    <SheetFrame sheet={sheet} frame={frame} columns={CELL.columns} count={FLY.count + TURN.count + FOLD.count} w={CELL.w} h={CELL.h} />
  </Group>;
}
