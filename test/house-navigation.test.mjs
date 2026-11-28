import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildHouse} from '../public/house/house-scene.mjs';
import {APPS} from '../public/house/catalog.mjs';
import {WORK_AREAS} from '../public/house/construction-site.mjs';
import {EYE_HEIGHT,canStand,segmentClear,stepOnFloor,lookOnFloor,blendLook,floorPath,pointAlong} from '../public/house/house-navigation.mjs';
import {cleanPose,projectedBounds} from '../public/house/camera-math.mjs';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';

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

test('the gaming wing connects through a real opening and its PC remains reachable',()=>{
  scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(-4.4,EYE_HEIGHT,1.85),new THREE.Vector3(-1,0,0),0,1.7);
  assert.equal(ray.intersectObjects(scene.children,true).length,0,'A mesh closes the gaming doorway.');
  const destinations=[[-2.85,2.7],[-7.55,.9],[-7.88,-.3],[-4,-.675],[3.25,2.9],[-2.3,5.7]];
  for(const a of destinations)for(const b of destinations){
    const path=floorPath(a,b,obstacles,bounds);
    for(let i=0;i<=100;i++)assert(canStand(pointAlong(path,i/100),obstacles,bounds));
  }
  assert(!canStand([-7.45,-2.4],obstacles,bounds),'The camera can enter the gaming desk.');
  assert(!canStand([-9.55,0],obstacles,bounds),'The west wall is missing.');
  assert(house.gaming.pc.getObjectByName('house-gaming-pc-glass'));
  assert(house.gaming.pc.getObjectByName('house-gaming-graphics-card'));
});

