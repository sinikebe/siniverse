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
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

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
  async evaluate(expression, timeout = 10000) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout)
      .catch(error => { throw new Error(error.message + ' Expression: ' + expression.slice(0, 220)); });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed.');
    return result.result.value;
  }
}

async function ready(url) {
  for (let index = 0; index < 80; index++) {
    try {
      if (await socket.evaluate('location.origin === '+JSON.stringify(new URL(url).origin)+' && location.pathname === "/" && document.documentElement.dataset.houseReady === "true"')) return;
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
  await socket.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const point = await socket.evaluate('(() => { const e = document.querySelector(' + JSON.stringify(selector)
    + '); if (!e) throw new Error("Missing control"); e.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,scrollY}; })()');
  await socket.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
  await socket.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await socket.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await pause(80);
  for(let attempt=0;attempt<200;attempt++) {
    if(await socket.evaluate('document.documentElement.dataset.houseReady === "true"')) return point;
    await pause(50);
  }
  throw new Error('The spatial navigation did not settle after clicking '+selector);
}
async function screenshot(name, width) {
  await pause(500);
  assert(await socket.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow in '+name);
  const height = await socket.evaluate('document.querySelector("#plan-reader-dialog")?.open?innerHeight:Math.min(5000,Math.max(document.documentElement.scrollHeight,innerHeight))');
  await socket.send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' });
  const visual = await socket.evaluate('window.__siniverseHouse ? window.__siniverseHouse.inspect().scene : null', 20000);
  if (visual?.kind === 'webgl2') assert(visual.pixelColors > 2, 'Uniform WebGL frame in ' + name);
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
  assert(existsSync(resolve(dist, 'index.html')), 'Build dist before browser review.');
  server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      const pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === '/concepts' || pathname.startsWith('/concepts/')) {
        response.writeHead(301, { Location: '/' + requestUrl.search });
        response.end(); return;
      }
      const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
      const target = resolve(dist, '.' + relative);
      if (!target.startsWith(dist + sep) || relative.split('/').some(part => /^[._]/.test(part))) throw new Error('Invalid asset path.');
      response.writeHead(200, { ...headersFor(pathname), 'content-type': MIME[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(readFileSync(target));
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const home = await fetch(origin + '/'), policy = await fetch(origin + '/confidentialite.html');
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(policy.headers.get('content-security-policy'), /script-src 'none'/);
  assert(!existsSync(resolve(dist,'concepts')), 'Discarded concepts remain in the deployable assets.');
  report.checks.push('Accueil interactif local, confidentialité sans scripts et aucun ancien concept publié');
  const legacy=await fetch(origin+'/concepts/v3/explore.html?concept=plan&room=gaming',{redirect:'manual'});
  assert.equal(legacy.status,301);assert.equal(legacy.headers.get('location'),'/?concept=plan&room=gaming');
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
  // Isolated cross-origin fixtures exercise the host without touching application data.
  // The real public applications are verified separately in the dev preview.
  await socket.send('Page.addScriptToEvaluateOnNewDocument',{source:
    `window.__embeddedFixture={};
     addEventListener('message',event=>{
       if(!['https://finapp.siniverse.cc','https://branchlab.siniverse.cc','https://garapp.siniverse.cc'].includes(event.origin)||!event.data?.testEmbeddedFixture)return;
       const frame=Array.from(document.querySelectorAll('iframe')).find(f=>f.contentWindow===event.source);
       if(!frame)return;
       const key=frame.id.startsWith('garage-frame-')?frame.id:event.data.testEmbeddedFixture;
       window.__embeddedFixture[key]=event.data;
     });`});
  socket.on('Fetch.requestPaused',event=>{
    const id=new URL(event.request.url).hostname.split('.')[0];
    const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>${id} — fixture</title><style>body{margin:0;padding:24px;font:18px system-ui;background:#edf3ef;color:#234}
      input{display:block;margin:20px 0;padding:12px;width:min(80%,400px);font:inherit}
      .reading{margin:12px 0;padding:14px 10px;background:#fff;border-left:4px solid #568975}.reading strong{float:right}</style>
      <h1></h1><p>Cadre de validation isolé. Aucune donnée applicative.</p>
      <label>Note temporaire<input id="note" autocomplete="off"></label><div id="readings"></div>
      <script>
        const id=${JSON.stringify(id)},token=Math.random().toString(36);
        if(id==='garapp'){
          const samples={garage:['Compteur','120 000 km'],interventions:['Dernière révision','14 juin'],
            composants:['Pièces suivies','6'],assurance:['Échéance','36 €'],depenses:['Entretien','142 €'],
            statistiques:['Distance annuelle','9 500 km'],graphiques:['Juin','1 240 km']};
          const [label,value]=samples[location.hash.slice(1)]||samples.garage;
          const readings=document.getElementById('readings');
          for(let i=0;i<10;i++){
            const row=document.createElement('p');row.className='reading';row.textContent=label;
            const amount=document.createElement('strong');amount.textContent=value;row.append(amount);readings.append(row);
          }
        }
        function send(){
          const view=location.hash.slice(1);
          document.querySelector('h1').textContent=view||id;
          const r=note.getBoundingClientRect();
          parent.postMessage({testEmbeddedFixture:id,view,token,notes:note.value,focus:document.activeElement?.id,
            rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight}},${JSON.stringify(origin)});
        }
        note.addEventListener('input',send);
        document.addEventListener('focusin',send);addEventListener('resize',send);addEventListener('hashchange',send);send();
      </script></html>`;
    void socket.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'},{name:'Content-Security-Policy',value:"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"}],body:Buffer.from(html).toString('base64')}).catch(error=>report.exceptions.push(error.message));
  });
  await socket.send('Fetch.enable',{patterns:['finapp','branchlab','garapp'].map(id=>({urlPattern:'https://'+id+'.siniverse.cc/*',resourceType:'Document',requestStage:'Request'}))});
  // Exercise the actual house, physical gestures, semantic links and browser history.
  const houseState=(app='ensemble')=>({app});
  // Read GPU pixels at visual/picking checkpoints, and reuse scene state for other assertions.
  const houseInspect=async({full=false}={})=>{
    if(full)await until('(()=>{const s=window.__siniverseHouse.inspect({fast:true}).scene;return s.layout!=="house-v2"||s.objects.materialsReady})()','The local photographic texture maps did not finish loading.');
    return socket.evaluate(full?'window.__siniverseHouse.inspect()':'window.__siniverseHouse.inspect({fast:true})',full?20000:10000);
  };
  async function until(expression,message){
    const poll=expression.replaceAll('window.__siniverseHouse.inspect()','window.__siniverseHouse.inspect({fast:true})');
    for(let attempt=0;attempt<200;attempt++){if(await socket.evaluate(poll))return;await pause(60);}
    const actual=await socket.evaluate('(()=>{const s=window.__siniverseHouse?.inspect();return {ready:document.documentElement.dataset.houseReady,route:s?.route,pose:s?.scene?.pose,reader:s?.scene?.reader,office:s?.scene?.office,garage:s?.scene?.garage,fixture:window.__embeddedFixture,animations:s?.scene?.animationCount,focus:document.activeElement?.id}})()');
    throw Error(message+' Actual state: '+JSON.stringify(actual));
  }
  async function houseWait(expected){
    await until('document.documentElement.dataset.houseReady==="true" && document.documentElement.dataset.houseState==='+JSON.stringify(JSON.stringify(expected)), 'House route did not settle: '+JSON.stringify(expected));
    assert.deepEqual(await socket.evaluate('window.__siniverseHouse.inspect({fast:true}).route'),expected);
  }
  async function houseClick(selector,expected){await click(selector);await houseWait(expected);}
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
  async function typeInFrame(id,draft){
    const fixture=id==='garapp'?'garage-frame-garapp':id;
    const frameId=(id==='garapp'?'garage-frame-':'office-frame-')+id;
    const inputPoint=await socket.evaluate('('+String(function(frameId,fixture){
      const {rect,viewport}=window.__embeddedFixture[fixture],frame=document.getElementById(frameId).getBoundingClientRect();
      return {x:frame.x+(rect.x+rect.width/2)*frame.width/viewport.width,
        y:frame.y+(rect.y+rect.height/2)*frame.height/viewport.height};
    })+')('+JSON.stringify(frameId)+','+JSON.stringify(fixture)+')');
    assert.equal(await socket.evaluate('document.elementFromPoint('+inputPoint.x+','+inputPoint.y+')?.id'),frameId,
      'The selected application must receive pointer input at its editable field.');
    // Move backwards from the control immediately after the frame. Chrome then
    // focuses the field through the real tab order, including across origins.
    const afterFrame=id==='garapp'?'garage-screen-title':'office-task-finapp';
    await socket.send('Page.bringToFront');
    await socket.evaluate('document.getElementById('+JSON.stringify(afterFrame)+').focus({preventScroll:true})');
    await socket.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8,windowsVirtualKeyCode:9});
    await socket.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',modifiers:8,windowsVirtualKeyCode:9});
    await until('window.__embeddedFixture['+JSON.stringify(fixture)+'].focus==="note"','The editable field inside '+id+' did not receive focus.');
    await socket.send('Input.insertText',{text:draft});
    await socket.send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',text:'w',unmodifiedText:'w',windowsVirtualKeyCode:87});
    await socket.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  }
  const near=(a,b)=>a.length===b.length&&a.every((n,i)=>Math.abs(n-b[i])<1e-5);
  const rootHome=origin+'/';
  const garageViews=['garage','interventions','composants','assurance','depenses','statistiques','graphiques'];
  const loadedWall=JSON.stringify(garageViews)+'.every(view=>window.__embeddedFixture["garage-frame-"+view]?.view===view)';
  await socket.send('Emulation.setEmulatedMedia',{features:[]});
  const viewports=[['desktop',1365,900],['mobile',390,740]];
  const selected=process.env.HOUSE_REVIEW_VIEWPORT;
  if(selected)assert(viewports.some(([format])=>format===selected),'Unknown browser review viewport');
  for(const [format,width,height]of viewports){
    if(selected&&selected!==format)continue;
    const mobile=format==='mobile';
    const garageState={app:'ensemble',room:'garage'};
    async function garageReady(){
      await houseWait(garageState);
      await until('window.__siniverseHouse.inspect().scene.garage.visible&&!window.__siniverseHouse.inspect().scene.garage.open&&'+loadedWall,'The garage did not show its seven live sections on arrival.');
    }
    async function garageDetail(view){
      await houseWait({...garageState,view});
      await until('window.__siniverseHouse.inspect().scene.garage.view==='+JSON.stringify(view)+'&&window.__embeddedFixture["garage-frame-garapp"]?.view==='+JSON.stringify(view),'The chosen Garapp section did not open.');
    }
    async function checkWall(){
      const cards=await socket.evaluate('('+String(function(views){
        return views.map(view=>{
          const frame=document.getElementById('garage-frame-'+view),button=document.getElementById('garage-select-'+view);
          const r=frame.closest('.garage-preview-content').getBoundingClientRect(),content=frame.getBoundingClientRect(),url=new URL(frame.src);
          return {view,hash:url.hash,origin:url.origin,title:frame.title,frameWidth:content.width,frameHeight:content.height,
            width:r.width,height:r.height,x:r.x+r.width/2,y:r.y+r.height/2,label:button.textContent.trim()};
        });
      })+')('+JSON.stringify(garageViews)+')');
      for(const c of cards){
        assert.equal(c.origin,'https://garapp.siniverse.cc');assert.equal(c.hash,'#'+c.view);assert(c.title.trim()&&c.label);
        assert(c.frameWidth>0&&c.frameHeight>0&&c.width>40&&c.height>24&&c.x>0&&c.x<width&&c.y>0&&c.y<height,
          'A garage view is missing from the arrival shot: '+JSON.stringify(c));
      }
      assert.equal(new Set(cards.map(c=>Math.round(c.x)+','+Math.round(c.y))).size,7,'Garapp displays overlap at the same point.');
    }
    await socket.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await navigate(rootHome);
    let inspected=await houseInspect({full:true});assert.equal(inspected.scene.kind,'webgl2');assert(inspected.scene.triangles>500&&inspected.scene.pixelColors>2);
    assert.equal(await socket.evaluate('Array.from(document.querySelectorAll("iframe")).filter(f=>f.src.startsWith("https://garapp.siniverse.cc")).length'),0,'The seven garage apps loaded before the visitor entered.');
    for(const name of ['excavator','crane']){
      const b=inspected.scene.construction[name];
      assert(b&&b.width>12&&b.height>20&&b.x>=0&&b.x+b.width<=width&&b.y>=12&&b.y+b.height>76&&b.y<height-80,'Construction scenery is outside the '+format+' opening shot: '+name+' '+JSON.stringify(b));
    }
    assert.equal(inspected.scene.ambientActive,true,'The street should come to life on arrival.');
    await until('window.__siniverseHouse.inspect({fast:true}).scene.ambientSeconds>'+inspected.scene.ambientSeconds,'The outdoor scene clock did not advance.');
    report.checks.push('Quartier/'+format+': chantier visible et animé dès l’accueil');
    await screenshot('house-exterior-'+format,width);
    if(!mobile){
      await click('.plan-compass summary');
      await houseClick('#plan-direct-street',{app:'ensemble',room:'street'});
      assert((await houseInspect()).scene.pose.target[2]>5.7,'The view from the entrance should face the opposite side of the street.');
      await screenshot('house-street-from-door',width);
      await click('#plan-origin');
      await until('window.__siniverseHouse.inspect({fast:true}).scene.mode==="overview"','The return to the house did not settle.');
      await socket.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await until('!window.__siniverseHouse.inspect({fast:true}).scene.ambientActive','Reduced motion did not stop the outdoor animation.');
      await socket.send('Emulation.setEmulatedMedia',{features:[]});
      await until('window.__siniverseHouse.inspect({fast:true}).scene.ambientActive','Outdoor animation did not resume.');
    }
    const overviewPose=(await houseInspect()).scene.pose,overviewUrl=await socket.evaluate('location.href'),overviewHistory=await socket.evaluate('history.length');
    const overviewGesture=await canvasPoint('#plan-canvas');await dragPoint(overviewGesture,{x:overviewGesture.x+40,y:overviewGesture.y+10},{touch:mobile});
    assert(!near((await houseInspect()).scene.pose.position,overviewPose.position),'Free overview drag did not move the camera.');
    assert.equal(await socket.evaluate('location.href'),overviewUrl);assert.equal(await socket.evaluate('history.length'),overviewHistory);
    await click('#plan-cutaway');assert.equal((await houseInspect()).scene.roofOpen,true);
    await until('window.__siniverseHouse.inspect().scene.animationCount===0','The animated cutaway did not settle.');
    if(mobile)assert(await socket.evaluate('(()=>{const items=["#plan-office-screen","#plan-gaming-screen"].map(s=>document.querySelector(s));return items.every(e=>!e.hidden)&&items.every((e,i)=>items.slice(i+1).every(f=>{const r=e.getBoundingClientRect(),s=f.getBoundingClientRect();return r.bottom<=s.top||s.bottom<=r.top||r.right<=s.left||s.right<=r.left}))})()'),'Mobile cutaway support targets overlap.');
    await screenshot('house-cutaway-'+format,width);await click('#plan-cutaway');
    const exposedDoor=await socket.evaluate('(()=>{const e=document.querySelector("#plan-door"),r=e.getBoundingClientRect();return !e.hidden&&r.width>0&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("#plan-door")===e})()');
    await click(exposedDoor?'#plan-door':'#plan-enter-house');
    await until('(()=>{const s=window.__siniverseHouse.inspect().scene;return s.mode==="walk"&&s.animationCount===0&&Math.abs(s.pose.position[2]-2.7)<.01})()','Entrance did not reach the office.');
    assert.equal((await houseInspect()).scene.pose.position[1],1.65);assert.equal((await houseInspect()).scene.journeyClear,true);
    assert.equal((await houseInspect()).scene.ambientActive,false,'The outdoor scene kept rendering inside the office.');
    await screenshot('house-office-'+format,width);
    if(!mobile){
      for(let i=0;i<5;i++)await press('#plan-canvas','w');
      for(let i=0;i<22;i++)await press('#plan-canvas','d');
      await until('window.__siniverseHouse.inspect().scene.garage.visible&&'+loadedWall,'Walking through the interior door did not turn on the wall.');
      assert.equal((await houseInspect()).scene.garage.open,false,'A screen took focus during free movement.');
    }

    async function targetPoint(candidate){
      assert(candidate,'A real scene target is missing.');
      const p={x:Math.round(candidate.screen.x),y:Math.round(candidate.screen.y)};
      assert(await socket.evaluate('(()=>{const p='+JSON.stringify(p)+';return p.x>3&&p.x<innerWidth-3&&p.y>3&&p.y<innerHeight-3&&[-2,0,2].every(dx=>[-2,0,2].every(dy=>document.elementFromPoint(p.x+dx,p.y+dy)?.id==="plan-canvas"))})()'),'Scene target is covered: '+JSON.stringify(candidate));return p;
    }
    async function exposedCarTarget(){
      const candidates=(await houseInspect({full:true})).scene.pickTargets.filter(p=>p.app==='garapp'&&p.blocker?.startsWith('car-'));
      const result=await socket.evaluate('(()=>{const candidates='+JSON.stringify(candidates)+';return candidates.map(c=>{const x=Math.round(c.screen.x),y=Math.round(c.screen.y);return {candidate:c,exposed:x>3&&x<innerWidth-3&&y>3&&y<innerHeight-3&&[-2,0,2].every(dx=>[-2,0,2].every(dy=>document.elementFromPoint(x+dx,y+dy)?.id==="plan-canvas")),cover:document.elementFromPoint(x,y)?.outerHTML.slice(0,180)}})})()');
      const target=result.find(item=>item.exposed)?.candidate;
      assert(target,'No exposed native car target: '+JSON.stringify(result));return target;
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
    async function readerReady(app){
      await houseWait(houseState(app));
      await until('(()=>{const s=window.__siniverseHouse.inspect().scene.reader;return s.open&&s.phase==="open"})()','The full-field reader did not settle.');
    }
    async function closeReaderRepeated(focusId=null){
      for(let i=0;i<3;i++)await press('#plan-reader-close','Escape');
      await until('!document.querySelector("#plan-reader-dialog").open&&!document.body.classList.contains("plan-reading-open")','Repeated Escape left a modal or body lock.');
      await until('(()=>{const s=window.__siniverseHouse.inspect({fast:true}).scene;return s.reader.phase==="closed"&&!s.animationCount})()','The return to the physical support is still moving.');
      if(focusId)await until('(()=>{const e=document.getElementById('+JSON.stringify(focusId)+'),r=e?.getBoundingClientRect();return e===document.activeElement&&!e.closest("[hidden]")&&r.width>0&&r.height>0})()','Closing did not restore visible focus to '+focusId+'.');
    }
    // Presentation URLs remain available independently of the desktop launcher.
    await navigate(rootHome+'?app=finapp');
    await readerReady('finapp');
    inspected=await houseInspect();const supportPose=inspected.scene.pose;
    assert(inspected.scene.reader.rect.width>=width-1&&inspected.scene.reader.rect.height>=height-1,'Reading is still confined to the monitor.');
    assert(inspected.scene.reader.originRect.width*inspected.scene.reader.originRect.height<width*height*.65,'The opening has no smaller physical support origin.');
    assert.equal(await socket.evaluate('document.activeElement.id'),'plan-reader-title');
    assert.equal(await socket.evaluate('document.querySelector("#plan-reader-open-app").getAttribute("href")'),'https://finapp.siniverse.cc');
    assert(await socket.evaluate('document.querySelector(".plan-reader").scrollWidth<=innerWidth+1'));
    await screenshot('house-reader-'+format,width);
    assert.equal(await socket.evaluate('document.querySelectorAll(".plan-reader-angles,[data-reader-angle]").length'),0,'The app still has multiple explanation tabs.');
    assert.equal(await socket.evaluate('document.querySelectorAll(".plan-reader-prose>p").length'),3);

    const canScroll=await socket.evaluate('document.querySelector("#plan-reader-scroll").scrollHeight>document.querySelector("#plan-reader-scroll").clientHeight+20');
    if(canScroll){
      const scrollPoint=await socket.evaluate('(()=>{const r=document.querySelector("#plan-reader-scroll").getBoundingClientRect();return {x:r.x+r.width*.45,y:r.y+r.height*.6}})()');
      await socket.send('Input.dispatchMouseEvent',{type:'mouseMoved',...scrollPoint});
      await socket.send('Input.dispatchMouseEvent',{type:'mouseWheel',...scrollPoint,deltaX:0,deltaY:420});
      await until('document.querySelector("#plan-reader-scroll").scrollTop>20','The app explanation cannot scroll.');
    }
    const related=await socket.evaluate('(()=>{const e=document.querySelector("#plan-reader-related");e.scrollIntoView({block:"center",behavior:"instant"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,scroll:document.querySelector("#plan-reader-scroll").scrollTop}})()');
    await socket.send('Input.dispatchMouseEvent',{type:'mousePressed',x:related.x,y:related.y,button:'left',buttons:1,clickCount:1});
    await socket.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:related.x,y:related.y,button:'left',buttons:0,clickCount:1});
    await readerReady('garapp');assert.equal((await houseInspect()).scene.journeyClear,true);
    assert.deepEqual(await socket.evaluate('Array.from(document.querySelectorAll("#plan-reader-open-app,.reader-launch"),a=>[new URL(a.href).search,a.target])'),[['?room=garage',''],['?room=garage','']]);
    assert((await houseInspect()).scene.journey.some(p=>p[0]>.8&&p[2]>1&&p[2]<2.2),'The visit did not use the interior doorway.');
    await socket.evaluate('history.back()');await readerReady('finapp');
    assert(Math.abs((await houseInspect()).scene.reader.scrollTop-related.scroll)<2,'Reopening after showModal lost the saved scroll.');
    assert(near((await houseInspect()).scene.pose.position,supportPose.position));
    await socket.evaluate('history.forward()');await readerReady('garapp');
    const carPose=(await houseInspect()).scene.pose;await closeReaderRepeated('plan-app-garapp');
    assert(near((await houseInspect()).scene.pose.position,carPose.position),'Closing did not return to the same support.');
    const returnFocus=await socket.evaluate('(()=>{const e=document.querySelector("#plan-app-garapp"),r=e.getBoundingClientRect();return {actual:document.activeElement.id,source:history.state?.__siniverseHouse?.view?.sourceFocus,hidden:e.hidden,rect:{x:r.x,y:r.y,width:r.width,height:r.height},scrollY}})()');
    assert.equal(returnFocus.actual,'plan-app-garapp','Return focus: '+JSON.stringify(returnFocus));
    await screenshot('house-car-return-'+format,width);
    let candidate=await exposedCarTarget();
    if(mobile)await nativeTap(candidate);else await nativeClick(candidate);
    await garageReady();assert.equal((await houseInspect()).scene.lastPick,'voiture-garapp');
    assert.equal((await houseInspect()).scene.garage.open,false,'Clicking the car must bring the visitor to the entire display wall.');

    // A repeated manual gesture must clear every physical preview, including an interrupted fade.
    const gesture=await canvasPoint('#plan-canvas'),end={x:gesture.x+(gesture.x+110<width-5?110:-110),y:gesture.y+25};
    const beforeHistory=await socket.evaluate('history.length');
    await dragPoint(gesture,end,{touch:mobile});await pause(250);
    inspected=await houseInspect();assert.equal(inspected.scene.previewApp,null);
    assert(Object.values(inspected.scene.preview).every(v=>v<.001),'A screen or headlight stayed highlighted after moving.');
    assert.equal(await socket.evaluate('history.length'),beforeHistory);
    report.checks.push('Plan/'+format+': vrai aperçu survol/tap, ouverture depuis support, lecture plein champ/scroll, focus, Échap répété, histoire et visite par porte');

    // The fictional garage notebook remains a separate physical experience.
    async function startDemo(app){
      await socket.evaluate('document.querySelector("#plan-app-'+app+'").focus({preventScroll:true})');
      await until('(()=>{const s=window.__siniverseHouse.inspect().scene,e=document.querySelector("#plan-preview-try"),r=e?.getBoundingClientRect();return s.previewApp==='+JSON.stringify(app)+'&&r?.width>0&&r?.height>0&&!e.closest("[hidden]")&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("#plan-preview-try")===e})()','The support preview action was not visible and reachable.');
      await click('#plan-preview-try');
      await until('(()=>{const s=window.__siniverseHouse.inspect().scene;return s.demo.app==='+JSON.stringify(app)+'&&s.animationCount===0})()','The on-object experience did not settle.');
      assert.equal((await houseInspect()).scene.journeyClear,true);
    }
    await navigate(rootHome+'?app=garapp');await readerReady('garapp');await closeReaderRepeated();
    await startDemo('garapp');assert.equal((await houseInspect()).scene.objects.notebookAmount,1);
    await click('#plan-demo-next');await click('#plan-demo-next');
    assert.equal((await houseInspect()).scene.demo.page,2);assert.equal(await socket.evaluate('document.querySelector("#plan-demo-next").disabled'),true);
    await screenshot('house-garapp-demo-'+format,width);
    await click('#plan-demo-previous');assert.equal((await houseInspect()).scene.demo.page,1);
    await click('#plan-demo-read-garapp');await readerReady('garapp');await press('#plan-reader-close','Escape');
    await until('!document.querySelector("#plan-reader-dialog").open&&document.activeElement.id==="plan-demo-read-garapp"','The reader did not return keyboard focus to the notebook experience.');
    assert.equal((await houseInspect()).scene.demo.page,1);
    await press('#plan-demo-previous','Escape');
    await until('window.__siniverseHouse.inspect().scene.objects.notebookAmount===0','The notebook stayed open after leaving.');
    report.checks.push('Plan/'+format+': carnet articulé, pages bornées et retour à la manipulation');

    await navigate(rootHome+'?app=branchlab');await readerReady('branchlab');
    assert.equal(await socket.evaluate('document.querySelectorAll(".plan-reader-angles,[data-reader-angle]").length'),0);
    assert.equal(await socket.evaluate('document.querySelector("#plan-reader-open-app").getAttribute("href")'),'https://branchlab.siniverse.cc');
    await screenshot('house-branchlab-reader-'+format,width);await closeReaderRepeated();
    for(let i=0;i<16;i++)await press('#plan-canvas','ArrowRight');
    const walkStart=(await houseInspect()).scene.pose.position,walkHistory=await socket.evaluate('history.length');
    for(let i=0;i<20;i++)await press('#plan-canvas','w');
    const wallPose=(await houseInspect()).scene.pose;
    assert(wallPose.position[0]>.35&&wallPose.position[0]<.49);assert.equal(wallPose.position[1],1.65);
    const travelled=Math.hypot(wallPose.position[0]-walkStart[0],wallPose.position[2]-walkStart[2]);assert(travelled>2.5&&travelled<3.6);
    assert.equal(await socket.evaluate('history.length'),walkHistory);
    for(let i=0;i<(mobile?7:5);i++)await press('#plan-canvas','ArrowRight');
    inspected=await houseInspect({full:true});const blocked=inspected.scene.pickTargets.find(p=>p.app==='garapp'&&p.blocker?.startsWith('house-wall-'));
    await nativeClick(blocked);await pause(100);
    assert.deepEqual((await houseInspect()).route,houseState('branchlab'));assert.equal((await houseInspect()).scene.reader.open,false);
    assert.equal((await houseInspect()).scene.lastPick,null);
    assert.equal(await socket.evaluate('document.querySelector("#plan-app-garapp").hidden'),true,'A projected target appears through the wall.');
    report.checks.push('Plan/'+format+': lectures, retour au support, marche/collision et mur occultant 3D/HTML');

    // One physical PC, two lazy cross-origin apps, persistent windows and history.
    await navigate(rootHome+'?room=office');
    const officeState=program=>({app:'ensemble',room:'office',...(program?{program}:{})});
    await houseWait(officeState());
    await until('window.__siniverseHouse.inspect().scene.office.open','The common desktop did not open.');
    assert.equal(await socket.evaluate('document.querySelectorAll("#office-programs iframe").length'),0,'Apps loaded before launch.');
    assert.equal((await houseInspect()).scene.office.expanded,mobile,'Mobile should open the enlarged desktop automatically.');
    assert.equal((await houseInspect()).scene.journeyClear,true);
    await screenshot('house-office-desktop-'+format,width);
    await houseClick('#office-launch-finapp',officeState('finapp'));
    await until('Boolean(window.__embeddedFixture.finapp)','Finapp iframe did not load.');
    if(!mobile)await click('#office-dock-expand');
    await until('window.__siniverseHouse.inspect().scene.office.expanded','Enlarging the PC did not settle.');
    await until('(()=>{const f=window.__embeddedFixture.finapp,r=document.querySelector("#office-frame-finapp").getBoundingClientRect();return Math.abs(f.viewport.width-r.width)<2&&Math.abs(f.viewport.height-r.height)<2})()','The enlarged app did not resize.');
    const beforeTyping=(await houseInspect()).scene.pose;
    await typeInFrame('finapp','brouillon ');
    await until('window.__embeddedFixture.finapp.notes==="brouillon w"','Typing into the embedded app did not work.');
    assert(near((await houseInspect()).scene.pose.position,beforeTyping.position),'Typing into an app moved the camera.');
    const retained=await socket.evaluate('window.__embeddedFixture.finapp');
    const assertRetained=async()=>{
      assert.deepEqual(await socket.evaluate('(()=>{const f=window.__embeddedFixture.finapp;return {token:f.token,notes:f.notes}})()'),{token:retained.token,notes:'brouillon w'},'The Finapp window reloaded or lost its draft.');
      assert.equal(await socket.evaluate('document.querySelectorAll("#office-programs iframe").length'),2);
    };
    await houseClick('#office-task-branchlab',officeState('branchlab'));
    await until('Boolean(window.__embeddedFixture.branchlab)','Branchlab iframe did not load.');
    await houseClick('#office-task-finapp',officeState('finapp'));await assertRetained();
    const appPose=(await houseInspect()).scene.pose;
    await socket.evaluate('history.back()');await houseWait(officeState('branchlab'));
    await socket.evaluate('history.forward()');await houseWait(officeState('finapp'));await assertRetained();
    assert(near((await houseInspect()).scene.pose.position,appPose.position));
    await houseClick('#office-home',officeState());await assertRetained();
    await houseClick('#office-launch-finapp',officeState('finapp'));await assertRetained();
    await screenshot('house-office-app-fixture-'+format,width);
    await click('#office-expand');assert.equal((await houseInspect()).scene.office.expanded,false);await assertRetained();
    await click('#office-dock-expand');assert.equal((await houseInspect()).scene.office.expanded,true);await assertRetained();
    await press('#office-exit','Escape');
    assert.equal((await houseInspect()).scene.office.open,false);await assertRetained();
    assert.equal(await socket.evaluate('document.activeElement.id'),'plan-office-screen');
    candidate=(await houseInspect({full:true})).scene.pickTargets.find(p=>p.app==='finapp');
    assert.equal(candidate.blocker,'house-office-screen');
    if(mobile)await nativeTap(candidate);else await nativeClick(candidate);
    await houseWait(officeState());await until('window.__siniverseHouse.inspect().scene.office.open','The physical monitor did not reopen the desktop.');
    await assertRetained();
    await click(mobile?'#office-exit':'#office-dock-exit');
    const closedPose=(await houseInspect()).scene.pose;
    await click('#plan-origin');await houseWait(houseState());
    await socket.evaluate('history.back()');await houseWait(officeState());
    assert.equal((await houseInspect()).scene.office.open,false,'Back reopened a desktop that had been closed.');
    assert(near((await houseInspect()).scene.pose.position,closedPose.position));await assertRetained();
    report.checks.push('PC/'+format+': bureau commun, chargement différé, saisie isolée, agrandissement, fenêtres conservées, clic physique, focus et Retour/Avant');

    await click('.plan-compass summary');await click('#plan-direct-garapp');await garageReady();
    await checkWall();
    assert.equal((await houseInspect()).scene.journeyClear,true);
    await screenshot('house-garage-wall-'+format,width);
    const chosenView='interventions';
    const chosenButton='#garage-select-'+chosenView;
    const glass=(await houseInspect({full:true})).scene.pickTargets.find(p=>p.app==='garage'&&p.view===chosenView);
    assert.equal(glass?.blocker,'house-garage-display-'+chosenView);
    if(mobile)await nativeTap(glass);else await nativeClick(glass);
    await garageDetail(chosenView);
    if(!(await houseInspect()).scene.garage.expanded)await click('#garage-expand');
    await until('(()=>{const frame=document.getElementById("garage-frame-garapp"),view=window.__embeddedFixture[frame.id].viewport;return window.__siniverseHouse.inspect().scene.garage.expanded&&Math.abs(view.width-frame.getBoundingClientRect().width)<2})()','The editor did not adjust to the enlarged display.');
    const editingPose=(await houseInspect()).scene.pose;
    await typeInFrame('garapp','garage ');
    await until('window.__embeddedFixture["garage-frame-garapp"].notes==="garage w"','Typing inside the selected app did not reach its form.');
    assert(near((await houseInspect()).scene.pose.position,editingPose.position),'App keystrokes moved the garage camera.');
    const garageToken=await socket.evaluate('window.__embeddedFixture["garage-frame-garapp"].token');
    await press('#garage-exit','Escape');await garageReady();
    assert.equal(await socket.evaluate('document.activeElement.id'),chosenButton.slice(1));
    await press(chosenButton);await garageDetail(chosenView);
    assert.equal(await socket.evaluate('window.__embeddedFixture["garage-frame-garapp"].token'),garageToken,'Reopening the same view reloaded the editor.');
    assert.equal(await socket.evaluate('window.__embeddedFixture["garage-frame-garapp"].notes'),'garage w');
    assert.equal((await socket.send('Target.getTargets')).targetInfos.some(t=>t.type==='page'&&t.url.startsWith('https://garapp.siniverse.cc')),false,'Garapp opened a separate tab.');
    await click('#garage-exit');await garageReady();
    report.checks.push('Garage/'+format+': sept vues simultanées dans la pièce, sélection par dalle, clavier, saisie et retour au mur');

    await click('.plan-compass summary');await click('#plan-direct-gaming');
    const gamingState={...houseState(),room:'gaming'};await houseWait(gamingState);
    await until('(()=>{const s=window.__siniverseHouse.inspect({fast:true}).scene;return s.room==="gaming"&&s.animationCount===0})()','The gaming room did not settle.');
    const gamingScene=(await houseInspect()).scene;assert.equal(gamingScene.pose.position[1],1.65);assert.equal(gamingScene.journeyClear,true);assert.equal(gamingScene.previewApp,null,'An office preview remained on arrival in the gaming room.');
    await screenshot('house-gaming-room-'+format,width);
    await press('#plan-gaming-screen');await until('document.querySelector("#gaming-library").open','The PC did not open the games library.');
    assert.equal(await socket.evaluate('document.activeElement.id'),'gaming-library-title');
    assert(await socket.evaluate('document.querySelector("#gaming-library").scrollWidth<=innerWidth+1'),'Games library overflows horizontally.');
    // Inspect the shortcut only. Never open or test the game from the house review.
    for(const scope of ['#gaming-library','.gaming-screen-desktop']){
      const link=await socket.evaluate('(()=>{const a=document.querySelector('+JSON.stringify(scope+' .gaming-game-shortcut')+');return a&&{url:a.href,target:a.target,rel:a.rel,name:a.textContent}})()');
      assert.equal(link?.url,'https://dev.decalage.siniverse.cc/');assert.equal(link.target,'_blank');assert.match(link.rel,/noopener/);assert.match(link.name,/Décalage/);
    }
    await screenshot('house-gaming-library-'+format,width);
    await press('#gaming-library-close','Escape');assert.equal(await socket.evaluate('document.querySelector("#gaming-library").open'),false);
    assert.equal(await socket.evaluate('document.activeElement.id'),'plan-gaming-screen');
    await socket.evaluate('history.back()');await houseWait(garageState);
    await socket.evaluate('history.forward()');await houseWait(gamingState);assert.equal((await houseInspect()).scene.room,'gaming');
    report.checks.push('Plan/'+format+': salle gaming par une vraie porte, PC RGB, bibliothèque clavier/Échap, focus et Retour/Avant');

    // Context loss must keep already-loaded cross-origin windows alive.
    await click('.plan-compass summary');await houseClick('#plan-direct-finapp',officeState('finapp'));
    await assertRetained();
    await socket.evaluate('document.querySelector("#plan-canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()');
    await until('document.querySelector("#experience").classList.contains("plan-is-fallback")','WebGL loss did not expose fallback.');
    assert.equal(await socket.evaluate('document.querySelectorAll("[data-plan-fallback-angle]").length'),0);
    await until('document.querySelector("#office-desktop").open&&document.querySelector("#office-desktop").classList.contains("is-expanded")','Context loss did not preserve an enlarged PC.');
    await assertRetained();await click('#office-exit');
    await houseClick('[data-plan-fallback-app="garapp"]',houseState('garapp'));await readerReady('garapp');
    await click('#plan-reader-open-app');await garageReady();
    for(const view of garageViews){
      const button=await socket.evaluate('(()=>{const r=document.getElementById('+JSON.stringify('garage-select-'+view)+').getBoundingClientRect();return {width:r.width,height:r.height}})()');
      assert(button.width>0&&button.height>0,'WebGL fallback lost the '+view+' screen.');
    }
    await click(chosenButton);await garageDetail(chosenView);
    assert.equal((await houseInspect()).scene.garage.expanded,true);
    assert(await socket.evaluate('(()=>{const frame=document.getElementById("garage-frame-garapp"),r=frame.getBoundingClientRect();return r.width>=innerWidth*.9&&r.height>=innerHeight*.7&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===frame})()'),'Fallback Garapp has no visible, interactive viewport.');
    assert.equal(await socket.evaluate('window.__embeddedFixture["garage-frame-garapp"].token'),garageToken,'WebGL loss reloaded the Garapp editor.');
    await click('#garage-exit');await garageReady();
    assert.equal(await socket.evaluate('document.activeElement.id'),chosenButton.slice(1));
    report.checks.push('Plan/'+format+': perte réelle de contexte, fenêtre et brouillon conservés, lecture et sortie fallback');

    await navigate(rootHome);await click('#plan-garage-entry');await garageReady();
    await navigate(rootHome+'?room=garage');await garageReady();await checkWall();
    assert.equal(await socket.evaluate('document.querySelectorAll("#garage-frame-garapp").length'),0,'Entering the garage opened the editor before a view was selected.');
    if(mobile){
      const tokens=()=>socket.evaluate(JSON.stringify(garageViews)+'.map(id=>window.__embeddedFixture["garage-frame-"+id].token)');
      const original=await tokens();
      for(const [w,h] of [[height,width],[width,height]]){
        await socket.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
        await until('('+String(function(portrait){
          const button=document.getElementById('garage-select-interventions'),r=button.getBoundingClientRect();
          const other=document.getElementById('garage-select-assurance').getBoundingClientRect();
          const offset=Math.abs(r.y-other.y),layoutReady=portrait?offset>10:offset<5;
          return layoutReady&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===button;
        })+')('+(w<h)+')','The garage titles did not reflow or could not be reached after rotation.');
        assert.equal((await houseInspect()).scene.garage.open,false);
        assert.deepEqual(await tokens(),original,'Rotating the phone reloaded a wall display.');
      }
    }
    await navigate(rootHome+'?room=garage&view=graphiques');await garageDetail('graphiques');
  }
  const denied=await socket.send('Page.addScriptToEvaluateOnNewDocument',{source:'for(const key of ["localStorage","sessionStorage"])Object.defineProperty(window,key,{get(){throw new DOMException("blocked","SecurityError")}});'});
  await navigate(rootHome);await houseWait(houseState());await reload();await houseWait(houseState());
  await click('.journey-settings>summary');assert.equal(await socket.evaluate('new URL(document.querySelector("#permalink").href).pathname'),'/');
  await socket.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:denied.identifier});
  await socket.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await navigate(rootHome+'?app=finapp&angle=action');await houseWait(houseState('finapp'));
  await until('window.__siniverseHouse.inspect().scene.reader.phase==="open"','Reduced-motion reader did not open.');
  assert.equal((await houseInspect()).scene.animationCount,0,'Reduced motion retained a cosmetic animation loop.');
  assert.equal(await socket.evaluate('location.search'),'?app=finapp');
  report.checks.push('Accueil sans stockage, lien canonique et mouvement réduit sans rotation de parcours');
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
    rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  console.log(JSON.stringify({ status: report.status, browser: report.browser, checks: report.checks.length, screenshots: report.screenshots.length }));
}
