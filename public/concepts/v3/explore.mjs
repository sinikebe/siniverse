import {APPS, ANGLES, ANGLE_NAMES, contentFor} from './catalog.mjs';
import {NAVIGATION_KEY, PREFERENCE_HISTORY_KEY, TITLES, normalizeState, parseRoute, routeHref, selection, createPreferenceStore} from './model.mjs';
const host=document.querySelector('#experience');
const store=createPreferenceStore({local:()=>localStorage,session:()=>sessionStorage,history:()=>history});
const previous=history.state?.[NAVIGATION_KEY];
const restored=performance.getEntriesByType('navigation')[0]?.type==='back_forward'&&previous?.v===3;
const choice=restored?{mode:previous.mode,concept:previous.route.concept}:selection(location.search,store.read());
let state=restored?normalizeState(previous.route):parseRoute(location.search,choice.concept),mode=choice.mode;
let mounted=null,mountedConcept=null,revision=0,destroyed=false;
if(!restored&&mode==='rotation')store.write(choice.preference);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const modules={plan:()=>import('./plan.mjs'),reacteur:()=>import('./reactor.mjs'),anamorphose:()=>import('./anamorphose.mjs')};
const names={plan:'mountPlan',reacteur:'mountReactor',anamorphose:'mountAnamorphose'};
function snapshot(focus=document.activeElement?.id||'view-title'){
  let view=null;try{view=mounted?.snapshot?.()??null;}catch{/* A lost WebGL context still permits semantic navigation. */}
  return {v:3,route:state,mode,view,focus,scroll:[scrollX,scrollY]};
}
function writeHistory(method,record=snapshot()){
  try{history[method]({...history.state,[PREFERENCE_HISTORY_KEY]:store.read(),[NAVIGATION_KEY]:record},'',routeHref(record.route,{rotation:record.mode==='rotation'}));}
  catch{document.querySelector('#navigation-status').textContent='Historique indisponible ici ; les liens directs restent utilisables.';}
}
function syncControls(){
  const saved=store.read(),pinned=saved.pinned===state.concept;
  const pin=document.querySelector('#pin-theme');pin.textContent=pinned?'Reprendre la rotation':'Figer ce parcours';pin.setAttribute('aria-pressed',String(pinned));
  const resume=document.querySelector('#resume-rotation');resume.hidden=pinned||(mode==='rotation'&&!saved.pinned);
  resume.textContent=saved.pinned?'Reprendre la rotation':'Tester la rotation';
  document.querySelector('#theme-state').textContent=mode==='direct'?'Lien direct : '+TITLES[state.concept]+'. '+(saved.pinned?'Parcours figé : '+TITLES[saved.pinned]+'.':'Rotation indépendante.')
    :saved.pinned?TITLES[saved.pinned]+' reste figé.':'Le prochain rechargement ouvre le parcours suivant.';
  document.querySelector('#storage-state').textContent=store.mode==='local'?'Préférence sur cet appareil.':store.mode==='mémoire'?'Préférence pour cette visite seulement.':'Préférence dans cet onglet.';
  document.querySelector('#permalink').href=routeHref(state);
}
function sceneApi(){
  return {apps:APPS,angles:ANGLES,angleNames:ANGLE_NAMES,content:contentFor,escape,
    reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
    href:destination=>routeHref({...state,...destination},{rotation:mode==='rotation'}),
    navigate:(destination,options={})=>navigate({...state,...destination},options),
    saveView:()=>{if(!destroyed)writeHistory('replaceState');}};
}
async function render(record,{instant=false}={}){
  const token=++revision;document.documentElement.dataset.v3Ready='false';host.setAttribute('aria-busy','true');
  try{
    if(mountedConcept!==state.concept){
      mounted?.destroy();mounted=null;host.className='experience-host';host.replaceChildren();
      const concept=state.concept,module=await modules[concept]();
      if(token!==revision)return;
      mounted=module[names[concept]](host,state,sceneApi());mountedConcept=concept;
    }
    await mounted.update(state,{snapshot:record?.view??null,instant});
    if(token!==revision)return;
    const focus=document.getElementById(record?.focus||'view-title')||document.getElementById('view-title');
    focus?.focus({preventScroll:true});
    if(record?.scroll)window.scrollTo({left:record.scroll[0],top:record.scroll[1],behavior:'instant'});
  }catch(error){
    if(token!==revision)return;
    mounted?.destroy();mounted=null;mountedConcept=null;
    host.innerHTML='<section class="scene-unavailable"><h1 id="view-title" tabindex="-1">Ce parcours n’a pas pu s’ouvrir.</h1><p>Les applications restent accessibles.</p>'
      +Object.entries(APPS).map(([id,app])=>'<a href="'+app.url+'">Ouvrir '+app.name+' ↗</a>').join('')+'<a href="./">Autres parcours</a></section>';
    host.dataset.sceneError=error.message;
  }
  if(token===revision){
    syncControls();document.title=TITLES[state.concept]+' — Siniverse';
    document.documentElement.dataset.v3State=JSON.stringify(state);
    document.documentElement.dataset.v3Concept=state.concept;
    document.documentElement.dataset.v3Ready='true';host.setAttribute('aria-busy','false');
  }
}
async function navigate(destination,{focusId='view-title'}={}){
  const next=normalizeState(destination);
  writeHistory('replaceState');
  const same=JSON.stringify(next)===JSON.stringify(state);
  state=next;
  const record={...snapshot(focusId),view:null,scroll:focusId==='view-title'?[0,0]:[scrollX,scrollY]};
  if(!same)writeHistory('pushState',record);
  await render(record);
}
window.addEventListener('popstate',event=>{
  const record=event.state?.[NAVIGATION_KEY];
  if(record?.v===3){state=normalizeState(record.route);mode=record.mode==='rotation'?'rotation':'direct';void render(record,{instant:true});}
  else{state=parseRoute(location.search,state.concept);void render(null,{instant:true});}
});
function resume(){
  store.write({...store.read(),last:state.concept,pinned:null});mode='rotation';writeHistory('replaceState');syncControls();
  document.querySelector('#navigation-status').textContent='Le parcours reste ici. La rotation reprendra au prochain rechargement.';
}
document.querySelector('#pin-theme').addEventListener('click',()=>{
  if(store.read().pinned===state.concept)resume();
  else{store.write({...store.read(),last:state.concept,pinned:state.concept});writeHistory('replaceState');syncControls();}
});
document.querySelector('#resume-rotation').addEventListener('click',resume);
window.addEventListener('pagehide',()=>writeHistory('replaceState'));
Object.defineProperty(window,'__siniverseV3',{value:Object.freeze({inspect:()=>({route:{...state},scene:mounted?.inspect?.()??{kind:'unavailable'}})})});
await render(restored?previous:null,{instant:true});
writeHistory('replaceState',restored?previous:snapshot());
