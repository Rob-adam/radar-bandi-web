import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPlannedOpportunities} from '../src/dashboard-wrapper.js';
const records=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_programmati.json',import.meta.url))).bandi;
test('Cattolica remains future and published EU4Health is absent from future counts',()=>{
 assert.equal(records.length,1);assert.ok(!records.some(b=>b.id==='EU4HEALTH-OA-g-26-91'));
 const b=records[0];assert.equal(b.id,'CATTOLICA-UNA-MANO-2026');assert.equal(b.status,'programmato');
 assert.equal(b.opening,'2026-11-16');assert.equal(b.deadline,'2027-02-16');assert.equal(b.maxGrant,20000);
 const html=renderPlannedOpportunities(records,{areas:'salute'});
 assert.match(html,/PROSSIMA APERTURA · date da bando ufficiale/);assert.match(html,/non entrano nel conteggio/);
 assert.match(html,/Ammissibilità dell’ente non verificata/);
 assert.equal(renderPlannedOpportunities(records,{sector:'sport'}),'');
 assert.equal(renderPlannedOpportunities([{...b,status:'aperto'}],{areas:'salute'}),'');
});
test('an indicative calendar still cannot imply an open call or verified dates',()=>{
 const b={id:'calendar-example',title:'Health funding',status:'programmato',dateEvidenceType:'tentative_calendar',opening:null,deadline:null,publicationWindow:'04/11/2026 – 19/01/2027',budgetLabel:'1,8 milioni €',tracking:{verifiedAt:'2026-11-02'}};
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/date indicative, candidatura non verificata/);assert.match(html,/Leggi il calendario ufficiale/);
 assert.doesNotMatch(html,/date da bando ufficiale/);
});
test('an official notice with a forthcoming submission system remains distinct from an open call',()=>{
 const b={...records[0],submissionStatus:'forthcoming'};
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/AVVISO PUBBLICATO · candidature non ancora aperte/);assert.doesNotMatch(html,/Nuova apertura/);
});
