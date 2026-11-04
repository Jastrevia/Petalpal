import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { BlurStyle, Canvas, Picture, Skia, TileMode, createPicture } from '@shopify/react-native-skia';
import { tt } from '../../../services/treehouseCopy';

type Point = { x: number; y: number };
const MS = 3400;
function clamp01(t: number) { 'worklet'; return Math.max(0, Math.min(1, t)); }
function span(t: number, a: number, b: number) { 'worklet'; return clamp01((t - a) / (b - a)); }
function easeOut(t: number) { 'worklet'; const x = clamp01(t); return 1 - Math.pow(1 - x, 3); }
function easeInOut(t: number) { 'worklet'; const x = clamp01(t); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

/** The journal-saving acknowledgement, played only after the server has confirmed the save: a warm glow at the
 *  quill (its slot on the desk, or the Save control until the quill is placed), a small golden mote travelling in an
 *  arc to the page, an embossed botanical seal pressed onto the page, and a readable "Journal saved" that fades. */
export function SaveCeremony({ from, to, label, run, reducedMotion, onDone }: {
  from: Point; to: Point; label: Point; run: number; reducedMotion: boolean; onDone: () => void;
}) {
  const t = useSharedValue(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const finish = () => doneRef.current();
    t.value = 0;
    t.value = withTiming(1, { duration: reducedMotion ? 2600 : MS, easing: Easing.linear }, done => { if (done) runOnJS(finish)(); });
  }, [run, reducedMotion, t]);
  const picture = useDerivedValue(() => createPicture(canvas => {
    const p = t.value;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    // 1. The quill glows.
    const glow = reducedMotion ? 0 : Math.sin(Math.PI * span(p, 0, .34));
    if (glow > .01) {
      paint.setShader(Skia.Shader.MakeRadialGradient(from, 46, [Skia.Color('#FFE6A0CC'), Skia.Color('#F2B95A55'), Skia.Color('#F2B95A00')], [0, .45, 1], TileMode.Clamp));
      paint.setAlphaf(glow);
      canvas.drawCircle(from.x, from.y, 46, paint);
      paint.setShader(null);
    }
    // 2. A golden mote travels along an arc to the page, trailing a few fading sparks.
    const travel = span(p, .16, .42);
    if (!reducedMotion && travel > 0 && travel < 1) {
      const mid = { x: (from.x + to.x) / 2 + (to.y - from.y) * .18, y: Math.min(from.y, to.y) - 60 };
      const at = (k: number) => { const u = easeInOut(k), v = 1 - u; return { x: v * v * from.x + 2 * v * u * mid.x + u * u * to.x, y: v * v * from.y + 2 * v * u * mid.y + u * u * to.y }; };
      for (let i = 5; i >= 0; i--) {
        const q = at(Math.max(0, travel - i * .045));
        const r = i === 0 ? 5.5 : 3.6 - i * .45;
        paint.setShader(Skia.Shader.MakeRadialGradient(q, r * 3, [Skia.Color('#FFF6D2'), Skia.Color('#F4C15ACC'), Skia.Color('#F4C15A00')], [0, .3, 1], TileMode.Clamp));
        paint.setAlphaf(1 - i * .15);
        canvas.drawCircle(q.x, q.y, r * 3, paint);
      }
      paint.setShader(null);
    }
    // 3. The seal is pressed onto the page: it lands a little large, settles, and later fades with the message.
    const press = span(p, .4, .52), fade = 1 - span(p, .82, 1);
    if (press > 0 && fade > 0) {
      const s = (1.25 - .25 * easeOut(press)) * 1;
      const a = Math.min(1, press * 2) * fade;
      const R = 23 * s;
      const shadow = Skia.Paint(); shadow.setAntiAlias(true); shadow.setColor(Skia.Color('#3A2410')); shadow.setAlphaf(.35 * a);
      shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 3, true));
      canvas.drawCircle(to.x + 1, to.y + 2, R, shadow);
      paint.setAlphaf(a);
      paint.setShader(Skia.Shader.MakeRadialGradient({ x: to.x - R * .35, y: to.y - R * .4 }, R * 1.5, [Skia.Color('#F7DE9C'), Skia.Color('#CFA052'), Skia.Color('#8E6526')], [0, .55, 1], TileMode.Clamp));
      canvas.drawCircle(to.x, to.y, R, paint);
      paint.setShader(null);
      const ring = Skia.Paint(); ring.setAntiAlias(true); ring.setStyle(1); ring.setStrokeWidth(1.2); ring.setColor(Skia.Color('#FFF1C4')); ring.setAlphaf(.8 * a);
      canvas.drawCircle(to.x, to.y, R * .8, ring);
      // A botanical check: a stem drawn as a tick with two small leaves.
      const tick = Skia.PathBuilder.Make();
      tick.moveTo(to.x - R * .38, to.y + R * .02); tick.quadTo(to.x - R * .2, to.y + R * .2, to.x - R * .08, to.y + R * .34);
      tick.quadTo(to.x + R * .12, to.y - R * .12, to.x + R * .42, to.y - R * .36);
      const ink = Skia.Paint(); ink.setAntiAlias(true); ink.setStyle(1); ink.setStrokeWidth(3 * s); ink.setStrokeCap(1); ink.setColor(Skia.Color('#5E3F14')); ink.setAlphaf(a);
      canvas.drawPath(tick.build(), ink);
      const leaf = Skia.PathBuilder.Make();
      leaf.moveTo(to.x + R * .12, to.y - R * .1); leaf.quadTo(to.x + R * .32, to.y - R * .02, to.x + R * .38, to.y + R * .14); leaf.quadTo(to.x + R * .18, to.y + R * .12, to.x + R * .12, to.y - R * .1);
      leaf.moveTo(to.x - R * .02, to.y + R * .1); leaf.quadTo(to.x - R * .26, to.y - R * .12, to.x - R * .3, to.y - R * .3); leaf.quadTo(to.x - R * .06, to.y - R * .22, to.x - R * .02, to.y + R * .1);
      const green = Skia.Paint(); green.setAntiAlias(true); green.setColor(Skia.Color('#5E3F14')); green.setAlphaf(.85 * a);
      canvas.drawPath(leaf.build(), green);
      // A brief warm bloom as it lands.
      const bloom = Math.sin(Math.PI * span(p, .4, .6));
      if (!reducedMotion && bloom > .01) {
        paint.setShader(Skia.Shader.MakeRadialGradient(to, R * 2.6, [Skia.Color('#FFE6A080'), Skia.Color('#FFE6A000')], [0, 1], TileMode.Clamp));
        paint.setAlphaf(bloom);
        canvas.drawCircle(to.x, to.y, R * 2.6, paint);
        paint.setShader(null);
      }
    }
  }), [from, to, reducedMotion]);
  const labelStyle = useAnimatedStyle(() => ({ opacity: span(t.value, .44, .54) * (1 - span(t.value, .84, 1)),
    transform: [{ translateY: 6 * (1 - easeOut(span(t.value, .44, .58))) }] }));
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Canvas style={StyleSheet.absoluteFill}><Picture picture={picture} /></Canvas>
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: label.y, alignItems: 'center' }, labelStyle]}>
      <View accessibilityLiveRegion="polite" accessibilityLabel={tt('Journal saved')} style={styles.label}><Text style={styles.text}>{tt('❦  Journal saved')}</Text></View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: '#F8EDD5F5', borderWidth: 1.5, borderColor: '#C9A264',
    shadowColor: '#1B0E06', shadowOpacity: .4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  text: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 17, color: '#4B3218' },
});
