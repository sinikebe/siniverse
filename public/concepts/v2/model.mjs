export const CONCEPTS = ['emboitement', 'bifurcations', 'montage'];
export const TITLES = { emboitement: 'L’Emboîtement', bifurcations: 'Les Bifurcations', montage: 'Le Montage parallèle' };
export const PREFERENCE_KEY = 'siniverse.navigation-concepts.v2';
export const PREFERENCE_HISTORY_KEY = '__siniverseNavigationPreferenceV2';
export const NAVIGATION_KEY = '__siniverseNavigationV2';
export const APPS = {
  finapp: { name: 'Finapp', url: 'https://finapp.siniverse.cc', source: 'https://github.com/sinikebe/finapp', verb: 'Prévoir', color: 'blue' },
  garapp: { name: 'Garapp', url: 'https://garapp.siniverse.cc', source: 'https://github.com/sinikebe/Garapp', verb: 'Retrouver', color: 'clay' },
  branchlab: { name: 'Branchlab', url: 'https://branchlab.siniverse.cc', source: null, verb: 'Relier', color: 'violet' }
};

export const CONTENT = {
  ensemble: { id: 'ensemble', app: null, eyebrow: 'SINIVERSE', title: 'Trois outils. Plusieurs façons de comprendre.',
    body: ['Prévoir un choix, retrouver un événement, comprendre une liaison. Entrez dans une question, puis dans ce qui l’éclaire.'],
    facts: [] },
  finapp: { id: 'finapp', app: 'finapp', eyebrow: 'AVANT DE DÉCIDER', title: 'Donner un horizon à ses choix.',
    body: ['Acheter ou louer, épargner, changer de voiture : Finapp met deux scénarios en regard et montre comment le budget et le patrimoine peuvent évoluer.',
      'Un même horizon rend les hypothèses comparables. L’application reste l’endroit où vous saisissez vos propres scénarios.'],
    facts: [{ label: 'À explorer', value: 'Horizon · scénarios · écarts' }], related: { app: 'garapp', label: 'Et après l’achat du véhicule ?' } },
  'finapp.role': { id: 'finapp.role', app: 'finapp', eyebrow: 'LE RÔLE', title: 'Comparer avant de choisir.',
    body: ['Une dépense immédiate et un engagement étalé ne racontent pas la même histoire. Finapp aide à poser deux scénarios avec les mêmes repères.',
      'Le budget et le patrimoine se lisent dans le temps, à partir des hypothèses que vous choisissez.'],
    facts: [{ label: 'Question', value: 'Que change ce choix au fil du temps ?' }] },
  'finapp.methode': { id: 'finapp.methode', app: 'finapp', eyebrow: 'LA MÉTHODE', title: 'Même horizon, hypothèses visibles.',
    body: ['Définissez les deux scénarios, choisissez un horizon commun, puis regardez leur évolution et leurs écarts.',
      'Le portail explique cette lecture ; les calculs et les paramètres appartiennent à Finapp.'],
    facts: [{ label: '1', value: 'Poser deux scénarios' }, { label: '2', value: 'Partager un horizon' }, { label: '3', value: 'Lire les écarts' }] },
  'finapp.exemple': { id: 'finapp.exemple', app: 'finapp', eyebrow: 'EXEMPLE FICTIF', title: 'Deux chemins, un même horizon.',
    body: ['Camille hésite entre acheter une voiture et conserver une solution de location. À dix ans, les deux approches ne répartissent ni les dépenses ni le patrimoine de la même façon.',
      'L’exemple met en regard deux façons de lire le même choix, sans projection chiffrée.'],
    facts: [{ label: 'Scénario A', value: 'Acheter' }, { label: 'Scénario B', value: 'Louer' }, { label: 'Horizon commun', value: '10 ans' }],
    related: { app: 'garapp', label: 'Après le choix, conserver son historique' } },
  garapp: { id: 'garapp', app: 'garapp', eyebrow: 'AU FIL DES JOURS', title: 'Un véhicule laisse des repères.',
    body: ['Garapp rassemble interventions, pièces et documents des véhicules. Le carburant, l’assurance et les dépenses y trouvent aussi leur place.',
      'Une date, une intervention, un justificatif : ce qui était dispersé devient plus facile à retrouver.'],
    facts: [{ label: 'À explorer', value: 'Historique · dépenses · documents' }], related: { app: 'finapp', label: 'Revenir à un choix à anticiper' } },
  'garapp.role': { id: 'garapp.role', app: 'garapp', eyebrow: 'LE RÔLE', title: 'Retrouver plutôt que se souvenir.',
    body: ['Quelle intervention a été faite, avec quelle pièce et à quelle date ? Garapp conserve ces repères avec les documents utiles.',
      'Il prolonge le suivi d’un véhicule, sans confondre une dépense prévue et une intervention enregistrée.'],
    facts: [{ label: 'Question', value: 'Qu’a-t-on fait, quand et pour combien ?' }] },
  'garapp.methode': { id: 'garapp.methode', app: 'garapp', eyebrow: 'LA MÉTHODE', title: 'Rattacher chaque trace au véhicule.',
    body: ['Ajoutez un repère daté, une dépense et, si besoin, un document. Retrouvez ensuite le fil par véhicule.',
      'Un historique structuré facilite la lecture des entretiens et des dépenses dans la durée.'],
    facts: [{ label: 'Repère', value: 'Date et intervention' }, { label: 'Contexte', value: 'Pièce, dépense, document' }] },
  'garapp.exemple': { id: 'garapp.exemple', app: 'garapp', eyebrow: 'HISTORIQUE FICTIF', title: 'Un repère qui reste lisible.',
    body: ['Le 24 avril 2026, Camille remplace les essuie-glaces de son véhicule. La dépense de 34 € et le justificatif rejoignent le même repère.',
      'Ce ticket est un exemple de ce que l’on retrouve dans un historique, pas une donnée provenant de Garapp.'],
    facts: [{ label: '24 avril 2026', value: 'Essuie-glaces' }, { label: 'Dépense d’exemple', value: '34 €' }, { label: 'Trace', value: 'Justificatif joint' }] },
  branchlab: { id: 'branchlab', app: 'branchlab', eyebrow: 'ENTRE DEUX APPAREILS', title: 'Voir le rôle de chaque liaison.',
    body: ['Branchlab représente appareils, ports et câbles pour comprendre les compatibilités et les limites d’une installation.',
      'Sa première version se concentre sur les connexions vidéo directes couvertes par son catalogue et ses sources.'],
    facts: [{ label: 'À explorer', value: 'Appareil · port · câble · écran' }], related: { app: 'finapp', label: 'Et si le prochain choix était un achat ?' } },
  'branchlab.role': { id: 'branchlab.role', app: 'branchlab', eyebrow: 'LE RÔLE', title: 'Une chaîne n’est pas qu’un câble.',
    body: ['Le signal part d’un appareil, emprunte une sortie, traverse un câble et rejoint l’entrée d’un écran. Chaque élément peut imposer une limite.',
      'Dessiner cette chaîne rend ses rôles visibles avant de chercher ce qui est compatible.'],
    facts: [{ label: 'Question', value: 'Que relie-t-on, et par quels éléments ?' }] },
  'branchlab.methode': { id: 'branchlab.methode', app: 'branchlab', eyebrow: 'LA MÉTHODE', title: 'Représenter, puis lire les sources.',
    body: ['Placez les appareils et leurs ports, reliez-les, puis consultez les informations et le diagnostic vidéo sourcé pour le périmètre couvert.',
      'Une compatibilité dépend des références et des caractéristiques prises en compte ; le catalogue n’est pas universel.'],
    facts: [{ label: 'Représentation', value: 'Éléments et liaisons' }, { label: 'Explication', value: 'Limites et sources' }] },
  'branchlab.exemple': { id: 'branchlab.exemple', app: 'branchlab', eyebrow: 'LIAISON FICTIVE', title: 'Suivre un signal, élément par élément.',
    body: ['Un ordinateur rejoint un écran par une sortie DisplayPort et un câble. L’exemple distingue la source, la sortie, le câble et l’entrée.',
      'Ouvrez Branchlab pour représenter une installation avec les références disponibles dans son catalogue.'],
    facts: [{ label: 'Source', value: 'Ordinateur' }, { label: 'Sortie → câble', value: 'DisplayPort' }, { label: 'Destination', value: 'Entrée de l’écran' }] }
};
export const NODE_IDS = Object.keys(CONTENT);
export const detail = id => Object.hasOwn(CONTENT, id) ? CONTENT[id] : null;
export const depthState = (node = 'ensemble') => ({ concept: 'emboitement', node: NODE_IDS.includes(node) ? node : 'ensemble' });
export const parentNode = node => node.includes('.') ? node.split('.')[0] : 'ensemble';
export const storyState = (trail = []) => ({ concept: 'bifurcations', trail: cleanTrail(trail) });

