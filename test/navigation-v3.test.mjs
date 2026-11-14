import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeState,parseRoute,routeHref,selection,createPreferenceStore,NAVIGATION_KEY,PREFERENCE_KEY} from '../public/concepts/v3/model.mjs';
import {cleanPose,orbitPose,panPose,zoomPose,dragTracker} from '../public/concepts/v3/camera-math.mjs';
import {threeAssets} from '../tools/three-assets.mjs';

test('all three grammars share stable semantic destinations without camera frame URLs',()=>{
  for(const concept of ['plan','reacteur','anamorphose'])for(const app of ['finapp','garapp','branchlab'])for(const angle of ['presentation','action','methode','limites']){
    const state={concept,app,angle};
    assert.deepEqual(parseRoute(new URL(routeHref(state),'https://siniverse.cc').search),state);
    assert(!routeHref(state).includes('camera'));
  }
});
test('unknown routes are bounded and global optical/world views stay presentations',()=>{
  assert.deepEqual(normalizeState(null),{concept:'plan',app:'ensemble',angle:'presentation'});
  assert.deepEqual(parseRoute('?concept=anamorphose&app=<script>&angle=methode'),{concept:'anamorphose',app:'ensemble',angle:'presentation'});
  assert.deepEqual(normalizeState({concept:'reacteur',app:'ensemble',angle:'limites'}),{concept:'reacteur',app:'ensemble',angle:'limites'});
});
test('free reactor assembly can select an angle first and keep it while changing tool',()=>{
  const first=normalizeState({concept:'reacteur',app:'ensemble',angle:'methode'});
  const second=normalizeState({...first,app:'branchlab'});
  assert.equal(second.angle,'methode');
  assert.equal(normalizeState({...second,app:'finapp'}).angle,'methode');
});
test('explicit worlds do not change a different pinned preference',()=>{
  const saved={revision:2,last:'plan',pinned:'reacteur'};
  const direct=selection('?concept=anamorphose',saved);
  assert.equal(direct.concept,'anamorphose');assert.deepEqual(direct.preference,saved);
  assert.equal(selection('',saved).concept,'reacteur');
});
test('rotation has a known sequential arrival and a stable explicit share link',()=>{
  let saved={last:null,pinned:null};
  for(const id of ['plan','reacteur','anamorphose','plan']){const next=selection('',saved);assert.equal(next.concept,id);saved=next.preference;}
  assert(!routeHref({concept:'plan',app:'finapp',angle:'action'},{rotation:true}).includes('concept='));
});
test('storage fallback preserves the full view and does not touch earlier prototype preferences',()=>{
  let state={[NAVIGATION_KEY]:{route:{concept:'plan',app:'garapp',angle:'action'},view:{pose:{position:[1,9,12],target:[0,0,0]}}},__siniverseNavigationPreferenceV2:{pinned:'montage'}};
  const history={get state(){return state},replaceState(next){state=next}};
  const denied=()=>{throw Error('blocked')};
  const store=createPreferenceStore({local:denied,session:denied,history:()=>history});
  store.write({last:'anamorphose',pinned:'anamorphose'});
  assert.equal(createPreferenceStore({history:()=>history}).read().pinned,'anamorphose');
  assert.deepEqual(state[NAVIGATION_KEY].view.pose.position,[1,9,12]);
  assert.equal(state.__siniverseNavigationPreferenceV2.pinned,'montage');
  assert.equal(PREFERENCE_KEY,'siniverse.navigation-concepts.v3');
});
const initial={position:[15,12,20],target:[0,0,0]};
test('camera orbit remains finite, bounded above ground and keeps its centre',()=>{
  let pose=initial;
  for(let i=0;i<200;i++){pose=orbitPose(pose,.18,i%2?.15:-.17);assert(pose.position.every(Number.isFinite));assert(pose.position[1]>1);assert.deepEqual(pose.target,[0,0,0]);}
});
test('ground movement changes the real pose and remains in the navigable extent',()=>{
  let pose=initial;for(let i=0;i<100;i++)pose=panPose(pose,3,2);
  assert(pose.target[0]>=-30&&pose.target[0]<=30&&pose.target[2]>=-25&&pose.target[2]<=30);
  assert.notDeepEqual(pose.position,initial.position);
  assert.equal(pose.position[1],initial.position[1]);
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
