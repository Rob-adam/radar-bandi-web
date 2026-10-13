import {hasAccess} from './client-access.js';
const DESTINATION='presidente@unrespirodisperanzalombardia.com';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function sendSupport(request,env,code,send=fetch){
 const url=new URL(request.url);
 if(request.method!=='POST')return reply({error:'Metodo non consentito'},405);
 if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Richiesta non valida'},403);
 const rec=await env.LICENSES?.get('license:'+code,{type:'json'});
 if(!rec||rec.active===false||(rec.expiresAt&&rec.expiresAt<new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date()))||!await hasAccess(request,code,rec))return reply({error:'Accesso cliente non autorizzato'},403);
 let body;try{body=await request.json()}catch{return reply({error:'Dati della richiesta non validi'},400)}
 const clean=v=>String(v||'').trim();
 const name=clean(body.name),email=clean(body.email),message=clean(body.message),phone=clean(body.phone),call=clean(body.call);
 if(!name||name.length>200||!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||!message||message.length>10000||phone.length>100||call.length>1000)return reply({error:'Controlla nome, email e messaggio prima di inviare.'},400);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const payload={name,email,_replyto:email,_subject:'BANDOVERA — '+(call?'supporto candidatura':'assistenza disservizio'),_captcha:'false',Organizzazione:rec.profile?.name||rec.name||'',Licenza:code,'Nome referente':name,Email:email,Telefono:phone,Bando:call,Messaggio:message};
  // Public origin only: never forward access keys, cookies or the private URL.
  const response=await send('https://formsubmit.co/ajax/'+DESTINATION,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Origin:url.origin,Referer:url.origin+'/'},body:JSON.stringify(payload),signal:controller.signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!(result?.success===true||result?.success==='true'))return reply({error:'Il servizio di posta non ha confermato l’invio. La richiesta non risulta inviata: riprova tra poco.'},502);
  return reply({success:true,message:'Richiesta accettata dal servizio di invio.'});
 }catch{return reply({error:'Servizio di posta temporaneamente non disponibile. La richiesta non risulta inviata: riprova tra poco.'},502)}
 finally{clearTimeout(timeout)}
}
