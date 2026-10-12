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

  const legalOnly=[
    "sede legale in",
    "sede legale nella",
    "sede legale nel",
    "sede legale e operativa",
    "sede legale ed operativa"
  ];
  const legalOrOperational=t.includes("sede legale o operativa")||t.includes("sede legale oppure operativa");
  if(!legalOrOperational&&legalOnly.some(x=>t.includes(x)))return false;

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
    return {...r,anyOf:Array.isArray(r?.anyOf)?r.anyOf:[]};
  }):[];
  return {
    ...b,
    tags:[...new Set([...(Array.isArray(b?.tags)?b.tags:[]),"Operatività territoriale"])],
    territories:Array.isArray(b?.territories)?b.territories:[],
    eligibility:[note,...(Array.isArray(b?.eligibility)?b.eligibility:[])],
    hardRequirements,
    tracking:{...(b?.tracking||{}),territoryAccessByDeclaredOperations:true,territoryAccessNote:note}
  };
}

async function catalogResponse(request,env,ctx){
  const url=new URL(request.url);
  const region=String(url.searchParams.get("region")||"").trim();
  const national=url.searchParams.get("scope")==="national";

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

const DASHBOARD_TERRITORY_UI=`<script id="bandovera-territory-ui">(()=>{try{const raw=new URLSearchParams(location.search).get('p');if(!raw)return;const c=raw.trim().replace(/\\s+/g,'');const b=(c+'='.repeat((4-c.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');const bytes=Uint8Array.from(atob(b),x=>x.charCodeAt(0));const p=JSON.parse(new TextDecoder().decode(bytes))||{};const sub=document.getElementById('subtitle');if(sub){const type=p.type||'ETS';const region=p.region||'';const op=p.operatingTerritory||p.territoryScope||'';let text=type;if(region)text+=' · Sede: '+region;if(op)text+=' · Operatività: '+op;sub.textContent=text;}const obs=new MutationObserver(()=>{document.querySelectorAll('.tag').forEach(el=>{if((el.textContent||'').trim().toLowerCase()==='operatività territoriale'){el.style.border='1px solid rgba(103,185,255,.55)';el.style.color='#9ed8ff';el.title='Bando mostrato perché il profilo dichiara operatività nel territorio; verificare il requisito specifico prima della candidatura.';}})});obs.observe(document.body,{childList:true,subtree:true});setTimeout(()=>obs.disconnect(),15000);}catch(e){console.warn('Territory UI',e)}})();</script>`;

async function dashboardResponse(request,env,ctx){
  const response=await app.fetch(request,env,ctx);
  if(!response.ok)return response;
  const type=response.headers.get("content-type")||"";
  if(!type.includes("text/html"))return response;
  let html=await response.text();
  const end=html.lastIndexOf("</body>");
  html=end<0?html+DASHBOARD_TERRITORY_UI:html.slice(0,end)+DASHBOARD_TERRITORY_UI+html.slice(end);
  const headers=new Headers(response.headers);
  headers.set("content-type","text/html; charset=utf-8");
  headers.set("cache-control","no-store");
  headers.delete("content-length");
  return new Response(html,{status:response.status,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const isCatalog=url.pathname==="/radar_bandi_catalogo.json"||url.pathname==="/radar_bandi_catalogo_extra.json";
    if(isCatalog&&!url.searchParams.has("raw"))return catalogResponse(request,env,ctx);
    const accept=request.headers.get("accept")||"";
    if(request.method==="GET"&&(url.pathname==="/"||accept.includes("text/html")))return dashboardResponse(request,env,ctx);
    return app.fetch(request,env,ctx);
  }
};