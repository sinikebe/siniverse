import { APPS, contentFor } from './catalog.mjs';
import { NAVIGATION_KEY, normalizeState, parseRoute, routeHref } from './model.mjs';
import { mountPlan } from './plan.mjs';

const host = document.querySelector('#experience');
const previous = history.state?.[NAVIGATION_KEY];
const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward' && previous?.v === 1;
let state = restored ? normalizeState(previous.route) : parseRoute(location.search);
let mounted = null, revision = 0;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function snapshot(focus = document.activeElement?.id || 'view-title') {
  let view = null;
  try { view = mounted?.snapshot() ?? null; } catch { /* Navigation remains available after context loss. */ }
  return { v: 1, route: state, view, focus, scroll: [scrollX, scrollY] };
}

function writeHistory(method, record = snapshot()) {
  try { history[method]({ ...history.state, [NAVIGATION_KEY]: record }, '', routeHref(record.route)); }
  catch { document.querySelector('#navigation-status').textContent = 'Historique indisponible ici ; les liens directs restent utilisables.'; }
}

const api = {
  apps: APPS, content: contentFor, escape,
  get reducedMotion(){return matchMedia('(prefers-reduced-motion: reduce)').matches;},
  href: destination => routeHref({ ...state, ...destination }),
  navigate: (destination, options = {}) => navigate({ ...state, ...destination }, options),
  saveView: () => writeHistory('replaceState')
};

async function render(record, { instant = false } = {}) {
  const token = ++revision;
  document.documentElement.dataset.houseReady = 'false';
  host.setAttribute('aria-busy', 'true');
  try {
    if (!mounted) mounted = mountPlan(host, state, api);
    await mounted.update(state, { snapshot: record?.view ?? null, instant });
    if (token !== revision) return;
    const defaultFocus = state.room === 'garage' ? 'garage-screen-title' : 'view-title';
    (document.getElementById(record?.focus || defaultFocus) || document.getElementById('view-title'))?.focus({ preventScroll: true });
    if (record?.scroll) window.scrollTo({ left: record.scroll[0], top: record.scroll[1], behavior: 'instant' });
  } catch (error) {
    if (token !== revision) return;
    mounted?.destroy(); mounted = null;
    host.innerHTML = '<section class="scene-unavailable"><h1 id="view-title" tabindex="-1">La maison n’a pas pu s’ouvrir.</h1><p>Les applications restent accessibles.</p>'
      + Object.values(APPS).map(app => '<a href="' + app.url + '">Ouvrir ' + app.name + ' ↗</a>').join('') + '</section>';
    host.dataset.sceneError = error.message;
  }
  if (token === revision) {
    const roomTitles={gaming:'La salle gaming',office:'Le PC du bureau',garage:'Garapp au garage',street:'La rue depuis le seuil'};
    document.title = (APPS[state.app]?.name || roomTitles[state.room] || 'La maison') + ' — Siniverse';
    document.querySelector('#permalink').href = routeHref(state);
    document.documentElement.dataset.houseState = JSON.stringify(state);
    document.documentElement.dataset.houseReady = 'true';
    host.setAttribute('aria-busy', 'false');
    writeHistory('replaceState');
  }
}

async function navigate(destination, { focusId = 'view-title' } = {}) {
  const next = normalizeState(destination);
  writeHistory('replaceState');
  const same = JSON.stringify(next) === JSON.stringify(state);
  state = next;
  const record = { ...snapshot(focusId), view: null, scroll: focusId === 'view-title' ? [0, 0] : [scrollX, scrollY] };
  if (!same) writeHistory('pushState', record);
  await render(record);
}

window.addEventListener('popstate', event => {
  const record = event.state?.[NAVIGATION_KEY];
  state = record?.v === 1 ? normalizeState(record.route) : parseRoute(location.search);
  void render(record?.v === 1 ? record : null, { instant: true });
});
window.addEventListener('pagehide', () => writeHistory('replaceState'));
document.querySelector('.settings-links').addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!mounted || !link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const destination = parseRoute(new URL(link.href).search);
  event.preventDefault();
  link.closest('details').open = false;
  const focusId = { garage: 'garage-screen-title', office: 'office-desktop-title' }[destination.room] || 'view-title';
  void navigate(destination, { focusId });
});
Object.defineProperty(window, '__siniverseHouse', { value: Object.freeze({ inspect: options => ({ route: { ...state }, scene: mounted?.inspect(options) ?? { kind: 'unavailable' } }) }) });
await render(restored ? previous : null, { instant: true });
