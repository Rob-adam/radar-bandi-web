import {IntakeError,validateSheet,mapSheet,expiryFor,bankMessage,verifiedBank} from './onboarding-schema.js';
import {sendSMTP,smtpReady} from './onboarding-smtp.js';
import {accessHash} from './client-access.js';
import {cleanProfile} from './index.js';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const adminOK=(req,env)=>!!env.ADMIN_API_KEY&&req.headers.get('authorization')==='Bearer '+env.ADMIN_API_KEY;
const now=()=>new Date().toISOString();
const endpoint='https://radar-bandi-online.presidente-56d.workers.dev';
const entityKeys=p=>[p.taxCode,p.vatNumber].filter(Boolean).map(v=>String(v).replace(/\s/g,'').toUpperCase());
const normalName=v=>String(v||'').trim().toLocaleLowerCase('it').replace(/\s+/g,' ');
async function limitedJSON(req){
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new IntakeError('Content-Type non valido',415);
 const reader=req.body?.getReader();if(!reader)throw new IntakeError('Corpo mancante');let bytes=0,chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536){await reader.cancel();throw new IntakeError('Scheda troppo grande',413);}chunks.push(value);}}
 finally{reader.releaseLock();}
 const out=new Uint8Array(bytes);let pos=0;for(const value of chunks){out.set(value,pos);pos+=value.length;}
 try{return JSON.parse(new TextDecoder().decode(out));}catch{throw new IntakeError('JSON non valido');}
}
export async function routeOnboarding(req,env){
 const url=new URL(req.url),publicRoute=url.pathname==='/api/requests',adminRoute=url.pathname.startsWith('/api/admin/requests'),manual=url.pathname==='/api/admin/license'&&req.method==='POST';
 if(!publicRoute&&!adminRoute&&!manual)return null;
 const configured=env.ONBOARDING_ENABLED==='true'&&!!env.ONBOARDING;
 if(!configured)return publicRoute||adminRoute?reply({error:'Invio automatico non disponibile. Usa i canali manuali.'},503):null;
 try{
  if(!env.LICENSES)throw new IntakeError('Archivio licenze non disponibile',503);
  const origin=req.headers.get('origin');
  if(publicRoute){
   if(origin!=='https://bandovera.it')throw new IntakeError('Origine non consentita',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type','vary':'Origin','cache-control':'no-store'}});
   if(req.method!=='POST')throw new IntakeError('Metodo non consentito',405);
   if(!env.TURNSTILE_SECRET||!env.REQUEST_HASH_KEY||!smtpReady(env))throw new IntakeError('Configurazione incompleta',503);verifiedBank(env);
   const body=await limitedJSON(req);const sheet=validateSheet(body.sheet);
   if(typeof body.challenge!=='string'||body.challenge.length>2048)throw new IntakeError('Verifica antispam necessaria');
   const check=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:body.challenge,remoteip:req.headers.get('cf-connecting-ip')||''}),signal:AbortSignal.timeout(10000)}).then(r=>r.json());
   if(!check.success||check.hostname!=='bandovera.it'||check.action!=='bandovera_request')throw new IntakeError('Verifica antispam non riuscita',403);
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.REQUEST_HASH_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const hash=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(req.headers.get('cf-connecting-ip')||'unknown'));
   const ip=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
   const r=await env.ONBOARDING.get(env.ONBOARDING.idFromName('registry-v1')).fetch('https://registry/public',{method:'POST',body:JSON.stringify({sheet,ip})});
   const headers=new Headers(r.headers);headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');
   return new Response(r.body,{status:r.status,headers});
  }
  if(!adminOK(req,env))throw new IntakeError('Autenticazione amministrativa richiesta',401);
  if(origin&&origin!==url.origin)throw new IntakeError('Origine non consentita',403);
  if(!['GET','POST'].includes(req.method))throw new IntakeError('Metodo non consentito',405);
  const body=req.method==='POST'?await limitedJSON(req):null;
  const r=await env.ONBOARDING.get(env.ONBOARDING.idFromName('registry-v1')).fetch('https://registry'+(manual?'/manual':url.pathname.replace('/api/admin/requests','/requests')),{method:req.method,body:body?JSON.stringify(body):undefined});
  return r;
 }catch(e){const r=reply({error:e instanceof IntakeError?e.message:'Operazione non completata; verifica lo stato prima di riprovare'},e.status||503);if(publicRoute&&req.headers.get('origin')==='https://bandovera.it'){r.headers.set('access-control-allow-origin','https://bandovera.it');r.headers.set('vary','Origin');}return r;}
}

