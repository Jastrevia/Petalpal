import { Circle, Group, Points, RadialGradient, vec } from '@shopify/react-native-skia';
import { memo, useEffect } from 'react';
import {
  useDerivedValue, useFrameCallback, useReducedMotion,
  useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { FIREFLIES, fireflyAt, type Firefly, type FireflySettings } from './fireflyMotion';

const ORIGIN=vec(0,0);
// Separate optical roles. Only the tiny core reaches ivory; the surrounding
// light stays gold. The small ivory core uses src-over to retain its color.
const CORE=['#FFFDF0','#FFF5C0','#F8DE78FA','#F4D77B00'];
const INNER=['#FFF0AAFF','#F9D86BF5','#F0BC4688','#EDB84A00'];
const BLOOM=['#F4D77B99','#E9BF6429','#E9BF6400'];

const TRAIL_OFFSETS = [-5.0, -4.375, -3.75, -3.125, -2.5, -1.875, -1.25, -0.625, 0] as const;

const FireflyDiagnosticTrail = memo(function FireflyDiagnosticTrail({
  fly, seconds, showTrails,
}: {
  fly: Firefly; seconds: SharedValue<number>; showTrails: boolean;
}) {
  const prevTransform = useDerivedValue(() => {
    const p = fireflyAt(fly, seconds.value - 5);
    return [{ translateX: p.x }, { translateY: p.y }];
  }, [fly, seconds]);
  const trailPoints = useDerivedValue(() => {
    const t = seconds.value;
    return TRAIL_OFFSETS.map(dt => {
      const p = fireflyAt(fly, t + dt);
      return vec(p.x, p.y);
    });
  }, [fly, seconds]);

  return <Group>
    {showTrails && (
      <Points
        points={trailPoints}
        mode="polygon"
        style="stroke"
        strokeWidth={1.5}
        strokeCap="round"
        color="#38BDF8B8"
      />
    )}
    <Group transform={prevTransform}>
      <Circle cx={0} cy={0} r={3.6} style="stroke" strokeWidth={1.3} color="#38BDF8E0" />
    </Group>
  </Group>;
});

const FireflyLight=memo(function FireflyLight({fly,seconds,settings}:{
  fly:Firefly; seconds:SharedValue<number>; settings:FireflySettings;
}) {
  const transform=useDerivedValue(()=>{
    const s=fireflyAt(fly,seconds.value);
    return [{translateX:s.x},{translateY:s.y},{scale:fly.scale}];
  },[fly,seconds]);
  const coreRadius=useDerivedValue(()=>{
    const s=fireflyAt(fly,seconds.value);
    return settings.coreSize*(settings.maxBrightness?1:s.sizeScale);
  },[fly,seconds,settings]);
  const coreAlpha=useDerivedValue(()=>{
    const s=fireflyAt(fly,seconds.value);
    const op=settings.maxBrightness?1:Math.pow(s.opacity,.55);
    return Math.min(1,op*settings.brightness*settings.coreOpacity);
  },[fly,seconds,settings]);
  const innerAlpha=useDerivedValue(()=>{
    const s=fireflyAt(fly,seconds.value);
    const op=settings.maxBrightness?1:Math.pow(s.opacity,.72);
    return Math.min(1,op*settings.brightness*settings.haloOpacity);
  },[fly,seconds,settings]);
  const bloomAlpha=useDerivedValue(()=>{
    const s=fireflyAt(fly,seconds.value);
    const op=settings.maxBrightness?1:s.opacity;
    return Math.min(1,op*settings.brightness*settings.bloomOpacity);
  },[fly,seconds,settings]);
  const showDiag = Boolean(__DEV__ && settings.motionDiagnostic);
  return <Group>
    {showDiag && (
      <FireflyDiagnosticTrail
        fly={fly}
        seconds={seconds}
        showTrails={settings.showTrails !== false}
      />
    )}
    <Group transform={transform}>
      {showDiag && (
        <Circle cx={0} cy={0} r={6.8} style="stroke" strokeWidth={1.4} color="#4ADE80E8" />
      )}
      <Group opacity={bloomAlpha} transform={[{rotate:fly.phase},{scaleX:1.13},{scaleY:.86}]}>
        <Circle cx={0} cy={0} r={settings.bloomRadius}>
          <RadialGradient c={vec(.7,-.5)} r={settings.bloomRadius} colors={BLOOM} positions={[0,.4,1]} />
        </Circle>
      </Group>
      <Group opacity={innerAlpha} blendMode="screen" transform={[{rotate:fly.phase*.4},{scaleY:.91}]}>
        <Circle cx={0} cy={0} r={settings.haloRadius}>
          <RadialGradient c={ORIGIN} r={settings.haloRadius} colors={INNER} positions={[0,.36,.66,1]} />
        </Circle>
      </Group>
      <Group opacity={coreAlpha}>
        <Circle cx={0} cy={0} r={coreRadius}>
          <RadialGradient c={ORIGIN} r={coreRadius} colors={CORE} positions={[0,.55,.82,1]} />
        </Circle>
      </Group>
    </Group>
  </Group>;
});

/** GardenScene mounts this only while the shared night fade and world are active. */
export default function FireflyLayer({clock,light,settings}:{
  clock:SharedValue<number>; light:SharedValue<number>; settings:FireflySettings;
}) {
  const reduced=useReducedMotion();
  const seconds=useSharedValue(0);
  const speed=useSharedValue(settings.speed);
  useEffect(()=>{speed.value=settings.speed;},[settings.speed,speed]);
  const frame=useFrameCallback(info=>{
    if(reduced) return;
    const dt=Math.min(.064,Math.max(0,(info.timeSincePreviousFrame??16.667)/1000));
    seconds.value+=dt*speed.value+clock.value*0;
  },false);
  useEffect(()=>{
    frame.setActive(!reduced);
    return ()=>frame.setActive(false);
  },[frame,reduced]);
  return <Group opacity={light}>
    {FIREFLIES.slice(0,settings.count).map((fly,i)=><FireflyLight key={i} fly={fly} seconds={seconds} settings={settings}/>)}
  </Group>;
}
