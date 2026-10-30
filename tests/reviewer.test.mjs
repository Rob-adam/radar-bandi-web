import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import app from '../src/dashboard-wrapper.js';
import {accessHash} from '../src/client-access.js';
const TEST_TOKEN='test-client-token-0000000000000000000000000000';const TEST_HASH=await accessHash(TEST_TOKEN);const testCookie='bandovera_access_RB0003='+TEST_TOKEN;
import {enrichProfile,reviewCall} from '../src/review-rules.js';
const original=JSON.parse(fs.readFileSync(new URL('./rb0003-profile.json',import.meta.url),'utf8'));
const base=enrichProfile(original);
function engine(p=base){
 const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 const prefix=source.slice(0,source.indexOf('const favoriteKey='));
 const review=source.slice(source.indexOf('function sourceReview(b)'),source.indexOf('function status(r,b)'));
 const nodes=new Map();const context={window:{BANDOVERA_PROFILE:p},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)}},location:{search:''},localStorage:{getItem:()=>null},URLSearchParams,TextDecoder,Uint8Array,atob,Intl,Date,console};
 vm.createContext(context);vm.runInContext(prefix+review+'globalThis.api={calc,conceptSet,fieldMatch,hardReqResult,callDays,isMarginal,sourceReview,continuousDeadlineLabel};})();',context);return context.api;
}
function call(id){return reviewCall({id,title:id,sourceUrl:'https://official.example/call',territories:['italia'],legalForms:['aps'],tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:'2026-10-13',verificationNote:'Test source'},sectors:['salute'],activities:['assistenza'],beneficiaries:['pazienti'],purposes:['salute']});}
test('2014 excludes POP despite high thematic affinity; unknown foundation year remains unknown',()=>{
 const e=engine();assert.equal(e.calc(call('UNIPOLIS-POP-2026')).eligibilityState,'no');
 assert.equal(engine({...base,foundationYear:null}).calc(call('UNIPOLIS-POP-2026')).eligibilityState,'verify');
 for(const year of [2016,2024])assert.notEqual(engine({...base,foundationYear:year}).calc(call('UNIPOLIS-POP-2026')).eligibilityState,'no');
 for(const year of [2015,2025])assert.equal(engine({...base,foundationYear:year}).calc(call('UNIPOLIS-POP-2026')).eligibilityState,'no');
});
test('revenue 50000 inclusive, 50001 excludes; unknown revenue is not exclusion',()=>{
 const b=call('RLD12025048623');assert.notEqual(engine({...base,annualRevenue:50000}).calc(b).eligibilityState,'no');
 assert.equal(engine({...base,annualRevenue:50001}).calc(b).eligibilityState,'no');
 assert.equal(engine({...base,annualRevenue:null}).calc(b).eligibilityState,'verify');assert.equal(b.maxGrant,5000);
});
test('Housing and CoPower distinguish unknown evidence from confirmed negatives',()=>{
 assert.equal(engine().calc(call('RLH12026055146')).eligibilityState,'verify');
 assert.equal(engine({...base,propertyAvailabilityYears:0}).calc(call('RLH12026055146')).eligibilityState,'no');
 assert.equal(engine().calc(call('OXFAM-COPOWER-2026')).eligibilityState,'verify');
 assert.equal(engine({...base,genderRightsExperienceYears:0}).calc(call('OXFAM-COPOWER-2026')).eligibilityState,'no');
});
test('national operations do not qualify a local seat and incomplete seat inventory cannot prove absence',()=>{
 const b=call('PIE-FCRC-ATTRAZIONE-PROGETTAZIONE-2026');assert.equal(engine().calc(b).eligibilityState,'verify');
 assert.equal(engine({...base,seatsComplete:true}).calc(b).eligibilityState,'no');
 assert.equal(engine().hardReqResult({type:'seat',which:'operational',places:['lombardia']}).value,true);
 assert.equal(engine({...base,seats:[],region:'Veneto',province:'Padova'}).hardReqResult({type:'seat',which:'operational',places:['lombardia']}).value,null);
 assert.equal(engine({...base,seats:[],region:'Veneto',province:'Padova'}).hardReqResult({type:'seat',which:'legal',places:['Italia']}).value,true);
});
test('whole-word matching rejects arte in partenariato and sport in trasportate',()=>{
 const e=engine();assert.equal(e.conceptSet('partenariato trasportate trasformazione').has('cultura'),false);
 assert.equal(e.conceptSet('partenariato trasportate trasformazione').has('sport'),false);
 assert.equal(e.conceptSet('partenariato trasportate trasformazione').has('formazione'),false);
 assert.equal(e.conceptSet('asma BPCO').has('respiratorio'),true);
 assert.equal(e.fieldMatch('salute',['salute']),e.fieldMatch('salute cultura volontariato',['salute']));
});
test('final affinity is reconstructible from shown weights with no floors or thematic caps',()=>{
 const r=engine().calc(call('UBI-UMANITARIO-2026'));const weights={sector:.25,activities:.20,beneficiaries:.30,purposes:.25};let n=0,d=0;
 for(const [k,w] of Object.entries(weights)){if(r.breakdown[k]!==null){n+=r.breakdown[k]*w;d+=w}}
 assert.equal(r.score,Math.round(n/d));const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');assert.ok(!/Math\.max\(mission,(68|78|88)\)/.test(source));assert.ok(!source.includes('etsCrossCuttingScore'));
});
test('deadline hour closes the opportunity immediately in Europe/Rome',()=>{
 assert.equal(engine().callDays({deadline:'2026-10-15',deadlineAt:'2026-10-15T13:00:00+02:00'},new Date('2026-10-15T11:00:01Z')),-1);
 assert.equal(engine().callDays({deadline:'2026-10-15',deadlineAt:'2026-10-15T13:00:00+02:00'},new Date('2026-10-15T10:59:59Z')),0);
});
test('contacts use same-origin licensed SMTP and report only explicit acceptance',async()=>{
 const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.ok(!source.includes('mailto:'));assert.ok(source.includes('tramite Cloudflare e Register.it'));assert.ok(source.includes('referente dell’assistenza BANDOVERA'));
 const a=source.indexOf('  const contactAttempts='),z=source.indexOf('  /* ASSISTENZA DISSERVIZIO',a);
 const calls=[];let response={ok:true,json:async()=>({state:'accepted'})};
 const form={querySelector:()=>({value:'test@example.org',setCustomValidity(){},checkValidity:()=>true}),reportValidity:()=>true};
 class FakeFormData{constructor(){this.fields=new Map()}set(k,v){this.fields.set(k,v)}get(k){return this.fields.get(k)}}
 const context={profile:{license:'RB-0003'},location:{search:'?access='+TEST_TOKEN,origin:'https://site.example'},URLSearchParams,FormData:FakeFormData,crypto,AbortSignal,Map,SUPPORTO_EMAIL:'supporto@bandovera.it',ASSISTENZA_EMAIL:'assistenza@bandovera.it',INFO_EMAIL:'info@bandovera.it',console:{error(){}},fetch:async(url,options)=>{calls.push({url,options});return response}};
 vm.createContext(context);vm.runInContext(source.slice(a,z)+'globalThis.submit=sendContact;',context);
 const assist='assistenza@bandovera.it',support='supporto@bandovera.it';
 assert.ok(source.includes('sendContact(form,modal.querySelector("#assistDisservizioMsg"),ASSISTENZA_EMAIL)'));assert.ok(source.includes('sendContact(temp,msg,SUPPORTO_EMAIL)'));
 let msg={innerHTML:''};assert.equal(await context.submit(form,msg,assist),true);assert.equal(calls[0].url,'/api/contact');assert.equal(JSON.parse(calls[0].options.body).email,'test@example.org');assert.equal(calls[0].options.referrer,undefined);assert.equal(calls[0].options.referrerPolicy,'no-referrer');assert.ok(!calls[0].options.body.includes(TEST_TOKEN));assert.ok(msg.innerHTML.includes('Richiesta inviata.'));
 msg={innerHTML:''};assert.equal(await context.submit(form,msg,support),true);assert.equal(calls[1].url,'/api/contact');assert.ok(msg.innerHTML.includes(support));
 for(const result of [{success:false},{success:'false'},{}]){response={ok:true,json:async()=>result};msg={innerHTML:''};assert.equal(await context.submit(form,msg,assist),false);assert.ok(msg.innerHTML.includes('Invio non confermato'));assert.ok(!msg.innerHTML.includes('Richiesta inviata.'));}
 response={ok:false,json:async()=>({state:'accepted'})};assert.equal(await context.submit(form,{innerHTML:''},assist),false);
 response={ok:true,json:async()=>{throw Error('Invalid JSON')}};assert.equal(await context.submit(form,{innerHTML:''},assist),false);
});
test('tampered profile is replaced with the stored profile; suspended licenses are blocked by Worker',async()=>{
 const records=new Map([['license:RB-0003',{active:true,profile:original,accessTokenHash:TEST_HASH}]]);
 const env={LICENSES:{get:async k=>records.get(k)||null},ASSETS:{fetch:async req=>new Response(fs.readFileSync(new URL('../public/index.html',import.meta.url)),{headers:{'content-type':'text/html'}})}};
 const p=Buffer.from(JSON.stringify({...original,name:'FORGED NAME',region:'Cuneo',foundationYear:2020})).toString('base64url');
 const html=await(await app.fetch(new Request('https://test.local/?p='+p,{headers:{cookie:testCookie}}),env)).text();
 const canonical=JSON.parse(html.match(/window.BANDOVERA_PROFILE=(.*?);<\/script>/)[1]);assert.equal(canonical.name,original.name);assert.equal(canonical.foundationYear,2014);assert.equal(canonical.region,'Veneto');
 records.set('license:RB-0003',{active:false,profile:original});assert.equal((await app.fetch(new Request('https://test.local/RB-0003'),env)).status,403);assert.equal((await app.fetch(new Request('https://test.local/?p='+p,{headers:{cookie:testCookie}}),env)).status,403);
});
test('knowing a license code cannot read or overwrite protected favorites',async()=>{
 const data=new Map([['license:RB-0003',{active:true,profile:original,accessTokenHash:TEST_HASH}],['favorites:RB-0003',{favorites:['existing-favorite']}]]);
 const env={LICENSES:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,JSON.parse(v))}};
 const url='https://test.local/api/favorites/RB-0003';
 assert.equal((await app.fetch(new Request(url),env)).status,403);
 assert.equal((await app.fetch(new Request(url,{headers:{'x-bandovera-access':'invalid-key'}}),env)).status,403);
 assert.equal((await app.fetch(new Request(url,{method:'PUT',headers:{origin:'https://test.local','content-type':'application/json'},body:'{"favorites":[]}'}),env)).status,403);
 assert.deepEqual(data.get('favorites:RB-0003').favorites,['existing-favorite']);
 assert.equal((await app.fetch(new Request(url,{headers:{'x-bandovera-access':TEST_TOKEN}}),env)).status,200);
 assert.equal((await app.fetch(new Request('https://test.local/RB-0003'),env)).status,403);
 const redirect=await app.fetch(new Request('https://test.local/RB-0003?access='+TEST_TOKEN),env);assert.equal(redirect.status,302);assert.ok(redirect.headers.get('set-cookie').includes('HttpOnly'));
});


