import app from "./index.js";
import {reviewCall,REVIEWED_ADDITIONS} from "./review-rules.js";

const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const UNIVERSAL=["italia","nazionale","tutta italia","tutte le regioni","europa","unione europea","ue"];
const CROSS_REGION_VERIFIED=new Set(["RLA12025050323"]);

const VERIFIED_ADDITIONS=[{"id": "UBI-UMANITARIO-2026", "title": "Bando Umanitario 2026 – Cura della persona", "source": "Unione Buddhista Italiana", "deadline": "2026-10-22", "deadlineAt": "2026-10-22T12:00:00+02:00", "fund": 1200000, "maxGrant": 100000, "aid": "Contributo 10.000–100.000 euro, fino al 70% del costo; cofinanziamento minimo 30%.", "tags": ["Nazionale", "ETS", "Assistenza", "Caregiver", "Salute"], "eligibility": ["Associazioni ed ETS senza scopo di lucro", "Un solo progetto; esperienze analoghe documentabili", "Durata massima 12 mesi; copertura del cofinanziamento e documenti richiesti", "Requisiti della cliente da verificare. Area A comprende malattia grave e caregiver, con priorità ai giovani 11–21 anni. Scadenza ore 12 italiane."], "keywords": ["salute", "pazienti", "assistenza", "caregiver", "malattia", "supporto psicologico"], "sectors": ["salute", "sociale"], "beneficiaries": ["pazienti", "caregiver", "persone fragili"], "activities": ["assistenza", "supporto psicologico", "inclusione"], "purposes": ["cura della persona", "contrasto isolamento"], "territories": ["nazionale"], "legalForms": ["aps", "odv", "ets", "associazione", "fondazione", "cooperativa sociale"], "sourceUrl": "https://bandi8x1000.unionebuddhistaitaliana.it/vb/?bid=89", "verifiedAt": "2026-10-12", "eligibilityStatus": "da_verificare", "tracking": {"specificLegalFormConfirmed": true, "officialSourceVerified": true, "deadlineVerified": true, "eligibilityVerified": true, "verifiedAt": "2026-10-12", "verificationNote": "Requisiti della cliente da verificare. Area A comprende malattia grave e caregiver, con priorità ai giovani 11–21 anni. Scadenza ore 12 italiane. Fonte e regolamento consultati il12/10/2026."}, "applicantChecks": [{"label": "Documentare progetto, requisiti soggettivi e copertura economica secondo l’avviso ufficiale.", "status": "unknown"}], "hardRequirements": []}, {"id": "CARIPARO-RICHIESTE-LIBERE", "title": "Richieste libere – Qualità di vita, salute e inclusione", "source": "Fondazione Cariparo", "deadline": null, "deadlineType": "continuous", "fund": null, "maxGrant": null, "aid": "Fino al 100% per progetti fino a 10.000 euro; oltre tale soglia cofinanziamento minimo secondo le fasce della Fondazione.", "tags": ["Veneto", "Padova", "Rovigo", "ETS", "Salute", "Richieste libere"], "eligibility": ["ETS e altri enti ammessi dal Regolamento dell’Attività Istituzionale", "Intervento coerente con priorità della Fondazione e ricadute Padova/Rovigo", "Progetto non coperto da bandi pubblicati o annunciati", "Di norma non ammessi progetti avviati/conclusi, raccolte fondi e gestione ordinaria", "Canale continuativo, richieste durante tutto l’anno. Requisiti della cliente e del progetto da verificare. Territorio prioritario Padova/Rovigo. Nessuna scadenza annuale o massimale generale inventati."], "keywords": ["salute", "prevenzione", "assistenza", "famiglie", "disabilità", "pazienti"], "sectors": ["salute", "sociale"], "beneficiaries": ["persone fragili", "famiglie", "pazienti"], "activities": ["prevenzione", "servizi sociosanitari", "inclusione"], "purposes": ["qualità di vita", "salute"], "territories": ["veneto", "padova", "rovigo"], "legalForms": ["aps", "odv", "ets", "fondazione"], "sourceUrl": "https://fondazionecariparo.it/come-presentare-un-progetto/", "evidenceUrls": ["https://fondazionecariparo.it/cosa-sosteniamo/", "https://fondazionecariparo.it/wp-content/uploads/2024/11/Regolamento-Attivita-Istituzionale_Rev2024.pdf"], "verifiedAt": "2026-10-12", "eligibilityStatus": "da_verificare", "tracking": {"specificLegalFormConfirmed": true, "officialSourceVerified": true, "deadlineVerified": true, "eligibilityVerified": true, "verifiedAt": "2026-10-12", "verificationNote": "Canale continuativo, richieste durante tutto l’anno. Requisiti della cliente e del progetto da verificare. Territorio prioritario Padova/Rovigo. Nessuna scadenza annuale o massimale generale inventati. Fonte e regolamento consultati il12/10/2026.", "continuousDeadlineConfirmed": true}, "applicantChecks": [{"label": "Documentare progetto, requisiti soggettivi e copertura economica secondo l’avviso ufficiale.", "status": "unknown"}], "hardRequirements": []}].concat([
{
  id:"FCARIPARO-LUOGHI-NON-COMUNI-2026",
  title:"Luoghi (non) comuni: voci che contano",
  source:"Fondazione Cariparo",
  deadline:"2026-11-30",
  fund:4000000,
  maxGrant:200000,
  aid:"Contributo fino a 200.000 euro; cofinanziamento minimo 20%.",
  tags:["Veneto","Padova","Rovigo","ETS","Giovani","Rigenerazione","Qualità di vita"],
  eligibility:["Enti Pubblici o Enti del Terzo Settore in partnership tra loro","Sede legale o operativa nelle province di Padova o Rovigo","Spazi o beni pubblici e coinvolgimento attivo di giovani tra 15 e 29 anni","Domanda prima fase entro il 30 novembre 2026 alle ore 13:00"],
  keywords:["terzo settore","ets","giovani","comunità","inclusione","qualità di vita","rigenerazione","spazi pubblici","padova","rovigo"],
  sectors:["qualità di vita","sociale","cultura","comunità","inclusione"],
  beneficiaries:["giovani","comunità locali","cittadini"],
  activities:["co-progettazione","rigenerazione spazi","partecipazione giovanile","attività di comunità"],
  purposes:["partecipazione","benessere della comunità","rigenerazione","inclusione sociale"],
  territories:["veneto","padova","rovigo"],
  legalForms:["ets","aps","odv","ente pubblico"],
  hardRequirements:[{label:"Sede legale o operativa nelle province di Padova o Rovigo",anyOf:["padova","rovigo"]},{label:"Partnership tra Ente Pubblico ed Ente del Terzo Settore",anyOf:["partnership","ente pubblico","ets"]}],
  sourceUrl:"https://fondazionecariparo.it/iniziative/bando-luoghi-non-comuni-voci-che-contano/",
  tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:"2026-10-12",verificationNote:"Fonte ufficiale Fondazione Cariparo: bando in corso, ETS ammessi in partnership con enti pubblici, sede legale o operativa Padova/Rovigo, scadenza prima fase 30/11/2026 ore 13:00."}
},
{
  id:"FCARIPARO-IMPRENDITORIA-SOCIALE-2026",
  title:"Sostegno all’Imprenditoria sociale",
  source:"Fondazione Cariparo",
  deadline:null,
  fund:3000000,
  maxGrant:70000,
  aid:"Accesso a finanziamenti fino a 500.000 euro; rimborso del tasso di interesse fino a 70.000 euro.",
  tags:["Veneto","Padova","Rovigo","ETS","Impatto sociale","Qualità di vita"],
  eligibility:["Enti del Terzo Settore già operativi, neocostituiti o da costituire","Progetti da realizzare nelle province di Padova e Rovigo","Elevato impatto sociale e sostenibilità economica e ambientale","Pagina ufficiale in corso con candidatura online"],
  keywords:["terzo settore","ets","impatto sociale","welfare","qualità di vita","innovazione sociale","occupazione"],
  sectors:["welfare","sociale","qualità di vita","innovazione sociale"],
  beneficiaries:["comunità locali","persone fragili","cittadini"],
  activities:["servizi sociali","innovazione sociale","sviluppo organizzativo","creazione occupazione"],
  purposes:["impatto sociale","sostenibilità","qualità di vita"],
  territories:["veneto","padova","rovigo"],
  legalForms:["ets","aps","odv","fondazione","associazione"],
  hardRequirements:[{label:"Progetto realizzato nelle province di Padova o Rovigo",anyOf:["padova","rovigo"]}],
  sourceUrl:"https://fondazionecariparo.it/iniziative/sostegno-imprenditoria-sociale-2026/",
  tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:"2026-10-12",continuousDeadlineConfirmed:true,continuousDeadlineVerifiedAt:"2026-10-12",continuousDeadlineSource:"https://fondazionecariparo.it/iniziative/sostegno-imprenditoria-sociale-2026/",verificationNote:"La pagina ufficiale risulta in corso, ammette ETS e rende disponibile la candidatura online; non espone una data finale nella pagina verificata."}
},
{
  id:"FCARIPARO-CER-2026",
  title:"Comunità Energetiche Rinnovabili e altri progetti di transizione energetica",
  source:"Fondazione Cariparo",
  deadline:null,
  fund:2500000,
  maxGrant:30000,
  aid:"Supporto tecnico e contributo fino a 30.000 euro per CER e configurazioni di autoconsumo.",
  tags:["Veneto","Padova","Rovigo","ETS","RUNTS","CER","Energia"],
  eligibility:["ETS iscritti al RUNTS, enti pubblici, imprese sociali ed enti religiosi ammessi","Sede legale e operativa nelle province di Padova e Rovigo","CER o configurazioni di autoconsumo da realizzare a Padova/Rovigo","Pagina ufficiale in corso con domanda online"],
  keywords:["ets","runts","energia","comunità energetica","cer","sostenibilità","fotovoltaico","autoconsumo"],
  sectors:["energia","ambiente","sostenibilità","terzo settore"],
  beneficiaries:["enti del terzo settore","comunità locali","cittadini"],
  activities:["costituzione CER","progettazione energetica","autoconsumo","transizione energetica"],
  purposes:["sostenibilità ambientale","riduzione costi energetici","transizione energetica"],
  territories:["veneto","padova","rovigo"],
  legalForms:["ets","runts","aps","odv","impresa sociale","ente pubblico"],
  hardRequirements:[{label:"Sede legale e operativa nelle province di Padova o Rovigo",anyOf:["padova","rovigo"]}],
  sourceUrl:"https://fondazionecariparo.it/iniziative/bando-cer-comunita-energetiche-rinnovabili-e-altri-progetti-di-transizione-energetica/",
  tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:"2026-10-12",continuousDeadlineConfirmed:true,continuousDeadlineVerifiedAt:"2026-10-12",continuousDeadlineSource:"https://fondazionecariparo.it/iniziative/bando-cer-comunita-energetiche-rinnovabili-e-altri-progetti-di-transizione-energetica/",verificationNote:"Pagina ufficiale in corso; ETS RUNTS ammessi; sede legale e operativa Padova/Rovigo; domanda online disponibile; nessuna scadenza finale esposta nella pagina verificata."}
},
{
  id:"UNIPOLIS-POP-2026",
  title:"POP 2026 – Piccole Organizzazioni Protagoniste",
  source:"Fondazione Unipolis ETS",
  deadline:"2026-10-15",
  fund:300000,
  maxGrant:50000,
  aid:"Contributo di 50.000 euro per piani di consolidamento e crescita organizzativa.",
  tags:["Nazionale","Non profit","Welfare","Salute","Prevenzione","Capacity building"],
  eligibility:["Organizzazioni non profit con sede legale in Italia","Costituite da almeno 2 e non più di 10 anni","Entrate annue 2025 non superiori a 500.000 euro","Operative in disuguaglianze, mobilità o welfare","Domande entro il 15 ottobre 2026 alle ore 13:00"],
  keywords:["welfare","salute","benessere psico-fisico","servizi sociali","servizi sanitari","prevenzione","empowerment","non profit"],
  sectors:["welfare","salute","sociale","prevenzione"],
  beneficiaries:["persone fragili","comunità","utenti dei servizi sociali e sanitari"],
  activities:["capacity building","prevenzione","servizi sociali","servizi sanitari","empowerment","fundraising"],
  purposes:["rafforzamento organizzativo","benessere psico-fisico","accesso ai servizi","prevenzione"],
  territories:["nazionale"],
  legalForms:["associazione","aps","odv","ets","non profit"],
  hardRequirements:[{label:"Sede legale in Italia",anyOf:["italia","nazionale"]},{label:"Anzianità tra 2 e 10 anni e entrate 2025 non superiori a 500.000 euro",anyOf:["2 anni","10 anni","500000"]}],
  sourceUrl:"https://www.fondazioneunipolis.org/site/bando/bando-pop-2026/",
  tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:"2026-10-12",verificationNote:"Fonte ufficiale Unipolis: bando aperto 15/09-15/10/2026; non profit italiane, 2-10 anni, entrate 2025 <= 500.000 euro; area Welfare include benessere psico-fisico, servizi sociali/sanitari e prevenzione."}
},
{
  id:"OXFAM-COPOWER-2026",
  title:"CoPower – Bando nazionale 2026",
  source:"Oxfam Italia",
  deadline:"2026-11-23",
  fund:300000,
  maxGrant:50000,
  aid:"Sovvenzioni da 5.000 a 50.000 euro; prima finestra 200.000 euro.",
  tags:["Nazionale","ETS","Inclusione","Diritti","Violenza di genere"],
  eligibility:["ETS non societari o altri enti non profit indicati dal bando","Progetti realizzati in Italia","Focus obbligatorio su prevenzione e contrasto della violenza di genere","Prima finestra entro il 23 novembre 2026 ore 15:00"],
  keywords:["violenza di genere","donne","ragazze","inclusione","diritti","servizi di supporto"],
  sectors:["diritti","inclusione sociale","contrasto violenza di genere"],
  beneficiaries:["donne","ragazze","vittime e sopravvissute alla violenza"],
  activities:["servizi di supporto","prevenzione violenza","tutela","inclusione"],
  purposes:["contrasto alla violenza di genere","protezione","diritti"],
  territories:["nazionale"],
  legalForms:["ets","associazione","fondazione","comitato","non profit"],
  hardRequirements:[{label:"Progetto coerente con prevenzione e contrasto della violenza di genere",anyOf:["violenza di genere","donne","ragazze"]}],
  sourceUrl:"https://www.oxfamitalia.org/copower/",
  tracking:{specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:"2026-10-12",verificationNote:"Fonte ufficiale Oxfam Italia: prima finestra 24/08-23/11/2026 ore 15; progetti in Italia; budget 5.000-50.000 euro; focus specifico violenza di genere."}
},
{
  id:"CONIBAMBINI-NOTE-COMUNITA-2026",
  title:"Note di comunità – Esperienze musicali di quartiere",
  source:"Con i Bambini",
  deadline:"2026-10-16",
  fund:0,
  maxGrant:0,
  aid:"Contributi per progetti contro la povertà educativa minorile attraverso pratica musicale d’insieme.",
  tags:["Nazionale","ETS","Minori","Musica","Inclusione","Povertà educativa"],
  eligibility:["Progetti rivolti a bambini e ragazzi 6-18 anni","Pratica musicale d’insieme come leva di partecipazione e coesione sociale","Presentazione su piattaforma Chàiros entro il 16 ottobre 2026 ore 13:00","Requisiti completi di partnership da verificare nel testo ufficiale prima della candidatura"],
  keywords:["minori","musica","inclusione","povertà educativa","quartieri","coesione sociale"],
  sectors:["educazione","inclusione sociale","cultura"],
  beneficiaries:["bambini","adolescenti","giovani 6-18 anni"],
  activities:["pratica musicale","educazione","coesione sociale","attività di quartiere"],
  purposes:["contrasto povertà educativa","sviluppo personale","inclusione"],
  territories:["nazionale"],
  legalForms:["ets","non profit"],
  hardRequirements:[{label:"Progetto centrato su minori 6-18 anni e pratica musicale d'insieme",anyOf:["minori","bambini","adolescenti","musica"]}],
  sourceUrl:"https://www.conibambini.org/bandi-e-iniziative/bando-note-di-comunita-esperienze-musicali-di-quartiere/",
  tracking:{specificLegalFormConfirmed:false,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:false,verifiedAt:"2026-10-12",verificationNote:"Fonte ufficiale conferma finalità e scadenza; requisiti completi della partnership restano da controllare nel bando prima di considerare l'ente ammissibile."}
}
]);

