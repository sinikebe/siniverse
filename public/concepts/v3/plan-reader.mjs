const nextFrame=()=>new Promise(resolve=>{let done=false;const finish=()=>{if(!done){done=true;resolve();}};requestAnimationFrame(finish);setTimeout(finish,60);});
const TITLES={presentation:'Le rôle',action:'En action',methode:'La méthode',limites:'Les limites'};

function illustration(app){
  if(app==='finapp')return '<svg viewBox="0 0 560 410" aria-hidden="true"><path class="figure-grid" d="M40 330H520M40 250H520M40 170H520M40 90H520"/><path class="figure-axis" d="M50 45V335H520"/><path class="figure-path" d="M50 310C170 310 185 245 270 245S410 140 505 65"/><path class="figure-path secondary" d="M50 310C160 270 230 270 300 220S420 205 505 150"/><text x="65" y="382">Un horizon commun</text><text x="385" y="44">Scénario A</text><text x="405" y="198">Scénario B</text></svg><figcaption>Illustration fictive : deux approches, les mêmes hypothèses de lecture.</figcaption>';
  if(app==='garapp')return '<svg viewBox="0 0 560 410" aria-hidden="true"><path class="figure-axis" d="M70 70V350"/><circle class="figure-dot" cx="70" cy="110" r="12"/><circle class="figure-dot" cx="70" cy="210" r="12"/><circle class="figure-dot" cx="70" cy="310" r="12"/><path class="figure-rule" d="M105 110H465M105 210H465M105 310H465"/><text x="110" y="92">L’intervention</text><text x="110" y="192">La dépense</text><text x="110" y="292">Le justificatif</text><text class="figure-small" x="110" y="345">Un même repère à retrouver.</text></svg><figcaption>Un historique d’exemple, lié à son véhicule.</figcaption>';
  return '<svg viewBox="0 0 560 410" aria-hidden="true"><rect class="figure-device" x="35" y="125" width="108" height="150" rx="15"/><path class="figure-rule" d="M53 155H120M53 175H120M53 195H120"/><path class="figure-path" d="M143 215C200 215 210 300 280 300S340 215 395 215"/><rect class="figure-device" x="395" y="125" width="135" height="135" rx="12"/><path class="figure-axis" d="M460 260V285M430 285H490"/><text x="40" y="100">Source</text><text x="216" y="350">Câble</text><text x="398" y="100">Écran</text></svg><figcaption>Les rôles d’une liaison vidéo directe, rendus visibles.</figcaption>';
}

