export const CONCEPTS = ['instrument', 'fil', 'machine'];
export const PREFERENCE_KEY = 'siniverse.home-concepts.v1';
export const HISTORY_KEY = '__siniverseHomeConceptsV1';

export const APPS = {
  finapp: { name: 'Finapp', intent: 'Projeter', url: 'https://finapp.siniverse.cc',
    pitch: 'Mettre ses choix en perspective.', description: 'Comparer deux façons d’avancer, au même horizon.' },
  garapp: { name: 'Garapp', intent: 'Entretenir', url: 'https://garapp.siniverse.cc',
    pitch: 'Retrouver le fil de son véhicule.', description: 'Un repère daté rend une intervention plus facile à retrouver.' },
  branchlab: { name: 'Branchlab', intent: 'Relier', url: 'https://branchlab.siniverse.cc',
    pitch: 'Comprendre ce qui relie ses appareils.', description: 'Un exemple de liaison vidéo, décomposé élément par élément.' }
};

export const HISTORY_EXAMPLE = [
  { date: '12 mars 2026', action: 'Contrôle des pneus', amount: '68 €' },
  { date: '24 avril 2026', action: 'Remplacement des essuie-glaces', amount: '34 €' },
  { date: '9 juin 2026', action: 'Révision annuelle', amount: '215 €' },
  { date: '17 septembre 2026', action: 'Contrôle de la batterie', amount: '42 €' }
];

export function cleanPreference(value, allowed = CONCEPTS) {
  const valid = value && value.v === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0;
  return { v: 1, revision: valid ? value.revision : 0,
    last: valid && allowed.includes(value.last) ? value.last : null,
    pinned: valid && allowed.includes(value.pinned) ? value.pinned : null };
}

export function chooseConcept(search, preference, allowed = CONCEPTS) {
  const ids = allowed.filter(id => CONCEPTS.includes(id));
  if (!ids.length) throw new Error('Au moins un concept doit rester disponible.');
  const saved = cleanPreference(preference, ids);
  const query = new URLSearchParams(search);
  if (query.has('concept')) {
    const requested = query.get('concept');
    return { id: ids.includes(requested) ? requested : ids[0], mode: 'direct',
      unknown: !ids.includes(requested), preference: saved };
  }
  const current = ids.indexOf(saved.last);
  const id = saved.pinned || ids[(current + 1) % ids.length];
  return { id, mode: 'rotation', unknown: false, preference: { ...saved, last: id } };
}

export function togglePin(preference, current) {
  if (!CONCEPTS.includes(current)) throw new Error('Concept inconnu.');
  const saved = cleanPreference(preference);
  return { ...saved, last: current, pinned: saved.pinned === current ? null : current };
}

export function createPreferenceStore({ local, session, history } = {}) {
  const layers = [];
  const addStorage = (getStorage, label) => {
    if (!getStorage) return;
    layers.push({ label, read: () => getStorage().getItem(PREFERENCE_KEY),
      write: value => getStorage().setItem(PREFERENCE_KEY, value) });
  };
  addStorage(local, 'local');
  addStorage(session, 'session');
  if (history) layers.push({ label: 'onglet',
    read: () => JSON.stringify(history().state?.[HISTORY_KEY] ?? null),
    write: value => {
      const target = history();
      const previous = target.state;
      target.replaceState({ ...(previous && typeof previous === 'object' ? previous : {}),
        [HISTORY_KEY]: JSON.parse(value) }, '');
    } });
  let current = cleanPreference(null), mode = 'mémoire';
  for (const layer of layers) {
    try {
      const raw = JSON.parse(layer.read() || 'null');
      if (!raw || raw.v !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0) continue;
      const candidate = cleanPreference(raw);
      if (candidate.revision > current.revision || mode === 'mémoire') {
        current = candidate; mode = layer.label;
      }
    } catch { /* Private browsing, corrupt storage and blocked history use the next layer. */ }
  }
  return {
    read: () => ({ ...current }),
    get mode() { return mode; },
    write(value) {
      current = { ...cleanPreference(value), revision: current.revision + 1 };
      const json = JSON.stringify(current);
      let written = false;
      for (const layer of layers) {
        try {
          layer.write(json);
          if (!written) { mode = layer.label; written = true; }
        } catch { /* One failed storage backend must not break the page. */ }
      }
      if (!written) mode = 'mémoire';
      return { ...current };
    }
  };
}

export function nextHistory(index, direction = 1) {
  return (index + direction + HISTORY_EXAMPLE.length) % HISTORY_EXAMPLE.length;
}
