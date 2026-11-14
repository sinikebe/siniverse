const APP_IDS = ['finapp', 'garapp', 'branchlab'];
const ANGLES = [
  ['presentation', 'Présentation'], ['action', 'En action'], ['methode', 'Méthode'], ['limites', 'Limites']
];
const COLORS = { ensemble: '#7E8F78', finapp: '#3866F2', garapp: '#DB7253', branchlab: '#9E78D7' };
const FACE_NAMES = ['front', 'back', 'left', 'right', 'top', 'bottom'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function mountReactor(host, initial, api) {
  const escape = value => api.escape(String(value ?? ''));
  const clean = value => ({ concept: 'reacteur', app: APP_IDS.includes(value?.app) ? value.app : 'ensemble',
    angle: ANGLES.some(([id]) => id === value?.angle) ? value.angle : 'presentation' });
  let state = clean(initial), pose = { tiltX: 13, tiltY: -6, turn: -10 }, dead = false, busy = false;
  let drag = null, grip = null, timer = 0, settle = null, resizeFrame = 0;
  const listeners = [];
  const on = (target, event, handler, options) => {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  };
  const atom = (kind, id, name) => '<button type="button" class="rx-atom rx-atom-' + kind + '" id="reactor-' + kind + '-' + id
    + '" data-reactor-token="' + kind + '" data-value="' + id + '" aria-pressed="false" aria-describedby="reactor-help">'
    + '<span class="rx-atom-face"><span class="rx-atom-mark" aria-hidden="true">' + (kind === 'app' ? name.slice(0, 1) : '↗')
    + '</span><span>' + escape(name) + '</span></span><span class="rx-atom-edge" aria-hidden="true"></span></button>';
  host.innerHTML = '<section class="reactor-scene" aria-label="Le Réacteur, composer un outil et un point de vue">'
    + '<div class="rx-bench"><header class="rx-nameplate"><span class="rx-maker">SINIVERSE / LE RÉACTEUR</span>'
    + '<p id="reactor-help">Déplacez un élément vers sa prise, ou touchez-le.</p><span class="rx-serial" aria-hidden="true">COMPOSER · OBSERVER · RECOMPOSER</span></header>'
    + '<div class="rx-feed rx-feed-apps"><p class="rx-rack-label">LES OUTILS</p><div class="rx-app-atoms">'
    + APP_IDS.map(id => atom('app', id, api.apps[id].name)).join('')
    + '<div class="rx-spare" aria-label="Emplacement libre pour un futur outil"><span aria-hidden="true">+</span><small>La place pour la suite.</small></div>'
    + '</div></div><div class="rx-feed rx-feed-angles"><p class="rx-rack-label">LE POINT DE VUE</p><div class="rx-angle-atoms">'
    + ANGLES.map(([id, name]) => atom('angle', id, name)).join('') + '</div></div>'
    + '<div class="rx-clamps"><div class="rx-clamp rx-clamp-app" data-reactor-socket="app" id="reactor-app-socket">'
    + '<span class="rx-clamp-label">OUTIL</span><div class="rx-docked" id="reactor-docked-app"></div><span class="rx-clamp-jaw" aria-hidden="true"></span></div>'
    + '<span class="rx-join" aria-hidden="true">×</span><div class="rx-clamp rx-clamp-angle" data-reactor-socket="angle" id="reactor-angle-socket">'
    + '<span class="rx-clamp-label">POINT DE VUE</span><div class="rx-docked" id="reactor-docked-angle"></div><span class="rx-clamp-jaw" aria-hidden="true"></span></div></div>'
    + '<div class="rx-core"><div class="rx-model-well"><svg class="rx-engraving" viewBox="0 0 400 220" aria-hidden="true">'
    + '<path class="rx-reference" d="M20 190H380M200 14V210"/><path id="reactor-etched-path" d="M20 110H380"/></svg>'
    + '<div class="rx-assembly" id="reactor-assembly" aria-hidden="true">'
    + Array.from({ length: 18 }, (_, i) => '<div class="rx-piece" data-piece="' + i + '">' + FACE_NAMES.map(face => '<i class="rx-face rx-face-' + face + '"></i>').join('') + '</div>').join('')
    + '</div><div class="rx-material-labels" aria-hidden="true"><span id="reactor-model-label-a"></span><span id="reactor-model-label-b"></span><span id="reactor-model-label-c"></span></div>'
    + '<div class="rx-model-coordinate" aria-hidden="true"><span id="reactor-material-name">MATIÈRE DISPONIBLE</span><span>EXEMPLE EXPLORABLE</span></div></div>'
    + '<button type="button" class="rx-turn" id="reactor-turn-model" aria-label="Tourner la matière">↻<span>Tourner la matière</span></button></div>'
    + '<article class="rx-inscription"><p class="rx-inscription-kicker" id="reactor-eyebrow"></p>'
    + '<div class="rx-recompose"><button class="rx-dial" type="button" id="reactor-next-app"><i class="rx-knurl" aria-hidden="true"></i><span><small>OUTIL</small><b id="reactor-app-dial-label">À choisir</b></span></button>'
    + '<button class="rx-dial" type="button" id="reactor-next-angle"><i class="rx-knurl" aria-hidden="true"></i><span><small>POINT DE VUE</small><b id="reactor-angle-dial-label">Présentation</b></span></button></div><h1 id="view-title" tabindex="-1"></h1>'
    + '<div class="rx-reading" id="reactor-reading"></div><dl class="rx-facts" id="reactor-facts"></dl>'
    + '<a class="rx-launch" id="reactor-open-app" href="https://siniverse.cc" hidden><span id="reactor-open-label"></span><span aria-hidden="true">↗</span></a></article>'
    + '<footer class="rx-controls"><button type="button" class="rx-release" id="reactor-release-app"><span class="rx-latch" aria-hidden="true"></span>Dissocier</button>'
    + '<button type="button" class="rx-grip" id="reactor-tilt-grip" aria-label="Incliner le plateau, flèches pour orienter"><span aria-hidden="true">||||||||||</span>Tenir le plateau</button>'
    + '<button type="button" class="rx-reset" id="reactor-reset-view">Recentrer</button><p class="rx-status" id="reactor-status" role="status" aria-live="polite"></p></footer>'
    + '<span class="rx-bench-thickness" aria-hidden="true"></span></div></section>';
  const world = host.querySelector('.reactor-scene');
  const bench = world.querySelector('.rx-bench');
  const assembly = world.querySelector('#reactor-assembly');
  const pieces = [...world.querySelectorAll('.rx-piece')];
  const tokens = [...world.querySelectorAll('[data-reactor-token]')];
  const status = world.querySelector('#reactor-status');
  const sockets = { app: world.querySelector('#reactor-app-socket'), angle: world.querySelector('#reactor-angle-socket') };

  function setPose() {
    const compact = world.clientWidth <= 740;
    bench.style.setProperty('--rx-tilt-x', (compact ? pose.tiltX * .38 : pose.tiltX) + 'deg');
    bench.style.setProperty('--rx-tilt-y', (compact ? pose.tiltY * .35 : pose.tiltY) + 'deg');
    assembly.style.setProperty('--rx-model-turn', pose.turn + 'deg');
  }
  function geometry() {
    const scale = Math.min((assembly.clientWidth || 400) / 400, 1.25);
    const exploded = state.angle === 'methode', uncertain = state.angle === 'limites';
    for (let i = 0; i < pieces.length; i++) {
      let x, y, depth, width = 14, height = 14, rotation = 0;
      if (state.app === 'finapp') {
        const branch = i < 9 ? -1 : 1, t = (i % 9) / 8;
        x = -150 + t * 300; y = branch * (10 + t * t * (state.angle === 'action' ? 80 : 61));
        depth = 16 + t * t * (branch < 0 ? 66 : 42);
        if (exploded) { y *= 1.22; depth += i % 3 * 13; }
      } else if (state.app === 'garapp') {
        const angle = i / 18 * Math.PI * 2;
        x = Math.cos(angle) * 128; y = Math.sin(angle) * 69;
        rotation = i / 18 * 360; width = 19; height = 23; depth = i % 6 === 0 ? 44 : 21;
        if (exploded) { x *= 1.18; y *= 1.18; depth += i % 3 * 12; }
      } else if (state.app === 'branchlab') {
        if (i < 5) { x = -132 + (i % 2) * 20; y = (Math.floor(i / 2) - 1) * 24; depth = 38; width = 20; height = 22; }
        else if (i > 12) { x = 112 + (i % 2) * 22; y = (Math.floor((i - 13) / 2) - 1) * 26; depth = 47; width = 22; height = 24; }
        else { x = -82 + (i - 5) * 24; y = Math.sin((i - 5) / 7 * Math.PI) * 15; depth = uncertain && i === 9 ? 9 : 17; width = 19; height = 11; }
        if (exploded) { x *= 1.14; depth += i % 3 * 12; }
      } else {
        x = -144 + i % 6 * 57; y = (Math.floor(i / 6) - 1) * 46;
        rotation = (i % 3 - 1) * 15; depth = 12 + i % 4 * 7;
      }
      if (uncertain && i % 4 === 0) { depth *= .45; y += 10; }
      const part = pieces[i];
      part.style.setProperty('--rx-w', width * scale + 'px');
      part.style.setProperty('--rx-h', height * scale + 'px');
      part.style.setProperty('--rx-d', depth * scale + 'px');
      part.style.setProperty('--rx-x', x * scale + 'px');
      part.style.setProperty('--rx-y', y * scale + 'px');
      part.style.setProperty('--rx-z', depth * scale / 2 + 'px');
      part.style.setProperty('--rx-r', rotation + 'deg');
      part.dataset.tone = uncertain && i % 4 === 0 ? 'muted' : i % 6 === 0 ? 'brass' : 'accent';
    }
    const path = world.querySelector('#reactor-etched-path');
    path.setAttribute('d', state.app === 'finapp' ? 'M35 170C120 170 130 125 200 125S285 58 365 35M35 170C120 170 130 155 200 155S285 110 365 100'
      : state.app === 'garapp' ? 'M65 110A135 70 0 1 0 335 110A135 70 0 1 0 65 110'
        : state.app === 'branchlab' ? 'M45 110H355M45 70V150M355 55V165' : 'M40 65H360M40 110H360M40 155H360');
  }
  function paint() {
    world.dataset.app = state.app;
    world.dataset.angle = state.angle;
    world.style.setProperty('--rx-accent', COLORS[state.app]);
    for (const token of tokens) {
      const selected = token.dataset.reactorToken === 'app' ? token.dataset.value === state.app : token.dataset.value === state.angle;
      token.setAttribute('aria-pressed', String(selected));
    }
    const content = api.content(state.app, state.angle) || { title: 'Que voulez-vous mettre en mouvement ?', body: ['Un outil, un point de vue. À vous de composer.'], facts: [] };
    world.querySelector('#reactor-eyebrow').textContent = content.eyebrow || 'MATIÈRE À COMPRENDRE';
    world.querySelector('#view-title').textContent = content.title || 'Un outil, un point de vue.';
    world.querySelector('#reactor-reading').innerHTML = (content.body || []).map(text => '<p>' + escape(text) + '</p>').join('');
    world.querySelector('#reactor-facts').innerHTML = (content.facts || []).map(fact => '<div><dt>' + escape(fact.label) + '</dt><dd>' + escape(fact.value) + '</dd></div>').join('');
    const appName = state.app === 'ensemble' ? '' : api.apps[state.app].name;
    const angleName = ANGLES.find(([id]) => id === state.angle)[1];
    world.querySelector('#reactor-app-dial-label').textContent = appName || 'À choisir';
    world.querySelector('#reactor-angle-dial-label').textContent = angleName;
    world.querySelector('#reactor-next-app').setAttribute('aria-label', 'Tourner la molette d’outil, actuellement ' + (appName || 'libre'));
    world.querySelector('#reactor-next-angle').setAttribute('aria-label', 'Tourner la molette de point de vue, actuellement ' + angleName);
    world.querySelector('#reactor-docked-app').textContent = appName || 'Un outil';
    world.querySelector('#reactor-docked-angle').textContent = angleName;
    sockets.app.dataset.occupied = String(Boolean(appName)); sockets.angle.dataset.occupied = 'true';
    world.querySelector('#reactor-material-name').textContent = appName ? appName.toUpperCase() + ' / ' + angleName.toUpperCase() : 'MATIÈRE DISPONIBLE';
    const materialLabels = state.app === 'finapp' ? ['Scénario A', 'Scénario B', 'Horizon commun']
      : state.app === 'garapp' ? ['Repère daté', 'Historique', 'Dépense associée']
        : state.app === 'branchlab' ? ['Source', 'Écran', 'Câble'] : ['Un outil', 'Un point de vue', 'Une matière à lire'];
    for (let i = 0; i < materialLabels.length; i++) world.querySelector('#reactor-model-label-' + ['a', 'b', 'c'][i]).textContent = materialLabels[i];
    const launch = world.querySelector('#reactor-open-app');
    launch.hidden = !appName;
    if (appName) { launch.href = api.apps[state.app].url; world.querySelector('#reactor-open-label').textContent = 'Ouvrir ' + appName; }
    world.querySelector('#reactor-release-app').disabled = !appName;
    setPose(); geometry();
  }
  function navigate(kind, value, focusId = 'view-title') {
    const next = { app: kind === 'app' ? value : state.app, angle: kind === 'angle' ? value : state.angle };
    status.textContent = (next.app === 'ensemble' ? 'La matière est libre.' : api.apps[next.app].name + ' est assemblé.') + ' ' + ANGLES.find(([id]) => id === next.angle)[1] + '.';
    api.navigate(next, { focusId });
  }
  const releaseDrag = () => {
    if (!drag) return;
    drag.token.classList.remove('is-lifted');
    drag.token.style.removeProperty('--rx-drag-x'); drag.token.style.removeProperty('--rx-drag-y');
    for (const socket of Object.values(sockets)) socket.classList.remove('is-receiving');
    drag = null;
  };
  for (const token of tokens) {
    let suppressUntil = 0;
    on(token, 'pointerdown', event => {
      if (event.button !== 0 || drag) return;
      token.focus({ preventScroll: true });
      drag = { token, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      token.setPointerCapture?.(event.pointerId);
      token.classList.add('is-lifted');
      sockets[token.dataset.reactorToken].classList.add('is-receiving');
    });
    on(token, 'pointermove', event => {
      if (!drag || drag.token !== token || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 7) drag.moved = true;
      token.style.setProperty('--rx-drag-x', dx + 'px'); token.style.setProperty('--rx-drag-y', dy + 'px');
    });
    on(token, 'pointerup', event => {
      if (!drag || drag.token !== token || drag.id !== event.pointerId) return;
      const moved = drag.moved, box = sockets[token.dataset.reactorToken].getBoundingClientRect();
      const accepted = event.clientX >= box.left - 28 && event.clientX <= box.right + 28 && event.clientY >= box.top - 28 && event.clientY <= box.bottom + 28;
      releaseDrag(); suppressUntil = performance.now() + 350;
      if (!moved || accepted) navigate(token.dataset.reactorToken, token.dataset.value);
      else status.textContent = 'L’élément retrouve sa place. Vous pouvez aussi le toucher pour l’assembler.';
    });
    on(token, 'pointercancel', releaseDrag);
    on(token, 'lostpointercapture', () => { if (drag?.token === token) releaseDrag(); });
    on(token, 'click', event => {
      if (event.detail > 0 && performance.now() < suppressUntil) return;
      navigate(token.dataset.reactorToken, token.dataset.value);
    });
  }
  on(world.querySelector('#reactor-release-app'), 'click', () => api.navigate({ app: 'ensemble', angle: state.angle }, { focusId: 'view-title' }));
  for (const [kind, control, values] of [['app', 'reactor-next-app', APP_IDS], ['angle', 'reactor-next-angle', ANGLES.map(([id]) => id)]]) {
    const step = delta => {
      const current = values.indexOf(state[kind]);
      const index = current < 0 ? (delta > 0 ? 0 : values.length - 1) : (current + delta + values.length) % values.length;
      navigate(kind, values[index], control);
    };
    on(world.querySelector('#' + control), 'click', () => step(1));
    on(world.querySelector('#' + control), 'keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); step(event.key === 'ArrowLeft' ? -1 : 1);
    });
  }
  on(world.querySelector('#reactor-turn-model'), 'click', () => { pose.turn = (pose.turn + 45) % 360; setPose(); api.saveView(); });
  on(world.querySelector('#reactor-reset-view'), 'click', () => { pose = { tiltX: 13, tiltY: -6, turn: -10 }; setPose(); api.saveView(); });
  const handle = world.querySelector('#reactor-tilt-grip');
  on(handle, 'pointerdown', event => {
    if (event.button !== 0) return;
    grip = { id: event.pointerId, x: event.clientX, y: event.clientY, tiltX: pose.tiltX, tiltY: pose.tiltY };
    handle.setPointerCapture?.(event.pointerId); bench.classList.add('is-being-held');
  });
  on(handle, 'pointermove', event => {
    if (!grip || event.pointerId !== grip.id) return;
    pose.tiltX = clamp(grip.tiltX - (event.clientY - grip.y) * .13, 2, 23);
    pose.tiltY = clamp(grip.tiltY + (event.clientX - grip.x) * .12, -16, 16); setPose();
  });
  const releaseGrip = () => { if (!grip) return; grip = null; bench.classList.remove('is-being-held'); api.saveView(); };
  on(handle, 'pointerup', releaseGrip); on(handle, 'pointercancel', releaseGrip); on(handle, 'lostpointercapture', releaseGrip);
  on(handle, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    pose.tiltY = clamp(pose.tiltY + (event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0), -16, 16);
    pose.tiltX = clamp(pose.tiltX + (event.key === 'ArrowUp' ? 2 : event.key === 'ArrowDown' ? -2 : 0), 2, 23);
    setPose(); api.saveView();
  });
  on(window, 'resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!dead) { setPose(); geometry(); } }); }, { passive: true });
  function snapshot() { return { v: 1, tiltX: pose.tiltX, tiltY: pose.tiltY, turn: pose.turn }; }
  function update(next, { snapshot: saved = null, instant = false } = {}) {
    if (dead) return Promise.resolve();
    clearTimeout(timer); if (settle) settle();
    state = clean(next);
    if (saved?.v === 1) pose = { tiltX: clamp(Number(saved.tiltX) || 13, 2, 23), tiltY: clamp(Number(saved.tiltY) || 0, -16, 16), turn: Number.isFinite(saved.turn) ? saved.turn : -10 };
    world.classList.toggle('rx-no-motion', Boolean(instant || api.reducedMotion));
    busy = !(instant || api.reducedMotion);
    world.dataset.settled = String(!busy);
    releaseDrag(); paint();
    return new Promise(resolve => {
      settle = resolve;
      timer = setTimeout(() => { busy = false; world.dataset.settled = 'true'; settle = null; resolve(); }, busy ? 760 : 0);
    });
  }
  function inspect() {
    const rect = element => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; };
    return { engine: 'css3d', ready: !busy && !dead, perspective: getComputedStyle(world).perspective,
      benchTransform: getComputedStyle(bench).transform, modelTransform: getComputedStyle(assembly).transform,
      appSocket: { occupied: sockets.app.dataset.occupied === 'true', label: world.querySelector('#reactor-docked-app').textContent, rect: rect(sockets.app) },
      angleSocket: { occupied: sockets.angle.dataset.occupied === 'true', label: world.querySelector('#reactor-docked-angle').textContent, rect: rect(sockets.angle) },
      parts: pieces.map(part => ({ rect: rect(part), transform: getComputedStyle(part).transform, depth: getComputedStyle(part).getPropertyValue('--rx-d'), tone: part.dataset.tone })),
      tokens: tokens.map(token => ({ id: token.id, pressed: token.getAttribute('aria-pressed') === 'true', rect: rect(token) })), pose: snapshot() };
  }
  function destroy() { dead = true; clearTimeout(timer); if (settle) settle(); cancelAnimationFrame(resizeFrame); for (const remove of listeners) remove(); world.remove(); }
  world.classList.toggle('rx-no-motion', Boolean(api.reducedMotion)); paint(); world.dataset.settled = 'true';
  return { update, snapshot, inspect, destroy };
}
