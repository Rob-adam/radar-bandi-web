import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import app from '../src/dashboard-wrapper.js';import {accessHash} from '../src/client-access.js';
const TEST_TOKEN='test-client-token-0000000000000000000000000000';const TEST_HASH=await accessHash(TEST_TOKEN);const testCookie='bandovera_access_RB0003='+TEST_TOKEN;
const profile={type:'APS',region:'Veneto',province:'PADOVA',operatingTerritory:'ITALIA',runts:'Sì',license:'RB-0003',sector:'Sociale e welfare',subSector:'Malattie respiratorie',activities:'Assistenza ai pazienti',beneficiaries:'Pazienti Caregiver Famiglie',statutoryPurposes:'Tutela della salute'};
const p=Buffer.from(JSON.stringify(profile)).toString('base64url');const saved=new Map([['license:RB-0003',{active:true,expiresAt:'2027-10-12',profile,accessTokenHash:TEST_HASH}]]);
const env={LICENSES:{get:async k=>saved.get(k)||null,put:async(k,v)=>saved.set(k,JSON.parse(v))},ASSETS:{fetch:async req=>{let path=new URL(req.url).pathname;if(path==='/')path='/index.html';try{return new Response(fs.readFileSync(new URL('../public'+path,import.meta.url)),{headers:{'content-type':path.endsWith('.json')?'application/json':'text/html'}})}catch{return new Response('Not found',{status:404})}}}};
let html;test('full production wrapper chain injects only valid scripts and preserves profile',async()=>{
 html=await (await app.fetch(new Request('https://test.local/?p='+p,{headers:{accept:'text/html',cookie:testCookie}}),env)).text();for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);assert.ok(html.includes('Operatività: ITALIA'));assert.ok(!html.includes('id="refreshBtn"'));
});
test('RB0003 short links and license remain active',async()=>{for(const path of ['/RB-0003','/r/RB-0003']){const r=await app.fetch(new Request('https://test.local'+path,{headers:{cookie:testCookie}}),env);assert.equal(r.status,302);assert.ok(r.headers.get('location').includes('?p='));}const d=await(await app.fetch(new Request('https://test.local/api/license/RB-0003'),env)).json();assert.equal(d.active,true);});
test('reviewed deadline and grants survive production wrappers without forged Veneto qualification',async(t)=>{
 // Verify the reviewed snapshot while these calls were still open.
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-14T08:00:00+02:00')});
const all=[];for(const name of ['radar_bandi_catalogo','radar_bandi_catalogo_extra']){const d=await(await app.fetch(new Request('https://test.local/'+name+'.json?region=Veneto&scope=national'),env)).json();all.push(...d.bandi);}const vehicle=all.find(b=>b.id==='RLT12026053831');assert.equal(vehicle.deadline,'2027-04-30');assert.equal(vehicle.maxGrant,30000);assert.ok(!vehicle.territories.includes('Veneto'));assert.ok(!vehicle.hardRequirements.some(r=>(r.anyOf||[]).includes('italia')));assert.equal(all.find(b=>b.id==='UNIPOLIS-POP-2026').deadlineAt,'2026-10-15T13:00:00+02:00');assert.ok(!all.some(b=>b.deadline&&b.deadline<'2026-10-12'));});
test('October 23 reviews deliver event advance notice and housing statutory requirements',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-23T18:00:00+02:00')});
 const body=await(await app.fetch(new Request('https://test.local/radar_bandi_catalogo.json?scope=national'),env)).json();
 const event=body.bandi.find(b=>b.id==='RLA12025050323');
 assert.ok(event.hardRequirements.some(r=>r.label.includes('60 giorni')));
 assert.equal(event.deadlineAt,'2026-11-16T16:00:00+01:00');
 const housing=body.bandi.find(b=>b.id==='RLH12026055146');
 assert.ok(housing.hardRequirements.some(r=>r.label.includes('lettera q)')));
 assert.ok(housing.hardRequirements.some(r=>r.label.includes('perfezionato')));
 assert.equal(housing.deadlineAt,'2026-10-30T12:00:00+01:00');
 assert.ok(housing.evidenceUrls.some(url=>url.includes('FAQ_Bando_Linea3_HS_23-10')));
});
test('favorites are saved and returned, and invalid origin is rejected',async()=>{const url='https://test.local/api/favorites/RB-0003';let r=await app.fetch(new Request(url,{method:'PUT',headers:{origin:'https://test.local','content-type':'application/json',cookie:testCookie},body:JSON.stringify({favorites:['https://example.org/call']})}),env);assert.equal(r.status,200);assert.deepEqual((await(await app.fetch(new Request(url,{headers:{cookie:testCookie}}),env)).json()).favorites,['https://example.org/call']);r=await app.fetch(new Request(url,{method:'PUT',headers:{origin:'https://other.local','content-type':'application/json',cookie:testCookie},body:'{"favorites":[]}'}),env);assert.equal(r.status,403);});
test('official-source flags never by themselves prove this applicant eligible',()=>{const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.ok(source.includes('if(applicantProved&&eligibilityState'));assert.ok(source.includes('Opportunità marginali'));assert.ok(source.includes('Scadenza non verificata'));});
test('Gaslini reimbursement preserves past service period and accreditation without inventing a legal-seat restriction',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-22T08:00:00+02:00')});
 const response=await app.fetch(new Request('https://test.local/radar_bandi_catalogo_extra.json?region=Veneto&scope=national'),env);
 const b=(await response.json()).bandi.find(b=>b.id==='LIG-ACCOGLIENZA-GASLINI-2026');
 assert.ok(b);assert.equal(b.deadline,'2026-10-26');assert.equal(b.maxGrant,null);
 assert.ok(b.aid.includes('15/09/2025')&&b.aid.includes('15/09/2026'));
 assert.ok(b.hardRequirements.some(r=>r.type==='document'&&r.label.includes('Accreditamento')));
 assert.ok(!b.hardRequirements.some(r=>r.type==='seat'));
 assert.ok(b.applicantChecks.every(c=>c.status==='unknown'));
 assert.equal(b.tracking.verificationEvidence.length,2);
});
test('Cattolica is delivered nationally with preliminary selection and closes at noon in Italian winter time',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-13T10:59:59Z')});
 const request=()=>app.fetch(new Request('https://test.local/radar_bandi_catalogo_extra.json?region=Veneto&scope=national'),env);
 const b=(await(await request()).json()).bandi.find(b=>b.id==='CATTOLICA-INTRAPRESA-SOCIALE-2026');
 assert.ok(b,'national call must reach an organisation based in Veneto');
 assert.equal(b.deadlineAt,'2026-11-13T12:00:00+01:00');
 assert.equal(b.maxGrant,30000);assert.equal(b.eligibilityStatus,'da_verificare');
 assert.ok(b.applicantChecks.every(c=>c.status==='unknown'));
 assert.ok(b.hardRequirements.some(r=>r.label.includes('Colloquio telefonico')));
 assert.ok(!b.hardRequirements.some(r=>r.type==='seat'||r.type==='foundationYear'||r.type==='revenue'));
 t.mock.timers.setTime(new Date('2026-11-13T11:00:01Z').getTime());
 assert.ok(!(await(await request()).json()).bandi.some(b=>b.id==='CATTOLICA-INTRAPRESA-SOCIALE-2026'));
});
test('thematic score cannot create applicant proof and marginal opportunities stay available',()=>{
 const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];const prefix=source.slice(0,source.indexOf('const favoriteKey='));const review=source.slice(source.indexOf('function sourceReview(b)'),source.indexOf('function status(r,b)'));
 const nodes=new Map();const context={document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)}},location:{search:'?p='+Buffer.from(JSON.stringify({...profile,name:'APS RESPIRIAMO INSIEME'})).toString('base64url')},localStorage:{getItem:()=>null},URLSearchParams,TextDecoder,Uint8Array,atob,Intl,Date,console};vm.createContext(context);vm.runInContext(prefix+review+'globalThis.api={calc,isMarginal};})();',context);
 const b={id:'verified',title:'Servizi per la salute',sourceUrl:'https://official.example/call',territories:['italia'],legalForms:['aps'],sectors:['salute'],eligibility:['APS'],tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:'2026-10-12',verificationNote:'Official applicant rules checked'}};assert.equal(context.api.calc(b).eligibilityState,'verify');assert.equal(context.api.isMarginal({...b,sectors:['energia']},{score:10,thematicWarnings:[]}),true);
});



