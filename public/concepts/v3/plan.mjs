import { createWorld, THREE } from './world.mjs';
import { orbitPose, zoomPose, dragTracker } from './camera-math.mjs';
import { buildHouse } from './house-scene.mjs';
import { EYE_HEIGHT, canStand, segmentClear, stepOnFloor, lookOnFloor, blendLook, floorPath, pointAlong } from './house-navigation.mjs';

const APPROACH={position:[-2.3,EYE_HEIGHT,5.7],target:[-2.3,EYE_HEIGHT,1.8]};
const BUREAU={position:[-2.5,EYE_HEIGHT,2.7],target:[-2.5,1.5,-2.6]};
const OVERVIEW={position:[10,7,12],target:[0,1.2,0]};
const MOBILE_OVERVIEW={position:[11,7,14],target:[0,1.2,0]};
const GARAGE_PASSAGE={position:[1.65,EYE_HEIGHT,1.65],target:[3.1,1,-.3]};
const CAR_VIEW={position:[2.8,EYE_HEIGHT,4.8],target:[3.1,.85,-.3]};
const ANGLES={presentation:'Le rôle',action:'En action',methode:'Méthode',limites:'Limites'};
const button=(id,label,className='')=>{const b=document.createElement('button');b.type='button';b.id=id;b.textContent=label;b.className=className;return b;};
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);

