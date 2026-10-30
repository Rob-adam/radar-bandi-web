import {verifyStripeEvent,classifyPaidCheckout} from "./stripe-webhook-verification.js";
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

/**
 * Verified events staging only. NO LICENSES writes and NO automatic activation.
 * The webhook returns 503 for paid sessions until a durable transactional order
 * processor is installed: Stripe will retry instead of silently losing the event.
 * Configure a dedicated TEST Stripe endpoint and secret before enabling.
 */
export async function stripeWebhookStaging(request,env){
 if(request.method!=="POST")return json({error:"Metodo non consentito"},405);
 if(env.BANDOVERA_CHECKOUT_TEST_ENABLED!=="true"||!env.STRIPE_TEST_WEBHOOK_SECRET||!env.ORDER_STORE)return json({error:"Webhook test non configurato"},503);
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
 // Never acknowledge paid events without the order processor being ready.
 // In this staging phase they are deliberately retried by Stripe.
 return json({error:"Attivazione automatica non ancora configurata: riprovare"},503);
}
