const RECORDS = [
  { date: '12 mars', title: 'Révision', detail: 'Vidange et filtre à huile', amount: '148 €', type: 'Entretien' },
  { date: '28 juin', title: 'Deux pneus', detail: 'Remplacement du train avant', amount: '216 €', type: 'Réparation' },
  { date: '4 octobre', title: 'Assurance', detail: 'La dépense mensuelle, au même endroit', amount: '42 €', type: 'Assurance' },
];

// These are small, explicitly fictional demonstrations, not embedded applications.
export function createHouseInteractions(host, world, house, api, { onRead, onExit, onChange }) {
  let active = null, horizon = 10, connected = false, page = 0, revision = 0, destroyed = false;
  const surfaces = new Map();
  const dock = document.createElement('div'); dock.className = 'house-demo-dock'; dock.hidden = true;
  dock.innerHTML = '<span id="plan-demo-location"></span><button type="button" id="plan-demo-close">Revenir dans la pièce <span aria-hidden="true">×</span></button>';
  host.append(dock); dock.querySelector('button').addEventListener('click', onExit);
  const surfacesMarkup = {
    finapp: '<header><span>FINAPP</span><small>EXEMPLE FICTIF</small></header><h2>Deux futurs. Un même horizon.</h2><svg viewBox="0 0 280 80" role="img" aria-label="Comparaison de deux scénarios fictifs"><path class="demo-grid" d="M10 20H270M10 45H270M10 70H270"/><path class="demo-curve demo-curve-a"/><path class="demo-curve demo-curve-b"/></svg><label class="demo-horizon" for="plan-demo-horizon">Horizon <output id="plan-demo-years">10 ans</output><input id="plan-demo-horizon" type="range" min="5" max="20" value="10" step="5" aria-label="Horizon de la comparaison fictive"/></label><footer><span class="demo-legend">A <i></i> B <i></i></span><button id="plan-demo-read-finapp" type="button">Découvrir Finapp ↗</button></footer>',
    branchlab: '<header><span>BRANCHLAB</span><small>EXEMPLE FICTIF</small></header><h2>Suivez le signal.</h2><svg viewBox="0 0 280 80" role="img" aria-label="Une source reliée à un écran"><rect class="demo-device" x="12" y="9" width="48" height="59" rx="6"/><path class="demo-wire" d="M60 40C95 40 92 64 135 64S170 40 205 40"/><rect class="demo-device demo-display" x="205" y="10" width="62" height="48" rx="5"/><path class="demo-grid" d="M236 58V69M222 70H250"/></svg><div class="demo-connection"><p id="plan-demo-signal" role="status"></p><button id="plan-demo-connect" type="button" aria-pressed="false">Brancher le câble</button></div><footer><span>Source → câble → écran</span><button id="plan-demo-read-branchlab" type="button">Découvrir Branchlab ↗</button></footer>',
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
  const finance = surfaces.get('finapp').element, hardware = surfaces.get('branchlab').element, record = surfaces.get('garapp').element;
  function paintFinance() {
    finance.querySelector('input').value = horizon; finance.querySelector('output').textContent = horizon + ' ans';
    const points = slope => Array.from({ length: 13 }, (_, i) => {
      const t = i / 12, value = slope === 'a' ? (t * .25 + t * t * .7) : t * .67;
      return (i ? 'L' : 'M') + (10 + t * 260).toFixed(1) + ' ' + (72 - value * (18 + horizon * 2.4)).toFixed(1);
    }).join('');
    finance.querySelector('.demo-curve-a').setAttribute('d', points('a'));
    finance.querySelector('.demo-curve-b').setAttribute('d', points('b'));
  }
  function paintHardware() {
    hardware.classList.toggle('is-connected', connected);
    hardware.querySelector('#plan-demo-signal').textContent = connected ? 'Le signal arrive à l’écran.' : 'La liaison est ouverte.';
    const button = hardware.querySelector('#plan-demo-connect'); button.textContent = connected ? 'Débrancher le câble' : 'Brancher le câble'; button.setAttribute('aria-pressed', String(connected));
    house.setInteraction('branchlab', active === 'branchlab' ? { connected } : null);
  }
  function paintRecord() {
    const value = RECORDS[page];
    for (const [key, text] of Object.entries({ date: value.date, record: value.title, detail: value.detail, amount: value.amount, type: value.type, page: (page + 1) + ' / ' + RECORDS.length })) record.querySelector('#plan-demo-' + key).textContent = text;
    record.querySelector('#plan-demo-previous').disabled = page === 0;
    record.querySelector('#plan-demo-next').disabled = page === RECORDS.length - 1;
  }
  finance.querySelector('input').addEventListener('input', event => { horizon = Number(event.target.value); paintFinance(); onChange(); });
  hardware.querySelector('#plan-demo-connect').addEventListener('click', () => {
    connected = !connected; const token = ++revision; paintHardware(); onChange();
    if (connected) void world.animate(900, t => { if (token === revision && active === 'branchlab') house.signalAt(t); });
  });
  function turn(delta) {
    const next = Math.max(0, Math.min(RECORDS.length - 1, page + delta)); if (next === page) return;
    page = next; paintRecord(); onChange();
    if (!api.reducedMotion) record.querySelector('.demo-page').animate([{ opacity: .15, translate: (delta * 12) + 'px 0' }, { opacity: 1, translate: '0 0' }], { duration: 260, easing: 'ease-out' });
  }
  record.querySelector('#plan-demo-previous').addEventListener('click', () => turn(-1));
  record.querySelector('#plan-demo-next').addEventListener('click', () => turn(1));
  paintFinance(); paintHardware(); paintRecord();

  function close({ instant = false } = {}) {
    const previous = active; active = null; revision++; dock.hidden = true;
    for (const { handle } of surfaces.values()) handle.setEnabled(false);
    if (previous) house.setInteraction(previous, null);
    if (previous === 'garapp') {
      const from = house.inspectObjects().notebookAmount, token = revision;
      void world.animate(instant ? 0 : 340, t => { if (!destroyed && token === revision) house.setNotebook(from * (1 - t)); });
    }
    world.requestRender();
  }
  async function open(app, { instant = false, focus = true, snapshot = null } = {}) {
    close({ instant: true }); if (destroyed || !surfaces.has(app)) return;
    horizon = [5, 10, 15, 20].includes(snapshot?.horizon) ? snapshot.horizon : horizon;
    connected = typeof snapshot?.connected === 'boolean' ? snapshot.connected : connected;
    page = Number.isInteger(snapshot?.page) ? Math.max(0, Math.min(RECORDS.length - 1, snapshot.page)) : page;
    active = app; const token = ++revision;
    dock.hidden = false; dock.querySelector('span').textContent = app === 'garapp' ? 'Au garage / le carnet' : 'Au bureau / ' + api.apps[app].name;
    paintFinance(); paintHardware(); paintRecord(); house.setInteraction(app, app === 'branchlab' ? { connected } : {});
    if (app === 'garapp') await world.animate(instant ? 0 : 600, t => { if (!destroyed && token === revision) house.setNotebook(t * t * (3 - 2 * t)); });
    if (destroyed || token !== revision) return;
    const { element, handle } = surfaces.get(app); handle.setEnabled(true); world.refresh();
    if (focus) element.querySelector('input,button:not(:disabled)')?.focus({ preventScroll: true });
  }
  const escape = event => { if (active && event.key === 'Escape' && !document.querySelector('#plan-reader-dialog')?.open) { event.preventDefault(); event.stopPropagation(); onExit(); } };
  host.addEventListener('keydown', escape);
  return { open, close, active: () => active, snapshot: () => active ? { app: active, horizon, connected, page } : null,
    inspect: () => ({ app: active, horizon, connected, page, recordCount: RECORDS.length }),
    destroy() { destroyed = true; revision++; host.removeEventListener('keydown', escape); dock.remove(); for (const { handle } of surfaces.values()) handle.remove(); },
  };
}