export function mountPlan(host,initialState,api){
  host.classList.add('plan-host','plan-house');
  const viewport=document.createElement('div');viewport.className='plan-viewport';host.append(viewport);
  const hud=document.createElement('div');hud.className='plan-controls house-hud';
  hud.innerHTML='<h1 id="view-title" class="house-sr" tabindex="-1">La maison Siniverse</h1><div class="plan-compass"><span class="compass-name" id="plan-location">Devant la maison</span><button id="plan-origin" type="button">↙ La maison</button><button id="plan-enter-house" type="button">Entrer</button><button id="plan-cutaway" type="button" aria-pressed="false">Voir en coupe</button><details><summary>Trajets directs</summary><div class="plan-direct-routes"></div></details></div><div class="plan-movement" aria-label="Déplacement au sol"><button id="plan-forward" data-move="forward" aria-label="Avancer">↑</button><button data-move="left" aria-label="Pas à gauche">←</button><button data-move="back" aria-label="Reculer">↓</button><button data-move="right" aria-label="Pas à droite">→</button><button id="plan-zoom-in" data-move="in" aria-label="Avancer vers le poste">+</button><button data-move="out" aria-label="Reculer du poste">−</button></div>';
  host.append(hud);
  const introduction=document.createElement('aside');introduction.className='house-intro';introduction.innerHTML='<p>PLAN-SÉQUENCE / UNE MAISON À EXPLORER</p><h2>Les outils ont leur place.</h2><p>Finapp et Branchlab dans le bureau. Garapp auprès de la voiture, dans le garage.</p>';host.append(introduction);
  const instruction=document.createElement('p');instruction.className='plan-instruction';instruction.textContent='Entrer, puis glisser pour regarder · W A S D / flèches pour marcher';host.append(instruction);
  let state=initialState,world,house,failed=false,destroyed=false,mode='overview',roofOpen=false,readingOpen=false,revision=0,dragging=false,lastPick=null,lastJourney=[],blockedMoves=0;
  const cleanups=[],surfaces=new Map(),stationLabels=[],tracker=dragTracker(6);
  const navigate=(destination,focusId='view-title')=>api.navigate(destination,{focusId});
  const isMobile=()=>viewport.clientWidth<760;

  function fallback(){
    failed=true;host.classList.add('plan-is-fallback');hud.querySelector('h1').removeAttribute('id');hud.hidden=true;introduction.hidden=true;instruction.hidden=true;viewport.replaceChildren();
    const content=api.content(state.app,state.angle);
    viewport.innerHTML='<section class="plan-fallback"><p class="scene-kicker">LA MAISON / PARCOURS SANS WEBGL</p><h1 id="view-title" tabindex="-1">'+api.escape(content.title)+'</h1><p>Le lieu 3D n’est pas disponible ici. Les mêmes outils et explications restent accessibles.</p><div class="fallback-destinations"><a href="'+api.href({app:'ensemble',angle:'presentation'})+'" data-plan-fallback-app="ensemble">La maison</a>'+Object.entries(api.apps).map(([id,app])=>'<a href="'+api.href({app:id,angle:state.angle})+'" data-plan-fallback-app="'+id+'">'+app.name+'</a>').join('')+'</div><div class="fallback-destinations">'+Object.entries(ANGLES).map(([angle,label])=>'<a href="'+api.href({app:state.app,angle})+'" data-plan-fallback-angle="'+angle+'">'+label+'</a>').join('')+'</div>'+content.body.map(p=>'<p>'+api.escape(p)+'</p>').join('')+(api.apps[state.app]?'<a class="real-app-link" href="'+api.apps[state.app].url+'">Ouvrir '+api.apps[state.app].name+' ↗</a>':'')+'</section>';
    for(const a of viewport.querySelectorAll('[data-plan-fallback-app],[data-plan-fallback-angle]'))a.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate({app:a.dataset.planFallbackApp||state.app,angle:a.dataset.planFallbackAngle||state.angle});});
  }
  try{world=createWorld(viewport,{cartoon:true,minCameraHeight:EYE_HEIGHT,minCameraDistance:.4,mobileFov:75,desktopFov:55,reducedMotion:api.reducedMotion,onContextLost:()=>{if(!destroyed)fallback();}});}
  catch{fallback();}
  if(failed)return {update(next){state=next;fallback();},snapshot(){return null;},inspect(){return {kind:'fallback',app:state.app,angle:state.angle};},destroy(){destroyed=true;world?.destroy();host.replaceChildren();host.classList.remove('plan-host','plan-house');}};
  world.canvas.id='plan-canvas';world.canvas.setAttribute('aria-label','La maison Siniverse. Glisser pour regarder. W A S D ou flèches pour marcher ; les murs et le véhicule arrêtent le déplacement.');
  house=buildHouse(world,api.apps);
  const obstacles=house.obstacles,bounds=house.bounds;
  const setPose=pose=>{world.setPose(pose);updateLocation();};
  function updateLocation(){
    const p=world.getPose().position,inside=p[0]>-5.3&&p[0]<5.3&&p[2]>-3.6&&p[2]<3.6;
    hud.querySelector('#plan-location').textContent=mode==='overview'?'La maison / vue d’ensemble':inside?(p[0]<.8?'Dans le bureau':'Dans le garage'):'Devant la maison';
    introduction.hidden=mode!=='overview'||state.app!=='ensemble';hud.querySelector('#plan-enter-house').hidden=mode==='walk';
    for(const station of stationLabels){const separated=mode==='overview'&&isMobile()&&roofOpen&&station.id!=='garapp';station.handle.setEnabled(station.id!==state.app);station.handle.setPosition(separated?station.cutPosition:station.position);if(station.guide)station.guide.visible=separated;}
  }
  function setRoof(open){roofOpen=open;house.roof.visible=!open;hud.querySelector('#plan-cutaway').setAttribute('aria-pressed',String(open));hud.querySelector('#plan-cutaway').textContent=open?'Remettre le toit':'Voir en coupe';updateLocation();world.requestRender();}
  hud.querySelector('#plan-cutaway').addEventListener('click',()=>{setRoof(!roofOpen);api.saveView();});
  for(const [id,app]of Object.entries(api.apps)){
    const link=document.createElement('a');link.id='plan-direct-'+id;link.href=api.href({app:id,angle:'presentation'});link.textContent=app.name+' / '+(id==='garapp'?'garage':'bureau');link.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();hud.querySelector('.plan-compass details').open=false;navigate({app:id,angle:'presentation'});});hud.querySelector('.plan-direct-routes').append(link);
    const station=button('plan-app-'+id,app.name,'house-station');
    station.addEventListener('click',()=>navigate({app:id,angle:'presentation'}));
    const spec=house.surfaces[id],position=id==='garapp'?[3.1,1.8,1.6]:[spec.position[0],spec.position[1]+spec.height/2+.12,spec.position[2]+.08];
    const cutPosition=id==='finapp'?[position[0],4.5,position[2]]:id==='branchlab'?[position[0],2.5,position[2]]:position;
    const guide=id==='garapp'?null:world.line([position,cutPosition],'#52685b',.012);if(guide)guide.visible=false;
    stationLabels.push({id,position,cutPosition,guide,handle:world.label(position,station,{clamp:false})});
    const article=document.createElement('article');article.className='house-screen screen-'+id;article.setAttribute('aria-label',app.name+' : inscription dans '+(id==='garapp'?'le garage':'le bureau'));
    surfaces.set(id,{article,handle:world.surface(spec,article)});
  }
  world.addPick(house.car,()=>navigate({app:'garapp',angle:'presentation'}));house.car.name='voiture-garapp';
  for(const [id,mesh]of Object.entries(house.screens)){mesh.name='poste-'+id;world.addPick(mesh,()=>navigate({app:id,angle:'presentation'}));}
  const entrance=button('plan-door','Entrer dans le bureau →','house-door');entrance.addEventListener('click',()=>enterHouse());world.label([-2.3,1.8,3.82],entrance,{clamp:false});
  if(house.entry)world.addPick(house.entry,()=>enterHouse());

  function drawReading(){
    const c=api.content(state.app,state.angle);hud.querySelector('#view-title').textContent=state.app==='ensemble'?'La maison Siniverse':api.apps[state.app].name+' / '+c.title;
    for(const [id,item]of surfaces){
      item.handle.setEnabled(id===state.app);
      if(id!==state.app){item.article.replaceChildren();continue;}
      item.article.classList.toggle('is-reading',readingOpen);
      item.article.innerHTML='<header><span>'+api.escape(api.apps[id].name)+' / '+api.escape(ANGLES[state.angle])+'</span><h2>'+api.escape(c.title)+'</h2></header><nav aria-label="Angles de lecture">'+Object.entries(ANGLES).map(([angle,label])=>'<button type="button" id="plan-angle-'+angle+'" data-house-angle="'+angle+'" aria-pressed="'+String(angle===state.angle)+'">'+label+'</button>').join('')+'</nav><details class="plan-reading" id="plan-reading"'+(readingOpen?' open':'')+'><summary id="plan-read-more">'+(readingOpen?'← Revenir aux angles':'Lire l’explication')+'</summary><p class="house-reading-eyebrow">'+api.escape(c.eyebrow)+'</p>'+c.body.map(p=>'<p>'+api.escape(p)+'</p>').join('')+(c.facts?.length?'<dl>'+c.facts.map(f=>'<div><dt>'+api.escape(f.label)+'</dt><dd>'+api.escape(f.value)+'</dd></div>').join('')+'</dl>':'')+(c.related?'<button type="button" class="house-related">'+api.escape(c.related.label)+' →</button>':'')+'</details><a class="real-app-link" id="plan-open" href="'+api.apps[id].url+'">Ouvrir '+api.apps[id].name+' ↗</a>';
      for(const b of item.article.querySelectorAll('[data-house-angle]'))b.addEventListener('click',()=>navigate({app:state.app,angle:b.dataset.houseAngle}));
      item.article.querySelector('.house-related')?.addEventListener('click',()=>navigate({app:c.related.app,angle:'presentation'}));
      item.article.querySelector('details').addEventListener('toggle',event=>{if(!event.target.isConnected||id!==state.app)return;readingOpen=event.target.open;item.article.classList.toggle('is-reading',readingOpen);event.target.querySelector('summary').textContent=readingOpen?'← Revenir aux angles':'Lire l’explication';api.saveView();});
    }
    updateLocation();world.requestRender();
  }
  function targetPose(app){
    if(app==='garapp')return {position:[isMobile()?2.5:3.25,EYE_HEIGHT,2.9],target:[1.05,1.55,2.9]};
    const s=house.surfaces[app];return {position:[s.position[0],EYE_HEIGHT,s.position[2]+(isMobile()?1.8:2.6)],target:[s.position[0],s.position[1],s.position[2]]};
  }
  async function interpolatePose(end,duration,token){
    const start=world.getPose();await world.animate(api.reducedMotion?0:duration,t=>{if(token!==revision||failed)return;const s=t*t*(3-2*t);setPose({position:mix(start.position,end.position,s),target:mix(start.target,end.target,s)});});
  }
  async function walkTo(end,{instant=false,token=revision}={}){
    if(instant){mode='walk';setPose(end);lastJourney=[];return;}
    if(mode==='overview'){
      await interpolatePose({position:[-2.3,5.2,5.7],target:[-2.3,1.5,2.3]},450,token);if(token!==revision||failed)return;
      await interpolatePose(APPROACH,350,token);if(token!==revision||failed)return;mode='walk';
    }
    const start=world.getPose(),a=[start.position[0],start.position[2]],b=[end.position[0],end.position[2]],path=floorPath(a,b,obstacles,bounds);
    lastJourney.push(...path.map(p=>[p[0],EYE_HEIGHT,p[1]]));
    const length=path.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0),fromDirection=start.target.map((v,i)=>v-start.position[i]),toDirection=end.target.map((v,i)=>v-end.position[i]);
    await world.animate(api.reducedMotion?0:Math.min(2200,400+length*100),t=>{
      if(token!==revision||failed)return;const s=t*t*(3-2*t),p=pointAlong(path,s),position=[p[0],EYE_HEIGHT,p[1]],direction=blendLook(fromDirection,toDirection,s);setPose({position,target:position.map((v,i)=>v+direction[i])});
    });
    if(token===revision&&!failed)setPose(end);
  }
  async function enterHouse(){
    const token=++revision;lastJourney=[];await walkTo(BUREAU,{token});if(token===revision&&!failed){api.saveView();world.canvas.focus({preventScroll:true});}
  }
  hud.querySelector('#plan-enter-house').addEventListener('click',enterHouse);
  hud.querySelector('#plan-origin').addEventListener('click',()=>navigate({app:'ensemble',angle:'presentation'}));
  function manual(pose){revision++;world.cancelFlight();setPose(pose);}
  function moveOnFloor(forward,side){
    if(mode==='overview'){mode='walk';setPose(APPROACH);}
    const before=world.getPose(),next=stepOnFloor(before,forward,side,obstacles,bounds);
    if(Math.hypot(next.position[0]-before.position[0],next.position[2]-before.position[2])<.001)blockedMoves++;
    manual(next);api.saveView();
  }
  let activePointer=null,lastPointer=null;
  const down=event=>{if(event.button!==0||activePointer!==null)return;activePointer=event.pointerId;lastPointer=[event.clientX,event.clientY];tracker.start(...lastPointer);world.canvas.setPointerCapture(event.pointerId);};
  const move=event=>{
    if(activePointer!==event.pointerId||!lastPointer)return;
    if(tracker.move(event.clientX,event.clientY)){
      const dx=event.clientX-lastPointer[0],dy=event.clientY-lastPointer[1],pose=world.getPose();
      if(mode==='walk')manual(lookOnFloor(pose,-dx*.005,dy*.004));
      else{const next=orbitPose(pose,-dx*.005,-dy*.004);next.position[1]=Math.max(5,next.position[1]);manual(next);}
      dragging=true;
    }
    lastPointer=[event.clientX,event.clientY];
  };
  const up=event=>{if(activePointer!==event.pointerId)return;const wasDrag=tracker.end();activePointer=null;lastPointer=null;dragging=false;if(world.canvas.hasPointerCapture(event.pointerId))world.canvas.releasePointerCapture(event.pointerId);if(wasDrag)api.saveView();else lastPick=world.pick(event.clientX,event.clientY);};
  const cancel=event=>{if(activePointer!==event.pointerId)return;tracker.end();activePointer=null;lastPointer=null;dragging=false;if(world.canvas.hasPointerCapture(event.pointerId))world.canvas.releasePointerCapture(event.pointerId);api.saveView();};
  const wheel=event=>{event.preventDefault();if(mode==='walk')moveOnFloor(event.deltaY<0?.2:-.2,0);else{const next=zoomPose(world.getPose(),Math.exp(event.deltaY*.0009));next.position[1]=Math.max(5,next.position[1]);manual(next);api.saveView();}};
  const key=event=>{
    if(event.target!==world.canvas)return;const k=event.key.toLowerCase();
    if(['arrowup','w','arrowdown','s','a','d'].includes(k)){event.preventDefault();moveOnFloor(k==='arrowup'||k==='w'?.2:k==='arrowdown'||k==='s'?-.2:0,k==='a'?-.2:k==='d'?.2:0);}
    else if(k==='arrowleft'||k==='arrowright'){event.preventDefault();if(mode==='walk')manual(lookOnFloor(world.getPose(),k==='arrowleft'?.1:-.1,0));else{const p=orbitPose(world.getPose(),k==='arrowleft'?-.1:.1,0);p.position[1]=Math.max(5,p.position[1]);manual(p);}api.saveView();}
  };
  for(const b of hud.querySelectorAll('[data-move]'))b.addEventListener('click',()=>{const a=b.dataset.move;moveOnFloor(a==='forward'||a==='in'?.25:a==='back'||a==='out'?-.25:0,a==='left'?-.25:a==='right'?.25:0);});
  for(const [name,fn,options]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['wheel',wheel,{passive:false}],['keydown',key]]){world.canvas.addEventListener(name,fn,options);cleanups.push(()=>world.canvas.removeEventListener(name,fn,options));}
  async function update(next,{snapshot=null,instant=false}={}){
    const token=++revision,previousApp=state.app;state=next;if(failed){fallback();return;}
    const restored=snapshot?.layout==='house-v1';if(restored){roofOpen=Boolean(snapshot.roofOpen);readingOpen=Boolean(snapshot.readingOpen);}
    drawReading();setRoof(roofOpen);
    if(restored&&snapshot.pose&&['walk','overview'].includes(snapshot.mode)){
      const p=snapshot.pose.position;if(snapshot.mode==='overview'||canStand([p[0],p[2]],obstacles,bounds)){mode=snapshot.mode;setPose(snapshot.pose);return;}
    }
    lastJourney=[];
    if(state.app!=='ensemble'){
      if(!instant&&state.app==='garapp'&&(previousApp!=='garapp'||mode==='overview')){
        await walkTo(GARAGE_PASSAGE,{token});if(token!==revision||failed)return;
        await walkTo(CAR_VIEW,{token});if(token!==revision||failed)return;
        await world.animate(api.reducedMotion?0:350,()=>{});if(token!==revision||failed)return;
      }
      await walkTo(targetPose(state.app),{instant,token});
    }
    else{
      if(mode==='walk')await walkTo(APPROACH,{instant,token});
      if(token!==revision||failed)return;mode='overview';await interpolatePose(isMobile()?MOBILE_OVERVIEW:OVERVIEW,instant?0:650,token);
    }
    if(token!==revision||failed)return;updateLocation();world.requestRender();
  }
  setPose(isMobile()?MOBILE_OVERVIEW:OVERVIEW);drawReading();
  function pickInfo(app,point){const screen=world.project(point);return {app,screen,blocker:world.probe(screen.x,screen.y).intersections[0]?.name||null,occluded:!world.visiblePoint(point)};}
  return {update,snapshot:()=>({layout:'house-v1',mode,pose:world.getPose(),roofOpen,readingOpen}),inspect:()=>({...world.inspect(),layout:'house-v1',mode,room:mode==='overview'?'outside':world.getPose().position[0]<.8?'bureau':'garage',app:state.app,angle:state.angle,roofOpen,dragging,lastPick,blockedMoves,journey:lastJourney,journeyClear:lastJourney.slice(1).every((p,i)=>segmentClear([lastJourney[i][0],lastJourney[i][2]],[p[0],p[2]],obstacles,bounds)),obstacles,bounds,stations:Object.keys(api.apps),pickTargets:[...[[0,.75,1.95],[-.8,.7,.9],[.8,.7,.9]].map(p=>pickInfo('garapp',house.car.localToWorld(new THREE.Vector3(...p)))),...Object.entries(house.surfaces).map(([app,s])=>pickInfo(app,new THREE.Vector3(...s.position)))]}),destroy(){destroyed=true;revision++;for(const fn of cleanups)fn();world.destroy();host.replaceChildren();host.classList.remove('plan-host','plan-house');}};
}
