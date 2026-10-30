// Dedicated test entry point: the production wrangler.jsonc is deliberately unchanged.
import dashboard from './dashboard-wrapper.js';
import {isolated,json,boundedJSON} from './stripe-test-fulfillment.js';
import {verifyStripeEvent,classifyPaidCheckout} from './stripe-webhook-verification.js';
export {ContactDispatcher,StripeOrderLedger} from './dashboard-wrapper.js';
export {StripeTestFulfillment} from './stripe-test-fulfillment.js';
const admin=(req,env)=>!!env.ADMIN_API_KEY&&req.headers.get('authorization')==='Bearer '+env.ADMIN_API_KEY;
const coordinator=env=>env.TEST_FULFILLMENT.get(env.TEST_FULFILLMENT.idFromName('isolated-test-registry-v1'));
const forward=(env,path,body)=>coordinator(env).fetch('https://isolated.internal'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
export default {
 async fetch(req,env,ctx){
  if(!isolated(env)||new URL(req.url).origin!==env.TEST_ORIGIN)return json({error:'Ambiente di test non isolato'},503);
  const path=new URL(req.url).pathname;
  if(path==='/api/checkout/create'){
   if(env.TEST_CHECKOUT_ENABLED!=='true')return json({error:'Checkout di test disattivato'},503);
   if(req.method!=='POST')return json({error:'Metodo non consentito'},405);
   if(req.headers.get('origin')!==env.TEST_ORIGIN||!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'Origine non consentita'},403);
   let p;try{p=await boundedJSON(req);}catch{return json({error:'Richiesta non valida'},400);}
   return forward(env,'/checkout',p);
  }
  if(path==='/api/stripe/webhook'){
   if(env.TEST_CHECKOUT_ENABLED!=='true'||req.method!=='POST')return json({error:'Webhook di test non attivo'},503);
   let event;
   try{
    // Bounded raw bytes, with no JSON reserialization before signature verification.
    const reader=req.body.getReader();let bytes=0,raw='';const decoder=new TextDecoder();
    try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>256000){await reader.cancel();return json({error:'Evento troppo grande'},413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
    event=await verifyStripeEvent(raw,req.headers.get('stripe-signature'),env.STRIPE_TEST_WEBHOOK_SECRET);
   }catch{return json({error:'Firma non valida'},400);}
   const paid=classifyPaidCheckout(event);
   if(paid.action==='ignore'||paid.action==='pending')return json({received:true});
   if(paid.action!=='reconcile')return json({error:'Pagamento di prova non valido'},400);
   return forward(env,'/paid',paid);
  }
  if(path==='/api/admin/stripe-orders'){
   if(!admin(req,env))return json({error:'Accesso riservato'},401);
   return forward(env,'/list');
  }
  // The coordinator is the only licence writer in this isolated test deployment.
  if(path==='/api/admin/license'&&req.method!=='GET')return json({error:'Scrittura manuale disattivata nel collaudo Stripe'},403);
  const response=await dashboard.fetch(req,env,ctx);
  if(path.startsWith('/admin')&&response.headers.get('content-type')?.includes('text/html')){
   // Extend the existing administration page only in the isolated deployment.
   const block=`<section class="card" style="margin:28px"><h2>Ordini Stripe di collaudo</h2><p>Solo test. Le licenze reali non sono collegate a questo ambiente.</p><button class="btn" id="test-orders-load">Aggiorna ordini di prova</button><pre id="test-orders" style="white-space:pre-wrap" role="status"></pre></section><script>document.getElementById('test-orders-load').onclick=async()=>{const key=sessionStorage.getItem('bandovera_admin_api_key');const out=document.getElementById('test-orders');if(!key){out.textContent='Accedi prima alla gestione licenze con la chiave di questo ambiente di test.';return;}try{const r=await fetch('/api/admin/stripe-orders',{headers:{authorization:'Bearer '+key}});if(!r.ok)throw Error('Accesso non riuscito');out.textContent=JSON.stringify((await r.json()).orders,null,2);}catch(e){out.textContent=e.message;}};</script>`;
   const headers=new Headers(response.headers);headers.delete('content-length');return new Response((await response.text()).replace('</body>',block+'</body>'),{status:response.status,headers});
  }
  return response;
 }
};
