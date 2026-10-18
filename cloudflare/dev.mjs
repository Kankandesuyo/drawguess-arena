import {Miniflare} from 'miniflare';
const mf=new Miniflare({modules:true,scriptPath:'cloudflare/dist/worker.mjs',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],durableObjects:{ROOMS:{className:'DrawRoom',useSQLite:true}},port:8787,host:'127.0.0.1'});
console.log('Cloudflare local runtime:',String(await mf.ready));

