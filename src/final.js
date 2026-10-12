import app from "./index.js";

const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const UNIVERSAL=["italia","nazionale","tutta italia","tutte le regioni","europa","unione europea","ue"];
const CROSS_REGION_VERIFIED=new Set(["RLA12025050323"]);

const VERIFIED_ADDITIONS=[
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
];

function territorySafe(b,region){
  const r=norm(region);
  if(!r)return true;
  if(CROSS_REGION_VERIFIED.has(String(b?.id||"")))return true;
  const territories=Array.isArray(b?.territories)?b.territories.map(norm).filter(Boolean):[];
  if(!territories.length)return true;
  if(territories.some(t=>UNIVERSAL.some(u=>t===u||t.includes(u))))return true;
  return territories.some(t=>t===r||t.includes(r)||r.includes(t));
}

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
  return out;
}

function postProcessCatalog(data,request){
  const url=new URL(request.url);
  const region=String(url.searchParams.get("region")||"").trim();
  const base=Array.isArray(data?.bandi)?data.bandi:[];
  const items=url.pathname==="/radar_bandi_catalogo_extra.json"?[...base,...VERIFIED_ADDITIONS]:base;
  const map=new Map();
  for(const item of items){if(item?.id)map.set(item.id,item)}
  const bandi=[...map.values()].map(officialCorrections).filter(b=>territorySafe(b,region));
  return {...data,updatedAt:"12/10/2026",selectedRegion:region||data?.selectedRegion||null,bandi};
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
    const headers=new Headers(response.headers);
    headers.set("content-type","application/json; charset=utf-8");
    headers.set("cache-control","no-store");
    headers.delete("content-length");
    return new Response(JSON.stringify(body),{status:response.status,headers});
  }
};