test('production catalogs apply documented reviews and live monitoring, preserve POP exclusion data and omit unconfirmed credit window',async(t)=>{
 // Verify the reviewed snapshot while these calls were still open.
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-14T08:00:00+02:00')});

 const all=[];for(const name of ['radar_bandi_catalogo','radar_bandi_catalogo_extra']){
  const d=await(await app.fetch(new Request('https://test.local/'+name+'.json?region=Veneto&scope=national'),env)).json();all.push(...d.bandi);
 }
 const sourceChecks=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_source_checks.json',import.meta.url),'utf8')).checks||{};
 const needsReview=new Set(Object.values(sourceChecks).filter(c=>c.needsReview).map(c=>c.bandoId));
 assert.ok(!all.some(b=>b.id==='FCARIPARO-IMPRENDITORIA-SOCIALE-2026'));
 for(const id of ['FC-NUOVI-PONTI-2026','FC-MUSEI-ACCESS-2026','FC-HOUSING-FRAGILI-2026','FC-COFIN-EU-2026','ER-CARISBO-EMERGENZE-2026','RLH12026055146','CONIBAMBINI-NOTE-COMUNITA-2026']){
  const b=all.find(b=>b.id===id);assert.ok(b,id);assert.equal(b.tracking.verifiedAt,id==='FC-COFIN-EU-2026'?'2026-10-27':id==='RLH12026055146'?'2026-10-23':id==='CONIBAMBINI-NOTE-COMUNITA-2026'?'2026-10-19':'2026-10-14',id);assert.equal(b.tracking.sourceMonitoringNeedsReview===true,needsReview.has(id),id+' monitoring flag');
 }
 const eu=all.find(b=>b.id==='FC-COFIN-EU-2026');
 assert.equal(eu.fund,3100000);
 for(const term of ['Patrimonio netto positivo','Nessuna nuova candidatura','Beneficiario diretto','Accompagnamento preliminare obbligatorio']) assert.ok(eu.hardRequirements.some(r=>r.type==='document'&&r.label.includes(term)),term);
 assert.equal(all.find(b=>b.id==='FC-MUSEI-ACCESS-2026').maxGrant,200000);
 assert.equal(all.find(b=>b.id==='FC-HOUSING-FRAGILI-2026').maxGrant,500000);
 assert.ok(all.find(b=>b.id==='UNIPOLIS-POP-2026').hardRequirements.some(r=>r.type==='foundation_year'&&r.min===2016));
});


