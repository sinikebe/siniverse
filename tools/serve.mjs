import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { threeAssets } from './three-assets.mjs';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || 4175);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.startsWith('/concepts/v3/vendor/')) {
      const name = pathname.slice('/concepts/v3/vendor/'.length);
      if (!['three.module.min.js', 'three.core.min.js', 'LICENSE.txt', 'provenance.json'].includes(name)) {
        response.writeHead(404); response.end(); return;
      }
      const body = threeAssets().get(name);
      response.writeHead(200, { 'Content-Type': name.endsWith('.js') ? types['.js'] : name.endsWith('.json') ? 'application/json' : types['.txt'], 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body); return;
    }
    const requested = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const path = resolve(root, '.' + requested);
    const relative = path.slice(root.length);
    if (!path.startsWith(root) || relative.split(/[\\/]/).some(part => part.startsWith('.') || part.startsWith('_'))) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (path !== resolve(root) && !path.startsWith(`${resolve(root)}${sep}`)) {
      response.writeHead(404);
      response.end();
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      const body = await readFile(new URL('../public/404.html', import.meta.url));
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    response.writeHead(error instanceof URIError ? 400 : 500);
    response.end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Siniverse: http://127.0.0.1:${port}`);
});