test('deadline wording never certifies a source whose verification is pending',()=>{
 const e=engine();const good=call('FC-HOUSING-FRAGILI-2026');
 assert.equal(e.continuousDeadlineLabel(good),'Senza scadenza (fonte verificata)');
 const changed={...good,tracking:{...good.tracking,sourceMonitoringNeedsReview:true}};
 assert.ok(e.sourceReview(changed));assert.equal(e.continuousDeadlineLabel(changed),'Scadenza da riconfermare');
 assert.equal(e.continuousDeadlineLabel({...good,tracking:{continuousDeadlineConfirmed:true}}),'Scadenza da riconfermare');
});
test('reviewed sources do not certify applicant evidence and unresolved 2025 regulation is suspended',()=>{
 const e=engine();for(const id of ['FC-NUOVI-PONTI-2026','FC-MUSEI-ACCESS-2026','FC-HOUSING-FRAGILI-2026','FC-COFIN-EU-2026','ER-CARISBO-EMERGENZE-2026','RLH12026055146','CONIBAMBINI-NOTE-COMUNITA-2026']){
  const b=call(id);assert.equal(e.sourceReview(b),'',id);assert.notEqual(e.calc(b).eligibilityState,'yes',id);
 }
 assert.equal(call('FCARIPARO-IMPRENDITORIA-SOCIALE-2026').sourceStatus,'sospeso');
});

test('Roncade requires local resident activities even with Veneto seat and national operations',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_catalogo_extra.json',import.meta.url),'utf8'));
 const b=reviewCall(catalog.bandi.find(x=>x.id==='VEN-RONCADE-CONTRIBUTI-ORDINARI-2026'));
 assert.equal(engine().calc(b).eligibilityState,'verify');
 assert.equal(engine({...base,roncadeResidentActivities2026:false}).calc(b).eligibilityState,'no');
 assert.equal(engine({...base,roncadeResidentActivities2026:true}).calc(b).eligibilityState,'verify');
 assert.equal(b.deadlineAt,'2026-10-30T12:00:00+01:00');
});
