import { OFFICE_PROGRAMS } from './model.mjs';

// Each app keeps its own origin and data. Frames are created only on launch and kept
// mounted while switching apps, returning to the desktop, or leaving the virtual PC.
export function createOfficeDesktop(host, api, { onLaunch, onExit, onChange }) {
  const dialog=document.createElement('dialog');dialog.id='office-desktop';dialog.className='office-desktop';dialog.setAttribute('aria-labelledby','office-desktop-title');
  const marks={finapp:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 14V52H54M17 43L28 35L38 38L53 18"/></svg>',branchlab:'<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="9" width="17" height="20" rx="4"/><rect x="39" y="35" width="17" height="20" rx="4"/><path d="M17 29V43H39"/></svg>'};
  dialog.innerHTML='<header class="office-bar"><button type="button" id="office-home">⌂ Bureau</button><h2 id="office-desktop-title" tabindex="-1">Le bureau Siniverse</h2><div class="office-window-actions"><a id="office-standalone" target="_blank" rel="noopener noreferrer" hidden>Ouvrir à part ↗</a><button type="button" id="office-expand">Agrandir l’écran</button><button type="button" id="office-exit" aria-label="Revenir dans la pièce">×</button></div></header><div class="office-workspace"><section class="office-launcher" id="office-launcher"><p>SINIVERSE / VOTRE BUREAU</p><h3>Vos idées prennent<br>place ici.</h3><div class="office-apps">'+OFFICE_PROGRAMS.map(id=>'<article><button class="office-app-launch" id="office-launch-'+id+'" type="button"><span class="office-app-icon icon-'+id+'">'+marks[id]+'</span><strong>'+api.apps[id].name+'</strong><span>'+(id==='finapp'?'Planifier et comparer.':'Votre setup, au clair.')+'</span></button><a href="'+api.href({app:id,room:undefined,program:undefined})+'" target="_blank" rel="noopener noreferrer">Présentation ↗</a></article>').join('')+'</div><span class="office-desktop-note">Un seul PC. Vos outils à portée de main.</span></section><div class="office-programs" id="office-programs" hidden></div></div><footer class="office-taskbar"><span class="office-brand">siniverse.</span><nav aria-label="Applications du PC">'+OFFICE_PROGRAMS.map(id=>'<button type="button" id="office-task-'+id+'" aria-pressed="false">'+api.apps[id].name+'<span class="office-running" hidden aria-label="Application ouverte">●</span></button>').join('')+'</nav><span class="office-session">Le PC du bureau</span></footer>';
  host.append(dialog);
  const dock=document.createElement('div');dock.className='house-demo-dock office-dock';dock.hidden=true;
  dock.innerHTML='<span>Au bureau / le PC</span><button type="button" id="office-dock-expand">Agrandir l’écran</button><button type="button" id="office-dock-exit">Revenir dans la pièce <span aria-hidden="true">×</span></button>';host.append(dock);
  const frames=new Map(),programs=dialog.querySelector('#office-programs'),launcher=dialog.querySelector('#office-launcher');
  let world=null,handle=null,active=false,expanded=false,current=null,forceExpanded=false,destroyed=false;
  const standalone=dialog.querySelector('#office-standalone');

  function ensureFrame(id){
    if(frames.has(id))return frames.get(id);
    const pane=document.createElement('section');pane.className='office-program';pane.dataset.program=id;pane.hidden=true;
    const loading=document.createElement('p');loading.className='office-loading';loading.setAttribute('role','status');loading.textContent='Ouverture de '+api.apps[id].name+'…';
    const frame=document.createElement('iframe');frame.id='office-frame-'+id;frame.title=api.apps[id].name+' — application';
    frame.sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';
    frame.allow='fullscreen; clipboard-write';frame.referrerPolicy='no-referrer';
    frame.addEventListener('load',()=>{loading.hidden=true;pane.dataset.loaded='true';});
    frame.src=api.apps[id].url;
    pane.append(loading,frame);programs.append(pane);frames.set(id,{pane,frame});
    dialog.querySelector('#office-task-'+id+' .office-running').hidden=false;
    dialog.querySelector('#office-task-'+id).setAttribute('aria-label',api.apps[id].name+' — ouverte');
    dialog.querySelector('#office-task-'+id+' .office-running').setAttribute('aria-hidden','true');
    return frames.get(id);
  }

  function paint(program){
    current=OFFICE_PROGRAMS.includes(program)?program:null;
    if(current)ensureFrame(current);
    launcher.hidden=Boolean(current);programs.hidden=!current;
    for(const [id,{pane}]of frames)pane.hidden=id!==current;
    for(const id of OFFICE_PROGRAMS)dialog.querySelector('#office-task-'+id).setAttribute('aria-pressed',String(current===id));
    dialog.querySelector('#office-desktop-title').textContent=current?api.apps[current].name+' / le PC du bureau':'Le bureau Siniverse';
    standalone.hidden=!current;if(current)standalone.href=api.apps[current].url;
  }

  function present(next){
    const value=forceExpanded||!handle||Boolean(next);
    if(dialog.open&&expanded!==value)dialog.close();
    expanded=value;dialog.classList.toggle('is-expanded',expanded);handle?.setOverlay(expanded);handle?.setEnabled(active);
    dialog.hidden=!active;dock.hidden=!active||expanded;
    if(active&&!dialog.open){if(expanded)dialog.showModal();else dialog.show();}
    dialog.querySelector('#office-expand').textContent=expanded?'Revenir à l’écran':'Agrandir l’écran';
    dialog.querySelector('#office-expand').disabled=forceExpanded;
    document.body.classList.toggle('office-expanded',active&&expanded);
    world?.refresh();
  }

  function toggle(){present(!expanded);dialog.querySelector('#office-expand').focus({preventScroll:true});onChange();}
  function close({save=true,focus=true}={}){
    active=false;handle?.setEnabled(false);if(dialog.open)dialog.close();dialog.hidden=true;dock.hidden=true;document.body.classList.remove('office-expanded');
    if(focus)document.querySelector('#plan-office-screen')?.focus({preventScroll:true});
    if(save)onChange();
  }
  function launch(program){onLaunch(OFFICE_PROGRAMS.includes(program)?program:undefined);}
  dialog.querySelector('#office-home').addEventListener('click',()=>launch(null));
  for(const id of OFFICE_PROGRAMS)for(const prefix of ['office-launch-','office-task-'])dialog.querySelector('#'+prefix+id).addEventListener('click',()=>launch(id));
  dialog.querySelector('#office-expand').addEventListener('click',toggle);dock.querySelector('#office-dock-expand').addEventListener('click',toggle);
  for(const button of [dialog.querySelector('#office-exit'),dock.querySelector('#office-dock-exit')])button.addEventListener('click',onExit);
  dialog.addEventListener('cancel',event=>{event.preventDefault();onExit();});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onExit();}});
  return {
    attach(nextWorld,surface){world=nextWorld;handle=world.surface({...surface,pixels:1280,layer:host},dialog);handle.setEnabled(false);},
    open({program,expanded:requested,focus=true}={}){
      if(destroyed)return;const wasOpen=active;active=true;paint(program);
      present(requested??(wasOpen?expanded:matchMedia('(max-width:759px)').matches));
      if(focus)dialog.querySelector('#office-desktop-title').focus({preventScroll:true});
    },
    close,isOpen:()=>active,isExpanded:()=>expanded,
    fallback(){forceExpanded=true;if(active)present(true);},
    snapshot:()=>({open:active,expanded,program:current}),
    inspect:()=>({open:active,expanded,program:current,launched:[...frames.keys()]}),
    destroy(){destroyed=true;close({save:false,focus:false});handle?.remove();dialog.remove();dock.remove();frames.clear();}
  };
}