test('production catalogs remove POP and Note di comunità at their verified closing times',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-14T08:00:00+02:00')});
 async function ids(){
  const result=[];
  for(const name of ['radar_bandi_catalogo','radar_bandi_catalogo_extra']){
   const response=await app.fetch(new Request('https://test.local/'+name+'.json?region=Veneto&scope=national'),env);
   assert.equal(response.status,200);
   result.push(...(await response.json()).bandi.map(b=>b.id));
  }
  return result;
 }
 const pop='UNIPOLIS-POP-2026',note='CONIBAMBINI-NOTE-COMUNITA-2026';
 let catalog=await ids();assert.ok(catalog.includes(pop));assert.ok(catalog.includes(note));
 t.mock.timers.setTime(new Date('2026-10-15T13:00:01+02:00').getTime());
 catalog=await ids();assert.ok(!catalog.includes(pop));assert.ok(catalog.includes(note));
 t.mock.timers.setTime(new Date('2026-10-16T13:00:01+02:00').getTime());
 catalog=await ids();assert.ok(!catalog.includes(pop));assert.ok(!catalog.includes(note));
 // A currently open call survives the same production filtering.
 assert.ok(catalog.includes('UBI-UMANITARIO-2026'));
});


test('19 October source reviews retain applicant checks and closed calls stay excluded',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-19T16:45:00+02:00')});
 const all=[];
 for(const name of ['radar_bandi_catalogo','radar_bandi_catalogo_extra']){
  const d=await(await app.fetch(new Request('https://test.local/'+name+'.json?region=Veneto&scope=national'),env)).json();all.push(...d.bandi);
 }
 for(const id of ['UNIPOLIS-POP-2026','CONIBAMBINI-NOTE-COMUNITA-2026','RLJ12026054688'])assert.ok(!all.some(b=>b.id===id),id+' closed');
 for(const id of ['RLD12025048623','RLT12026053831','RLT12026052444']){
  const b=all.find(b=>b.id===id);assert.ok(b,id);assert.equal(b.tracking.verifiedAt,'2026-10-19');
  assert.ok(b.hardRequirements.some(r=>r.type==='document'),id+' applicant documents retained');
  assert.ok(b.tracking.verificationEvidence.length>=2,id+' official documents monitored');
 }
 const v=all.find(b=>b.id==='RLT12026053831');assert.equal(v.deadlineAt,'2027-04-30T12:00:00+02:00');assert.equal(v.maxGrant,30000);
 const small=all.find(b=>b.id==='RLD12025048623');assert.ok(small.hardRequirements.some(r=>r.type==='revenue'&&r.max===50000));assert.ok(small.evidenceUrls.some(u=>u.includes('FAQ_Avviso')));
 const base=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_catalogo.json',import.meta.url),'utf8')).bandi;
 assert.equal(base.find(b=>b.id==='RLT12026053831').deadline,v.deadline);
 assert.equal(base.find(b=>b.id==='RLT12026052444').fund,150000);
});


