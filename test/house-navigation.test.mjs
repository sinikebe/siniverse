import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildHouse} from '../public/concepts/v3/house-scene.mjs';
import {APPS} from '../public/concepts/v3/catalog.mjs';
import {EYE_HEIGHT,canStand,segmentClear,stepOnFloor,lookOnFloor,blendLook,floorPath,pointAlong} from '../public/concepts/v3/house-navigation.mjs';
import {cleanPose} from '../public/concepts/v3/camera-math.mjs';

// Build the actual architecture without a renderer: collision bounds derive from its meshes.
const scene=new THREE.Scene(),disposers=[],initialMaterials=[];
const world={THREE,scene,cleanup(fn){disposers.push(fn);},mesh(geometry,color,position=[0,0,0],parent=scene){
  const material=new THREE.MeshBasicMaterial({color});initialMaterials.push(material);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);parent.add(mesh);return mesh;
}};
world.box=(size,color,position,parent=scene)=>world.mesh(new THREE.BoxGeometry(...size),color,position,parent);
world.line=(points,color,radius=.01,parent=scene)=>world.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),56,radius,7,false),color,[0,0,0],parent);
const house=buildHouse(world,APPS),{obstacles,bounds}=house;
after(()=>{for(const fn of disposers)fn();scene.traverse(node=>node.geometry?.dispose());for(const m of initialMaterials)m.dispose();});
const eye=(x,z,tx=x,tz=z-4)=>({position:[x,EYE_HEIGHT,z],target:[tx,EYE_HEIGHT,tz]});

test('entry and interior doorway are genuine holes at human eye height',()=>{
  scene.updateMatrixWorld(true);
  for(const [a,b]of [[[-2.3,EYE_HEIGHT,5.7],[-2.3,EYE_HEIGHT,2.5]],[[.3,EYE_HEIGHT,1.6],[1.5,EYE_HEIGHT,1.6]]]){
    const origin=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(origin),ray=new THREE.Raycaster(origin,direction.clone().normalize(),0,direction.length());
    assert.equal(ray.intersectObjects(scene.children,true).length,0,'A visible mesh closes a promised doorway.');
  }
});
test('the guided office-to-garage journey uses the actual partition opening',()=>{
  const path=floorPath([-4,.125],[3.25,2.9],obstacles,bounds);
  assert(path.length>2,'The partition needs a bend, not a direct camera chord.');
  let crossed=false;
  for(let i=1;i<path.length;i++){
    assert(segmentClear(path[i-1],path[i],obstacles,bounds));
    const a=path[i-1],b=path[i];
    if(a[0]<=.8&&b[0]>.8){const z=a[1]+(b[1]-a[1])*(.8-a[0])/(b[0]-a[0]);assert(z>1.2&&z<2.0,'The camera crossed a wall instead of the door.');crossed=true;}
  }
  assert(crossed);
  for(let i=0;i<=100;i++)assert(canStand(pointAlong(path,i/100),obstacles,bounds));
});
test('all useful stations and the exit connect by a collision-free floor route',()=>{
  const points=[[-2.3,5.7],[-2.5,2.7],[-4,-.675],[-1.7,-.675],[2.5,2.9],[3.25,2.9]];
  for(const a of points)for(const b of points){const path=floorPath(a,b,obstacles,bounds);assert.deepEqual(path[0],a);assert.deepEqual(path.at(-1),b);for(let i=1;i<path.length;i++)assert(segmentClear(path[i-1],path[i],obstacles,bounds));}
});
test('long and repeated keyboard movement cannot tunnel through the wall or parked car',()=>{
  let wall=eye(.3,-1,4,-1);for(let i=0;i<12;i++)wall=stepOnFloor(wall,1,0,obstacles,bounds);
  assert(wall.position[0]<.48);assert.equal(wall.position[1],EYE_HEIGHT);
  const car=stepOnFloor(eye(3.1,3,3.1,-3),10,0,obstacles,bounds);
  assert(car.position[2]>2.0,'The eye entered the car.');assert(canStand([car.position[0],car.position[2]],obstacles,bounds));
});
test('looking changes direction while the walker stays put; restored close views retain human height',()=>{
  const pose=eye(-4,-.675),turned=lookOnFloor(pose,.5,.2);
  assert.deepEqual(turned.position,pose.position);assert.notDeepEqual(turned.target,pose.target);
  const close={position:[-4,EYE_HEIGHT,-.675],target:[-4,1.65,-2.475]};
  assert.deepEqual(cleanPose(close,pose,{minHeight:EYE_HEIGHT,minDistance:.4}),close);
});
test('the visible shell physically occludes a workstation from outside',()=>{
  const origin=new THREE.Vector3(6.1,EYE_HEIGHT,-2.475),target=new THREE.Vector3(...house.surfaces.finapp.position),direction=target.clone().sub(origin),ray=new THREE.Raycaster(origin,direction.clone().normalize());
  const hit=ray.intersectObjects(scene.children,true)[0];
  assert(hit.object.name.startsWith('house-wall-'));assert(hit.distance<direction.length());
});
test('guided half-turns keep a finite nonzero look vector instead of triggering a fallback pose',()=>{
  for(let i=0;i<=100;i++){const v=blendLook([0,0,4],[0,0,-2.6],i/100);assert(v.every(Number.isFinite));assert(Math.abs(Math.hypot(...v)-4)<1e-10);}
});
test('missing or nonfinite floor destinations fail instead of crossing obstacles',()=>{
  assert.equal(canStand([NaN,1],obstacles,bounds),false);
  assert.throws(()=>floorPath([3.1,0],[-4,0],obstacles,bounds),/passage libre/);
  assert.equal(canStand([bounds.maxX+1,0],obstacles,bounds),false);
});
