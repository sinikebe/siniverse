import test from 'node:test';
import assert from 'node:assert/strict';
import { CONCEPTS, HISTORY_KEY, PREFERENCE_KEY, chooseConcept, cleanPreference,
  createPreferenceStore, nextHistory, togglePin } from '../public/concepts/model.mjs';

const memoryStorage = initial => {
  const values = new Map(initial ? [[PREFERENCE_KEY, initial]] : []);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
};
const historyStore = () => ({ state: { unrelated: 'preserved' },
  replaceState(value) { this.state = structuredClone(value); } });

test('rotation starts with Instrument and advances sequentially on each unforced load', () => {
  let preference = cleanPreference(null);
  const seen = [];
  for (let index = 0; index < 5; index++) {
    const view = chooseConcept('', preference);
    seen.push(view.id); preference = view.preference;
  }
  assert.deepEqual(seen, ['instrument', 'fil', 'machine', 'instrument', 'fil']);
});

test('direct links remain stable and never silently replace an existing pinned concept', () => {
  const pinned = { v: 1, revision: 4, last: 'fil', pinned: 'fil' };
  for (let index = 0; index < 3; index++) {
    const view = chooseConcept('?concept=machine', pinned);
    assert.equal(view.id, 'machine'); assert.equal(view.mode, 'direct');
    assert.deepEqual(view.preference, pinned);
  }
  assert.equal(chooseConcept('', pinned).id, 'fil');
  assert.equal(chooseConcept('?concept=unknown', pinned).unknown, true);
  assert.deepEqual(chooseConcept('?concept=unknown', pinned).preference, pinned);
});

test('pinning holds the displayed theme; resume retains it until the next rotation load', () => {
  const first = chooseConcept('', null);
  const pinned = togglePin(first.preference, first.id);
  assert.equal(chooseConcept('', pinned).id, 'instrument');
  const resumed = togglePin(pinned, 'instrument');
  assert.equal(resumed.pinned, null);
  assert.equal(chooseConcept('', resumed).id, 'fil');
  const explicitlyPinned = togglePin(pinned, 'machine');
  assert.equal(explicitlyPinned.pinned, 'machine');
  assert.equal(chooseConcept('', explicitlyPinned).id, 'machine');
});

test('the eventual shortlist can remove concepts without trapping a stale pin', () => {
  const old = { v: 1, revision: 2, last: 'fil', pinned: 'fil' };
  const view = chooseConcept('', old, ['instrument', 'machine']);
  assert.equal(view.id, 'instrument'); assert.equal(view.preference.pinned, null);
  assert.throws(() => chooseConcept('', old, []), /Au moins un/);
  assert.deepEqual(CONCEPTS, ['instrument', 'fil', 'machine']);
});

test('namespaced preferences survive reloads while app data and other history state stay untouched', () => {
  const local = memoryStorage(), history = historyStore();
  local.values.set('finapp', 'private sample left untouched');
  const store = createPreferenceStore({ local: () => local, history: () => history });
  store.write(togglePin(store.read(), 'fil'));
  const reloaded = createPreferenceStore({ local: () => local, history: () => history });
  assert.equal(chooseConcept('', reloaded.read()).id, 'fil');
  assert.equal(local.values.get('finapp'), 'private sample left untouched');
  assert.equal(history.state.unrelated, 'preserved');
  assert.equal(history.state[HISTORY_KEY].pinned, 'fil');
});

test('blocked local storage falls back to the tab history and keeps sequential reloads functional', () => {
  const history = historyStore(), denied = () => { throw new Error('SecurityError'); };
  const first = createPreferenceStore({ local: denied, session: denied, history: () => history });
  first.write(chooseConcept('', first.read()).preference);
  assert.equal(first.mode, 'onglet');
  const second = createPreferenceStore({ local: denied, history: () => history });
  assert.equal(chooseConcept('', second.read()).id, 'fil');
});

test('a quota failure cannot let stale local state overwrite a more recent tab preference', () => {
  const local = memoryStorage(JSON.stringify({ v: 1, revision: 2, last: 'instrument', pinned: null }));
  local.setItem = () => { throw new Error('QuotaExceededError'); };
  const history = historyStore();
  const store = createPreferenceStore({ local: () => local, history: () => history });
  store.write(togglePin(store.read(), 'machine'));
  const afterReload = createPreferenceStore({ local: () => local, history: () => history });
  assert.equal(afterReload.read().pinned, 'machine');
  assert.equal(afterReload.mode, 'onglet');
});

test('corrupt preferences and complete storage denial leave working controls and a known first view', () => {
  const corrupt = memoryStorage('{broken');
  assert.equal(chooseConcept('', createPreferenceStore({ local: () => corrupt }).read()).id, 'instrument');
  const denied = () => { throw new Error('blocked'); };
  const store = createPreferenceStore({ local: denied, session: denied, history: denied });
  assert.equal(store.mode, 'mémoire');
  assert.equal(store.write(togglePin(store.read(), 'machine')).pinned, 'machine');
  assert.equal(chooseConcept('', store.read()).id, 'machine');
});

test('maintenance steps wrap in both directions without storing application records', () => {
  assert.equal(nextHistory(3), 0);
  assert.equal(nextHistory(0, -1), 3);
});
