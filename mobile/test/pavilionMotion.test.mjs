import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const { pavilionScene, pavilionGeometry, pavilionFrame, pavilionPages, pavilionFullLeaves, pavilionReading, readingCamera,
  PAVILION_SLOTS, PAVILION_PHONE_BOOK, PAVILION_PAGE, PAVILION_READABLE } = loadPlantingModules()('../../bookhouse/pavilionMotion');
const { projectPoint } = loadPlantingModules()('../../bookhouse/book3d/motion');

for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [375, 667], [412, 915], [844, 390]]) {
  test(`Pavilion camera, book and page geometry at ${width} × ${height}`, () => {
    const scene = pavilionScene(width, height);
    for (const id of ['weekly', 'monthly', 'notes', 'collection']) {
      const slot = scene.slot(id), source = PAVILION_SLOTS[id];
      assert.ok(slot.x >= -.01 && slot.x + slot.width <= width + .01, `${id} remains reachable`);
      assert.ok(slot.y >= -.01 && slot.y + slot.height < height);
      assert.ok(Math.abs(slot.width / slot.height - source.width / source.height) < .0001);
      const geometry = pavilionGeometry(scene, id);
      const f0 = pavilionFrame(0, geometry), start = projectPoint(f0.cam, f0.pose, [680 / 2, 1000 / 2, 0]);
      assert.ok(Math.abs(start[0] - slot.x - slot.width / 2) < .1, 'starts in the actual rendered shelf slot');
      assert.ok(Math.abs(start[1] - slot.y - slot.height / 2) < .1);
      let previous = f0;
      for (let i = 1; i <= 200; i++) {
        const f = pavilionFrame(i / 200, geometry);
        for (const v of Object.values(f.pose)) assert.ok(Number.isFinite(v));
        assert.ok(Math.abs(f.pose.x - previous.pose.x) < width * .08, 'no teleport between stages');
        assert.ok(Math.abs(f.pose.y - previous.pose.y) < height * .08);
        assert.ok(f.pose.s > 0, 'one uniform positive book scale');
        previous = f;
      }
      assert.ok(previous.state.phi > 3, 'cover physically opens');
      assert.ok(previous.state.split > .49, 'pages spread onto both sides');
      const pages = pavilionPages(geometry.layout);
      for (const r of [pages.left, pages.right]) {
        assert.ok(r.x >= 0 && r.x + r.width <= width, 'paper stays in viewport');
        assert.ok(r.y >= 0 && r.y + r.height <= height, 'entire reading spread stays in viewport');
      }
      assert.ok(pages.left.x + pages.left.width < pages.right.x, 'content stays clear of central gutter');
      if (scene.compact) {
        // Phones: the book lies at a fixed place on the painted board (painting pixels), on every phone width.
        const t = scene.table;
        assert.ok(Math.abs((t.x - scene.art.x) / scene.k - PAVILION_PHONE_BOOK.x) < .05, 'anchored to the board (x)');
        assert.ok(Math.abs((t.y - scene.art.y) / scene.k - PAVILION_PHONE_BOOK.y) < .05, 'anchored to the board (y)');
        assert.ok(Math.abs(t.width / scene.k - PAVILION_PHONE_BOOK.width) < .05, 'one book size in painting pixels');
        assert.ok(t.x >= 0 && t.x + t.width <= width, 'the whole book is on screen');
      }
    }
    const lantern = scene.lantern;
    const colSlot = scene.slot('collection');
    assert.ok(lantern.x >= 0, 'lantern left stays inside viewport');
    assert.ok(lantern.x + lantern.width <= width + 0.001, 'lantern right stays inside viewport');
    assert.ok(lantern.y >= 0, 'lantern top stays inside viewport');
    assert.ok(lantern.y + lantern.height <= height + 0.001, 'lantern bottom stays inside viewport');
    assert.ok(lantern.x >= colSlot.x + colSlot.width - 0.001, 'lantern never overlaps or blocks collection book');
    assert.ok(lantern.width >= 24, 'lantern touch target has comfortable width');
    assert.ok(lantern.height >= 80, 'lantern touch target has comfortable height');
  });
}

// Reading: two pages where they are readable; otherwise the reading camera brings one whole page close, on the same book.
const SAFE = { top: 0, bottom: 0 };
for (const [width, height, twoPages] of [[390, 844, false], [375, 812, false], [844, 390, false], [768, 1024, false], [1280, 800, true], [1024, 768, true], [1440, 900, true]]) {
  test(`Pavilion reading at ${width} × ${height}`, () => {
    const scene = pavilionScene(width, height), geometry = pavilionGeometry(scene, 'notes');
    const leaves = pavilionFullLeaves(geometry.layout);
    const r = pavilionReading(width, height, leaves, { ...SAFE, closeAtBottom: scene.compact });
    assert.equal(r.fit, twoPages, 'two pages only where both are readable');
    assert.ok(Math.abs(leaves.left.width / leaves.left.height - PAVILION_PAGE.width / PAVILION_PAGE.height) < .005, 'the reference page has the leaf\'s proportions');
    // At zoom 0 the camera is the identity: the book is exactly at its anchor.
    for (const side of [-1, 1]) assert.equal(JSON.stringify(readingCamera(r, 0, side)), JSON.stringify({ s: 1, ox: 0, oy: 0 }));
    if (r.fit) return;
    const bottom = height - (scene.compact ? 60 : 8);
    // A short, wide screen: the camera brings the whole spread close and both pages read as two.
    assert.equal(r.spread, width > height, 'a landscape phone reads the spread whole');
    const both = { x: leaves.left.x, y: Math.min(leaves.left.y, leaves.right.y), width: leaves.right.x + leaves.right.width - leaves.left.x, height: Math.max(leaves.left.height, leaves.right.height) };
    for (const [side, leaf, view] of r.spread ? [[0, both, r.left]] : [[-1, leaves.left, r.left], [1, leaves.right, r.right]]) {
      const c = readingCamera(r, 1, side);
      const map = (x, y) => [c.ox + (x - c.ox) * c.s, c.oy + (y - c.oy) * c.s];
      const [x0, y0] = map(leaf.x, leaf.y), [x1, y1] = map(leaf.x + leaf.width, leaf.y + leaf.height);
      // The whole page lands in its reading window, inside the screen: nothing is cropped or needs scrolling.
      assert.ok(Math.abs(x0 - view.window.x) < .01 && Math.abs(y0 - view.window.y) < .01);
      assert.ok(x0 >= 11.99 && x1 <= width - 11.99 && y0 >= 7.99 && y1 <= bottom + .01, 'one complete page on screen');
      assert.ok(Math.abs((x1 - x0) / (y1 - y0) - leaf.width / leaf.height) < .001, 'the page keeps its proportions');
    }
    // Portrait phones and tablets keep the shelf in view and read at a comfortable size.
    if (height > width) {
      assert.ok(r.magnification >= PAVILION_READABLE, 'body text at least 12.5 px');
      assert.ok(r.left.window.y >= scene.slot('weekly').y + scene.slot('weekly').height, 'the shelf stays in view');
    }
  });
}
