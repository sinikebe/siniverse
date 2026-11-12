import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the public homepage exposes its app-specific Google data policy', () => {
  assert.match(file('public/index.html'), /href="\/confidentialite\.html"/);
  const policy = file('public/confidentialite.html');
  assert.match(policy, /https:\/\/finapp\.siniverse\.cc/);
  assert.match(policy, /https:\/\/garapp\.siniverse\.cc/);
  assert.match(policy, /drive\.file/);
  assert.match(file('public/sitemap.xml'), /confidentialite\.html/);
});

test('the static Worker publishes only the public directory and keeps the custom 404', () => {
  const worker = JSON.parse(file('wrangler.jsonc'));
  assert.equal(worker.assets.directory, './public');
  assert.equal(worker.assets.not_found_handling, '404-page');
  assert.doesNotMatch(worker.assets.directory, /api|test|secret/i);
  assert.match(file('public/_headers'), /Content-Security-Policy:/);
  assert.match(file('public/404.html'), /<!doctype html>/i);
});