export function createPlanReader(host,api,{onNavigate,onClose,onViewChange=()=>{}}){
  const dialog=document.createElement('dialog');dialog.id='plan-reader-dialog';dialog.className='plan-reader';dialog.setAttribute('aria-labelledby','plan-reader-title');
  dialog.innerHTML='<div class="plan-reader-shell"><header class="plan-reader-bar"><span class="plan-reader-brand">siniverse / plan-séquence</span><a id="plan-reader-open-app" class="reader-open-app" href="#"></a><button type="button" id="plan-reader-close"><span class="reader-return-label">Revenir au support</span><span aria-hidden="true">×</span></button></header><div class="plan-reader-scroll" id="plan-reader-scroll" tabindex="0"></div></div>';
  host.append(dialog);
  const scroll=dialog.querySelector('.plan-reader-scroll'),close=dialog.querySelector('#plan-reader-close'),exit=dialog.querySelector('#plan-reader-open-app');
  let current=null,animation=null,phase='closed',sourceRect=null,destroyed=false,generation=0,closingTask=null,saveFrame=0;
  scroll.addEventListener('scroll',()=>{if(phase!=='open'||saveFrame)return;saveFrame=requestAnimationFrame(()=>{saveFrame=0;if(!destroyed&&phase==='open')onViewChange();});},{passive:true});
  close.addEventListener('click',()=>onClose());
  dialog.addEventListener('cancel',event=>{event.preventDefault();onClose();});
  dialog.addEventListener('keydown',event=>{
    if(typeof dialog.showModal==='function')return;
    if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key==='Tab'){
      const items=[...dialog.querySelectorAll('a,button,[tabindex]')].filter(e=>!e.disabled&&e.getBoundingClientRect().width>0),first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  function setContent(app,angle,{scrollTop=0,focus=false}={}){
    current={app,angle};dialog.dataset.app=app;dialog.dataset.angle=angle;
    const content=api.content(app,angle),name=api.apps[app].name;
    dialog.querySelector('.reader-return-label').textContent=app==='garapp'?'Revenir au véhicule':'Revenir à l’écran';
    exit.href=api.apps[app].url;exit.textContent='Ouvrir '+name+' ↗';
    scroll.setAttribute('aria-label','Lecture de '+name);
    scroll.innerHTML='<div class="plan-reader-content"><nav class="plan-reader-angles" aria-label="Angles de lecture">'+Object.entries(TITLES).map(([id,label])=>'<a id="plan-reader-angle-'+id+'" data-reader-angle="'+id+'" href="'+api.href({app,angle:id})+'" aria-current="'+(id===angle?'page':'false')+'">'+label+'</a>').join('')+'</nav><article><header class="plan-reader-heading"><p class="reader-eyebrow">'+api.escape(name)+' / '+api.escape(content.eyebrow)+'</p><h1 id="plan-reader-title" tabindex="-1">'+api.escape(content.title)+'</h1></header><div class="plan-reader-layout"><div class="plan-reader-prose">'+content.body.map(p=>'<p>'+api.escape(p)+'</p>').join('')+(content.facts?.length?'<dl class="plan-reader-facts">'+content.facts.map(f=>'<div><dt>'+api.escape(f.label)+'</dt><dd>'+api.escape(f.value)+'</dd></div>').join('')+'</dl>':'')+(content.related?'<button type="button" id="plan-reader-related">'+api.escape(content.related.label)+' <span aria-hidden="true">→</span></button>':'')+'</div><figure class="plan-reader-figure">'+illustration(app)+'</figure></div><footer class="plan-reader-foot"><a class="reader-launch" href="'+api.apps[app].url+'">Continuer dans '+api.escape(name)+' <span aria-hidden="true">↗</span></a><span>Le portail vous ramène à votre point de départ.</span></footer></article></div>';
    for(const link of scroll.querySelectorAll('[data-reader-angle]'))link.addEventListener('click',event=>{if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onNavigate({app,angle:link.dataset.readerAngle});});
    scroll.querySelector('#plan-reader-related')?.addEventListener('click',()=>onNavigate({app:content.related.app,angle:'presentation'}));
    scroll.scrollTo({top:scrollTop,left:0,behavior:'instant'});
    if(focus)dialog.querySelector('#plan-reader-title').focus({preventScroll:true});
  }
  const cleanRect=rect=>{
    if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<8||rect.height<8)return {x:innerWidth*.4,y:innerHeight*.4,width:innerWidth*.2,height:innerHeight*.2};
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  };
  const transform=rect=>'translate3d('+rect.x+'px,'+rect.y+'px,0) scale3d('+Math.max(.01,rect.width/innerWidth)+','+Math.max(.01,rect.height/innerHeight)+',1)';
  async function transition(frames,duration){
    animation?.cancel();
    if(api.reducedMotion||duration===0||typeof dialog.animate!=='function')return;
    const active=dialog.animate(frames,{duration,easing:'cubic-bezier(.2,.75,.18,1)',fill:'both'});animation=active;
    try{await active.finished;}catch(error){if(error.name!=='AbortError')throw error;}
    if(animation===active){active.cancel();animation=null;}
  }
  async function open({app,angle,origin,instant=false,scrollTop=0}){
    if(destroyed)return;
    if(dialog.open&&phase!=='closing'){setContent(app,angle,{scrollTop,focus:true});return;}
    const token=++generation,alreadyOpen=dialog.open,from=alreadyOpen?{transform:getComputedStyle(dialog).transform,opacity:getComputedStyle(dialog).opacity,borderRadius:'0px'}:null;
    setContent(app,angle,{scrollTop});phase='opening';document.body.classList.add('plan-reading-open');
    if(!alreadyOpen){dialog.style.visibility='hidden';if(typeof dialog.showModal==='function')dialog.showModal();else{dialog.setAttribute('open','');dialog.setAttribute('aria-modal','true');}}
    await nextFrame();if(destroyed||token!==generation)return;
    sourceRect=cleanRect(origin());dialog.style.visibility='';
    scroll.scrollTo({top:scrollTop,left:0,behavior:'instant'});
    dialog.querySelector('#plan-reader-title').focus({preventScroll:true});
    await transition([from||{transform:transform(sourceRect),opacity:.25,borderRadius:'18px'},{transform:'none',opacity:1,borderRadius:'0px'}],instant?0:620);
    if(dialog.open&&!destroyed&&token===generation)phase='open';
  }
  function shut({origin,instant=false}={}){
    if(!dialog.open)return Promise.resolve();
    if(phase==='closing'&&closingTask)return closingTask;
    const token=++generation;phase='closing';
    const task=(async()=>{
      const initial={transform:getComputedStyle(dialog).transform,opacity:getComputedStyle(dialog).opacity,borderRadius:'0px'};
      document.body.classList.remove('plan-reading-open');await nextFrame();if(destroyed||token!==generation)return;
      const rect=cleanRect(origin?.());await transition([initial,{transform:transform(rect),opacity:0,borderRadius:'18px'}],instant?0:420);
      if(destroyed||token!==generation)return;if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');phase='closed';
    })();
    closingTask=task;const clear=()=>{if(closingTask===task)closingTask=null;};void task.then(clear,clear);return task;
  }
  return {open,close:shut,setContent,isOpen:()=>dialog.open,app:()=>current?.app,
    scrollTop:()=>scroll.scrollTop,
    inspect:()=>({open:dialog.open,phase,app:current?.app,angle:current?.angle,scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,viewportHeight:scroll.clientHeight,originRect:sourceRect,rect:(()=>{const r=dialog.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})(),transform:dialog.open?getComputedStyle(dialog).transform:null,focus:document.activeElement?.id}),
    destroy(){destroyed=true;generation++;cancelAnimationFrame(saveFrame);animation?.cancel();document.body.classList.remove('plan-reading-open');if(dialog.open&&typeof dialog.close==='function')dialog.close();dialog.remove();}};
}
