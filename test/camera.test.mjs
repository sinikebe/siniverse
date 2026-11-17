import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPose,orbitPose,zoomPose,dragTracker,projectedBounds} from '../public/house/camera-math.mjs';
import * as THREE from 'three';
import {threeAssets} from '../tools/three-assets.mjs';
const initial={position:[15,12,20],target:[0,0,0]};
test('screen bounds include each instance and allow visible decoration without making it pickable',()=>{
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);camera.position.set(0,0,20);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const geometry=new THREE.BoxGeometry(2,2,2),material=new THREE.MeshBasicMaterial(),objects=new THREE.InstancedMesh(geometry,material,2);
  objects.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-4,0,0));objects.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,0,0));objects.userData.pickThrough=true;
  const rect={left:0,top:0,width:100,height:100};
  assert.equal(projectedBounds(objects,camera,rect,{precise:true}),null);
  const actual=projectedBounds(objects,camera,rect,{precise:true,includeDecor:true});
  for(const [key,value]of Object.entries({x:25,y:45,width:50,height:10}))assert(Math.abs(actual[key]-value)<1e-7);
  objects.visible=false;assert.equal(projectedBounds(objects,camera,rect,{precise:true,includeDecor:true}),null);
  geometry.dispose();material.dispose();
});
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
