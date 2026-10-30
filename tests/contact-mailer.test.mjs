import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ContactDispatcher,routeContact,validateContact,sendContactSMTP} from '../src/contact-mailer.js';
import {accessHash} from '../src/client-access.js';
const id='00000000-0000-4000-8000-000000000001';
const contact={id,license:'RB-0003',kind:'support',name:'Referente prova',email:'test@example.org',phone:'000',message:'PROVA NON INVIARE',bando:'Bando di prova',organisation:'Ente prova'};
const token='test-only-not-a-real-access-key-1234567890';
const clone=v=>v===undefined?undefined:structuredClone(v);
class Storage{constructor(){this.data=new Map();this.alarmTime=null;}async get(k){return clone(this.data.get(k));}async put(k,v){this.data.set(k,clone(v));}async delete(k){this.data.delete(k);}async list({limit}={}){return new Map([...this.data].slice(0,limit));}async transaction(fn){return fn(this);}async getAlarm(){return this.alarmTime;}async setAlarm(t){this.alarmTime=t;}}
function setup(){const storage=new Storage(),messages=[];const env={CONTACTS_ENABLED:'true',SMTP_VERIFIED:'true',SMTP_HOST:'authsmtp.securemail.pro',SMTP_PORT:'465',SMTP_FROM:'info@bandovera.it',SMTP_USER:'test@example.org',SMTP_PASSWORD:'fake-test-only'};const dispatcher=new ContactDispatcher({storage},env);dispatcher.deliver=async message=>{messages.push(message);return {state:'accepted'};};env.CONTACTS={idFromName:()=>'',get:()=>({fetch:(url,init)=>dispatcher.fetch(new Request(url,init))})};const call=async(body=contact)=>{const r=await dispatcher.fetch(new Request('https://contacts/send',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};};return {storage,messages,env,dispatcher,call};}

test('fixed destinations, bounded fields and header injection rejected',()=>{
 assert.equal(validateContact(contact).kind,'support');
 for(const bad of [{kind:'__proto__'},{kind:'other'},{id:'bad'},{email:'test@example.org\r\nBcc:x@example.org'},{name:'x\r\ny'},{bando:'x\ny'},{message:'x'.repeat(4001)},{license:'RB-DEMO'}])assert.throws(()=>validateContact({...contact,...bad}));
});
test('concurrent duplicate sends reserve one attempt, preserve bando and never store PII',async()=>{
 const s=setup();const results=await Promise.all([s.call(),s.call()]);assert.ok(results.every(r=>r.body.state==='accepted'));assert.equal(s.messages.length,1);assert.equal(s.messages[0].to,'supporto@bandovera.it');assert.equal(s.messages[0].replyTo,contact.email);assert.ok(s.messages[0].body.includes(contact.bando));
 const stored=JSON.stringify([...s.storage.data]);for(const value of [contact.email,contact.name,contact.message,contact.organisation,contact.license,token])assert.ok(!stored.includes(value));
 assert.equal((await s.call({...contact,message:'changed'})).status,409);assert.equal(s.messages.length,1);
});
test('uncertain or interrupted delivery is never blindly retried',async()=>{
 for(const state of ['uncertain','sending']){const s=setup();s.dispatcher.deliver=async m=>{s.messages.push(m);return {state};};assert.equal((await s.call()).body.state,'uncertain');await s.call();assert.equal(s.messages.length,1);}
});
test('failed delivery can be explicitly retried with same Message-ID at most three times',async()=>{
 const s=setup();s.dispatcher.deliver=async m=>{s.messages.push(m);return {state:'failed'};};for(let n=0;n<3;n++)assert.equal((await s.call()).status,502);assert.equal((await s.call()).status,429);assert.equal(new Set(s.messages.map(m=>m.id)).size,1);
});
test('all three destinations are fixed on server; per-license quota enforced',async()=>{
 const s=setup();for(const [i,kind] of ['support','assistance','info'].entries())assert.equal((await s.call({...contact,kind,id:contact.id.slice(0,-1)+(i+1)})).body.state,'accepted');assert.deepEqual(s.messages.map(m=>m.to),['supporto@bandovera.it','assistenza@bandovera.it','info@bandovera.it']);
 for(let i=4;i<=5;i++)await s.call({...contact,id:contact.id.slice(0,-1)+i});assert.equal((await s.call({...contact,id:contact.id.slice(0,-1)+'6'})).status,429);
});
test('cleanup removes expired anonymous states and old counters',async()=>{
 const s=setup();await s.storage.put('mail:old',{at:0});await s.storage.put('rate:old',{at:0});await s.storage.put('mail:new',{at:Date.now()});await s.dispatcher.alarm();assert.equal(await s.storage.get('mail:old'),undefined);assert.equal(await s.storage.get('rate:old'),undefined);assert.ok(await s.storage.get('mail:new'));
});
test('route requires same origin, active license and existing private access; never writes LICENSES',async()=>{
 const s=setup();const rec={active:true,name:'Canonical organisation',accessTokenHash:await accessHash(token)};let writes=0;s.env.LICENSES={get:async()=>rec,put:()=>{writes++;throw Error('no writes');}};
 const req=(headers={},body=contact,method='POST')=>new Request('https://test.local/api/contact',{method,headers:{origin:'https://test.local','content-type':'application/json','x-bandovera-access':token,...headers},body:method==='POST'?JSON.stringify(body):undefined});
 assert.equal((await routeContact(req({'x-bandovera-access':''}),s.env)).status,403);assert.equal((await routeContact(req({origin:'https://evil.example'}),s.env)).status,403);assert.equal((await routeContact(req({},contact,'GET'),s.env)).status,405);
 rec.active=false;assert.equal((await routeContact(req(),s.env)).status,403);rec.active=true;rec.expiresAt='2020-01-01';assert.equal((await routeContact(req(),s.env)).status,403);delete rec.expiresAt;
 assert.equal((await routeContact(req(),{...s.env,CONTACTS_ENABLED:'false'})).status,503);assert.equal((await routeContact(req(),s.env)).status,200);assert.ok(s.messages[0].body.includes('Canonical organisation'));assert.ok(!s.messages[0].body.includes(token));assert.equal(writes,0);
 assert.equal((await routeContact(req({}, {...contact,message:'x'.repeat(30000)}),s.env)).status,413);
});
function transport(mode){let controller,step=0;const sent=[];const emit=s=>controller.enqueue(new TextEncoder().encode(s));return {sent,connect:()=>({opened:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;emit('220 test\r\n');}}),writable:new WritableStream({write(bytes){sent.push(new TextDecoder().decode(bytes));step++;if(step===8&&mode==='uncertain'){controller.error(Error('closed'));return;}emit(({1:'250 EHLO\r\n',2:'334 user\r\n',3:'334 pass\r\n',4:mode==='auth-failure'?'535 denied\r\n':'235 OK\r\n',5:'250 from\r\n',6:'250 to\r\n',7:'354 data\r\n',8:mode==='rejected'?'550 denied\r\n':'250 accepted\r\n'})[step]);}}),async close(){if(mode==='close-failure')throw Error('close');}})};}
test('TLS SMTP preserves Reply-To, encodes MIME and distinguishes acceptance from uncertain outcome',async()=>{
 const env=setup().env,message={id:'contact-'+id,to:'supporto@bandovera.it',replyTo:contact.email,subject:'BANDOVERA — prova',body:'Prova àè non inviare'};
 for(const [mode,state] of [['ok','accepted'],['close-failure','accepted'],['auth-failure','failed'],['rejected','failed'],['uncertain','uncertain']]){const t=transport(mode);assert.equal((await sendContactSMTP(message,env,t.connect)).state,state);if(state==='accepted')assert.ok(t.sent[7].includes('Reply-To: <'+contact.email+'>'));}
 await assert.rejects(sendContactSMTP({...message,replyTo:'x@example.org\r\nBcc:y@example.org'},env,()=>{throw Error('must not connect');}));
});