test('reviewed publications reach the national client with distinct partner and promoter roles',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-25T08:00:00+01:00')});
 const request=scope=>app.fetch(new Request('https://test.local/radar_bandi_catalogo_extra.json?region=Veneto'+scope),env);
 const body=await(await request('&scope=national')).json();
 const caript=body.bandi.find(b=>b.id==='CARIPT-BORSE-LAVORO-2026');
 const scu=body.bandi.find(b=>b.id==='VEN-SERVIZIO-CIVILE-REGIONALE-2026');
 assert.ok(caript);assert.ok(scu);
 assert.equal(caript.deadline,'2026-11-13');assert.equal(scu.deadline,'2026-11-09');
 assert.ok(caript.eligibility.some(s=>s.includes('lavoratore')&&s.includes('partner')));
 assert.ok(caript.hardRequirements.some(r=>r.type==='seat'&&r.places.includes('pistoia')));
 assert.ok(scu.hardRequirements.some(r=>r.label.includes('Albo SCU')&&r.label.includes('cooperazione')));
 for(const b of [caript,scu]){
  assert.equal(b.eligibilityStatus,'da_verificare');
  assert.ok(b.applicantChecks.every(c=>c.status==='unknown'));
  assert.equal(b.tracking.verificationEvidence.length,2);
 }
 const local=await(await request('')).json();
 assert.ok(!local.bandi.some(b=>b.id===caript.id),'a Veneto seat alone must not erase Pistoia requirements');
});

test('newly reviewed calls disappear at their deadlines without a fixed client count',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-14T08:00:00+01:00')});
 const body=await(await app.fetch(new Request('https://test.local/radar_bandi_catalogo_extra.json?scope=national'),env)).json();
 assert.ok(!body.bandi.some(b=>['CARIPT-BORSE-LAVORO-2026','VEN-SERVIZIO-CIVILE-REGIONALE-2026'].includes(b.id)));
});

