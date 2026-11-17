import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, parseRoute, routeHref } from '../public/house/model.mjs';

test('home and all public destinations round-trip without a concept selector', () => {
  for (const state of [{app:'ensemble'}, {app:'finapp'}, {app:'garapp'}, {app:'branchlab'}, {app:'ensemble',room:'gaming'}]) {
    const href = routeHref(state);
    assert.equal(new URL(href, 'https://siniverse.cc').pathname, '/');
    assert.deepEqual(parseRoute(new URL(href, 'https://siniverse.cc').search), state);
    assert.doesNotMatch(href, /concept|angle|camera/);
  }
});

test('old app and gaming bookmarks keep their destination and discard prototype parameters', () => {
  for (const concept of ['plan','reacteur','anamorphose','instrument','fil','machine']) {
    assert.equal(routeHref(parseRoute('?concept='+concept+'&app=finapp&angle=action')), '/?app=finapp');
  }
  assert.equal(routeHref(parseRoute('?concept=plan&room=gaming')), '/?room=gaming');
  assert.deepEqual(parseRoute('?concept=reacteur'), {app:'ensemble'});
});

test('only known apps and the gaming room enter the navigation state', () => {
  assert.deepEqual(normalizeState(null), {app:'ensemble'});
  assert.deepEqual(parseRoute('?app=__proto__&room=<script>'), {app:'ensemble'});
  assert.deepEqual(parseRoute('?app=finapp&room=gaming'), {app:'finapp'});
  assert.deepEqual(parseRoute('?app=https://example.com'), {app:'ensemble'});
});
