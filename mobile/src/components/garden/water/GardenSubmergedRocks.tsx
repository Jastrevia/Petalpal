import { BlurStyle, Image, ImageShader, Rect, Shader, Skia, TileMode, useImage } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { type WaterTopFlow } from './WaterTopAssembly';
import { WATER_WAVE_SKSL } from './waterWaveShader';

// Independent coves, not a dilated land mask. Positions stay fixed while the
// mineral faces are resolved in a three-quarter-resolution static cache.
const SHELVES = [
  [390,1328,350,125,30], [80,1030,110,310,23],
  [1600,1140,155,230,23], [1410,1625,200,145,20],
  [1770,1710,150,95,12], [2170,250,170,130,16],
  [2230,895,190,130,20], [2130,1530,240,110,25],
  [1650,300,130,230,19],
  // Three submerged mineral toes beside the new waterfall banks. The impact
  // and southwest outlet stay open; all earlier stone candidates are retained.
  [1060,285,0,0,1], [1000,320,0,0,1], [945,355,0,0,1],
  // Broken mineral shelves continue into the upper water visible in portrait
  // framing. They follow separate terrain shoulders, with quiet water between
  // them; they are deliberately neither a perimeter nor a second shoreline.
  [485,-90,195,120,10], [740,-270,145,85,7],
  [1220,30,125,150,15], [1410,-165,220,78,12],
  [1790,75,100,175,14], [2030,160,150,105,11],
  [2320,380,65,145,8],
] as const;
const UPPER_SHELF_START = 12;
// Keep the 0.75 raster grid aligned with the original cache: extending the
// top by 352 world units is exactly 264 pixels, so existing faces do not shift.
const FLOOR_BOUNDS = { x:-300, y:-652, width:3000, height:2752 };
// Carve resting water out of the existing coves. The surviving faces form
// short bank clusters, bridge-entry pairs, and isolated stones; fragments
// tucked under the banks remain intact rather than producing a new edge ring.
const STONE_REST_GAPS = [
  [1,5,6,14,21],
  [9,14,15,22],
  [1,7,11,13,17,20],
  [0,3,11,12,19],
  [0,1,4,5,6,7,9,10,11],
  [0,7],
  [3],
  [3,4,5,11],
  [],
  [0], [0], [0],
  [1,4,8], [1,2,4,5], [2,5,9,12], [0,3,6,8],
  [1,5,9,12], [2,6,8], [1,4,6],
] as const;

