import { APPS, TITLES, CONTENT, NAVIGATION_KEY, PREFERENCE_HISTORY_KEY, normalizeState, parseRoute, routeHref,
  selection, createPreferenceStore, depthState, storyState, openSurface, resolveStory } from './model.mjs';
import { escape, renderDepth, renderMontage } from './views.mjs';
import { renderStory } from './story.mjs';

const host = document.querySelector('#experience');
const preferences = createPreferenceStore({ local: () => localStorage, session: () => sessionStorage, history: () => history });
const previous = history.state?.[NAVIGATION_KEY];
const fromHistory = performance.getEntriesByType('navigation')[0]?.type === 'back_forward' && previous?.v === 2;
const chosen = fromHistory ? { concept: previous.route.concept, mode: previous.mode, preference: preferences.read() }
  : selection(location.search, preferences.read());
let state = fromHistory ? normalizeState(previous.route) : parseRoute(location.search, chosen.concept);
let mode = chosen.mode;
let renderNumber = 0;
let lastTransition = null;
if (!fromHistory && mode === 'rotation') preferences.write(chosen.preference);

function snapshot(focus = document.activeElement?.id || 'view-title') {
  return { v: 2, route: state, mode, focus, scroll: [scrollX, scrollY] };
}
function historyWrite(method, record = snapshot()) {
  const saved = { ...history.state, [PREFERENCE_HISTORY_KEY]: preferences.read(), [NAVIGATION_KEY]: record };
  try { history[method](saved, '', routeHref(record.route, { rotation: record.mode === 'rotation' })); }
  catch {
    // A denied history API still leaves valid native links and an in-page route.
    document.querySelector('#navigation-status').textContent = 'Historique indisponible dans ce navigateur ; les liens directs restent utilisables.';
  }
}
function appLink(id, label) {
  const app = APPS[id];
  return app ? '<a class="real-app-link" href="' + app.url + '">' + escape(label || 'Ouvrir ' + app.name)
    + ' <span aria-hidden="true">↗</span><span class="sr-only">, application sur son propre site</span></a>' : '';
}
function api() {
  let index = 0;
  return { escape, apps: APPS, detail: id => CONTENT[id], story: resolveStory(state.concept === 'bifurcations' ? state : storyState()),
    appLink, link: (destination, label, attributes = '') => {
      const href = routeHref(destination, { rotation: mode === 'rotation' });
      const id = /(?:^|\s)id\s*=/.test(attributes) ? '' : ' id="nav-' + (++index) + '"';
      return '<a href="' + escape(href) + '" data-nav' + id + ' ' + attributes + '>' + label + '</a>';
    } };
}
function appDestination(app) {
  return state.concept === 'emboitement' ? depthState(app) : state.concept === 'bifurcations' ? storyState([app]) : openSurface(state, app);
}
function syncControls() {
  const saved = preferences.read(), pinned = saved.pinned === state.concept;
  document.querySelector('#pin-theme').textContent = pinned ? 'Reprendre la rotation' : 'Figer ce parcours';
  document.querySelector('#pin-theme').setAttribute('aria-pressed', String(pinned));
  const resume = document.querySelector('#resume-rotation');
  resume.hidden = pinned || (mode === 'rotation' && !saved.pinned);
  resume.textContent = saved.pinned && !pinned ? 'Reprendre la rotation' : 'Tester la rotation';
  document.querySelector('#theme-state').textContent = mode === 'direct'
    ? 'Lien direct : ' + TITLES[state.concept] + '. ' + (saved.pinned ? 'Parcours figé : ' + TITLES[saved.pinned] + '.' : 'La rotation reste indépendante.')
    : saved.pinned ? TITLES[saved.pinned] + ' reste figé aux rechargements.' : 'Rotation : le prochain rechargement ouvre le parcours suivant.';
  document.querySelector('#storage-state').textContent = preferences.mode === 'local' ? 'Préférence sur cet appareil.'
    : preferences.mode === 'mémoire' ? 'Stockage indisponible : préférence pour cette visite seulement.' : 'Préférence dans cet onglet.';
  document.querySelector('#permalink').href = routeHref(state);
}
function render(record) {
  const data = api();
  document.documentElement.dataset.navigationConcept = state.concept;
  document.documentElement.dataset.navigationReady = 'false';
  host.innerHTML = state.concept === 'emboitement' ? renderDepth(state, data)
    : state.concept === 'bifurcations' ? renderStory(state, data) : renderMontage(state, data);
  document.title = TITLES[state.concept] + ' — Siniverse';
  const room = host.querySelector('.depth-room');
  if (room) room.style.viewTransitionName = 'depth-' + state.node.replaceAll('.', '-');
  for (const region of host.querySelectorAll('[data-region]')) region.style.viewTransitionName = 'depth-' + region.dataset.region.replaceAll('.', '-');
  const quick = document.querySelector('#quick-apps');
  quick.innerHTML = Object.entries(APPS).map(([id, app]) => '<a data-nav href="' + escape(routeHref(appDestination(id), { rotation: mode === 'rotation' }))
    + '" id="quick-' + id + '">' + app.name + '</a>').join('');
  for (const surface of host.querySelectorAll('[data-surface]')) surface.style.viewTransitionName = 'montage-' + surface.dataset.surface.replaceAll('.', '-');
  syncControls();
  const focus = document.getElementById(record?.focus || 'view-title') || document.querySelector('#view-title');
  focus?.focus({ preventScroll: true });
  window.scrollTo({ left: record?.scroll?.[0] || 0, top: record?.scroll?.[1] || 0, behavior: 'instant' });
  document.documentElement.dataset.navigationState = JSON.stringify(state);
  document.documentElement.dataset.navigationRevision = String(++renderNumber);
  document.documentElement.dataset.navigationReady = 'true';
}
async function navigate(destination) {
  const next = normalizeState(destination);
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  historyWrite('replaceState');
  lastTransition?.skipTransition();
  state = next;
  const record = { ...snapshot('view-title'), scroll: [0, 0] };
  historyWrite('pushState', record);
  const canTransition = !matchMedia('(prefers-reduced-motion: reduce)').matches && typeof document.startViewTransition === 'function';
  if (canTransition) {
    const transition = document.startViewTransition(() => {
      if (state !== next) return;
      render(record);
      document.documentElement.dataset.navigationReady = 'false';
    });
    lastTransition = transition;
    try { await transition.finished; } catch { /* A fast next navigation can skip the preceding animation. */ }
    if (lastTransition === transition) {
      lastTransition = null;
      document.documentElement.dataset.navigationReady = 'true';
    }
  } else render(record);
}
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[data-nav]');
  if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = new URL(anchor.getAttribute('href'), location.href);
  if (target.origin !== location.origin || target.pathname !== location.pathname) return;
  event.preventDefault();
  void navigate(parseRoute(target.search, state.concept));
});
window.addEventListener('popstate', event => {
  lastTransition?.skipTransition();
  const record = event.state?.[NAVIGATION_KEY];
  if (record?.v === 2) { state = normalizeState(record.route); mode = record.mode === 'rotation' ? 'rotation' : 'direct'; render(record); }
  else { state = parseRoute(location.search, state.concept); render(); }
});
function resumeRotation() {
  preferences.write({ ...preferences.read(), last: state.concept, pinned: null });
  mode = 'rotation'; historyWrite('replaceState'); syncControls();
  document.querySelector('#navigation-status').textContent = 'Le parcours reste ici. La rotation reprendra au prochain rechargement.';
}
document.querySelector('#pin-theme').addEventListener('click', () => {
  if (preferences.read().pinned === state.concept) resumeRotation();
  else {
    preferences.write({ ...preferences.read(), last: state.concept, pinned: state.concept });
    historyWrite('replaceState'); syncControls();
    document.querySelector('#navigation-status').textContent = TITLES[state.concept] + ' est figé.';
  }
});
document.querySelector('#resume-rotation').addEventListener('click', resumeRotation);
render(fromHistory ? previous : null);
historyWrite('replaceState', fromHistory ? previous : snapshot('view-title'));