function territorySafe(b,region){
  const r=norm(region);
  if(!r)return true;
  if(CROSS_REGION_VERIFIED.has(String(b?.id||"")))return true;
  const territories=Array.isArray(b?.territories)?b.territories.map(norm).filter(Boolean):[];
  if(!territories.length)return true;
  if(territories.some(t=>UNIVERSAL.some(u=>t===u||t.includes(u))))return true;
  return territories.some(t=>t===r||t.includes(r)||r.includes(t));
}

const REVIEWED={
 RLD12025048623:{deadlineAt:"2027-04-23T12:00:00+02:00",maxGrant:0,note:"Avviso DDS 4806/2026: sede legale/operativa lombarda richiesta, sezioni RUNTS ODV/APS/altri ETS e soggetti non profit specificati; piano d'innovazione. Termine 23/04/2027 ore12 salvo esaurimento; contributo massimo da verificare nell'allegato."},
 RLJ12026054688:{deadlineAt:"2026-10-16T17:00:00+02:00",note:"Avviso ufficiale Terzo Settore26-28: sede lombarda stabile di tutti i partner beneficiari, minimo2 partner piccola scala/4 larga scala, contributo80%, termine16/10/2026 ore17."},
 RLA12025050323:{deadlineAt:"2026-11-16T16:00:00+01:00",note:"Avviso manifestazioni: ammessi enti fuori Lombardia con evento di effettivo rilievo regionale; evento2026, domanda almeno60 giorni prima, termine16/11/2026 ore16."},
 RLT12026053831:{deadlineAt:"2027-04-30T12:00:00+02:00",maxGrant:30000,note:"Proroga decreto12266/2026:30/04/2027 ore12. DGR6031/2026 fino30000 euro secondo categoria; ETS non commerciali RUNTS con sede lombarda, non iscritti RegistroImprese/REA. Rottamazione di norma richiesta; eccezioni e-cargo/L1e/L5e a importo ridotto. Leasing escluso."},
 RLT12026052444:{deadlineAt:"2026-10-22T16:00:00+02:00",fund:150000,maxGrant:8000,note:"Fonte ufficiale: almeno una sede OPERATIVA lombarda obbligatoria, progetti ambientali/sostenibilità in Lombardia in partenariato; contributo fino8000 euro, fondo150000; termine22/10/2026 ore16."},
 RLH12026055146:{deadlineAt:"2026-10-30T12:00:00+01:00",maxGrant:2000000,note:"Avviso Housing linea3: personalità giuridica, sede operativa lombarda, piena disponibilità immobile per almeno20anni; massimo2milioni; termine30/10/2026 ore12."},
 'MLPS-AVVISO-2-2026':{deadlineAt:"2026-10-22T12:00:00+02:00",note:"Avviso2/2026 MLPS: APS/ODV RUNTS; interventi effettivi in almeno10 regioni,12-18mesi; contributo250-500mila; cofinanziamento20% e limiti ricavi bilancio; termine22/10/2026 ore12."},
 'PIE-FCRC-ATTRAZIONE-PROGETTAZIONE-2026':{note:"Fonte CRC: sede legale O operativa in provincia Cuneo e ricadute nel Cuneese;31/12/2026 salvo esaurimento; massimo8000 capofila/4000 partner, fino80%. Piemonte generico non soddisfa requisito."}
};
function officialCorrections(b){
  if(!b||typeof b!=="object")return b;
  const out={...b,tracking:{...(b.tracking||{})}};
  if(out.id==="RLT12026053831"){
    out.deadline="2027-04-30";
    out.tracking.officialSourceVerified=true;
    out.tracking.deadlineVerified=true;
    out.tracking.verifiedAt="2026-10-12";
    out.tracking.verificationNote="Scadenza differita alle ore 12:00 del 30/04/2027; beneficiari ETS non commerciali con sede legale o operativa in Lombardia.";
  }
  if(out.id==="RLA12025050323"){
    out.tracking.officialSourceVerified=true;
    out.tracking.deadlineVerified=true;
    out.tracking.eligibilityVerified=true;
    out.tracking.specificLegalFormConfirmed=true;
    out.tracking.verifiedAt="2026-10-12";
    out.tracking.verificationNote="APS/ODV e altri enti non profit ammessi; per enti fuori Lombardia serve un'iniziativa di effettivo rilievo regionale che valorizzi identità e immagine della Lombardia; scadenza 16/11/2026 ore 16:00.";
  }
  if(out.id==="MLPS-AVVISO-2-2026"){
    out.deadline="2026-10-22";
    out.tracking.specificLegalFormConfirmed=true;
    out.tracking.officialSourceVerified=true;
    out.tracking.deadlineVerified=true;
    out.tracking.eligibilityVerified=true;
    out.tracking.verifiedAt="2026-10-12";
    out.tracking.verificationNote="APS/ODV iscritte al RUNTS ammesse; attività effettive in almeno 10 regioni; durata 12-18 mesi; contributo 250.000-500.000 euro; cofinanziamento APS/ODV almeno 20%; scadenza 22/10/2026 ore 12:00.";
  }
  if(out.id==="FC-HOUSING-FRAGILI-2026"||out.id==="FC-NUOVI-PONTI-2026"){
    out.tracking.continuousDeadlineConfirmed=true;
    out.tracking.continuousDeadlineVerifiedAt="2026-10-12";
    out.tracking.continuousDeadlineSource=out.sourceUrl;
  }
  const review=REVIEWED[out.id];
  if(review){
    for(const k of ['deadlineAt','fund','maxGrant'])if(review[k]!==undefined)out[k]=review[k];
    out.tracking={...out.tracking,specificLegalFormConfirmed:true,officialSourceVerified:true,deadlineVerified:true,eligibilityVerified:true,verifiedAt:'2026-10-12',verificationNote:review.note};
    out.eligibility=[review.note,...(out.eligibility||[])];
    // Rules of the call are verified; fulfilment by a particular client is not.
    out.applicantChecks=[{label:review.note,status:'unknown'}];
  }
  if(out.id==='PIE-FCRC-ATTRAZIONE-PROGETTAZIONE-2026')out.hardRequirements=[{label:'Sede legale o operativa in provincia di Cuneo',anyOf:['cuneo']}];
  if(out.id==='RLT12026052444')out.hardRequirements=[{label:'Sede operativa in Lombardia',anyOf:['lombardia']}];
  if(out.id==='FCARIPARO-LUOGHI-NON-COMUNI-2026')out.deadlineAt='2026-11-30T13:00:00+01:00';
  if(out.id==='UNIPOLIS-POP-2026')out.deadlineAt='2026-10-15T13:00:00+02:00';
  if(out.id==='OXFAM-COPOWER-2026')out.deadlineAt='2026-11-23T15:00:00+01:00';
  if(out.id==='CONIBAMBINI-NOTE-COMUNITA-2026')out.deadlineAt='2026-10-16T13:00:00+02:00';
  if(['FCARIPARO-CER-2026','FCARIPARO-IMPRENDITORIA-SOCIALE-2026'].includes(out.id)){
    // An absent closing date on a page is not proof of an unlimited window.
    out.tracking.continuousDeadlineConfirmed=false;
    out.eligibility=[...(out.eligibility||[]),'Data finale non indicata nella pagina: verificare il regolamento e la disponibilità delle risorse.'];
  }
  return out;
}
function current(b){
 if(['chiuso','scaduto','revocato','annullato','sospeso'].includes(norm(b?.sourceStatus)))return false;
 if(b?.deadlineAt){const t=Date.parse(b.deadlineAt);return Number.isFinite(t)&&t>=Date.now();}
 if(!b?.deadline)return true;
 return /^\d{4}-\d{2}-\d{2}$/.test(b.deadline)&&b.deadline>=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}