test('four newly documented calls reach a national APS without certifying its requirements',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-25T09:00:00+01:00')});
 const request=()=>app.fetch(new Request('https://test.local/radar_bandi_catalogo_extra.json?region=Veneto&scope=national'),env);
 const records=(await(await request()).json()).bandi;
 const ids=['CARIPLO-ANITA-RETI-MILLE-2026','CARIPLO-CARCERE-COMUNITA-2026','ER-DISABILITA-UDITIVA-2027-2029','FVG-BENESSERE-OVER65-MONTAGNA-2026'];
 for(const id of ids){const b=records.find(x=>x.id===id);assert.ok(b,id);assert.equal(b.eligibilityStatus,'da_verificare');assert.ok(b.applicantChecks.every(c=>c.status==='unknown'));assert.ok(b.tracking.verificationEvidence.length>=2);}
 const hearing=records.find(x=>x.id===ids[2]);
 assert.equal(hearing.deadlineAt,'2026-12-11T12:00:00+01:00');
 assert.equal(hearing.maxGrant,null,'annual ceiling must not become a total project ceiling');
 assert.ok(hearing.hardRequirements.some(r=>r.type==='boolean'&&r.field==='hearingInclusionInStatute'));
 const anita=records.find(x=>x.id===ids[0]);assert.equal(anita.maxGrant,null);assert.ok(anita.eligibility.some(x=>x.includes('città di Milano esclusa')));
 t.mock.timers.setTime(new Date('2026-10-29T17:00:01+01:00').getTime());
 assert.ok(!(await(await request()).json()).bandi.some(x=>x.id===ids[1]),'phase 2 must not keep phase 1 open');
});

test('licensed health dashboard shows planned EU funding separately from active catalogs',async()=>{
 const html=await(await app.fetch(new Request('https://test.local/?p='+p,{headers:{accept:'text/html',cookie:testCookie}}),env)).text();
 assert.match(html,/Prossime aperture e programmi annunciati/);
 assert.match(html,/PROGRAMMATO · apertura e scadenza non verificate/);
 for(const name of ['radar_bandi_catalogo','radar_bandi_catalogo_extra']){
  const body=await(await app.fetch(new Request('https://test.local/'+name+'.json?scope=national'),env)).json();
  assert.ok(!body.bandi.some(b=>b.id==='EU4HEALTH-OA-g-26-91'));
 }
});

test('licensed summary includes future opportunities and their content timestamp separately from active counts',async()=>{
 const html=await(await app.fetch(new Request('https://test.local/?p='+p,{headers:{accept:'text/html',cookie:testCookie}}),env)).text();
 const meta=JSON.parse(html.match(/const plannedInfo=(\{[^;]+\});/)[1]);
 assert.equal(meta.count,2); assert.equal(meta.updatedAt,'25/10/2026 21:54');
 assert.match(html,/id="plannedSummary"/);
 assert.match(html,/Ultimo aggiornamento opportunità:/);
 assert.match(html,/Prossime aperture e programmi annunciati/);
 const noWatchEnv={...env,ASSETS:{fetch:async r=>new URL(r.url).pathname==='/radar_bandi_programmati.json'?new Response('Unavailable',{status:503}):env.ASSETS.fetch(r)}};
 const fallback=await(await app.fetch(new Request('https://test.local/?p='+p,{headers:{accept:'text/html',cookie:testCookie}}),noWatchEnv)).text();
 assert.match(fallback,/const plannedInfo=\{count:0,updatedAt:null\}/);
});
test('update badge chooses latest content date across active and future catalogs, never the current page load',()=>{
 const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function latestOpportunityUpdate('),source.indexOf('async function refresh()'));
 const context={};vm.createContext(context);vm.runInContext(fn,context);
 assert.equal(context.latestOpportunityUpdate('25/10/2026 17:40','25/10/2026 21:54'),'25/10/2026 21:54');
 assert.equal(context.latestOpportunityUpdate('26/10/2026 00:03','25/10/2026 21:54'),'26/10/2026 00:03');
 assert.equal(context.latestOpportunityUpdate('01/11/2026 08:00','31/10/2026 23:00'),'01/11/2026 08:00');
 assert.equal(context.latestOpportunityUpdate(null,'invalid'),null);
});
