import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const code=await readFile(new URL('../integration/site/stripe-checkout-existing-sheet-live.js',import.meta.url),'utf8');
function setup({blockedStorage=false,origin='https://bandovera.it',failFirst=false}={}){
  const elements=[],calls=[],saved=new Map();let redirected,verify,expire,widgetConfig;
  const sheet={nome_associazione:'Ente prova',email_referente:'test@example.org',privacy:'Sì',area_salute:'Salute'};
  const form={reportValidity:()=>true};const summary={hidden:false,append:e=>elements.push(e)};
  const document={querySelector:s=>s==='form#scheda'?form:null,getElementById:()=>summary,
    createElement:tag=>({tag,children:[],setAttribute(){},dataset:{},append(...ns){this.children.push(...ns);},addEventListener(name,fn){this[name]=fn;}})};
  const context={window:{BANDOVERA_STRIPE_LIVE:{enabled:true,sitekey:'PUBLIC_SITEKEY'},turnstile:{render(_el,cfg){widgetConfig=cfg;verify=cfg.callback;expire=cfg['expired-callback'];return 0;},reset(){}}},document,
    location:{origin,assign:url=>{redirected=url;}},crypto:webcrypto,TextEncoder,URL,
    FormData:class{forEach(fn){for(const [k,v]of Object.entries(sheet))fn(v,k);}},
    sessionStorage:{getItem:k=>saved.get(k)||null,setItem(k,v){if(blockedStorage)throw Error('Storage blocked');saved.set(k,v);}},
    fetch:async(url,init)=>{calls.push({url,...init});if(failFirst&&calls.length===1)throw Error('Rete interrotta');return {ok:true,json:async()=>({checkoutUrl:'https://checkout.stripe.com/c/pay_example'})};}};
  vm.runInNewContext(code,context);
  const section=elements[0],button=section?.children[2],message=section?.children[0];
  return {calls,sheet,summary,button,message,widgetConfig:()=>widgetConfig,verify:()=>verify('PUBLIC_TEST_TOKEN'),expire:()=>expire(),redirected:()=>redirected,section};
}
test('un solo clic: dopo la verifica apre Stripe con la scheda completa senza un secondo clic',async()=>{
  const s=setup();await s.button.click();assert.equal(s.calls.length,0);assert.equal(s.button.disabled,true);
  assert.match(s.message.textContent,/Apertura del pagamento/);
  assert.equal(s.widgetConfig().appearance,'interaction-only');
  s.widgetConfig()['before-interactive-callback']();assert.match(s.message.textContent,/completa la verifica/);
  s.widgetConfig()['after-interactive-callback']();assert.match(s.message.textContent,/Apertura del pagamento/);
  await s.verify();
  assert.equal(s.calls.length,1);const first=JSON.parse(s.calls[0].body);
  assert.deepEqual(first.sheet,s.sheet);assert.match(first.id,/^[a-f0-9]{32}$/);assert.equal(first.turnstileToken,'PUBLIC_TEST_TOKEN');
  assert.equal(s.calls[0].credentials,'omit');assert.equal(s.redirected(),'https://checkout.stripe.com/c/pay_example');
  assert.match(s.message.textContent,/pagina sicura Stripe/);
  await s.verify();await s.button.click();assert.equal(s.calls.length,1);
});
test('un tentativo fallito permette di riprovare senza duplicare il riferimento',async()=>{
  const s=setup({failFirst:true});await s.button.click();await s.verify();
  assert.equal(s.button.disabled,false);assert.match(s.message.textContent,/Rete interrotta/);
  await s.button.click();await s.verify();assert.equal(s.calls.length,2);
  assert.equal(JSON.parse(s.calls[0].body).id,JSON.parse(s.calls[1].body).id);
});
test('se il cliente riapre la scheda durante la verifica non parte il pagamento',async()=>{
  const s=setup();await s.button.click();s.summary.hidden=true;await s.verify();
  assert.equal(s.calls.length,0);assert.equal(s.redirected(),undefined);assert.equal(s.button.disabled,false);
});
test('verifica scaduta: sblocca il pulsante e non prosegue su callback tardiva',async()=>{
  const s=setup();await s.button.click();s.expire();await s.verify();
  assert.equal(s.calls.length,0);assert.equal(s.button.disabled,false);assert.match(s.message.textContent,/scaduta/);
});
test('memoria bloccata: messaggio comprensibile senza creare ordini',async()=>{
  const s=setup({blockedStorage:true});await s.button.click();assert.equal(s.calls.length,0);assert.match(s.message.textContent,/consenti la memoria/);
});
test('il pagamento non si inserisce su domini estranei',()=>{
  assert.equal(setup({origin:'https://example.org'}).section,undefined);
});
