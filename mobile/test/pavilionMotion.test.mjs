import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlantingModules } from './loadPlantingModules.mjs';
const { pavilionScene, pavilionGeometry, pavilionFrame, pavilionPages, PAVILION_SLOTS } = loadPlantingModules()('../../bookhouse/pavilionMotion');
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
        const focused = pavilionPages(geometry.layout, true).right;
        assert.ok(focused.x >= 0 && focused.x + focused.width <= width);
        assert.ok(focused.width > pages.right.width * 1.5, 'mobile can bring the actual page close to read');
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
