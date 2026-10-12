import app from "./index.js";

const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const UNIVERSAL=["italia","nazionale","tutta italia","tutte le regioni","europa","unione europea","ue"];

function territorySafe(b,region){
  const r=norm(region);
  if(!r)return true;
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
  const items=Array.isArray(data?.bandi)?data.bandi:[];
  const bandi=items.map(officialCorrections).filter(b=>territorySafe(b,region));
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
