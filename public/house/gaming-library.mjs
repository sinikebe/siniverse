import { GAMES, gameHref, GAME_ICON } from './games.mjs';

export function createGamingLibrary(host,{escape,onClose,onChange=()=>{}}){
  const shortcut=game=>'<a class="gaming-game-shortcut" href="'+escape(gameHref(game,location.hostname))+'" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir '+escape(game.name)+' dans un nouvel onglet"><span class="gaming-game-icon">'+GAME_ICON+'</span><strong>'+escape(game.name)+'</strong><small>'+(['siniverse.cc','www.siniverse.cc'].includes(location.hostname)?'Jouer':'Version dev')+'</small></a>';
  const shortcuts=GAMES.map(shortcut).join('');
  const desktop=document.createElement('div');desktop.className='gaming-screen-desktop';desktop.setAttribute('aria-label','Le bureau du PC gaming');desktop.innerHTML=shortcuts;
  let surface=null;
  const dialog=document.createElement('dialog');dialog.className='gaming-library';dialog.id='gaming-library';dialog.setAttribute('aria-labelledby','gaming-library-title');
  dialog.innerHTML='<header class="gaming-library-bar"><a href="/">siniverse / play</a><button type="button" id="gaming-library-close">Revenir au PC <span aria-hidden="true">×</span></button></header><div class="gaming-library-body"><p class="gaming-library-eyebrow">LE BUREAU GAMING</p><h1 id="gaming-library-title" tabindex="-1">Les jeux prennent vie ici.</h1><p class="gaming-library-lead">Les jeux du Siniverse, accessibles depuis leur icône. Chaque jeu s’ouvre dans un nouvel onglet.</p><nav class="gaming-library-grid" aria-label="Jeux du Siniverse">'+shortcuts+'</nav><footer>De la première idée à la première partie.</footer></div>';
  host.append(dialog);let trigger=null,destroyed=false;
  const close=({save=true,focus=true}={})=>{if(!dialog.open)return;dialog.close();document.body.classList.remove('gaming-library-open');onClose?.();const target=host.querySelector('#plan-gaming-screen')||trigger;if(focus&&target?.isConnected)target.focus({preventScroll:true});if(save)onChange();};
  dialog.querySelector('button').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  return {attach(world,spec){surface=world.surface({...spec,pixels:1024},desktop);},open({focus=true}={}){if(destroyed)return;trigger=document.activeElement;if(!dialog.open)dialog.showModal();document.body.classList.add('gaming-library-open');if(focus)dialog.querySelector('h1').focus({preventScroll:true});onChange();},close,isOpen:()=>dialog.open,destroy(){destroyed=true;if(dialog.open)dialog.close();document.body.classList.remove('gaming-library-open');surface?.remove();desktop.remove();dialog.remove();}};
}
