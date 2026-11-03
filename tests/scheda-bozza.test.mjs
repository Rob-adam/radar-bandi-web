import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../integration/site/scheda-bozza.js',import.meta.url),'utf8');
async function setup({paid=false,ok=true,raw='{"cf":"12345678901","nome_associazione":"Ente test"}',ref=true,confirmResult=true,duringFetch,blocked=false}={}){
 const local=new Map([['unrelated','keep'],['bandovera.scheda2',raw]]),session=new Map(ref?[['bandovera_checkout_live_v1',JSON.stringify({id:'a'.repeat(32),digest:'test'})]]:[]);
 const elements=[],events={},calls=[],formEvents={};let redirected,reset=false;
 const storage=m=>({getItem:k=>m.get(k)??null,removeItem:k=>{if(blocked)throw Error();m.delete(k);},setItem:(k,v)=>m.set(k,v)});
 const form={before:e=>elements.push(e),append:e=>elements.push(e),reset:()=>{reset=true;},addEventListener:(k,fn)=>formEvents[k]=fn};
 const context={window:{addEventListener:(k,fn)=>events[k]=fn},document:{getElementById:()=>form,createElement:()=>({setAttribute(){},addEventListener(k,fn){this[k]=fn;}})},
  location:{origin:'https://bandovera.it',search:'',replace:v=>{redirected=v;}},localStorage:storage(local),sessionStorage:storage(session),
  confirm:()=>confirmResult,crypto:webcrypto,TextEncoder,URLSearchParams,setTimeout:()=>{},
  fetch:async(url,options)=>{calls.push({url,options});if(duringFetch)duringFetch({local,session,formEvents});return{ok,json:async()=>({paid})};}};
 await vm.runInNewContext(source,context);
 return{local,session,calls,button:elements[1],message:elements[0],redirected:()=>redirected,reset:()=>reset,formEvents};
}
test('conferma server cancella solo bozza e riferimento locali, riparte con riepilogo e callback nuovi',async()=>{
 const s=await setup({paid:true});assert.equal(s.local.has('bandovera.scheda2'),false);assert.equal(s.session.has('bandovera_checkout_live_v1'),false);
 assert.equal(s.local.get('unrelated'),'keep');assert.equal(s.session.get('bandovera_draft_cleared'),'paid');assert.equal(s.redirected(),'https://bandovera.it/attiva.html');assert.equal(s.reset(),true);
 const payload=JSON.parse(s.calls[0].options.body);assert.match(payload.digest,/^[a-f0-9]{64}$/);assert.equal(Object.keys(payload).length,2);assert.equal(JSON.stringify(payload).includes('Ente test'),false);
});
test('pagamento pendente, richiesta fallita o riferimento assente non cancellano la bozza',async()=>{
 for(const opts of [{paid:false},{paid:true,ok:false},{paid:true,ref:false}]){const s=await setup(opts);assert.equal(s.local.has('bandovera.scheda2'),true);assert.equal(s.redirected(),undefined);}
});
test('una nuova bozza o un campo modificato durante la verifica non vengono cancellati',async()=>{
 for(const duringFetch of [({local})=>local.set('bandovera.scheda2','new draft'),({formEvents})=>formEvents.input()]){
  const s=await setup({paid:true,duringFetch});assert.equal(s.local.has('bandovera.scheda2'),true);assert.equal(s.redirected(),undefined);
 }
});
test('Svuota richiede conferma, lascia intatte altre memorie e non chiama servizi di pagamento',async()=>{
 const s=await setup({ref:false});await s.button.click();assert.equal(s.local.has('bandovera.scheda2'),false);assert.equal(s.local.get('unrelated'),'keep');assert.equal(s.calls.length,0);
 const no=await setup({ref:false,confirmResult:false});await no.button.click();assert.equal(no.local.has('bandovera.scheda2'),true);
});
test('memoria non cancellabile mostra errore, senza dichiarare successo',async()=>{
 const s=await setup({ref:false,blocked:true});await s.button.click();assert.equal(s.redirected(),undefined);assert.match(s.message.textContent,/non ha consentito/);
});
test('ritorno Stripe rimanda solo al dominio BANDOVERA corretto, senza considerare il parametro URL una prova di pagamento',()=>{
 const html=fs.readFileSync(new URL('../public/acquisto-esito.html',import.meta.url),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 for(const [search,expected] of [['?status=success&site=https://www.bandovera.it','https://www.bandovera.it/attiva.html?pagamento=verifica'],['?status=success&site=https://foreign.example','https://bandovera.it/attiva.html?pagamento=verifica'],['?status=cancel',undefined]]){
  let target;vm.runInNewContext(script,{URLSearchParams,location:{search,replace:url=>{target=url;}},document:{getElementById:()=>({})}});assert.equal(target,expected);
 }
});
