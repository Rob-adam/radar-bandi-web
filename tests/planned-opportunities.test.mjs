import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPlannedOpportunities} from '../src/dashboard-wrapper.js';
const records=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_programmati.json',import.meta.url))).bandi;
test('planned EU health funding remains outside candidate calls and cannot imply applicant eligibility',()=>{
 const b=records[0];
 assert.equal(b.status,'programmato');
 for(const key of ['maxGrant','foundationYear','annualRevenue'])assert.equal(b[key],null,key);
 const html=renderPlannedOpportunities(records,{areas:'salute',beneficiaries:'pazienti'});
 assert.match(html,/AVVISO PUBBLICATO · candidature non ancora aperte/);assert.match(html,/non entrano nel conteggio/);
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


test('tentative HaDEA dates never become verified opening or eligibility',()=>{
 const b={...records.find(x=>x.id==='EU4HEALTH-OA-g-26-91'),opening:null,deadline:null,submissionStatus:null,dateEvidenceType:'tentative_calendar'};
 assert.equal(b.indicativeOpening,'2026-11-04');assert.equal(b.indicativeDeadline,'2027-01-19');
 assert.equal(b.opening,null);assert.equal(b.deadline,null);assert.equal(b.status,'programmato');
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/04\/11\/2026/);assert.match(html,/19\/01\/2027/);
 assert.match(html,/Leggi il calendario ufficiale/);assert.doesNotMatch(html,/date da bando ufficiale/);
 assert.match(html,/Ammissibilità dell’ente non verificata/);
});

test('published EU4Health notice never promotes a forthcoming submission system or national footprint to eligibility',()=>{
 const b=records.find(x=>x.id==='EU4HEALTH-OA-g-26-91');
 assert.equal(b.status,'programmato');assert.equal(b.submissionStatus,'forthcoming');
 assert.equal(b.opening,'2026-11-04');assert.equal(b.deadlineAt,'2027-01-19T17:00:00+01:00');
 assert.match(b.summary,/metà degli Stati/);assert.match(b.summary,/sola operatività nazionale non basta/);
 assert.match(b.nextAction,/massimo 30%/);assert.match(b.nextAction,/sotto 50%/);
 assert.match(b.nextAction,/ultimi due anni/);assert.equal(b.eligibilityStatus,'non_verificata');
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/candidature non ancora aperte/);assert.match(html,/Leggi il bando ufficiale/);
 assert.doesNotMatch(html,/Nuova apertura/);
});