const STORY = {
  '': { title: 'Et si l’on commençait par une situation ?', lead: 'Choisissez une phrase. Elle devient le début du chemin.', kind: 'opening',
    choices: [['achat', 'Je prépare un achat', 'Avant de décider'], ['vehicule', 'Je m’occupe d’un véhicule', 'Au fil du temps'], ['video', 'Je relie un écran', 'Entre les appareils']] },
  achat: { label: 'Je prépare un achat', title: 'Ce que l’on s’apprête à choisir.', lead: 'Le contexte donne une direction à la suite.', kind: 'branch',
    choices: [['voiture', 'Une voiture', 'Un choix aujourd’hui, un suivi demain'], ['installation', 'Une installation vidéo', 'Comprendre la liaison avant de s’équiper']] },
  'achat/voiture': { label: 'Une voiture', title: 'Avant ou après le choix ?', lead: 'Les mêmes objets peuvent appeler des questions différentes.', kind: 'branch',
    choices: [['comparer', 'Comparer avant de décider', 'Mettre deux scénarios au même horizon'], ['suivre', 'Conserver ce qui a été fait', 'Retrouver les interventions et les dépenses']] },
  'achat/installation': { label: 'Une installation vidéo', title: 'Ce qui compte entre les appareils.', lead: 'Suivons la liaison, plutôt qu’une référence isolée.', kind: 'branch',
    choices: [['relier', 'Comprendre comment les relier', 'Appareils, ports et câble']] },
  video: { label: 'Je relie un écran', title: 'Entre la source et l’image.', lead: 'Une liaison est une suite de rôles à comprendre.', kind: 'branch',
    choices: [['relier', 'Suivre la chaîne vidéo', 'De la sortie de l’appareil à l’entrée de l’écran']] }
};
const appStory = (app, label) => ({ label, app, kind: 'app', content: app,
  title: CONTENT[app].title, lead: CONTENT[app].body[0],
  choices: app === 'finapp'
    ? [['exemple', 'Voir ce qui change avec l’horizon', 'Un exemple fictif à dix ans'], ['methode', 'Pourquoi comparer ainsi ?', 'Deux scénarios, des repères communs'], ['suivre', 'Et après l’achat ?', 'Continuer vers l’historique du véhicule']]
    : app === 'garapp'
      ? [['historique', 'Retrouver une intervention', 'Déplier un repère daté'], ['methode', 'Comment garder le fil ?', 'Lier dates, dépenses et documents'], ['prevoir', 'Et le prochain choix ?', 'Revenir à la prévision']]
      : [['exemple', 'Suivre une liaison', 'Source, port, câble, entrée'], ['methode', 'Sur quoi repose l’explication ?', 'Catalogue et sources du diagnostic']] });
