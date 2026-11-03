import {liveJSON,liveReady,readLiveJSON} from './stripe-live-coordinator.js';
import {verifyStripeEvent,classifyLivePaidCheckout} from './stripe-live-verification.js';
import {accessHash} from './client-access.js';

const checkoutOrigins=new Set(['https://bandovera.it','https://www.bandovera.it']);
const stub=env=>env.LIVE_COORDINATOR.get(env.LIVE_COORDINATOR.idFromName('bandovera-live-registry-v1'));
const internal=(env,path,data)=>stub(env).fetch('https://live.internal'+path,{
  method:data?'POST':'GET',headers:{'content-type':'application/json'},body:data?JSON.stringify(data):undefined});

async function webhook(request,env) {
  if(request.method!=='POST') return liveJSON({error:'Metodo non consentito'},405);
  // Preserve the exact signed bytes and bound the stream before parsing it.
  let raw;
  try {
    const reader=request.body?.getReader(); if(!reader) throw Error();
    const chunks=[];let n=0;
    try {
      for(;;) {const {done,value}=await reader.read();if(done)break;
        n+=value.length;if(n>256000){await reader.cancel();throw Error();}chunks.push(value);}
    } finally {reader.releaseLock();}
    const bytes=new Uint8Array(n);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    raw=new TextDecoder().decode(bytes);
  } catch {return liveJSON({error:'Payload non valido'},400);}
  let event;
  try {event=await verifyStripeEvent(raw,request.headers.get('stripe-signature'),env.STRIPE_LIVE_WEBHOOK_SECRET);}
  catch(error) {
    const allowed=new Set(['webhook_body_invalid','webhook_secret_format','webhook_signature_header','webhook_signature_timestamp','webhook_signature_mismatch']);
    const diagnostic=allowed.has(error?.code)?error.code:'webhook_verification_internal';
    return liveJSON({error:'Firma non valida',diagnostic},400);
  }
  const result=classifyLivePaidCheckout(event);
  if(['ignore','pending'].includes(result.action)) return liveJSON({received:true});
  if(result.action==='reject') return liveJSON({error:'Evento non valido'},400);
  return internal(env,'/paid',result);
}

/** Public routing only: the coordinator's /paid and /list paths are never public. */
export async function routeStripeLive(request,env) {
  const url=new URL(request.url),path=url.pathname;
  if(!['/api/stripe/live/webhook','/api/checkout/live/create','/api/checkout/live/draft-status','/api/admin/stripe/orders'].includes(path))return null;
  if(!liveReady(env)||!env.LIVE_COORDINATOR)return liveJSON({error:'Pagamenti non ancora disponibili'},503);
  try {
    if(path==='/api/stripe/live/webhook')return await webhook(request,env);
    if(path==='/api/admin/stripe/orders'){
      if(request.method!=='GET')return liveJSON({error:'Metodo non consentito'},405);
      const supplied=request.headers.get('authorization')||'';
      if(!env.ADMIN_API_KEY || await accessHash(supplied)!==await accessHash('Bearer '+env.ADMIN_API_KEY))return liveJSON({error:'Accesso non consentito'},401);
      return await internal(env,'/list');
    }
    const origin=request.headers.get('origin');
    if(!checkoutOrigins.has(origin))return liveJSON({error:'Origine non consentita'},403);
    const cors={'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Content-Type'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    let response;
    if(path==='/api/checkout/live/draft-status'){
      if(request.method!=='POST')response=liveJSON({error:'Metodo non consentito'},405);
      else if(!request.headers.get('content-type')?.startsWith('application/json'))response=liveJSON({error:'Formato non valido'},415);
      else {let body;try{body=await readLiveJSON(request,1024);}catch{return liveJSON({error:'Dati non validi'},400);}response=await internal(env,'/draft-status',body);}
    }
    else if(env.LIVE_CHECKOUT_ENABLED!=='true')response=liveJSON({error:'Acquisti non ancora disponibili'},503);
    else if(request.method!=='POST')response=liveJSON({error:'Metodo non consentito'},405);
    else if(!request.headers.get('content-type')?.startsWith('application/json'))response=liveJSON({error:'Formato non valido'},415);
    else {
      let body;try{body=await readLiveJSON(request);}catch{return new Response(JSON.stringify({error:'Dati non validi'}),{status:400,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});}
      if(typeof body?.turnstileToken!=='string'||body.turnstileToken.length>2048||!env.TURNSTILE_SECRET)response=liveJSON({error:'Completa la verifica di sicurezza'},400);
      else {
        const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
          method:'POST',signal:AbortSignal.timeout(10000),
          body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:body.turnstileToken})});
        const checked=await verification.json();
        if(!verification.ok||checked.success!==true||checked.hostname!==new URL(origin).hostname||checked.action!=='bandovera_checkout')response=liveJSON({error:'Verifica di sicurezza scaduta. Ripeti la verifica.'},400);
        else response=await internal(env,'/checkout',{id:body.id,sheet:body.sheet,origin});
      }
    }
    const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);
    return new Response(response.body,{status:response.status,headers});
  } catch {return liveJSON({error:'Servizio temporaneamente non disponibile'},503);}
}
