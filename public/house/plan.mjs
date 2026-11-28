import { createWorld, THREE } from './world.mjs';
import { createPlanReader } from './plan-reader.mjs';
import { orbitPose, zoomPose, dragTracker } from './camera-math.mjs';
import { buildHouse } from './house-scene.mjs';
import { createHouseInteractions } from './house-interactions.mjs';
import { createOfficeDesktop } from './office-desktop.mjs';
import { createGarageScreen } from './garage-screen.mjs';
import { createGamingLibrary } from './gaming-library.mjs';
import { EYE_HEIGHT, canStand, segmentClear, stepOnFloor, lookOnFloor, blendLook, floorPath, pointAlong } from './house-navigation.mjs';

const APPROACH={position:[-2.3,EYE_HEIGHT,5.7],target:[-2.3,EYE_HEIGHT,1.8]};
const STREET_VIEW={position:APPROACH.position,target:[-15,1.45,25]};
const BUREAU={position:[-2.85,EYE_HEIGHT,2.7],target:[-2.85,1.5,-2.6]};
const OVERVIEW={position:[11,7,24],target:[-3,1.5,1.5]};
const MOBILE_OVERVIEW={position:[18,9.2,26],target:[-5,0,0]};
const GARAGE_PASSAGE={position:[1.65,EYE_HEIGHT,1.65],target:[3.1,1,-.3]};
const CAR_VIEW={position:[1.75,EYE_HEIGHT,4.9],target:[2.73,1.05,1.07]};
const GARAGE_DESTINATION={app:'ensemble',room:'garage'};
const button=(id,label,className='')=>{const b=document.createElement('button');b.type='button';b.id=id;b.textContent=label;b.className=className;return b;};
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);

