import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the public homepage exposes its app-specific Google data policy', () => {
  assert.match(file('public/index.html'), /href="\/confidentialite\.html"/);
  const policy = file('public/confidentialite.html');
  assert.match(policy, /https:\/\/finapp\.siniverse\.cc/);
  assert.match(policy, /https:\/\/garapp\.siniverse\.cc/);
  assert.match(policy, /drive\.file/);
  assert.match(file('public/sitemap.xml'), /confidentialite\.html/);
});

test('the static Worker publishes only dist and keeps the custom 404', () => {
  const worker = JSON.parse(file('wrangler.jsonc'));
  assert.equal(worker.assets.directory, './dist');
  assert.equal(worker.assets.not_found_handling, '404-page');
  assert.doesNotMatch(worker.assets.directory, /api|test|secret/i);
  assert.match(file('public/_headers'), /Content-Security-Policy:/);
  assert.match(file('public/404.html'), /<!doctype html>/i);
});

test('the homepage publishes only the house and all local modules and styles resolve', () => {
  const root = fileURLToPath(new URL('../public/', import.meta.url));
  assert.equal(existsSync(resolve(root, 'concepts')), false);
  const html = file('public/index.html');
  assert.match(html, /src="\/house\/main\.mjs"/);
  assert.doesNotMatch(html, /pin-theme|resume-rotation|Autres mondes|noindex/);
  for (const match of html.matchAll(/(?:src|href)="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
    assert(existsSync(resolve(root, '.' + match[1])), 'Broken page asset: '+match[1]);
  }
  for (const name of readdirSync(resolve(root,'house')).filter(n=>n.endsWith('.mjs'))) {
    const path=resolve(root,'house',name);
    for (const match of readFileSync(path,'utf8').matchAll(/(?:from\s*|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)) {
      if (match[1].startsWith('./vendor/')) continue; // Generated from the locked Three dependency at build time.
      assert(existsSync(resolve(dirname(path),match[1])), 'Broken module import: '+name+' → '+match[1]);
    }
  }
  assert.match(file('public/_redirects'), /^\/concepts\/\* \/ 301$/m);
});

test('only the homepage can execute local scripts and the policy is not accumulated', () => {
  const policies = path => {
    let matching=false, values=[];
    for (const line of file('public/_headers').split(/\r?\n/)) {
      if (line.startsWith('/')) matching=line.endsWith('*')?path.startsWith(line.slice(0,-1)):path===line;
      else if (matching) {
        const value=line.trim();
        if (value==='! Content-Security-Policy') values=[];
        else if (value.startsWith('Content-Security-Policy:')) values.push(value);
      }
    }
    assert.equal(values.length,1); return values[0];
  };
  for (const path of ['/','/index.html']) {
    assert.match(policies(path), /script-src 'self'/);
    assert.match(policies(path), /connect-src 'none'/);
    assert.doesNotMatch(policies(path), /unsafe-inline|unsafe-eval|https:/);
  }
  for (const path of ['/confidentialite','/confidentialite.html','/404.html']) assert.match(policies(path), /script-src 'none'/);
  const globalBlock=file('public/_headers').split(/\n\s*\n/)[0];
  assert.doesNotMatch(globalBlock,/Content-Security-Policy/,'Repeated wildcard Preview blocks must not add a second CSP to the house.');
  assert.match(file('public/404.html'), /http-equiv="Content-Security-Policy"[^>]+script-src 'none'/);
});
