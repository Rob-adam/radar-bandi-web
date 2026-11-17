import test from 'node:test';
import assert from 'node:assert/strict';
import {officialListing} from '../src/official-listing.js';

test('public source collector accepts only fixed sources and never forwards credentials',async()=>{
 let calls=0;
 const upstream=async(url,init)=>{calls++;assert.equal(url,'https://www.regione.liguria.it/component/publiccompetitions/category/3-contributi.html');assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers.Cookie,undefined);assert.equal(init.redirect,'manual');return new Response('<main>Elenco pubblico</main>',{headers:{'Content-Type':'text/html'}})};
 for(const query of ['source=https://evil.example','source=liguria&page=2','source=basilicata&page=-1']){
  assert.equal((await officialListing(new Request('https://test.local/api/official-listing?'+query),{fetch:upstream})).status,400);
 }
 assert.equal(calls,0);
 const r=await officialListing(new Request('https://test.local/api/official-listing?source=liguria',{headers:{Authorization:'Bearer private',Cookie:'private'}}),{fetch:upstream});
 assert.equal(r.status,200);assert.equal(calls,1);assert.ok(r.headers.get('Content-Security-Policy').includes('sandbox'));
 assert.equal(r.headers.get('X-Bandovera-Official-Source'),'https://www.regione.liguria.it/component/publiccompetitions/category/3-contributi.html');
});
test('Basilicata scroll uses only its fixed public read handler',async()=>{
 const r=await officialListing(new Request('https://test.local/api/official-listing?source=basilicata&page=3'),{fetch:async(url,init)=>{
  assert.equal(url,'https://portalebandi.regione.basilicata.it/');assert.equal(init.method,'POST');
  assert.equal(init.body.get('handler'),'listing_load_more');assert.equal(init.body.get('query[query_id]'),'26');assert.equal(init.body.get('page_settings[page]'),'3');
  return Response.json({success:true,data:{html:'public cards'}});
 }});assert.equal(r.status,200);
 assert.equal((await officialListing(new Request('https://test.local/api/official-listing?source=basilicata',{method:'POST'}))).status,405);
});
test('grant detail recovery rejects arbitrary/private paths and reads only public grant pages',async()=>{
 let calls=0;
 const fetch=async(url)=>{calls++;assert.equal(url,'https://portalebandi.regione.basilicata.it/avvisi-e-bandi/progetto-sociale/');return new Response('<main>Official grant</main>')};
 for(const detail of ['/wp-admin/','//evil.example/avvisi-e-bandi/a/','/avvisi-e-bandi/../private/']){
  assert.equal((await officialListing(new Request('https://test.local/api/official-listing?source=basilicata&detail='+encodeURIComponent(detail)),{fetch})).status,400);
 }
 assert.equal(calls,0);
 const r=await officialListing(new Request('https://test.local/api/official-listing?source=basilicata&detail=%2Favvisi-e-bandi%2Fprogetto-sociale%2F'),{fetch});
 assert.equal(r.status,200);assert.equal(r.headers.get('X-Bandovera-Official-Source'),'https://portalebandi.regione.basilicata.it/avvisi-e-bandi/progetto-sociale/');
});
test('successful public listings are cached; source refusals remain refusals and are not cached',async()=>{
 let cached=null,writes=0;
 const cache={match:async()=>cached,put:async(k,r)=>{writes++;cached=r}};
 let r=await officialListing(new Request('https://test.local/api/official-listing?source=liguria'),{cache,fetch:async()=>new Response('Forbidden',{status:403})});
 assert.equal(r.status,403);assert.equal(writes,0);
 r=await officialListing(new Request('https://test.local/api/official-listing?source=liguria'),{cache,fetch:async()=>new Response('Official listing')});
 assert.equal(r.status,200);assert.equal(writes,1);
 r=await officialListing(new Request('https://test.local/api/official-listing?source=liguria'),{cache,fetch:async()=>{throw new Error('Must use cache')}});
 assert.equal(r.status,200);
});
test('Emilia-Romagna recovery exposes only the fixed verified PDF',async()=>{
 const page='https://sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi/2026/bando-per-il-finanziamento-di-progetti-a-favore-di-persone-con-disabilita-uditiva-ai-sensi-della-l-r-n-9-del-2019-periodo-1deg-gennaio-2027-31-dicembre-2029';
 const pdf=page+'/documenti/il-testo-del-bando.pdf/@@download/file';
 for(const [source,target,type] of [['er-disabilita-uditiva-pdf',pdf,'application/pdf']]){
  const r=await officialListing(new Request('https://test.local/api/official-listing?source='+source),{fetch:async(url)=>{
   assert.equal(url,target);return new Response(type==='application/pdf'?'%PDF-1.7':'<main>Bando aperto</main>',{headers:{'Content-Type':type}});
  }});
  assert.equal(r.status,200);assert.equal(r.headers.get('X-Bandovera-Official-Source'),target);
 }
 assert.equal((await officialListing(new Request('https://test.local/api/official-listing?source=er-disabilita-uditiva-page'))).status,400);
});
