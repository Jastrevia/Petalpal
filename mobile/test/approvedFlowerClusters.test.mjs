import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadPlantingModules } from './loadPlantingModules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const load = loadPlantingModules({ getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 });
const clusters = load('approvedFlowerClusters');
const { APPROVED_CLUSTER_ART } = load('approvedFlowerClusterAssets');
const validator = load('placementValidator');
const masks = load('approvedPlantingMasks');
const { MONTH_REGION_METAS } = load('plantingRegionData');
const plain = value => JSON.parse(JSON.stringify(value));

// Minimal decoder for the 8-bit RGBA, non-interlaced PNGs the extraction script writes.
function decodePng(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.subarray(1, 4).toString(), 'PNG', `${file} is a PNG`);
  let offset = 8, width = 0, height = 0; const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset), type = data.subarray(offset + 4, offset + 8).toString();
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      assert.deepEqual([body[8], body[9], body[12]], [8, 6, 0], `${file} is 8-bit RGBA, non-interlaced`);
    } else if (type === 'IDAT') idat.push(body);
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * 4, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0, b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y ? out[(y - 1) * stride + x - 4] : 0, p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[y * stride + x] = (row[x] + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
  }
  return { width, height, alpha: (x, y) => out[(y * width + x) * 4 + 3], rgba: out };
}

const SHEETS = fs.readdirSync(path.resolve(mobile, '../Resources/flower-updated')).filter(f => f.endsWith('.png'));
const code = sheet => sheet.replace(/\.png$/, '').trim().toUpperCase().replace(/[\s-]+/g, '_');

test('all 26 approved species have Small, Medium and Large cluster assets with matching filenames', () => {
  assert.equal(SHEETS.length, 26);
  assert.deepEqual(Object.keys(APPROVED_CLUSTER_ART).sort(), SHEETS.map(code).sort());
  for (const [species, sizes] of Object.entries(APPROVED_CLUSTER_ART)) {
    assert.deepEqual(Object.keys(sizes), ['SMALL', 'MEDIUM', 'LARGE']);
    for (const [size, art] of Object.entries(sizes)) {
      const file = `${species.toLowerCase()}_${size.toLowerCase()}.png`;
      assert.equal(art.source, `../../../../assets/garden/flowers/clusters/${file}`, `${species} ${size} resolves its own file`);
      assert.ok(fs.existsSync(path.join(mobile, 'assets/garden/flowers/clusters', file)), `${file} exists`);
      assert.equal(art.hitRows.length, Math.ceil(art.height / art.hitCell));
      assert.equal(art.hitCols, Math.ceil(art.width / art.hitCell));
    }
  }
  assert.equal(fs.readdirSync(path.join(mobile, 'assets/garden/flowers/clusters')).filter(f => f.endsWith('.png')).length, 78);
});

test('cluster PNGs are truly transparent, unclipped and without black backgrounds', () => {
  for (const [species, sizes] of Object.entries(APPROVED_CLUSTER_ART)) for (const [size, art] of Object.entries(sizes)) {
    const name = `${species} ${size}`;
    const png = decodePng(path.join(mobile, 'assets/garden/flowers/clusters', `${species.toLowerCase()}_${size.toLowerCase()}.png`));
    assert.deepEqual([png.width, png.height], [art.width, art.height], `${name} metadata matches the image`);
    let transparent = 0, opaqueBlack = 0, solidOnEdge = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4, a = png.rgba[i + 3];
      if (a === 0) transparent++;
      if (a === 255 && png.rgba[i] < 12 && png.rgba[i + 1] < 12 && png.rgba[i + 2] < 12) opaqueBlack++;
      if (a >= 128 && (x === 0 || y === 0 || x === png.width - 1 || y === png.height - 1)) solidOnEdge++;
    }
    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]])
      assert.ok(png.alpha(x, y) < 8, `${name} corner (${x},${y}) is transparent`);
    assert.ok(transparent / (png.width * png.height) > 0.15, `${name} has a real transparent background`);
    assert.ok(opaqueBlack / (png.width * png.height) < 0.002, `${name} has no black background`);
    assert.equal(solidOnEdge, 0, `${name} solid artwork is not clipped by its crop`);
    assert.ok(art.anchorY <= art.height && art.anchorX > 0 && art.anchorX < art.width, `${name} anchor lies on the art`);
  }
});

