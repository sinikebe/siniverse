export const GAMES=[{
  id:'decalage',name:'Décalage',
  devUrl:'https://dev.decalage.siniverse.cc',
  url:'https://decalage.siniverse.cc',
}];

// Production switches to the public game only when this change is promoted to main.
export function gameHref(game,hostname){
  return ['siniverse.cc','www.siniverse.cc'].includes(hostname)?game.url:game.devUrl;
}

export const GAME_ICON='<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="8" y="8" width="64" height="64" rx="14" fill="#142c43"/><path d="M29 14V66M51 14V66M14 29H66M14 51H66" stroke="#8ed6e8" stroke-opacity=".25" stroke-width="2"/><rect x="16" y="16" width="20" height="20" rx="5" fill="#9bdce7"/><rect x="40" y="40" width="24" height="24" rx="6" fill="#d59a93"/><path d="M46 23H61M56 18L61 23L56 28M23 46V61M18 56L23 61L28 56" fill="none" stroke="#9bdce7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
