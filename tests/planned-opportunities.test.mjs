import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPlannedOpportunities} from '../src/dashboard-wrapper.js';
const records=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_programmati.json',import.meta.url))).bandi;
const future={id:'future-example',title:'Iniziativa futura',status:'programmato',opening:'2026-11-16',deadline:'2027-02-16',maxGrant:20000,tracking:{verifiedAt:'2026-11-09'}};
test('verified Cattolica opening is published once and excluded from future counts',()=>{
 const live=JSON.parse(fs.readFileSync(new URL('../public/radar_bandi_catalogo_extra.json',import.meta.url))).bandi.filter(b=>b.id==='CATTOLICA-UNA-MANO-2026');
 assert.equal(live.length,1);assert.equal(live[0].submissionStatus,'open');
 assert.ok(!records.some(b=>['EU4HEALTH-OA-g-26-91','CATTOLICA-UNA-MANO-2026'].includes(b.id)));
 assert.equal(records.length,2);
 assert.match(renderPlannedOpportunities(records,{areas:'salute'}),/EU4Health — approccio multidisciplinare/);
});
test('CoPower second round stays scheduled and is shown only to a coherent profile',()=>{
 const b=records.find(item=>item.id==='OXFAM-COPOWER-2026-R2');
 assert.ok(b);
 assert.equal(b.status,'programmato');
 assert.equal(b.submissionStatus,'forthcoming');
 assert.equal(b.opening,'2026-12-01');
 assert.equal(b.deadline,'2027-03-01');
 assert.match(renderPlannedOpportunities(records,{areas:'salute',beneficiaries:'Donne'}),/CoPower — seconda finestra/);
 assert.doesNotMatch(renderPlannedOpportunities(records,{areas:'salute',beneficiaries:'Pazienti'}),/CoPower — seconda finestra/);
});
test('a future notice stays separate until candidacy is verified',()=>{
 const b=future;
 assert.equal(b.opening,'2026-11-16');assert.equal(b.deadline,'2027-02-16');assert.equal(b.maxGrant,20000);
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/PROSSIMA APERTURA · date da bando ufficiale/);assert.match(html,/non entrano nel conteggio/);
 assert.match(html,/Ammissibilità dell’ente non verificata/);
 assert.equal(renderPlannedOpportunities([b],{sector:'sport'}),'');
 assert.equal(renderPlannedOpportunities([{...b,status:'aperto'}],{areas:'salute'}),'');
});
test('an indicative calendar still cannot imply an open call or verified dates',()=>{
 const b={id:'calendar-example',title:'Health funding',status:'programmato',dateEvidenceType:'tentative_calendar',opening:null,deadline:null,publicationWindow:'04/11/2026 – 19/01/2027',budgetLabel:'1,8 milioni €',tracking:{verifiedAt:'2026-11-02'}};
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/date indicative, candidatura non verificata/);assert.match(html,/Leggi il calendario ufficiale/);
 assert.doesNotMatch(html,/date da bando ufficiale/);
});
test('the cardiovascular EU4Health item remains a tentative programme, not an open call',()=>{
 const b=records.find(item=>item.id==='EU4HEALTH-CR-CV-NCD-G-26-15');
 assert.ok(b);
 assert.equal(b.status,'programmato');
 assert.equal(b.dateEvidenceType,'tentative_calendar');
 assert.equal(b.opening,null);
 assert.equal(b.deadline,null);
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/date indicative, candidatura non verificata/);
 assert.doesNotMatch(html,/PROSSIMA APERTURA · date da bando ufficiale/);
});
test('an official notice with a forthcoming submission system remains distinct from an open call',()=>{
 const b={...future,submissionStatus:'forthcoming'};
 const html=renderPlannedOpportunities([b],{areas:'salute'});
 assert.match(html,/AVVISO PUBBLICATO · candidature non ancora aperte/);assert.doesNotMatch(html,/Nuova apertura/);
});