test('Small, Medium and Large are distinguishable for every species', () => {
  const area = art => (art.solid[2] - art.solid[0]) * (art.solid[3] - art.solid[1]);
  for (const [species, s] of Object.entries(APPROVED_CLUSTER_ART)) {
    assert.ok(area(s.SMALL) < area(s.MEDIUM) && area(s.SMALL) < area(s.LARGE), `${species} Small is the smallest`);
    // The approved sheet order is authoritative; Hydrangea's Large is drawn slightly smaller than its Medium.
    if (species !== 'HYDRANGEA') assert.ok(area(s.MEDIUM) < area(s.LARGE), `${species} Medium < Large`);
    assert.notEqual(s.MEDIUM.source, s.LARGE.source);
  }
});

test('logical Land IDs decide the cluster size', () => {
  const expected = { SMALL: ['Land01', 'Land02', 'Land03', 'Land05', 'Land06'],
    MEDIUM: ['Land04', 'Land07', 'Land08', 'Land09'], LARGE: ['Land10', 'Land11', 'Land12'] };
  for (const [size, lands] of Object.entries(expected)) for (const land of lands) assert.equal(clusters.clusterSizeForLand(land), size, land);
  assert.equal(Object.keys(clusters.LAND_CLUSTER_SIZE).length, 12);
  for (let month = 1; month <= 12; month++) assert.equal(clusters.landIdForMonth(month), MONTH_REGION_METAS[month].landId);
  // Combined map asset names are not Land IDs.
  for (const notALand of ['Land02_03', 'LandCombined', 'map_land_01', '', undefined]) assert.equal(clusters.clusterSizeForLand(notALand), null);
  const pose = { worldX: 1000, worldY: 700, speciesCode: 'SUNFLOWER' };
  assert.equal(clusters.clusterGeometry({ ...pose, landId: 'Land02' }).size, 'SMALL');
  assert.equal(clusters.clusterGeometry({ ...pose, landId: 'Land08' }).size, 'MEDIUM');
  assert.equal(clusters.clusterGeometry({ ...pose, landId: 'Land11' }).size, 'LARGE');
  assert.equal(clusters.clusterGeometry({ ...pose, month: 11 }).size, 'LARGE', 'month falls back to its own Land');
  assert.equal(clusters.clusterGeometry({ ...pose, speciesCode: 'PINK_LILY', landId: 'Land02' }), null, 'unknown species keep legacy art');
});

test('preview and planted flowers share image, anchor, scale, rotation and footprint', () => {
  const target = { id: 'f', flowerId: 'f', month: 8, landId: 'Land08', speciesCode: 'POPPY', scale: 1, rotation: 0, worldX: 0, worldY: 0 };
  const preview = { worldX: 1990, worldY: 1370 };
  const previewGeometry = clusters.clusterGeometry({ ...target, ...preview, landId: 'Land08' });
  const committed = { ...target, ...preview, landId: MONTH_REGION_METAS[8].landId };
  assert.deepEqual(plain(clusters.clusterGeometry(committed)), plain(previewGeometry));
  assert.equal(previewGeometry.drawX + previewGeometry.art.anchorX * previewGeometry.k, preview.worldX, 'anchor is the planted point');
  assert.equal(previewGeometry.drawY + previewGeometry.art.anchorY * previewGeometry.k, preview.worldY);
});

const validAt = (month, species, existing = []) => {
  const c = masks.getApprovedMonthCentroid(month);
  return validator.validateFlowerPlacement({ flowerId: 'new', month, worldX: c.x, worldY: c.y, existingPlacements: existing, speciesCode: species });
};
test('Small in Land02, Medium in Land08 and Large in Land11 are plantable as whole clusters', () => {
  for (const [month, species] of [[2, 'DAISY'], [8, 'POPPY'], [11, 'HYDRANGEA']]) {
    const result = validAt(month, species);
    assert.equal(result.isValid, true, `${species} at the Land${String(month).padStart(2, '0')} centroid: ${result.userFeedback}`);
  }
  // Every species can start planting in every Land: the nearest valid spot to the centroid.
  for (const species of Object.keys(APPROVED_CLUSTER_ART)) for (let month = 1; month <= 12; month++) {
    const c = masks.getApprovedMonthCentroid(month);
    const spot = validator.findNearestValidPlacement({ flowerId: 'new', month, existingPlacements: [], speciesCode: species }, c);
    assert.ok(spot, `${species} fits somewhere near the Land${String(month).padStart(2, '0')} centroid`);
    assert.ok(Math.hypot(spot.worldX - c.x, spot.worldY - c.y) <= 120, `${species} month ${month} starts near the centroid`);
  }
});

