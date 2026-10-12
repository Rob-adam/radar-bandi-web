import app from "./index.js";

const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const UNIVERSAL=["italia","nazionale","tutta italia","tutte le regioni","europa","unione europea","ue"];
const CROSS_REGION_VERIFIED=new Set(["RLA12025050323"]);

const VERIFIED_ADDITIONS=[{
  id:"FCARIPARO-LUOGHI-NON-COMUNI-2026",
  title:"Luoghi (non) comuni: voci che contano",
  source:"Fondazione Cariparo",
  deadline:"2026-11-30",
  fund:4000000,
  maxGrant:200000,
  aid:"Contributo fino a 200.000 euro; cofinanziamento minimo 20%.",
  tags:["Veneto","Padova","Rovigo","ETS","Giovani","Rigenerazione","Qualità di vita"],
  eligibility:[
    "Enti Pubblici o Enti del Terzo Settore in partnership tra loro",
    "Sede legale o operativa nelle province di Padova o Rovigo",
    "Spazi o beni pubblici e coinvolgimento attivo di giovani tra 15 e 29 anni",
    "Domanda prima fase entro il 30 novembre 2026 alle ore 13:00"
  ],
  keywords:["terzo settore","ets","giovani","comunità","inclusione","qualità di vita","rigenerazione","spazi pubblici","padova","rovigo"],
  sectors:["qualità di vita","sociale","cultura","comunità","inclusione"],
  beneficiaries:["giovani","comunità locali","cittadini"],
  activities:["co-progettazione","rigenerazione spazi","partecipazione giovanile","attività di comunità"],
  purposes:["partecipazione","benessere della comunità","rigenerazione","inclusione sociale"],
  territories:["veneto","padova","rovigo"],
  legalForms:["ets","aps","odv","ente pubblico"],
  hardRequirements:[
    {label:"Sede legale o operativa nelle province di Padova o Rovigo",anyOf:["padova","rovigo"]},
    {label:"Partnership tra Ente Pubblico ed Ente del Terzo Settore",anyOf:["partnership","ente pubblico","ets"]}
  ],
  sourceUrl:"https://fondazionecariparo.it/iniziative/bando-luoghi-non-comuni-voci-che-contano/",
  tracking:{
    specificLegalFormConfirmed:true,
    officialSourceVerified:true,
    deadlineVerified:true,
    eligibilityVerified:true,
    verifiedAt:"2026-10-12",
    verificationNote:"Fonte ufficiale Fondazione Cariparo: bando in corso, ETS ammessi in partnership con enti pubblici, sede legale o operativa Padova/Rovigo, scadenza prima fase 30/11/2026 ore 13:00."
  }
}];

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

  // Regione Lombardia: termine differito con decreto n. 12266 del 21/09/2026.
  if(out.id==="RLT12026053831"){
    out.deadline="2027-04-30";
    out.tracking.officialSourceVerified=true;
    out.tracking.deadlineVerified=true;
    out.tracking.verifiedAt="2026-10-12";
    out.tracking.verificationNote="Scadenza differita alle ore 12:00 del 30/04/2027; beneficiari ETS non commerciali con sede legale o operativa in Lombardia.";
  }

  // Regione Lombardia L.R. 50/1986: ammette anche enti con sede fuori Lombardia se l'iniziativa valorizza l'identità regionale.
  if(out.id==="RLA12025050323"){
    out.tracking.officialSourceVerified=true;
    out.tracking.deadlineVerified=true;
    out.tracking.eligibilityVerified=true;
    out.tracking.specificLegalFormConfirmed=true;
    out.tracking.verifiedAt="2026-10-12";
    out.tracking.verificationNote="APS/ODV e altri enti non profit ammessi; per enti fuori Lombardia serve un'iniziativa di effettivo rilievo regionale che valorizzi identità e immagine della Lombardia; scadenza 16/11/2026 ore 16:00.";
  }

  // Verifica completa dell'Avviso MLPS 2/2026 sul testo ufficiale del 10/09/2026.
  if(out.id==="MLPS-AVVISO-2-2026"){
    out.deadline="2026-10-22";
    out.tracking.specificLegalFormConfirmed=true;
    out.tracking.officialSourceVerified=true;
    out.tracking.deadlineVerified=true;
    out.tracking.eligibilityVerified=true;
    out.tracking.verifiedAt="2026-10-12";
    out.tracking.verificationNote="APS/ODV iscritte al RUNTS ammesse; attività effettive in almeno 10 regioni; durata 12-18 mesi; contributo 250.000-500.000 euro; cofinanziamento APS/ODV almeno 20%; scadenza 22/10/2026 ore 12:00.";
  }

  // Fondazione Cariplo: pagine ufficiali indicano espressamente bandi attivi senza scadenza.
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
