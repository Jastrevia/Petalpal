import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, Circle, Group, Path, Rect } from '@shopify/react-native-skia';
import SandboxGardenBackdrop from '../flower-density-sandbox/SandboxGardenBackdrop';
import { getRegionInfo } from '../flower-density-sandbox/flowerDensityModel';
import { productionGrowth } from './productionGrowth';
import { ProductionGrowthLayer } from './ProductionGrowthLayer';
import { approvedJuneGrowth, productionQARecords } from './productionGrowthQAData';
import { growthHeight, growthSectors, HEIGHT_COLORS, measureGrowth } from './growthReviewMetrics';
export { productionQARecords } from './productionGrowthQAData';
export default function ProductionGrowthQA({onClose}:{onClose:()=>void}) {
  const [count,setCount]=useState(1),[showMask,setShowMask]=useState(false);
  const [showReference,setShowReference]=useState(false),[origins,setOrigins]=useState(false);
  const [ownership,setOwnership]=useState(false),[heights,setHeights]=useState(false),[grid,setGrid]=useState(false);
  const {width}=useWindowDimensions(),canvasWidth=Math.min(900,width),height=480;
  const scenes=useMemo(()=>productionGrowth(productionQARecords(count)),[count]);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- QA tool: fixed reference data, memoized once
  const reference=useMemo(()=>approvedJuneGrowth(),[]),referenceMetrics=useMemo(()=>measureGrowth(reference,6),[reference]);
  const metrics=useMemo(()=>measureGrowth(scenes[0].growth,6),[scenes]);
  if(!__DEV__)return null;
  const region=getRegionInfo(6).bounds,scale=Math.min((canvasWidth-50)/region.width,(height-50)/region.height);
  const scene=scenes[0],display=showReference?reference:scene.growth,sectorFor=growthSectors(display.mask.points);
  const covered=new Set(display.coveredSamples.map(p=>`${p.x}:${p.y}`));
  const sectors=Object.keys(metrics.sectors),pct=(v:number)=>`${(v*100).toFixed(1)}%`;
  const palette=['#e3655b','#6b77cb','#e8b446','#38a487','#bb65ac','#4b9dcc'];
  return <ScrollView style={{flex:1,backgroundColor:'#f4f5e9'}} contentContainerStyle={{paddingTop:18,paddingBottom:30}}>
    <Pressable onPress={onClose}><Text>← Back to real Garden</Text></Pressable>
    <Text style={{fontSize:20,fontWeight:'700'}}>Production Growth V1.1 — isolated QA</Text>
    <View style={{flexDirection:'row',gap:16,paddingVertical:12}}>{[1,5,10,20,30].map(n=><Pressable key={n} onPress={()=>setCount(n)}>
      <Text style={{fontWeight:count===n?'800':'400'}}>{n} records</Text></Pressable>)}</View>
    <Text>{count} parent-shaped test records · {scene.growth.stage.name} · {scene.growth.pieces.length} visual pieces · emotion effects OFF</Text>
    <Text>Temporary fixtures only. They are never saved and do not test packing capacity. The larger production collision footprints may prevent 30 real placements on a small land.</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:16,paddingVertical:12}}>
      <Pressable onPress={()=>setShowReference(false)}><Text style={{fontWeight:!showReference?'800':'400'}}>Production — {count}</Text></Pressable>
      <Pressable onPress={()=>setShowReference(true)}><Text style={{fontWeight:showReference?'800':'400'}}>Approved June — 30</Text></Pressable>
      {([['Child Origins',origins,setOrigins],['Parent Ownership',ownership,setOwnership],['Low/Mid/Tall',heights,setHeights],
        ['Spatial Coverage Grid',grid,setGrid]] as const).map(([label,value,set])=><Pressable key={label} onPress={()=>set(v=>!v)}><Text>{label} {value?'ON':'OFF'}</Text></Pressable>)}
    </View>
    <Pressable onPress={()=>setShowMask(v=>!v)}><Text>Final Mask {showMask?'ON':'OFF'}</Text></Pressable>
    <Canvas style={{width:canvasWidth,height}}><Group transform={[
      {translateX:25-region.x*scale},{translateY:25-region.y*scale},{scale}]}>
      <SandboxGardenBackdrop month={6} showMask={showMask}><ProductionGrowthLayer growth={display} month={showReference ? undefined : scene.month}/>
        {grid&&display.mask.points.map(p=><Rect key={`${p.x}:${p.y}`} x={p.x-2} y={p.y-2} width={4} height={4}
          color={covered.has(`${p.x}:${p.y}`)?palette[sectors.indexOf(sectorFor(p))]:'#88948b'}
          opacity={covered.has(`${p.x}:${p.y}`) ? .45 : .15}/>)}
        {ownership&&display.records.map((p,i)=><Path key={p.id} color={palette[i%palette.length]} strokeWidth={.45} style="stroke" opacity={.6}
          path={display.pieces.filter(c=>c.parentId===p.id).map(c=>`M${p.worldX} ${p.worldY}L${c.worldX} ${c.worldY}`).join('')}/>)}
        {(origins||heights)&&display.pieces.map(p=><Circle key={p.id} cx={p.worldX} cy={p.worldY} r={1.3}
          color={heights?HEIGHT_COLORS[growthHeight(p)]:'#e74b31'}/>)}
      </SandboxGardenBackdrop>
    </Group></Canvas>
    <Text style={{fontWeight:'700'}}>Measured final pixels: Approved June 30 | Production {count}</Text>
    <Text>Botanical alpha coverage: {pct(referenceMetrics.botanicalCoverage)} | {pct(metrics.botanicalCoverage)}</Text>
    <Text>Visible alpha area: {referenceMetrics.visibleAlphaArea.toFixed(0)} | {metrics.visibleAlphaArea.toFixed(0)} world px²</Text>
    <Text>Occupied sectors (≥25% coverage): {referenceMetrics.occupiedSectors}/6 | {metrics.occupiedSectors}/6</Text>
    <Text>Child origins outside generation region: {referenceMetrics.outsideOrigins} | {metrics.outsideOrigins}</Text>
    <Text>Parent distances p50 / p90 / max: {Object.values(referenceMetrics.distance).map(v=>v.toFixed(1)).join(' / ')} | {Object.values(metrics.distance).map(v=>v.toFixed(1)).join(' / ')}</Text>
    <Text>Height colors: LOW yellow · MID pink · TALL purple. Mass uses visible composited alpha, not piece counts.</Text>
    {grid&&<Text>Coverage grid: sector colors mark covered samples; pale gray marks remaining grass.</Text>}
    {Object.keys(HEIGHT_COLORS).map(h=><Text key={h}>{h}: {pct(referenceMetrics.heightShare[h])} | {pct(metrics.heightShare[h])}</Text>)}
    {sectors.map(s=><Text key={s}>{s}: {pct(referenceMetrics.sectors[s].coverage)} | {pct(metrics.sectors[s].coverage)}</Text>)}
    {Object.keys(referenceMetrics.speciesShare).sort().map(s=><Text key={s}>{s}: {pct(referenceMetrics.speciesShare[s])} | {pct(metrics.speciesShare[s]??0)}</Text>)}
    <Text>Coverage uses the existing alpha atlas over approved grass. Reference pixels are unchanged; the origin constraint applies only to production. Rendered pixels may cross borders. Production 30 passed manual visual QA: PRODUCTION_GROWTH_V1_1_VISUAL_APPROVED.</Text>
  </ScrollView>;
}