test('the complete cluster footprint must fit the Land; near a boundary Plant Here is disabled', () => {
  for (const [month, species] of [[2, 'DAISY'], [8, 'POPPY'], [11, 'SUNFLOWER']]) {
    const c = masks.getApprovedMonthCentroid(month);
    let edge = null;
    // Walk outwards until the centre is still on the Land but the footprint is not.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let step = 0; step < 400 && !edge; step += 2) {
        const x = c.x + dx * step, y = c.y + dy * step;
        if (!masks.isPointInApprovedMonthMaskWorld(month, x, y)) break;
        const r = validator.validateFlowerPlacement({ flowerId: 'n', month, worldX: x, worldY: y, existingPlacements: [], speciesCode: species });
        if (!r.isValid) edge = r;
      }
      if (edge) break;
    }
    assert.ok(edge, `month ${month}: a boundary position exists`);
    assert.equal(edge.reason, 'FOOTPRINT_OUTSIDE_REGION');
    assert.equal(edge.userFeedback, 'Choose a spot where the whole cluster fits.');
  }
  const wrongLand = validator.validateFlowerPlacement({ flowerId: 'n', month: 2, ...(c => ({ worldX: c.x, worldY: c.y }))(masks.getApprovedMonthCentroid(8)),
    existingPlacements: [], speciesCode: 'DAISY' });
  assert.equal(wrongLand.reason, 'WRONG_MONTH_REGION', 'a February flower is still not plantable in Land08');
});

test('occupied cluster footprints block overlapping planting but allow neighbours', () => {
  const c = masks.getApprovedMonthCentroid(8);
  const planted = { id: 'a', flowerId: 'a', month: 8, landId: 'Land08', speciesCode: 'POPPY', worldX: c.x, worldY: c.y, scale: 1, rotation: 0 };
  const same = validator.validateFlowerPlacement({ flowerId: 'b', month: 8, worldX: c.x + 4, worldY: c.y, existingPlacements: [planted], speciesCode: 'TULIP' });
  assert.equal(same.reason, 'COLLIDES_WITH_FLOWER');
  const g = clusters.clusterGeometry(planted), gap = g.footprint.rx * 2 + 2;
  let neighbour = null;
  for (const dx of [gap, -gap]) {
    const r = validator.validateFlowerPlacement({ flowerId: 'b', month: 8, worldX: c.x + dx, worldY: c.y, existingPlacements: [planted], speciesCode: 'POPPY' });
    if (r.isValid) { neighbour = dx; break; }
  }
  assert.ok(neighbour !== null, 'a cluster can be planted right beside another');
  // Adjust ignores only the moving flower itself.
  assert.equal(validator.validateFlowerPlacement({ flowerId: 'a', month: 8, worldX: c.x + 4, worldY: c.y, existingPlacements: [planted],
    ignorePlacementId: 'a', speciesCode: 'POPPY' }).isValid, true);
});

test('taps hit visible flowers and leaves, never transparent margins, and nearby clusters stay separate', () => {
  const a = { id: 'a', worldX: 1000, worldY: 700, landId: 'Land08', speciesCode: 'SUNFLOWER' };
  const ga = clusters.clusterGeometry(a), art = ga.art;
  const world = (px, py) => [a.worldX + (px - art.anchorX) * ga.k, a.worldY + (py - art.anchorY) * ga.k];
  // Every solid cell is a target, including the outermost leaves.
  const grid = art.hitRows.map(hex => [...Array(art.hitCols)].map((_, col) => {
    const d = hex.length - 1 - (col >> 2); return d >= 0 && (parseInt(hex[d], 16) >> (col & 3)) & 1;
  }));
  let checked = 0;
  for (let row = 0; row < grid.length; row++) for (let col = 0; col < art.hitCols; col++) if (grid[row][col]) {
    assert.equal(clusters.hitsCluster(ga, a, ...world((col + .5) * art.hitCell, (row + .5) * art.hitCell), 0), true); checked++;
  }
  assert.ok(checked > 100);
  // Transparent PNG corners are not targets, even with touch tolerance.
  for (const [px, py] of [[2, 2], [art.width - 2, 2]]) assert.equal(clusters.hitsCluster(ga, a, ...world(px, py), 3), false);
  // Neighbouring clusters whose images overlap: each solid core opens its own record.
  const b = { id: 'b', worldX: a.worldX + ga.footprint.rx * 2 + 2, worldY: a.worldY + 6, landId: 'Land08', speciesCode: 'TULIP' };
  const gb = clusters.clusterGeometry(b);
  assert.ok(gb.drawX < ga.drawX + ga.drawWidth, 'the two cluster images overlap');
  const core = (g, p) => [p.worldX + ((g.art.solid[0] + g.art.solid[2]) / 2 - g.art.anchorX) * g.k, p.worldY - (g.art.anchorY - g.art.solid[1]) * g.k * .5];
  assert.equal(clusters.hitClusterFlower([a, b], ...core(ga, a), 2)?.id, 'a');
  assert.equal(clusters.hitClusterFlower([a, b], ...core(gb, b), 2)?.id, 'b');
  assert.equal(clusters.hitClusterFlower([b, a], ...core(ga, a), 2)?.id, 'a', 'order of records does not matter');
  // A point outside both silhouettes, inside both bounding boxes, opens nothing.
  const above = [a.worldX, Math.min(ga.drawY, gb.drawY) + 1];
  assert.equal(clusters.hitClusterFlower([a, b], ...above, 0), null);
  // Camera zoom changes only the tolerance in world units; hits are in world space.
  for (const zoom of [0.5, 1, 3]) assert.equal(clusters.hitClusterFlower([a, b], ...core(gb, b), 10 / zoom)?.id, 'b');
});

