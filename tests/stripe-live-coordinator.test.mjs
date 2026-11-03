import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {StripeLiveCoordinator,liveReady} from '../src/stripe-live-coordinator.js';
import {routeStripeLive} from '../src/stripe-live-routes.js';

const clone=v=>v===undefined?undefined:structuredClone(v);
class Storage {
  data=new Map();
  async get(k){return clone(this.data.get(k));}
  async put(k,v){this.data.set(k,clone(v));}
  async delete(k){this.data.delete(k);}
  async list({prefix='',limit=1000}={}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).slice(0,limit));}
  async transaction(fn){return fn(this);}
  async setAlarm(t){this.alarmAt=t;}
}
const sheet={nome_associazione:'Ente fittizio di collaudo',cf:'12345678901',tipo_ente:'ODV',runts:'Iscritta',
  regione:'Lombardia',settore_principale:'Salute',finalita_statutarie:'Tutela pazienti',capacita_progetti:'Volontariato',
  referente:'Referente fittizio',email_referente:'test@example.org',ack_completezza:'Sì',luogo_data:'Milano, 2 novembre 2026',
  compilatore:'Referente fittizio',privacy:'Sì',area_salute:'Salute',att_assistenza:'Assistenza',ben_pazienti:'Pazienti'};
const first='a'.repeat(32), second='b'.repeat(32);
function setup(){
  const storage=new Storage(),licenses=new Map([['license:RB-0003',{license:'RB-0003',active:true,name:'Record da conservare'}]]),messages=[],calls=[];
  const env={BANDOVERA_ENV:'production',LIVE_FULFILLMENT_ENABLED:'true',LIVE_CHECKOUT_ENABLED:'true',
    LIVE_LICENSES_ID:'352020f5c8294218ac658bfb3e96161c',STRIPE_LIVE_PRICE_ID:'price_1UWHRjDY6SOGDjJ1Exlw0SHk',
    STRIPE_LIVE_SECRET_KEY:'rk_live_FITTIZIA_NON_UTILIZZABILE',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_FITTIZIO',
    SMTP_VERIFIED:'true',SMTP_HOST:'authsmtp.securemail.pro',SMTP_PORT:'465',SMTP_FROM:'info@bandovera.it',
    SMTP_USER:'FITTIZIO',SMTP_PASSWORD:'FITTIZIA',ADMIN_API_KEY:'FITTIZIA',TURNSTILE_SECRET:'FITTIZIO',
    LICENSES:{get:async k=>clone(licenses.get(k))||null,put:async(k,v)=>licenses.set(k,JSON.parse(v))}};
  const worker=new StripeLiveCoordinator({storage},env);
  const session=id=>({id:'cs_live_'+id,object:'checkout.session',livemode:true,mode:'payment',payment_status:'paid',
    amount_total:1990,currency:'eur',client_reference_id:id,metadata:{request_id:id},url:'https://checkout.stripe.com/c/pay_'+id});
  worker.stripe=async(path,form,id)=>{
    calls.push({path,form,id});
    if(path.startsWith('prices/'))return {id:env.STRIPE_LIVE_PRICE_ID,livemode:true,active:true,unit_amount:1990,currency:'eur',recurring:null};
    return session(id);
  };
  // Stripe and SMTP are deliberately mocked: these tests make no external calls.
  worker.verifyLivePayment=async order=>session(order.id);
  worker.email=async message=>{messages.push(message);return {state:'accepted'};};
  env.LIVE_COORDINATOR={idFromName:name=>{assert.equal(name,'bandovera-live-registry-v1');return name;},get:()=>({fetch:(url,init)=>worker.fetch(new Request(url,init))})};
  const call=(path,body)=>worker.fetch(new Request('https://internal'+path,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined}));
  return {storage,licenses,messages,calls,env,worker,session,call,
    checkout:(id=first,fields=sheet)=>call('/checkout',{id,sheet:fields}),
    paid:(id=first)=>call('/paid',{orderId:id,sessionId:session(id).id})};
}

