const RECORDS = [
  { date: '12 mars', title: 'Révision', detail: 'Vidange et filtre à huile', amount: '148 €', type: 'Entretien' },
  { date: '28 juin', title: 'Deux pneus', detail: 'Remplacement du train avant', amount: '216 €', type: 'Réparation' },
  { date: '4 octobre', title: 'Assurance', detail: 'La dépense mensuelle, au même endroit', amount: '42 €', type: 'Assurance' },
];

// The garage notebook is an explicitly fictional demonstration.
export function createHouseInteractions(host, world, house, api, { onRead, onExit, onChange }) {
  let active = null, page = 0, revision = 0, destroyed = false;
  const surfaces = new Map();
  const dock = document.createElement('div'); dock.className = 'house-demo-dock'; dock.hidden = true;
  dock.innerHTML = '<span id="plan-demo-location"></span><button type="button" id="plan-demo-close">Revenir dans la pièce <span aria-hidden="true">×</span></button>';
  host.append(dock); dock.querySelector('button').addEventListener('click', onExit);
  const surfacesMarkup = {
    garapp: '<header><span>GARAPP / CARNET</span><small>EXEMPLE FICTIF</small></header><div class="demo-page"><span id="plan-demo-date"></span><h2 id="plan-demo-record"></h2><p id="plan-demo-detail"></p><strong id="plan-demo-amount"></strong><small id="plan-demo-type"></small></div><nav class="demo-pagination" aria-label="Feuilleter le carnet"><button id="plan-demo-previous" type="button" aria-label="Intervention précédente">←</button><output id="plan-demo-page" aria-live="polite"></output><button id="plan-demo-next" type="button" aria-label="Intervention suivante">→</button></nav><footer><button id="plan-demo-read-garapp" type="button">Découvrir Garapp ↗</button></footer>',
  };
  for (const [app, markup] of Object.entries(surfacesMarkup)) {
    const element = document.createElement('section'); element.className = 'house-demo demo-' + app;
    element.setAttribute('aria-label', 'Essayer ' + api.apps[app].name + ' sur son support');
    element.innerHTML = markup;
    const handle = world.surface({ ...house.surfaces[app], pixels: 320 }, element); handle.setEnabled(false);
    surfaces.set(app, { element, handle });
    element.querySelector('#plan-demo-read-' + app).addEventListener('click', event => onRead(app, event.currentTarget));
  }
  const record = surfaces.get('garapp').element;
  function paintRecord() {
    const value = RECORDS[page];
    for (const [key, text] of Object.entries({ date: value.date, record: value.title, detail: value.detail, amount: value.amount, type: value.type, page: (page + 1) + ' / ' + RECORDS.length })) record.querySelector('#plan-demo-' + key).textContent = text;
    record.querySelector('#plan-demo-previous').disabled = page === 0;
    record.querySelector('#plan-demo-next').disabled = page === RECORDS.length - 1;
  }
  function turn(delta) {
    const next = Math.max(0, Math.min(RECORDS.length - 1, page + delta)); if (next === page) return;
    page = next; paintRecord(); onChange();
    if (!api.reducedMotion) record.querySelector('.demo-page').animate([{ opacity: .15, translate: (delta * 12) + 'px 0' }, { opacity: 1, translate: '0 0' }], { duration: 260, easing: 'ease-out' });
  }
  record.querySelector('#plan-demo-previous').addEventListener('click', () => turn(-1));
  record.querySelector('#plan-demo-next').addEventListener('click', () => turn(1));
  paintRecord();

  function close({ instant = false } = {}) {
    const previous = active; active = null; revision++; dock.hidden = true;
    for (const { handle } of surfaces.values()) handle.setEnabled(false);
    if (previous === 'garapp') {
      const from = house.inspectObjects().notebookAmount, token = revision;
      void world.animate(instant ? 0 : 340, t => { if (!destroyed && token === revision) house.setNotebook(from * (1 - t)); });
    }
    world.requestRender();
  }
  async function open(app, { instant = false, focus = true, snapshot = null } = {}) {
    close({ instant: true }); if (destroyed || !surfaces.has(app)) return;
    page = Number.isInteger(snapshot?.page) ? Math.max(0, Math.min(RECORDS.length - 1, snapshot.page)) : page;
    active = app; const token = ++revision;
    dock.hidden = false; dock.querySelector('span').textContent = 'Au garage / le carnet';
    paintRecord();
    if (app === 'garapp') await world.animate(instant ? 0 : 600, t => { if (!destroyed && token === revision) house.setNotebook(t * t * (3 - 2 * t)); });
    if (destroyed || token !== revision) return;
    const { element, handle } = surfaces.get(app); handle.setEnabled(true); world.refresh();
    if (focus) element.querySelector('input,button:not(:disabled)')?.focus({ preventScroll: true });
  }
  const escape = event => { if (active && event.key === 'Escape' && !document.querySelector('#plan-reader-dialog')?.open) { event.preventDefault(); event.stopPropagation(); onExit(); } };
  host.addEventListener('keydown', escape);
  return { open, close, active: () => active, snapshot: () => active ? { app: active, page } : null,
    inspect: () => ({ app: active, page, recordCount: RECORDS.length }),
    destroy() { destroyed = true; revision++; host.removeEventListener('keydown', escape); dock.remove(); for (const { handle } of surfaces.values()) handle.remove(); },
  };
}
