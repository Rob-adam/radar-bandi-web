import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPlannedOpportunities} from '../src/dashboard-wrapper.js';
const records=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_programmati.json',import.meta.url))).bandi;
test('planned EU health funding remains outside candidate calls and cannot imply applicant eligibility',()=>{
 const b=records[0];
 assert.equal(b.status,'programmato');
 for(const key of ['opening','deadline','maxGrant','foundationYear','annualRevenue'])assert.equal(b[key],null,key);
 const html=renderPlannedOpportunities(records,{areas:'salute',beneficiaries:'pazienti'});
 assert.match(html,/apertura e scadenza non verificate/);assert.match(html,/non entrano nel conteggio/);
 assert.match(html,/1,8 milioni € complessivi/);assert.match(html,/Ammissibilità dell’ente non verificata/);
 assert.equal(renderPlannedOpportunities(records,{sector:'sport'}),'');
 assert.equal(renderPlannedOpportunities([{...b,status:'aperto'}],{areas:'salute'}),'');
});

test('Cattolica future opening displays confirmed dates without implying eligibility or an open counter',()=>{
 const b=records.find(x=>x.id==='CATTOLICA-UNA-MANO-2026');
 assert.equal(b.status,'programmato');
 assert.equal(b.opening,'2026-11-16'); assert.equal(b.deadline,'2027-02-16');
 assert.equal(b.maxGrant,20000); assert.equal(b.budget,500000);
 assert.equal(b.eligibilityStatus,'non_verificata');
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/PROSSIMA APERTURA · date da bando ufficiale/);
 assert.doesNotMatch(html,/apertura e scadenza non verificate/);
 assert.match(html,/non entrano nel conteggio/);
 assert.match(html,/Ammissibilità dell’ente non verificata/);
 assert.match(html,/Leggi il bando ufficiale/);
});