test('a short diagonal cannot clip an expanded door jamb between sample points',()=>{
  const wall=[{minX:0,maxX:1,minZ:0,maxZ:1}];
  const extent={minX:-2,maxX:3,minZ:-2,maxZ:3};
  assert(canStand([-.23,-.19],wall,extent));assert(canStand([-.19,-.23],wall,extent));
  assert.equal(segmentClear([-.23,-.19],[-.19,-.23],wall,extent),false);
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

test('cutaway movement can be reversed without changing collision walls or leaving the roof transparent',async()=>{
  const previous=world.animate;world.animate=(_duration,update)=>{update(1);return Promise.resolve();};
  const count=house.obstacles.length;
  try{
    await house.setCutaway(true,{instant:true});assert.equal(house.roof.visible,false);assert.equal(house.inspectObjects().roofAmount,1);
    await house.setCutaway(false,{instant:true});assert.equal(house.roof.visible,true);assert.equal(house.roof.position.y,0);
    house.roof.traverse(node=>{if(node.isMesh){assert.equal(node.material.opacity,1);assert.equal(node.material.depthWrite,true);}});
    assert.equal(house.obstacles.length,count);
  }finally{world.animate=previous;}
});

test('the notebook hinge stays finite',()=>{
  house.setNotebook(Infinity);assert.equal(house.inspectObjects().notebookAmount,1);
  house.setNotebook(NaN);assert.equal(house.inspectObjects().notebookAmount,0);
});

test('Finapp and Branchlab share one real office PC and one physical display',()=>{
  assert.equal(house.screens.finapp,house.screens.branchlab);
  assert.equal(house.screens.finapp,house.office.screen);
  assert.equal(house.surfaces.finapp,house.office.surface);
  assert.equal(house.surfaces.branchlab,house.office.surface);
  const desk=scene.getObjectByName('house-office-workbench');
  const names=[];desk.traverse(node=>names.push(node.name));
  assert.equal(names.filter(name=>name==='house-keyboard').length,1);
  assert.equal(names.filter(name=>name==='house-office-screen').length,1);
  assert.equal(names.filter(name=>name==='house-office-computer').length,1);
  assert.equal(names.filter(name=>name==='house-chair-seat').length,1);
});

test('the sculpted car has outward body panels and genuinely open wheel arches',()=>{
  scene.updateMatrixWorld(true);
  const body=scene.getObjectByName('car-sculpted-body');
  const front=new THREE.Raycaster(new THREE.Vector3(3.1,.65,3.1),new THREE.Vector3(0,0,-1)).intersectObject(body)[0];
  assert(front,'The front body panel must be visible from outside.');
  assert(front.face.normal.z>.5,'The front panel must face outward.');
  const bonnet=new THREE.Raycaster(new THREE.Vector3(3.1,1.3,1.0),new THREE.Vector3(0,-1,0)).intersectObject(body)[0];
  assert(bonnet?.face.normal.y>.7,'The bonnet must face upward.');
  for(const z of [-1.27,1.24]){
    const ray=new THREE.Raycaster(new THREE.Vector3(5,.45,z-.3),new THREE.Vector3(-1,0,0));
    assert.equal(ray.intersectObject(body).length,0,'A solid body panel closes a wheel arch.');
  }
});

test('the garage wall display faces a collision-free reading position beside the car',()=>{
  const {monitor,surface,cameraForViewport}=house.garage;
  scene.updateMatrixWorld(true);
  assert(scene.getObjectById(monitor.id),'The wall display must be in the house.');
  const housing=monitor.getObjectByName('house-garage-monitor-case');
  for(const [width,height,fov] of [[1280,720,50],[390,844,78],[360,900,78]]) {
    const aspect=width/height,pose=cameraForViewport(aspect,fov);
    const camera=new THREE.PerspectiveCamera(fov,aspect,.1,160);
    camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld();
    assert.equal(camera.position.y,EYE_HEIGHT);
    const direction=new THREE.Vector3(...surface.position).sub(camera.position);
    const ray=new THREE.Raycaster(camera.position,direction.clone().normalize(),0,direction.length()+.1);
    const hits=ray.intersectObjects(scene.children,true).filter(hit=>hit.object.visible&&!hit.object.userData.pickThrough);
    assert.equal(hits[0]?.object.name,'house-garage-display','The physical screen is blocked from its reading position.');
    const vertices=housing.geometry.attributes.position;
    for(let i=0;i<vertices.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(housing.matrixWorld).project(camera);
      assert(Math.abs(p.x)<.91&&Math.abs(p.y)<.91,'The monitor housing is cropped.');
    }
    const destination=[camera.position.x,camera.position.z],path=floorPath([-2.85,2.7],destination,obstacles,bounds);
    assert.deepEqual(path.at(-1),destination);
    for(let i=1;i<path.length;i++)assert(segmentClear(path[i-1],path[i],obstacles,bounds));
  }
});

test('screen artwork maps once across the entire physical display',()=>{
  for(const screen of Object.values(house.screens)){
    const uv=screen.geometry.attributes.uv,values=Array.from(uv.array);
    assert(values.every(value=>value>=0&&value<=1),'Screen artwork must not repeat or crop at negative UVs.');
    assert.equal(Math.min(...values),0);assert.equal(Math.max(...values),1);
  }
});

test('the planted landscape leaves the complete walking rectangle unobstructed',()=>{
  const grass=scene.getObjectByName('house-garden-grasses'),matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  for(let i=0;i<grass.count;i++){
    grass.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
    assert(position.x<bounds.minX||position.x>bounds.maxX||position.z<bounds.minZ||position.z>bounds.maxZ);
  }
});

test('construction scenery leaves all walking routes open and its tracks sit on the ground',()=>{
  const site=scene.getObjectByName('construction-site');assert(site);
  site.updateMatrixWorld(true);
  site.traverse(node=>{
    if(!node.isMesh)return;
    const box=new THREE.Box3().setFromObject(node);
    assert([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite),node.name+' has invalid bounds.');
    assert(box.max.x<bounds.minX||box.min.x>bounds.maxX||box.max.z<bounds.minZ||box.min.z>bounds.maxZ||box.min.y>2.8,node.name+' enters the walking clearance.');
  });
  const tracks=new THREE.Box3().setFromObject(site.getObjectByName('excavator-track-shoes'));
  assert(Math.abs(tracks.min.y-house.construction.excavator.position.y)<.04,'The machine floats above its working pad.');
  assert(site.getObjectByName('crane-lattice-diagonals').isInstancedMesh);
});

test('the working pads are free of grass clumps and garden boulders',()=>{
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  for(const name of ['house-garden-grasses','house-garden-boulders']){
    const instances=scene.getObjectByName(name);
    for(let i=0;i<instances.count;i++){
      instances.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
      for(const area of WORK_AREAS)assert(Math.abs(position.x-area.x)>=area.width/2||Math.abs(position.z-area.z)>=area.depth/2,name+' intersects a working pad.');
    }
  }
});

test('the actual construction meshes fit both opening cameras without empty-box clipping',()=>{
  for(const [width,height,position,target,fov]of [[1365,900,[11,7,24],[-3,1.5,1.5],50],[390,740,[18,9.2,26],[-5,0,0],78]]){
    const camera=new THREE.PerspectiveCamera(fov,width/height,.1,160);camera.position.set(...position);camera.lookAt(new THREE.Vector3(...target));camera.updateMatrixWorld(true);
    for(const object of [house.construction.excavator,house.construction.crane]){
      const b=projectedBounds(object,camera,{left:0,top:0,width,height},{precise:true,includeDecor:true});
      assert(b&&b.x>=0&&b.x+b.width<=width&&b.y>=12&&b.y+b.height<height-80,object.name+' is clipped: '+JSON.stringify(b));
    }
  }
});

test('photographic surfaces keep color and relief in their respective color spaces',()=>{
  for(const name of ['house-office-floor','house-garden-terrain','house-wall-rear']){
    const material=scene.getObjectByName(name).material;
    assert(material.isMeshPhysicalMaterial);assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);
    assert.equal(material.roughnessMap.colorSpace,THREE.NoColorSpace);assert(material.roughness>0);
  }
});

test('all photographed texture maps match their recorded local provenance and stay under 3 MB',()=>{
  const base=new URL('../public/assets/house/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'));
  let size=0;
  for(const item of manifest){
    assert.equal(item.license,'CC0-1.0');assert(item.source.startsWith('https://dl.polyhaven.org/'));
    assert.match(item.file,/^[a-z0-9_-]+\.webp$/);
    const file=new URL(item.file,base);size+=statSync(file).size;
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),item.sha256);
  }
  assert(size<3000000);
});
