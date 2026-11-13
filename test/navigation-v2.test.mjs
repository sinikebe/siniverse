import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT, CONCEPTS, PREFERENCE_KEY, PREFERENCE_HISTORY_KEY, NAVIGATION_KEY, detail, initialState,
  depthState, parentNode, storyState, resolveStory, montageState, openSurface, keepSurface, closeSurface,
  parseRoute, routeHref, selection, createPreferenceStore } from '../public/concepts/v2/model.mjs';

import { renderDepth, renderMontage } from '../public/concepts/v2/views.mjs';
import { renderStory } from '../public/concepts/v2/story.mjs';

test('a nested deep link has explicit semantic parents without a visit history', () => {
  const state = parseRoute('?concept=emboitement&lieu=finapp.exemple');
  assert.deepEqual(state, depthState('finapp.exemple'));
  assert.equal(parentNode(state.node), 'finapp');
  assert.equal(parentNode('finapp'), 'ensemble');
  assert.equal(parentNode('ensemble'), 'ensemble');
});
test('untrusted URL identifiers never become content or arbitrary destinations', () => {
  assert.deepEqual(parseRoute('?concept=unknown&lieu=%3Cscript%3E'), depthState());
  assert.equal(detail('constructor'), null);
  assert.deepEqual(parseRoute('?concept=bifurcations&chemin=achat/voiture/inconnu/relier').trail, ['achat','voiture']);
  const montage = parseRoute('?concept=montage&avec=finapp,finapp,<script>,garapp,branchlab,ensemble&focus=bogus&garder=finapp,bogus&depuis=finapp:__proto__,garapp:finapp');
  assert.deepEqual(montage.panels, ['finapp','garapp','branchlab']);
  assert.deepEqual(montage.kept, ['finapp']);
  assert.deepEqual(montage.origins, { garapp:'finapp' });
  assert.equal(montage.focus, 'branchlab');
});
test('every valid grammar serializes and restores its complete semantic state', () => {
  for (const state of [depthState('branchlab.methode'), storyState(['achat','voiture','comparer','exemple','suivre','historique']),
    montageState({panels:['finapp.exemple','garapp','garapp.exemple'], kept:['finapp.exemple'], focus:'garapp',
      origins:{garapp:'finapp.exemple','garapp.exemple':'garapp'}})]) {
    assert.deepEqual(parseRoute(new URL(routeHref(state), 'https://siniverse.cc').search), state);
  }
});
test('all offered story branches lead somewhere and keep revisable known prefixes', () => {
  const pending = [storyState()], visited = new Set();
  while (pending.length) {
    const state = pending.shift(), key = state.trail.join('/');
    if (visited.has(key)) continue;
    visited.add(key);
    const story = resolveStory(state);
    assert(story.title);
    for (const word of story.trail) assert.deepEqual(word.state.trail, state.trail.slice(0,word.state.trail.length));
    for (const choice of story.choices) {
      assert.notDeepEqual(choice.state, state, 'Broken branch: '+key+' / '+choice.label);
      pending.push(choice.state);
    }
  }
  assert(visited.has('achat/voiture/comparer/exemple/suivre/historique'));
  assert(visited.has('video/relier/exemple'));
});
test('revising an earlier phrase discards the abandoned future', () => {
  const current = storyState(['achat','voiture','comparer','exemple','suivre']);
  const revision = resolveStory(current).trail.find(word => word.state.trail.join('/') === 'achat').state;
  const video = resolveStory(revision).choices.find(choice => choice.state.trail.at(-1) === 'installation').state;
  assert.deepEqual(video.trail, ['achat','installation']);
  assert.equal(resolveStory(video).choices[0].state.trail.join('/'), 'achat/installation/relier');
});
test('story shortcuts reach the same actual tools without a compulsory questionnaire', () => {
  for (const app of ['finapp','garapp','branchlab']) {
    const story = resolveStory(storyState([app]));
    assert.equal(story.app, app);
    assert.equal(story.kind, 'app');
  }
});
test('montage inserts beside its source, keeps an example, and records a folded source', () => {
  let state = openSurface(montageState(), 'finapp', 'ensemble');
  assert.deepEqual(state.panels, ['ensemble','finapp']);
  state = openSurface(state, 'finapp.exemple', 'finapp');
  state = keepSurface(state, 'finapp.exemple');
  state = openSurface(state, 'garapp', 'finapp.exemple');
  assert.deepEqual(state.panels, ['finapp','finapp.exemple','garapp']);
  state = openSurface(state, 'garapp.exemple', 'garapp');
  assert.deepEqual(state.panels, ['finapp.exemple','garapp','garapp.exemple']);
  assert.equal(state.origins['finapp.exemple'], 'finapp');
  assert.deepEqual(state.kept, ['finapp.exemple']);
  assert.equal(state.focus, 'garapp.exemple');
});
test('montage close keeps other surfaces and returns focus to its named neighbour', () => {
  let state = montageState({panels:['finapp.exemple','garapp','garapp.exemple'],kept:['finapp.exemple'],focus:'garapp.exemple'});
  state = closeSurface(state,'garapp.exemple');
  assert.deepEqual(state.panels,['finapp.exemple','garapp']);
  assert.equal(state.focus,'garapp');
  assert.deepEqual(state.kept,['finapp.exemple']);
  state = closeSurface(closeSurface(state,'garapp'),'finapp.exemple');
  assert.deepEqual(state, montageState());
});
test('montage never grows beyond three active surfaces or two kept surfaces', () => {
  let state = montageState();
  for (const id of Object.keys(CONTENT)) {
    state = keepSurface(state, state.focus);
    state = openSurface(state, id);
    assert(state.panels.length <= 3);
    assert(state.kept.length <= 2);
    assert(state.panels.includes(state.focus));
    assert(state.kept.every(kept => state.panels.includes(kept)));
  }
});
test('a stable concept link never changes a separately pinned preference', () => {
  const saved = {revision:8,last:'montage',pinned:'bifurcations'};
  const direct = selection('?concept=emboitement',saved);
  assert.equal(direct.concept,'emboitement');
  assert.equal(direct.mode,'direct');
  assert.deepEqual(direct.preference,saved);
  assert.equal(selection('',saved).concept,'bifurcations');
});
test('rotation is sequential with a known first arrival, and resume starts after the current theme', () => {
  let saved = {last:null,pinned:null};
  for (const expected of [...CONCEPTS,CONCEPTS[0]]) {
    const next = selection('',saved);
    assert.equal(next.concept,expected);
    saved = next.preference;
  }
  assert.equal(selection('',{last:'bifurcations',pinned:null}).concept,'montage');
});
test('rotation links carry semantic state while a share link explicitly fixes its grammar', () => {
  const state=depthState('garapp.exemple');
  const rotating=routeHref(state,{rotation:true});
  assert(!rotating.includes('concept='));
  assert.deepEqual(parseRoute(new URL(rotating,'https://siniverse.cc').search,'emboitement'),state);
  assert(routeHref(state).includes('concept=emboitement'));
});
test('blocked storage falls back to history without overwriting route or V1 preferences', () => {
  let record = { unrelated:42, [NAVIGATION_KEY]:{v:2,route:depthState('finapp')}, __siniverseHomeConceptsV1:{pinned:'fil'} };
  const history = { get state(){return record}, replaceState(next){record=next} };
  const denied=()=>{throw new Error('Blocked')};
  const store=createPreferenceStore({local:denied,session:denied,history:()=>history});
  store.write({last:'montage',pinned:'montage'});
  const next=createPreferenceStore({local:denied,session:denied,history:()=>history});
  assert.equal(next.mode,'onglet');
  assert.equal(next.read().pinned,'montage');
  assert.deepEqual(record[NAVIGATION_KEY].route,depthState('finapp'));
  assert.equal(record.__siniverseHomeConceptsV1.pinned,'fil');
  assert.equal(record.unrelated,42);
  assert.notEqual(PREFERENCE_KEY,'siniverse.home-concepts.v1');
});
test('a failed primary write cannot beat a newer fallback record on reload', () => {
  const local={getItem:()=>JSON.stringify({revision:1,last:'emboitement',pinned:'emboitement'}),setItem(){throw new Error('Quota')}};
  let record={};
  const history={get state(){return record},replaceState(next){record=next}};
  const store=createPreferenceStore({local:()=>local,history:()=>history});
  store.write({last:'montage',pinned:'montage'});
  const next=createPreferenceStore({local:()=>local,history:()=>history});
  assert.equal(next.read().pinned,'montage');
  assert.equal(record[PREFERENCE_HISTORY_KEY].revision,2);
});
test('a wholly unavailable persistence API still allows the current visit', () => {
  const denied=()=>{throw new Error('Blocked')};
  const store=createPreferenceStore({local:denied,session:denied,history:denied});
  store.write({last:'bifurcations',pinned:'bifurcations'});
  assert.equal(store.mode,'mémoire');
  assert.equal(store.read().pinned,'bifurcations');
});

test('all nested destinations and mounted explanations render with locally allowed markup', () => {
  const api={escape:String,apps:{finapp:{name:'Finapp'},garapp:{name:'Garapp'},branchlab:{name:'Branchlab'}},
    appLink:id=>'<a href="https://'+id+'.siniverse.cc">Ouvrir</a>',
    link:(state,label,attrs='')=>'<a href="'+routeHref(state)+'" '+attrs+'>'+label+'</a>'};
  for(const id of Object.keys(CONTENT)) {
    for(const html of [renderDepth(depthState(id),api),renderMontage(montageState({panels:[id]}),api)]) {
      assert(html.includes('view-title'));
      assert(!/\bstyle\s*=/.test(html),'Inline styles violate the scoped CSP.');
      assert(!html.includes('undefined'));
    }
  }
  const story=resolveStory(storyState(['achat','voiture','comparer','exemple']));
  assert(renderStory(storyState(['achat','voiture','comparer','exemple']),{...api,story}).includes('Deux chemins, un même horizon.'));
});
