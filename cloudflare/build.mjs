import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,extname,relative} from 'node:path';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
const root=process.cwd(),assets={};
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())await walk(path);else{const data=await readFile(path);const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};assets['/'+relative(join(root,'.next-cloudflare'),path).replaceAll('\\','/')]={type:types[extname(path)]||'application/octet-stream',body:gzipSync(data,{level:9}).toString('base64')};}}}
await walk(join(root,'.next-cloudflare'));await mkdir('cloudflare/dist',{recursive:true});await writeFile('cloudflare/generated-assets.ts','export const assets:Record<string,{type:string;body:string}>='+JSON.stringify(assets)+';');await build({entryPoints:['cloudflare/worker.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',minify:true,external:['cloudflare:workers','node:crypto'],outfile:'cloudflare/dist/worker.mjs'});console.log('Cloudflare Worker built with '+Object.keys(assets).length+' assets');

