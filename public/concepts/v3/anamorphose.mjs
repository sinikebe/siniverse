import * as THREE from './vendor/three.module.min.js';

const ANGLES = ['presentation', 'action', 'methode', 'limites'];
const NAMES = { presentation: 'Présentation', action: 'Exemple', methode: 'Méthode', limites: 'Limites' };
const APPS = ['finapp', 'garapp', 'branchlab'];
const IVORY = '#f2efe3';
const BRASS = '#c8b477';
const clamp = THREE.MathUtils.clamp;
const smooth = (t) => t * t * (3 - 2 * t);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** A single optical relief. Navigation is attached to its physical sighting marks. */
export function mountAnamorphose(host, initialState, api) {
  const root = document.createElement('section');
  root.className = 'sv-anamorphose';
  root.setAttribute('aria-label', 'Anamorphose : explorer le portail par le point de vue');
  root.innerHTML = `
    <div class="an-world-dom">
      <article class="an-inscription">
        <p class="an-eyebrow"></p>
        <h1 class="an-semantic-title" id="view-title" tabindex="-1"></h1>
        <div class="an-reading" tabindex="0" aria-label="Lire la présentation complète">
          <div class="an-body"></div><dl class="an-facts"></dl>
        </div>
        <button class="an-reading-more" id="an-read-more" type="button">Lire la suite ↓</button>
        <a class="an-open" id="an-open-app"></a>
      </article>
    </div>
    <p class="an-instruction">Glissez le relief ou choisissez une prise de visée.</p>
    <p class="an-fallback-note" hidden>La vue 3D est indisponible. Les liens donnent accès à tous les points de vue.</p>
    <p class="an-sr-only" role="status" aria-live="polite"></p>`;
  host.append(root);
  const dom = root.querySelector('.an-world-dom');
  const article = root.querySelector('.an-inscription');
  const title = root.querySelector('h1');
  const reading = root.querySelector('.an-reading');
  const body = root.querySelector('.an-body');
  const facts = root.querySelector('.an-facts');
  const open = root.querySelector('.an-open');
  const more = root.querySelector('.an-reading-more');
  const eyebrow = root.querySelector('.an-eyebrow');
  const inscriptions = [eyebrow, reading, more, open];
  const status = root.querySelector('[role="status"]');
  const fallbackNote = root.querySelector('.an-fallback-note');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 120);
  const raycaster = new THREE.Raycaster();
  const resources = new Set();
  const removable = new THREE.Group();
  scene.add(removable);
  const controls = [];
  const surfaces = [];
  const fields = [];
  const pickMeshes = [];
  const listeners = [];
  let state = normalize(initialState);
  let renderer;
  let fallback = null;
  let destroyed = false;
  let frame = 0;
  let motion = null;
  let dragging = null;
  let free = false;
  let width = 1;
  let height = 1;
  let layout;
  let pose = { yaw: 0.2, pitch: 0.08, radius: 23, lookY: -0.5 };
  let pending = [];
  let inscriptionMetrics = [];
  let inscriptionHeight = 0;

  function normalize(value) {
    const app = APPS.includes(value?.app) ? value.app : 'ensemble';
    return {
      concept: 'anamorphose',
      app,
      angle: app !== 'ensemble' && ANGLES.includes(value?.angle) ? value.angle : 'presentation',
    };
  }
  function listen(el, name, fn, options) {
    el.addEventListener(name, fn, options);
    listeners.push(() => el.removeEventListener(name, fn, options));
  }
  function keep(resource) { resources.add(resource); return resource; }
  function mat(color, extra = {}) {
    return keep(new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.08, ...extra }));
  }
  function mesh(geometry, material, position, parent = removable) {
    const item = new THREE.Mesh(keep(geometry), material);
    item.position.copy(position);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  function box(w, h, d, material, position, parent) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, position, parent);
  }
  function accent() { return api.apps[state.app]?.color || BRASS; }
  function navigate(patch, focusId) {
    api.navigate({ app: patch.app ?? state.app, angle: patch.angle ?? state.angle }, { focusId });
  }
  function makeControl(id, text, kind, value) {
    const el = document.createElement('a');
    el.id = id;
    el.className = 'an-sight an-' + kind;
    const number = document.createElement('span');
    number.className = 'an-graduation';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = kind === 'app' ? String(APPS.indexOf(value) + 1).padStart(2, '0') :
      kind === 'angle' ? String(ANGLES.indexOf(value) + 1).padStart(2, '0') : '↖';
    const name = document.createElement('span');
    name.className = 'an-sight-name';
    name.textContent = text;
    el.append(number, name);
    dom.append(el);
    const control = { el, kind, value, center: v3(0, 0, 0), width: 2, quaternion: new THREE.Quaternion() };
    controls.push(control);
    const activate = () => kind === 'app' ? navigate({ app: value }, id) :
      kind === 'angle' ? navigate({ angle: value }, id) : navigate({ app: 'ensemble' }, id);
    control.activate = activate;
    listen(el, 'click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      activate();
    });
    listen(el, 'keydown', (event) => {
      if (event.key === ' ') { event.preventDefault(); activate(); }
    });
    return control;
  }
  APPS.forEach((id) => makeControl('an-app-' + id, api.apps[id]?.name || id, 'app', id));
  ANGLES.forEach((id) => makeControl('an-angle-' + id, NAMES[id], 'angle', id));
  makeControl('an-overview', 'Vue d’ensemble', 'overview', 'ensemble');

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'an-canvas';
    renderer.domElement.id = 'an-relief';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Relief optique 3D. Flèches gauche et droite : points de vue. Haut et bas : applications. Échap : ensemble.');
    root.prepend(renderer.domElement);
    listen(renderer.domElement, 'webglcontextlost', (event) => {
      event.preventDefault();
      setFallback('context-lost');
    });
    listen(renderer.domElement, 'webglcontextrestored', () => {
      fallback = null;
      renderer.domElement.style.display = '';
      root.classList.remove('an-is-fallback');
      fallbackNote.hidden = true;
      resize();
    });
  } catch {
    setFallback('webgl-unavailable');
  }

  scene.add(new THREE.HemisphereLight('#e5f3df', '#15251e', 2));
  const light = new THREE.DirectionalLight('#fff2d5', 3.3);
  light.position.set(-8, 14, 17);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -16, right: 16, top: 13, bottom: -13, near: 1, far: 60 });
  light.shadow.bias = -0.0006;
  light.shadow.normalBias = 0.035;
  scene.add(light);

  function setFallback(reason) {
    fallback = reason;
    cancelAnimationFrame(frame); frame = 0; motion = null;
    dragging = null;
    root.classList.remove('an-is-dragging');
    root.classList.add('an-is-fallback');
    fallbackNote.hidden = false;
    if (renderer) renderer.domElement.style.display = 'none';
    more.hidden = true;
    surfaces.forEach(({ el }) => { el.style.transform = ''; });
    controls.forEach(({ el }) => { el.style.transform = ''; });
    settle();
  }

  function updateReadingCue() {
    const overflow = reading.scrollHeight - reading.clientHeight;
    const hasMore = overflow > 2;
    more.hidden = !hasMore;
    more.textContent = reading.scrollTop < overflow - 8 ? 'Lire la suite ↓' : 'Revenir au début ↑';
  }
  listen(reading, 'scroll', updateReadingCue, { passive: true });
  listen(more, 'click', () => {
    const atEnd = reading.scrollTop >= reading.scrollHeight - reading.clientHeight - 8;
    reading.scrollTo({ top: atEnd ? 0 : reading.scrollTop + reading.clientHeight * 0.8,
      behavior: api.reducedMotion ? 'instant' : 'smooth' });
    reading.focus({ preventScroll: true });
  });

  function fillContent() {
    const content = api.content(state.app, state.angle);
    root.style.setProperty('--an-accent', accent());
    root.dataset.app = state.app;
    root.dataset.angle = state.angle;
    eyebrow.textContent = (api.apps[state.app]?.name || 'Siniverse') + ' · ' + (content.eyebrow || '');
    title.textContent = content.title;
    body.replaceChildren(...(content.body || []).map((text) => {
      const p = document.createElement('p'); p.textContent = text; return p;
    }));
    facts.replaceChildren(...(content.facts || []).flatMap((fact) => {
      const group = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = fact.label;
      const dd = document.createElement('dd'); dd.textContent = fact.value;
      group.append(dt, dd); return [group];
    }));
    reading.scrollTop = 0;
    open.hidden = state.app === 'ensemble';
    if (!open.hidden) {
      open.href = api.apps[state.app].url;
      open.textContent = 'Ouvrir ' + api.apps[state.app].name + ' ↗';
    } else open.removeAttribute('href');
    controls.forEach((control) => {
      control.el.hidden = control.kind === 'angle' && state.app === 'ensemble';
      const app = control.kind === 'app' ? control.value : control.kind === 'overview' ? 'ensemble' : state.app;
      const angle = app === 'ensemble' ? 'presentation' : control.kind === 'angle' ? control.value : state.angle;
      control.el.href = api.href({ app, angle });
      const selected = control.kind === 'angle' ? angle === state.angle : app === state.app;
      if (selected) control.el.setAttribute('aria-current', 'true');
      else control.el.removeAttribute('aria-current');
      if (control.kind === 'app') control.el.style.setProperty('--an-control-accent', api.apps[app].color);
      else control.el.style.setProperty('--an-control-accent', accent());
    });
  }

  function cameraPoint(value) {
    const cp = Math.cos(value.pitch);
    return v3(Math.sin(value.yaw) * cp * value.radius, value.lookY + Math.sin(value.pitch) * value.radius,
      Math.cos(value.yaw) * cp * value.radius);
  }
  function guide(angle = state.angle) {
    const settings = {
      presentation: [-0.21, 0.095], action: [0.22, 0.06],
      methode: [-0.13, -0.085], limites: [0.25, -0.065],
    }[angle];
    const ensemble = state.app === 'ensemble';
    const appShift = ensemble ? 0 : (APPS.indexOf(state.app) - 1) * 0.045;
    return {
      yaw: ensemble ? 0.23 + settings[0] * 0.45 : settings[0] + appShift,
      pitch: ensemble ? 0.12 + settings[1] * 0.4 : settings[1],
      radius: layout.fitRadius * (ensemble ? 1.1 : 1), lookY: layout.centerY,
    };
  }

  function disposeRelief() {
    removable.clear();
    resources.forEach((item) => item.dispose());
    resources.clear(); fields.length = 0; pickMeshes.length = 0; surfaces.length = 0;
  }
  function drawWord(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const words = text.split(' ');
    let lines = [text];
    if (text.length > 26) {
      let best = 1;
      for (let i = 1; i < words.length; i++) {
        if (Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length) <
          Math.abs(words.slice(0, best).join(' ').length - words.slice(best).join(' ').length)) best = i;
      }
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    let size = 184;
    ctx.font = '900 ' + size + 'px "Arial Black", Arial, sans-serif';
    size *= Math.min(1, 1950 / Math.max(...lines.map((line) => ctx.measureText(line).width)));
    ctx.font = '900 ' + size + 'px "Arial Black", Arial, sans-serif';
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, index) => ctx.fillText(line, 1024, 266 + (index - (lines.length - 1) / 2) * size * 1.04));
    const texture = keep(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer?.capabilities.getMaxAnisotropy() || 1);
    return texture;
  }

  function buildRelief() {
    disposeRelief();
    const graphite = mat('#19312b');
    const edge = mat('#263f36', { metalness: 0.35 });
    const brass = mat(BRASS, { roughness: 0.48, metalness: 0.55 });
    const boardH = layout.top - layout.bottom;
    box(layout.boardW, boardH, 0.32, graphite, v3(0, layout.centerY, -3.1));
    box(layout.boardW + 0.16, 0.12, 0.5, edge, v3(0, layout.top, -2.9));
    box(layout.boardW + 0.16, 0.12, 0.5, edge, v3(0, layout.bottom, -2.9));
    [-1, 1].forEach((side) => {
      box(0.12, boardH, 0.5, edge, v3(side * layout.boardW / 2, layout.centerY, -2.9));
      for (let i = 0; i < 14; i++)
        box(i % 3 === 0 ? 0.24 : 0.11, 0.022, 0.08, brass,
          v3(side * (layout.boardW / 2 - 0.25), layout.bottom + 0.45 + i * (boardH - 0.9) / 13, -2.59));
    });
    // Each real HTML inscription is calibrated on its own depth in the same optical apparatus.
    // At the guided eye all the words share one reading plane; a free view separates the layers.
    const eye = cameraPoint(guide());
    const depths = [0.83, 1.06, 0.9, 0.97];
    const unit = layout.panelW / article.offsetWidth;
    inscriptionMetrics.forEach((metric, index) => {
      const { el, x, y, w, h } = metric;
      if (el.hidden) return;
      const flat = v3(layout.panelX + (x + w / 2 - article.offsetWidth / 2) * unit,
        layout.panelTop - (y + h / 2) * unit, 0.8);
      const depth = depths[index];
      surfaces.push({ el, center: eye.clone().lerp(flat, depth), width: w * unit * depth,
        quaternion: new THREE.Quaternion(), idealCenter: flat, depth });
      el.style.position = 'absolute'; el.style.left = '0'; el.style.top = '0'; el.style.width = w + 'px';
    });

    (state.app === 'ensemble' ? ['presentation'] : ANGLES).forEach((angle, groupIndex) => {
      const design = guide(angle);
      const eye = cameraPoint(design);
      const designCamera = new THREE.PerspectiveCamera(camera.fov, width / height, 0.1, 120);
      designCamera.position.copy(eye); designCamera.lookAt(v3(0, design.lookY, 0));
      designCamera.updateMatrixWorld();
      const right = v3(1, 0, 0).applyQuaternion(designCamera.quaternion);
      const up = v3(0, 1, 0).applyQuaternion(designCamera.quaternion);
      const normal = v3(0, 0, 1).applyQuaternion(designCamera.quaternion);
      const center = v3(layout.panelX, layout.mobile ? 2.0 : 2.8, 0.4);
      const word = api.content(state.app, angle).title;
      const texture = drawWord(word, IVORY);
      const ink = keep(new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08,
        side: THREE.DoubleSide, depthWrite: false }));
      const stock = mat('#365047', { transparent: true, depthWrite: false });
      const field = { angle, ink, stock, fragments: [], design, designCamera, center };
      const wordW = layout.panelW * (layout.mobile ? 1.04 : 1.1);
      const wordH = layout.mobile ? 1.7 : 2.2;
      const count = 14;
      for (let i = 0; i < count; i++) {
        const x = (i + 0.5) / count * wordW - wordW / 2;
        const flat = center.clone().addScaledVector(right, x);
        const depth = 0.79 + ((i * 7 + groupIndex * 3) % 13) / 12 * 0.28;
        const point = eye.clone().lerp(flat, depth);
        const stripW = wordW / count;
        const geometry = new THREE.PlaneGeometry(stripW * depth, wordH * depth);
        const uv = geometry.attributes.uv;
        for (let n = 0; n < uv.count; n++) uv.setX(n, (i + uv.getX(n)) / count);
        const plane = mesh(geometry, ink, point);
        plane.quaternion.copy(designCamera.quaternion);
        plane.castShadow = false;
        const backing = box(stripW * depth * 0.13, wordH * depth * 1.15, 0.085, stock,
          point.clone().addScaledVector(normal, -0.06));
        backing.quaternion.copy(designCamera.quaternion);
        backing.castShadow = false;
        const idealCorners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([sx, sy]) =>
          flat.clone().addScaledVector(right, sx * stripW).addScaledVector(up, sy * wordH));
        const actualCorners = idealCorners.map((p) => eye.clone().lerp(p, depth));
        field.fragments.push({ plane, actualCorners, idealCorners, depth });
      }
      fields.push(field);
    });

    controls.forEach((control) => {
      if (control.el.hidden) return;
      const i = control.kind === 'app' ? APPS.indexOf(control.value) : ANGLES.indexOf(control.value);
      let p;
      if (control.kind === 'app') p = v3((i - 1) * (layout.mobile ? 2.55 : 6.1), layout.appY, 1.5);
      else if (control.kind === 'overview') p = layout.mobile ? v3(0, 6.8, 0.8) : v3(7.7, 4.55, 0.8);
      else p = layout.mobile ? v3((i % 2 ? 1 : -1) * 1.75, 5.15 - Math.floor(i / 2) * 1.7, 1.25) :
        v3(-7.9, 3.25 - i * 1.88, 1.25);
      control.center.copy(p);
      control.width = control.kind === 'app' ? (layout.mobile ? 2.35 : 4.6) :
        control.kind === 'overview' ? (layout.mobile ? 3.1 : 3.7) : (layout.mobile ? 3.1 : 3.9);
      control.el.style.width = (control.kind === 'app' && layout.mobile ? 110 :
        control.kind === 'angle' && layout.mobile ? 152 : 210) + 'px';
      const color = control.kind === 'app' ? api.apps[control.value].color : accent();
      const strip = mat(color, { metalness: 0.3, roughness: 0.42 });
      const target = p.clone().add(v3(-control.width / 2 - 0.14, 0, 0));
      mesh(new THREE.RingGeometry(0.105, 0.145, 24), keep(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })), target);
      box(0.39, 0.018, 0.04, strip, target.clone());
      box(0.018, 0.39, 0.04, strip, target.clone());
      const hit = mesh(new THREE.SphereGeometry(control.width * 0.43, 8, 6),
        keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })), p);
      hit.scale.y = 0.42;
      hit.userData.control = control;
      hit.castShadow = false;
      pickMeshes.push(hit);
    });
    updateFieldOpacity();
  }

  function updateFieldOpacity() {
    fields.forEach((field) => {
      const active = field.angle === state.angle;
      field.ink.opacity = active ? 1 : state.app === 'ensemble' ? 0.17 : 0.055;
      field.stock.opacity = active ? 0.62 : 0.06;
    });
  }

  function resize(force = false) {
    if (destroyed) return;
    const rect = root.getBoundingClientRect();
    width = Math.max(280, rect.width); height = Math.max(560, rect.height);
    const mobile = width < 700;
    root.classList.toggle('an-mobile', mobile);
    const readingHeight = mobile ? Math.max(190, Math.min(275, height * 0.3)) :
      Math.max(260, Math.min(360, height * 0.38));
    root.style.setProperty('--an-reading-height', readingHeight + 'px');
    const cssW = Math.min(mobile ? 340 : 620, width * (mobile ? 0.84 : 0.54));
    article.style.width = cssW + 'px';
    article.style.height = '';
    inscriptions.forEach((el) => {
      for (const key of ['position', 'left', 'top', 'width', 'transform', 'visibility']) el.style[key] = '';
    });
    updateReadingCue();
    inscriptionHeight = article.offsetHeight;
    inscriptionMetrics = inscriptions.map((el) => ({ el, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
    article.style.height = inscriptionHeight + 'px';
    const panelW = mobile ? 6.4 : 11.4;
    // The apparatus keeps the same dimensions between overview and applications.
    // In overview the camera can therefore genuinely recede from the same object.
    const reservedHeight = Math.max(inscriptionHeight, readingHeight + (mobile ? 185 : 170));
    const panelH = reservedHeight * panelW / cssW;
    const panelY = 0.65 - panelH / 2;
    const appY = 0.65 - panelH - 1.05;
    const top = mobile ? 7.55 : 6.6;
    const bottom = appY - 0.82;
    const boardW = mobile ? 8.2 : 21;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fitRadius = Math.max((top - bottom) / (2 * tan * 0.88), boardW / (2 * tan * (width / height) * 0.87));
    const old = layout;
    if (!force && old && old.width === width && old.height === height && Math.abs(old.panelH - panelH) < 0.01) {
      surfaces.forEach(({ el, width: worldWidth, depth }) => {
        const metric = inscriptionMetrics.find((entry) => entry.el === el);
        el.style.position = 'absolute'; el.style.left = '0'; el.style.top = '0';
        el.style.width = (metric?.w || worldWidth / (panelW / cssW) / depth) + 'px';
      });
      render(); return;
    }
    const ratio = old ? pose.radius / old.fitRadius : 1;
    layout = { width, height, mobile, panelW, panelH, panelTop: 0.65, panelX: mobile ? 0 : 0.55, panelY, appY, top, bottom,
      boardW, centerY: (top + bottom) / 2, fitRadius };
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer?.setSize(width, height, false);
    buildRelief();
    if (old) {
      pose.radius = fitRadius * ratio;
      pose.lookY += layout.centerY - old.centerY;
      if (motion) {
        for (const end of [motion.from, motion.to]) {
          end.radius *= fitRadius / old.fitRadius;
          end.lookY += layout.centerY - old.centerY;
        }
      }
    } else pose = guide();
    render();
  }

  // Homogeneous projection of an HTML plane: its corners use the exact WebGL camera matrix.
  function projectSurface(surface) {
    const { el, center, quaternion } = surface;
    if (el.hidden) return;
    const scale = surface.width / el.offsetWidth;
    const right = v3(1, 0, 0).applyQuaternion(quaternion);
    const up = v3(0, 1, 0).applyQuaternion(quaternion);
    const origin = center.clone().addScaledVector(right, -surface.width / 2)
      .addScaledVector(up, el.offsetHeight * scale / 2);
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const a = new THREE.Vector4(right.x * scale, right.y * scale, right.z * scale, 0).applyMatrix4(matrix);
    const b = new THREE.Vector4(-up.x * scale, -up.y * scale, -up.z * scale, 0).applyMatrix4(matrix);
    const c = new THREE.Vector4(origin.x, origin.y, origin.z, 1).applyMatrix4(matrix);
    if (c.w <= 0) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = '';
    const f = 1 / c.w;
    const values = [
      width / 2 * (a.x + a.w) * f, height / 2 * (-a.y + a.w) * f, 0, a.w * f,
      width / 2 * (b.x + b.w) * f, height / 2 * (-b.y + b.w) * f, 0, b.w * f,
      0, 0, 1, 0,
      width / 2 * (c.x + c.w) * f, height / 2 * (-c.y + c.w) * f, 0, 1,
    ];
    el.style.transform = 'matrix3d(' + values.join(',') + ')';
    el.style.zIndex = String(1000 - Math.round(c.w));
  }

  function render() {
    if (destroyed || !layout || fallback) return;
    camera.position.copy(cameraPoint(pose));
    camera.lookAt(v3(0, pose.lookY, 0)); camera.updateMatrixWorld();
    renderer.render(scene, camera);
    surfaces.forEach(projectSurface);
    controls.forEach(projectSurface);
  }
  function schedule() { if (!frame && !destroyed) frame = requestAnimationFrame(tick); }
  function tick(now) {
    frame = 0;
    if (motion) {
      const t = motion.duration ? clamp((now - motion.start) / motion.duration, 0, 1) : 1;
      const eased = smooth(t);
      for (const key of ['yaw', 'pitch', 'radius', 'lookY'])
        pose[key] = THREE.MathUtils.lerp(motion.from[key], motion.to[key], eased);
      render();
      if (t < 1) schedule();
      else { motion = null; settle(); }
    } else render();
  }
  function settle() {
    root.classList.remove('an-is-moving'); root.setAttribute('aria-busy', 'false');
    status.textContent = (api.apps[state.app]?.name || 'Ensemble') + ' — ' + NAMES[state.angle] +
      (free ? '. Point de vue libre ; les prises de visée réalignent le relief.' : '. Point de vue aligné.');
    const waiting = pending; pending = []; waiting.forEach((resolve) => resolve());
  }
  function move(to, instant = false) {
    motion = { from: { ...pose }, to, start: performance.now(), duration: instant || api.reducedMotion ? 0 : 760 };
    root.classList.add('an-is-moving'); root.setAttribute('aria-busy', 'true');
    schedule();
  }
  function snapshot() {
    return { scene: 'anamorphose', version: 1, app: state.app, angle: state.angle, free,
      pose: { yaw: pose.yaw, pitch: pose.pitch, radiusRatio: layout ? pose.radius / layout.fitRadius : 1,
        lookShift: layout ? pose.lookY - layout.centerY : 0 } };
  }
  function restored(snapshotValue) {
    if (snapshotValue?.scene !== 'anamorphose' || snapshotValue.app !== state.app || snapshotValue.angle !== state.angle)
      return null;
    const p = snapshotValue.pose;
    if (!p || ![p.yaw, p.pitch, p.radiusRatio, p.lookShift].every(Number.isFinite)) return null;
    free = Boolean(snapshotValue.free);
    return { yaw: clamp(p.yaw, -0.5, 0.55), pitch: clamp(p.pitch, -0.2, 0.3),
      radius: layout.fitRadius * clamp(p.radiusRatio, 0.88, 1.35),
      lookY: layout.centerY + clamp(p.lookShift, -1, 1) };
  }
  function update(next, { snapshot: saved = null, instant = false } = {}) {
    if (destroyed) return Promise.resolve();
    state = normalize(next); free = false;
    fillContent(); resize(true);
    const target = restored(saved) || guide();
    if (fallback) { settle(); return Promise.resolve(); }
    const promise = new Promise((resolve) => pending.push(resolve));
    move(target, instant);
    return promise;
  }

  if (renderer) {
    const canvas = renderer.domElement;
    listen(canvas, 'pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary || fallback) return;
      const interrupted = Boolean(motion);
      motion = null;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, pose: { ...pose },
        free: free || interrupted, moved: 0 };
      canvas.setPointerCapture(event.pointerId);
      root.classList.add('an-is-dragging');
    });
    listen(canvas, 'pointermove', (event) => {
      if (!dragging || event.pointerId !== dragging.id) return;
      const dx = event.clientX - dragging.x;
      const dy = event.clientY - dragging.y;
      dragging.moved = Math.max(dragging.moved, Math.hypot(dx, dy));
      pose.yaw = clamp(dragging.pose.yaw - dx / width * 0.9, -0.5, 0.55);
      pose.pitch = clamp(dragging.pose.pitch + dy / height * 0.42, -0.2, 0.3);
      pose.radius = Math.min(layout.fitRadius * 1.35, Math.max(dragging.pose.radius,
        guide().radius * (1 + Math.min(1, Math.hypot(dx / width, dy / height)) * 0.2)));
      free = true; render();
    });
    const release = (event) => {
      if (!dragging || event.pointerId !== dragging.id) return;
      const gesture = dragging; const moved = gesture.moved; dragging = null;
      root.classList.remove('an-is-dragging');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (event.type !== 'pointerup') {
        pose = gesture.pose; free = gesture.free;
        render(); settle(); api.saveView();
        return;
      }
      if (moved < 7) {
        const rect = canvas.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
          -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
        const picked = raycaster.intersectObjects(pickMeshes, false)[0]?.object.userData.control;
        if (picked) { picked.activate(); return; }
      }
      const candidates = state.app === 'ensemble' ? ['presentation'] : ANGLES;
      const nearest = candidates.map((angle) => ({ angle, value: guide(angle) }))
        .sort((a, b) => Math.hypot(a.value.yaw - pose.yaw, a.value.pitch - pose.pitch) -
          Math.hypot(b.value.yaw - pose.yaw, b.value.pitch - pose.pitch))[0];
      if (Math.hypot(nearest.value.yaw - pose.yaw, nearest.value.pitch - pose.pitch) < 0.14) {
        if (nearest.angle !== state.angle) navigate({ angle: nearest.angle }, 'an-relief');
        else { free = false; move(nearest.value); }
      } else settle();
      api.saveView();
    };
    listen(canvas, 'pointerup', release); listen(canvas, 'pointercancel', release);
    listen(canvas, 'lostpointercapture', release);
    listen(canvas, 'keydown', (event) => {
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        if (state.app === 'ensemble') return;
        const offset = event.key === 'ArrowRight' ? 1 : -1;
        const angle = ANGLES[(ANGLES.indexOf(state.angle) + offset + 4) % 4];
        navigate({ angle }, 'an-relief');
      } else if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const choices = ['ensemble', ...APPS];
        const id = choices[(choices.indexOf(state.app) + (event.key === 'ArrowDown' ? 1 : -1) + 4) % 4];
        navigate({ app: id }, 'an-relief');
      } else if (event.key === 'Enter') { event.preventDefault(); free = false; move(guide()); }
    });
  }
  listen(root, 'keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Home' && event.target === renderer?.domElement) {
      event.preventDefault(); navigate({ app: 'ensemble' }, event.target === renderer?.domElement ? 'an-relief' : 'an-overview');
    }
  });

  function inspect() {
    const selected = fields.find((field) => field.angle === state.angle);
    let squared = 0; let samples = 0;
    const project = (point) => {
      const p = point.clone().project(camera);
      return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, z: p.z };
    };
    selected?.fragments.forEach((fragment) => fragment.actualCorners.forEach((point, i) => {
      const actual = project(point); const ideal = project(fragment.idealCorners[i]);
      squared += (actual.x - ideal.x) ** 2 + (actual.y - ideal.y) ** 2; samples++;
    }));
    const all = selected?.fragments.flatMap((f) => f.actualCorners) || [];
    let inscriptionSquared = 0;
    surfaces.forEach((surface) => {
      const actual = project(surface.center); const ideal = project(surface.idealCenter);
      inscriptionSquared += (actual.x - ideal.x) ** 2 + (actual.y - ideal.y) ** 2;
    });
    const gl = renderer?.getContext();
    return {
      concept: 'anamorphose', engine: 'three', revision: THREE.REVISION, state: { ...state },
      webgl2: Boolean(gl && !fallback && String(gl.getParameter(gl.VERSION)).startsWith('WebGL 2')),
      fallback, perspective: camera.isPerspectiveCamera, cameraFov: camera.fov,
      camera: { position: camera.position.toArray(), pose: { ...pose } }, free, moving: Boolean(motion),
      alignment: { samples, rmsPixels: samples ? Math.sqrt(squared / samples) : null,
        depthSpan: all.length ? Math.max(...all.map((p) => p.z)) - Math.min(...all.map((p) => p.z)) : 0,
        fragmentCount: selected?.fragments.length || 0 },
      inscriptions: { count: surfaces.length,
        rmsPixels: surfaces.length ? Math.sqrt(inscriptionSquared / surfaces.length) : null,
        layers: surfaces.map((surface) => ({ name: surface.el.className, depth: surface.depth,
          world: surface.center.toArray() })) },
      controls: controls.filter((c) => !c.el.hidden).map((c) => ({ id: c.el.id, world: c.center.toArray(), projected: project(c.center) })),
      size: { width, height },
    };
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame); frame = 0; motion = null;
    observer?.disconnect(); listeners.forEach((off) => off());
    disposeRelief(); renderer?.dispose();
    renderer?.forceContextLoss();
    light.shadow.map?.dispose();
    root.remove(); pending.splice(0).forEach((resolve) => resolve());
  }

  fillContent(); resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
  observer?.observe(root);
  listen(window, 'resize', () => resize());
  if (!fallback) {
    const target = guide();
    pose = { ...target, yaw: target.yaw + 0.19, radius: target.radius * 1.06 };
    move(target, api.reducedMotion);
  }
  return { update, snapshot, inspect, destroy };
}
