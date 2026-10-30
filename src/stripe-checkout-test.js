/**
 * BANDOVERA — prepara una sessione Stripe Checkout in ambiente TEST.
 * Modulo isolato: non è ancora montato sul Worker pubblico.
 * Necessari: STRIPE_TEST_SECRET_KEY (secret), STRIPE_TEST_PRICE_ID (var)
 * e ORDER_STORE (KV dedicato a richieste, distinto da LICENSES).
 * NON attiva né altera licenze.
 */
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const safe=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&!/[\u0000-\u001f<>]/.test(v)?v.trim():null;

export async function createStripeCheckout(request,env){
 if(request.method!=="POST")return reply({error:"Metodo non consentito"},405);
 if(!env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_")||!env.STRIPE_TEST_PRICE_ID?.startsWith("price_")||!env.ORDER_STORE)return reply({error:"Pagamenti in fase di configurazione"},503);
 const url=new URL(request.url);
 if(request.headers.get("origin")!==url.origin||!String(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))return reply({error:"Richiesta non consentita"},403);
 let body;try{if(Number(request.headers.get("content-length"))>8192)return reply({error:"Richiesta troppo grande"},413);body=await request.json()}catch{return reply({error:"Dati non validi"},400)}
 const organization=safe(body?.organization,180),contactName=safe(body?.contactName,120),email=safe(body?.email,254),region=safe(body?.region,90),entityType=body?.entityType;
 if(!organization||!contactName||!email||!region||!["ODV","APS","Altro ETS"].includes(entityType)||body?.privacyConsent!=="yes"||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:"Compila tutti i campi richiesti"},400);
 // L'accettazione dell'informativa va tracciata lato server nel flusso definitivo.
 const id=crypto.randomUUID().replace(/-/g,"");
 const record={id,organization,contactName,email,region,entityType,privacyConsent:true,status:"pending_payment",createdAt:new Date().toISOString(),mode:"test"};
 await env.ORDER_STORE.put("order:"+id,JSON.stringify(record),{expirationTtl:60*60*24*30});
 const form=new URLSearchParams({
  mode:"payment",
  "line_items[0][price]":env.STRIPE_TEST_PRICE_ID,
  "line_items[0][quantity]":"1",
  "client_reference_id":id,
  "metadata[request_id]":id,
  "customer_email":email,
  "success_url":url.origin+"/acquisto-esito.html?status=success&session_id={CHECKOUT_SESSION_ID}",
  "cancel_url":url.origin+"/acquisto-esito.html?status=cancel"
 });
 let stripeResponse;
 try{
  stripeResponse=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{authorization:"Bearer "+env.STRIPE_TEST_SECRET_KEY,"content-type":"application/x-www-form-urlencoded","Idempotency-Key":"bv-test-"+id},body:form});
 }catch{return reply({error:"Connessione al pagamento momentaneamente non disponibile"},502)}
 let checkout;try{checkout=await stripeResponse.json()}catch{return reply({error:"Risposta dal sistema pagamenti non valida"},502)}
 if(!stripeResponse.ok||checkout.livemode!==false||typeof checkout.url!=="string"||!checkout.url.startsWith("https://checkout.stripe.com/"))return reply({error:"Impossibile avviare il pagamento di prova"},502);
 await env.ORDER_STORE.put("order:"+id,JSON.stringify({...record,stripeSessionId:checkout.id}),{expirationTtl:60*60*24*30});
 return reply({checkoutUrl:checkout.url});
}
