import app from "./final.js";

const norm=v=>String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const UNIVERSAL=["italia","nazionale","tutta italia","tutte le regioni","europa","unione europea","ue"];

function textOf(b){
  return norm([
    b?.title,
    ...(Array.isArray(b?.eligibility)?b.eligibility:[]),
    ...(Array.isArray(b?.hardRequirements)?b.hardRequirements.map(x=>x?.label||""):[]),
    b?.tracking?.verificationNote||""
  ].join(" "));
}

function isUniversal(b){
  const territories=Array.isArray(b?.territories)?b.territories.map(norm).filter(Boolean):[];
  return territories.some(t=>UNIVERSAL.some(u=>t===u||t.includes(u)));
}

function matchesRegion(b,region){
  const r=norm(region);
  if(!r)return true;
  const territories=Array.isArray(b?.territories)?b.territories.map(norm).filter(Boolean):[];
  return territories.some(t=>t===r||t.includes(r)||r.includes(t));
}

function operationalAccessAllowed(b){
  const t=textOf(b);
  if(!t)return false;

  // Requisiti che impongono la sede legale (o sede legale E operativa) non
  // possono essere soddisfatti dalla sola operativita nazionale dichiarata.
  const legalOnly=[
    "sede legale in",
    "sede legale nella",
    "sede legale nel",
    "sede legale e operativa",
    "sede legale ed operativa"
  ];
  const legalOrOperational=t.includes("sede legale o operativa")||t.includes("sede legale oppure operativa");
  if(!legalOrOperational&&legalOnly.some(x=>t.includes(x)))return false;

  // Accesso possibile quando la fonte ammette operativita, progetto o iniziativa
  // nel territorio, senza obbligare la sola sede legale nella regione.
  return legalOrOperational||[
    "sede operativa",
    "operanti nella",
    "operanti nel",
    "operativita nella",
    "operativita nel",
    "progetto localizzato",
    "progetto realizzato",
    "progetti da realizzare",
    "progetto da realizzare",
    "iniziativa di effettivo rilievo regionale",
    "iniziativa in lombardia",
    "attivita in lombardia",
    "attivita sul territorio"
  ].some(x=>t.includes(x));
}

function adaptForNationalOperations(b,homeRegion){
  const note="Accesso territoriale preliminare: il profilo dichiara operativita nazionale. Il bando viene mostrato perche la fonte ammette operativita, progetto o iniziativa nel territorio anche senza coincidenza con la regione della sede principale. Prima della candidatura va documentata l'effettiva presenza/attivita richiesta nel territorio del bando.";
  const hardRequirements=Array.isArray(b?.hardRequirements)?b.hardRequirements.map(r=>{
    const label=norm(r?.label||"");
    const isOperationalGeo=label.includes("sede legale o operativa")||label.includes("sede operativa")||label.includes("progetto")||label.includes("iniziativa")||label.includes("operativita");
    if(!isOperationalGeo)return r;
    return {...r,anyOf:[...new Set([...(Array.isArray(r?.anyOf)?r.anyOf:[]),"italia","nazionale"])]};
  }):[];
  return {
    ...b,
    territories:[...new Set([...(Array.isArray(b?.territories)?b.territories:[]),homeRegion].filter(Boolean))],
    eligibility:[note,...(Array.isArray(b?.eligibility)?b.eligibility:[])],
    hardRequirements,
    tracking:{...(b?.tracking||{}),territoryAccessByDeclaredOperations:true,territoryAccessNote:note}
  };
}

async function catalogResponse(request,env,ctx){
  const url=new URL(request.url);
  const region=String(url.searchParams.get("region")||"").trim();
  const national=url.searchParams.get("scope")==="national";

  // Per profili con operativita nazionale chiediamo al motore interno il catalogo
  // non prefiltrato per la sola regione di sede, poi applichiamo qui un filtro piu
  // preciso basato sui requisiti territoriali dichiarati nelle schede.
  const innerUrl=new URL(url);
  if(national)innerUrl.searchParams.delete("region");
  const innerRequest=new Request(innerUrl.toString(),request);
  const response=await app.fetch(innerRequest,env,ctx);
  if(!response.ok)return response;
  const type=response.headers.get("content-type")||"";
  if(!type.includes("application/json"))return response;

  let data;
  try{data=await response.json()}catch{return response}
  if(!Array.isArray(data?.bandi))return response;

  let bandi=data.bandi;
  if(region){
    bandi=bandi.flatMap(b=>{
      if(isUniversal(b)||matchesRegion(b,region))return [b];
      if(national&&operationalAccessAllowed(b))return [adaptForNationalOperations(b,region)];
      return [];
    });
  }

  const headers=new Headers(response.headers);
  headers.set("content-type","application/json; charset=utf-8");
  headers.set("cache-control","no-store");
  headers.delete("content-length");
  return new Response(JSON.stringify({...data,selectedRegion:region||data.selectedRegion||null,operatingScope:national?"national":data.operatingScope||null,bandi}),{status:response.status,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const isCatalog=url.pathname==="/radar_bandi_catalogo.json"||url.pathname==="/radar_bandi_catalogo_extra.json";
    if(isCatalog&&!url.searchParams.has("raw"))return catalogResponse(request,env,ctx);
    return app.fetch(request,env,ctx);
  }
};