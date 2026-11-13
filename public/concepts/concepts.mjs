import { APPS, CONCEPTS, HISTORY_EXAMPLE, chooseConcept, createPreferenceStore, filPaths, nextHistory, togglePin } from './model.mjs';
import { createInstrument } from './instrument.mjs';

const names = { instrument: 'Instrument', fil: 'Fil', machine: 'Machine' };
const store = createPreferenceStore({
  local: () => window.localStorage, session: () => window.sessionStorage, history: () => window.history
});
let preference = store.read();
const initial = chooseConcept(window.location.search, preference);
const current = initial.id;
let mode = initial.mode;
if (mode === 'rotation') preference = store.write(initial.preference);
document.documentElement.dataset.concept = current;
for (const id of CONCEPTS) document.getElementById('concept-' + id).hidden = id !== current;
for (const link of document.querySelectorAll('[data-concept-link]')) {
  if (link.dataset.conceptLink === current) link.setAttribute('aria-current', 'page');
}
const pinButton = document.getElementById('pin-theme');

function updatePreferenceStatus(resumed = false) {
  const pinnedHere = preference.pinned === current;
  pinButton.textContent = pinnedHere ? 'Reprendre la rotation' : 'Figer ce thème';
  pinButton.setAttribute('aria-pressed', String(pinnedHere));
  document.getElementById('view-mode').textContent =
    (mode === 'direct' ? 'Lien stable' : pinnedHere ? 'Thème figé' : 'Rotation') + ' · ' + (CONCEPTS.indexOf(current) + 1) + '/3';
  const scope = store.mode === 'local' ? 'Préférences locales à cet appareil.'
    : store.mode === 'session' || store.mode === 'onglet' ? 'Choix conservé pour cet onglet.'
      : 'Stockage indisponible : choix conservé pendant cette visite.';
  const saved = preference.pinned ? 'Thème mémorisé : ' + names[preference.pinned] + '. '
    : resumed ? 'Rotation reprise : le prochain rechargement affichera le suivant. '
      : 'La rotation avance à chaque rechargement de son mode. ';
  const direct = mode === 'direct' ? 'Ce lien examine ' + names[current] + ' sans modifier le thème mémorisé. ' : '';
  document.getElementById('preference-status').textContent =
    (initial.unknown ? 'Concept inconnu : première piste affichée. ' : '') + direct + saved + scope;
}
pinButton.addEventListener('click', () => {
  const resuming = preference.pinned === current;
  preference = store.write(togglePin(preference, current));
  if (resuming && mode === 'direct') {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('concept');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      mode = 'rotation';
    } catch { /* The explicit rotation link still works when history is blocked. */ }
  }
  updatePreferenceStatus(resuming && mode === 'rotation');
});
updatePreferenceStatus();

const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let reducedMotion = motionQuery?.matches ?? false;
const mobile = () => window.innerWidth <= 760;
const instrumentApp = document.querySelector('.instrument-app');
function positionInstrumentDescription() {
  const object = document.querySelector('.instrument-object');
  const copy = document.querySelector('.instrument-copy');
  if (mobile() && instrumentApp.parentElement !== object) object.insertBefore(instrumentApp, document.querySelector('.instrument-controls'));
  else if (!mobile() && instrumentApp.parentElement !== copy) copy.append(instrumentApp);
}
positionInstrumentDescription();
window.addEventListener('resize', positionInstrumentDescription, { passive: true });
const instrumentState = { intent: 'finapp', horizon: 10, history: 0, spread: false, view: false };
const instrument = current === 'instrument' ? createInstrument(document.getElementById('instrument-canvas'), {
  reducedMotion, ...instrumentState
}) : null;
if (instrument) document.getElementById('instrument-fallback').setAttribute('hidden', '');

