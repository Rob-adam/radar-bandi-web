import {test} from 'node:test';import assert from 'node:assert/strict';
import {sendSupport} from '../src/support.js';import {accessHash} from '../src/client-access.js';
const token='test-support-access-000000000000000000000000000';
const env={LICENSES:{get:async()=>({active:true,expiresAt:'2027-10-13',profile:{name:'Test association'},accessTokenHash:await accessHash(token)})}};
function request(body={name:'Test',email:'test@example.org',message:'Technical test'},headers={}){return new Request('https://site.example/api/support/RB-0003?access='+token,{method:'POST',headers:{origin:'https://site.example','content-type':'application/json',...headers},body:JSON.stringify(body)})}
test('support forwards public origin and reply address, never private credentials',async()=>{
 let sent;const response=await sendSupport(request(),env,'RB-0003',async(url,options)=>{sent={url,options};return new Response(JSON.stringify({success:'true'}),{status:200})});
 assert.equal(response.status,200);assert.equal((await response.json()).success,true);
 assert.equal(sent.url,'https://formsubmit.co/ajax/presidente@unrespirodisperanzalombardia.com');assert.equal(sent.options.headers.Referer,'https://site.example/');assert.equal(sent.options.headers.Origin,'https://site.example');assert.equal(JSON.parse(sent.options.body)._replyto,'test@example.org');assert.ok(!JSON.stringify(sent).includes(token));
});
test('service rejection and ambiguous responses cannot report successful email',async()=>{
 for(const body of [{success:'false',message:'Missing origin'},{success:false},{}]){
  const r=await sendSupport(request(),env,'RB-0003',async()=>new Response(JSON.stringify(body)));assert.equal(r.status,502);assert.ok(!(await r.json()).success);
 }
 const r=await sendSupport(request(),env,'RB-0003',async()=>{throw Error('Network error')});assert.equal(r.status,502);
});
test('unauthorized, foreign-origin and malformed requests never send email',async()=>{
 let calls=0;const send=async()=>{calls++;return new Response('{}')};
 const noAccess=new Request('https://site.example/api/support/RB-0003',{method:'POST',headers:{origin:'https://site.example','content-type':'application/json'},body:'{}'});
 assert.equal((await sendSupport(noAccess,env,'RB-0003',send)).status,403);
 assert.equal((await sendSupport(request(undefined,{origin:'https://other.example'}),env,'RB-0003',send)).status,403);
 assert.equal((await sendSupport(request({name:'Test',email:'invalid',message:'Test'}),env,'RB-0003',send)).status,400);
 assert.equal(calls,0);
});
