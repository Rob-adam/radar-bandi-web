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
