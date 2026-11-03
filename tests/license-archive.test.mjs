import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import app from '../src/dashboard-wrapper.js';

function fixture(){
 const codes=['RB-0001','RB-0002','RB-0003','RB-9000001'];
 const saved=new Map(codes.map(code=>['license:'+code,JSON.stringify({license:code,name:code,active:true,expiresAt:'2027-11-03',accessToken:'private-'+code,profile:{name:code,license:code}})]));
 const env={ADMIN_API_KEY:'local-test-only',LICENSES:{
  get:async(k,o)=>{const v=saved.get(k);return v?(o?.type==='json'?JSON.parse(v):v):null},
  put:async(k,v)=>saved.set(k,v),
  list:async()=>({keys:[...saved.keys()].map(name=>({name})),list_complete:true})
 }};
 const request=(path,license,extras={})=>app.fetch(new Request('https://test.local'+path,{method:'POST',headers:{authorization:'Bearer local-test-only',origin:'https://test.local','content-type':'application/json',...extras},body:JSON.stringify({license})}),env);
 const list=async(archived=false)=> (await app.fetch(new Request('https://test.local/api/admin/licenses'+(archived?'?archived=1':''),{headers:{authorization:'Bearer local-test-only'}}),env)).json();
 return {saved,env,request,list};
}
test('elimina solo RB-0001/RB-0002, preserva Simona e licenza pagata, blocca accesso e mantiene sequenza',async()=>{
 const f=fixture(),simona=f.saved.get('license:RB-0003'),paid=f.saved.get('license:RB-9000001');
 for(const code of ['RB-0001','RB-0002'])assert.equal((await f.request('/api/admin/license/archive',code)).status,200);
 assert.deepEqual((await f.list()).clients.map(c=>c.license),['RB-0003','RB-9000001']);
 assert.equal((await f.list()).nextCode,'RB-9000002');
 assert.equal(f.saved.get('license:RB-0003'),simona);assert.equal(f.saved.get('license:RB-9000001'),paid);
 const deleted=(await f.list(true)).clients;assert.equal(deleted.length,2);assert.ok(deleted.every(c=>!('privateUrl'in c)&&!('accessToken'in c)));
 assert.equal((await app.fetch(new Request('https://test.local/RB-0001'),f.env)).status,403);
});
test('ripristino conserva dati e credenziali; eliminazione ripetuta non sovrascrive lo stato precedente',async()=>{
 const f=fixture(),original=JSON.parse(f.saved.get('license:RB-0001'));
 await f.request('/api/admin/license/archive','RB-0001');const archived=f.saved.get('license:RB-0001');
 await f.request('/api/admin/license/archive','RB-0001');assert.equal(f.saved.get('license:RB-0001'),archived);
 await f.request('/api/admin/license/restore','RB-0001');const restored=JSON.parse(f.saved.get('license:RB-0001'));
 delete restored.updatedAt;assert.deepEqual(restored,original);
});
test('ripristinare una licenza sospesa non la riattiva',async()=>{
 const f=fixture(),c=JSON.parse(f.saved.get('license:RB-0002'));c.active=false;f.saved.set('license:RB-0002',JSON.stringify(c));
 await f.request('/api/admin/license/archive','RB-0002');await f.request('/api/admin/license/restore','RB-0002');
 assert.equal(JSON.parse(f.saved.get('license:RB-0002')).active,false);
});
test('autenticazione, origine e codice esatto richiesti; richieste rifiutate non scrivono',async()=>{
 const f=fixture(),before=[...f.saved];
 assert.equal((await f.request('/api/admin/license/archive','RB-0001',{authorization:'Bearer wrong'})).status,401);
 assert.equal((await f.request('/api/admin/license/archive','RB-0001',{origin:'https://other.local'})).status,403);
 assert.equal((await f.request('/api/admin/license/archive','RB0001')).status,400);
 assert.equal((await f.request('/api/admin/license/archive','RB-9999')).status,404);
 assert.deepEqual([...f.saved],before);
});
test('modifica da pagina obsoleta non riattiva una licenza eliminata e codici alti non sono riutilizzati',async()=>{
 const f=fixture();await f.request('/api/admin/license/archive','RB-9000001');
 assert.equal((await f.request('/api/admin/license','RB-9000001')).status,409);
 assert.equal((await f.list()).nextCode,'RB-9000002');
});
test('dashboard conserva Sospendi e aggiunge separatamente Elimina/Ripristina con script validi',()=>{
 const html=fs.readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("active?'Sospendi':'Riattiva'"));assert.ok(html.includes('data-toggle='));
 assert.ok(html.includes('/admin/license-archive.js'));assert.ok(html.includes('serverNextCode'));
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 const script=fs.readFileSync(new URL('../public/admin/license-archive.js',import.meta.url),'utf8');new vm.Script(script);
 assert.ok(script.includes("button.textContent='Elimina'"));assert.ok(script.includes("button.textContent='Ripristina'"));
});