function renderInstrument() {
  const app = APPS[instrumentState.intent];
  document.getElementById('concept-instrument').dataset.app = instrumentState.intent;
  for (const button of document.querySelectorAll('[data-intent]')) button.setAttribute('aria-pressed', String(button.dataset.intent === instrumentState.intent));
  for (const panel of document.querySelectorAll('[data-instrument-panel]')) panel.hidden = panel.dataset.instrumentPanel !== instrumentState.intent;
  document.getElementById('instrument-app-name').textContent = app.name.toUpperCase() + ' / ' + app.intent.toUpperCase();
  document.getElementById('instrument-pitch').textContent = app.pitch;
  document.getElementById('instrument-description').textContent = app.description;
  const open = document.getElementById('instrument-open');
  open.href = app.url; open.firstChild.nodeValue = 'Ouvrir ' + app.name + ' ';
  document.getElementById('instrument-position').textContent = String(Object.keys(APPS).indexOf(instrumentState.intent) + 1).padStart(2, '0');
  const example = HISTORY_EXAMPLE[instrumentState.history];
  document.getElementById('instrument-history').textContent = example.date + ' · ' + example.action + ' · ' + example.amount;
  const notes = instrumentState.intent === 'finapp' ? ['Scénario A', 'Scénario B']
    : instrumentState.intent === 'garapp' ? ['Repère ' + (instrumentState.history + 1), 'Historique fictif'] : ['Appareil', 'Écran'];
  document.getElementById('instrument-note-a').textContent = notes[0];
  document.getElementById('instrument-note-b').textContent = notes[1];
  const spread = document.getElementById('instrument-spread');
  spread.textContent = instrumentState.spread ? 'Rassembler les éléments' : 'Écarter les éléments';
  spread.setAttribute('aria-pressed', String(instrumentState.spread));
  document.getElementById('instrument-connection').textContent = instrumentState.spread
    ? 'Appareil → sortie vidéo → câble → entrée écran. Chaque rôle devient lisible.'
    : 'Une chaîne vidéo d’exemple : appareil → port → câble → entrée.';
  instrument?.update(instrumentState);
}
for (const button of document.querySelectorAll('[data-intent]')) button.addEventListener('click', () => {
  instrumentState.intent = button.dataset.intent; renderInstrument();
});
for (const button of document.querySelectorAll('[data-horizon]')) button.addEventListener('click', () => {
  instrumentState.horizon = Number(button.dataset.horizon);
  for (const other of document.querySelectorAll('[data-horizon]')) other.setAttribute('aria-pressed', String(other.dataset.horizon === button.dataset.horizon));
  for (const label of document.querySelectorAll('[data-horizon-text]')) label.textContent = button.dataset.horizon;
  updateFilPaths(); renderInstrument();
});
for (const button of document.querySelectorAll('[data-history]')) button.addEventListener('click', () => {
  instrumentState.history = nextHistory(instrumentState.history, Number(button.dataset.history)); renderInstrument();
});
document.getElementById('instrument-spread').addEventListener('click', () => {
  instrumentState.spread = !instrumentState.spread; renderInstrument();
});
document.getElementById('instrument-view').addEventListener('click', () => {
  instrumentState.view = !instrumentState.view; renderInstrument();
});
renderInstrument();
function updateFilPaths() {
  const paths = filPaths(instrumentState.horizon);
  for (const path of document.querySelectorAll('[data-fil-path]')) path.setAttribute('d', paths[path.dataset.filPath]);
}
updateFilPaths();