test('ordine → pagamento verificato → licenza completa → due notifiche; nessuna modifica RB-0003',async()=>{
  const s=setup(),before=clone(s.licenses.get('license:RB-0003'));
  assert.equal((await s.checkout()).status,200);assert.equal(s.licenses.size,1);
  const form=s.calls.find(c=>c.path==='checkout/sessions').form;
  assert.match(form.get('integration_identifier'),/^bandovera_live_checkout_[a-z]{8}$/);
  const result=await (await s.paid()).json();assert.equal(result.status,'fulfilled');
  const rec=s.licenses.get('license:'+result.license);
  assert.equal(rec.profile.sourceSheet.cf,sheet.cf);assert.equal(rec.profile.durationMonths,12);
  assert.equal(rec.payment.mode,'live');assert.equal(rec.price,19.9);assert.ok(rec.accessTokenHash);
  assert.equal(s.messages.length,2);assert.equal(s.messages[0].to,sheet.email_referente);assert.equal(s.messages[1].to,'info@bandovera.it');
  assert.match(s.messages[0].body,/\?access=/);assert.ok(!s.messages[1].body.includes(rec.accessToken));
  assert.deepEqual(s.licenses.get('license:RB-0003'),before);
});
test('stato bozza è in sola lettura, richiede riferimento e impronta corretti e conferma solo incassi verificati',async()=>{
  const s=setup();await s.checkout();
  const order=await s.storage.get('order:'+first),request={id:first,digest:order.digest};
  const before=clone([...s.storage.data]),licenses=clone([...s.licenses]),calls=s.calls.length;
  assert.deepEqual(await(await s.call('/draft-status',request)).json(),{paid:false});
  assert.equal((await s.call('/draft-status',{...request,digest:'0'.repeat(64)})).status,404);
  assert.equal((await s.call('/draft-status',{...request,id:second})).status,404);
  assert.equal((await s.call('/draft-status',{id:first,digest:'wrong'})).status,400);
  assert.deepEqual([...s.storage.data],before);assert.deepEqual([...s.licenses],licenses);assert.equal(s.messages.length,0);assert.equal(s.calls.length,calls);
  await s.paid();const after=clone([...s.storage.data]),count=s.messages.length;
  const result=await(await s.call('/draft-status',request)).json();assert.deepEqual(result,{paid:true});
  assert.deepEqual([...s.storage.data],after);assert.equal(s.messages.length,count);
  const url='https://worker.example/api/checkout/live/draft-status';
  const make=origin=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(request)});
  const response=await routeStripeLive(make('https://bandovera.it'),s.env);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://bandovera.it');assert.deepEqual(await response.json(),{paid:true});
  assert.equal((await routeStripeLive(make('https://foreign.example'),s.env)).status,403);
  s.env.LIVE_CHECKOUT_ENABLED='false';assert.equal((await routeStripeLive(make('https://bandovera.it'),s.env)).status,200);
});
test('ritorno dopo Stripe conserva il dominio della scheda, vieta domini estranei e non cambia nei retry',async()=>{
 for(const origin of ['https://www.bandovera.it','https://bandovera.it','https://foreign.example']){
  const s=setup();await s.call('/checkout',{id:first,sheet,origin});
  const url=new URL(s.calls.find(c=>c.path==='checkout/sessions').form.get('success_url'));
  assert.equal(url.searchParams.get('site'),origin==='https://foreign.example'?'https://bandovera.it':origin);
  await s.call('/checkout',{id:first,sheet,origin:'https://bandovera.it'});
  assert.equal(s.calls.filter(c=>c.path==='checkout/sessions').length,1);
 }
});
test('checkout ripetuto e webhook simultanei non duplicano sessione, licenza o email',async()=>{
  const s=setup();await Promise.all([s.checkout(),s.checkout()]);
  assert.equal(s.calls.filter(c=>c.path==='checkout/sessions').length,1);
  const responses=await Promise.all([s.paid(),s.paid(),s.paid()]);
  assert.ok(responses.every(r=>r.ok));assert.equal(s.licenses.size,2);assert.equal(s.messages.length,2);
  const list=await(await s.call('/list')).json();assert.equal(list.orders.length,1);
  assert.ok(!JSON.stringify(list).includes('accessToken'));
});
test('due clienti concorrenti ricevono codici e accessi distinti',async()=>{
  const s=setup();await Promise.all([s.checkout(first),s.checkout(second)]);
  await Promise.all([s.paid(first),s.paid(second)]);
  const records=[...s.licenses.values()].filter(r=>r.payment);
  assert.equal(records.length,2);assert.equal(new Set(records.map(r=>r.license)).size,2);
  assert.equal(new Set(records.map(r=>r.accessToken)).size,2);
});
test('stesso riferimento con scheda diversa viene rifiutato prima di Stripe',async()=>{
  const s=setup();await s.checkout();const n=s.calls.length;
  assert.equal((await s.checkout(first,{...sheet,cf:'98765432109'})).status,409);
  assert.equal(s.calls.length,n);
});
test('prezzo non live, importo errato e ricorrenza non creano checkout',async()=>{
  for(const change of [{livemode:false},{unit_amount:990},{recurring:{interval:'year'}}]){
    const s=setup(),original=s.worker.stripe.bind(s.worker);
    s.worker.stripe=async(...args)=>({...await original(...args),...change});
    assert.equal((await s.checkout()).status,503);assert.equal(s.licenses.size,1);
    assert.equal(s.calls.length,1);
  }
});
test('fallimento indipendente dell’email admin: recupero invia solo quella, conserva Message-ID',async()=>{
  const s=setup();let fail=true;
  s.worker.email=async m=>{s.messages.push(m);return {state:m.to==='info@bandovera.it'&&fail?'failed':'accepted'};};
  await s.checkout();const initial=await(await s.paid()).json();assert.equal(initial.status,'email_retry_pending');
  fail=false;await s.worker.alarm();
  assert.equal(s.messages.filter(m=>m.to===sheet.email_referente).length,1);
  const admin=s.messages.filter(m=>m.to==='info@bandovera.it');assert.equal(admin.length,2);assert.equal(admin[0].id,admin[1].id);
  assert.equal((await s.storage.get('order:'+first)).status,'fulfilled');
});
test('invio SMTP incerto non viene ripetuto, ma l’altra notifica prosegue',async()=>{
  const s=setup();s.worker.email=async m=>{s.messages.push(m);return {state:m.to===sheet.email_referente?'uncertain':'accepted'};};
  await s.checkout();await s.paid();await s.paid();await s.worker.alarm();
  assert.equal(s.messages.length,2);assert.equal((await s.storage.get('order:'+first)).status,'email_review_required');
});
test('interruzione dopo invio e prima di persistere l’esito resta incerta',async()=>{
  const s=setup();await s.checkout();await s.paid();
  const order=await s.storage.get('order:'+first);order.deliveries.customer.state='sending';await s.storage.put('order:'+first,order);
  s.messages.length=0;await s.paid();assert.equal(s.messages.length,0);
  assert.equal((await s.storage.get('order:'+first)).deliveries.customer.state,'uncertain');
});
test('rifiuta sessione discordante e verifica Stripe fallita senza attivare',async()=>{
  const s=setup();await s.checkout();
  assert.equal((await s.call('/paid',{orderId:first,sessionId:'cs_live_altro'})).status,409);
  s.worker.verifyLivePayment=async()=>{throw Error('incasso non verificato');};
  assert.equal((await s.paid()).status,503);assert.equal(s.licenses.size,1);assert.equal(s.messages.length,0);
});
test('notifica duplicata conserva sospensione e scadenza modificata dall’amministratore',async()=>{
  const s=setup();await s.checkout();const result=await(await s.paid()).json();
  const key='license:'+result.license,rec=s.licenses.get(key);rec.active=false;rec.expiresAt='2028-05-01';
  s.messages.length=0;await s.paid();assert.equal(s.licenses.get(key).active,false);
  assert.equal(s.licenses.get(key).expiresAt,'2028-05-01');assert.equal(s.messages.length,0);
});
test('notifica ripetuta non ricrea una licenza eliminata dopo l’attivazione',async()=>{
  const s=setup();await s.checkout();const result=await(await s.paid()).json();
  s.licenses.delete('license:'+result.license);await s.paid();assert.equal(s.licenses.size,1);
  assert.equal((await s.storage.get('order:'+first)).status,'license_missing');
});
test('licenze presenti nella sequenza non vengono sovrascritte',async()=>{
  const s=setup();s.licenses.set('license:RB-9000001',{name:'Preesistente'});
  await s.checkout();const result=await(await s.paid()).json();
  assert.equal(result.license,'RB-9000002');assert.deepEqual(s.licenses.get('license:RB-9000001'),{name:'Preesistente'});
});
test('interruzione nella risposta Checkout: il webhook recupera la sessione tramite riferimento verificato',async()=>{
  const s=setup();await s.checkout();const order=await s.storage.get('order:'+first);
  order.sessionId=null;delete order.checkoutUrl;await s.storage.put('order:'+first,order);
  assert.equal((await(await s.paid()).json()).status,'fulfilled');assert.equal(s.licenses.size,2);
});
test('flag disabilitato o ambiente test non possono usare coordinatore live',async()=>{
  const s=setup();s.env.BANDOVERA_ENV='stripe-test';assert.equal(liveReady(s.env),false);
  assert.equal((await s.checkout()).status,503);
  s.env.BANDOVERA_ENV='production';s.env.LIVE_CHECKOUT_ENABLED='false';assert.equal((await s.checkout()).status,503);
});
test('rotta admin protetta, pagamenti interni non esposti e CORS ristretto',async()=>{
  const s=setup();
  assert.equal((await routeStripeLive(new Request('https://worker/api/admin/stripe/orders'),s.env)).status,401);
  assert.equal((await routeStripeLive(new Request('https://worker/api/admin/stripe/orders',{headers:{authorization:'Bearer FITTIZIA'}}),s.env)).status,200);
  assert.equal(await routeStripeLive(new Request('https://worker/paid'),s.env),null);
  assert.equal((await routeStripeLive(new Request('https://worker/api/checkout/live/create',{method:'OPTIONS',headers:{origin:'https://evil.example'}}),s.env)).status,403);
});
test('webhook richiede firma valida; redirect e callback non firmata non attivano',async()=>{
  const s=setup();await s.checkout();
  const event={id:'evt_testsignature',type:'checkout.session.completed',livemode:true,data:{object:s.session(first)}};
  const body=JSON.stringify(event),time=Math.floor(Date.now()/1000);
  const signature='t='+time+',v1='+createHmac('sha256',s.env.STRIPE_LIVE_WEBHOOK_SECRET).update(time+'.'+body).digest('hex');
  const request=sig=>new Request('https://worker/api/stripe/live/webhook',{method:'POST',body,headers:{'stripe-signature':sig}});
  assert.equal((await routeStripeLive(request('falsa'),s.env)).status,400);assert.equal(s.licenses.size,1);
  assert.equal((await routeStripeLive(request(signature),s.env)).status,200);assert.equal(s.licenses.size,2);
});
