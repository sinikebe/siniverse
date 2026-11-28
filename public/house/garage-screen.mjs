export function createGarageScreen(host, api, { onExit, onChange }) {
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
      <h2 id="garage-screen-title" tabindex="-1" autofocus>Écran du garage</h2>
      <div class="garage-actions">
        <button type="button" id="garage-expand">Agrandir l’écran</button>
        <button type="button" id="garage-exit">Retour au garage</button>
      </div>
    </header>`;
  host.append(dialog);

  const projection = dialog.querySelector('.garage-projection');
  const panel = dialog.querySelector('.garage-panel');
  const loading = panel.querySelector('.garage-loading');
  const title = dialog.querySelector('#garage-screen-title');
  const expandButton = dialog.querySelector('#garage-expand');
  let world, surface, frame, trigger;
  let expanded = false, fallback = false, destroyed = false;

  function loadApp() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.id = 'garage-frame-garapp';
    frame.title = 'Garapp — suivi des véhicules';
    frame.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';
    frame.allow = 'fullscreen; clipboard-write';
    frame.referrerPolicy = 'no-referrer';
    frame.addEventListener('load', () => { loading.hidden = true; }, { once: true });
    frame.src = api.apps.garapp.url;
    panel.append(frame);
  }

  // The dialog is in the top layer. Align the projection to the original canvas
  // even when the house extends below the viewport or the page has been scrolled.
  function alignProjection() {
    if (!dialog.open || expanded || !world) return;
    const { left, top } = world.canvas.getBoundingClientRect();
    projection.style.transform = 'translate(' + left + 'px,' + top + 'px)';
  }

  function present(requested) {
    expanded = fallback || !surface || requested;
    dialog.classList.toggle('is-expanded', expanded);
    expandButton.hidden = fallback || !surface;
    expandButton.textContent = expanded ? 'Voir sur le mur' : 'Agrandir l’écran';
    surface?.setOverlay(expanded);
    surface?.setEnabled(true);
    if (fallback) panel.hidden = false;
    if (expanded) panel.hidden = false;
    if (!dialog.open) {
      document.body.classList.add('garage-screen-open');
      dialog.showModal();
    }
    alignProjection();
    if (!fallback) world?.refresh();
  }

  function close({ save = true, focus = true } = {}) {
    if (!dialog.open) return;
    surface?.setEnabled(false);
    dialog.close();
    document.body.classList.remove('garage-screen-open');
    if (focus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    if (save) onChange();
  }

  expandButton.addEventListener('click', () => {
    present(!expanded);
    onChange();
  });
  dialog.querySelector('#garage-exit').addEventListener('click', onExit);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    onExit();
  });
  window.addEventListener('resize', alignProjection);
  window.addEventListener('scroll', alignProjection, { passive: true });

  return {
    attach(nextWorld, spec) {
      world = nextWorld;
      panel.style.aspectRatio = spec.width + ' / ' + spec.height;
      surface = world.surface({ ...spec, pixels: 1120, layer: projection }, panel);
      surface.setEnabled(false);
    },
    open({ expanded: requested, focus = true } = {}) {
      if (destroyed) return;
      if (!dialog.open) trigger = document.activeElement;
      const showExpanded = requested ?? (dialog.open ? expanded : matchMedia('(max-width: 759px)').matches);
      loadApp();
      present(showExpanded);
      if (focus) title.focus({ preventScroll: true });
    },
    close,
    isOpen: () => dialog.open,
    isExpanded: () => expanded,
    fallback() {
      fallback = true;
      if (dialog.open) present(true);
    },
    snapshot: () => ({ open: dialog.open, expanded }),
    inspect: () => ({ open: dialog.open, expanded, launched: Boolean(frame), loaded: loading.hidden }),
    destroy() {
      destroyed = true;
      close({ save: false, focus: false });
      window.removeEventListener('resize', alignProjection);
      window.removeEventListener('scroll', alignProjection);
      surface?.remove();
      dialog.remove();
    }
  };
}
