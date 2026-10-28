import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const ts = createRequire(import.meta.url)('typescript');
const jsx = (type, props) => ({ type, props });
const clean = value => JSON.parse(JSON.stringify(value));
const placement = { x: 10, y: 20, scale: 0.5, rotation: 3 };
function load(file, overrides = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(new URL(`../src/components/garden/${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, __DEV__: true, require: name => {
    if (overrides[name]) return overrides[name];
    if (name.endsWith('/performance/runtimeAudit')) return {runtimeAudit:{render(){}}};
    if (name.endsWith('/performance/GardenRuntimePanel')) return {GardenProfile:'PerformanceBoundary'};
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { memo: fn => fn, useMemo: fn => fn() };
    if (name === '@shopify/react-native-skia') return new Proxy({}, { get: (_, key) => key === 'useImage' ? () => 'image' : key });
    if (name.endsWith('.png')) return name;
    return new Proxy({ __esModule: true, default: name }, { get: (object, key) => {
      if (key in object) return object[key];
      if (key === 'STATIC_LANDMARK_MAP_PLACEMENTS') return { gardenArch: placement, pavilion: placement };
      if (key === 'WATER_ASSETS') return { calmBase: 'water' };
      if (key === 'useWaterTopFlow') return () => ({});
      if (String(key).startsWith('INITIAL_')) return placement;
      return 1;
    } });
  } });
  return module.exports;
}
const rule = load('flowerOcclusion.ts');
const preview = { type: 'Flowers', props: { ids: ['one', 'two'] } };
const backdrop = load('flower-density-sandbox/SandboxGardenBackdrop.tsx', { '../flowerOcclusion': rule }).default;
const landmark = load('LandmarkLayer.tsx').default;
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
for (let month = 1; month <= 12; month++) {
  const tree = backdrop({ month, showMask: false, children: preview });
  const layer = nodes(tree).find(node => node.type === '../LandmarkLayer');
  assert.equal(layer.props.behindTeaSet === preview, month === 6);
  assert.equal(nodes(tree).includes(preview), month !== 6, 'Preview has exactly one draw destination');
  assert.equal(rule.flowerInDepthPass(month, 'behind-tea-set'), month === 6);
  assert.equal(rule.flowerInDepthPass(month, 'foreground'), month !== 6);
  assert.equal(rule.flowerInDepthPass(month, 'all'), true);
}
// Real landmark render tree: flowers are siblings immediately before the Tea Set,
// outside its rotation/placement transform; artwork is rendered exactly once.
const tree = landmark({ waterfallVersion: 'v2', behindTeaSet: preview, teaSetPlacement: placement });
const children = tree.props.children;
const index = children.indexOf(preview);
assert.ok(index >= 0);
const teaBoundary = children[index + 1];
assert.equal(teaBoundary.props.enabled,true);
const teaGroup = teaBoundary.props.children;
assert.equal(teaGroup.props.children.type, './TeaSetEntity');
const {fairy,...teaTransform}=teaGroup.props.children.props;
assert.deepEqual(clean(teaTransform), { x: 10, y: 20, scale: 0.5 });
assert.equal(fairy.type,'./fairy/TeaFairy','MAIN tea fairy remains attached');
assert.equal(nodes(tree).filter(node => node.type === './TeaSetEntity').length, 1);
const previousTree = landmark({ waterfallVersion: 'v2', teaSetPlacement: placement });
assert.deepEqual(clean(teaGroup), clean(previousTree.props.children[index + 1].props.children), 'Tea artwork and transform unchanged');

// The same unchanged slot receives all Chamomile and mixed-species preview objects.
const speciesReview=loadPlantingModules()('../flower-density-sandbox/speciesReviewModel');
for(const species of ['CHAMOMILE','MIXED','MIXED_SML','HYDRANGEA']) {
  const flowers=speciesReview.composeSpeciesReview(speciesReview.generateSpeciesReviewLayout(6,30,species).flowers,6);
  const before=JSON.stringify(flowers), content={type:'ComposedFlowers',props:{flowers}};
  const b=backdrop({month:6,showMask:false,children:content});
  const slot=nodes(b).find(n=>n.type==='../LandmarkLayer').props.behindTeaSet;
  assert.equal(slot,content); assert.equal(slot.props.flowers.length,flowers.length);
  assert.ok(flowers.length>0);
  const scene=landmark({waterfallVersion:'v2',behindTeaSet:slot});
  const order=scene.props.children, i=order.indexOf(content);
  assert.equal(order[i+1].props.children.props.children.type,'./TeaSetEntity');
  assert.equal(JSON.stringify(flowers),before,'Occlusion does not transform or mutate Chamomile anchors');
}

// Production committed flowers and active placement preview use the same pass.
const allSpecies=loadPlantingModules()('../flower-density-sandbox/allSpeciesReviewModel');
const batchFlowers=allSpecies.composeAllSpecies(allSpecies.generateAllSpeciesLayout(6,30).flowers,6);
const batchContent={type:'ComposedFlowers',props:{flowers:batchFlowers}}, batchBefore=JSON.stringify(batchFlowers);
const batchBackdrop=backdrop({month:6,showMask:false,children:batchContent});
const batchSlot=nodes(batchBackdrop).find(n=>n.type==='../LandmarkLayer').props.behindTeaSet;
assert.equal(batchSlot,batchContent);assert.equal(batchSlot.props.flowers.length,30);
const batchScene=landmark({waterfallVersion:'v2',behindTeaSet:batchSlot}).props.children;
assert.equal(batchScene[batchScene.indexOf(batchContent)+1].props.children.props.children.type,'./TeaSetEntity');
assert.equal(JSON.stringify(batchFlowers),batchBefore);
const mixedV2=loadPlantingModules()('../flower-density-sandbox/mixedV2ReviewModel').generateMixedV2Review(6,30);
const richerContent={type:'MixedV2',props:{flowers:mixedV2.flowers}};
const richerBackdrop=backdrop({month:6,showMask:false,children:richerContent});
const richerSlot=nodes(richerBackdrop).find(n=>n.type==='../LandmarkLayer').props.behindTeaSet;
assert.equal(richerSlot,richerContent);
const richerOrder=landmark({waterfallVersion:'v2',behindTeaSet:richerSlot}).props.children;
assert.equal(richerOrder[richerOrder.indexOf(richerContent)+1].props.children.props.children.type,'./TeaSetEntity');
const growthModel=loadPlantingModules()('../flower-density-sandbox/monthly-growth/monthlyGrowthModel');
const monthly=growthModel.buildMonthlyGrowth(growthModel.monthlyGrowthRecords(6,30),6);
const growthContent={type:'MonthlyGrowth',props:{primary:monthly.primary,companions:monthly.companions,filler:monthly.filler}};
const growthBackdrop=backdrop({month:6,showMask:false,children:growthContent});
const growthSlot=nodes(growthBackdrop).find(n=>n.type==='../LandmarkLayer').props.behindTeaSet;
assert.equal(growthSlot,growthContent);
const growthOrder=landmark({waterfallVersion:'v2',behindTeaSet:growthSlot}).props.children;
assert.equal(growthOrder[growthOrder.indexOf(growthContent)+1].props.children.props.children.type,'./TeaSetEntity');
const layered=loadPlantingModules()('../flower-density-sandbox/monthly-growth/layeredBedModel').buildLayeredBed(monthly,6);
const layeredContent={type:'LayeredBed',props:{growth:layered}};
const layeredSlot=nodes(backdrop({month:6,showMask:false,children:layeredContent})).find(n=>n.type==='../LandmarkLayer').props.behindTeaSet;
assert.equal(layeredSlot,layeredContent);
const layeredOrder=landmark({waterfallVersion:'v2',behindTeaSet:layeredSlot}).props.children;
assert.equal(layeredOrder[layeredOrder.indexOf(layeredContent)+1].props.children.props.children.type,'./TeaSetEntity','All V1.1 layers remain behind Tea Set');

const records = [6, 10, 6].map((month, i) => ({ id: String(i), month, worldX: 50 + i, worldY: 100 - i, flowerName: 'Tulip' }));
const state = { placements: records, activeMode: 'normal' };
const render = load('planting/PlantedFlowerLayer.tsx', {
  '../flower-visuals/BotanicalFlowerImage': { BotanicalFlowerImage: props => jsx('BotanicalFlowerImage', props) },
  '../flower-visuals/botanicalPresentationPose': loadPlantingModules()('../flower-visuals/botanicalPresentationPose'),
  '../flowerOcclusion': rule,
  './PlantingContext': { usePlanting: () => state },
  './flowerFootprintConfig': { getFlowerPlacementDefinition: () => ({ visualWidth: 40, visualHeight: 60, footprintRadius: 12 }) },
}).LegacyPlantedFlowerLayer;
function renderedNodes(node) {
  if (Array.isArray(node)) return node.flatMap(renderedNodes);
  if (!node || typeof node !== 'object') return [];
  if (typeof node.type === 'function') return renderedNodes(node.type(node.props));
  return [node, ...renderedNodes(node.props?.children)];
}
const images = pass => renderedNodes(render({ depthPass: pass })).filter(node => node.type === 'BotanicalFlowerImage').map(node => clean(node.props));
const saved = JSON.stringify(records);
const all = images('all'), behind = images('behind-tea-set'), front = images('foreground');
assert.equal(behind.length, 2); assert.equal(front.length, 1);
assert.deepEqual(behind, [all[0], all[2]], 'Land06 keeps its sorted anchors, dimensions and art');
assert.deepEqual(front, [all[1]]);
for (const month of [6, 10]) {
  state.activeMode = 'planting'; state.targetFlower = { id: 'pending-flower', month, flowerName: 'Tulip' };
  state.previewCoords = { worldX: 25, worldY: 35 };
  assert.equal(images('behind-tea-set').length, 2 + Number(month === 6));
  assert.equal(images('foreground').length, 1 + Number(month !== 6));
}
state.activeMode = 'normal'; state.targetFlower = null; state.previewCoords = null;
assert.equal(images('behind-tea-set').length, 2, 'Cancelled planting leaves Land06 as it was');
assert.equal(images('foreground').length, 1);
assert.equal(JSON.stringify(records), saved);
console.log('Land06 occlusion: DEV and production ownership passes, Tea Set draw order/transform, single rendering, active preview, and unchanged flower geometry passed.');
