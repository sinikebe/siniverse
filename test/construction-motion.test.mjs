import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHouse } from '../public/house/house-scene.mjs';
import { WORK_AREAS } from '../public/house/construction-site.mjs';
import { APPS } from '../public/house/catalog.mjs';

test('the excavator drops soil over its pile, moving only the upper assembly inside its pad', () => {
  const scene = new THREE.Scene();
  const { construction } = buildHouse({ THREE, scene }, APPS);
  const site = construction.root, pad = WORK_AREAS[0];
  const teeth = site.getObjectsByProperty('name', 'excavator-bucket-tooth');
  const tracks = site.getObjectByName('excavator-track-shoes');
  const pile = site.getObjectByName('construction-earth-pile');
  const trackMatrix = tracks.matrixWorld.clone(), point = new THREE.Vector3();
  const heap = new THREE.Box3().setFromObject(pile);
  for (let step = 0; step <= 82; step++) {
    construction.updateAmbient(step / 2);
    scene.updateMatrixWorld();
    assert.deepEqual(tracks.matrixWorld, trackMatrix);
    for (const tooth of teeth) {
      tooth.getWorldPosition(point);
      assert(Math.abs(point.x - pad.x) <= pad.width / 2 && Math.abs(point.z - pad.z) <= pad.depth / 2);
      assert(point.y >= construction.excavator.position.y);
    }
    if (step === 24) {
      teeth[2].getWorldPosition(point);
      assert(site.getObjectByName('excavator-falling-earth').visible);
      assert(point.x >= heap.min.x && point.x <= heap.max.x && point.z >= heap.min.z && point.z <= heap.max.z);
      assert(point.y >= heap.max.y && point.y < heap.max.y + .5);
    }
  }
  assert.equal(construction.updateAmbient(26), false);
  assert.equal(construction.updateAmbient(33), false);
  assert.equal(construction.updateAmbient(44), true);
});

test('hoist ropes stay connected to both trolley and hook during travel, lift and rests', () => {
  const scene = new THREE.Scene();
  const { construction } = buildHouse({ THREE, scene }, APPS);
  const site = construction.root;
  const trolley = site.getObjectByName('crane-trolley');
  const block = site.getObjectByName('crane-hook-block');
  const ropes = site.getObjectsByProperty('name', 'crane-hoist-rope');
  const positions = new Set(), heights = new Set();
  for (const time of [0, 8, 15, 23, 29, 37, 42, 48, 53]) {
    construction.updateAmbient(time);
    scene.updateMatrixWorld();
    const top = trolley.getWorldPosition(new THREE.Vector3());
    const bottom = block.getWorldPosition(new THREE.Vector3());
    positions.add(top.x.toFixed(2)); heights.add(bottom.y.toFixed(2));
    for (const rope of ropes) {
      const span = new THREE.Box3().setFromObject(rope);
      assert(Math.abs(span.max.y - (top.y - .13)) < .002);
      assert(Math.abs(span.min.y - (bottom.y + .25)) < .002);
      assert(Math.hypot(top.x - bottom.x, top.z - bottom.z) < .002);
    }
  }
  assert(positions.size > 2 && heights.size > 2);
});
