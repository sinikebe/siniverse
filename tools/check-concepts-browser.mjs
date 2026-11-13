import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, extname, basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const output = resolve(root, 'browser-review');
mkdirSync(output, { recursive: true });
const report = { browser: null, checks: [], screenshots: [], exceptions: [], status: 'running' };
let chrome, server, socket, profile;
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function headersFor(pathname) {
  const headers = {};
  let match = false;
  for (const line of readFileSync(resolve(dist, '_headers'), 'utf8').split(/\r?\n/)) {
    if (line.startsWith('/')) {
      const rule = line.trim();
      match = rule.endsWith('*') ? pathname.startsWith(rule.slice(0, -1)) : pathname === rule;
    } else if (match && line.startsWith(' ')) {
      const value = line.trim();
      if (value.startsWith('! ')) delete headers[value.slice(2).toLowerCase()];
      else if (value.includes(':')) {
        const split = value.indexOf(':'), key = value.slice(0, split).toLowerCase(), text = value.slice(split + 1).trim();
        headers[key] = headers[key] ? headers[key] + ', ' + text : text;
      }
    }
  }
  return headers;
}

class Protocol {
  constructor(connection) {
    this.connection = connection; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    connection.addEventListener('message', event => {
      const value = JSON.parse(String(event.data));
      if (value.id) {
        const item = this.pending.get(value.id);
        if (!item) return;
        clearTimeout(item.timer); this.pending.delete(value.id);
        if (value.error) item.reject(new Error(item.method + ': ' + value.error.message)); else item.resolve(value.result);
      } else for (const callback of this.listeners.get(value.method) || []) callback(value.params);
    });
    connection.addEventListener('close', () => {
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Browser closed.')); }
      this.pending.clear();
    });
  }
  on(method, callback) {
    const list = this.listeners.get(method) || [];
    this.listeners.set(method, [...list, callback]);
    return () => this.listeners.set(method, (this.listeners.get(method) || []).filter(item => item !== callback));
  }
  send(method, params = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(method + ' timed out.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.connection.send(JSON.stringify({ id, method, params }));
    });
  }
  wait(method) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { remove(); reject(new Error(method + ' event timed out.')); }, 12000);
      const remove = this.on(method, value => { clearTimeout(timer); remove(); resolve(value); });
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed.');
    return result.result.value;
  }
}

async function ready(url) {
  for (let index = 0; index < 80; index++) {
    try {
      if (await socket.evaluate('location.href === ' + JSON.stringify(url) + ' && document.documentElement.dataset.conceptsReady === "true"')) return;
    } catch { /* A navigation can replace the execution context once. */ }
    await pause(100);
  }
  throw new Error('Concept modules did not become ready: ' + url);
}
async function navigate(url) {
  const loaded = socket.wait('Page.loadEventFired');
  await socket.send('Page.navigate', { url });
  await loaded; await ready(url);
}
async function reload() {
  const url = await socket.evaluate('location.href');
  const loaded = socket.wait('Page.loadEventFired');
  await socket.send('Page.reload', { ignoreCache: true });
  await loaded; await ready(url);
}
async function click(selector) {
  const point = await socket.evaluate('(() => { const e = document.querySelector(' + JSON.stringify(selector)
    + '); if (!e) throw new Error("Missing control"); e.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,scrollY}; })()');
  await socket.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await socket.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await pause(80);
  return point;
}
async function screenshot(name, width) {
  const height = await socket.evaluate('Math.min(5000,Math.max(document.documentElement.scrollHeight,innerHeight))');
  await socket.send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' });
  const image = await socket.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 } }, 20000);
  writeFileSync(resolve(output, name + '.png'), Buffer.from(image.data, 'base64'));
  report.screenshots.push({ file: name + '.png', width, height });
}

