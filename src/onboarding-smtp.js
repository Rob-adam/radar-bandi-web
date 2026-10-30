import {emailOK,IntakeError} from './onboarding-schema.js';
const encode=v=>btoa(String.fromCharCode(...new TextEncoder().encode(v)));
export function smtpReady(env){return env.SMTP_VERIFIED==='true'&&env.SMTP_HOST==='authsmtp.securemail.pro'&&String(env.SMTP_PORT)==='465'&&env.SMTP_FROM==='info@bandovera.it'&&!!env.SMTP_USER&&!!env.SMTP_PASSWORD;}
export async function sendSMTP(message,env,connectOverride){
 if(!smtpReady(env))throw new IntakeError('SMTP non configurato o non verificato',503);
 if(!emailOK(message.to)||/[\r\n]/.test(message.subject))throw new IntakeError('Destinatario o oggetto non valido');
 const connect=connectOverride||(await import('cloudflare:sockets')).connect;
 let socket,reader,writer,timer,afterData=false,accepted=false;
 try{
  socket=connect({hostname:env.SMTP_HOST,port:465},{secureTransport:'on'});
  const io=(async()=>{
   await socket.opened;
   reader=socket.readable.getReader();writer=socket.writable.getWriter();let buf='';
   async function line(){while(!buf.includes('\r\n')){const {value,done}=await reader.read();if(done)throw Error('closed');buf+=new TextDecoder().decode(value);if(buf.length>16384)throw Error('reply too long');}const pos=buf.indexOf('\r\n'),result=buf.slice(0,pos);buf=buf.slice(pos+2);return result;}
   async function reply(want){let first=await line();if(!/^\d{3}[ -]/.test(first))throw Error('protocol');const code=first.slice(0,3);let n=0;while(first[3]==='-'){if(++n>50)throw Error('multiline');first=await line();if(first.slice(0,3)!==code)throw Error('protocol');}if(!want.includes(Number(code))){const err=Error('rejected');err.rejected=true;throw err;}}
   async function command(value,want){await writer.write(new TextEncoder().encode(value+'\r\n'));await reply(want);}
   await reply([220]);await command('EHLO bandovera.it',[250]);
   await command('AUTH LOGIN',[334]);await command(encode(env.SMTP_USER),[334]);await command(encode(env.SMTP_PASSWORD),[235]);
   await command('MAIL FROM:<'+env.SMTP_FROM+'>',[250]);await command('RCPT TO:<'+message.to+'>',[250,251]);await command('DATA',[354]);
   const body=encode(message.body).match(/.{1,76}/g)?.join('\r\n')||'';
   const mime=['From: BANDOVERA <'+env.SMTP_FROM+'>','To: <'+message.to+'>','Subject: =?UTF-8?B?'+encode(message.subject)+'?=',
    'Date: '+new Date().toUTCString(),'Message-ID: <'+message.id+'@bandovera.it>','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+body,''].join('\r\n');
   afterData=true;await writer.write(new TextEncoder().encode(mime+'\r\n.\r\n'));await reply([250]);accepted=true;
   return {state:'accepted',acceptedAt:new Date().toISOString()};
  })();
  return await Promise.race([io,new Promise((_,reject)=>{timer=setTimeout(()=>{socket.close().catch(()=>{});reject(Error('timeout'));},25000)})]);
 }catch(e){return {state:accepted?'accepted':afterData&&!e.rejected?'uncertain':'failed'};}
 finally{clearTimeout(timer);try{reader?.releaseLock();writer?.releaseLock();await socket?.close();}catch{}}
}