for (const prefix of ['achat/voiture/comparer', 'finapp']) {
  STORY[prefix] = appStory('finapp', prefix === 'finapp' ? 'Finapp, directement' : 'Comparer avant de décider');
  STORY[prefix + '/suivre'] = appStory('garapp', 'Et après l’achat ?');
  STORY[prefix + '/suivre/historique'] = { label: 'Un repère d’historique', app: 'garapp', kind: 'example', content: 'garapp.exemple', choices: [] };
  STORY[prefix + '/suivre/methode'] = { label: 'Garder le fil', app: 'garapp', kind: 'method', content: 'garapp.methode', choices: [] };
}
for (const prefix of ['vehicule', 'garapp', 'achat/voiture/suivre']) {
  STORY[prefix] = appStory('garapp', prefix === 'vehicule' ? 'Je m’occupe d’un véhicule' : prefix === 'garapp' ? 'Garapp, directement' : 'Conserver ce qui a été fait');
}
for (const prefix of ['video/relier', 'achat/installation/relier', 'branchlab']) {
  STORY[prefix] = appStory('branchlab', prefix === 'branchlab' ? 'Branchlab, directement' : 'Comprendre la liaison');
}
for (const [path, entry] of Object.entries(STORY)) {
  if (entry.kind !== 'app') continue;
  const app = entry.app;
  for (const [suffix, label] of app === 'garapp'
    ? [['historique', 'Un repère d’historique'], ['methode', 'Garder le fil']]
    : [['exemple', app === 'finapp' ? 'Un horizon commun' : 'La chaîne vidéo'], ['methode', 'Comprendre la méthode']]) {
    STORY[path + '/' + suffix] ||= { label, app, kind: suffix === 'methode' ? 'method' : 'example',
      content: app + '.' + (suffix === 'historique' ? 'exemple' : suffix),
      choices: app === 'finapp' ? [['suivre', 'Et après l’achat ?', 'Continuer vers l’historique']] : [] };
    if (app === 'finapp') {
      STORY[path + '/' + suffix + '/suivre'] = appStory('garapp', 'Et après l’achat ?');
      STORY[path + '/' + suffix + '/suivre/historique'] = { label: 'Un repère d’historique', app: 'garapp', kind: 'example', content: 'garapp.exemple', choices: [] };
      STORY[path + '/' + suffix + '/suivre/methode'] = { label: 'Garder le fil', app: 'garapp', kind: 'method', content: 'garapp.methode', choices: [] };
    }
  }
}
for (const entry of Object.values(STORY)) {
  if (entry.choices?.some(choice => choice[0] === 'prevoir')) {
    entry.choices = entry.choices.filter(choice => choice[0] !== 'prevoir');
    entry.related = { trail: ['finapp'], label: 'Et le prochain choix ?' };
  }
}
export function cleanTrail(value) {
  if (!Array.isArray(value)) return [];
  const clean = [];
  for (const part of value.slice(0, 8)) {
    if (typeof part !== 'string' || !/^[a-z]+$/.test(part)) break;
    const next = [...clean, part];
    if (!STORY[next.join('/')]) break;
    clean.push(part);
  }
  return clean;
}
export function resolveStory(state) {
  const path = cleanTrail(state.trail), entry = STORY[path.join('/')];
  const content = detail(entry.content);
  return { title: entry.title || content?.title, lead: entry.lead || content?.body[0], app: entry.app || null,
    kind: entry.kind, nodeId: entry.content || path.join('/') || 'debut', content,
    trail: [{ label: 'Au début', state: storyState() }, ...path.map((_, index) => {
      const prefix = path.slice(0, index + 1);
      return { label: STORY[prefix.join('/')].label, state: storyState(prefix) };
    })],
    choices: [...(entry.choices || []).map(([id, label, note]) => ({ label, note, state: storyState([...path, id]) })),
      ...(entry.related ? [{ label: entry.related.label, note: 'Une autre question', state: storyState(entry.related.trail) }] : [])] };
}

