import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!account)throw Error('Set CLOUDFLARE_ACCOUNT_ID first.');
let token=process.env.CLOUDFLARE_API_TOKEN;
if(!token){const args=['--offline','wrangler','auth','token','--json'];const output=process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','npx '+args.join(' ')],{encoding:'utf8',stdio:['ignore','pipe','pipe']}):execFileSync('npx',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});const auth=JSON.parse(output);token=auth.token??auth.oauth_token??auth.api_token;if(!token)throw Error('No deployment token. Complete Cloudflare login first.');}
async function api(path,options={}){const response=await fetch('https://api.cloudflare.com/client/v4'+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});const a=await response.json();if(!response.ok||!a.success)throw Error(JSON.stringify({status:response.status,errors:a.errors}));return a.result;}
const metadata=JSON.parse(await readFile('cloudflare/deployment.json','utf8'));
const name=metadata.name;delete metadata.name;
const prefix=`/accounts/${account}/workers`;const scripts=await api(prefix+'/scripts');const existing=scripts.find(s=>s.id===name);if(existing){if(existing.migration_tag!=='v1')throw Error('Existing Worker migration differs; review before replacing.');delete metadata.migrations;}
const form=new FormData();form.append('metadata',JSON.stringify(metadata));form.append('worker.mjs',new Blob([await readFile('cloudflare/dist/worker.mjs')],{type:'application/javascript+module'}),'worker.mjs');
const deployed=await api(prefix+'/scripts/'+name,{method:'PUT',body:form});
let subdomain;try{subdomain=await api(prefix+'/subdomain');}catch(e){throw Error('Worker uploaded, but workers.dev subdomain is unavailable: '+e.message);}
await api(prefix+'/scripts/'+name+'/subdomain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true,previews_enabled:false})});
console.log(JSON.stringify({name,url:`https://${name}.${subdomain.subdomain}.workers.dev`,id:deployed.id,migration:deployed.migration_tag},null,2));
