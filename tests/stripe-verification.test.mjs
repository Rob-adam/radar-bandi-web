// Eseguire: node --test tests/stripe-verification.test.mjs (Node 20+)
// Test indipendenti dalla rete e senza credenziali Stripe.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const source = await readFile(new URL('../src/stripe-webhook-verification.js',import.meta.url),'utf8');
const {verifyStripeEvent,classifyPaidCheckout}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const secret='whsec_'+ 'test_key_for_local_tests_only';
const now=1782840000;
const session={object:'checkout.session',id:'cs_test_example',mode:'payment',payment_status:'paid',amount_total:1990,currency:'eur',livemode:false,client_reference_id:'order_12345678'};
const event={id:'evt_test_123',livemode:false,type:'checkout.session.completed',data:{object:session}};
async function signed(body,t=now) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const hash=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+body));
 const hex=Buffer.from(hash).toString('hex');
 return 't='+t+',v1='+hex;
}
test('firma autentica: evento accettato',async()=>{
 const body=JSON.stringify(event);
 assert.deepEqual(await verifyStripeEvent(body,await signed(body),secret,now),event);
});
test('corpo alterato: firma rifiutata',async()=>{
 const body=JSON.stringify(event);
 await assert.rejects(verifyStripeEvent(body+' ',await signed(body),secret,now),/Firma Stripe non valida/);
});
test('timestamp scaduto: evento rifiutato',async()=>{
 const body=JSON.stringify(event);
 await assert.rejects(verifyStripeEvent(body,await signed(body,now-301),secret,now),/scaduta/);
});
test('Checkout pagato sandbox valido: riconciliazione',()=>{
 assert.deepEqual(classifyPaidCheckout(event),{action:'reconcile',eventId:event.id,sessionId:session.id,requestId:session.client_reference_id,amount:1990,currency:'eur'});
});
test('Checkout non pagato: nessuna attivazione',()=>{
 assert.equal(classifyPaidCheckout({...event,data:{object:{...session,payment_status:'unpaid'}}}).action,'pending');
});
test('importo diverso: pagamento rifiutato',()=>{
 assert.deepEqual(classifyPaidCheckout({...event,data:{object:{...session,amount_total:2990}}}),{action:'reject',reason:'importo_valuta'});
});
test('evento live in ambiente test: pagamento rifiutato',()=>{
 assert.deepEqual(classifyPaidCheckout({...event,livemode:true}),{action:'reject',reason:'non_sandbox'});
});
test('richiesta cliente mancante: pagamento rifiutato',()=>{
 assert.deepEqual(classifyPaidCheckout({...event,data:{object:{...session,client_reference_id:null}}}),{action:'reject',reason:'richiesta_assente'});
});
test('evento non pertinente: ignorato',()=>{
 assert.equal(classifyPaidCheckout({...event,type:'customer.created'}).action,'ignore');
});
