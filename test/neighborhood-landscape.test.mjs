import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLandscape } from '../public/house/house-landscape.mjs';

const grade = -.25;
const footprint = (minX, minZ, maxX, maxZ) => new THREE.Box3(
  new THREE.Vector3(minX, -Infinity, minZ), new THREE.Vector3(maxX, Infinity, maxZ)
);
const street = footprint(-88, 8.4, 88, 15.6); // Includes both shoulders.
const approach = footprint(-3.3, 6, 5.4, 9.25);
const extension = footprint(5.5, -6.5, 13.5, 3.5);

for (const software of [false, true]) {
  test(`the street is level and clear, and the 8 × 10 m extension is low meadow (software=${software})`, t => {
    const surface = new THREE.MeshStandardMaterial();
    const land = buildLandscape(THREE, new THREE.Scene(), {get: () => surface}, {software});
    t.after(() => { land.dispose(); surface.dispose(); });
    const ground = land.root.getObjectByName('house-garden-terrain');
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const sites = [[-37, -3], [29, -10], [-20, 31], [5.5, -6.5], [13.5, 3.5], [-2.3, 7], [3, 7]];
    for (const x of [-87.8, -32, 0, 33, 87.8]) {
      for (const z of [8.4, 12, 15.6]) sites.push([x, z]);
    }
    for (const [x, z] of sites) {
      ray.set(new THREE.Vector3(x, 4, z), down);
      const hit = ray.intersectObject(ground)[0];
      assert.ok(hit && Math.abs(hit.point.y - grade) < .01, `Uneven rendered terrain at (${x}, ${z})`);
    }

    const matrix = new THREE.Matrix4(), box = new THREE.Box3();
    let lowTufts = 0;
    for (const name of ['house-garden-grasses', 'house-garden-boulders']) {
      const instances = land.root.getObjectByName(name);
      instances.geometry.computeBoundingBox();
      for (let i = 0; i < instances.count; i++) {
        instances.getMatrixAt(i, matrix);
        box.copy(instances.geometry.boundingBox).applyMatrix4(matrix);
        assert.ok(!box.intersectsBox(street) && !box.intersectsBox(approach), `${name} obstructs a public approach`);
        if (box.intersectsBox(extension)) {
          assert.equal(name, 'house-garden-grasses', 'Boulder occupies the extension');
          assert.ok(box.max.y <= grade + .25, 'High vegetation occupies the extension');
          lowTufts++;
        }
      }
    }
    assert.ok(lowTufts > 0, 'The extension must read as a garden');
  });
}
