// Explicitly isolated sandbox. Never imported by the production entry point.
import {validateSheet,mapSheet} from './stripe-request-schema.js';
import {accessHash} from './client-access.js';
import {expiryAfterMonths} from './stripe-licence-preparation.js';
import {sendContactSMTP} from './contact-mailer.js';
export const json=(p,status=200)=>Response.json(p,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
export function isolated(env){return env.BANDOVERA_ENV==='stripe-test'&&env.TEST_LICENSES_ID==='e16f2bc4c0664357aafadb07c5594e9b'&&env.TEST_ORDERS_ID==='cdc6ef0dcd3940e99ce214a739a4948f'&&env.TEST_ORIGIN==='https://bandovera-stripe-test.presidente-56d.workers.dev'&&!!env.LICENSES&&!!env.ORDER_STORE;}
export async function boundedJSON(request,max=65536){
 const reader=request.body?.getReader();if(!reader)throw Error('Corpo mancante');let n=0,parts=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>max){await reader.cancel();throw Error('Dati troppo grandi');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(n);let p=0;for(const v of parts){bytes.set(v,p);p+=v.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
const validId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const summary=o=>({id:o.id,organization:o.sheet.nome_associazione,status:o.status,license:o.license?.license||null,expiresAt:o.license?.expiresAt||null,emailState:o.emailState||null,sessionId:o.sessionId||null});

export class StripeTestFulfillment {
 constructor(state,env){this.state=state;this.env=env;this.queue=Promise.resolve();}
 fetch(request){const result=this.queue.then(()=>this.handle(request));this.queue=result.catch(()=>{});return result;}
 async stripe(path,form,id){
  const response=await fetch('https://api.stripe.com/v1/'+path,{method:form?'POST':'GET',headers:{authorization:'Bearer '+this.env.STRIPE_TEST_SECRET_KEY,...(form?{'content-type':'application/x-www-form-urlencoded','Idempotency-Key':'bandovera-test-'+id}:{})},body:form});
  if(!response.ok)throw Error('Stripe non disponibile');return response.json();
 }
 async email(message){return sendContactSMTP(message,this.env);}
 async save(o){await this.state.storage.put('order:'+o.id,o);await this.env.ORDER_STORE.put('order:'+o.id,JSON.stringify(summary(o)));}
 async handle(request){
  if(!isolated(this.env))return json({error:'Ambiente non isolato'},503);
  const path=new URL(request.url).pathname;
  if(path==='/list'){
   const orders=await this.state.storage.list({prefix:'order:'});return json({orders:[...orders.values()].map(summary)});
  }
  if(request.method!=='POST')return json({error:'Metodo non consentito'},405);
  let p;try{p=await boundedJSON(request);}catch{return json({error:'Dati non validi'},400);}
  try{
   if(path==='/checkout')return await this.checkout(p);
   if(path==='/paid')return await this.paid(p);
   return json({error:'Non trovato'},404);
  }catch{return json({error:'Elaborazione non completata; riprova con lo stesso riferimento'},503);}
 }
 async checkout(p){
  if(!validId(p.id)||!this.env.STRIPE_TEST_SECRET_KEY?.startsWith('sk_test_')||!this.env.STRIPE_TEST_PRICE_ID?.startsWith('price_'))return json({error:'Checkout test non configurato'},503);
  let sheet;try{sheet=validateSheet(p.sheet);}catch(e){return json({error:e.message},400);}
  // Sandbox mail can only reach the recipient expressly authorised for this run.
  if(sheet.email_referente!==this.env.TEST_EMAIL_RECIPIENT)return json({error:'Usa il destinatario autorizzato per il collaudo'},400);
  const digest=await accessHash(JSON.stringify(Object.fromEntries(Object.entries(sheet).sort())));
  let order=await this.state.storage.get('order:'+p.id);
  if(order&&order.digest!==digest)return json({error:'Riferimento già usato con dati diversi'},409);
  if(order?.checkoutUrl)return json({id:order.id,checkoutUrl:order.checkoutUrl});
  if(!order){
   const dayKey='daily:'+new Date().toISOString().slice(0,10),count=(await this.state.storage.get(dayKey))||0;
   if(count>=5)return json({error:'Limite giornaliero del collaudo raggiunto'},429);
   order={id:p.id,sheet,digest,status:'pending_payment',createdAt:new Date().toISOString(),emailState:'not_started'};
   await this.state.storage.transaction(async tx=>{await tx.put(dayKey,count+1);await tx.put('order:'+p.id,order);});await this.save(order);
  }
  const price=await this.stripe('prices/'+encodeURIComponent(this.env.STRIPE_TEST_PRICE_ID));
  if(price.id!==this.env.STRIPE_TEST_PRICE_ID||price.livemode!==false||price.active!==true||price.unit_amount!==1990||price.currency!=='eur'||price.recurring)return json({error:'Prezzo di test non valido'},503);
  const form=new URLSearchParams({mode:'payment','line_items[0][price]':price.id,'line_items[0][quantity]':'1',client_reference_id:p.id,'metadata[request_id]':p.id,customer_email:sheet.email_referente,success_url:this.env.TEST_ORIGIN+'/acquisto-esito.html?status=success',cancel_url:this.env.TEST_ORIGIN+'/acquisto-esito.html?status=cancel'});
  const session=await this.stripe('checkout/sessions',form,p.id);
  if(session.livemode!==false||!session.id?.startsWith('cs_test_')||!session.url?.startsWith('https://checkout.stripe.com/'))throw Error('Sessione non valida');
  order.sessionId=session.id;order.checkoutUrl=session.url;await this.save(order);return json({id:order.id,checkoutUrl:session.url});
 }
 async paid(p){
  if(!validId(p.requestId)||!p.sessionId?.startsWith('cs_test_')||p.amount!==1990||p.currency!=='eur')return json({error:'Pagamento non valido'},400);
  let order=await this.state.storage.get('order:'+p.requestId);
  if(!order||order.sessionId!==p.sessionId)return json({error:'Ordine non corrispondente'},409);
  // Independently retrieve payment state; a browser redirect never activates access.
  const session=await this.stripe('checkout/sessions/'+encodeURIComponent(p.sessionId));
  if(session.id!==order.sessionId||session.livemode!==false||session.mode!=='payment'||session.payment_status!=='paid'||session.amount_total!==1990||session.currency!=='eur'||session.metadata?.request_id!==order.id||session.client_reference_id!==order.id)return json({error:'Incasso non verificato'},409);
  if(!order.license){
   let next=(await this.state.storage.get('sequence'))||9000000;let code;
   do{code='RB-'+(++next);}while(await this.env.LICENSES.get('license:'+code));
   const activatedAt=new Date().toISOString(),token=crypto.randomUUID()+crypto.randomUUID();
   order.license={license:code,name:order.sheet.nome_associazione,active:true,price:19.9,expiresAt:expiryAfterMonths(activatedAt),createdAt:activatedAt,updatedAt:activatedAt,accessToken:token,accessTokenHash:await accessHash(token),profile:{...mapSheet(order.sheet),license:code,active:true,durationMonths:12},payment:{provider:'stripe',mode:'test',orderId:order.id,sessionId:order.sessionId,amount:1990,currency:'eur'}};
   order.license.profile.expiresAt=order.license.expiresAt;order.mailId='contact-'+crypto.randomUUID();order.status='paid';
   await this.state.storage.transaction(async tx=>{await tx.put('sequence',next);await tx.put('order:'+order.id,order);});
  }
  const key='license:'+order.license.license,existing=await this.env.LICENSES.get(key,{type:'json'});
  if(existing&&(existing.payment?.orderId!==order.id||existing.accessTokenHash!==order.license.accessTokenHash))return json({error:'Conflitto licenza; intervento necessario'},409);
  if(!existing)await this.env.LICENSES.put(key,JSON.stringify(order.license));
  if(order.emailState==='accepted')return json({received:true,...summary(order)});
  // SMTP is not transactional: never resend automatically after ambiguous acceptance.
  if(order.emailState==='sending'){order.emailState='uncertain';await this.save(order);}
  if(order.emailState==='uncertain'||(order.emailAttempts||0)>=3)return json({received:true,reviewRequired:true,...summary(order)});
  order.emailState='sending';order.emailAttempts=(order.emailAttempts||0)+1;order.status='license_active';await this.save(order);
  let result;
  try{result=await this.email({to:this.env.TEST_EMAIL_RECIPIENT,replyTo:'info@bandovera.it',id:order.mailId,subject:'COLLAUDO BANDOVERA - licenza di prova',body:'SOLO TEST - nessun pagamento reale.\n\nEnte: '+order.sheet.nome_associazione+'\nLicenza: '+order.license.license+'\nScadenza: '+order.license.expiresAt+'\nAccesso privato alla dashboard di test:\n'+this.env.TEST_ORIGIN+'/'+order.license.license+'?access='+encodeURIComponent(order.license.accessToken)+'\n\nRiferimento ordine: '+order.id});}catch{result={state:'failed'};}
  order.emailState=result.state;order.status=result.state==='accepted'?'fulfilled':'email_'+result.state;await this.save(order);
  return json({received:result.state!=='failed',...summary(order)},result.state==='failed'?503:200);
 }
}
