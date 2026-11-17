import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { transformSync, version as esbuildVersion } from 'esbuild';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const three=resolve(root,'node_modules/three');
const VERSION='0.187.0';
const SOURCES={
  'three.module.js':'104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341',
  'three.core.js':'613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578'
};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let cached;
export function threeAssets(){
  if(cached)return cached;
  if(JSON.parse(readFileSync(resolve(three,'package.json'),'utf8')).version!==VERSION||esbuildVersion!=='0.28.2')throw new Error('The locked local Three/esbuild versions are required.');
  const assets=new Map(),sources={},output={};
  for(const [name,expected] of Object.entries(SOURCES)){
    const input=readFileSync(resolve(three,'build',name));
    if(hash(input)!==expected)throw new Error('Unexpected Three source hash: '+name);
    const filename=name.replace('.js','.min.js');
    const transformed=transformSync(input.toString('utf8'),{format:'esm',target:'es2022',minify:true,legalComments:'eof'}).code
      .replaceAll('./three.core.js','./three.core.min.js');
    const bytes=Buffer.from(transformed);
    assets.set(filename,bytes);
    sources[name]={sha256:expected,bytes:input.length};
    output[filename]={sha256:hash(bytes),bytes:bytes.length,gzipBytes:gzipSync(bytes).length};
  }
  const total=[...assets.values()].reduce((n,b)=>n+b.length,0);
  const compressed=Object.values(output).reduce((n,b)=>n+b.gzipBytes,0);
  if(total>1500000||compressed>350000)throw new Error('Three runtime exceeds the agreed local asset budget.');
  assets.set('LICENSE.txt',readFileSync(resolve(three,'LICENSE')));
  assets.set('provenance.json',Buffer.from(JSON.stringify({name:'three',version:VERSION,license:'MIT',
    source:'https://github.com/mrdoob/three.js/releases/tag/r187',npmIntegrity:'sha512-Qiu7R+Cmh8CstZsY1uJOSWnVlfo7ZtNLV7mF8Jltk3LB3AtDu9cRZlcnRKkAk8Y4z6KKw35z7Y7Urd7jWY8etA==',
    transform:{tool:'esbuild',version:esbuildVersion},sources,output},null,2)+'\n'));
  cached=assets;
  return cached;
}
export function writeThreeAssets(destination){
  mkdirSync(destination,{recursive:true});
  for(const [name,bytes] of threeAssets())writeFileSync(resolve(destination,name),bytes);
}
