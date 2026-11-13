import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createInstrument } from '../public/concepts/instrument.mjs';

test('the 3D instrument is static at rest, renders reduced-motion states immediately and stops after an action', t => {
  const previous = Object.fromEntries(['window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const frames = [];
  globalThis.window = { devicePixelRatio: 1, addEventListener() {} };
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  let draws = 0;
  const context = new Proxy({}, { get: (_, key) => key === 'createRadialGradient'
    ? () => ({ addColorStop() {} }) : key === 'fill' ? () => { draws++; } : () => {} });
  const canvas = { hidden: true, getContext: () => context,
    parentElement: { getBoundingClientRect: () => ({ width: 640, height: 430 }) } };
  const instrument = createInstrument(canvas, { reducedMotion: true, intent: 'finapp', horizon: 10, history: 0 });
  assert.equal(canvas.hidden, false); assert(draws > 0); assert.equal(frames.length, 0);
  instrument.update({ horizon: 20 });
  assert.equal(frames.length, 0);
  instrument.setReducedMotion(false);
  instrument.update({ intent: 'garapp' });
  assert.equal(frames.length, 1);
  frames.shift()(performance.now() + 1000);
  assert.equal(frames.length, 0);
});

test('missing canvas support preserves the static illustration fallback', () => {
  const canvas = { hidden: true, getContext: () => null };
  assert.equal(createInstrument(canvas, {}), null);
  assert.equal(canvas.hidden, true);
  assert.equal(createInstrument({ getContext() { throw new Error('unavailable'); } }, {}), null);
});

test('only the concepts route gains local scripts; broad CSP remains intact and is not accumulated', () => {
  const source = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  const policies = path => {
    let matching = false, values = [];
    for (const line of source.split(/\r?\n/)) {
      if (line.startsWith('/')) {
        const pattern = line.trim();
        matching = pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
      } else if (matching) {
        const value = line.trim();
        if (value === '! Content-Security-Policy') values = [];
        else if (value.startsWith('Content-Security-Policy:')) values.push(value);
      }
    }
    return values;
  };
  for (const path of ['/', '/index.html', '/confidentialite.html']) {
    assert.equal(policies(path).length, 1);
    assert.match(policies(path)[0], /script-src 'none'/);
  }
  for (const path of ['/concepts/', '/concepts/concepts.mjs']) {
    assert.equal(policies(path).length, 1);
    assert.match(policies(path)[0], /script-src 'self'/);
    assert.doesNotMatch(policies(path)[0], /script-src 'none'|unsafe-inline|unsafe-eval/);
    assert.match(policies(path)[0], /connect-src 'none'/);
  }
});
