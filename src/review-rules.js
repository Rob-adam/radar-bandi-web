import {applySourceReview} from "./source-reviews.js";
// Editorial corrections with explicit, three-state applicant requirements.
export const REVIEWED_ADDITIONS=[
 {id:'TERZO-PILASTRO-SOLIDARIETA',title:'Sportello della solidarietà',source:'Fondazione Terzo Pilastro – Internazionale',sourceUrl:'https://www.fondazioneterzopilastrointernazionale.it/solidarieta/',deadline:null,deadlineType:'continuous',fund:null,maxGrant:100000,aid:'Richiesta da 50.000 a 100.000 €; una domanda all’anno, invio per raccomandata A/R con modulo e allegati completi.',territories:['italia'],legalForms:['non profit','ets','associazione'],sectors:['salute','sociale'],beneficiaries:['pazienti','famiglie'],activities:['assistenza sociosanitaria'],purposes:['assistenza ai malati e sostegno ai familiari'],tags:['Nazionale','Salute','Famiglie','Sportello'],eligibility:['Enti senza scopo di lucro, operanti nel territorio nazionale e nei Paesi del Mediterraneo.','Una domanda di contributo all’anno; compilare il modulo e tutti gli allegati richiesti.','Priorità all’assistenza sociosanitaria ai malati e al sostegno ai loro familiari.'],hardRequirements:[{type:'document',label:'Verificare modulo, allegati, budget e eventuali contributi già richiesti nell’anno'}],tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,continuousDeadlineConfirmed:true,verifiedAt:'2026-10-13',verificationNote:'Pagina ufficiale: enti non profit, priorità sociosanitaria, sportello senza scadenza e importi confermati il 13/10/2026. Modulo completo da verificare per la candidatura.'}},
 {id:'INTESA-FONDO-BENEFICENZA',title:'Fondo di Beneficenza — liberalità territoriali e centrali',source:'Intesa Sanpaolo',sourceUrl:'https://group.intesasanpaolo.com/it/sociale/fondo-di-beneficenza/come-richiedere-un-contributo',deadline:null,deadlineType:'continuous',fund:null,maxGrant:null,aid:'Liberalità territoriali fino a 5.000 €; centrali oltre 5.000 €. Valutazione gennaio–dicembre, fino all’esaurimento del plafond; per ricerca medica termine entro maggio.',territories:['italia'],legalForms:['non profit','ets','associazione'],sectors:['sociale','salute'],beneficiaries:['persone fragili','famiglie'],activities:['assistenza','inclusione sociale'],purposes:['solidarietà sociale','salute'],tags:['Nazionale','ETS','Salute','Sociale'],eligibility:['Ente senza scopo di lucro con sede in Italia, costituito regolarmente e registrato almeno in un registro pubblico.','Procedure contabili e documentazione conformi al Regolamento e alle Linee guida.','Progetto coerente con le priorità del Fondo; massimo tre anni consecutivi per lo stesso progetto.'],hardRequirements:[{type:'document',label:'Verificare Regolamento, Linee guida, documentazione contabile, precedenti contributi e disponibilità del plafond'}],tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,continuousDeadlineConfirmed:true,verifiedAt:'2026-10-13',verificationNote:'Pagina ufficiale: destinatari, due tipologie di liberalità, valutazione annuale e termine speciale ricerca medica confermati il 13/10/2026. Verificare Regolamento e Linee guida sul singolo progetto.'}}
];
const seat=(places,which='legal_or_operational')=>({type:'seat',which,places,label:'Sede '+(which==='operational'?'operativa':which==='legal'?'legale':'legale o operativa')+' richiesta: '+places.join(', ')});
const unknown=label=>({type:'document',label});
export function reviewCall(b){
 const out={...b,tracking:{...b.tracking}};
 const rules={
  'UNIPOLIS-POP-2026':[{type:'foundation_year',min:2016,max:2024,label:'Costituzione tra il 2016 e il 2024; il cambio di nome non modifica la data originaria'},{type:'revenue',max:500000,label:'Entrate ultimo bilancio approvato non superiori a 500.000 €'}],
  'RLD12025048623':[seat(['lombardia']),{type:'revenue',max:50000,label:'Entrate ultimo bilancio depositato non superiori a 50.000 €'},unknown('Sede lombarda già presente alla pubblicazione dell’avviso; attività statutarie ammesse e deposito del bilancio')],
  'RLJ12026054688':[seat(['lombardia']),unknown('Partenariato di almeno 2 ETS per piccola scala o 4 per larga scala; sedi lombarde stabili di tutti i beneficiari')],
  'RLT12026053831':[seat(['lombardia']),unknown('ETS non commerciale e categoria del veicolo; se richiesta la rottamazione, intestazione da almeno 12 mesi')],
  'RLT12026052444':[seat(['lombardia'],'operational'),unknown('Partenariato e progetto di educazione ambientale in Lombardia')],
  'RLH12026055146':[seat(['lombardia'],'operational'),{type:'boolean',field:'legalPersonality',label:'Personalità giuridica richiesta'},{type:'number',field:'propertyAvailabilityYears',min:20,label:'Piena disponibilità dell’immobile per almeno 20 anni'},unknown('Intervento edilizio ammissibile destinato ad alloggi sociali')],
  'PIE-FCRC-ATTRAZIONE-PROGETTAZIONE-2026':[seat(['cuneo']),unknown('Proposta su bando aperto, partenariato e ricadute nel Cuneese')],
  'OXFAM-COPOWER-2026':[{type:'number',field:'genderRightsExperienceYears',min:2,label:'Capofila: almeno 2 anni di esperienza su violenza di genere, diritti delle donne e/o diritti umani; per partner almeno 1 anno'},unknown('Progetto coerente con prevenzione e contrasto della violenza di genere; contributo entro il 40% della media delle entrate degli ultimi due bilanci')],
  'MLPS-AVVISO-2-2026':[unknown('Interventi effettivi in almeno 10 regioni, costo del progetto entro le entrate del bilancio depositato (sommate in partenariato), cofinanziamento almeno 20%, durata 12–18 mesi')]
 };
 if(rules[out.id])out.hardRequirements=rules[out.id];
 if(out.id==='RLD12025048623'){
  out.maxGrant=5000;out.aid='Voucher fino a 5.000 €, a copertura del 100% del piano di innovazione.';
  out.eligibility=['Sede legale o operativa in Lombardia alla data di pubblicazione dell’avviso.','Entrate dell’ultimo bilancio depositato: non superiori a 50.000 €.','Attività art. 5 CTS lettere a, c, i, k e altri requisiti dell’Allegato A.'];
  out.evidenceUrls=[...(out.evidenceUrls||[]),'https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/download/8a5aa2919d8e5691019d91b4c68c002f?fileName=DDS+4806_26+Allegato_A_AVVISO.pdf'];
  out.tracking.verificationNote='Allegato A DDS 4806/2026, A.3 e B.1: limite entrate 50.000 € e voucher fino a 5.000 € confermati il 13/10/2026.';
  out.tracking.verifiedAt='2026-10-13';
  out.applicantChecks=(out.applicantChecks||[]).filter(c=>!String(c.label).includes('contributo massimo da verificare'));
  out.eligibility=out.eligibility.filter(x=>!String(x).includes('contributo massimo da verificare'));
 }
 if(out.id==='UNIPOLIS-POP-2026'){out.grantLabel='Contributo fisso';out.aid='Contributo fisso di 50.000 € per un piano di rafforzamento dell’organizzazione; non finanzia singoli progetti.';out.tracking.verifiedAt='2026-10-13';}
 if(out.id==='RLJ12026054688')out.aid='Contributo fino all’80%: massimo 40.000 € per piccola scala e 100.000 € per larga scala. Verificare rete, durata e garanzie per l’anticipo.';
 if(out.id==='RLT12026052444'){out.sectors=[...(out.sectors||[]),'salute'];out.purposes=[...(out.purposes||[]),'qualità dell’aria e salute'];}
 if(out.id==='UBI-UMANITARIO-2026'){out.title='Bando Umanitario 2026';out.eligibility=[...(out.eligibility||[]),'Esperienze analoghe da documentare e piano di visibilità del sostegno UBI; cofinanziamento minimo 30%, nel rispetto dei limiti sul volontariato.'];}
 if(out.id==='CARIPARO-RICHIESTE-LIBERE'){out.sourceUrl='https://fondazionecariparo.it/richieste-libere/';out.eligibility=[...(out.eligibility||[]),'Per salute: valutare il DPA 2026, che privilegia l’accordo con istituzioni sanitarie; attrezzature diagnostico-terapeutiche soggette a condizioni specifiche.'];}
 if(out.id==='CARIPARO-RICHIESTE-LIBERE')out.aid='Fino al 100% per progetti fino a 10.000 €. Oltre: cofinanziamento minimo 20% sulla quota di spesa fino a 100.000 € e 40% sulla quota superiore; spese generali e personale strutturato entro il 20% del costo.';
 if(out.id==='FCARIPARO-CER-2026'){
  out.deadlineType='continuous';out.tracking.continuousDeadlineConfirmed=true;
  out.hardRequirements=[seat(['padova','rovigo'],'legal'),seat(['padova','rovigo'],'operational'),unknown('Promozione di una CER non ancora costituita; dimensioni dell’ente e progetto conformi al regolamento')];
  out.eligibility=['Sede legale e operativa nelle province di Padova o Rovigo.','A sportello fino a esaurimento del plafond; disponibilità residua da verificare.','Contributo fino a 30.000 € subordinato all’esito del percorso tecnico.'];
  out.tracking.verifiedAt='2026-10-13';out.tracking.verificationNote='Regolamento 2.0: validità fino a esaurimento del plafond, sede legale e operativa PD/RO; controllato il 13/10/2026.';
 }
 if(out.id==='CONIBAMBINI-NOTE-COMUNITA-2026'){
  out.fund=5000000;out.maxGrant=400000;out.aid='Contributo da 250.000 a 400.000 €, cofinanziamento monetario minimo 10%; durata 36 mesi.';
  out.legalForms=['ets'];out.hardRequirements=[unknown('Responsabile ETS costituito da almeno 2 anni, sede legale nel capoluogo di intervento; partnership di almeno 3 soggetti secondo bando'),unknown('Pratica musicale per 6–18 anni; aree territoriali e quote di budget conformi al bando')];
  out.eligibility=['Partnership di almeno 3 soggetti: responsabile ETS, un altro ETS e soggetto pubblico o privato con finalità/esperienza musicale.','Capofila con sede legale nel comune capoluogo dell’intervento; esclusi capoluoghi di regione e aree indicate nel bando.','Intervento musicale inclusivo per minori 6–18 anni; verificare bilanci e documenti richiesti.'];
  out.tracking={...out.tracking,specificLegalFormConfirmed:true,eligibilityVerified:true,verifiedAt:'2026-10-13',verificationNote:'Bando ufficiale, sezioni 1.6 e 2: dotazione, importi, partenariato e requisiti letti il 13/10/2026.'};
 }
 if(out.id==='FCARIPARO-IMPRENDITORIA-SOCIALE-2026'){out.sourceStatus='sospeso';out.grantLabel='Tetto rimborso interessi';out.aid='Prestito fino a 500.000 €; rimborso interessi fino a 70.000 € ed eventuale premio secondo regolamento. La validità della finestra 2026 va confermata: il regolamento collegato riporta il 31/12/2025 salvo proroghe.';out.tracking.sourceMonitoringNeedsReview=true;}
 if(out.id==='OXFAM-COPOWER-2026'){out.eligibility=[...(out.eligibility||[]),'Seconda finestra: dal 1/12/2026 al 1/03/2027, ore 15. Requisiti differenti per capofila e partner.'];out.tracking.verifiedAt='2026-10-13';}
 out.applicantChecks=(out.applicantChecks||[]).filter(c=>!out.hardRequirements?.some(r=>r.label===c.label));
 const clean=s=>String(s).replace(/([A-Za-zÀ-ÿ])(\d)/g,'$1 $2').replace(/(\d)(anni|mesi|euro|milioni|mila)\b/g,'$1 $2');
 out.eligibility=[...new Set((out.eligibility||[]).map(clean))];
 out.applicantChecks=(out.applicantChecks||[]).map(c=>({...c,label:clean(c.label)}));
 if(out.tracking.verificationNote)out.tracking.verificationNote=clean(out.tracking.verificationNote);
 return applySourceReview(out);
}

