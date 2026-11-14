import { createWorld, THREE } from './world.mjs';
import { orbitPose, panPose, zoomPose, dragTracker } from './camera-math.mjs';
const CENTRES={finapp:[-15,0,-8],garapp:[13,0,-7],branchlab:[0,0,15]};
const INITIAL={position:[34,30,42],target:[0,0,1]};
const MOBILE_INITIAL={position:[47,44,5],target:[0,0,3]};
const VIEWS={
  finapp:{presentation:{position:[-1,13,8],target:[-14,1,-8]},action:{position:[-13,9,-24],target:[-15,1,-15]},methode:{position:[-28,8,2],target:[-20,.7,-4]},limites:{position:[-4,8,-14],target:[-12,1,-10]}},
  garapp:{presentation:{position:[27,12,8],target:[13,1,-7]},action:{position:[18,8,-20],target:[12,1,-10]},methode:{position:[28,8,-10],target:[17,.7,-6]},limites:{position:[4,8,-18],target:[10,.6,-8]}},
  branchlab:{presentation:{position:[19,11,30],target:[1,1,15]},action:{position:[5,7,3],target:[1,1,15]},methode:{position:[-14,8,22],target:[-4,1,15]},limites:{position:[12,8,12],target:[7,1,16]}}
};
const POINTS={
  finapp:{presentation:[-15,2,-8],action:[-15,1.5,-16],methode:[-21,1,-2],limites:[-9,1.5,-11]},
  garapp:{presentation:[13,2,-7],action:[12,1.3,-12],methode:[18,1,-7],limites:[8,1,-8]},
  branchlab:{presentation:[1,2,15],action:[1,.9,15],methode:[-6,1,14],limites:[8,2,16]}
};
const ANGLES={presentation:'Le lieu',action:'En action',methode:'La méthode',limites:'Les limites'};
const button=(id,text,className='')=>{const element=document.createElement('button');element.type='button';element.id=id;element.className=className;element.textContent=text;return element;};

