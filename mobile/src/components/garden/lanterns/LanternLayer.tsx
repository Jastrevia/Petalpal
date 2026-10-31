import { Circle, ColorMatrix, Group, Image, Oval, RadialGradient, useImage, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { LanternPlacement } from './lanternPlacement';
import type { WaterTopFlow } from '../water/WaterTopAssembly';

// Glass panes inside the metal frame, in the unchanged sprite destination rect.
const GLASS = 'M 13 -105 L 19 -103 L 19 -86 L 13 -88 Z M 20 -103 L 29 -105 L 29 -89 L 20 -86 Z';
const LOTUS_PETALS = 'M -40 -28 Q -39 -38 -31 -36 L -20 -45 L -11 -43 L 0 -51 L 12 -43 L 23 -45 L 31 -35 L 42 -34 Q 33 -14 0 -9 Q -29 -13 -40 -28 Z';
const LIT_GLASS = [1,0,0,0,.10, 0,.85,0,0,.06, 0,0,.5,0,.015, 0,0,0,1,0];
const LIT_PETALS = [1,0,0,0,0, 0,.72,0,0,0, 0,0,.52,0,0, 0,0,0,1,0];

function Glow({ x, y, rx, ry, opacity, colors = ['#FFC878', '#EDA44F', '#D9873900'] }: {
  x: number; y: number; rx: number; ry: number; opacity: number; colors?: string[];
}) {
  return <Group opacity={opacity} transform={[{ translateX: x }, { translateY: y }, { scaleX: rx }, { scaleY: ry }]}>
    <Circle cx={0} cy={0} r={1}>
      <RadialGradient c={vec(0, 0)} r={1} colors={colors} positions={[0, .32, 1]} />
    </Circle>
  </Group>;
}

function LotusReflection({ flow, seed }: { flow: WaterTopFlow; seed: number }) {
  // Existing water phase and pause/reduced-motion policy; no new frame callback.
  const drift = useDerivedValue(() => [{ translateX: flow.enabled ? Math.sin(flow.seconds.value * .9 + seed) * .7 : 0 }]);
  return <Group transform={drift}>
    <Glow x={0} y={13} rx={10} ry={23} opacity={.18} />
    {[0, 1, 2, 3].map(i => <Glow key={i} x={i % 2 ? 1.5 : -1} y={4 + i * 7}
      rx={17 - i * 2} ry={1.4} opacity={.17 - i * .025} />)}
  </Group>;
}

/** Unchanged sprites/anchors; localized emission is composited after the scene grade. */
export default function LanternLayer({ placements, light, nightMatrix, waterFlow }: {
  placements: LanternPlacement[]; light: SharedValue<number>; nightMatrix: SharedValue<number[]>; waterFlow: WaterTopFlow;
}) {
  const ground = useImage(require('@/assets/garden/lanterns/ground.png'));
  const lotus = useImage(require('@/assets/garden/lanterns/lotus.png'));
  return <Group>{[...placements].sort((a, b) => a.y - b.y).map(p => {
    const isGround = p.kind === 'ground';
    const sprite = isGround ? ground : lotus;
    const top = isGround ? -146 : -54;
    const height = isGround ? 150 : 67;
    return <Group key={p.id} transform={[{ translateX: p.x }, { translateY: p.y },
      { rotate: p.rotation * Math.PI / 180 }, { scale: p.scale }]}>
      <Group opacity={light} blendMode="screen">
        {isGround ? <Glow x={0} y={-1} rx={44} ry={17} opacity={.16} />
          : <LotusReflection flow={waterFlow} seed={p.x} />}
      </Group>
      {isGround && <Oval x={-20} y={-4} width={40} height={9} color="rgba(36,31,38,0.18)" />}
      {sprite && <Image image={sprite} x={-50} y={top} width={100} height={height} fit="fill">
        <ColorMatrix matrix={nightMatrix} />
      </Image>}
      <Group opacity={light}>
        <Group blendMode="screen">
          <Glow x={isGround ? 21 : 0} y={isGround ? -98 : -28}
            rx={isGround ? 23 : 26} ry={isGround ? 28 : 19} opacity={isGround ? .25 : .20} />
        </Group>
        {sprite && <Group clip={isGround ? GLASS : LOTUS_PETALS}>
          <Image image={sprite} x={-50} y={top} width={100} height={height} fit="fill"
            blendMode="screen" opacity={isGround ? .95 : .26}>
            <ColorMatrix matrix={isGround ? LIT_GLASS : LIT_PETALS} />
          </Image>
          <Group blendMode="screen">
            <Glow x={isGround ? 21 : 0} y={isGround ? -97 : -29}
              rx={isGround ? 11 : 13} ry={isGround ? 17 : 14} opacity={isGround ? .95 : .85}
              colors={['#FFF4D6', '#FFC878', '#FFC87800']} />
          </Group>
        </Group>}
      </Group>
    </Group>;
  })}</Group>;
}
