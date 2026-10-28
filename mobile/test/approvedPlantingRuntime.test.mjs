import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlantingModules } from './loadPlantingModules.mjs';

export async function runApprovedRuntimeTests(assert) {
  console.log('\n--- APPROVED MASK RUNTIME: exact checkpoint, all 12 months, full footprints ---');
  const items = new Map();
  let writes = 0;
  const storage = { getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => { writes++; items.set(k, v); }, removeItem: (k) => items.delete(k) };
  const load = loadPlantingModules(storage);
  const approved = load('approvedPlantingMasks');
  const mask = load('plantingMaskRefinement');
  const geometry = load('plantingRegionGeometry');
  const data = load('plantingRegionData');
  const validator = load('placementValidator');
  const checkpointPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../../output/planting-mask-checkpoints/20260928-approved/browser-planting-storage.json');
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')).origins['http://localhost:8081'];
  const worldFromLocal = (m, p, translated = true) => {
    const cal = approved.APPROVED_MASK_CALIBRATION[m];
    const offset = mask.getMaskRefinementOffset(approved.APPROVED_MASK_REFINEMENTS[m]);
    return geometry.landLocalToWorld(p.x + (translated ? offset.offsetX : 0),
      p.y + (translated ? offset.offsetY : 0), geometry.getParentLand(cal.parentLandAsset));
  };
  const validPoints = {};
  for (let m = 1; m <= 12; m++) {
    const record = approved.APPROVED_MASK_REFINEMENTS[m];
    assert(JSON.stringify(record) === JSON.stringify(checkpoint[`petalpal_planting_mask_refinement_v1_month_${m}`].parsed),
      `Month ${m}: authoritative strokes/offsets exactly match the saved checkpoint`);
    assert(data.MONTH_REGION_METAS[m].landId === `Land${String(m).padStart(2, '0')}` &&
      approved.APPROVED_MASK_CALIBRATION[m].landId === data.MONTH_REGION_METAS[m].landId,
      `Month ${m}: month-to-land mapping is preserved`);
    assert(Object.isFrozen(record) && Object.isFrozen(record.strokes) && Object.isFrozen(record.strokes[0]?.points),
      `Month ${m}: runtime operation history is immutable`);
    const meta = data.MONTH_REGION_METAS[m], cal = approved.APPROVED_MASK_CALIBRATION[m];
    let point;
    const centroid = approved.getApprovedMonthCentroid(m);
    if (approved.isFootprintInApprovedMonthMaskWorld(m, centroid.x, centroid.y, 22)) point = centroid;
    for (let v = 22; !point && v < meta.bbox.height - 22; v += 10) {
      for (let u = 22; !point && u < meta.bbox.width - 22; u += 10) {
        const p = worldFromLocal(m, geometry.maskLocalToLandLocal(u, v, cal, meta));
        if (approved.isFootprintInApprovedMonthMaskWorld(m, p.x, p.y, 22)) point = p;
      }
    }
    assert(Boolean(point), `Month ${m}: approved Final Mask contains a complete standard planting footprint`);
    if (point) {
      validPoints[m] = point;
      assert(validator.validateFlowerPlacement({ flowerId: `month-${m}`, month: m,
        worldX: point.x, worldY: point.y, speciesCode: 'CHAMOMILE', existingPlacements: [] }).isValid,
        `Month ${m}: production validator accepts the approved footprint`);
    }
  }
  assert(JSON.stringify(approved.APPROVED_MASK_CALIBRATION) === JSON.stringify(geometry.PLANTING_REGION_CALIBRATION),
    'Approved calibration is exactly the unchanged locked source calibration');
  let addExample, eraseExample, oldLocationExample;
  for (let m = 1; m <= 12; m++) {
    const cal = approved.APPROVED_MASK_CALIBRATION[m], meta = data.MONTH_REGION_METAS[m];
    const r = approved.APPROVED_MASK_REFINEMENTS[m];
    for (const s of r.strokes) for (const p of s.points) {
      for (const [dx, dy] of [[0,0], [s.radius * 0.5,0], [-s.radius * 0.5,0], [0,s.radius * 0.5], [0,-s.radius * 0.5]]) {
        const local = { x: p.x + dx, y: p.y + dy };
        const w = worldFromLocal(m, local);
        const base = mask.isPointInBaseMask(m, local.x, local.y, cal, meta);
        const final = approved.isPointInApprovedMonthMaskWorld(m, w.x, w.y);
        if (!base && final && !addExample && approved.isFootprintInApprovedMonthMaskWorld(m, w.x, w.y, 9)) addExample = { m, w };
        if (base && !final && !eraseExample) eraseExample = { m, w };
      }
    }
    for (let v = 10; !oldLocationExample && v < meta.bbox.height; v += 10) {
      for (let u = 10; !oldLocationExample && u < meta.bbox.width; u += 10) {
        const p = geometry.maskLocalToLandLocal(u, v, cal, meta);
        const translated = worldFromLocal(m, p), original = worldFromLocal(m, p, false);
        if (approved.isFootprintInApprovedMonthMaskWorld(m, translated.x, translated.y, 22) &&
            !approved.isPointInApprovedMonthMaskWorld(m, original.x, original.y)) oldLocationExample = { m, translated, original };
      }
    }
  }
  const pointDef = { footprintRadius: 0, hitboxRadius: 1, visualWidth: 1, visualHeight: 1 };
  assert(Boolean(addExample) && validator.validateFlowerPlacement({ flowerId: 'add', month: addExample.m,
    worldX: addExample.w.x, worldY: addExample.w.y, speciesCode: 'CHAMOMILE', existingPlacements: [], definition: pointDef }).isValid,
    'Production validation includes an actual saved Add area outside the baseline');
  assert(Boolean(eraseExample) && !validator.validateFlowerPlacement({ flowerId: 'erase', month: eraseExample.m,
    worldX: eraseExample.w.x, worldY: eraseExample.w.y, speciesCode: 'CHAMOMILE', existingPlacements: [], definition: pointDef }).isValid,
    'Production validation rejects an actual saved erasure inside the old baseline');
  assert(Boolean(oldLocationExample) && !validator.validateFlowerPlacement({ flowerId: 'old', month: oldLocationExample.m,
    worldX: oldLocationExample.original.x, worldY: oldLocationExample.original.y, speciesCode: 'CHAMOMILE', existingPlacements: [] }).isValid,
    'A translated approved footprint accepts its new location and rejects the old one where appropriate');
  const cross = Object.entries(validPoints).some(([m, p]) => Number(m) !== 1 &&
    !validator.validateFlowerPlacement({ flowerId: 'jan', month: 1, worldX: p.x, worldY: p.y, speciesCode: 'CHAMOMILE', existingPlacements: [] }).isValid);
  assert(cross, 'January flowers cannot be planted in a different month Final Mask');
  const p = validPoints[1];
  const occupied = { id: 'existing', flowerId: 'old', month: 1, worldX: p.x, worldY: p.y, flowerName: 'Chamomile' };
  assert(validator.validateFlowerPlacement({ flowerId: 'new', month: 1, worldX: p.x, worldY: p.y,
    speciesCode: 'CHAMOMILE', existingPlacements: [occupied] }).reason === 'COLLIDES_WITH_FLOWER', 'Planting footprints cannot overlap');
  const beforeLocked = JSON.stringify(approved.APPROVED_MASK_REFINEMENTS);
  mask.saveMonthMaskRefinement(1, [], 'central', 'central', { offsetX: 999, offsetY: 999 });
  assert(approved.isFootprintInApprovedMonthMaskWorld(1, p.x, p.y, 22) &&
    JSON.stringify(approved.APPROVED_MASK_REFINEMENTS) === beforeLocked, 'DEV storage edits cannot change the locked production masks');

  const cal = approved.APPROVED_MASK_CALIBRATION[1], meta = data.MONTH_REGION_METAS[1];
  const center = { x: 700, y: 500 }, zero = { offsetX: 0, offsetY: 0 };
  const solid = mask.createMaskStroke('add', 60, [center]);
  const tinyHole = mask.createMaskStroke('remove', 0.1, [{ x: center.x + 7, y: center.y + 3 }]);
  assert(mask.isCircleInRefinedMaskLandLocal(1, center.x, center.y, 22, [solid], cal, meta, zero),
    'Whole-footprint check accepts an entirely covered disk');
  assert(!mask.isCircleInRefinedMaskLandLocal(1, center.x, center.y, 22, [solid, tinyHole], cal, meta, zero),
    'Whole-footprint check rejects a tiny interior hole between all old sampling rings');
  assert(!mask.isCircleInRefinedMaskLandLocal(1, center.x, center.y, 22,
    [mask.createMaskStroke('add', 21, [center])], cal, meta, zero), 'A plantable center alone does not permit an overflowing footprint');
  assert(mask.isCircleInRefinedMaskLandLocal(1, center.x, center.y, 22,
    [solid, tinyHole, mask.createMaskStroke('add', 2, tinyHole.points)], cal, meta, zero),
    'Full-footprint containment retains chronological Add/Remove/Add precedence');

  console.log('\n--- PLACEMENT FLOW: preview, confirmation, Adjust Cancel, restart ---');
  items.clear(); writes = 0;
  const states = [], effects = [];
  let hook = 0;
  const react = { createContext: () => ({ Provider: 'Provider' }),
    useState: (initial) => {
      const i = hook++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }];
    }, useRef: (initial) => ({ current: initial }), useCallback: (fn) => fn,
    useEffect: (fn) => { if (effects.length === 0) effects.push(fn); }, useContext: () => null };
  const flowLoad = loadPlantingModules(storage, react);
  const context = flowLoad('PlantingContext');
  function render() {
    hook = 0;
    const root = context.PlantingProvider({ children: null });
    return root.type(root.props).props.value;
  }
  let flow = render();
  effects[0](); await new Promise((resolve) => setImmediate(resolve)); flow = render();
  assert(flow.placements.length === 0 && writes === 0, 'Startup does not generate or save unconfirmed flower coordinates');
  flow.startPlanting({ flowerId: 'confirmed-test', journalEntryId: 'journal-test', plantedDate: '2026-09-28T12:00:00Z',
    month: 1, flowerName: 'Chamomile', scale: 0.9, rotation: 12 });
  flow = render(); flow.updatePreview(p.x, p.y); flow = render();
  assert(flow.validationResult.isValid && writes === 0, 'Valid preview enables confirmation without saving coordinates');
  assert(await flow.confirmPlacement(), 'Plant Here confirms and persists a validated placement');
  flow = render();
  const original = { ...flow.placements[0] };
  assert(original.flowerId === 'confirmed-test' && original.journalEntryId === 'journal-test' && original.month === 1 &&
    original.landId === 'Land01' && original.plantedDate === '2026-09-28T12:00:00Z' && original.scale === 0.9 && original.rotation === 12,
    'Confirmation persists all required identifiers, month/land, date, scale and rotation');
  const restarted = await loadPlantingModules(storage)('plantingPersistence').loadFlowerPlacements();
  assert(JSON.stringify(restarted[0]) === JSON.stringify(original), 'Fresh module/page restart restores exact placement coordinates and metadata');
  // A planted flower never moves: there is no Adjust, and a moved spot is refused before any write.
  assert(flow.startAdjusting === undefined && flow.activeMode === 'normal', 'There is no Adjust Position mode');
  const savedBefore = items.get('petalpal_flower_placements_v1');
  await loadPlantingModules(storage)('plantingPersistence').addOrUpdateFlowerPlacement({ ...original, worldX: original.worldX + 1 })
    .then(() => assert(false, 'A moved spot must be refused'), (error) => assert(/can’t change/.test(error.message), 'A moved spot is refused'));
  assert(items.get('petalpal_flower_placements_v1') === savedBefore, 'A refused move writes nothing');
  const nativeItems = new Map();
  const nativeStorage = { getItem: async (k) => nativeItems.get(k) ?? null,
    setItem: async (k, v) => nativeItems.set(k, v) };
  await loadPlantingModules(undefined, undefined, nativeStorage, false)('plantingPersistence').addOrUpdateFlowerPlacement(original);
  const nativeRestart = await loadPlantingModules(undefined, undefined, nativeStorage, false)('plantingPersistence').loadFlowerPlacements();
  assert(JSON.stringify(nativeRestart[0]) === JSON.stringify(original), 'Native AsyncStorage path restores exact records after a fresh module restart');
}