export function montageState(value = {}) {
  const panels = [...new Set((Array.isArray(value.panels) ? value.panels : ['ensemble']).filter(id => NODE_IDS.includes(id)))].slice(0, 3);
  if (!panels.length) panels.push('ensemble');
  const kept = [...new Set((Array.isArray(value.kept) ? value.kept : []).filter(id => panels.includes(id)))].slice(0, 2);
  const focus = panels.includes(value.focus) ? value.focus : panels.at(-1);
  const origins = {};
  for (const id of panels) {
    const source = value.origins?.[id];
    if (NODE_IDS.includes(source) && source !== id) origins[id] = source;
  }
  return { concept: 'montage', panels, kept, focus, origins };
}
export function openSurface(state, node, source = state.focus) {
  const saved = montageState(state);
  if (!NODE_IDS.includes(node)) return saved;
  if (saved.panels.includes(node)) return montageState({ ...saved, focus: node });
  const panels = [...saved.panels];
  if (panels.length === 3) {
    const remove = panels.find(id => !saved.kept.includes(id) && id !== source) || panels.find(id => !saved.kept.includes(id));
    panels.splice(panels.indexOf(remove), 1);
  }
  const fromIndex = panels.indexOf(source);
  panels.splice(fromIndex < 0 ? panels.length : fromIndex + 1, 0, node);
  return montageState({ ...saved, panels, focus: node, origins: { ...saved.origins, [node]: source } });
}
export function keepSurface(state, node) {
  const saved = montageState(state);
  const kept = saved.kept.includes(node) ? saved.kept.filter(id => id !== node)
    : [...saved.kept.slice(-1), node];
  return montageState({ ...saved, kept });
}
export function closeSurface(state, node) {
  const saved = montageState(state), index = saved.panels.indexOf(node);
  const panels = saved.panels.filter(id => id !== node);
  return montageState({ ...saved, panels, focus: saved.focus === node ? panels[Math.max(0, index - 1)] : saved.focus });
}
export function initialState(concept) {
  return concept === 'bifurcations' ? storyState() : concept === 'montage' ? montageState() : depthState();
}
export function normalizeState(value) {
  return value?.concept === 'montage' ? montageState(value)
    : value?.concept === 'bifurcations' ? storyState(value.trail) : depthState(value?.node);
}
export function parseRoute(search, resolvedConcept) {
  const query = new URLSearchParams(search);
  const concept = CONCEPTS.includes(query.get('concept')) ? query.get('concept')
    : CONCEPTS.includes(resolvedConcept) ? resolvedConcept : CONCEPTS[0];
  if (concept === 'emboitement') return depthState(query.get('lieu'));
  if (concept === 'bifurcations') return storyState((query.get('chemin') || '').split('/').filter(Boolean));
  const origins = {};
  for (const pair of (query.get('depuis') || '').split(',')) {
    const [id, source] = pair.split(':');
    if (NODE_IDS.includes(id) && NODE_IDS.includes(source)) origins[id] = source;
  }
  return montageState({ panels: query.has('avec') ? query.get('avec').split(',') : ['ensemble'],
    focus: query.get('focus'), kept: (query.get('garder') || '').split(','), origins });
}
export function routeHref(value, { rotation = false } = {}) {
  const state = normalizeState(value), query = new URLSearchParams();
  if (!rotation) query.set('concept', state.concept);
  if (state.concept === 'emboitement' && state.node !== 'ensemble') query.set('lieu', state.node);
  if (state.concept === 'bifurcations' && state.trail.length) query.set('chemin', state.trail.join('/'));
  if (state.concept === 'montage') {
    if (state.panels.join(',') !== 'ensemble') query.set('avec', state.panels.join(','));
    if (state.focus !== state.panels.at(-1)) query.set('focus', state.focus);
    if (state.kept.length) query.set('garder', state.kept.join(','));
    const pairs = state.panels.filter(id => state.origins[id]).map(id => id + ':' + state.origins[id]);
    if (pairs.length) query.set('depuis', pairs.join(','));
  }
  return '/concepts/v2/explore.html' + (query.size ? '?' + query : '');
}
export function selection(search, saved) {
  const query = new URLSearchParams(search);
  const requested = query.get('concept');
  if (query.has('concept')) return { concept: CONCEPTS.includes(requested) ? requested : CONCEPTS[0],
    mode: 'direct', preference: saved, unknown: !CONCEPTS.includes(requested) };
  const concept = CONCEPTS.includes(saved?.pinned) ? saved.pinned : CONCEPTS[(CONCEPTS.indexOf(saved?.last) + 1) % CONCEPTS.length];
  return { concept, mode: 'rotation', unknown: false, preference: { ...saved, last: concept } };
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