function makeFloor() {
  // A raster snapshot is portable between the web view's graphics context and
  // this one-time floor builder; a separate GPU context cannot share textures.
  const surface = Skia.Surface.Make(2250, 2064);
  if (!surface || !(surface as any).ref) return null;
  const canvas = surface.getCanvas();
  if (!canvas) {
    surface.dispose();
    return null;
  }
  canvas.clear(Skia.Color('transparent'));
  canvas.scale(0.75,0.75);
  canvas.translate(-FLOOR_BOUNDS.x,-FLOOR_BOUNDS.y);
  let seed=9137;
  const random=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  for (const [shelfIndex,[cx,cy,rx,ry,count]] of SHELVES.entries()) {
    // No cove-wide cyan wash: the visible floor between stones belongs to the
    // water material, so individual warm mineral faces remain unobscured.
    const paint=Skia.Paint(); paint.setAntiAlias(true);
    const restingWater=new Set<number>(STONE_REST_GAPS[shelfIndex]);
    const upperShelf=shelfIndex>=UPPER_SHELF_START;
    for(let n=0;n<count;n++) {
      const angle=random()*Math.PI*2, radius=Math.sqrt(random())*0.91;
      // This exposed shoulder opens laterally toward the treehouse instead
      // of stacking its three surviving faces along the waterfall wall.
      const shoulderOffset=shelfIndex===13 && n===6 ? -50 : 0;
      const x=cx+Math.cos(angle)*rx*radius+shoulderOffset,y=cy+Math.sin(angle)*ry*radius;
      const w=12+random()*24,h=w*(0.52+random()*0.37);
      const points=Array.from({length:8},(_,i)=>{const a=(i+random()*0.38)*Math.PI/4;const r=0.63+random()*0.5;return {x:x+Math.cos(a)*w*r,y:y+Math.sin(a)*h*r};});
      // Consume the complete original candidate before skipping it, so every
      // surviving stone keeps its position, silhouette, color, and softness.
      const edgeSoftness=0.18+random()*0.16;
      const opacity=0.83+random()*0.12;
      if(restingWater.has(n)) continue;
      // More water separates these upper shelf fragments from the eye. Their
      // outer stones soften and recede independently instead of fading a
      // whole bank beneath a broad milky wash.
      const immersion=upperShelf ? 0.64+(1-radius)*0.25 : 1-radius*0.09;
      const body=Skia.Path.Make();
      body.moveTo((points[7].x+points[0].x)/2,(points[7].y+points[0].y)/2);
      points.forEach((p,i)=>{const next=points[(i+1)%8];body.quadTo(p.x,p.y,(p.x+next.x)/2,(p.y+next.y)/2);}); body.close();
      // Warm limestone, pale tan, and olive-gray tops sit above cool submerged
      // sides. Four uneven values give volume without an outlined pebble icon.
      const palettes=[
        ['#E3D7B4','#CDBF99','#9CA88F','#629A99'],
        ['#D6D8BE','#B5C3A7','#8BA69A','#5B969B'],
        ['#DDCDAE','#C4B496','#9CA691','#66999A'],
        ['#C6CBB2','#ABB59C','#83A69B','#568F98'],
        ['#E3DCC2','#C6C5AA','#A1B3A0','#6B9F9D'],
      ];
      const mineralTones=palettes[n%palettes.length];
      const shade=Skia.Shader.MakeLinearGradient({x:x-w*0.38,y:y-h*0.82},{x:x+w*0.30,y:y+h*0.90},
        mineralTones.map(c=>Skia.Color(c)),[0,0.35,0.68,1],TileMode.Clamp);
      const blur=Skia.MaskFilter.MakeBlur(BlurStyle.Normal,edgeSoftness+(upperShelf ? 0.35+radius*0.45 : 0),true);
      paint.setShader(shade); paint.setAlphaf(opacity*immersion); paint.setMaskFilter(blur);
      canvas.drawPath(body,paint); paint.setShader(null);
      // The offset cap follows the irregular silhouette but is deliberately
      // incomplete; unequal faces stay painterly even when visible at rest.
      const facetBias=(n%4-1.5)*0.045;
      const facet=Skia.Path.Make();
      facet.moveTo(x-w*0.57,y-h*(0.18+facetBias));
      facet.quadTo(x-w*0.42,y-h*0.56,x-w*(0.14-facetBias),y-h*0.62);
      facet.lineTo(x+w*0.37,y-h*(0.30-facetBias));
      facet.quadTo(x+w*0.33,y-h*0.05,x+w*(0.14+facetBias),y+h*0.12);
      facet.lineTo(x-w*0.28,y+h*(0.15+facetBias)); facet.close();
      paint.setColor(Skia.Color(['#E8D9B8','#DDE0C6','#E6D4B7','#CCD2B9','#EBE1C7'][n%5]));
      paint.setAlphaf((0.48+(n%3)*0.045)*immersion);
      canvas.drawPath(facet,paint); facet.dispose();
      // A broad mineral side and a smaller broken face give shallow stones
      // readable planes, without heavy contact shadows or luminous rims.
      const side=Skia.Path.Make();
      side.moveTo(x+w*(0.14+facetBias),y+h*0.13);
      side.lineTo(x+w*(0.62-facetBias),y-h*0.12);
      side.quadTo(x+w*0.61,y+h*0.31,x+w*0.31,y+h*(0.55+facetBias));
      side.lineTo(x-w*0.02,y+h*0.39); side.close();
      paint.setColor(Skia.Color(n%2===0?'#608B83':'#56878A'));
      paint.setAlphaf((0.42+(n%3)*0.035)*immersion);
      canvas.drawPath(side,paint); side.dispose();
      if(n%3!==1) {
        const mineral=Skia.Path.Make();
        mineral.moveTo(x-w*0.41,y-h*0.12);
        mineral.lineTo(x-w*0.13,y-h*(0.35+facetBias));
        mineral.lineTo(x+w*0.04,y-h*0.17);
        mineral.lineTo(x-w*0.12,y+h*0.04); mineral.close();
        paint.setColor(Skia.Color(n%2===0?'#9DA184':'#ABA78B'));
        paint.setAlphaf(0.32*immersion);
        canvas.drawPath(mineral,paint); mineral.dispose();
      }
      paint.setMaskFilter(null);
      shade.dispose(); blur.dispose(); body.dispose();
    }
    paint.dispose();
  }
  surface.flush(); const image=surface.makeImageSnapshot(); surface.dispose(); return image;
}
const REFRACTED_STONES = Skia.RuntimeEffect.Make(`
uniform shader stones;
uniform shader shoreline;
uniform shader openWater;
uniform float seconds;
${WATER_WAVE_SKSL}
half4 main(float2 p) {
  float distance=shoreline.eval(p).r*320.0;
  float mask=openWater.eval(p).r*smoothstep(14.0,62.0,distance);
  // Only the view THROUGH water shifts. Cached stone positions and the
  // shoreline/opaque land render above this layer without deformation.
  return stones.eval(p+waterRefraction(p,seconds)*mask);
}
`);
function GardenSubmergedRocks({ flow }: { flow: WaterTopFlow }) {
  // Each Garden root owns its own snapshot. On web, an unmounting root deletes
  // the images it drew, so a module-wide copy shared with a friend's Garden was
  // deleted under the still-mounted home Garden when the visitor returned.
  const floor = useMemo(makeFloor, []);
  const shore=useImage(require('./assets/garden-shore-distance.png'));
  const wet=useImage(require('./assets/water-surface-mask.png'));
  const uniforms=useDerivedValue(() => ({
    seconds: flow.enabled ? flow.seconds.value : 0,
  }), [flow.enabled, flow.seconds]);
  if (!floor) return null;
  if (!REFRACTED_STONES || !shore || !wet) return <Image image={floor} {...FLOOR_BOUNDS} fit="fill" />;
  return <Rect {...FLOOR_BOUNDS}>
    <Shader source={REFRACTED_STONES} uniforms={uniforms}>
      <ImageShader image={floor} rect={FLOOR_BOUNDS} fit="fill" tx="decal" ty="decal" />
      <ImageShader image={shore} rect={{ x:0,y:0,width:2400,height:1800 }} fit="fill" tx="clamp" ty="clamp" />
      <ImageShader image={wet} rect={{ x:0,y:0,width:2400,height:1800 }} fit="fill" tx="clamp" ty="clamp" />
    </Shader>
  </Rect>;
}
export default memo(GardenSubmergedRocks);
