import { GARAGE_VIEWS } from './garage-views.mjs';

// Frame the main content of Garapp's compact layout. Keep the amount or record
// in view both with its example-vehicle banner and with a personal garage.
const cropTop = {
  garage: 178, interventions: 357, composants: 290, assurance: 244,
  depenses: 230, statistiques: 184, graphiques: 565,
};
const viewingWidth = id => id === 'garage' ? 570 : 400;

export function createGarageScreen(host, api, { onSelect, onExit, onChange }) {
  const wall = document.createElement('section');
  wall.className = 'garage-wall';
  wall.setAttribute('aria-label', 'Les écrans du garage');
  wall.hidden = true;
  host.append(wall);

  // The editor has one stable DOM parent, including when moving between monitors.
  const dialog = document.createElement('dialog');
  dialog.id = 'garage-screen';
  dialog.className = 'garage-screen';
  dialog.setAttribute('aria-labelledby', 'garage-screen-title');
  dialog.innerHTML = `
    <div class="garage-projection">
      <div class="garage-panel">
        <p class="garage-loading" role="status">Ouverture de Garapp…</p>
      </div>
    </div>
    <header class="garage-toolbar">
      <h2 id="garage-screen-title" tabindex="-1" autofocus>Garapp</h2>
      <div class="garage-actions">
        <button type="button" id="garage-expand">Agrandir l’écran</button>
        <button type="button" id="garage-exit">Retour aux écrans</button>
      </div>
    </header>`;
  host.append(dialog);

  const projection = dialog.querySelector('.garage-projection');
  const panel = dialog.querySelector('.garage-panel');
  const loading = panel.querySelector('.garage-loading');
  const title = dialog.querySelector('#garage-screen-title');
  const expandButton = dialog.querySelector('#garage-expand');
  let world, editorSurface, editor, trigger, selected = null;
  let visible = false, expanded = false, withoutWorld = false, warmupTimer = 0;
  let warmed = false;
  const screens = new Map();
  const sizes = new ResizeObserver(entries => {
    for (const { target, contentRect } of entries) {
      if (contentRect.width > 0) target.style.setProperty('--garage-preview-scale', contentRect.width / viewingWidth(target.dataset.garageView));
    }
  });

  function appUrl(id) {
    const url = new URL(api.apps.garapp.url);
    url.hash = id;
    return url.href;
  }

  for (const { id, label } of GARAGE_VIEWS) {
    const display = document.createElement('article');
    display.dataset.garageView = id;
    display.className = 'garage-display';
    display.style.setProperty('--garage-crop', '-' + cropTop[id] + 'px');
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'garage-select-' + id;
    button.className = 'garage-view-heading';
    button.setAttribute('aria-label', 'Consulter Garapp · ' + label);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'garage-screen');
    button.textContent = label;
    const indicator = document.createElement('span');
    indicator.setAttribute('aria-hidden', 'true');
    indicator.textContent = '↗';
    button.append(indicator);
    button.addEventListener('click', () => onSelect(id));
    const content = document.createElement('div');
    content.className = 'garage-preview-content';
    content.inert = true;
    const status = document.createElement('span');
    status.className = 'garage-preview-loading';
    status.textContent = 'Chargement…';
    content.append(status);
    display.append(button, content);
    wall.append(display);
    sizes.observe(display);
    screens.set(id, { id, label, display, content, status, frame: null, handle: null, spec: null });
  }

  function loadPreview(screen, onLoad) {
    const frame = document.createElement('iframe');
    frame.id = 'garage-frame-' + screen.id;
    frame.title = 'Aperçu Garapp · ' + screen.label;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.sandbox = 'allow-scripts allow-same-origin';
    frame.referrerPolicy = 'no-referrer';
    frame.addEventListener('load', () => {
      if (screen.frame !== frame) return;
      screen.status.hidden = true;
      onLoad?.();
    }, { once: true });
    frame.addEventListener('error', () => {
      if (screen.frame !== frame) return;
      screen.status.textContent = 'Aperçu indisponible';
      onLoad?.();
    }, { once: true });
    frame.src = appUrl(screen.id);
    screen.status.textContent = 'Chargement…';
    screen.status.hidden = false;
    screen.frame?.remove();
    screen.frame = frame;
    screen.content.append(frame);
  }
  function finishWarmup() {
    clearTimeout(warmupTimer);
    if (!visible) return;
    warmed = true;
    for (const screen of screens.values()) if (!screen.frame) loadPreview(screen);
    if (dialog.open && selected) loadEditor(screens.get(selected));
  }

  function setVisible(next) {
    if (visible === next) return;
    visible = next;
    wall.hidden = !visible;
    clearTimeout(warmupTimer);
    for (const screen of screens.values()) {
      screen.handle?.setEnabled(visible);
      if (withoutWorld) screen.display.hidden = false;
      if (visible && warmed) loadPreview(screen);
      else if (visible) screen.status.hidden = false;
      else {
        screen.frame?.remove();
        screen.frame = null;
      }
    }
    if (visible && !warmed) {
      // On a new device Garapp's first application may initialize its database.
      // Give it a head start before the other six open the same garage.
      const overview = screens.get('garage');
      warmupTimer = setTimeout(finishWarmup, 30000);
      loadPreview(overview, () => {
        if (warmed) return;
        clearTimeout(warmupTimer);
        warmupTimer = setTimeout(finishWarmup, 260);
      });
    }
  }

  function loadEditor(screen) {
    if (editor) {
      // An explicit hash restores the selected view even if the visitor has
      // navigated within Garapp. Native same-document navigation keeps its app.
      if (selected !== screen.id || !dialog.open) editor.contentWindow.location.replace(appUrl(screen.id));
      editor.title = 'Garapp · ' + screen.label;
      return;
    }
    editor = document.createElement('iframe');
    editor.id = 'garage-frame-garapp';
    editor.title = 'Garapp · ' + screen.label;
    editor.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';
    editor.allow = 'fullscreen; clipboard-write';
    editor.referrerPolicy = 'no-referrer';
    editor.addEventListener('load', () => { loading.hidden = true; });
    editor.src = appUrl(screen.id);
    panel.append(editor);
  }

  function alignProjection() {
    if (!dialog.open || expanded || !world) return;
    const { left, top } = world.canvas.getBoundingClientRect();
    projection.style.transform = 'translate(' + left + 'px,' + top + 'px)';
  }

  function present(requested) {
    expanded = withoutWorld || !editorSurface || requested;
    dialog.classList.toggle('is-expanded', expanded);
    expandButton.hidden = withoutWorld || !editorSurface;
    expandButton.textContent = expanded ? 'Voir sur le mur' : 'Agrandir l’écran';
    editorSurface?.setOverlay(expanded);
    editorSurface?.setEnabled(true);
    if (expanded) panel.hidden = false;
    if (!dialog.open) {
      document.body.classList.add('garage-screen-open');
      dialog.showModal();
    }
    alignProjection();
    if (!withoutWorld) world?.refresh();
  }

  function close({ save = true, focus = true } = {}) {
    if (!dialog.open) return;
    editorSurface?.setEnabled(false);
    dialog.close();
    document.body.classList.remove('garage-screen-open');
    if (focus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    // Garapp subscribes all seven readers to its own repository. They stay
    // mounted here so a saved change appears without resetting the wall.
    if (save) onChange();
  }

  expandButton.addEventListener('click', () => { present(!expanded); onChange(); });
  dialog.querySelector('#garage-exit').addEventListener('click', onExit);
  dialog.addEventListener('cancel', event => { event.preventDefault(); onExit(); });
  window.addEventListener('resize', alignProjection);
  window.addEventListener('scroll', alignProjection, { passive: true });

  return {
    attach(nextWorld, displays) {
      world = nextWorld;
      for (const { id, surface } of displays) {
        const screen = screens.get(id);
        screen.spec = surface;
        screen.handle = world.surface({ ...surface, pixels: viewingWidth(id), layer: wall }, screen.display);
        screen.handle.setEnabled(visible);
      }
      editorSurface = world.surface({ ...displays[0].surface, pixels: 1120, layer: projection }, panel);
      editorSurface.setEnabled(false);
    },
    refreshPositions() {
      for (const screen of screens.values()) screen.handle?.setPlacement(screen.spec);
      if (dialog.open && selected) editorSurface?.setPlacement(screens.get(selected).spec);
    },
    setVisible,
    open({ view = 'garage', expanded: requested, focus = true } = {}) {
      const screen = screens.get(view);
      if (!screen) return;
      if (!dialog.open) trigger = document.activeElement;
      setVisible(true);
      if (warmed) loadEditor(screen);
      selected = screen.id;
      title.textContent = 'Garapp · ' + screen.label;
      if (screen.spec) {
        editorSurface.setPlacement(screen.spec);
        panel.style.aspectRatio = screen.spec.width + ' / ' + screen.spec.height;
      }
      present(requested ?? (dialog.open ? expanded : matchMedia('(max-width: 759px)').matches));
      if (focus) title.focus({ preventScroll: true });
    },
    close,
    isOpen: () => dialog.open,
    isExpanded: () => expanded,
    fallback() {
      withoutWorld = true;
      wall.classList.add('is-fallback');
      for (const screen of screens.values()) {
        screen.handle?.setOverlay(true);
        screen.display.hidden = false;
      }
      if (dialog.open) present(true);
    },
    snapshot: () => ({ open: dialog.open, visible, expanded, view: dialog.open ? selected : null }),
    inspect: () => ({
      open: dialog.open, visible, expanded, view: dialog.open ? selected : null, launched: Boolean(editor), loaded: loading.hidden,
      screens: [...screens.values()].map(({ id, frame, status }) => ({ id, launched: Boolean(frame), loaded: Boolean(frame) && status.hidden }))
    }),
    destroy() {
      close({ save: false, focus: false });
      clearTimeout(warmupTimer);
      sizes.disconnect();
      window.removeEventListener('resize', alignProjection);
      window.removeEventListener('scroll', alignProjection);
      for (const screen of screens.values()) screen.handle?.remove();
      editorSurface?.remove();
      wall.remove();
      dialog.remove();
    }
  };
}