export function mountPlan(host,initialState,api){
  host.classList.add('plan-host','plan-house');
  const viewport=document.createElement('div');viewport.className='plan-viewport';host.append(viewport);
  const hud=document.createElement('div');hud.className='plan-controls house-hud';
  hud.innerHTML='<h1 id="view-title" class="house-sr" tabindex="-1">La maison Siniverse</h1><div class="plan-compass"><span class="compass-name" id="plan-location">Devant la maison</span><button id="plan-origin" type="button">↙ La maison</button><button id="plan-enter-house" type="button">Entrer</button><button id="plan-cutaway" type="button" aria-pressed="false">Voir en coupe</button><details><summary>Trajets directs</summary><div class="plan-direct-routes"></div></details></div><div class="plan-movement" aria-label="Déplacement au sol"><button id="plan-forward" data-move="forward" aria-label="Avancer">↑</button><button data-move="left" aria-label="Pas à gauche">←</button><button data-move="back" aria-label="Reculer">↓</button><button data-move="right" aria-label="Pas à droite">→</button><button id="plan-zoom-in" data-move="in" aria-label="Avancer vers le poste">+</button><button data-move="out" aria-label="Reculer du poste">−</button></div>';
  host.append(hud);
  const introduction=document.createElement('aside');introduction.className='house-intro';introduction.innerHTML='<p>DES OUTILS. DES JEUX. UN LIEU.</p><h2>Bienvenue<br>chez Siniverse.</h2><p>Bureau, garage et salle gaming.<br>À chaque projet, sa pièce.</p>';host.append(introduction);
  const instruction=document.createElement('p');instruction.className='plan-instruction';instruction.textContent='Entrer, puis glisser pour regarder · W A S D / flèches pour marcher';host.append(instruction);
  let state=initialState,world,house,failed=false,destroyed=false,mode='overview',roofOpen=false,revision=0,dragging=false,lastPick=null,lastJourney=[],blockedMoves=0;
  let reader=null,demos=null,previewPanel=null,previewApp=null,previewPhase='hover',previewRevision=0,pendingOpen=false,sourceFocus='plan-canvas',returnPose=null,closingTask=null;
  const cleanups=[],stationLabels=[],tracker=dragTracker(6);let gamingEntryLabel=null,entranceLabel=null;
  const navigate=(destination,focusId='view-title')=>api.navigate(destination,{focusId});
  const isMobile=()=>viewport.clientWidth<760;
  const gamingLibrary=createGamingLibrary(host,{escape:api.escape,onChange:()=>api.saveView()});
  const officeDesktop=createOfficeDesktop(host,api,{onLaunch:program=>openOffice(program),onExit:()=>{
    officeDesktop.close({save:false,focus:false});
    if(!failed){updateLocation();world.refresh();(visibleElement('plan-office-screen')||world.canvas).focus({preventScroll:true});}
    else viewport.querySelector('#plan-fallback-office')?.focus({preventScroll:true});
    api.saveView();
  },onChange:()=>api.saveView()});
  const garageScreen=createGarageScreen(host,api,{onExit:()=>{
    garageScreen.close({save:false,focus:false});
    if(failed)viewport.querySelector('#plan-fallback-garage')?.focus({preventScroll:true});
    else{
      updateLocation();world.refresh();
      (visibleElement('plan-garage-screen')||world.canvas).focus({preventScroll:true});
    }
    api.saveView();
  },onChange:()=>api.saveView()});
  function openGarage(){return navigate(GARAGE_DESTINATION,'garage-screen-title');}

  function fallback(){
    host.dataset.room='house';officeDesktop.fallback();garageScreen.fallback();
    failed=true;demos?.close({instant:true});if(previewPanel)previewPanel.hidden=true;host.classList.add('plan-is-fallback');hud.querySelector('h1').removeAttribute('id');hud.hidden=true;introduction.hidden=true;instruction.hidden=true;viewport.replaceChildren();
    const content=api.content(state.app);
    viewport.innerHTML='<section class="plan-fallback"><p class="scene-kicker">LA MAISON / PARCOURS SANS WEBGL</p><h1 id="view-title" tabindex="-1">'+api.escape(content.title)+'</h1><p>Le lieu 3D n’est pas disponible ici. Les mêmes outils et explications restent accessibles.</p><div class="fallback-destinations"><a href="'+api.href({app:'ensemble',room:undefined})+'" data-plan-fallback-app="ensemble">La maison</a>'+Object.entries(api.apps).map(([id,app])=>'<a href="'+api.href({app:id})+'" data-plan-fallback-app="'+id+'">'+app.name+'</a>').join('')+'</div>'+content.body.map(p=>'<p>'+api.escape(p)+'</p>').join('')+(api.apps[state.app]?'<a class="real-app-link" href="'+api.apps[state.app].url+'">Ouvrir '+api.apps[state.app].name+' ↗</a>':'')+'</section>';
    for(const a of viewport.querySelectorAll('[data-plan-fallback-app]'))a.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate({app:a.dataset.planFallbackApp||state.app,room:undefined});});
    const officeButton=button('plan-fallback-office','Le PC du bureau');officeButton.addEventListener('click',()=>openOffice());viewport.querySelector('.fallback-destinations').append(officeButton);
    const garageButton=button('plan-fallback-garage','L’écran Garapp du garage');garageButton.addEventListener('click',openGarage);viewport.querySelector('.fallback-destinations').append(garageButton);
    const launch=state.app==='garapp'&&viewport.querySelector('.real-app-link');
    if(launch){
      launch.href=api.href(GARAGE_DESTINATION);launch.textContent='Ouvrir Garapp dans le garage';
      launch.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();openGarage();});
    }
    const gamesButton=button('plan-fallback-gaming','La bibliothèque de jeux');gamesButton.addEventListener('click',()=>gamingLibrary.open());viewport.querySelector('.fallback-destinations').append(gamesButton);
    if(pendingOpen&&state.room==='garage')garageScreen.open({expanded:true});
  }
  try{world=createWorld(viewport,{cartoon:true,minCameraHeight:EYE_HEIGHT,minCameraDistance:.4,mobileFov:78,desktopFov:50,pixelBudget:2400000,reducedMotion:api.reducedMotion,onContextLost:()=>{if(!destroyed)fallback();}});}
  catch{fallback();}
  if(failed)return {
    update(next,{snapshot}={}){
      state=next;fallback();
      if(state.room==='office')officeDesktop.open({program:state.program,expanded:true});
      else officeDesktop.close({save:false,focus:false});
      if(state.room==='garage'&&snapshot?.garage?.open!==false)garageScreen.open({expanded:true});
      else garageScreen.close({save:false,focus:false});
    },
    snapshot:()=>({office:officeDesktop.snapshot(),garage:garageScreen.snapshot()}),
    inspect:()=>({kind:'fallback',app:state.app,office:officeDesktop.inspect(),garage:garageScreen.inspect()}),
    destroy(){destroyed=true;garageScreen.destroy();officeDesktop.destroy();gamingLibrary.destroy();world?.destroy();host.replaceChildren();host.classList.remove('plan-host','plan-house');}
  };
  world.canvas.id='plan-canvas';world.canvas.setAttribute('aria-label','La maison Siniverse. Glisser pour regarder. W A S D ou flèches pour marcher ; les murs et le véhicule arrêtent le déplacement.');
  house=buildHouse(world,api.apps);officeDesktop.attach(world,house.office.surface);gamingLibrary.attach(world,house.gaming.surface);
  garageScreen.attach(world,house.garage.surface);
  const garagePose=()=>house.garage.cameraForViewport(world.camera.aspect,world.camera.fov);
  const garageResize=new ResizeObserver(()=>{
    if(!failed&&garageScreen.isOpen())setPose(garagePose());
  });
  garageResize.observe(viewport);
  cleanups.push(()=>garageResize.disconnect());
  const supports={...house.screens,garapp:house.car};
  const obstacles=house.obstacles,bounds=house.bounds;
  const setPose=pose=>{world.setPose(pose);updateLocation();};
  function updateLocation(){
    const p=world.getPose().position,inside=p[0]>-5.3&&p[0]<5.3&&p[2]>-3.6&&p[2]<3.6;
    const gaming=p[0]>-9.65&&p[0]<-5.19&&p[2]>-3.6&&p[2]<3.6;
    const outside=mode==='overview'||(!inside&&!gaming);
    const streetVisible=outside&&!roofOpen&&state.app==='ensemble'&&(!state.room||state.room==='street');
    world.setAmbientMotion(streetVisible?house.updateAmbient:null);
    host.dataset.room=gaming&&mode==='walk'?'gaming':'house';
    gamingEntryLabel?.setPosition([-7.45,isMobile()?5.2:2.46,3.83]);gamingEntryLabel?.setEnabled(!(mode==='overview'&&roofOpen));
    entranceLabel?.setEnabled(!(mode==='overview'&&roofOpen));
    hud.querySelector('#plan-location').textContent=mode==='overview'?'La maison / vue d’ensemble':gaming?'Dans la salle gaming':inside?(p[0]<.8?'Dans le bureau':'Dans le garage'):'Devant la maison';
    introduction.hidden=mode!=='overview'||state.app!=='ensemble';hud.querySelector('#plan-enter-house').hidden=mode==='walk';
    hud.querySelector('#plan-gaming-room').hidden=mode==='overview';
    for(const station of stationLabels){const separated=mode==='overview'&&roofOpen&&station.id!=='garapp';station.handle.setEnabled(!garageScreen.isOpen()&&(!reader?.isOpen()||station.id!==reader.app())&&station.id!==demos?.active()&&!(station.id==='office'&&officeDesktop.isOpen()));station.handle.setPosition(separated?station.cutPosition:station.position);if(station.guide)station.guide.visible=separated;}
  }
  function setRoof(open,{instant=false}={}){roofOpen=open;void house.setCutaway(open,{instant});hud.querySelector('#plan-cutaway').setAttribute('aria-pressed',String(open));hud.querySelector('#plan-cutaway').textContent=open?'Remettre le toit':'Voir en coupe';updateLocation();world.requestRender();}
  hud.querySelector('#plan-cutaway').addEventListener('click',()=>{setPreview(null);setRoof(!roofOpen);api.saveView();});
  const gamingButton=button('plan-gaming-room','Salle gaming');gamingButton.hidden=true;gamingButton.addEventListener('click',()=>navigate({app:'ensemble',room:'gaming'}));hud.querySelector('.plan-compass').insertBefore(gamingButton,hud.querySelector('.plan-compass details'));
  const gamingRoute=button('plan-direct-gaming','Salle gaming / jeux');gamingRoute.addEventListener('click',()=>{hud.querySelector('.plan-compass details').open=false;navigate({app:'ensemble',room:'gaming'});});hud.querySelector('.plan-direct-routes').append(gamingRoute);
  const streetRoute=document.createElement('a');
  const streetDestination={app:'ensemble',room:'street'};
  streetRoute.id='plan-direct-street';streetRoute.textContent='La rue depuis le seuil';streetRoute.href=api.href(streetDestination);
  streetRoute.addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    hud.querySelector('.plan-compass details').open=false;
    navigate(streetDestination,'plan-canvas');
  });
  hud.querySelector('.plan-direct-routes').append(streetRoute);
  const officeRoute=button('plan-direct-office','Le PC / Finapp et Branchlab');officeRoute.addEventListener('click',()=>{hud.querySelector('.plan-compass details').open=false;openOffice();});hud.querySelector('.plan-direct-routes').append(officeRoute);
  for(const [id,app]of Object.entries(api.apps)){
    const link=document.createElement('a');link.id='plan-direct-'+id;link.href=api.href(id==='garapp'?GARAGE_DESTINATION:{app:'ensemble',room:'office',program:id});link.textContent=app.name+' / '+(id==='garapp'?'écran du garage':'le PC');link.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();hud.querySelector('.plan-compass details').open=false;if(id==='garapp')openGarage();else openOffice(id);});hud.querySelector('.plan-direct-routes').append(link);
    if(id!=='garapp')continue;
    const station=button('plan-app-'+id,'Découvrir Garapp','house-station');
    station.setAttribute('aria-haspopup','dialog');station.setAttribute('aria-controls','plan-reader-dialog');
    station.addEventListener('focus',()=>setPreview(id,'focus'));station.addEventListener('pointerenter',()=>setPreview(id,'hover'));
    station.addEventListener('click',()=>openApp(id,station));
    const position=[3.1,1.8,1.6],cutPosition=position,guide=null;
    stationLabels.push({id,position,cutPosition,guide,handle:world.label(position,station,{clamp:false})});
  }
  world.addPick(house.car,openGarage,{key:'garapp'});house.car.name='voiture-garapp';
  const garageStation=button('plan-garage-screen','Écran Garapp','house-station');
  garageStation.setAttribute('aria-label','Utiliser Garapp sur le mur du garage');
  garageStation.setAttribute('aria-haspopup','dialog');garageStation.setAttribute('aria-controls','garage-screen');
  garageStation.addEventListener('click',openGarage);
  const garageLabel=house.garage.label;
  stationLabels.push({id:'garage',position:garageLabel,cutPosition:garageLabel,handle:world.label(garageLabel,garageStation,{clamp:false})});
  world.addPick(house.garage.monitor,openGarage,{key:'garage'});
  const officeStation=button('plan-office-screen','Le PC','house-station');officeStation.setAttribute('aria-label','Le PC du bureau');officeStation.setAttribute('aria-haspopup','dialog');officeStation.setAttribute('aria-controls','office-desktop');officeStation.addEventListener('click',()=>openOffice());
  const officePosition=[-2.8,2.365,-2.4],officeCutPosition=[-2.8,5.3,-2.4],officeGuide=world.line([officePosition,officeCutPosition],'#52685b',.012);officeGuide.visible=false;officeGuide.userData.pickThrough=true;
  stationLabels.push({id:'office',position:officePosition,cutPosition:officeCutPosition,guide:officeGuide,handle:world.label(officePosition,officeStation,{clamp:false})});
  for(const object of [house.office.screen,house.office.computer])world.addPick(object,()=>openOffice(),{key:'office'});
  function openOffice(program){return navigate({app:'ensemble',room:'office',program},'office-desktop-title');}
  function officePose(){return {position:[-2.8,EYE_HEIGHT,isMobile()?.35:-.25],target:[-2.8,1.62,-2.46]};}
  const entrance=button('plan-door','Entrer dans le bureau →','house-door');entrance.addEventListener('click',()=>enterHouse());entranceLabel=world.label([-2.3,1.8,3.82],entrance,{clamp:false});
  if(house.entry)world.addPick(house.entry,()=>enterHouse(),{key:'entry'});
  const gamingEntry=button('plan-gaming-entry','Salle gaming →','house-door gaming-door');gamingEntry.addEventListener('click',()=>navigate({app:'ensemble',room:'gaming'}));gamingEntryLabel=world.label([-7.45,2.46,3.83],gamingEntry,{clamp:false});
  const gamingScreen=button('plan-gaming-screen','Les jeux','house-station gaming-station');gamingScreen.setAttribute('aria-label','La bibliothèque de jeux');gamingScreen.setAttribute('aria-haspopup','dialog');gamingScreen.setAttribute('aria-controls','gaming-library');gamingScreen.addEventListener('click',openGames);
  const gamingPosition=[-7.88,2.23,-2.45],gamingCutPosition=[-12.2,2.7,-2.45],gamingGuide=world.line([gamingPosition,gamingCutPosition],'#598AA9',.012);gamingGuide.visible=false;gamingGuide.userData.pickThrough=true;
  stationLabels.push({id:'gaming',position:gamingPosition,cutPosition:gamingCutPosition,guide:gamingGuide,handle:world.label(gamingPosition,gamingScreen,{clamp:false})});
  world.addPick(house.gaming.monitor,openGames,{key:'gaming'});world.addPick(house.gaming.pc,openGames,{key:'gaming'});
  async function openGames(){if(state.room!=='gaming')await navigate({app:'ensemble',room:'gaming'},'plan-gaming-screen');if(!destroyed&&!failed&&state.room==='gaming'){gamingLibrary.open();api.saveView();}}

  previewPanel=document.createElement('aside');previewPanel.className='house-object-preview';previewPanel.hidden=true;previewPanel.setAttribute('aria-live','polite');host.append(previewPanel);
  reader=createPlanReader(host,api,{onNavigate:destination=>openApp(destination.app),onGarage:openGarage,onClose:()=>{void closeReader();},onViewChange:()=>api.saveView()});
  demos=createHouseInteractions(host,world,house,api,{onRead:(app,trigger)=>openApp(app,trigger),onExit:()=>{demos.close();updateLocation();world.canvas.focus({preventScroll:true});api.saveView();},onChange:()=>api.saveView()});
  function placePreview(){
    if(!previewApp||previewPanel.hidden)return;
    const bounds=world.projectBounds(supports[previewApp]);if(!bounds){previewPanel.hidden=true;return;}
    const r=host.getBoundingClientRect(),w=previewPanel.offsetWidth,h=previewPanel.offsetHeight;
    const x=Math.max(12,Math.min(r.width-w-12,bounds.x-r.x+bounds.width/2-w/2));
    const maxY=Math.max(12,r.height-h-150),above=bounds.y-r.y-h-16,below=bounds.y-r.y+bounds.height+14;
    // A clamped "below" card can cover the entire support on a short viewport.
    // Prefer the upper edge when neither side fits, leaving the support centre exposed.
    const y=above>=12?Math.min(maxY,above):below<=maxY?below:12;
    previewPanel.style.transform='translate('+x+'px,'+y+'px)';
  }
  function setPreview(app,phase='hover',{show=true}={}){
    if(app&&!api.apps[app])app=null;
    const same=app===previewApp;previewApp=app;previewPhase=phase;if(previewPanel)previewPanel.dataset.app=app||'';
    const token=++previewRevision,amounts=house.inspectPreview?.()||{};
    if(app&&!same){
      const lead={finapp:'Comparer des scénarios au même horizon.',garapp:'Retrouver le fil de vie d’un véhicule.',branchlab:'Comprendre une liaison, de la source à l’écran.'}[app];
      previewPanel.innerHTML='<p class="preview-room">'+(app==='garapp'?'Dans le garage':'Dans le bureau')+'</p><h2>'+api.escape(api.apps[app].name)+'</h2><p>'+lead+'</p><button id="plan-preview-try" type="button">'+(app==='garapp'?'Feuilleter le carnet':'Ouvrir sur le PC')+' <span aria-hidden="true">→</span></button><a id="plan-preview-open" href="'+api.href({app})+'" aria-haspopup="dialog">Découvrir '+api.escape(api.apps[app].name)+' <span aria-hidden="true">↗</span></a>';
      previewPanel.querySelector('button').addEventListener('click',()=>{void tryObject(app);});
      if(app==='garapp'){
        const useScreen=button('plan-preview-garage','Utiliser l’écran Garapp →');
        useScreen.addEventListener('click',openGarage);
        previewPanel.insertBefore(useScreen,previewPanel.querySelector('#plan-preview-try'));
      }
      previewPanel.querySelector('a').addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();openApp(app,event.currentTarget);});
    }
    previewPanel.hidden=!app||!show||pendingOpen||reader?.isOpen()||garageScreen.isOpen()||Boolean(demos?.active());
    if(!previewPanel.hidden)placePreview();
    if(same){for(const id of Object.keys(api.apps))house.setPreview?.(id,id===app?1:0,phase);world.requestRender();return;}
    void world.animate(api.reducedMotion?0:180,t=>{if(token!==previewRevision||destroyed)return;for(const id of Object.keys(api.apps)){const from=amounts[id]||0;house.setPreview?.(id,from+((id===app?1:0)-from)*t,phase);}});
  }
  function sourceRect(app){
    world.refresh();return world.projectBounds(app==='garapp'&&demos?.active()==='garapp'?house.record:supports[app]);
  }
  async function tryObject(app){
    if(app!=='garapp')return openOffice(app);
    garageScreen.close({save:false,focus:false});
    officeDesktop.close({save:false,focus:false});
    const token=++revision;pendingOpen=true;demos.close({instant:true});setPreview(null);lastJourney=[];
    if(app==='garapp'&&mode==='overview'){await walkTo(GARAGE_PASSAGE,{token});if(token!==revision||failed)return;}
    const s=house.surfaces[app],distance=isMobile()?2.05:1.8;
    const pose=app==='garapp'?{position:[s.position[0]+(isMobile()?1.6:1.8),EYE_HEIGHT,s.position[2]],target:s.position}
      :{position:[s.position[0],EYE_HEIGHT,s.position[2]+distance],target:s.position};
    await walkTo(pose,{token});if(token!==revision||failed)return;
    await demos.open(app);if(token!==revision||failed)return;
    pendingOpen=false;updateLocation();world.refresh();api.saveView();
  }
  function openApp(app,trigger=null){
    const sameOpen=reader.isOpen()&&reader.app()===app;
    if(!sameOpen)sourceFocus=trigger?.id||(reader.isOpen()?'plan-app-'+app:'plan-canvas');
    pendingOpen=true;setPreview(app,'opening',{show:false});
    return api.navigate({app},{focusId:'plan-reader-title'});
  }
  function visibleElement(id){
    const e=document.getElementById(id),r=e?.getBoundingClientRect();return e&&r.width>0&&r.height>0&&!e.closest('[hidden]')?e:null;
  }
  function closeReader({save=true,focus=true,instant=false,token=null}={}){
    if(closingTask&&token===null)return closingTask;
    const activeToken=token??++revision,app=reader.app();pendingOpen=false;
    const task=(async()=>{
      if(returnPose&&!failed){mode='walk';setPose(returnPose);}
      await reader.close({origin:()=>failed?null:sourceRect(app),instant:instant||failed});
      if(destroyed||activeToken!==revision)return;
      updateLocation();if(!failed){setPreview(app,'focus');world.refresh();}
      if(app==='garapp'&&!demos.active()&&!failed){const from=house.inspectObjects().notebookAmount;void world.animate(instant?0:300,t=>{if(activeToken===revision)house.setNotebook(from*(1-t));});}
      if(focus){const target=failed?viewport.querySelector('a'):visibleElement(sourceFocus)||visibleElement('plan-app-'+app)||world.canvas;target?.focus({preventScroll:true});}
      if(save)api.saveView();
    })();closingTask=task;void task.then(()=>{if(closingTask===task)closingTask=null;},()=>{if(closingTask===task)closingTask=null;});return task;
  }
  function drawWorld(){
    const roomHeadings={gaming:'La salle gaming / Les jeux du Siniverse',office:'Le PC du bureau / Finapp et Branchlab',garage:'Garapp / L’écran du garage',street:'La rue depuis le seuil'};
    hud.querySelector('#view-title').textContent=state.app==='ensemble'
      ? roomHeadings[state.room]||'La maison Siniverse'
      : api.apps[state.app].name+' / '+api.content(state.app).title;
    updateLocation();world.requestRender();
  }
  function targetPose(app){
    if(app==='garapp')return CAR_VIEW;
    const s=house.surfaces[app];return {position:[s.position[0],EYE_HEIGHT,s.position[2]+(isMobile()?2.0:2.6)],target:[s.position[0],s.position[1],s.position[2]]};
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
    garageScreen.close({save:false,focus:false});
    const token=++revision;pendingOpen=false;officeDesktop.close({save:false,focus:false});demos.close();setPreview(null);lastJourney=[];await walkTo(BUREAU,{token});if(token===revision&&!failed){api.saveView();world.canvas.focus({preventScroll:true});}
  }
  hud.querySelector('#plan-enter-house').addEventListener('click',enterHouse);
  hud.querySelector('#plan-origin').addEventListener('click',()=>navigate({app:'ensemble',room:undefined}));
  function manual(pose){revision++;pendingOpen=false;officeDesktop.close({save:false,focus:false});garageScreen.close({save:false,focus:false});demos.close();setPreview(null);world.cancelFlight();setPose(pose);}
  function moveOnFloor(forward,side){
    if(mode==='overview'){mode='walk';setPose(APPROACH);}
    const before=world.getPose(),next=stepOnFloor(before,forward,side,obstacles,bounds);
    if(Math.hypot(next.position[0]-before.position[0],next.position[2]-before.position[2])<.001)blockedMoves++;
    manual(next);api.saveView();
  }
  let activePointer=null,lastPointer=null;
  const down=event=>{if(event.button!==0||activePointer!==null)return;activePointer=event.pointerId;lastPointer=[event.clientX,event.clientY];tracker.start(...lastPointer);world.canvas.setPointerCapture(event.pointerId);};
  const move=event=>{
    if(activePointer!==event.pointerId||!lastPointer){if(activePointer===null&&event.pointerType!=='touch'&&!reader.isOpen()&&!pendingOpen){const hit=world.hit(event.clientX,event.clientY);world.canvas.style.cursor=hit?'pointer':'grab';if(api.apps[hit?.key]&&previewApp!==hit.key)setPreview(hit.key,'hover');}return;}
    if(tracker.move(event.clientX,event.clientY)){
      const dx=event.clientX-lastPointer[0],dy=event.clientY-lastPointer[1],pose=world.getPose();
      if(mode==='walk')manual(lookOnFloor(pose,-dx*.005,dy*.004));
      else{const next=orbitPose(pose,-dx*.005,-dy*.004);next.position[1]=Math.max(5,next.position[1]);manual(next);}
      dragging=true;
    }
    lastPointer=[event.clientX,event.clientY];
  };
  const up=event=>{
    if(activePointer!==event.pointerId)return;const wasDrag=tracker.end();activePointer=null;lastPointer=null;dragging=false;
    if(world.canvas.hasPointerCapture(event.pointerId))world.canvas.releasePointerCapture(event.pointerId);
    if(wasDrag){api.saveView();return;}
    const hit=world.hit(event.clientX,event.clientY);
    if(event.pointerType==='touch'&&api.apps[hit?.key]&&previewApp!==hit.key){setPreview(hit.key,'touch');lastPick='preview-'+hit.key;api.saveView();return;}
    lastPick=world.pick(event.clientX,event.clientY);if(!hit)setPreview(null);
  };
  const cancel=event=>{if(activePointer!==event.pointerId)return;tracker.end();activePointer=null;lastPointer=null;dragging=false;if(world.canvas.hasPointerCapture(event.pointerId))world.canvas.releasePointerCapture(event.pointerId);api.saveView();};
  const wheel=event=>{event.preventDefault();if(mode==='walk')moveOnFloor(event.deltaY<0?.2:-.2,0);else{const next=zoomPose(world.getPose(),Math.exp(event.deltaY*.0009));next.position[1]=Math.max(5,next.position[1]);manual(next);api.saveView();}};
  const key=event=>{
    if(event.target!==world.canvas)return;const k=event.key.toLowerCase();if(k==='escape'){setPreview(null);return;}
    if(['arrowup','w','arrowdown','s','a','d'].includes(k)){event.preventDefault();moveOnFloor(k==='arrowup'||k==='w'?.2:k==='arrowdown'||k==='s'?-.2:0,k==='a'?-.2:k==='d'?.2:0);}
    else if(k==='arrowleft'||k==='arrowright'){event.preventDefault();if(mode==='walk')manual(lookOnFloor(world.getPose(),k==='arrowleft'?.1:-.1,0));else{const p=orbitPose(world.getPose(),k==='arrowleft'?-.1:.1,0);p.position[1]=Math.max(5,p.position[1]);manual(p);}api.saveView();}
  };
  for(const b of hud.querySelectorAll('[data-move]'))b.addEventListener('click',()=>{const a=b.dataset.move;moveOnFloor(a==='forward'||a==='in'?.25:a==='back'||a==='out'?-.25:0,a==='left'?-.25:a==='right'?.25:0);});
  for(const [name,fn,options]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['wheel',wheel,{passive:false}],['keydown',key]]){world.canvas.addEventListener(name,fn,options);cleanups.push(()=>world.canvas.removeEventListener(name,fn,options));}
  async function update(next,{snapshot=null,instant=false}={}){
    const token=++revision,previousApp=state.app,restored=snapshot?.layout==='house-v2',keepOffice=officeDesktop.isOpen()&&next.app==='ensemble'&&next.room==='office';
    const keepGarage=garageScreen.isOpen()&&next.room==='garage';
    if(!keepGarage)garageScreen.close({save:false,focus:false});
    if(!keepOffice)officeDesktop.close({save:false,focus:false});
    if(gamingLibrary.isOpen())gamingLibrary.close({save:false,focus:false});
    const wantsReader=next.app!=='ensemble'&&(!restored||snapshot.readerOpen===true);
    if(reader.isOpen()&&(!wantsReader||reader.app()!==next.app)){
      await closeReader({save:false,focus:false,token});if(token!==revision||destroyed)return;
    }
    state=next;if(failed){
      pendingOpen=false;fallback();
      if(wantsReader)await reader.open({app:state.app,origin:()=>null,instant:true,scrollTop:snapshot?.readerScroll||0});
      else if(state.room==='office')officeDesktop.open({program:state.program,expanded:true});
      else if(state.room==='garage'&&snapshot?.garage?.open!==false)garageScreen.open({expanded:true});
      else garageScreen.close({save:false,focus:false});
      return;
    }
    if(demos.active()&&(!restored?demos.active()!==state.app:!snapshot.demo))demos.close({instant});
    if(state.app!=='garapp'&&demos.active()!=='garapp')house.setNotebook(0);
    if(restored){roofOpen=Boolean(snapshot.roofOpen);sourceFocus=snapshot.sourceFocus||'plan-canvas';}
    drawWorld();setRoof(roofOpen,{instant:instant||restored});lastJourney=[];
    if(restored&&snapshot.pose&&['walk','overview'].includes(snapshot.mode)){
      const p=snapshot.pose.position;
      if(snapshot.mode==='overview'||canStand([p[0],p[2]],obstacles,bounds)){
        mode=snapshot.mode;setPose(snapshot.pose);returnPose=snapshot.returnPose||snapshot.pose;
        if(snapshot.demo&&api.apps[snapshot.demo.app])await demos.open(snapshot.demo.app,{instant:true,focus:false,snapshot:snapshot.demo});
        if(token!==revision||failed)return;
        if(wantsReader){pendingOpen=true;if(state.app==='garapp')house.setNotebook(1);setPreview(state.app,'opening',{show:false});await reader.open({app:state.app,origin:()=>sourceRect(state.app),instant,scrollTop:snapshot.readerScroll||0});}
        else setPreview(snapshot.previewApp||null,'focus');
        if(state.room==='gaming'&&snapshot.gamingOpen)gamingLibrary.open({focus:false});
        if(state.room==='office'&&snapshot.office?.open)officeDesktop.open({program:state.program,expanded:snapshot.office.expanded,focus:false});
        else if(state.room==='office')officeDesktop.close({save:false,focus:false});
        if(state.room==='garage'&&snapshot.garage?.open){
          setPose(garagePose());
          garageScreen.open({expanded:snapshot.garage.expanded,focus:false});
        }
        else if(state.room==='garage')garageScreen.close({save:false,focus:false});
        pendingOpen=false;updateLocation();return;
      }
    }
    if(state.app!=='ensemble'){
      if(!reader.isOpen()){
        pendingOpen=true;setPreview(state.app,'opening',{show:false});
        if(!instant&&state.app==='garapp'&&(previousApp!=='garapp'||mode==='overview')){
          await walkTo(GARAGE_PASSAGE,{token});if(token!==revision||failed)return;
        }
        if(demos.active()!==state.app)await walkTo(targetPose(state.app),{instant,token});if(token!==revision||failed)return;
        returnPose=world.getPose();window.scrollTo({left:0,top:0,behavior:'instant'});
      }
      if(state.app==='garapp'&&house.inspectObjects().notebookAmount<1){const from=house.inspectObjects().notebookAmount;await world.animate(instant?0:480,t=>{if(token===revision)house.setNotebook(from+(1-from)*t);});if(token!==revision||failed)return;}
      await reader.open({app:state.app,origin:()=>sourceRect(state.app),instant});pendingOpen=false;
    }else if(state.room==='office'){
      pendingOpen=true;setPreview(null);
      if(!keepOffice)await walkTo(officePose(),{instant,token});
      if(token!==revision||failed)return;
      officeDesktop.open({program:state.program,expanded:keepOffice?officeDesktop.isExpanded():undefined,focus:false});pendingOpen=false;
    }else if(state.room==='garage'){
      pendingOpen=true;setPreview(null);
      if(!keepGarage)await walkTo(garagePose(),{instant,token});
      if(token!==revision||failed)return;
      setPose(garagePose());
      garageScreen.open({focus:false});pendingOpen=false;
    }else if(state.room==='street'){
      if(roofOpen)setRoof(false,{instant});
      setPreview(null);await walkTo(STREET_VIEW,{instant,token});
    }else if(state.room==='gaming'){
      pendingOpen=true;setPreview(null);await walkTo(isMobile()?{position:[-7.4,EYE_HEIGHT,1.5],target:[-7.4,1.5,-2.5]}:house.gaming.view,{instant,token});
      if(token!==revision||failed)return;pendingOpen=false;setPreview(null);
    }else{
      pendingOpen=false;setPreview(null);
      if(mode==='walk')await walkTo(APPROACH,{instant,token});
      if(token!==revision||failed)return;mode='overview';await interpolatePose(isMobile()?MOBILE_OVERVIEW:OVERVIEW,instant?0:650,token);
    }
    if(token!==revision||failed)return;drawWorld();world.requestRender();
  }
  function pickInfo(app,point){const screen=world.project(point);return {app,screen,blocker:world.probe(screen.x,screen.y).intersections[0]?.name||null,occluded:!world.visiblePoint(point)};}
  return {
    update,
    snapshot:()=>({layout:'house-v2',mode,pose:world.getPose(),roofOpen,gamingOpen:gamingLibrary.isOpen(),
      office:officeDesktop.snapshot(),garage:garageScreen.snapshot(),readerOpen:reader.isOpen(),
      readerScroll:reader.scrollTop(),sourceFocus,returnPose,previewApp,demo:demos.snapshot()}),
    inspect:options=>({...world.inspect(options),layout:'house-v2',mode,
      room:mode==='overview'?'outside':world.getPose().position[0]<-5.19?'gaming':world.getPose().position[0]<.8?'bureau':'garage',
      app:state.app,roofOpen,dragging,lastPick,previewApp,previewPhase,preview:house.inspectPreview?.(),reader:reader.inspect(),
      demo:demos.inspect(),objects:house.inspectObjects(),construction:options?.fast?null:house.inspectConstruction(),
      gaming:{open:gamingLibrary.isOpen()},office:officeDesktop.inspect(),garage:garageScreen.inspect(),blockedMoves,
      journey:lastJourney,journeyClear:lastJourney.slice(1).every((p,i)=>segmentClear([lastJourney[i][0],lastJourney[i][2]],[p[0],p[2]],obstacles,bounds)),
      obstacles,bounds,stations:Object.keys(api.apps),
      pickTargets:options?.fast?[]:[
        ...[[0,.75,1.95],[-.8,.7,.9],[.8,.7,.9]].map(p=>pickInfo('garapp',house.car.localToWorld(new THREE.Vector3(...p)))),
        pickInfo('garage',new THREE.Vector3(...house.garage.surface.position)),
        ...Object.entries(house.surfaces).map(([app,s])=>pickInfo(app,new THREE.Vector3(...s.position)))]}),
    destroy(){
      destroyed=true;revision++;for(const fn of cleanups)fn();demos?.destroy();reader?.destroy();
      garageScreen.destroy();officeDesktop.destroy();gamingLibrary.destroy();world.destroy();
      host.replaceChildren();host.classList.remove('plan-host','plan-house');
    }
  };
}
