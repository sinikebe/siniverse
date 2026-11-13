import { cpSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
if (dirname(dist) !== root || basename(dist) !== 'dist') throw new Error('Unexpected build directory.');
rmSync(dist, { recursive: true, force: true });
cpSync(resolve(root, 'public'), dist, { recursive: true });
console.log('Copied public/ to dist/ without modifying the source assets.');