export function enrichProfile(p){
 if(p.license!=='RB-0003'||!String(p.name).toLowerCase().includes('respiriamo insieme'))return p;
 // Source: https://respiriamoinsieme.org/chi-siamo/, checked 2026-10-13.
 const source='https://respiriamoinsieme.org/chi-siamo/';
 return {...p,foundationYear:p.foundationYear||2014,profileEvidence:source,seats:Array.isArray(p.seats)&&p.seats.length?p.seats:[
  {type:'legal',region:'Veneto',province:'Padova',city:'Padova',country:'Italia',source},
  {type:'operational',region:'Lombardia',province:'Milano',city:'Casorezzo',country:'Italia',source},
  {type:'operational',region:'Toscana',province:'Pistoia',city:'Pistoia',country:'Italia',source},
  {type:'operational',region:'Piemonte',province:'Torino',city:'Candiolo',country:'Italia',source},
  {type:'operational',region:'Lazio',province:'Roma',city:'Roma',country:'Italia',source},
  {type:'operational',region:'Friuli Venezia Giulia',province:'Trieste',city:'Muggia',country:'Italia',source},
  {type:'operational',region:'Campania',province:'Salerno',city:'Capaccio-Paestum',country:'Italia',source},
  {type:'operational',region:'Emilia Romagna',province:'Ravenna',city:'Ravenna',country:'Italia',source},
  {type:'operational',region:'Umbria',province:'Perugia',city:'Perugia',country:'Italia',source},
  {type:'operational',region:'Liguria',province:'Genova',city:'Genova',country:'Italia',source},
  {type:'operational',region:'Trentino Alto Adige',province:'Bolzano',city:'Chiusa',country:'Italia',source}
 ],seatsComplete:p.seatsComplete===true};
}