async function run() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const binary = candidates.find(path => existsSync(path));
  if (!binary) throw new Error('Chrome système absent : aucun navigateur ni package ne sera téléchargé.');
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(version.status, 0, 'System Chrome did not respond.');
  report.browser = version.stdout.trim();
  console.log('Using installed browser: ' + report.browser);
  assert(existsSync(resolve(dist, 'concepts/index.html')), 'Build dist before browser review.');
  server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
      const target = resolve(dist, '.' + relative);
      if (!target.startsWith(dist + sep) || relative.split('/').some(part => /^[._]/.test(part))) throw new Error('Invalid asset path.');
      response.writeHead(200, { ...headersFor(pathname), 'content-type': MIME[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(readFileSync(target));
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const home = await fetch(origin + '/'), study = await fetch(origin + '/concepts/');
  assert.match(home.headers.get('content-security-policy'), /script-src 'none'/);
  assert.match(study.headers.get('content-security-policy'), /script-src 'self'/);
  report.checks.push('CSP locale : accueil sans scripts, maquettes self uniquement');
  profile = mkdtempSync(resolve(tmpdir(), 'siniverse-browser-'));
  chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnostics = '';
  chrome.stderr.on('data', chunk => { diagnostics = (diagnostics + String(chunk)).slice(-6000); });
  const portFile = resolve(profile, 'DevToolsActivePort');
  for (let index = 0; index < 120 && !existsSync(portFile); index++) {
    if (chrome.exitCode !== null) throw new Error('System Chrome exited: ' + diagnostics);
    await pause(100);
  }
  assert(existsSync(portFile), 'Chrome debugging endpoint did not start.');
  const port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const connection = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser protocol connection timed out.')), 8000);
    connection.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    connection.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Browser protocol connection failed.')); }, { once: true });
  });
  socket = new Protocol(connection);
  socket.on('Runtime.exceptionThrown', event => report.exceptions.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  socket.on('Log.entryAdded', event => { if (event.entry.level === 'error') report.exceptions.push(event.entry.text); });
  await socket.send('Page.enable'); await socket.send('Runtime.enable'); await socket.send('Log.enable');
  for (const [format, width, height] of [['desktop', 1365, 900], ['mobile', 390, 844]]) {
    await socket.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: format === 'mobile' });
    for (const concept of ['instrument', 'fil', 'machine']) {
      await navigate(origin + '/concepts/?concept=' + concept);
      assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), concept);
      assert(await socket.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal page overflow.');
      assert(await socket.evaluate('[...document.querySelectorAll(".app-nav a")].length === 3 && document.querySelector(".app-nav").getBoundingClientRect().bottom < innerHeight'), 'App links are not immediately visible.');
      if (concept === 'instrument') {
        if (format === 'mobile') {
          await click('[data-intent="garapp"]'); await click('[data-history="1"]');
          assert.match(await socket.evaluate('document.querySelector("#instrument-history").textContent'), /24 avril/);
        } else {
          await click('[data-horizon="20"]');
          assert.equal(await socket.evaluate('document.querySelector("[data-horizon=\\"20\\"]").getAttribute("aria-pressed")'), 'true');
        }
      } else if (concept === 'fil') {
        await click('[data-unfold="finapp"]');
        const before = await socket.evaluate('document.querySelector(".fil-mini-chart [data-fil-path=base]").getAttribute("d")');
        await click('#fold-finapp [data-horizon="20"]');
        assert.notEqual(await socket.evaluate('document.querySelector(".fil-mini-chart [data-fil-path=base]").getAttribute("d")'), before);
        assert.equal(await socket.evaluate('document.querySelector("#fold-finapp").hidden'), false);
      } else {
        const source = format === 'mobile' ? 'garapp' : 'branchlab';
        if (format === 'mobile') await socket.evaluate('window.__reviewScrollCalls=0; const original=Element.prototype.scrollIntoView; Element.prototype.scrollIntoView=function(...args){window.__reviewScrollCalls++;return original.apply(this,args)}');
        await click('[data-machine="' + source + '"]');
        assert.equal(await socket.evaluate('document.querySelector("#machine-open").getAttribute("href")'), 'https://' + source + '.siniverse.cc');
        if (format === 'mobile') {
          assert(await socket.evaluate('document.querySelector("#machine-output").parentElement.matches(".mechanism-garapp")'), 'Mobile output is remote from the active mechanism.');
          assert.equal(await socket.evaluate('window.__reviewScrollCalls'), 1, 'Machine action forced a scroll beyond locating its button.');
        }
      }
      await pause(850);
      assert.match(await socket.evaluate('document.querySelector(".app-version").textContent'), /^v\d+\.\d+\.\d+$/);
      await screenshot(concept + '-' + format, width);
      report.checks.push(concept + '/' + format + ': chargement, geste, liens, footer, capture');
    }
  }
  await socket.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await socket.evaluate('localStorage.removeItem("siniverse.home-concepts.v1"); sessionStorage.removeItem("siniverse.home-concepts.v1"); history.replaceState({},"")');
  await navigate(origin + '/concepts/');
  assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), 'instrument');
  await reload();
  assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), 'fil');
  await socket.send('Page.bringToFront');
  await socket.evaluate('document.querySelector("#pin-theme").focus()');
  assert.equal(await socket.evaluate('document.activeElement.id'), 'pin-theme');
  await socket.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await socket.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await socket.evaluate('document.querySelector("#pin-theme").getAttribute("aria-pressed") === "true"')) break;
    await pause(50);
  }
  report.keyboardPin = await socket.evaluate('({focused:document.activeElement.id,documentFocused:document.hasFocus(),pressed:document.querySelector("#pin-theme").getAttribute("aria-pressed"),preference:JSON.parse(localStorage.getItem("siniverse.home-concepts.v1"))})');
  assert.equal(report.keyboardPin.pressed, 'true', 'Keyboard pin must settle before reload.');
  await reload();
  assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), 'fil');
  await navigate(origin + '/concepts/?concept=machine');
  assert.equal(await socket.evaluate('JSON.parse(localStorage.getItem("siniverse.home-concepts.v1")).pinned'), 'fil');
  await click('#pin-theme'); await click('#pin-theme');
  assert.equal(await socket.evaluate('location.search'), '');
  assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), 'machine');
  await reload();
  assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), 'instrument');
  report.checks.push('Rotation au refresh, épingle clavier, lien direct stable, reprise sans saut au clic');
  const blocked = await socket.send('Page.addScriptToEvaluateOnNewDocument', { source:
    'for(const key of ["localStorage","sessionStorage"]) Object.defineProperty(window,key,{get(){throw new DOMException("blocked","SecurityError")}});' });
  await navigate(origin + '/concepts/?review=without-storage');
  assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), 'instrument');
  await reload();
  assert.equal(await socket.evaluate('document.documentElement.dataset.concept'), 'fil');
  assert.match(await socket.evaluate('document.querySelector("#preference-status").textContent'), /onglet/);
  await socket.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blocked.identifier });
  report.checks.push('Stockage bloqué : repli historique et rotation au rechargement');
  const motion = await socket.send('Page.addScriptToEvaluateOnNewDocument', { source:
    'window.__rafCalls=0; const original=requestAnimationFrame; window.requestAnimationFrame=(...args)=>{window.__rafCalls++;return original(...args)};' });
  await socket.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate(origin + '/concepts/?concept=instrument');
  await click('[data-intent="garapp"]');
  assert.equal(await socket.evaluate('window.__rafCalls'), 0);
  assert.equal(await socket.evaluate('document.querySelector("#instrument-view").hidden'), true);
  await socket.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: motion.identifier });
  report.checks.push('Mouvement réduit : changement d’état sans animation ni perspective');
  assert.deepEqual(report.exceptions, [], 'Browser reported a page exception or resource/CSP error.');
  report.status = 'passed';
}

let timeout;
try {
  await Promise.race([run(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Browser review exceeded 180 seconds.')), 180000); })]);
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
  console.error(error.stack || error);
} finally {
  clearTimeout(timeout);
  writeFileSync(resolve(output, 'review.json'), JSON.stringify(report, null, 2) + '\n');
  if (socket) socket.connection.close();
  if (server) server.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  if (chrome && chrome.exitCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), pause(1500)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  if (profile) {
    const target = resolve(profile), parent = resolve(tmpdir());
    assert(target.startsWith(parent + sep) && basename(target).startsWith('siniverse-browser-'));
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  }
  console.log(JSON.stringify({ status: report.status, browser: report.browser, checks: report.checks.length, screenshots: report.screenshots.length }));
}
