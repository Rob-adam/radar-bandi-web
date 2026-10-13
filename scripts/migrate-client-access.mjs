// Executed inside GitHub Actions with the existing deployment credential.
// No token or customer profile is written to logs or a public repository.
import fs from 'node:fs';
import {randomBytes,createHash,publicEncrypt,constants} from 'node:crypto';
const apiToken=process.env.CLOUDFLARE_API_TOKEN;
if(!apiToken)throw Error('Deployment credential unavailable');
async function cf(path,options={}){
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{...options,headers:{authorization:'Bearer '+apiToken,...options.headers}});
 const data=await r.json();
 if(!r.ok||data.success===false)throw Error('Cloudflare operation failed ('+r.status+'): '+(data.errors||[]).map(x=>x.message).join('; '));
 return data.result;
}
const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const namespace=config.kv_namespaces.find(x=>x.binding==='LICENSES').id;
const accounts=await cf('/accounts');
if(!Array.isArray(accounts)||!accounts.length)throw Error('No account available to deployment credential');
let accountId;
for(const account of accounts){const namespaces=await cf('/accounts/'+account.id+'/storage/kv/namespaces');if(namespaces.some(x=>x.id===namespace)){accountId=account.id;break;}}
if(!accountId)throw Error('License namespace not accessible');
const code='RB-0003';const key='license:'+code;
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+accountId+'/storage/kv/namespaces/'+namespace+'/values/'+encodeURIComponent(key),{headers:{authorization:'Bearer '+apiToken}});
if(!r.ok)throw Error('Client record unavailable ('+r.status+')');
const record=await r.json();
if(!record.profile||!String(record.profile.name||record.name).toLowerCase().includes('respiriamo insieme'))throw Error('Client identity mismatch');
const token=record.accessToken||randomBytes(32).toString('base64url');
const updated={...record,accessToken:token,accessTokenHash:createHash('sha256').update(token).digest('hex')};
await cf('/accounts/'+accountId+'/storage/kv/namespaces/'+namespace+'/values/'+encodeURIComponent(key),{method:'PUT',headers:{'content-type':'text/plain'},body:JSON.stringify(updated)});
const url='https://radar-bandi-online.presidente-56d.workers.dev/'+code+'?access='+encodeURIComponent(token);
const encrypted=publicEncrypt({key:fs.readFileSync('scripts/client-access-public.pem'),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(url));
fs.mkdirSync('private-delivery',{recursive:true});fs.writeFileSync('private-delivery/RB-0003-link.enc',encrypted);
console.log('RB-0003 access key configured; encrypted delivery prepared.');
