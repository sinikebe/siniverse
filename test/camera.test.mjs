import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPose,orbitPose,zoomPose,dragTracker} from '../public/house/camera-math.mjs';
import {threeAssets} from '../tools/three-assets.mjs';
const initial={position:[15,12,20],target:[0,0,0]};
test('camera orbit remains finite, bounded above ground and keeps its centre',()=>{
  let pose=initial;
  for(let i=0;i<200;i++){pose=orbitPose(pose,.18,i%2?.15:-.17);assert(pose.position.every(Number.isFinite));assert(pose.position[1]>1);assert.deepEqual(pose.target,[0,0,0]);}
});
test('restored poses reject NaN/collapsed views and zoom cannot cross the target',()=>{
  assert.deepEqual(cleanPose({position:[NaN,2,3],target:[0,0,0]},initial),initial);
  assert.deepEqual(cleanPose({position:[0,2,0],target:[0,2,0]},initial),initial);
  let pose=initial;for(let i=0;i<50;i++)pose=zoomPose(pose,.1);
  assert(Math.hypot(...pose.position.map((n,i)=>n-pose.target[i]))>=5.999);
});
test('a drag remains a drag even when the pointer returns to its starting position',()=>{
  const gesture=dragTracker(6);gesture.start(10,10);assert.equal(gesture.move(13,12),false);
  assert.equal(gesture.move(30,30),true);gesture.move(10,10);assert.equal(gesture.end(),true);
  gesture.start(10,10);assert.equal(gesture.end(),false);
});
test('the local renderer has fixed provenance, licence, bounded bytes and relative-only imports',()=>{
  const assets=threeAssets(),provenance=JSON.parse(assets.get('provenance.json'));
  assert.equal(provenance.version,'0.187.0');assert.equal(provenance.transform.version,'0.28.2');
  assert.match(assets.get('LICENSE.txt').toString(),/MIT License/);
  const module=assets.get('three.module.min.js').toString();
  assert(module.includes('./three.core.min.js'));assert(!/from["']https?:/.test(module));
  assert(Object.values(provenance.output).reduce((n,file)=>n+file.gzipBytes,0)<350000);
});
