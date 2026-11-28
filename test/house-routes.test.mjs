import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, parseRoute, routeHref } from '../public/house/model.mjs';
import { GAMES, gameHref } from '../public/house/games.mjs';

test('the gaming shortcut uses the dev game until the site is promoted to production',()=>{
  assert.equal(GAMES.length,1);
  assert.equal(GAMES[0].name,'Décalage');
  for(const host of ['dev.siniverse.cc','localhost','127.0.0.1'])assert.equal(gameHref(GAMES[0],host),'https://dev.decalage.siniverse.cc');
  for(const host of ['siniverse.cc','www.siniverse.cc'])assert.equal(gameHref(GAMES[0],host),'https://decalage.siniverse.cc');
});

test('home and all public destinations round-trip without a concept selector', () => {
  for (const state of [{app:'ensemble'}, {app:'finapp'}, {app:'garapp'}, {app:'branchlab'}, {app:'ensemble',room:'gaming'}, {app:'ensemble',room:'garage'}, {app:'ensemble',room:'office'}, {app:'ensemble',room:'office',program:'finapp'}, {app:'ensemble',room:'office',program:'branchlab'}]) {
    const href = routeHref(state);
    assert.equal(new URL(href, 'https://siniverse.cc').pathname, '/');
    assert.deepEqual(parseRoute(new URL(href, 'https://siniverse.cc').search), state);
    assert.doesNotMatch(href, /concept|angle|camera/);
  }
});

test('only known applications can be launched inside the office desktop',()=>{
  for(const program of ['https://example.com','__proto__','garapp','<script>'])assert.equal(parseRoute('?room=office&program='+encodeURIComponent(program)).program,undefined);
  assert.deepEqual(parseRoute('?program=finapp'),{app:'ensemble'});
  assert.deepEqual(parseRoute('?room=gaming&program=finapp'),{app:'ensemble',room:'gaming'});
  assert.deepEqual(parseRoute('?room=garage&program=finapp'),{app:'ensemble',room:'garage'});
  assert.deepEqual(parseRoute('?app=garapp&room=office&program=finapp'),{app:'garapp'});
});

test('old app and gaming bookmarks keep their destination and discard prototype parameters', () => {
  for (const concept of ['plan','reacteur','anamorphose','instrument','fil','machine']) {
    assert.equal(routeHref(parseRoute('?concept='+concept+'&app=finapp&angle=action')), '/?app=finapp');
  }
  assert.equal(routeHref(parseRoute('?concept=plan&room=gaming')), '/?room=gaming');
  assert.deepEqual(parseRoute('?concept=reacteur'), {app:'ensemble'});
});

test('only known apps and rooms enter the navigation state', () => {
  assert.deepEqual(normalizeState(null), {app:'ensemble'});
  assert.deepEqual(parseRoute('?app=__proto__&room=<script>'), {app:'ensemble'});
  assert.deepEqual(parseRoute('?app=finapp&room=gaming'), {app:'finapp'});
  assert.deepEqual(parseRoute('?app=https://example.com'), {app:'ensemble'});
});
