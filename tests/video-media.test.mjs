import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/dashboard-wrapper.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('export async function serveGuideVideo'),source.indexOf('export default {'));
const {serveGuideVideo}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const payload='0123456789';
const env={ASSETS:{async fetch(req){assert.equal(req.headers.get('range'),null);return new Response(payload,{headers:{'Content-Type':'video/mp4',etag:'"test"'}})}}};
async function run(range,method='GET',extra={}){const headers={...extra};if(range)headers.Range=range;return serveGuideVideo(new Request('https://example.test/media/guide.mp4',{method,headers}),env)}
test('full video announces range support and exact size',async()=>{const r=await run();assert.equal(r.status,200);assert.equal(r.headers.get('accept-ranges'),'bytes');assert.equal(r.headers.get('content-length'),'10');assert.equal(await r.text(),payload)});
test('bounded range returns only requested bytes',async()=>{const r=await run('bytes=2-4');assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-4/10');assert.equal(r.headers.get('content-length'),'3');assert.equal(await r.text(),'234')});
test('open ended and suffix ranges',async()=>{assert.equal(await(await run('bytes=7-')).text(),'789');assert.equal(await(await run('bytes=-3')).text(),'789')});
test('clamps range end and large suffix',async()=>{assert.equal(await(await run('bytes=8-99')).text(),'89');assert.equal(await(await run('bytes=-99')).text(),payload)});
test('invalid or unsatisfiable ranges return 416',async()=>{for(const q of ['bytes=10-','bytes=5-2','bytes=-0','bytes=-','bytes=0-1,4-5']){const r=await run(q);assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */10')}});
test('HEAD returns size without body',async()=>{const r=await run(null,'HEAD');assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),'10');assert.equal(await r.text(),'')});
test('If-Range mismatch returns full content, match returns partial',async()=>{assert.equal((await run('bytes=2-4','GET',{'If-Range':'"old"'})).status,200);assert.equal((await run('bytes=2-4','GET',{'If-Range':'"test"'})).status,206)});

