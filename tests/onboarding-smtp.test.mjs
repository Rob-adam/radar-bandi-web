import {test} from 'node:test';import assert from 'node:assert/strict';
import {sendSMTP,smtpReady} from '../src/onboarding-smtp.js';
const env={SMTP_VERIFIED:'true',SMTP_HOST:'authsmtp.securemail.pro',SMTP_PORT:'465',SMTP_FROM:'info@bandovera.it',SMTP_USER:'test@example.org',SMTP_PASSWORD:'fake-test-not-a-credential'};
function transport(mode){let controller,step=0,closeCount=0;const sent=[];const emit=s=>controller.enqueue(new TextEncoder().encode(s));
 return {sent,get closes(){return closeCount},connect:()=>({opened:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;emit('220 test\r\n');}}),writable:new WritableStream({write(bytes){const line=new TextDecoder().decode(bytes);sent.push(line);step++;
 const replies={1:'250-test\r\n250 AUTH LOGIN\r\n',2:'334 user\r\n',3:'334 password\r\n',4:mode==='auth-failure'?'535 denied\r\n':'235 ok\r\n',5:'250 from\r\n',6:'250 to\r\n',7:'354 data\r\n',8:mode==='data-rejected'?'550 rejected\r\n':'250 queued\r\n'};
 if(step===8&&mode==='uncertain')controller.error(Error('connection lost'));else emit(replies[step]);
 }}),async close(){closeCount++;if(mode==='close-failure')throw Error('close');}})};
}
const message={id:'test-message-id',to:'test@example.org',subject:'BANDOVERA · prova',body:'TEST NON INVIARE\nProva àè'};
test('SMTP accepts only configured TLS Register.it port 465; no implicit fallback',()=>{assert.equal(smtpReady(env),true);assert.equal(smtpReady({...env,SMTP_VERIFIED:'false'}),false);assert.equal(smtpReady({...env,SMTP_PORT:'25'}),false);assert.equal(smtpReady({...env,SMTP_HOST:'evil.example'}),false);});
test('SMTP 250 means accepted, never automatically delivered; UTF-8 MIME is encoded',async()=>{const t=transport('ok');const result=await sendSMTP(message,env,t.connect);assert.equal(result.state,'accepted');assert.equal(result.deliveredAt,undefined);assert.ok(t.sent[7].includes('Content-Transfer-Encoding: base64'));assert.ok(t.sent[7].includes('Message-ID: <test-message-id@bandovera.it>'));assert.equal(t.closes,1);});
test('authentication rejection fails before sending email data',async()=>{const t=transport('auth-failure');assert.equal((await sendSMTP(message,env,t.connect)).state,'failed');assert.equal(t.sent.length,4);});
test('definite DATA rejection fails while lost post-DATA response remains uncertain',async()=>{for(const [mode,expected] of [['data-rejected','failed'],['uncertain','uncertain']]){const t=transport(mode);assert.equal((await sendSMTP(message,env,t.connect)).state,expected);}});
test('close failure after SMTP acceptance cannot trigger duplicate resend',async()=>{const t=transport('close-failure');assert.equal((await sendSMTP(message,env,t.connect)).state,'accepted');});
test('header injection rejected before opening a socket',async()=>{let called=false;await assert.rejects(sendSMTP({...message,to:'x@example.org\r\nBcc:y@example.org'},env,()=>{called=true}));assert.equal(called,false);});