let chapter = 0;
const viewport = document.getElementById('fil-viewport');
const chapterButtons = [...document.querySelectorAll('[data-chapter]')];
const chapterNodes = chapterButtons.map((_, index) => document.getElementById('fil-chapter-' + index));
function setChapter(index) {
  chapter = Math.max(0, Math.min(2, index));
  chapterButtons.forEach((button, item) => {
    if (item === chapter) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('fil-count').textContent = String(chapter + 1).padStart(2, '0') + ' / 03';
  document.getElementById('fil-previous').disabled = chapter === 0;
  document.getElementById('fil-next').disabled = chapter === 2;
}
function goChapter(index) {
  setChapter(index);
  if (mobile()) chapterNodes[chapter].scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  else viewport.scrollTo({ left: chapterNodes[chapter].offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
}
chapterButtons.forEach((button, index) => button.addEventListener('click', () => goChapter(index)));
document.getElementById('fil-previous').addEventListener('click', () => goChapter(chapter - 1));
document.getElementById('fil-next').addEventListener('click', () => goChapter(chapter + 1));
viewport.addEventListener('scroll', () => {
  if (!mobile() && viewport.clientWidth) setChapter(Math.round(viewport.scrollLeft / viewport.clientWidth));
}, { passive: true });
setChapter(0);
if (current === 'fil' && 'IntersectionObserver' in window) {
  const ratios = new Map();
  const observer = new IntersectionObserver(entries => {
    if (!mobile()) return;
    for (const entry of entries) ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
    const best = chapterNodes.reduce((selected, node) => (ratios.get(node) || 0) > (ratios.get(selected) || 0) ? node : selected, chapterNodes[0]);
    if ((ratios.get(best) || 0) > 0) setChapter(chapterNodes.indexOf(best));
  }, { threshold: [0, .25, .5, .75] });
  chapterNodes.forEach(node => observer.observe(node));
}
for (const button of document.querySelectorAll('[data-unfold]')) {
  const initialLabel = button.firstChild.nodeValue.trim();
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
    button.firstChild.nodeValue = (open ? 'Replier les détails' : initialLabel) + ' ';
  });
}

let wheelSteps = 0;
const pulseTimers = new Map();
let activeMechanism = document.querySelector('.mechanism-finapp');
const machineOutput = document.getElementById('machine-output');
function positionMachineOutput() {
  const target = mobile() ? activeMechanism : document.querySelector('.machine-board');
  if (machineOutput.parentElement !== target) target.append(machineOutput);
}
positionMachineOutput();
window.addEventListener('resize', positionMachineOutput, { passive: true });
for (const button of document.querySelectorAll('[data-machine]')) button.addEventListener('click', () => {
  const id = button.dataset.machine, app = APPS[id], mechanism = button.closest('.mechanism');
  activeMechanism = mechanism; positionMachineOutput();
  let result;
  if (id === 'finapp') {
    mechanism.classList.toggle('is-compared');
    result = 'À horizon commun de 10 ans, l’aiguillage compare un effort constant et un effort progressif.';
  } else if (id === 'garapp') {
    const example = HISTORY_EXAMPLE[wheelSteps % HISTORY_EXAMPLE.length];
    wheelSteps++;
    document.getElementById('machine-wheel').setAttribute('transform', 'rotate(' + (wheelSteps % 4) * 90 + ' 158 113)');
    result = example.date + ' — ' + example.action + ' — ' + example.amount + '. Un repère vient rejoindre l’historique d’exemple.';
  } else {
    mechanism.classList.remove('is-linked');
    if (reducedMotion) mechanism.classList.add('is-linked');
    else { void mechanism.offsetWidth; requestAnimationFrame(() => mechanism.classList.add('is-linked')); }
    result = 'Appareil → sortie vidéo → câble → entrée écran. Les pièces se rejoignent, le rôle de chaque élément apparaît.';
  }
  clearTimeout(pulseTimers.get(mechanism));
  mechanism.classList.remove('is-pulsing');
  if (!reducedMotion) {
    void mechanism.offsetWidth; mechanism.classList.add('is-pulsing');
    pulseTimers.set(mechanism, setTimeout(() => mechanism.classList.remove('is-pulsing'), 800));
  }
  document.getElementById('machine-output').dataset.app = id;
  document.getElementById('machine-output-label').textContent = 'DÉCLIC / ' + app.name.toUpperCase() + ' / EXEMPLE FICTIF';
  document.getElementById('machine-output-text').textContent = result;
  const link = document.getElementById('machine-open');
  link.href = app.url; link.firstChild.nodeValue = 'Ouvrir ' + app.name + ' ';
});
motionQuery?.addEventListener?.('change', event => {
  reducedMotion = event.matches;
  instrument?.setReducedMotion(reducedMotion);
  document.getElementById('instrument-view').hidden = reducedMotion;
  if (reducedMotion) for (const mechanism of document.querySelectorAll('.is-pulsing')) mechanism.classList.remove('is-pulsing');
});

document.getElementById('instrument-view').hidden = reducedMotion;

document.documentElement.dataset.conceptsReady = 'true';
