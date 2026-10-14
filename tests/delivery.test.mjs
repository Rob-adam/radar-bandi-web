import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import app from '../src/dashboard-wrapper.js';import {accessHash} from '../src/client-access.js';
const TEST_TOKEN='test-client-token-0000000000000000000000000000';const TEST_HASH=await accessHash(TEST_TOKEN);const testCookie='bandovera_access_RB0003='+TEST_TOKEN;
const profile={type:'APS',region:'Veneto',province:'PADOVA',operatingTerritory:'ITALIA',runts:'Sì',license:'RB-0003',sector:'Sociale e welfare',subSector:'Malattie respiratorie',activities:'Assistenza ai pazienti',beneficiaries:'Pazienti Caregiver Famiglie',statutoryPurposes:'Tutela della salute'};
const p=Buffer.from(JSON.stringify(profile)).toString('base64url');const saved=new Map([['license:RB-0003',{active:true,expiresAt:'2027-10-12',profile,accessTokenHash:TEST_HASH}]]);
const env={LICENSES:{get:async k=>saved.get(k)||null,put:async(k,v)=>saved.set(k,JSON.parse(v))},ASSETS:{fetch:async req=>{let path=new URL(req.url).pathname;if(path==='/')path='/index.html';try{return new Response(fs.readFileSync(new URL('../public'+path,import.meta.url)),{headers:{'content-type':path.endsWith('.json')?'application/json':'text/html'}})}catch{return new Response('Not found',{status:404})}}}};
let html;test('full production wrapper chain injects only valid scripts and preserves profile',async()=>{
 html=await (await app.fetch(new Request('https://test.local/?p='+p,{headers:{accept:'text/html',cookie:testCookie}}),env)).text();for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);assert.ok(html.includes('Operatività: ITALIA'));assert.ok(!html.includes('id="refreshBtn"'));
});
test('RB0003 short links and license remain active',async()=>{for(const path of ['/RB-0003','/r/RB-0003']){const r=await app.fetch(new Request('https://test.local'+path,{headers:{cookie:testCookie}}),env);assert.equal(r.status,302);assert.ok(r.headers.get('location').includes('?p='));}const d=await(await app.fetch(new Request('https://test.local/api/license/RB-0003'),env)).json();assert.equal(d.active,true);});
test('reviewed deadline and grants survive production wrappers without forged Veneto qualification',async()=>{const all=[];for(const name of ['radar_bandi_catalogo','radar_bandi_catalogo_extra']){const d=await(await app.fetch(new Request('https://test.local/'+name+'.json?region=Veneto&scope=national'),env)).json();all.push(...d.bandi);}const vehicle=all.find(b=>b.id==='RLT12026053831');assert.equal(vehicle.deadline,'2027-04-30');assert.equal(vehicle.maxGrant,30000);assert.ok(!vehicle.territories.includes('Veneto'));assert.ok(!vehicle.hardRequirements.some(r=>(r.anyOf||[]).includes('italia')));assert.equal(all.find(b=>b.id==='UNIPOLIS-POP-2026').deadlineAt,'2026-10-15T13:00:00+02:00');assert.ok(!all.some(b=>b.deadline&&b.deadline<'2026-10-12'));});
test('favorites are saved and returned, and invalid origin is rejected',async()=>{const url='https://test.local/api/favorites/RB-0003';let r=await app.fetch(new Request(url,{method:'PUT',headers:{origin:'https://test.local','content-type':'application/json',cookie:testCookie},body:JSON.stringify({favorites:['https://example.org/call']})}),env);assert.equal(r.status,200);assert.deepEqual((await(await app.fetch(new Request(url,{headers:{cookie:testCookie}}),env)).json()).favorites,['https://example.org/call']);r=await app.fetch(new Request(url,{method:'PUT',headers:{origin:'https://other.local','content-type':'application/json',cookie:testCookie},body:'{"favorites":[]}'}),env);assert.equal(r.status,403);});
test('official-source flags never by themselves prove this applicant eligible',()=>{const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.ok(source.includes('if(applicantProved&&eligibilityState'));assert.ok(source.includes('Opportunità marginali'));assert.ok(source.includes('Scadenza non verificata'));});
test('thematic score cannot create applicant proof and marginal opportunities stay available',()=>{
 const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];const prefix=source.slice(0,source.indexOf('const favoriteKey='));const review=source.slice(source.indexOf('function sourceReview(b)'),source.indexOf('function status(r,b)'));
 const nodes=new Map();const context={document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)}},location:{search:'?p='+Buffer.from(JSON.stringify({...profile,name:'APS RESPIRIAMO INSIEME'})).toString('base64url')},localStorage:{getItem:()=>null},URLSearchParams,TextDecoder,Uint8Array,atob,Intl,Date,console};vm.createContext(context);vm.runInContext(prefix+review+'globalThis.api={calc,isMarginal};})();',context);
 const b={id:'verified',title:'Servizi per la salute',sourceUrl:'https://official.example/call',territories:['italia'],legalForms:['aps'],sectors:['salute'],eligibility:['APS'],tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:'2026-10-12',verificationNote:'Official applicant rules checked'}};assert.equal(context.api.calc(b).eligibilityState,'verify');assert.equal(context.api.isMarginal({...b,sectors:['energia']},{score:10,thematicWarnings:[]}),true);
});



test('production catalogs apply documented reviews, preserve POP exclusion data and omit unconfirmed credit window',async()=>{
 const all=[];for(const name of ['radar_bandi_catalogo','radar_bandi_catalogo_extra']){
  const d=await(await app.fetch(new Request('https://test.local/'+name+'.json?region=Veneto&scope=national'),env)).json();all.push(...d.bandi);
 }
 assert.ok(!all.some(b=>b.id==='FCARIPARO-IMPRENDITORIA-SOCIALE-2026'));
 for(const id of ['FC-NUOVI-PONTI-2026','FC-MUSEI-ACCESS-2026','FC-HOUSING-FRAGILI-2026','FC-COFIN-EU-2026','ER-CARISBO-EMERGENZE-2026','RLH12026055146','CONIBAMBINI-NOTE-COMUNITA-2026']){
  const b=all.find(b=>b.id===id);assert.ok(b,id);assert.equal(b.tracking.verifiedAt,'2026-10-14',id);assert.notEqual(b.tracking.sourceMonitoringNeedsReview,true,id);
 }
 assert.equal(all.find(b=>b.id==='FC-MUSEI-ACCESS-2026').maxGrant,200000);
 assert.equal(all.find(b=>b.id==='FC-HOUSING-FRAGILI-2026').maxGrant,500000);
 assert.ok(all.find(b=>b.id==='UNIPOLIS-POP-2026').hardRequirements.some(r=>r.type==='foundation_year'&&r.min===2016));
});
