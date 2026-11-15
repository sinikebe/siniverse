import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
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
      const v2 = new URL(url).pathname.startsWith('/concepts/v2/');
      const v3 = new URL(url).pathname.startsWith('/concepts/v3/');
      const expression = v3
        ? 'location.origin === '+JSON.stringify(new URL(url).origin)+' && location.pathname === "/concepts/v3/explore.html" && document.documentElement.dataset.v3Ready === "true"'
        : v2
        ? 'location.origin === ' + JSON.stringify(new URL(url).origin) + ' && location.pathname === "/concepts/v2/explore.html" && document.documentElement.dataset.navigationReady === "true"'
        : 'location.href === ' + JSON.stringify(url) + ' && document.documentElement.dataset.conceptsReady === "true"';
      if (await socket.evaluate(expression)) return;
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
  for(let attempt=0;attempt<200;attempt++) {
    if(await socket.evaluate('location.pathname.startsWith("/concepts/v3/") ? document.documentElement.dataset.v3Ready === "true" : !location.pathname.startsWith("/concepts/v2/") || document.documentElement.dataset.navigationReady === "true"')) return point;
    await pause(50);
  }
  throw new Error('The spatial navigation did not settle after clicking '+selector);
}
async function screenshot(name, width) {
  await pause(500);
  assert(await socket.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow in '+name);
  const height = await socket.evaluate('document.querySelector("#plan-reader-dialog")?.open?innerHeight:Math.min(5000,Math.max(document.documentElement.scrollHeight,innerHeight))');
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
  chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let diagnostics = '',launchError=null;
  chrome.on('error',error=>{launchError=error.message;});
  chrome.stderr.on('data', chunk => { diagnostics = (diagnostics + String(chunk)).slice(-6000); });
  const launchDetails=()=>({binary,exitCode:chrome.exitCode,signal:chrome.signalCode,error:launchError,stderr:diagnostics});
  const portFile = resolve(profile, 'DevToolsActivePort');
  for (let index = 0; index < 200 && !existsSync(portFile); index++) {
    if (launchError || chrome.exitCode !== null || chrome.signalCode !== null) {
      report.launch=launchDetails();throw new Error('Installed Chrome failed to start: '+JSON.stringify(report.launch));
    }
    await pause(100);
  }
  if(!existsSync(portFile)){report.launch=launchDetails();throw new Error('Chrome debugging endpoint did not start: '+JSON.stringify(report.launch));}
  const port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const version=await (await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(8000)})).json();
  assert.equal(typeof version.Browser,'string','The running browser did not expose its version.');
  report.browser=version.Browser;report.launch={binary,probe:'DevTools /json/version'};
  console.log('Using installed running browser: '+report.browser);
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
        assert(await socket.evaluate('document.querySelector("#instrument-canvas").hidden || (document.querySelector("#instrument-fallback").hasAttribute("hidden") && getComputedStyle(document.querySelector("#instrument-fallback")).display === "none")'), 'SVG fallback overlaps the active Canvas.');
        if (format === 'mobile') {
          assert(await socket.evaluate('document.querySelector(".object-stage").getBoundingClientRect().bottom <= document.querySelector(".instrument-app").getBoundingClientRect().top + 1'), 'Mobile sculpture must appear before the app description.');
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
      // V1 remains a regression journey; new screenshots focus on the navigation comparison.
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

  // V2 exercises destinations, complete browser history and real links, not visual toggles.
  const currentRoute = () => socket.evaluate('history.state.__siniverseNavigationV2.route');
  async function waitRoute(expected, focusId) {
    for (let index = 0; index < 100; index++) {
      if (await socket.evaluate('document.documentElement.dataset.navigationReady === "true" && document.documentElement.dataset.navigationState === ' + JSON.stringify(JSON.stringify(expected)) + ' && JSON.stringify(history.state.__siniverseNavigationV2.route) === ' + JSON.stringify(JSON.stringify(expected)))) {
        if (focusId) assert.equal(await socket.evaluate('document.activeElement.id'), focusId, 'Browser history lost the originating control focus.');
        return;
      }
      await pause(50);
    }
    throw new Error('Navigation did not restore: ' + JSON.stringify(expected) + '; actual: ' + JSON.stringify(await currentRoute()));
  }
  async function journeyClick(selector, expected) {
    await click(selector);
    await waitRoute(expected);
  }
  async function keyboardActivate(selector, expected) {
    await socket.send('Page.bringToFront');
    await socket.evaluate('document.querySelector(' + JSON.stringify(selector) + ').focus()');
    await socket.send('Input.dispatchKeyEvent', { type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r' });
    await socket.send('Input.dispatchKeyEvent', { type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13 });
    await waitRoute(expected);
  }
  const depth = node => ({concept:'emboitement',node});
  const story = trail => ({concept:'bifurcations',trail});
  const startMontage = {concept:'montage',panels:['ensemble'],kept:[],focus:'ensemble',origins:{}};
  const rootV2 = origin + '/concepts/v2/explore.html';
  await socket.send('Emulation.setEmulatedMedia', {features:[]});
  for (const [format,width,height] of [['desktop',1365,900],['mobile',390,844]]) {
    await socket.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:format==='mobile'});
    const arrival=format==='mobile'?'.depth-arrival-compact':'.depth-arrival-wide';
    await navigate(rootV2+'?concept=emboitement');
    await screenshot('v2-depth-arrival-'+format,width);
    await journeyClick('#experience '+arrival+' [data-region="finapp"] .arrival-measure:nth-last-child(2)',depth('finapp'));
    await journeyClick('#depth-up',depth('ensemble'));
    const graphSelector='#experience '+arrival+' [data-region="finapp"] .arrival-curve:not(.arrival-alternate)';
    const graphPoint=await socket.evaluate('(() => {const p=document.querySelector('+JSON.stringify(graphSelector)+');p.scrollIntoView({block:"center",behavior:"instant"});const point=p.getPointAtLength(p.getTotalLength()*.72).matrixTransform(p.getScreenCTM());return {x:point.x,y:point.y}})()');
    await socket.send('Input.dispatchMouseEvent',{type:'mousePressed',x:graphPoint.x,y:graphPoint.y,button:'left',clickCount:1});
    await socket.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:graphPoint.x,y:graphPoint.y,button:'left',clickCount:1});
    await waitRoute(depth('finapp'));
    await journeyClick('#depth-up',depth('ensemble'));
    await journeyClick('#experience '+arrival+' [data-region="finapp"] .arrival-app-name',depth('finapp'));
    await screenshot('v2-depth-regions-'+format,width);
    const terrain=format==='mobile'?'.depth-terrain-compact':'.depth-terrain-wide';
    const horizonSelector='#experience '+terrain+' [data-region="finapp.exemple"]';
    const horizonId=await socket.evaluate('document.querySelector('+JSON.stringify(horizonSelector)+').id');
    await keyboardActivate(horizonSelector,depth('finapp.exemple'));
    await screenshot('v2-depth-example-'+format,width);
    await socket.evaluate('history.back()'); await waitRoute(depth('finapp'),horizonId);
    await socket.evaluate('history.forward()'); await waitRoute(depth('finapp.exemple'));
    await journeyClick('#depth-up',depth('finapp'));
    await journeyClick('#depth-up',depth('ensemble'));
    await journeyClick('#experience '+arrival+' [data-region="garapp"] .arrival-app-name',depth('garapp'));
    await journeyClick('#experience '+terrain+' [data-region="garapp.exemple"] .landmark-title',depth('garapp.exemple'));
    assert.equal(await socket.evaluate('document.querySelector("#experience .real-app-link").getAttribute("href")'),'https://garapp.siniverse.cc');
    await navigate(rootV2+'?concept=emboitement&lieu=branchlab.methode');
    await journeyClick('#depth-up',depth('branchlab'));
    report.checks.push('V2 Emboîtement/'+format+': régions SVG clavier/clic, parents, Back/Forward et focus, lien profond et vraie sortie');

    await navigate(rootV2+'?concept=bifurcations');
    await screenshot('v2-story-arrival-'+format,width);
    const choose = path => '#experience .story-choice-link[href*="chemin='+encodeURIComponent(path)+'"]';
    for (const path of ['achat','achat/voiture','achat/voiture/comparer','achat/voiture/comparer/exemple']) {
      await journeyClick(choose(path),story(path.split('/')));
    }
    await screenshot('v2-story-example-'+format,width);
    await journeyClick(choose('achat/voiture/comparer/exemple/suivre'),story(['achat','voiture','comparer','exemple','suivre']));
    assert.equal(await socket.evaluate('document.querySelector("#experience .real-app-link").getAttribute("href")'),'https://garapp.siniverse.cc');
    await journeyClick('#experience .story-word-link[href$="chemin=achat"]',story(['achat']));
    await journeyClick(choose('achat/installation'),story(['achat','installation']));
    await journeyClick(choose('achat/installation/relier'),story(['achat','installation','relier']));
    const revised=await currentRoute();
    await socket.evaluate('history.back()'); await waitRoute(story(['achat','installation']));
    await socket.evaluate('history.forward()'); await waitRoute(revised);
    assert.equal(await socket.evaluate('document.querySelector("#experience .real-app-link").getAttribute("href")'),'https://branchlab.siniverse.cc');
    await reload(); await waitRoute(revised);
    report.checks.push('V2 Bifurcations/'+format+': récit complet, continuation Finapp→Garapp, révision vers Branchlab, Back/Forward, lien profond');

    await navigate(rootV2+'?concept=montage');
    await screenshot('v2-montage-arrival-'+format,width);
    await click('#experience .montage-entry.entry-finapp');
    let montage=await currentRoute();
    assert.deepEqual(montage.panels,['ensemble','finapp']);
    await click('[data-surface="finapp"] .montage-topic[href*="finapp.exemple"]');
    montage=await currentRoute(); assert.equal(montage.focus,'finapp.exemple');
    await click('[data-surface="finapp.exemple"] [data-keep="finapp.exemple"]');
    montage=await currentRoute(); assert.deepEqual(montage.kept,['finapp.exemple']);
    await click('[data-surface="finapp.exemple"] .montage-related[href*="garapp"]');
    montage=await currentRoute(); assert.equal(montage.focus,'garapp');
    await click('[data-surface="garapp"] .montage-topic[href*="garapp.exemple"]');
    montage=await currentRoute();
    assert.deepEqual(montage.panels,['finapp.exemple','garapp','garapp.exemple']);
    assert.deepEqual(montage.kept,['finapp.exemple']);
    await screenshot('v2-montage-kept-'+format,width);
    const exactMount=JSON.stringify(montage);
    const deepLink=await socket.evaluate('document.querySelector("#permalink").href');
    await navigate(deepLink);
    assert.equal(JSON.stringify(await currentRoute()),exactMount);
    await click('[data-surface="garapp.exemple"] [data-close="garapp.exemple"]');
    montage=await currentRoute(); assert.deepEqual(montage.panels,['finapp.exemple','garapp']);
    await socket.evaluate('history.back()'); await waitRoute(JSON.parse(exactMount));
    await socket.evaluate('history.forward()'); await waitRoute(montage);
    if(format==='mobile') await click('.montage-edge[href*="focus=finapp.exemple"]');
    const sourceControl='[data-surface="finapp.exemple"] [data-source-return="finapp"]';
    await click(sourceControl);
    montage=await currentRoute();
    assert.equal(montage.focus,'finapp');
    assert(montage.panels.includes('finapp.exemple'),'Returning to a folded source lost the kept example.');
    await journeyClick('#fold-all',startMontage);
    report.checks.push('V2 Montage/'+format+': source adjacente, conservation, plafond trois, source évincée navigable, repli, URL complète et Back/Forward');

    assert(await socket.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),'V2 horizontal page overflow.');
    assert(await socket.evaluate('(() => {const ids=[...document.querySelectorAll("[id]")].map(e=>e.id);return ids.length===new Set(ids).size})()'),'V2 duplicate IDs.');
    assert.match(await socket.evaluate('document.querySelector(".app-version").textContent'),/^v\d+\.\d+\.\d+$/);
  }
  await socket.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await socket.evaluate('localStorage.removeItem("siniverse.navigation-concepts.v2");sessionStorage.removeItem("siniverse.navigation-concepts.v2");history.replaceState({},"")');
  await navigate(rootV2); await waitRoute(depth('ensemble'));
  await reload(); await waitRoute(story([]));
  await click('.journey-settings > summary');
  await keyboardActivate('#pin-theme',story([]));
  for(let attempt=0;attempt<60;attempt++){if(await socket.evaluate('document.querySelector("#pin-theme").getAttribute("aria-pressed")==="true"'))break;await pause(50);}
  assert.equal(await socket.evaluate('document.querySelector("#pin-theme").getAttribute("aria-pressed")'),'true');
  await reload(); await waitRoute(story([]));
  await navigate(rootV2+'?concept=montage');
  assert.equal(await socket.evaluate('JSON.parse(localStorage.getItem("siniverse.navigation-concepts.v2")).pinned'),'bifurcations');
  await click('.journey-settings > summary');
  await click('#resume-rotation');
  assert.equal(await socket.evaluate('location.search'),'');
  await waitRoute(startMontage);
  await reload(); await waitRoute(depth('ensemble'));
  report.checks.push('V2 rotation uniquement au refresh, épingle clavier, lien direct indépendant, reprise sans saut');
  await socket.evaluate('history.replaceState({}, "")');
  const v2Blocked=await socket.send('Page.addScriptToEvaluateOnNewDocument',{source:'for(const key of ["localStorage","sessionStorage"])Object.defineProperty(window,key,{get(){throw new DOMException("blocked","SecurityError")}});'});
  await navigate(rootV2); await waitRoute(depth('ensemble'));
  await journeyClick('#experience .depth-arrival-wide [data-region="finapp"] .arrival-app-name',depth('finapp'));
  await reload(); await waitRoute(story([]));
  assert.match(await socket.evaluate('document.querySelector("#storage-state").textContent'),/onglet/);
  await socket.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:v2Blocked.identifier});
  report.checks.push('V2 stockage bloqué : préférence et route séparées, rotation au rechargement');
  await socket.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await navigate(rootV2+'?concept=emboitement&lieu=finapp');
  await journeyClick('#experience [data-region="finapp.exemple"] .landmark-title',depth('finapp.exemple'));
  await socket.evaluate('history.back()'); await waitRoute(depth('finapp'));
  report.checks.push('V2 mouvement réduit : mêmes destinations et historique sans dépendre d’une animation');


  // V3 verifies physical gestures and camera/relief state in addition to semantic routes.
  const v3State=(concept,app='ensemble',angle='presentation')=>({concept,app,angle});
  const v3Inspect=()=>socket.evaluate('window.__siniverseV3.inspect()');
  async function until(expression,message){
    for(let attempt=0;attempt<200;attempt++){if(await socket.evaluate(expression))return;await pause(60);}
    const actual=await socket.evaluate('(()=>{const s=window.__siniverseV3?.inspect();return {ready:document.documentElement.dataset.v3Ready,route:s?.route,pose:s?.scene?.pose,reader:s?.scene?.reader,animations:s?.scene?.animationCount,focus:document.activeElement?.id}})()');
    throw Error(message+' Actual state: '+JSON.stringify(actual));
  }
  async function v3Wait(expected){
    await until('document.documentElement.dataset.v3Ready==="true" && document.documentElement.dataset.v3State==='+JSON.stringify(JSON.stringify(expected)), 'V3 route did not settle: '+JSON.stringify(expected));
    assert.deepEqual((await v3Inspect()).route,expected);
  }
  async function v3Click(selector,expected){await click(selector);await v3Wait(expected);}
  async function press(selector,key='Enter'){
    await socket.send('Page.bringToFront');
    await socket.evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');
    const virtualCode=({Enter:13,Escape:27,End:35,ArrowLeft:37,ArrowRight:39})[key]||0;
    await socket.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:virtualCode,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
    await socket.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:virtualCode});
  }
  async function canvasPoint(selector,roomBelow=0){
    return socket.evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+'),r=e.getBoundingClientRect();for(const y of [.2,.4,.65,.8])for(const x of [.15,.4,.7,.86]){const p={x:r.x+r.width*x,y:r.y+r.height*y};if(p.y+' + roomBelow + '<innerHeight-8&&document.elementFromPoint(p.x,p.y)===e)return p;}throw Error("No uncovered canvas gesture area")})()');
  }
  async function dragPoint(start,end,{touch=false}={}){
    if(touch){
      await socket.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y,id:1}]});
      for(let i=1;i<=8;i++)await socket.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8,id:1}]});
      await socket.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await socket.send('Input.dispatchMouseEvent',{type:'mousePressed',x:start.x,y:start.y,button:'left',clickCount:1});
      for(let i=1;i<=8;i++)await socket.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+(end.x-start.x)*i/8,y:start.y+(end.y-start.y)*i/8,button:'left',buttons:1});
      await socket.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:end.x,y:end.y,button:'left',clickCount:1});
    }
    await pause(100);
  }
  const near=(a,b)=>a.length===b.length&&a.every((n,i)=>Math.abs(n-b[i])<1e-5);
  const rootV3=origin+'/concepts/v3/explore.html';
  await socket.send('Emulation.setEmulatedMedia',{features:[]});
  for(const [format,width,height]of [['desktop',1365,900],['mobile',390,740]]){
    const mobile=format==='mobile';
    await socket.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await navigate(rootV3+'?concept=plan');
    let inspected=await v3Inspect();assert.equal(inspected.scene.kind,'webgl2');assert(inspected.scene.triangles>500&&inspected.scene.pixelColors>2);
    await screenshot('v3-plan-exterior-'+format,width);
    const overviewPose=(await v3Inspect()).scene.pose,overviewUrl=await socket.evaluate('location.href'),overviewHistory=await socket.evaluate('history.length');
    const overviewGesture=await canvasPoint('#plan-canvas');await dragPoint(overviewGesture,{x:overviewGesture.x+40,y:overviewGesture.y+10},{touch:mobile});
    assert(!near((await v3Inspect()).scene.pose.position,overviewPose.position),'Free overview drag did not move the camera.');
    assert.equal(await socket.evaluate('location.href'),overviewUrl);assert.equal(await socket.evaluate('history.length'),overviewHistory);
    await click('#plan-cutaway');assert.equal((await v3Inspect()).scene.roofOpen,true);
    await until('window.__siniverseV3.inspect().scene.animationCount===0','The animated cutaway did not settle.');
    if(mobile)assert(await socket.evaluate('(()=>{const a=document.querySelector("#plan-app-finapp"),b=document.querySelector("#plan-app-branchlab"),r=a.getBoundingClientRect(),s=b.getBoundingClientRect();return !a.hidden&&!b.hidden&&(r.bottom<=s.top||s.bottom<=r.top||r.right<=s.left||s.right<=r.left)})()'),'Mobile cutaway support targets overlap.');
    await screenshot('v3-plan-cutaway-'+format,width);await click('#plan-cutaway');
    const exposedDoor=await socket.evaluate('(()=>{const e=document.querySelector("#plan-door"),r=e.getBoundingClientRect();return !e.hidden&&r.width>0&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("#plan-door")===e})()');
    await click(exposedDoor?'#plan-door':'#plan-enter-house');
    await until('(()=>{const s=window.__siniverseV3.inspect().scene;return s.mode==="walk"&&s.animationCount===0&&Math.abs(s.pose.position[2]-2.7)<.01})()','Entrance did not reach the office.');
    assert.equal((await v3Inspect()).scene.pose.position[1],1.65);assert.equal((await v3Inspect()).scene.journeyClear,true);
    await screenshot('v3-plan-office-'+format,width);

    async function targetPoint(candidate){
      assert(candidate,'A real scene target is missing.');
      const p={x:Math.round(candidate.screen.x),y:Math.round(candidate.screen.y)};
      assert(await socket.evaluate('(()=>{const p='+JSON.stringify(p)+';return p.x>3&&p.x<innerWidth-3&&p.y>3&&p.y<innerHeight-3&&[-2,0,2].every(dx=>[-2,0,2].every(dy=>document.elementFromPoint(p.x+dx,p.y+dy)?.id==="plan-canvas"))})()'),'Scene target is covered: '+JSON.stringify(candidate));return p;
    }
    async function nativeClick(candidate){
      const p=await targetPoint(candidate);
      await socket.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,buttons:0});
      await socket.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1});
      await socket.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',buttons:0,clickCount:1});
    }
    async function nativeTap(candidate){
      const p=await targetPoint(candidate);
      await socket.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:9}]});
      await socket.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    async function readerReady(app,angle='presentation'){
      await v3Wait(v3State('plan',app,angle));
      await until('(()=>{const s=window.__siniverseV3.inspect().scene.reader;return s.open&&s.phase==="open"})()','The full-field reader did not settle.');
    }
    async function closeReaderRepeated(focusId=null){
      for(let i=0;i<3;i++)await press('#plan-reader-close','Escape');
      await until('!document.querySelector("#plan-reader-dialog").open&&!document.body.classList.contains("plan-reading-open")','Repeated Escape left a modal or body lock.');
      if(focusId)await until('(()=>{const e=document.getElementById('+JSON.stringify(focusId)+'),r=e?.getBoundingClientRect();return e===document.activeElement&&!e.closest("[hidden]")&&r.width>0&&r.height>0})()','Closing did not restore visible focus to '+focusId+'.');
    }
    async function directTrip(app){
      if(!await socket.evaluate('document.querySelector(".plan-compass details").open'))await click('.plan-compass summary');
      await click('#plan-direct-'+app);await readerReady(app);
      assert.equal(await socket.evaluate('document.querySelector(".plan-compass details").open'),false);
    }

    // The source point is recomputed after each screenshot (which resets document scroll).
    let candidate=(await v3Inspect()).scene.pickTargets.find(p=>p.app==='finapp');
    if(mobile)await nativeTap(candidate);
    else{const p=await targetPoint(candidate);await socket.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,buttons:0});}
    await until('window.__siniverseV3.inspect().scene.previewApp==="finapp"&&!document.querySelector(".house-object-preview").hidden','The physical support did not announce itself.');
    assert.equal((await v3Inspect()).scene.reader.open,false);
    await screenshot('v3-plan-preview-'+format,width);
    if(mobile)await click('#plan-preview-open');
    else await nativeClick((await v3Inspect()).scene.pickTargets.find(p=>p.app==='finapp'));
    await readerReady('finapp');
    inspected=await v3Inspect();const supportPose=inspected.scene.pose;
    assert(inspected.scene.reader.rect.width>=width-1&&inspected.scene.reader.rect.height>=height-1,'Reading is still confined to the monitor.');
    assert(inspected.scene.reader.originRect.width*inspected.scene.reader.originRect.height<width*height*.65,'The opening has no smaller physical support origin.');
    assert.equal(await socket.evaluate('document.activeElement.id'),'plan-reader-title');
    assert.equal(await socket.evaluate('document.querySelector("#plan-reader-open-app").getAttribute("href")'),'https://finapp.siniverse.cc');
    assert(await socket.evaluate('document.querySelector(".plan-reader").scrollWidth<=innerWidth+1'));
    await screenshot('v3-plan-reader-'+format,width);
    await v3Click('#plan-reader-angle-action',v3State('plan','finapp','action'));await readerReady('finapp','action');

    const scrollPoint=await socket.evaluate('(()=>{const r=document.querySelector("#plan-reader-scroll").getBoundingClientRect();return {x:r.x+r.width*.45,y:r.y+r.height*.6}})()');
    await socket.send('Input.dispatchMouseEvent',{type:'mouseMoved',...scrollPoint});
    await socket.send('Input.dispatchMouseEvent',{type:'mouseWheel',...scrollPoint,deltaX:0,deltaY:420});
    await until('document.querySelector("#plan-reader-scroll").scrollTop>20','The full-field mobile/desktop reading cannot scroll.');
    await pause(120);const savedScroll=(await v3Inspect()).scene.reader.scrollTop;
    await socket.evaluate('history.back()');await readerReady('finapp');
    assert.equal(await socket.evaluate('document.querySelector("#plan-reader-scroll").scrollTop'),0,'Back did not restore the initial reading position immediately.');
    await socket.evaluate('history.forward()');await readerReady('finapp','action');
    assert(Math.abs((await v3Inspect()).scene.reader.scrollTop-savedScroll)<2,'Forward lost the reader scroll.');
    const related=await socket.evaluate('(()=>{const e=document.querySelector("#plan-reader-related");e.scrollIntoView({block:"center",behavior:"instant"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,scroll:document.querySelector("#plan-reader-scroll").scrollTop}})()');
    await socket.send('Input.dispatchMouseEvent',{type:'mousePressed',x:related.x,y:related.y,button:'left',buttons:1,clickCount:1});
    await socket.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:related.x,y:related.y,button:'left',buttons:0,clickCount:1});
    await readerReady('garapp');assert.equal((await v3Inspect()).scene.journeyClear,true);
    assert((await v3Inspect()).scene.journey.some(p=>p[0]>.8&&p[2]>1&&p[2]<2.2),'The visit did not use the interior doorway.');
    await socket.evaluate('history.back()');await readerReady('finapp','action');
    assert(Math.abs((await v3Inspect()).scene.reader.scrollTop-related.scroll)<2,'Reopening after showModal lost the saved scroll.');
    assert(near((await v3Inspect()).scene.pose.position,supportPose.position));
    await socket.evaluate('history.forward()');await readerReady('garapp');
    const carPose=(await v3Inspect()).scene.pose;await closeReaderRepeated('plan-app-garapp');
    assert(near((await v3Inspect()).scene.pose.position,carPose.position),'Closing did not return to the same support.');
    const returnFocus=await socket.evaluate('(()=>{const e=document.querySelector("#plan-app-garapp"),r=e.getBoundingClientRect();return {actual:document.activeElement.id,source:history.state?.__siniverseNavigationV3?.view?.sourceFocus,hidden:e.hidden,rect:{x:r.x,y:r.y,width:r.width,height:r.height},scrollY}})()');
    assert.equal(returnFocus.actual,'plan-app-garapp','Return focus: '+JSON.stringify(returnFocus));
    await screenshot('v3-plan-car-return-'+format,width);
    candidate=(await v3Inspect()).scene.pickTargets.find(p=>p.app==='garapp'&&p.blocker?.startsWith('car-'));
    if(mobile)await nativeTap(candidate);else await nativeClick(candidate);
    await readerReady('garapp');assert.equal((await v3Inspect()).scene.lastPick,'voiture-garapp');
    await closeReaderRepeated('plan-canvas');assert.equal(await socket.evaluate('document.activeElement.id'),'plan-canvas');

    // A repeated manual gesture must clear every physical preview, including an interrupted fade.
    const gesture=await canvasPoint('#plan-canvas'),end={x:gesture.x+(gesture.x+110<width-5?110:-110),y:gesture.y+25};
    const beforeHistory=await socket.evaluate('history.length');
    await dragPoint(gesture,end,{touch:mobile});await pause(250);
    inspected=await v3Inspect();assert.equal(inspected.scene.previewApp,null);
    assert(Object.values(inspected.scene.preview).every(v=>v<.001),'A screen or headlight stayed highlighted after moving.');
    assert.equal(await socket.evaluate('history.length'),beforeHistory);
    report.checks.push('Plan/'+format+': vrai aperçu survol/tap, ouverture depuis support, lecture plein champ/scroll, focus, Échap répété, histoire et visite par porte');

    await directTrip('branchlab');
    await v3Click('#plan-reader-angle-methode',v3State('plan','branchlab','methode'));await readerReady('branchlab','methode');
    await v3Click('#plan-reader-angle-limites',v3State('plan','branchlab','limites'));await readerReady('branchlab','limites');
    assert.equal(await socket.evaluate('document.querySelector("#plan-reader-open-app").getAttribute("href")'),'https://branchlab.siniverse.cc');
    await screenshot('v3-plan-branchlab-reader-'+format,width);await closeReaderRepeated();
    for(let i=0;i<16;i++)await press('#plan-canvas','ArrowRight');
    const walkStart=(await v3Inspect()).scene.pose.position,walkHistory=await socket.evaluate('history.length');
    for(let i=0;i<20;i++)await press('#plan-canvas','w');
    const wallPose=(await v3Inspect()).scene.pose;
    assert(wallPose.position[0]>.35&&wallPose.position[0]<.49);assert.equal(wallPose.position[1],1.65);
    const travelled=Math.hypot(wallPose.position[0]-walkStart[0],wallPose.position[2]-walkStart[2]);assert(travelled>1.5&&travelled<2.6);
    assert.equal(await socket.evaluate('history.length'),walkHistory);
    for(let i=0;i<(mobile?7:5);i++)await press('#plan-canvas','ArrowRight');
    inspected=await v3Inspect();const blocked=inspected.scene.pickTargets.find(p=>p.app==='garapp'&&p.blocker?.startsWith('house-wall-'));
    await nativeClick(blocked);await pause(100);
    assert.deepEqual((await v3Inspect()).route,v3State('plan','branchlab','limites'));assert.equal((await v3Inspect()).scene.reader.open,false);
    assert.equal((await v3Inspect()).scene.lastPick,null);
    assert.equal(await socket.evaluate('document.querySelector("#plan-app-garapp").hidden'),true,'A projected target appears through the wall.');
    const freePose=(await v3Inspect()).scene.pose;
    await socket.evaluate('history.back()');await readerReady('branchlab','methode');
    await socket.evaluate('history.forward()');await v3Wait(v3State('plan','branchlab','limites'));
    assert.equal((await v3Inspect()).scene.reader.open,false);
    assert(near((await v3Inspect()).scene.pose.position,freePose.position));assert(near((await v3Inspect()).scene.pose.target,freePose.target));
    report.checks.push('Plan/'+format+': toutes lectures, retour au support, marche/collision, vrai mur occultant 3D/HTML et pose restaurée');

    // Keyboard reopening and cancelling the actual expansion before it finishes.
    await directTrip('finapp');await closeReaderRepeated();
    await until('(()=>{const e=document.querySelector("#plan-app-finapp"),r=e.getBoundingClientRect();if(e.closest("[hidden]")||!r.width||!r.height)return false;e.focus({preventScroll:true});return document.activeElement===e})()','The Finapp support was not ready for keyboard activation.');
    await press('#plan-app-finapp');
    await until('document.querySelector("#plan-reader-dialog").open&&document.querySelector("#plan-reader-dialog").getAnimations().some(a=>a.playState==="running")','No real opening animation was exposed.');
    await press('#plan-reader-close','Escape');
    await until('!document.querySelector("#plan-reader-dialog").open&&!document.body.classList.contains("plan-reading-open")&&document.activeElement.id==="plan-app-finapp"','Cancelling opening did not restore the Finapp focus.');
    assert.equal(await socket.evaluate('document.activeElement.id'),'plan-app-finapp');

    // Exercise the small experiences on their physical screens and notebook.
    async function startDemo(app){
      await directTrip(app);await closeReaderRepeated();
      await socket.evaluate('document.querySelector("#plan-app-'+app+'").focus({preventScroll:true})');
      await until('(()=>{const s=window.__siniverseV3.inspect().scene,e=document.querySelector("#plan-preview-try"),r=e?.getBoundingClientRect();return s.previewApp==='+JSON.stringify(app)+'&&r?.width>0&&r?.height>0&&!e.closest("[hidden]")&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("#plan-preview-try")===e})()','The support preview action was not visible and reachable.');
      await click('#plan-preview-try');
      await until('(()=>{const s=window.__siniverseV3.inspect().scene;return s.demo.app==='+JSON.stringify(app)+'&&s.animationCount===0})()','The on-object experience did not settle.');
      assert.equal((await v3Inspect()).scene.journeyClear,true);
    }
    await startDemo('finapp');
    const firstCurve=await socket.evaluate('document.querySelector(".demo-curve-a").getAttribute("d")');
    await press('#plan-demo-horizon','End');
    assert.equal((await v3Inspect()).scene.demo.horizon,20);
    assert.notEqual(await socket.evaluate('document.querySelector(".demo-curve-a").getAttribute("d")'),firstCurve);
    await screenshot('v3-plan-finapp-demo-'+format,width);
    await click('#plan-demo-read-finapp');await readerReady('finapp');await press('#plan-reader-close','Escape');
    await until('!document.querySelector("#plan-reader-dialog").open&&document.activeElement.id==="plan-demo-read-finapp"','The reader did not return keyboard focus to the screen experience.');
    assert.equal((await v3Inspect()).scene.demo.horizon,20);
    await press('#plan-demo-horizon','Escape');assert.equal((await v3Inspect()).scene.demo.app,null);
    await startDemo('branchlab');await click('#plan-demo-connect');
    await until('window.__siniverseV3.inspect().scene.animationCount===0','The signal did not stop after reaching the display.');
    assert.equal((await v3Inspect()).scene.objects.connected,true);
    await screenshot('v3-plan-branchlab-demo-'+format,width);
    await click('#plan-demo-connect');assert.equal((await v3Inspect()).scene.objects.connected,false);
    await click('#plan-demo-close');assert.equal((await v3Inspect()).scene.demo.app,null);
    await startDemo('garapp');assert.equal((await v3Inspect()).scene.objects.notebookAmount,1);
    await click('#plan-demo-next');await click('#plan-demo-next');
    assert.equal((await v3Inspect()).scene.demo.page,2);assert.equal(await socket.evaluate('document.querySelector("#plan-demo-next").disabled'),true);
    await screenshot('v3-plan-garapp-demo-'+format,width);
    await click('#plan-demo-previous');assert.equal((await v3Inspect()).scene.demo.page,1);
    await click('#plan-demo-read-garapp');await readerReady('garapp');await press('#plan-reader-close','Escape');
    await until('!document.querySelector("#plan-reader-dialog").open&&document.activeElement.id==="plan-demo-read-garapp"','The reader did not return keyboard focus to the notebook experience.');
    assert.equal((await v3Inspect()).scene.demo.page,1);
    await press('#plan-demo-previous','Escape');
    await until('window.__siniverseV3.inspect().scene.objects.notebookAmount===0','The notebook stayed open after leaving.');
    report.checks.push('Plan/'+format+': scénarios sur écran, câble physique réversible, carnet articulé, pages bornées et retour à la manipulation');

    await socket.evaluate('document.querySelector("#plan-canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()');
    await until('document.querySelector("#experience").classList.contains("plan-is-fallback")','WebGL loss did not expose fallback.');
    await v3Click('[data-plan-fallback-app="garapp"]',v3State('plan','garapp'));await readerReady('garapp');
    await closeReaderRepeated();
    await socket.evaluate('document.querySelector(".plan-fallback .real-app-link").scrollIntoView({block:"center",behavior:"instant"})');
    assert(await socket.evaluate('(()=>{const a=document.querySelector(".plan-fallback .real-app-link"),r=a.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest("a")===a})()'));
    report.checks.push('Plan/'+format+': ouverture clavier interrompue, perte réelle de contexte, lecture et sortie fallback');

    await navigate(rootV3+'?concept=reacteur');
    assert.equal((await v3Inspect()).scene.engine,'css3d');
    await v3Click('#reactor-angle-methode',v3State('reacteur','ensemble','methode'));
    if(mobile)await v3Click('#reactor-app-finapp',v3State('reacteur','finapp','methode'));
    else{
      const points=await socket.evaluate('(()=>{const a=document.querySelector("#reactor-app-finapp").getBoundingClientRect(),b=document.querySelector("#reactor-app-socket").getBoundingClientRect();return [{x:a.x+a.width/2,y:a.y+a.height/2},{x:b.x+b.width/2,y:b.y+b.height/2}]})()');
      await dragPoint(points[0],points[1]);await v3Wait(v3State('reacteur','finapp','methode'));
    }
    const assembled=(await v3Inspect()).scene;
    assert.equal(assembled.appSocket.occupied,true);assert.equal(assembled.angleSocket.occupied,true);assert.equal(assembled.parts.length,18);
    assert(assembled.parts.some(p=>p.transform.includes('matrix3d')),'The reactor is flat.');
    await screenshot('v3-reactor-assembly-'+format,width);
    const pose=assembled.pose;
    await press('#reactor-tilt-grip','ArrowRight');
    assert.notDeepEqual((await v3Inspect()).scene.pose,pose,'The physical grip did not tilt the bench.');
    await v3Click('#reactor-app-garapp',v3State('reacteur','garapp','methode'));
    assert.notDeepEqual((await v3Inspect()).scene.parts.map(p=>p.transform),assembled.parts.map(p=>p.transform),'Replacing an ingredient changed only text.');
    await socket.evaluate('history.back()');await v3Wait(v3State('reacteur','finapp','methode'));
    await socket.evaluate('history.forward()');await v3Wait(v3State('reacteur','garapp','methode'));
    await v3Click('#reactor-next-angle',v3State('reacteur','garapp','limites'));
    assert.equal(await socket.evaluate('document.activeElement.id'),'reactor-next-angle','The reading dial lost its focus.');
    await screenshot('v3-reactor-recomposed-'+format,width);
    report.checks.push('V3 Réacteur/'+format+': assemblage libre, vrai drag/sélection, relief18pièces, inclinaison, recomposition, molettes et Back/Forward');

    await navigate(rootV3+'?concept=anamorphose');
    await v3Click('#an-app-finapp',v3State('anamorphose','finapp'));
    await v3Click('#an-angle-action',v3State('anamorphose','finapp','action'));
    const aligned=(await v3Inspect()).scene;
    assert.equal(aligned.webgl2,true);assert(aligned.alignment.fragmentCount>=12&&aligned.alignment.depthSpan>1);
    assert(aligned.alignment.rmsPixels<.5,'The guided optical alignment is not legible.');
    await screenshot('v3-anamorphose-aligned-'+format,width);
    const freePoint=await canvasPoint('#an-relief',360);
    await dragPoint(freePoint,{x:freePoint.x,y:freePoint.y+360});
    const opticalFree=(await v3Inspect()).scene;
    assert(opticalFree.alignment.rmsPixels>3,'The relief does not change under a real viewpoint movement.');
    assert.equal(opticalFree.free,true);
    await screenshot('v3-anamorphose-free-'+format,width);
    await v3Click('#an-app-garapp',v3State('anamorphose','garapp','action'));
    await socket.evaluate('history.back()');await v3Wait(v3State('anamorphose','finapp','action'));
    assert.equal((await v3Inspect()).scene.free,true,'Back lost the free optical view.');
    await socket.evaluate('history.forward()');await v3Wait(v3State('anamorphose','garapp','action'));
    await press('#an-relief','ArrowRight');
    await until('document.documentElement.dataset.v3Ready==="true"','Optical keyboard move did not settle.');
    assert.equal(await socket.evaluate('document.activeElement.id'),'an-relief','The optical keyboard lost focus.');
    await press('#an-relief','ArrowLeft');
    await until('document.documentElement.dataset.v3Ready==="true"','Second optical keyboard move did not settle.');
    assert.equal(await socket.evaluate('document.activeElement.id'),'an-relief');
    await v3Click('#an-overview',v3State('anamorphose'));
    await navigate(rootV3+'?concept=anamorphose&app=branchlab&angle=limites');
    assert.equal((await v3Inspect()).scene.webgl2,true);
    assert.equal(await socket.evaluate('document.querySelector("#an-open-app").getAttribute("href")'),'https://branchlab.siniverse.cc');
    report.checks.push('V3 Anamorphose/'+format+': vrai relief/profondeur, alignement RMS, geste libre, état restauré, clavier répété, recul et lien profond');
  }
  await socket.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await socket.evaluate('localStorage.removeItem("siniverse.navigation-concepts.v3");sessionStorage.removeItem("siniverse.navigation-concepts.v3");history.replaceState({},"")');
  await navigate(rootV3);await v3Wait(v3State('plan'));
  await reload();await v3Wait(v3State('reacteur'));
  await click('.journey-settings>summary');await press('#pin-theme');
  await until('document.querySelector("#pin-theme").getAttribute("aria-pressed")==="true"','Keyboard pin did not settle.');
  await reload();await v3Wait(v3State('reacteur'));
  await navigate(rootV3+'?concept=anamorphose');
  assert.equal(await socket.evaluate('JSON.parse(localStorage.getItem("siniverse.navigation-concepts.v3")).pinned'),'reacteur');
  await click('.journey-settings>summary');await click('#resume-rotation');
  assert.equal(await socket.evaluate('location.search'),'');await v3Wait(v3State('anamorphose'));
  await reload();await v3Wait(v3State('plan'));
  report.checks.push('V3 rotation au rechargement, épingle clavier, lien direct indépendant et reprise sans saut');
  await socket.evaluate('history.replaceState({},"")');
  const deniedV3=await socket.send('Page.addScriptToEvaluateOnNewDocument',{source:'for(const key of ["localStorage","sessionStorage"])Object.defineProperty(window,key,{get(){throw new DOMException("blocked","SecurityError")}});'});
  await navigate(rootV3);await v3Wait(v3State('plan'));
  await reload();await v3Wait(v3State('reacteur'));
  assert.match(await socket.evaluate('document.querySelector("#storage-state").textContent'),/onglet/);
  await socket.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:deniedV3.identifier});
  await socket.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await navigate(rootV3+'?concept=plan&app=finapp&angle=action');await v3Wait(v3State('plan','finapp','action'));
  assert.equal((await v3Inspect()).scene.animationCount,0,'Reduced motion retained a cosmetic animation loop.');
  report.checks.push('V3 stockage bloqué et mouvement réduit, mêmes destinations sans boucle cosmétique');

  assert.deepEqual(report.exceptions, [], 'Browser reported a page exception or resource/CSP error.');
  report.status = 'passed';
}

let timeout;
try {
  await Promise.race([run(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Browser review exceeded 420 seconds.')), 420000); })]);
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
  console.error(error.stack || error);
  if(report.exceptions.length)console.error('PAGE_EXCEPTIONS '+JSON.stringify(report.exceptions));
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
