import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OnboardingRegistry,routeOnboarding} from '../src/onboarding.js';
import {validateSheet,mapSheet,expiryFor,verifiedBank} from '../src/onboarding-schema.js';
import app from '../src/dashboard-wrapper.js';
import {accessHash} from '../src/client-access.js';
import fs from 'node:fs';import vm from 'node:vm';
const sheet={nome_associazione:'ENTE DI PROVA NON INVIARE',cf:'00000000000',partita_iva:'11111111111',tipo_ente:'ONLUS',runts:'Da verificare',regione:'Lombardia',provincia:'Monza',settore_principale:'Salute e sociale',area_test:'Assistenza dichiarata',att_test:'Informazione, incontri',ben_test:'Famiglie',finalita_statutarie:'Finalità dichiarata',capacita_progetti:'Progetti dichiarati',referente:'Referente prova',email_referente:'test@example.org',telefono:'000',ack_completezza:'Sì',luogo_data:'Monza, 29/10/2026',compilatore:'Referente prova',privacy:'Sì',campo_aggiuntivo:'Preservato'};
const clone=v=>v===undefined?undefined:structuredClone(v);
class Storage{constructor(){this.data=new Map();}async get(k){return clone(this.data.get(k));}async put(k,v){this.data.set(k,clone(v));}async list({prefix=''}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,clone(v)]));}async delete(k){this.data.delete(k);}async transaction(fn){return fn(this);}}
function setup(initial=[]){const storage=new Storage(),kv=new Map(initial);let writes=0,fail=false;
 const env={ADMIN_API_KEY:'test-admin',ONBOARDING_ENABLED:'true',LICENSES:{get:async(k,options)=>{const v=kv.get(k);return options?.type==='json'?clone(v)||null:v?JSON.stringify(v):null;},list:async()=>({keys:[...kv.keys()].map(name=>({name})),list_complete:true}),put:async(k,v)=>{if(fail)throw Error('KV outage');writes++;kv.set(k,JSON.parse(v));}}};
 const registry=new OnboardingRegistry({storage},env);registry.deliver=async()=>({state:'accepted'});
 const emails=[];registry.send=async(rec,kind)=>{emails.push({id:rec.id,kind});rec[kind]={state:'accepted',attemptedAt:new Date().toISOString()};await registry.save(rec);};
 env.ONBOARDING={idFromName:n=>n,get:()=>({fetch:(url,init)=>registry.fetch(new Request(url,init))})};
 const call=async(path,body,method='POST')=>{const res=await registry.fetch(new Request('https://registry'+path,{method,body:body?JSON.stringify(body):undefined}));return {status:res.status,data:await res.json()};};
 const pending=async(s=sheet)=>{await call('/public',{sheet:s,ip:'test-ip'});return [...(await storage.list({prefix:'request:'})).values()].at(-1);};
 const activate=async(r,extra={})=>call('/requests/'+r.id+'/activate',{revision:r.revision,confirmedCredit:true,amountCents:1990,profileReviewed:true,paymentReference:'TEST NON REALE',...extra});
 return {env,storage,kv,registry,call,pending,activate,emails,get writes(){return writes;},set fail(v){fail=v;}};
}
test('complete sheet, CF/VAT and original taxonomy preserved; no inferred legal status or scope',()=>{
 const raw=validateSheet(sheet),profile=mapSheet(raw);assert.deepEqual({...raw},sheet);assert.equal(profile.type,'ONLUS');assert.equal(profile.sector,'Salute e sociale');assert.equal(profile.territoryScope,'');assert.equal(profile.legalPersonality,'Da verificare');assert.equal(profile.sourceSheet.campo_aggiuntivo,'Preservato');assert.equal(profile.activities,'Informazione, incontri');assert.equal(profile.taxCode,sheet.cf);assert.equal(profile.vatNumber,sheet.partita_iva);
 assert.throws(()=>validateSheet({...sheet,privacy:'No'}));assert.throws(()=>validateSheet({...sheet,email_referente:'a@example.org\r\nBcc:b@x.org'}));assert.throws(()=>validateSheet({...sheet,area_test:'',altre_aree:''}));
});
test('annual calendar duration and leap-day expiry',()=>{assert.equal(expiryFor('2026-10-29'),'2027-10-28');assert.equal(expiryFor('2028-02-29'),'2029-02-27');});
test('public request is pending, deduplicated and never returns PII, license or private URL',async()=>{
 const s=setup();let r=await s.call('/public',{sheet,ip:'a'});assert.equal(r.status,202);let pending=await s.pending();assert.equal(pending.status,'pending');assert.equal(s.writes,0);assert.equal(s.kv.size,0);assert.equal((await s.storage.list({prefix:'request:'})).size,1);assert.equal(s.emails.length,1);const serialized=JSON.stringify(r.data);for(const secret of [sheet.email_referente,sheet.cf,sheet.nome_associazione,'?access='])assert.ok(!serialized.includes(secret));
});
test('explicit payment and profile review mandatory; stale approval is rejected',async()=>{
 const s=setup(),r=await s.pending();assert.equal((await s.activate(r,{confirmedCredit:false})).status,400);assert.equal((await s.activate(r,{amountCents:199})).status,400);assert.equal((await s.activate(r,{profileReviewed:false})).status,400);assert.equal((await s.activate(r,{revision:0})).status,409);assert.equal(s.kv.size,0);
});
test('parallel approvals and retries create exactly one active 12-month license',async()=>{
 const s=setup(),r=await s.pending();const responses=await Promise.all([s.activate(r),s.activate(r)]);assert.equal(responses.filter(x=>x.status===200).length,1);assert.equal(s.kv.size,1);const license=[...s.kv.values()][0];assert.equal(license.requestId,r.id);assert.equal(license.price,19.9);assert.equal(license.profile.durationMonths,12);assert.equal(license.profile.sourceSheet.campo_aggiuntivo,'Preservato');assert.equal(license.accessTokenHash,await accessHash(license.accessToken));
 const fresh=await s.storage.get('request:'+r.id);assert.equal((await s.activate(fresh)).status,200);assert.equal(s.kv.size,1);assert.equal(s.emails.filter(e=>e.kind==='accessEmail').length,1);
});
test('interrupted KV write recovers the SAME reserved code, token, profile and payment',async()=>{
 const s=setup(),r=await s.pending();s.fail=true;assert.equal((await s.activate(r)).status,503);const reserved=await s.storage.get('request:'+r.id),license=await s.storage.get('license:'+reserved.license);assert.equal(reserved.status,'activating');assert.equal(s.kv.size,0);s.fail=false;
 assert.equal((await s.call('/requests/'+r.id+'/recover',{})).status,200);assert.deepEqual(s.kv.get('license:'+reserved.license),license);assert.equal(s.kv.size,1);assert.equal(s.emails.filter(e=>e.kind==='accessEmail').length,1);
});
test('collision with manual creation rejected; existing access credentials preserved',async()=>{
 const existing={license:'RB-0003',name:'Cliente esistente',active:true,accessTokenHash:'existing-hash',expiresAt:'2027-10-12',profile:{name:'Cliente esistente',taxCode:'99999999999',contactEmail:'private@example.org',sourceSheet:{extra:'keep'}}};
 const s=setup([['license:RB-0003',existing]]);assert.equal((await s.call('/manual',{create:true,license:'RB-0003',name:'Altro'})).status,409);
 assert.equal((await s.call('/manual',{license:'RB-0003',active:false})).status,200);assert.equal(s.kv.get('license:RB-0003').accessTokenHash,'existing-hash');assert.equal(s.kv.get('license:RB-0003').accessToken,undefined);assert.equal(s.kv.get('license:RB-0003').profile.sourceSheet.extra,'keep');
 assert.equal((await s.call('/manual',{license:'RB-0003',name:'Sovrascrittura'})).status,409);
});
test('manual creation between submission and approval blocks double license for same organisation',async()=>{
 const s=setup(),r=await s.pending();assert.equal((await s.call('/manual',{create:true,license:'RB-0004',name:sheet.nome_associazione,profile:mapSheet(sheet)})).status,200);assert.equal((await s.activate(r)).status,409);assert.equal(s.kv.size,1);
});
test('unauthenticated admin, foreign origins, unconfigured public intake and invalid methods fail closed',async()=>{
 const s=setup();let r=await routeOnboarding(new Request('https://test/api/admin/requests'),s.env);assert.equal(r.status,401);
 r=await routeOnboarding(new Request('https://test/api/admin/requests',{headers:{authorization:'Bearer test-admin',origin:'https://evil.example'}}),s.env);assert.equal(r.status,403);
 r=await routeOnboarding(new Request('https://test/api/requests',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'}),s.env);assert.equal(r.status,403);
 r=await routeOnboarding(new Request('https://test/api/requests',{method:'POST',headers:{origin:'https://bandovera.it','content-type':'application/json'},body:'{}'}),s.env);assert.equal(r.status,503);
 r=await routeOnboarding(new Request('https://test/api/requests'),{});assert.equal(r.status,503);
});
test('authenticated request list is private and does not include access credentials',async()=>{
 const s=setup(),r=await s.pending();await s.activate(r);
 const response=await routeOnboarding(new Request('https://test/api/admin/requests',{headers:{authorization:'Bearer test-admin'}}),s.env);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.text();assert.ok(body.includes(sheet.cf));assert.ok(!body.includes('accessToken'));assert.ok(!body.includes('?access='));
});
test('public rate limiting and manual existence check prevent repeated mail and stale creation',async()=>{
 const s=setup();for(let i=0;i<3;i++)assert.equal((await s.call('/public',{sheet,ip:'a'})).status,202);assert.equal((await s.call('/public',{sheet,ip:'a'})).status,429);assert.equal(s.emails.length,1);
 assert.equal((await s.call('/manual',{license:'RB-0100',name:'X'})).status,409);
});
test('mail retry never creates another license, accepted/uncertain mail is not blindly resent',async()=>{
 const s=setup();const rec=await s.pending();await s.activate(rec);let r=await s.storage.get('request:'+rec.id);assert.equal((await s.call('/requests/'+r.id+'/email',{kind:'access',revision:r.revision})).status,409);
 r.accessEmail={state:'failed'};await s.registry.save(r);r=await s.storage.get('request:'+rec.id);const before=s.kv.size;assert.equal((await s.call('/requests/'+r.id+'/email',{kind:'access',revision:r.revision})).status,200);assert.equal(s.kv.size,before);
});
test('bank config is fail-closed and never embedded in public code; SMTP/config disabled by default',()=>{
 assert.throws(()=>verifiedBank({}));assert.throws(()=>verifiedBank({BONIFICO_VERIFIED:'true',BONIFICO_IBAN:'IT00BAD',BONIFICO_BENEFICIARIO:'Test'}));const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url)));assert.equal(config.vars.ONBOARDING_ENABLED,'false');assert.equal(config.vars.SMTP_VERIFIED,'false');assert.equal(config.vars.BONIFICO_VERIFIED,'false');assert.deepEqual(config.durable_objects.bindings,[{name:'ONBOARDING',class_name:'OnboardingRegistry'}]);assert.deepEqual(config.migrations,[{tag:'onboarding-v1',new_sqlite_classes:['OnboardingRegistry']}]);for(const name of ['ADMIN_API_KEY','SMTP_USER','SMTP_PASSWORD','BONIFICO_IBAN','BONIFICO_BENEFICIARIO','TURNSTILE_SECRET','REQUEST_HASH_KEY'])assert.equal(config.vars[name],undefined);
});
test('admin script and existing page parse; API is integrated into existing wrapper chain',async()=>{
 for(const code of fs.readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(code[1]);new vm.Script(fs.readFileSync(new URL('../public/admin/requests.js',import.meta.url),'utf8'));
 const r=await app.fetch(new Request('https://test/api/requests'),{});assert.equal(r.status,503);
});
test('manual write failure is visible and can be recovered without another code or new credentials',async()=>{
 const s=setup();s.fail=true;assert.equal((await s.call('/manual',{create:true,license:'RB-0100',name:'Cliente test'})).status,503);s.fail=false;
 const list=await s.call('/requests',null,'GET');assert.equal(list.data.manualWrites.length,1);
 const reserved=await s.storage.get('license:RB-0100');assert.equal((await s.call('/requests/manual-sync',{license:'RB-0100'})).status,200);assert.deepEqual(s.kv.get('license:RB-0100'),reserved);assert.equal((await s.storage.list({prefix:'manual-pending:'})).size,0);
});
test('PII survives admin profile update but is excluded from client-visible encoded profile',async()=>{
 const s=setup(),r=await s.pending();await s.activate(r);const license=[...s.kv.values()][0];let result=await s.call('/manual',{license:license.license,name:license.name,profile:{...license.profile,capabilities:'Aggiornamento esplicito'}});assert.equal(result.status,200);assert.equal(s.kv.get('license:'+license.license).profile.taxCode,sheet.cf);assert.equal(s.kv.get('license:'+license.license).profile.sourceSheet.campo_aggiuntivo,'Preservato');
 const response=await app.fetch(new Request('https://test/'+license.license+'?access='+license.accessToken),s.env);assert.equal(response.status,302);const p=JSON.parse(Buffer.from(new URL(response.headers.get('location')).searchParams.get('p'),'base64url'));assert.equal(p.taxCode,undefined);assert.equal(p.sourceSheet,undefined);assert.equal(p.contactEmail,undefined);
});
