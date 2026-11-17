import { APPS } from './catalog.mjs';

export const NAVIGATION_KEY = '__siniverseHouse';

export function normalizeState(value = {}) {
  const app = Object.hasOwn(APPS, value?.app) ? value.app : 'ensemble';
  return { app, ...(app === 'ensemble' && value?.room === 'gaming' ? { room: 'gaming' } : {}) };
}

export function parseRoute(search) {
  const query = new URLSearchParams(search);
  return normalizeState({ app: query.get('app'), room: query.get('room') });
}

export function routeHref(value) {
  const state = normalizeState(value), query = new URLSearchParams();
  if (state.app !== 'ensemble') query.set('app', state.app);
  if (state.room === 'gaming') query.set('room', 'gaming');
  return '/' + (query.size ? '?' + query : '');
}
