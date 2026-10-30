import {hasAccess} from './client-access.js';

const DAY=86400000;
const destinations={support:'supporto@bandovera.it',assistance:'assistenza@bandovera.it',info:'info@bandovera.it'};
const labels={support:'supporto alla candidatura',assistance:'assistenza tecnica',info:'informazioni generali'};
const emailOK=v=>typeof v==='string'&&v.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(v);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
class ContactError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const clean=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)||required&&!v.trim())throw new ContactError('Controlla i campi della richiesta.');return v.trim();};
export function validateContact(body){
 if(!body||Array.isArray(body)||typeof body!=='object')throw new ContactError('Richiesta non valida.');
 const {kind,license,id}=body;
 if(!Object.hasOwn(destinations,kind)||!/^RB-\d{4,}$/.test(license)||!/^[-a-f0-9]{36}$/.test(id))throw new ContactError('Richiesta non valida.');
 const name=clean(body.name,160,true),email=clean(body.email,254,true),phone=clean(body.phone||'',60),message=clean(body.message,4000,true),bando=clean(body.bando||'',500);
 if(!emailOK(email)||/[\r\n]/.test(name+phone+bando))throw new ContactError('Controlla nome, email e riferimenti.');
 return {kind,license,id,name,email,phone,message,bando};
}
async function bodyJSON(req){
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new ContactError('Formato non valido.',415);
 const reader=req.body?.getReader();if(!reader)throw new ContactError('Richiesta vuota.');let size=0,parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24576){await reader.cancel();throw new ContactError('Messaggio troppo lungo.',413);}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ContactError('Formato non valido.');}
}
export function contactReady(env){return env.CONTACTS_ENABLED==='true'&&env.SMTP_VERIFIED==='true'&&env.SMTP_HOST==='authsmtp.securemail.pro'&&String(env.SMTP_PORT)==='465'&&env.SMTP_FROM==='info@bandovera.it'&&!!env.SMTP_USER&&!!env.SMTP_PASSWORD&&!!env.CONTACTS;}
export async function routeContact(request,env){
 const url=new URL(request.url);if(url.pathname!=='/api/contact')return null;
 try{
  if(request.method!=='POST')throw new ContactError('Metodo non consentito.',405);
  if(request.headers.get('origin')!==url.origin)throw new ContactError('Origine non consentita.',403);
  if(!contactReady(env)||!env.LICENSES)throw new ContactError('Invio momentaneamente non disponibile. Scrivi alla casella indicata nel modulo.',503);
  const contact=validateContact(await bodyJSON(request));
  const rec=await env.LICENSES.get('license:'+contact.license,{type:'json'});
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(!rec||rec.active===false||rec.expiresAt&&rec.expiresAt<today||!await hasAccess(request,contact.license,rec))throw new ContactError('Apri la tua licenza attiva dal collegamento ricevuto e riprova.',403);
  const organisation=String(rec.profile?.name||rec.name||'').slice(0,200);
  return await env.CONTACTS.get(env.CONTACTS.idFromName('contacts-v1')).fetch('https://contacts/send',{method:'POST',body:JSON.stringify({...contact,organisation})});
 }catch(e){return json({error:e instanceof ContactError?e.message:'Invio non confermato. Conserva il messaggio e contatta la casella indicata nel modulo.'},e instanceof ContactError?e.status:503);}
}
async function fingerprint(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}

