import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/stripe-request-schema.js',import.meta.url),'utf8');
const {validateSheet,mapSheet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const valid={
 nome_associazione:'Associazione Prova',cf:'12345678901',tipo_ente:'APS',runts:'Iscritta',
 regione:'Lombardia',settore_principale:'Salute',finalita_statutarie:'Tutela pazienti',
 capacita_progetti:'Volontariato',referente:'Mario Rossi',email_referente:'test@example.org',
 ack_completezza:'Sì',luogo_data:'Monza, 30 ottobre 2026',compilatore:'Mario Rossi',
 privacy:'Sì',area_salute:'Salute',att_educazione:'Informazione',ben_pazienti:'Pazienti'
};
test('scheda completa viene conservata e mappata',()=>{
 const sheet=validateSheet(valid);
 assert.equal(mapSheet(sheet).name,'Associazione Prova');
 assert.equal(mapSheet(sheet).sourceSheet.cf,'12345678901');
});
test('assenza privacy rifiutata',()=>assert.throws(()=>validateSheet({...valid,privacy:'No'})));
test('email non valida rifiutata',()=>assert.throws(()=>validateSheet({...valid,email_referente:'wrong'})));
test('area di intervento mancante rifiutata',()=>assert.throws(()=>validateSheet(Object.fromEntries(Object.entries(valid).filter(([k])=>!k.startsWith('area_'))))));
test('dati categoria non inventano ammissibilità',()=>{
 const profile=mapSheet(validateSheet(valid));assert.equal(profile.mappingNeedsReview,true);
});
