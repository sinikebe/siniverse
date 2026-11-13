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
  let current = cleanPreference(null), mode = 'mémoire', readable = null, found = false;
  for (const layer of layers) {
    try {
      const text = layer.read();
      if (!readable) readable = layer.label;
      const raw = JSON.parse(text || 'null');
      if (!raw || raw.v !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0) continue;
      const candidate = cleanPreference(raw);
      if (!found || candidate.revision > current.revision) {
        current = candidate; mode = layer.label; found = true;
      }
    } catch { /* Private browsing, corrupt storage and blocked history use the next layer. */ }
  }
  if (!found) mode = readable || 'mémoire';
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

export function filPaths(horizon = 10) {
  const lift = horizon === 5 ? .6 : horizon === 20 ? 1.45 : 1;
  const y = value => Math.round(240 - value * lift);
  const continuation = 'H930C980 225 980 150 1040 150S1100 290 1160 290 1220 215 1280 215H1465C1510 215 1500 165 1550 165S1600 245 1660 245H1770C1825 245 1825 170 1900 170H2080C2160 170 2130 270 2210 270H2400';
  return {
    base: 'M0 258C160 258 145 283 235 240S370 265 455 ' + y(55) + ' 585 ' + y(30)
      + ' 650 ' + y(95) + 'S740 ' + y(60) + ' 800 225' + continuation,
    alternate: 'M235 240C350 230 370 ' + y(60) + ' 455 ' + y(105)
      + 'S580 ' + y(80) + ' 650 ' + y(145) + ' 735 ' + y(125) + ' 800 ' + y(70)
  };
}