test('saved positions survive reload and sign-in; legacy coordinates are never used; no duplicates', async () => {
  const response = data => ({ ok: true, status: 200, json: async () => data });
  const flowers = [
    { id: 'planted', userId: 'alice', name: 'Poppy', speciesCode: 'POPPY', mood: 'FIRE_BLOOM', img: '', createdAt: '2026-08-12T18:00:00Z',
      supportCount: 0, sourceEventId: 'ev-1', left: 1990, top: 1370, regionId: 'Land08', scale: 1, rotation: 0, layoutVersion: 2 },
    { id: 'legacy', userId: 'alice', name: 'Daisy', speciesCode: 'DAISY', mood: 'happy', img: '', createdAt: '2026-08-02T18:00:00Z',
      supportCount: 0, dailyCheckInId: 'd-1', left: 312.5, top: 588.1, regionId: null, scale: 1, rotation: 0, layoutVersion: 1 },
    { id: 'legacy2', userId: 'alice', name: 'Tulip', speciesCode: 'TULIP', mood: 'happy', img: '', createdAt: '2026-08-03T18:00:00Z',
      supportCount: 0, left: 10, top: 600, layoutVersion: 1 },
  ];
  const harness = loadPlantingModules({ getItem: () => null, setItem() {} }, undefined, undefined, true, { fetch: async () => response({ owner: { id: 'alice' }, flowers }) });
  harness('../../../services/api').configureApi({ apiBaseUrl: '', getAccessToken: async () => 'fixture-token' });
  const loaded = await harness('../../../services/garden').loadGarden('alice', 'alice');
  assert.deepEqual(plain(loaded.find(f => f.id === 'planted').placement), { worldX: 1990, worldY: 1370, landId: 'Land08', scale: 1, rotation: 0 });
  assert.equal(loaded.find(f => f.id === 'legacy').placement, undefined, 'layoutVersion 1 coordinates are not positions');
  const hydration = harness('gardenHydration');
  // Sign-in erases the device cache, so the server position alone must restore the Garden.
  const records = hydration.hydrateGardenPlacements(loaded, [], 'alice', 'alice', 'UTC');
  assert.equal(records.length, 3); assert.equal(new Set(records.map(r => r.flowerId)).size, 3);
  const planted = records.find(r => r.flowerId === 'planted');
  assert.deepEqual([planted.worldX, planted.worldY, planted.landId, planted.placementOrigin], [1990, 1370, 'Land08', 'SERVER']);
  assert.equal(planted.sourceEventId, 'ev-1', 'Journal/Event link preserved');
  assert.equal(clusters.clusterGeometry(planted).size, 'MEDIUM');
  // A stale same-session cache never overrides the saved position.
  const stale = [{ ...planted, worldX: 1900, worldY: 1300, placementOrigin: 'LOCAL', ownerUserId: 'alice' }];
  assert.equal(hydration.hydrateGardenPlacements(loaded, stale, 'alice', 'alice', 'UTC').find(r => r.flowerId === 'planted').worldX, 1990);
  // Historical flowers get non-overlapping fallback spots that fit their Land.
  const fallback = records.filter(r => r.placementOrigin === 'FALLBACK');
  assert.equal(fallback.length, 2);
  const prints = records.map(validator.placementFootprint);
  for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++)
    assert.equal(clusters.footprintsOverlap(prints[i], prints[j]), false, `${records[i].flowerId} / ${records[j].flowerId} do not overlap`);
  // Visitors see the owner's saved layout.
  const visitor = hydration.hydrateGardenPlacements(loaded, [], 'alice', 'bob', 'UTC');
  assert.equal(visitor.find(r => r.flowerId === 'planted').worldX, 1990);
});
