import {StripeLiveFulfillment} from './stripe-live-fulfillment.js';
import {buildLiveOrder} from './stripe-live-order.js';
import {buildLiveLicence} from './stripe-live-licence.js';
import {accessHash} from './client-access.js';

export const LIVE_ORIGIN = 'https://radar-bandi-online.presidente-56d.workers.dev';
export const liveJSON = (body, status=200) => Response.json(body, {status, headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
export function liveReady(env) {
  return env.BANDOVERA_ENV === 'production' && env.LIVE_FULFILLMENT_ENABLED === 'true' &&
    env.LIVE_LICENSES_ID === '352020f5c8294218ac658bfb3e96161c' && !!env.LICENSES &&
    /^[sr]k_live_/.test(env.STRIPE_LIVE_SECRET_KEY || '') &&
    env.STRIPE_LIVE_PRICE_ID === 'price_1UWHRjDY6SOGDjJ1Exlw0SHk' &&
    !!env.STRIPE_LIVE_WEBHOOK_SECRET && env.SMTP_VERIFIED === 'true' &&
    env.SMTP_HOST === 'authsmtp.securemail.pro' && String(env.SMTP_PORT) === '465' &&
    env.SMTP_FROM === 'info@bandovera.it' && !!env.SMTP_USER && !!env.SMTP_PASSWORD;
}
export async function readLiveJSON(request, max=65536) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('Corpo mancante');
  const chunks=[]; let length=0;
  try {
    for (;;) {
      const {value,done}=await reader.read(); if(done) break;
      length+=value.byteLength;
      if(length>max) {await reader.cancel(); throw Error('Richiesta troppo grande');}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(length); let pos=0;
  for(const chunk of chunks) {bytes.set(chunk,pos);pos+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
const validId = id => typeof id==='string' && /^[a-f0-9]{32}$/.test(id);
const summary = o => ({id:o.id, organization:o.organization, email:o.email, status:o.status,
  createdAt:o.createdAt, updatedAt:o.updatedAt, sessionId:o.sessionId,
  license:o.license?.license || null, expiresAt:o.license?.expiresAt || null,
  customerEmail:o.deliveries?.customer?.state || 'not_started',
  adminEmail:o.deliveries?.admin?.state || 'not_started'});

// One production-only Durable Object serializes allocation, order updates and delivery.
// The test Worker retains its own coordinator, secrets and licence namespace.
export class StripeLiveCoordinator extends StripeLiveFulfillment {
  fetch(request) {
    const result=this.queue.then(()=>this.handle(request));
    this.queue=result.catch(()=>{}); return result;
  }
  alarm() {
    const result=this.queue.then(()=>this.recover());
    this.queue=result.catch(()=>{}); return result;
  }
  async stripe(path, form, id) {
    const response=await fetch('https://api.stripe.com/v1/'+path, {
      method:form?'POST':'GET', signal:AbortSignal.timeout(15000),
      headers:{authorization:'Bearer '+this.env.STRIPE_LIVE_SECRET_KEY,
        ...(form?{'content-type':'application/x-www-form-urlencoded','Idempotency-Key':'bandovera-live-'+id}:{})},
      body:form
    });
    if(!response.ok) throw Error('Stripe non disponibile');
    return response.json();
  }
  async email(message) {
    const {sendContactSMTP}=await import('./contact-mailer.js');
    return sendContactSMTP(message,this.env);
  }
  async save(order) {
    order.updatedAt=new Date().toISOString();
    await this.state.storage.put('order:'+order.id,order);
  }
  async handle(request) {
    if(!liveReady(this.env)) return liveJSON({error:'Pagamenti non ancora disponibili'},503);
    const path=new URL(request.url).pathname;
    if(path==='/list' && request.method==='GET') {
      const orders=await this.state.storage.list({prefix:'order:',limit:500,reverse:true});
      return liveJSON({orders:[...orders.values()].map(summary),limit:500});
    }
    if(request.method!=='POST') return liveJSON({error:'Metodo non consentito'},405);
    let p; try {p=await readLiveJSON(request);} catch {return liveJSON({error:'Dati non validi'},400);}
    try {
      if(path==='/checkout') return await this.checkout(p);
      if(path==='/paid') return await this.paid(p);
      return liveJSON({error:'Non trovato'},404);
    } catch {
      return liveJSON({error:'Elaborazione temporaneamente non disponibile. Conserva il riferimento e riprova.'},503);
    }
  }
  async checkout(p) {
    if(this.env.LIVE_CHECKOUT_ENABLED!=='true') return liveJSON({error:'Acquisti non ancora disponibili'},503);
    if(!validId(p?.id)) return liveJSON({error:'Riferimento non valido'},400);
    let candidate;
    try {candidate=buildLiveOrder({id:p.id,sheet:p.sheet});}
    catch {return liveJSON({error:'Completa tutti i campi della scheda e i consensi richiesti'},400);}
    const digest=await accessHash(JSON.stringify(Object.fromEntries(Object.entries(candidate.sheet).sort())));
    let order=await this.state.storage.get('order:'+p.id);
    if(order && order.digest!==digest) return liveJSON({error:'Riferimento già utilizzato con una scheda diversa'},409);
    if(order?.checkoutUrl) return liveJSON({id:order.id,checkoutUrl:order.checkoutUrl});
    if(order && Date.now()-Date.parse(order.createdAt)>23*3600000) {
      // Stripe retains idempotency keys for at least 24 hours. Never recreate an
      // indeterminate checkout after that window using the same internal order.
      return liveJSON({error:'Ordine da verificare. Contatta info@bandovera.it indicando il riferimento.'},409);
    }
    const price=await this.stripe('prices/'+this.env.STRIPE_LIVE_PRICE_ID);
    if(price.id!==this.env.STRIPE_LIVE_PRICE_ID || price.livemode!==true || price.active!==true ||
      price.currency!=='eur' || price.unit_amount!==1990 || price.recurring) throw Error('Prezzo non valido');
    if(!order) {order={...candidate,digest}; await this.save(order);}
    const form=new URLSearchParams({mode:'payment','line_items[0][price]':price.id,
      'line_items[0][quantity]':'1', client_reference_id:order.id,'metadata[request_id]':order.id,
      customer_email:order.email,success_url:LIVE_ORIGIN+'/acquisto-esito.html?status=success',
      cancel_url:'https://bandovera.it/attiva.html?pagamento=annullato'});
    const session=await this.stripe('checkout/sessions',form,order.id);
    if(session.livemode!==true || !/^cs_live_[a-zA-Z0-9_]+$/.test(session.id||'') ||
      typeof session.url!=='string' || new URL(session.url).origin!=='https://checkout.stripe.com') throw Error('Checkout non valido');
    order.sessionId=session.id; order.checkoutUrl=session.url; await this.save(order);
    return liveJSON({id:order.id,checkoutUrl:session.url});
  }
  async paid(p) {
    if(!validId(p?.orderId) || !/^cs_live_[a-zA-Z0-9_]+$/.test(p.sessionId||'')) return liveJSON({error:'Ordine non valido'},400);
    const order=await this.state.storage.get('order:'+p.orderId);
    if(!order || order.sessionId && order.sessionId!==p.sessionId) return liveJSON({error:'Ordine non corrispondente'},409);
    // Recover a session whose create response was interrupted after Stripe saved it.
    const session=await this.verifyLivePayment({...order,sessionId:p.sessionId});
    order.sessionId=session.id;
    if(!order.license) {
      const code=await this.reserveCodeInternal(order.id);
      const token=crypto.randomUUID()+crypto.randomUUID();
      order.license={...buildLiveLicence({order,session,code,now:new Date().toISOString()}),
        accessToken:token,accessTokenHash:await accessHash(token)};
      order.deliveries={customer:{id:'contact-'+crypto.randomUUID(),state:'not_started',attempts:0},
        admin:{id:'contact-'+crypto.randomUUID(),state:'not_started',attempts:0}};
      order.status='paid';
      // Commit the exact licence, expiry and private token before any KV/SMTP write.
      await this.save(order);
    }
    await this.state.storage.setAlarm(Date.now()+60000);
    await this.state.storage.put('recover:'+order.id,true);
    await this.activateAndDeliver(order);
    return liveJSON({received:true,...summary(order)});
  }
  async activateAndDeliver(order) {
    const key='license:'+order.license.license;
    const existing=await this.env.LICENSES.get(key,{type:'json'});
    if(existing && (existing.payment?.mode!=='live' || existing.payment?.orderId!==order.id ||
      existing.accessTokenHash!==order.license.accessTokenHash)) {
      order.status='license_conflict'; await this.save(order);
      await this.state.storage.delete('recover:'+order.id); return;
    }
    // A repeated webhook never resets an existing expiry, profile or admin revocation.
    if(!existing && order.activatedAt) {
      order.status='license_missing'; await this.save(order);
      await this.state.storage.delete('recover:'+order.id); return;
    }
    if(!existing) await this.env.LICENSES.put(key,JSON.stringify(order.license));
    if(existing?.active===false) {
      order.status='license_revoked'; await this.save(order);
      await this.state.storage.delete('recover:'+order.id); return;
    }
    order.activatedAt ||= new Date().toISOString();
    order.status='license_active'; await this.save(order);
    for(const kind of ['customer','admin']) {
      const delivery=order.deliveries[kind];
      if(delivery.state==='sending') {delivery.state='uncertain'; await this.save(order);}
      if(['accepted','uncertain'].includes(delivery.state) || delivery.attempts>=3) continue;
      delivery.state='sending'; delivery.attempts++; await this.save(order);
      const client=kind==='customer';
      const privateUrl=LIVE_ORIGIN+'/'+order.license.license+'?access='+encodeURIComponent(order.license.accessToken);
      let result;
      try {
        result=await this.email({id:delivery.id,to:client?order.email:'info@bandovera.it',replyTo:'info@bandovera.it',
          subject:client?'BANDOVERA - la tua licenza è attiva':'BANDOVERA - pagamento ricevuto e licenza attiva',
          body:'Ente: '+order.organization+'\nLicenza: '+order.license.license+'\nScadenza: '+order.license.expiresAt+
            '\nPagamento: 19,90 EUR, una tantum\nOrdine: '+order.id+'\n'+
            (client?'\nIl tuo collegamento personale (conservalo e non condividerlo):\n'+privateUrl:
              '\nCliente: '+order.email+'\nLa licenza è disponibile nella dashboard amministrativa esistente:\n'+LIVE_ORIGIN+'/admin/')});
      } catch {result={state:'failed'};}
      delivery.state=['accepted','failed','uncertain'].includes(result?.state)?result.state:'uncertain';
      await this.save(order);
    }
    const deliveries=Object.values(order.deliveries);
    order.status=deliveries.every(d=>d.state==='accepted')?'fulfilled':
      deliveries.some(d=>d.state==='uncertain' || d.attempts>=3 && d.state!=='accepted')?'email_review_required':'email_retry_pending';
    await this.save(order);
    if(order.status!=='email_retry_pending') await this.state.storage.delete('recover:'+order.id);
  }
  async recover() {
    if(!liveReady(this.env)) {await this.state.storage.setAlarm(Date.now()+300000);return;}
    const jobs=await this.state.storage.list({prefix:'recover:',limit:1});
    if(!jobs.size) return;
    // Schedule before any external operation, so a process interruption remains recoverable.
    await this.state.storage.setAlarm(Date.now()+300000);
    for(const key of jobs.keys()) {
      const order=await this.state.storage.get('order:'+key.slice('recover:'.length));
      if(order?.license) await this.activateAndDeliver(order);
      else await this.state.storage.delete(key);
    }
  }
}