// One coordinator serializes ALL license writers while enabled. KV remains the existing serving archive.
// Durable storage reserves identities and codes before KV writes, allowing crash-safe same-license recovery.
export class OnboardingRegistry {
 constructor(state,env){this.storage=state.storage;this.env=env;this.tail=Promise.resolve();}
 fetch(req){const task=this.tail.then(()=>this.handle(req));this.tail=task.catch(()=>{});return task;}
 async bootstrap(){
  if(await this.storage.get('bootstrapped'))return;
  let cursor;
  do{
   const page=await this.env.LICENSES.list({prefix:'license:',limit:1000,...(cursor?{cursor}:{})});
   for(const k of page.keys){const rec=await this.env.LICENSES.get(k.name,{type:'json'});if(!rec)throw new IntakeError('Archivio licenze incompleto; inizializzazione sospesa',503);await this.storage.put(k.name,rec);}
   cursor=page.list_complete?null:page.cursor;
  }while(cursor);
  await this.storage.put('bootstrapped',true);
 }
 async allLicenses(){return [...(await this.storage.list({prefix:'license:'})).values()];}
 async handle(req){
  try{
   await this.bootstrap();const path=new URL(req.url).pathname;
   if(path==='/requests'&&req.method==='GET'){
    const records=[...(await this.storage.list({prefix:'request:'})).values()];
    return reply({manualWrites:[...(await this.storage.list({prefix:'manual-pending:'})).values()].map(l=>({license:l.license,name:l.name})),requests:records.map(({id,sheet,profile,status,createdAt,updatedAt,revision,license,payment,bonificoEmail,accessEmail})=>({id,sheet,profile,status,createdAt,updatedAt,revision,license,payment,bonificoEmail:this.mailStatus(bonificoEmail),accessEmail:this.mailStatus(accessEmail)}))});
   }
   const body=JSON.parse(await req.text());
   if(path==='/public'&&req.method==='POST')return await this.submit(body);
   if(path==='/manual'&&req.method==='POST')return await this.manual(body);
   if(path==='/requests/manual-sync'&&req.method==='POST'){
    const pending=await this.storage.get('manual-pending:'+String(body.license));
    if(!pending)throw new IntakeError('Nessuna scrittura manuale da recuperare',409);
    const current=await this.env.LICENSES.get('license:'+pending.license,{type:'json'});
    if(current&&current.accessTokenHash!==pending.accessTokenHash)throw new IntakeError('Credenziali diverse: nessuna sovrascrittura',409);
    await this.env.LICENSES.put('license:'+pending.license,JSON.stringify(pending));await this.storage.delete('manual-pending:'+pending.license);return reply({ok:true,license:pending.license});
   }
   const match=path.match(/^\/requests\/(REQ-[a-f0-9-]{36})\/(activate|email|delivery|recover)$/);
   if(!match)throw new IntakeError('Operazione non trovata',404);
   const rec=await this.storage.get('request:'+match[1]);if(!rec)throw new IntakeError('Richiesta non trovata',404);
   // Recovery is idempotent and cannot change the reservation, profile, token or payment.
   if(match[2]==='recover')return await this.recover(rec);
   if(body.revision!==rec.revision)throw new IntakeError('La richiesta è cambiata: aggiorna prima di procedere',409);
   if(match[2]==='activate')return await this.activate(rec,body);
   if(match[2]==='delivery'){
    const kind=body.kind==='access'?'accessEmail':body.kind==='bonifico'?'bonificoEmail':null;
    if(!kind||!['accepted','uncertain','sending'].includes(rec[kind]?.state)||body.confirmedReceived!==true)throw new IntakeError('Conferma effettiva del destinatario necessaria');
    rec[kind]={...rec[kind],state:'delivered',confirmedAt:now(),evidence:'Conferma manuale del destinatario'};await this.save(rec);return reply({ok:true});
   }
   const kind=body.kind==='access'?'accessEmail':body.kind==='bonifico'?'bonificoEmail':null;
   if(!kind||kind==='accessEmail'&&rec.status!=='active')throw new IntakeError('Email non disponibile');
   if(['sending','uncertain','accepted','delivered'].includes(rec[kind]?.state))throw new IntakeError('Invio già effettuato o esito incerto: verificare prima di reinviare',409);
   await this.send(rec,kind);return reply({ok:true,email:this.mailStatus(rec[kind])});
  }catch(e){return reply({error:e instanceof IntakeError?e.message:'Operazione non completata. Aggiorna lo stato prima di riprovare.'},e.status||503);}
 }
 mailStatus(mail){if(!mail)return {state:'not_sent'};return {state:mail.state==='sending'?'uncertain':mail.state,attemptedAt:mail.attemptedAt,acceptedAt:mail.acceptedAt,confirmedAt:mail.confirmedAt};}
 async save(rec){rec.updatedAt=now();rec.revision=(rec.revision||0)+1;await this.storage.put('request:'+rec.id,rec);}
 async submit({sheet:input,ip}){
  const sheet=validateSheet(input);const profile=mapSheet(sheet);
  const hour=now().slice(0,13);for(const k of (await this.storage.list({prefix:'rate:'})).keys())if(k!=='rate:'+hour)await this.storage.delete(k);const rateKey='rate:'+hour;const rate=await this.storage.get(rateKey)||{total:0,ips:{}};
  if(rate.total>=20||(rate.ips[ip]||0)>=3)throw new IntakeError('Troppe richieste; contatta info@bandovera.it',429);
  rate.total++;rate.ips[ip]=(rate.ips[ip]||0)+1;await this.storage.put(rateKey,rate);
  // Same generic response for duplicates: never expose prior requests, identities, or private links.
  const generic=()=>reply({received:true,message:'Richiesta acquisita o già presente. Attendi le istruzioni via email; per assistenza contatta info@bandovera.it.'},202);
  const keys=entityKeys(profile),requests=[...(await this.storage.list({prefix:'request:'})).values()];
  if(requests.some(r=>entityKeys(r.profile).some(k=>keys.includes(k)))||(await this.allLicenses()).some(r=>entityKeys(r.profile||{}).some(k=>keys.includes(k))||normalName(r.name)===normalName(profile.name)))return generic();
  const rec={id:'REQ-'+crypto.randomUUID(),sheet,profile,status:'pending',createdAt:now(),revision:0};
  await this.save(rec);await this.send(rec,'bonificoEmail');return generic();
 }
 async deliver(message){return sendSMTP(message,this.env);}
 async send(rec,kind){
  if(!smtpReady(this.env))throw new IntakeError('SMTP non verificato',503);
  let message;
  if(kind==='bonificoEmail')message=bankMessage(rec,this.env);
  else{
   const license=await this.storage.get('license:'+rec.license);
   if(!license?.active||license.requestId!==rec.id||!license.accessToken)throw new IntakeError('Licenza non pronta',409);
   message={to:rec.sheet.email_referente,subject:'BANDOVERA · accesso privato',body:`Buongiorno ${rec.sheet.referente},\n\nRoberto ha verificato l’accredito e ha attivato BANDOVERA per ${rec.sheet.nome_associazione}.\nLicenza: ${rec.license}\nValida fino al ${license.expiresAt}, senza rinnovo automatico.\n\nCollegamento riservato, da non pubblicare:\n${endpoint}/${rec.license}?access=${encodeURIComponent(license.accessToken)}\n\nAssistenza tecnica: assistenza@bandovera.it\nSupporto candidature (separato): supporto@bandovera.it`};
  }
  const messageId=rec[kind]?.messageId||crypto.randomUUID();
  rec[kind]={state:'sending',messageId,attemptedAt:now()};await this.save(rec);
  let result;try{result=await this.deliver({...message,id:messageId});}catch{result={state:'failed'};}
  rec[kind]={...rec[kind],...result};await this.save(rec);
 }
 async activate(rec,body){
  if(rec.status==='active')return reply({ok:true,license:rec.license,alreadyActive:true});
  if(rec.status==='activating')return this.recover(rec);
  if(rec.status!=='pending'||body.confirmedCredit!==true||body.amountCents!==1990||body.profileReviewed!==true||typeof body.paymentReference!=='string'||!body.paymentReference.trim()||body.paymentReference.length>300)throw new IntakeError('Conferma accredito di 19,90 €, riferimento e revisione scheda necessari');
  const duplicates=(await this.allLicenses()).filter(l=>entityKeys(l.profile||{}).some(k=>entityKeys(rec.profile).includes(k))||normalName(l.name)===normalName(rec.profile.name));
  if(duplicates.length)throw new IntakeError('Ente già presente: verifica la licenza esistente, non crearne una seconda',409);
  // UUID-derived decimal code fits the established RB-<digits> grammar and avoids changing manual counters.
  let code;for(let i=0;i<5;i++){code='RB-'+String(BigInt('0x'+crypto.randomUUID().replace(/-/g,'').slice(0,12)));if(!await this.storage.get('license:'+code)&&!await this.env.LICENSES.get('license:'+code))break;code=null;}if(!code)throw new IntakeError('Codice non disponibile',409);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const token=crypto.randomUUID()+crypto.randomUUID(),expiresAt=expiryFor(today);
  const profile={...rec.profile,mappingNeedsReview:false,license:code,active:true,createdAt:today,expiresAt,price:19.90,durationMonths:12};
  const license={license:code,name:profile.name,active:true,expiresAt,price:19.90,profile,accessToken:token,accessTokenHash:await accessHash(token),requestId:rec.id,updatedAt:now()};
  rec.status='activating';rec.license=code;rec.payment={confirmedAt:now(),amountCents:1990,reference:body.paymentReference.trim()};rec.revision++;rec.updatedAt=now();
  await this.storage.transaction(async tx=>{await tx.put('license:'+code,license);await tx.put('request:'+rec.id,rec);});
  return await this.recover(rec);
 }
 async recover(rec){
  if(rec.status==='active')return reply({ok:true,license:rec.license,alreadyActive:true});
  if(rec.status!=='activating')throw new IntakeError('Nessuna attivazione da recuperare',409);
  const license=await this.storage.get('license:'+rec.license);
  if(!license||license.requestId!==rec.id||!rec.payment)throw new IntakeError('Prenotazione incoerente',409);
  const current=await this.env.LICENSES.get('license:'+rec.license,{type:'json'});
  if(current&&(current.requestId!==rec.id||current.accessTokenHash!==license.accessTokenHash))throw new IntakeError('Codice occupato: nessuna sovrascrittura eseguita',409);
  await this.env.LICENSES.put('license:'+rec.license,JSON.stringify(license));
  rec.status='active';await this.save(rec);
  // Activation is committed even if mail fails. Retry mail, never create another license.
  if(!rec.accessEmail)try{await this.send(rec,'accessEmail');}catch{}
  return reply({ok:true,license:rec.license,email:this.mailStatus(rec.accessEmail)});
 }
 async manual(body){
  const code=String(body.license||'').trim().toUpperCase();if(!/^RB-\d{4,}$/.test(code))throw new IntakeError('Codice licenza non valido');
  const previous=await this.storage.get('license:'+code)||await this.env.LICENSES.get('license:'+code,{type:'json'});
  // Creation must be explicit, never reinterpret a collision as a profile edit.
  if(body.create===true&&previous)throw new IntakeError('Codice già occupato: aggiorna l’elenco e riprova',409);
  if(!previous&&body.create!==true)throw new IntakeError('Creazione da confermare dalla dashboard aggiornata',409);
  if(previous&&body.name&&normalName(body.name)!==normalName(previous.name))throw new IntakeError('Codice associato ad altro nome: modifica da verificare manualmente',409);
  if(previous?.requestId){const request=await this.storage.get('request:'+previous.requestId);if(request?.status==='activating')throw new IntakeError('Attivazione in recupero: completarla prima di modificare',409);}
  const base={...previous,license:code,name:body.name||previous?.name||'',active:body.active!==false,expiresAt:String(body.expiresAt||previous?.expiresAt||''),price:Number(body.price??previous?.price)||0,updatedAt:now()};
  const supplied=body.profile&&typeof body.profile==='object'?body.profile:null;
  base.profile=supplied?{...previous?.profile,...cleanProfile(supplied,code,base)}:previous?.profile||null;
  if(base.profile&&supplied){
   for(const key of ['taxCode','vatNumber','contactName','contactEmail','contactPhone','website'])if(supplied[key]!==undefined){
    if(typeof supplied[key]!=='string'||supplied[key].length>4000)throw new IntakeError('Dato cliente non valido');
    if(previous?.profile?.[key]&&['taxCode','vatNumber'].includes(key)&&supplied[key]!==previous.profile[key])throw new IntakeError('Identità fiscale diversa: aggiornamento da verificare',409);
    base.profile[key]=supplied[key];
   }
   if(!previous&&supplied.sourceSheet)base.profile.sourceSheet=validateSheet(supplied.sourceSheet);
  }
  if(!previous){
   if(!base.name)throw new IntakeError('Nome ente mancante');
   for(const l of await this.allLicenses())if(normalName(l.name)===normalName(base.name)||entityKeys(l.profile||{}).some(k=>entityKeys(base.profile||{}).includes(k)))throw new IntakeError('Ente già associato a una licenza',409);
   base.accessToken=crypto.randomUUID()+crypto.randomUUID();base.accessTokenHash=await accessHash(base.accessToken);
  }
  // Existing credentials (including hash-only records) are preserved byte-for-byte.
  await this.storage.transaction(async tx=>{await tx.put('license:'+code,base);await tx.put('manual-pending:'+code,base);});await this.env.LICENSES.put('license:'+code,JSON.stringify(base));await this.storage.delete('manual-pending:'+code);
  return reply({ok:true,license:code,active:base.active,expiresAt:base.expiresAt,profileStored:!!base.profile,shortUrl:base.accessToken?endpoint+'/'+code+'?access='+encodeURIComponent(base.accessToken):null});
 }
}