// Separate from LICENSES: only anonymous fingerprints, delivery states and rate counters.
// No customer message, email, contact name, credential or IP is retained here.
export class ContactDispatcher{
 constructor(state,env){this.storage=state.storage;this.env=env;this.tail=Promise.resolve();}
 fetch(req){const work=this.tail.then(()=>this.handle(req));this.tail=work.catch(()=>{});return work;}
 async alarm(){const cutoff=Date.now()-7*DAY;for(const [key,value] of await this.storage.list()){if(key.startsWith('mail:')&&value.at<cutoff||key.startsWith('rate:')&&value.at<Date.now()-2*DAY)await this.storage.delete(key);}if((await this.storage.list({limit:1})).size)await this.storage.setAlarm(Date.now()+DAY);}
 async deliver(message){return sendContactSMTP(message,this.env);}
 async handle(req){
  try{
   if(req.method!=='POST'||new URL(req.url).pathname!=='/send')throw new ContactError('Metodo non consentito.',405);
   const raw=await req.json(),contact=validateContact(raw),organisation=clean(raw.organisation||'',200);
   const scope=await fingerprint(contact.license),key='mail:'+contact.id,hash=await fingerprint({...contact,organisation});
   const previous=await this.storage.get(key);
   if(previous&&previous.hash!==hash)throw new ContactError('La richiesta è cambiata: ricarica il modulo prima di inviare.',409);
   const result=state=>json({state:state==='sending'?'uncertain':state,reference:contact.id},state==='accepted'?200:state==='failed'?502:202);
   if(previous&&previous.state!=='failed')return result(previous.state);
   const hour=new Date().toISOString().slice(0,13),rateKey='rate:'+hour;
   const rates=await this.storage.get(rateKey)||{at:Date.now(),total:0,licenses:{}};
   if(rates.total>=30||(rates.licenses[scope]||0)>=5||(previous?.attempts||0)>=3)throw new ContactError('Troppe richieste ravvicinate. Scrivi direttamente alla casella indicata nel modulo.',429);
   rates.total++;rates.licenses[scope]=(rates.licenses[scope]||0)+1;
   const record={hash,at:Date.now(),state:'sending',attempts:(previous?.attempts||0)+1};
   await this.storage.transaction(async tx=>{await tx.put(rateKey,rates);await tx.put(key,record);});
   if(!await this.storage.getAlarm())await this.storage.setAlarm(Date.now()+DAY);
   const message={id:'contact-'+contact.id,to:destinations[contact.kind],replyTo:contact.email,subject:'BANDOVERA — '+labels[contact.kind],body:['Richiesta '+labels[contact.kind],'Riferimento: '+contact.id,'Organizzazione: '+organisation,'Licenza: '+contact.license,'Referente: '+contact.name,'Email: '+contact.email,'Telefono: '+contact.phone,'Bando: '+contact.bando,'',contact.message].join('\n')};
   let delivery;try{delivery=await this.deliver(message);}catch{delivery={state:'uncertain'};}
   record.state=['accepted','failed','uncertain'].includes(delivery?.state)?delivery.state:'uncertain';
   await this.storage.put(key,record);return result(record.state);
  }catch(e){return json({error:e instanceof ContactError?e.message:'Invio non confermato. Verifica la ricezione prima di riprovare.'},e instanceof ContactError?e.status:503);}
 }
}

const encode=v=>btoa(String.fromCharCode(...new TextEncoder().encode(v)));
export async function sendContactSMTP(message,env,connectOverride){
 if(env.SMTP_VERIFIED!=='true'||env.SMTP_HOST!=='authsmtp.securemail.pro'||String(env.SMTP_PORT)!=='465'||env.SMTP_FROM!=='info@bandovera.it'||!env.SMTP_USER||!env.SMTP_PASSWORD)throw new ContactError('SMTP non pronto.',503);
 if(!emailOK(message.to)||!emailOK(message.replyTo)||/[\r\n]/.test(message.subject)||!/^contact-[-a-f0-9]{36}$/.test(message.id))throw new ContactError('Messaggio non valido.');
 const connect=connectOverride||(await import('cloudflare:sockets')).connect;
 let socket,reader,writer,timer,afterData=false;
 try{
  socket=connect({hostname:env.SMTP_HOST,port:465},{secureTransport:'on'});
  const io=(async()=>{
   await socket.opened;reader=socket.readable.getReader();writer=socket.writable.getWriter();let buf='';
   async function line(){while(!buf.includes('\r\n')){const {value,done}=await reader.read();if(done)throw Error('closed');buf+=new TextDecoder().decode(value);if(buf.length>16384)throw Error('reply too long');}const at=buf.indexOf('\r\n'),out=buf.slice(0,at);buf=buf.slice(at+2);return out;}
   async function reply(want){let row=await line();if(!/^\d{3}[ -]/.test(row))throw Error('protocol');const code=row.slice(0,3);let n=0;while(row[3]==='-'){if(++n>50)throw Error('multiline');row=await line();if(row.slice(0,3)!==code)throw Error('protocol');}if(!want.includes(Number(code))){const error=Error('rejected');error.rejected=true;throw error;}}
   async function command(value,want){await writer.write(new TextEncoder().encode(value+'\r\n'));await reply(want);}
   await reply([220]);await command('EHLO bandovera.it',[250]);await command('AUTH LOGIN',[334]);await command(encode(env.SMTP_USER),[334]);await command(encode(env.SMTP_PASSWORD),[235]);
   await command('MAIL FROM:<'+env.SMTP_FROM+'>',[250]);await command('RCPT TO:<'+message.to+'>',[250,251]);await command('DATA',[354]);
   const body=encode(message.body).match(/.{1,76}/g)?.join('\r\n')||'';
   const mime=['From: BANDOVERA <'+env.SMTP_FROM+'>','To: <'+message.to+'>','Reply-To: <'+message.replyTo+'>','Subject: =?UTF-8?B?'+encode(message.subject)+'?=','Date: '+new Date().toUTCString(),'Message-ID: <'+message.id+'@bandovera.it>','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body,''].join('\r\n');
   afterData=true;await writer.write(new TextEncoder().encode(mime+'\r\n.\r\n'));await reply([250]);return {state:'accepted'};
  })();
  return await Promise.race([io,new Promise((_,reject)=>{timer=setTimeout(()=>{socket.close().catch(()=>{});reject(Error('timeout'));},25000);})]);
 }catch(e){return {state:afterData&&!e.rejected?'uncertain':'failed'};}
 finally{clearTimeout(timer);try{reader?.releaseLock();writer?.releaseLock();await socket?.close();}catch{}}
}
