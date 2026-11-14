import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeThreeAssets } from './three-assets.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const version = process.env.SINIVERSE_VERSION ?? JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('A valid SINIVERSE_VERSION is required.');
if (dirname(dist) !== root || basename(dist) !== 'dist') throw new Error('Unexpected build directory.');
rmSync(dist, { recursive: true, force: true });
cpSync(resolve(root, 'public'), dist, { recursive: true });
writeThreeAssets(resolve(dist, 'concepts/v3/vendor'));
for (const page of ['index.html', 'confidentialite.html', 'concepts/index.html', 'concepts/v2/index.html', 'concepts/v2/explore.html', 'concepts/v3/index.html', 'concepts/v3/explore.html']) {
  const path = resolve(dist, page);
  let replacements = 0;
  const html = readFileSync(path, 'utf8').replace(/(<span class="app-version" data-app-version>)v[^<]*(<\/span>)/g, (_, start, end) => {
    replacements++;
    return start + 'v' + version + end;
  });
  if (replacements !== 1) throw new Error('Exactly one version footer is required in ' + page + '.');
  writeFileSync(path, html);
}
console.log('Built Siniverse v' + version + ' in dist/ without modifying the source assets.');