function postProcessCatalog(data,request){
  const url=new URL(request.url);
  const region=String(url.searchParams.get("region")||"").trim();
  const base=Array.isArray(data?.bandi)?data.bandi:[];
  const items=url.pathname==="/radar_bandi_catalogo_extra.json"?[...base,...VERIFIED_ADDITIONS,...REVIEWED_ADDITIONS]:base;
  const map=new Map();
  for(const item of items){if(item?.id)map.set(item.id,item)}
  const bandi=[...map.values()].map(officialCorrections).map(reviewCall).filter(b=>territorySafe(b,region)&&current(b));
  return {...data,updatedAt:data.updatedAt||"12/10/2026",selectedRegion:region||data?.selectedRegion||null,bandi};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const isCatalog=url.pathname==="/radar_bandi_catalogo.json"||url.pathname==="/radar_bandi_catalogo_extra.json";
    if(!isCatalog||url.searchParams.has("raw"))return app.fetch(request,env,ctx);
    const response=await app.fetch(request,env,ctx);
    if(!response.ok)return response;
    const type=response.headers.get("content-type")||"";
    if(!type.includes("application/json"))return response;
    let data;
    try{data=await response.json()}catch{return response}
    const body=postProcessCatalog(data,request);
    try{
      const checksResponse=await env.ASSETS.fetch(new Request(url.origin+'/radar_bandi_source_checks.json'));
      if(checksResponse.ok){
        const checks=(await checksResponse.json()).checks||{};
        const reviewIds=new Set(Object.values(checks).filter(c=>c.needsReview).map(c=>c.bandoId));
        body.bandi=body.bandi.map(b=>reviewIds.has(b.id)?{...b,tracking:{...b.tracking,sourceMonitoringNeedsReview:true}}:b);
      }
    }catch{}

    const headers=new Headers(response.headers);
    headers.set("content-type","application/json; charset=utf-8");
    headers.set("cache-control","no-store");
    headers.delete("content-length");
    return new Response(JSON.stringify(body),{status:response.status,headers});
  }
};

