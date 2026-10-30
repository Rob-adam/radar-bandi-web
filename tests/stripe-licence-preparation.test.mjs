import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../src/stripe-licence-preparation.js',import.meta.url),'utf8');
const {expiryAfterMonths,buildSandboxLicence}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const order={id:'order_12345678',mode:'test',organization:'Associazione Prova',email:'cliente@example.org',entityType:'APS',region:'Lombardia',stripeSessionId:'cs_test_123'};
const paid={orderId:order.id,sessionId:order.stripeSessionId,amount:1990,currency:'eur',fulfillment:'not_started'};
test('scadenza a dodici mesi',()=>assert.equal(expiryAfterMonths('2026-10-30T12:00:00Z'),'2027-10-30'));
test('29 febbraio viene adattato al 28 febbraio',()=>assert.equal(expiryAfterMonths('2024-02-29T12:00:00Z'),'2025-02-28'));
test('crea dati licenza corretti senza modificare ordine',()=>{
 const before=JSON.stringify({order,paid});
 const result=buildSandboxLicence({order,paid,code:'RB-9999',now:'2026-10-30T12:00:00Z'});
 assert.equal(result.expiresAt,'2027-10-30');assert.equal(result.payment.amount,1990);
 assert.equal(JSON.stringify({order,paid}),before);
});
test('rifiuta pagamento discordante',()=>assert.throws(()=>buildSandboxLicence({order,paid:{...paid,amount:1000},code:'RB-9999',now:'2026-10-30T12:00:00Z'})));
test('rifiuta ordine non test',()=>assert.throws(()=>buildSandboxLicence({order:{...order,mode:'live'},paid,code:'RB-9999',now:'2026-10-30T12:00:00Z'})));
test('rifiuta codice licenza non valido',()=>assert.throws(()=>buildSandboxLicence({order,paid,code:'RB-0003-dup',now:'2026-10-30T12:00:00Z'})));