export function mountPlan(host,initialState,api){
  host.classList.add('plan-host');
  const viewport=document.createElement('div');viewport.className='plan-viewport';host.append(viewport);
  const hud=document.createElement('div');hud.className='plan-controls';
  hud.innerHTML='<div class="plan-compass"><span class="compass-name">SINIVERSE / PLAN-SÉQUENCE</span><button id="plan-origin" type="button">↙ Vue d’ensemble</button><details><summary>Trajets directs</summary><div class="plan-direct-routes"></div></details></div>'
    +'<div class="plan-movement" aria-label="Déplacement libre"><button id="plan-forward" data-move="forward" aria-label="Avancer">↑</button><button data-move="left" aria-label="Aller à gauche">←</button><button data-move="back" aria-label="Reculer">↓</button><button data-move="right" aria-label="Aller à droite">→</button><button id="plan-zoom-in" data-move="in" aria-label="Se rapprocher">+</button><button data-move="out" aria-label="S’éloigner">−</button></div>';
  host.append(hud);
  const instruction=document.createElement('p');instruction.className='plan-instruction';instruction.textContent='Glisser : regarder · Maj + glisser : se déplacer · W A S D / flèches : avancer et tourner';
  host.append(instruction);
  let state=initialState,world,failed=false,destroyed=false,dragging=false,saved=false,updateGeneration=0,lastPick=null;
  const cleanups=[],angleLabels=[],signals=[],moving=new Set();
  const navigate=(destination,focusId)=>api.navigate(destination,{focusId});
  for(const id of Object.keys(api.apps)){
    const link=document.createElement('a');link.href=api.href({app:id,angle:'presentation'});link.textContent=api.apps[id].name;link.id='plan-direct-'+id;
    link.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate({app:id,angle:'presentation'},'view-title');});
    hud.querySelector('.plan-direct-routes').append(link);
  }
  hud.querySelector('#plan-origin').addEventListener('click',()=>navigate({app:'ensemble',angle:'presentation'},'view-title'));
  function fallback(){
    failed=true;host.classList.add('plan-is-fallback');hud.hidden=true;instruction.hidden=true;viewport.replaceChildren();
    const content=api.content(state.app,state.angle);
    viewport.innerHTML='<section class="plan-fallback"><p class="scene-kicker">PARCOURS SANS WEBGL</p><h1 id="view-title" tabindex="-1">'+api.escape(content.title)+'</h1><p>Le rendu 3D n’est pas disponible ici. Les mêmes destinations restent accessibles.</p><div class="fallback-destinations">'
      +'<a href="'+api.href({app:'ensemble',angle:'presentation'})+'" data-plan-fallback-app="ensemble">Vue d’ensemble</a>'+Object.entries(api.apps).map(([id,app])=>'<a href="'+api.href({app:id,angle:state.angle})+'" data-plan-fallback-app="'+id+'">'+app.name+'</a>').join('')
      +'</div><div class="fallback-destinations">'+Object.entries(ANGLES).map(([angle,label])=>'<a href="'+api.href({app:state.app,angle})+'" data-plan-fallback-angle="'+angle+'">'+label+'</a>').join('')+'</div>'
      +content.body.map(p=>'<p>'+api.escape(p)+'</p>').join('')
      +(api.apps[state.app]?'<a class="real-app-link" href="'+api.apps[state.app].url+'">Ouvrir '+api.apps[state.app].name+' ↗</a>':'')+'</section>';
    for(const anchor of viewport.querySelectorAll('[data-plan-fallback-app],[data-plan-fallback-angle]'))anchor.addEventListener('click',event=>{
      if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();
      navigate({app:anchor.dataset.planFallbackApp||state.app,angle:anchor.dataset.planFallbackAngle||state.angle},'view-title');
    });
  }
  try{world=createWorld(viewport,{reducedMotion:api.reducedMotion,onContextLost:()=>{if(!destroyed)fallback();}});}
  catch{fallback();}
  if(failed)return {update(next){state=next;fallback();},snapshot(){return null},inspect(){return {kind:'fallback',app:state.app,angle:state.angle}},destroy(){destroyed=true;world?.destroy();host.replaceChildren();host.classList.remove('plan-host');}};
  world.canvas.id='plan-canvas';
  const floor=world.box([64,.45,52],'#e0dfd0',[0,-.4,1]);
  world.box([64,.12,.12],'#a79561',[0,-.1,27]);world.box([.12,.12,52],'#a79561',[-32,-.1,1]);
  for(let x=-28;x<=28;x+=4)world.box([.025,.025,48],'#d1d1c5',[x,-.15,1]);
  for(let z=-20;z<=24;z+=4)world.box([60,.025,.025],'#d1d1c5',[0,-.15,z]);
  const appMeshes={};
  const brass='#c8b477',graphite='#172923',porcelain='#f2efe3';
  function plate(size,position,color=porcelain){return world.box(size,color,position);}
  // Finapp is a pair of relief trajectories, rather than a building containing a chart.
  plate([20,.5,19],[-16,0,-8]);
  const roadA=[[-23,.6,-1],[-21,.8,-5],[-19,1.2,-9],[-16,1.5,-14],[-13,2.6,-17]];
  const roadB=[[-23,.6,-1],[-17,.7,-4],[-13,.8,-8],[-10,1,-13],[-7,1.3,-17]];
  const trackA=world.line(roadA,api.apps.finapp.color,.25),trackB=world.line(roadB,'#93a7e8',.25);
  appMeshes.finapp=trackA;world.addPick(trackA,()=>navigate({app:'finapp',angle:'action'},'view-title'));
  world.addPick(trackB,()=>navigate({app:'finapp',angle:'action'},'view-title'));
  for(let index=1;index<roadA.length;index++){
    const a=roadA[index],b=roadB[index];world.line([[a[0],.57,a[2]],[b[0],.57,b[2]]],brass,.035);
    const post=world.box([.1,a[1],.1],brass,[a[0],a[1]/2,a[2]]);world.addPick(post,()=>navigate({app:'finapp',angle:'methode'},'view-title'));
  }
  const horizon=world.box([15,.08,.12],graphite,[-14,1,-17.8]);world.addPick(horizon,()=>navigate({app:'finapp',angle:'action'},'view-title'));
  world.box([2,.6,2],graphite,[-23,.4,-1]);
  for(let i=0;i<5;i++)world.box([.13,.2,1],brass,[-24+i*.45,.85,-1]);

  // Garapp is a vehicle with a physical loop of dated traces around it.
  plate([19,.5,18],[13,0,-7]);
  const car=new THREE.Group();car.position.set(13,.6,-7);world.scene.add(car);car.rotation.y=-.25;
  world.box([5,1.05,2.45],'#d9785a',[0,.85,0],car);
  world.box([2.8,.95,2.12],porcelain,[-.15,1.8,0],car);
  world.box([2.1,.63,2.15],graphite,[-.15,1.94,0],car);
  world.box([.14,.85,2.2],porcelain,[-.2,1.8,0],car);
  world.box([4.7,.18,2.6],graphite,[0,.37,0],car);
  for(const x of [-1.62,1.62])for(const z of [-1.3,1.3]){
    const tire=world.mesh(new THREE.CylinderGeometry(.63,.63,.36,20),graphite,[x,.48,z],car);tire.rotation.x=Math.PI/2;
    const hub=world.mesh(new THREE.CylinderGeometry(.28,.28,.38,14),brass,[x,.48,z],car);hub.rotation.x=Math.PI/2;
  }
  appMeshes.garapp=car;world.addPick(car,()=>navigate({app:'garapp',angle:'presentation'},'view-title'));
  const ring=[];for(let i=0;i<=40;i++){const t=i/40*Math.PI*2;ring.push([13+Math.cos(t)*7,.65,-7+Math.sin(t)*6]);}
  world.line(ring,brass,.09);
  const dates=[[-1.8,'12 mars'],[-.4,'24 avril'],[1,'9 juin'],[2.3,'17 sept.']];
  for(const [t,date]of dates){
    const x=13+Math.cos(t)*7,z=-7+Math.sin(t)*6;
    const marker=world.box([1.25,.35,1.7],api.apps.garapp.color,[x,.9,z]);marker.rotation.y=-t;
    world.addPick(marker,()=>navigate({app:'garapp',angle:'action'},'view-title'));
    const caption=button('plan-record-'+date.replace(/\W/g,''),date,'world-small-stop');
    caption.addEventListener('click',()=>navigate({app:'garapp',angle:'action'},'view-title'));
    world.label([x,1.5,z],caption,{clamp:false});
  }
  for(let i=0;i<4;i++){const page=plate([1.6,.13,2.2],[19,1+i*.18,-7+i*.18],i%2?porcelain:brass);page.rotation.y=.12*i;}

  // Branchlab is a complete, visible source-port-cable-screen chain.
  plate([23,.5,12],[1,0,15]);
  const source=world.box([3,3.3,3.6],graphite,[-7,1.8,15]);
  world.box([.06,2.5,2.5],'#9ba69c',[-8.54,1.85,15]);
  for(let i=0;i<3;i++)world.box([.05,.12,1.7],brass,[-8.58,1.15+i*.45,15]);
  const port=world.box([.5,.45,.8],brass,[-5.4,2,15]);
  const cablePoints=[[-5.3,2,15],[-3.7,.6,16.3],[-.4,.65,13.6],[2.8,.65,15.7],[5.8,2.2,15]];
  const cable=world.line(cablePoints,api.apps.branchlab.color,.17);
  appMeshes.branchlab=cable;world.addPick(cable,()=>navigate({app:'branchlab',angle:'action'},'view-title'));
  world.addPick(source,()=>navigate({app:'branchlab',angle:'methode'},'view-title'));
  world.addPick(port,()=>navigate({app:'branchlab',angle:'methode'},'view-title'));
  const screen=world.box([.5,5.5,8],graphite,[7,3.4,15]);screen.rotation.y=-.08;
  const screenGlass=world.box([.08,4.8,7.25],'#a7b8bf',[6.7,3.4,15]);screenGlass.rotation.y=-.08;
  world.box([.45,1.3,.7],brass,[7,.9,15]);world.box([2.2,.2,4.6],graphite,[7,.35,15]);
  world.addPick(screen,()=>navigate({app:'branchlab',angle:'limites'},'view-title'));
  const signal=world.mesh(new THREE.SphereGeometry(.24,12,8),'#fff5ac',cablePoints[0]);signals.push(signal);
  const cableCurve=new THREE.CatmullRomCurve3(cablePoints.map(p=>new THREE.Vector3(...p)));

  // An unassigned piece of the same floor is explicitly space for future work.
  for(let i=0;i<3;i++)plate([4,.15,.1],[-19+i*1.5,.01,17+i*1.4],brass);
  const future=document.createElement('span');future.className='world-future';future.textContent='Une place pour la suite';
  world.label([-17,.5,20],future,{clamp:false});

  const appLabels=[];
  for(const [id,point]of Object.entries(CENTRES)){
    const element=document.createElement('div');element.className='world-station station-'+id;
    const enter=button('plan-app-'+id,api.apps[id].name,'world-station-name');
    enter.addEventListener('click',()=>navigate({app:id,angle:'presentation'},'view-title'));
    const open=document.createElement('a');open.href=api.apps[id].url;open.textContent='Ouvrir ↗';open.setAttribute('aria-label','Ouvrir '+api.apps[id].name+' sur son site');
    element.append(enter,open);appLabels.push(world.label([point[0],4,point[2]],element,{clamp:false}));
  }
  for(const [angle,label]of Object.entries(ANGLES)){
    const element=button('plan-angle-'+angle,label,'world-angle-stop');
    element.addEventListener('click',()=>navigate({app:state.app,angle},'view-title'));
    angleLabels.push({angle,handle:world.label([0,0,0],element,{clamp:false})});
  }
  const reading=document.createElement('article');reading.className='world-reading';
  const readingLabel=world.label([-10,5,11],reading,{clamp:true,bottom:150});
  function drawReading(){
    const c=api.content(state.app,state.angle);
    reading.classList.toggle('is-global',state.app==='ensemble');reading.className='world-reading world-label '+(state.app==='ensemble'?'is-global':'reading-'+state.app);
    const compact=viewport.clientWidth<760,global=state.app==='ensemble';
    const body=c.body.map(p=>'<p>'+api.escape(p)+'</p>').join('');
    const facts=c.facts?.length?'<dl>'+c.facts.map(f=>'<div><dt>'+api.escape(f.label)+'</dt><dd>'+api.escape(f.value)+'</dd></div>').join('')+'</dl>':'';
    reading.innerHTML='<p class="scene-kicker">'+api.escape(c.eyebrow)+'</p><h1 id="view-title" tabindex="-1">'+api.escape(c.title)+'</h1>'
      +(global?body+'<p class="world-fiction">Maquette fictive · les applications restent des sites distincts.</p>'
        :'<details class="plan-reading" id="plan-reading"'+(compact?'':' open')+'><summary id="plan-read-more">Lire l’explication</summary>'+body+facts+'</details><a class="real-app-link" id="plan-open" href="'+api.apps[state.app].url+'">Ouvrir '+api.apps[state.app].name+' ↗</a>');
    reading.querySelector('details')?.addEventListener('toggle',()=>{world.requestRender();api.saveView();});
    for(const item of angleLabels){
      item.handle.setEnabled(state.app!=='ensemble');
      if(state.app!=='ensemble')item.handle.setPosition(POINTS[state.app][item.angle]);
      item.handle.element.setAttribute('aria-pressed',String(item.angle===state.angle));
    }
  }
  let pointerStart=null,lastPointer=null,activePointer=null;
  const pointerTrace=[];
  const tracePointer=event=>{pointerTrace.push({type:event.type,id:event.pointerId,button:event.button,buttons:event.buttons,activePointer,moved:tracker.moved,x:event.clientX,y:event.clientY});if(pointerTrace.length>24)pointerTrace.shift();};
  const tracker=dragTracker(6);
  function manual(pose){world.cancelFlight();world.setPose(pose);saved=false;}
  const down=event=>{tracePointer(event);if(event.button!==0||activePointer!==null)return;activePointer=event.pointerId;pointerStart=lastPointer=[event.clientX,event.clientY];tracker.start(...pointerStart);world.canvas.setPointerCapture(event.pointerId);world.cancelFlight();};
  const move=event=>{
    tracePointer(event);
    if(!lastPointer||event.pointerId!==activePointer)return;
    const didMove=tracker.move(event.clientX,event.clientY);
    if(didMove){const dx=event.clientX-lastPointer[0],dy=event.clientY-lastPointer[1];manual(event.shiftKey?panPose(world.getPose(),-dy*.055,dx*.055):orbitPose(world.getPose(),-dx*.005,-dy*.004));dragging=true;}
    lastPointer=[event.clientX,event.clientY];
  };
  const up=event=>{
    tracePointer(event);
    if(!lastPointer||event.pointerId!==activePointer)return;activePointer=null;const wasDrag=tracker.end();lastPointer=null;pointerStart=null;dragging=false;
    if(world.canvas.hasPointerCapture(event.pointerId))world.canvas.releasePointerCapture(event.pointerId);
    if(wasDrag){api.saveView();saved=true;}else{lastPick={phase:'pointerup',client:[event.clientX,event.clientY]};try{lastPick.before=world.probe(event.clientX,event.clientY);lastPick.result=world.pick(event.clientX,event.clientY);lastPick.phase='done';}catch(error){lastPick.error=error.message;throw error;}}
  };
  const cancel=event=>{tracePointer(event);if(event.pointerId!==activePointer)return;activePointer=null;tracker.end();lastPointer=null;pointerStart=null;dragging=false;if(world.canvas.hasPointerCapture(event.pointerId))world.canvas.releasePointerCapture(event.pointerId);api.saveView();};
  const wheel=event=>{event.preventDefault();manual(zoomPose(world.getPose(),Math.exp(event.deltaY*.0009)));api.saveView();};
  const key=event=>{
    if(event.target!==world.canvas)return;let pose=world.getPose(),handled=true;
    if(event.key==='ArrowLeft')pose=orbitPose(pose,-.1,0);
    else if(event.key==='ArrowRight')pose=orbitPose(pose,.1,0);
    else if(event.key==='ArrowUp'||event.key.toLowerCase()==='w')pose=panPose(pose,1,0);
    else if(event.key==='ArrowDown'||event.key.toLowerCase()==='s')pose=panPose(pose,-1,0);
    else if(event.key.toLowerCase()==='a')pose=panPose(pose,0,-1);
    else if(event.key.toLowerCase()==='d')pose=panPose(pose,0,1);
    else if(event.key==='+')pose=zoomPose(pose,.9);
    else if(event.key==='-')pose=zoomPose(pose,1.1);
    else handled=false;
    if(handled){event.preventDefault();manual(pose);api.saveView();}
  };
  function control(action){
    const pose=world.getPose();
    manual(action==='in'?zoomPose(pose,.84):action==='out'?zoomPose(pose,1.16):
      panPose(pose,action==='forward'?1.5:action==='back'?-1.5:0,action==='left'?-1.5:action==='right'?1.5:0));
    api.saveView();
  }
  for(const element of hud.querySelectorAll('[data-move]'))element.addEventListener('click',()=>control(element.dataset.move));
  for(const [name,fn,options]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['wheel',wheel,{passive:false}],['keydown',key]]){
    world.canvas.addEventListener(name,fn,options);cleanups.push(()=>world.canvas.removeEventListener(name,fn,options));
  }
  async function update(next,{snapshot=null,instant=false}={}){
    const token=++updateGeneration;state=next;if(failed){fallback();return;}drawReading();
    const global=state.app==='ensemble';
    const portrait=viewport.clientWidth<760;
    const base=global?(portrait?MOBILE_INITIAL:INITIAL):VIEWS[state.app][state.angle];
    const centre=global?null:[CENTRES[state.app][0],.8,CENTRES[state.app][2]];
    const direction=base.position.map((n,i)=>n-base.target[i]),length=Math.hypot(...direction);
    const view=!global&&portrait?{target:centre,position:centre.map((n,i)=>n+direction[i]/length*39)}:base;
    // The reading stand travels with its region; it is never an unrelated page below the world.
    const point=global?[-10,5,10]:POINTS[state.app][state.angle];
    readingLabel.setPosition(portrait&&!global?[centre[0],18,centre[2]]:[point[0]+(global?0:5),point[1]+3.5,point[2]+3]);
    if(typeof snapshot?.readingOpen==='boolean'&&reading.querySelector('details'))reading.querySelector('details').open=snapshot.readingOpen;
    if(snapshot?.pose){world.setPose(snapshot.pose);}
    else await world.flyTo(view,{instant});
    if(token!==updateGeneration)return;
    if(state.app==='branchlab'&&state.angle==='action'){
      await world.animate(850,t=>{signal.position.copy(cableCurve.getPoint(t));});
    }
    world.requestRender();
  }
  drawReading();world.setPose(INITIAL);world.requestRender();
  return {update,snapshot:()=>({pose:world.getPose(),readingOpen:Boolean(reading.querySelector('details')?.open)}),inspect:()=>({...world.inspect(),app:state.app,angle:state.angle,dragging,historySaved:saved,lastPick,pointerTrace:[...pointerTrace],
      stations:Object.keys(CENTRES),pickTargets:[...[[0,1.1,0],[0,.45,1.18],[0,.45,-1.18],[2.3,.6,0],[-2.3,.6,0]].map(point=>({app:'garapp',angle:'presentation',screen:world.project(car.localToWorld(new THREE.Vector3(...point))),probe:(()=>{const p=world.project(car.localToWorld(new THREE.Vector3(...point)));return world.probe(p.x,p.y);})()})),{app:'branchlab',angle:'methode',screen:world.project(source.position)},{app:'finapp',angle:'action',screen:world.project(new THREE.Vector3(...roadA[2]))}],signalPosition:signal.position.toArray()}),
    destroy(){destroyed=true;for(const fn of cleanups)fn();world.destroy();host.replaceChildren();host.classList.remove('plan-host');}};
}
