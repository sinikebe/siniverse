import { APPS, ANGLES } from './catalog.mjs';
export const CONCEPTS = ['plan', 'reacteur', 'anamorphose'];
export const TITLES = {plan:'Le Plan-séquence',reacteur:'Le Réacteur',anamorphose:'L’Anamorphose'};
export const PREFERENCE_KEY = 'siniverse.navigation-concepts.v3';
export const PREFERENCE_HISTORY_KEY = '__siniverseNavigationPreferenceV3';
export const NAVIGATION_KEY = '__siniverseNavigationV3';
export function normalizeState(value={}) {
  value=value&&typeof value==='object'?value:{};
  const concept=CONCEPTS.includes(value.concept)?value.concept:'plan';
  const app=Object.hasOwn(APPS,value.app)?value.app:'ensemble';
  const angle=ANGLES.includes(value.angle)?value.angle:'presentation';
  return {concept,app,angle:app==='ensemble'&&concept!=='reacteur'?'presentation':angle};
}
export function parseRoute(search,resolved='plan') {
  const query=new URLSearchParams(search);
  return normalizeState({concept:query.get('concept')||resolved,app:query.get('app'),angle:query.get('angle')});
}
export function routeHref(value,{rotation=false}={}) {
  const state=normalizeState(value),query=new URLSearchParams();
  if(!rotation)query.set('concept',state.concept);
  if(state.app!=='ensemble')query.set('app',state.app);
  if(state.angle!=='presentation')query.set('angle',state.angle);
  return '/concepts/v3/explore.html'+(query.size?'?'+query:'');
}
export function selection(search,saved={}) {
  const query=new URLSearchParams(search),requested=query.get('concept');
  if(query.has('concept'))return {concept:CONCEPTS.includes(requested)?requested:CONCEPTS[0],mode:'direct',preference:saved,unknown:!CONCEPTS.includes(requested)};
  const concept=CONCEPTS.includes(saved.pinned)?saved.pinned:CONCEPTS[(CONCEPTS.indexOf(saved.last)+1)%CONCEPTS.length];
  return {concept,mode:'rotation',preference:{...saved,last:concept},unknown:false};
}
export function createPreferenceStore({ local, session, history } = {}) {
  const clean = value => ({ revision: Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0,
    last: CONCEPTS.includes(value?.last) ? value.last : null, pinned: CONCEPTS.includes(value?.pinned) ? value.pinned : null });
  const layers = [];
  for (const [get, label] of [[local, 'local'], [session, 'session']]) {
    if (get) layers.push({ label, read: () => get().getItem(PREFERENCE_KEY), write: json => get().setItem(PREFERENCE_KEY, json) });
  }
  if (history) layers.push({ label: 'onglet', read: () => JSON.stringify(history().state?.[PREFERENCE_HISTORY_KEY] ?? null),
    write: json => { const target = history(); target.replaceState({ ...target.state, [PREFERENCE_HISTORY_KEY]: JSON.parse(json) }, ''); } });
  let value = clean(null), mode = 'mémoire', found = false;
  for (const layer of layers) {
    try {
      const raw = layer.read();
      if (mode === 'mémoire') mode = layer.label;
      const candidate = JSON.parse(raw || 'null');
      if (candidate && (!found || clean(candidate).revision > value.revision)) { value = clean(candidate); mode = layer.label; found = true; }
    } catch { /* Storage is optional. */ }
  }
  return { read: () => ({ ...value }), get mode() { return mode; },
    write(next) {
      value = { ...clean(next), revision: value.revision + 1 };
      let written = false;
      for (const layer of layers) { try { layer.write(JSON.stringify(value)); if (!written) { written = true; mode = layer.label; } } catch { /* Try another layer. */ } }
      if (!written) mode = 'mémoire';
      return { ...value };
    } };
}
