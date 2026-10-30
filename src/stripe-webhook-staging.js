import {verifyStripeEvent,classifyPaidCheckout} from "./stripe-webhook-verification.js";
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

/**
 * Verified events staging only. NO LICENSES writes and NO automatic activation.
 * The webhook returns 503 for paid sessions until licensing and delivery are
 * implemented: Stripe will retry rather than silently treating them as fulfilled.
 * Configure a dedicated TEST Stripe endpoint and secret before enabling.
 */
export async function stripeWebhookStaging(request,env){
 if(request.method!=="POST")return json({error:"Metodo non consentito"},405);
 if(env.BANDOVERA_CHECKOUT_TEST_ENABLED!=="true"||!env.STRIPE_TEST_WEBHOOK_SECRET||!env.ORDER_STORE||!env.STRIPE_ORDERS)return json({error:"Webhook test non configurato"},503);
 let raw;
 try { raw=await request.text(); if(raw.length>256000)return json({error:"Payload troppo grande"},413) }
 catch {return json({error:"Payload non leggibile"},400)}
 let event;
 try {event=await verifyStripeEvent(raw,request.headers.get("Stripe-Signature"),env.STRIPE_TEST_WEBHOOK_SECRET)}
 catch {return json({error:"Firma webhook non valida"},400)}
 const classification=classifyPaidCheckout(event);
 if(classification.action==="ignore"||classification.action==="pending")return json({received:true});
 if(classification.action==="reject")return json({error:classification.reason},400);
 const record=await env.ORDER_STORE.get("order:"+classification.requestId,{type:"json"});
 if(!record||record.mode!=="test"||record.stripeSessionId!==classification.sessionId)return json({error:"Ordine non corrispondente"},409);
 // Persist before acknowledgement; an eventual fulfilment worker must issue the licence.
 try {
   const stub=env.STRIPE_ORDERS.get(env.STRIPE_ORDERS.idFromName(classification.requestId));
   const saved=await stub.fetch("https://stripe-ledger.internal/paid",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orderId:classification.requestId,sessionId:classification.sessionId,eventId:classification.eventId,amount:classification.amount,currency:classification.currency})});
   const result=await saved.json();
   if(!saved.ok)return json({error:"Ordine non registrato",code:result.status||result.error||"error"},503);
   return json({error:"Pagamento registrato, attivazione licenza da completare",orderStatus:result.status,licenseActivated:false},503);
 } catch {return json({error:"Registro ordini temporaneamente non disponibile"},503)}

}
