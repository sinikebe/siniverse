import { APPS } from './catalog.mjs';

export const NAVIGATION_KEY = '__siniverseHouse';
export const OFFICE_PROGRAMS = ['finapp', 'branchlab'];

export function normalizeState(value = {}) {
  const app = Object.hasOwn(APPS, value?.app) ? value.app : 'ensemble';
  const room=app==='ensemble'&&['gaming','office','garage','street'].includes(value?.room)?value.room:null;
  return { app, ...(room?{room}:{}), ...(room==='office'&&OFFICE_PROGRAMS.includes(value?.program)?{program:value.program}:{}) };
}

export function parseRoute(search) {
  const query = new URLSearchParams(search);
  return normalizeState({ app: query.get('app'), room: query.get('room'), program: query.get('program') });
}

export function routeHref(value) {
  const state = normalizeState(value), query = new URLSearchParams();
  if (state.app !== 'ensemble') query.set('app', state.app);
  if (state.room) query.set('room', state.room);
  if (state.program) query.set('program', state.program);
  return '/' + (query.size ? '?' + query : '');
}
