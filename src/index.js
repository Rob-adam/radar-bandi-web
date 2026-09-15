const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

function normalizeCode(v){return String(v||"").trim().toUpperCase().replace(/[^A-Z0-9-]/g,"");}
function isExpired(expiresAt){if(!expiresAt)return false;const t=Date.parse(expiresAt+"T23:59:59");return Number.isFinite(t)&&t<Date.now();}
function authOk(request,env){const h=request.headers.get("authorization")||"";return !!env.ADMIN_API_KEY&&h===`Bearer ${env.ADMIN_API_KEY}`;}
function versionTimestamp(env){return env.CF_VERSION_METADATA?.timestamp||null;}
function normTerritory(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function decodeProfileRegion(raw){try{if(!raw)return "";const c=String(raw).trim().replace(/\s+/g,"");const b=(c+"=".repeat((4-c.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");const bytes=Uint8Array.from(atob(b),x=>x.charCodeAt(0));const p=JSON.parse(new TextDecoder().decode(bytes));return String(p.region||"").trim();}catch{return "";}}
function encodeProfile(profile){const bytes=new TextEncoder().encode(JSON.stringify(profile||{}));let bin="";for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function profileRegionFromRequest(request){try{return decodeProfileRegion(new URL(request.url).searchParams.get("p"));}catch{return "";}}
function regionFromRequest(request){
 try{
  const own=new URL(request.url);
  const explicit=String(own.searchParams.get("region")||"").trim();
  if(explicit)return explicit;
  const ref=request.headers.get("referer")||"";
  if(ref){const r=new URL(ref);const fromProfile=decodeProfileRegion(r.searchParams.get("p"));if(fromProfile)return fromProfile;}
 }catch{}
 return "";
}
function territoryAllowed(b,region){const r=normTerritory(region);if(!r)return true;const territories=Array.isArray(b?.territories)?b.territories.map(normTerritory).filter(Boolean):[];if(!territories.length)return true;const universal=["italia","nazionale","tutta italia","tutte le regioni","europa","unione europea","ue"];
 if(territories.some(t=>universal.some(u=>t===u||t.includes(u))))return true;
 return territories.some(t=>t===r||t.includes(r)||r.includes(t));
}
function cleanProfile(input,code,rec){
 if(!input||typeof input!=="object")return null;
 const s=v=>String(v??"").slice(0,4000);
 return {
  name:s(input.name||rec?.name),type:s(input.type),region:s(input.region),province:s(input.province),operatingTerritory:s(input.operatingTerritory),runts:s(input.runts),areas:s(input.areas),activities:s(input.activities),sector:s(input.sector),subSector:s(input.subSector),beneficiaries:s(input.beneficiaries),statutoryPurposes:s(input.statutoryPurposes),capabilities:s(input.capabilities),license:code,active:rec?.active!==false,createdAt:s(input.createdAt),expiresAt:s(rec?.expiresAt||input.expiresAt),price:Number(rec?.price??input.price)||0,durationMonths:Number(input.durationMonths)||0
 };
}
function shortLinkError(code,message,status=404){return new Response(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BANDOVERA · Link cliente</title><style>body{margin:0;background:#07111f;color:#edf5ff;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial;display:grid;place-items:center;min-height:100vh;padding:24px}.box{max-width:620px;background:#0e1b2c;border:1px solid #243a55;border-radius:18px;padding:28px;text-align:center}.muted{color:#9fb2c8}.code{margin-top:16px;font-weight:800;color:#50d5ff}</style></head><body><div class="box"><h1>Link BANDOVERA non disponibile</h1><p class="muted">${message}</p><div class="code">${String(code||"").replace(/[&<>]/g,"")}</div></div></body></html>`,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});}

const clientGuard=`<script id="bandovera-license-guard">(()=>{try{const raw=new URLSearchParams(location.search).get('p');if(!raw)return;const c=raw.trim().replace(/\\s+/g,'');const b=(c+'='.repeat((4-c.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');const bytes=Uint8Array.from(atob(b),x=>x.charCodeAt(0));const p=JSON.parse(new TextDecoder().decode(bytes));const code=String(p.license||'').trim();if(!code)return;function showState(text,ok){const box=document.querySelector('.license');if(!box)return;let el=document.getElementById('licenseCloudState');if(!el){el=document.createElement('div');el.id='licenseCloudState';el.style.cssText='margin-top:8px;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:900;padding:5px 8px;border-radius:999px;border:1px solid '+(ok?'#215c49':'#6a2c38')+';background:'+(ok?'#10382e':'#3b1720')+';color:'+(ok?'#8af0c3':'#ffb4bd');box.appendChild(el)}el.textContent='● '+text}function showVersion(ts){if(!ts)return;const el=document.getElementById('appUpdatedBadge');if(!el)return;const d=new Date(ts);el.textContent='Ultimo aggiornamento BANDOVERA: '+new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)}function addLegalUi(){const refresh=document.getElementById('refreshBtn');if(refresh)refresh.remove();if(document.getElementById('bandoveraLegalLinks'))return;const footer=document.querySelector('.product-footer');if(!footer)return;const wrap=document.createElement('div');wrap.id='bandoveraLegalLinks';wrap.style.cssText='display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px';wrap.innerHTML='<button type="button" data-legal="privacy" style="border:0;background:none;color:#67d8d0;cursor:pointer;padding:0;font:inherit">Privacy</button><span style="color:#4e6a7d">·</span><button type="button" data-legal="policy" style="border:0;background:none;color:#67d8d0;cursor:pointer;padding:0;font:inherit">Policy</button>';footer.appendChild(wrap);const modal=document.createElement('div');modal.id='bandoveraLegalModal';modal.style.cssText='position:fixed;inset:0;background:rgba(0,6,13,.82);backdrop-filter:blur(4px);display:none;place-items:center;padding:20px;z-index:9999';modal.innerHTML='<div style="width:min(760px,100%);max-height:82vh;overflow:auto;background:#0e1b2c;border:1px solid #243a55;border-radius:18px;padding:24px;color:#edf5ff;box-shadow:0 30px 90px rgba(0,0,0,.45)"><div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start"><h2 id="bandoveraLegalTitle" style="margin:0 0 16px"></h2><button id="bandoveraLegalClose" type="button" style="border:1px solid #2a4a61;background:#102438;color:#edf5ff;border-radius:9px;padding:7px 10px;cursor:pointer">Chiudi</button></div><div id="bandoveraLegalBody" style="color:#c4d6e2;line-height:1.65;font-size:14px"></div></div>';document.body.appendChild(modal);const privacy='<p><b>Informativa privacy BANDOVERA</b></p><p>BANDOVERA tratta esclusivamente i dati necessari alla gestione della licenza, alla personalizzazione del servizio e alle eventuali richieste di supporto inviate dall\'utente.</p><p>I dati non vengono utilizzati per finalità diverse da quelle connesse all\'erogazione del servizio, salvo obblighi di legge o specifico consenso dell\'interessato.</p><p>Per richieste relative ai dati personali, rettifica o cancellazione è possibile contattare il gestore del servizio.</p>';const policy='<p><b>Policy di utilizzo BANDOVERA</b></p><p>BANDOVERA è uno strumento informativo di supporto alla ricerca di bandi e opportunità per gli Enti del Terzo Settore.</p><p>I punteggi di compatibilità sono orientativi e non costituiscono garanzia di ammissibilità, concessione del contributo o finanziamento. Prima di presentare una candidatura è necessario verificare sempre il testo ufficiale del bando, gli allegati, i requisiti e le scadenze pubblicate dall\'ente promotore.</p><p>La licenza è nominativa e destinata esclusivamente all\'organizzazione per la quale è stata attivata.</p>';function openLegal(kind){document.getElementById('bandoveraLegalTitle').textContent=kind==='privacy'?'Privacy':'Policy';document.getElementById('bandoveraLegalBody').innerHTML=kind==='privacy'?privacy:policy;modal.style.display='grid'}wrap.addEventListener('click',e=>{const b=e.target.closest('[data-legal]');if(b)openLegal(b.dataset.legal)});document.getElementById('bandoveraLegalClose').onclick=()=>modal.style.display='none';modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none'})}addLegalUi();fetch('/api/license/'+encodeURIComponent(code),{cache:'no-store'}).then(r=>r.json()).then(s=>{if(!s)return;showVersion(s.versionTimestamp);if(!s.configured||!s.registered)return;if(s.active===false||s.expired){showState('SOSPESA',false);document.documentElement.innerHTML='<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BANDOVERA · Licenza non attiva</title><style>body{margin:0;background:#07111f;color:#edf5ff;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial;display:grid;place-items:center;min-height:100vh;padding:24px}.box{max-width:620px;background:#0e1b2c;border:1px solid #243a55;border-radius:18px;padding:28px;text-align:center}.box h1{margin:0 0 12px}.muted{color:#9fb2c8}.code{margin-top:16px;font-weight:800;color:#50d5ff}.state{display:inline-block;margin-top:14px;padding:6px 10px;border-radius:999px;background:#3b1720;border:1px solid #6a2c38;color:#ffb4bd;font-size:12px;font-weight:900}</style></head><body><div class="box"><h1>Licenza BANDOVERA non attiva</h1><p class="muted">Il servizio è sospeso o la licenza è scaduta. Per riattivare l’accesso è necessario il rinnovo del servizio.</p><div class="state">● SOSPESA</div><div class="code">'+code.replace(/[&<>]/g,'')+'</div></div></body></html>';}else{showState('ATTIVA',true)}}).catch(()=>{});}catch(e){console.warn('BANDOVERA license check',e)}})();</script>`;

const adminSync=`<script id="bandovera-admin-sync">
(()=>{
 const KEY='radar_bandi_admin_clients_v1';
 const SK='bandovera_admin_api_key';
 const LOADED='bandovera_cloud_clients_loaded_v1';

 function apiKey(){
  let k=sessionStorage.getItem(SK)||'';
  if(!k){
   k=prompt('Chiave amministratore BANDOVERA per la gestione centralizzata delle licenze:')||'';
   if(k)sessionStorage.setItem(SK,k);
  }
  return k;
 }

 function clients(){
  try{return JSON.parse(localStorage.getItem(KEY)||'[]')}
  catch{return []}
 }

 function licenseCode(c){
  return String(c?.license||'').trim().toUpperCase();
 }

 async function sync(c){
  if(!c||!c.license)return false;
  const key=apiKey();
  if(!key)return false;

  try{
   const r=await fetch('/api/admin/license',{
    method:'POST',
    headers:{
     'content-type':'application/json',
     'authorization':'Bearer '+key
    },
    body:JSON.stringify({
     license:c.license,
     name:c.name||'',
     active:c.active!==false,
     expiresAt:c.expiresAt||'',
     price:+c.price||0,
     profile:c
    })
   });

   const d=await r.json();

   if(!r.ok){
    if(r.status===401)sessionStorage.removeItem(SK);
    alert(d.error||'Sincronizzazione licenza non riuscita.');
    return false;
   }

   console.info('Licenza centralizzata aggiornata',d);
   return true;
  }catch(e){
   alert('Archivio licenze centrale non disponibile.');
   return false;
  }
 }

 async function loadFromCloud(){
  if(sessionStorage.getItem(LOADED))return;

  const key=apiKey();
  if(!key)return;

  try{
   const r=await fetch('/api/admin/licenses',{
    headers:{'authorization':'Bearer '+key},
    cache:'no-store'
   });

   const d=await r.json();

   if(!r.ok){
    if(r.status===401)sessionStorage.removeItem(SK);
    alert(d.error||'Caricamento clienti non riuscito.');
    return;
   }

   const remote=Array.isArray(d.clients)?d.clients:[];
   const local=clients();
   const remoteCodes=new Set(remote.map(licenseCode));

   for(const c of local){
    const code=licenseCode(c);
    if(code&&!remoteCodes.has(code)){
     const saved=await sync(c);
     if(saved){
      remote.push(c);
      remoteCodes.add(code);
     }
    }
   }

   localStorage.setItem(KEY,JSON.stringify(remote));
   sessionStorage.setItem(LOADED,'1');
   location.reload();
  }catch(e){
   alert('Impossibile caricare i clienti dall’archivio centrale.');
  }
 }

 document.addEventListener('click',e=>{
  const t=e.target.closest('[data-toggle],[data-renew],#generate');
  if(!t)return;

  setTimeout(()=>{
   const list=clients();
   let c=null;

   if(t.id==='generate')c=list[list.length-1];
   else if(t.dataset.toggle!=null)c=list[+t.dataset.toggle];
   else if(t.dataset.renew!=null)c=list[+t.dataset.renew];

   if(c)sync(c);
  },80);
 },true);

 window.BANDOVERA_syncAll=async()=>{
  for(const c of clients())await sync(c);
 };

 loadFromCloud();
})();
<\/script>`;

async function serveHtmlWithInjection(request,env,script){const res=await env.ASSETS.fetch(request);if(!res.ok)return res;const ct=res.headers.get('content-type')||'';if(!ct.includes('text/html'))return res;let text=await res.text();if(!text.includes(script.includes('admin-sync')?'bandovera-admin-sync':'bandovera-license-guard'))text=text.replace('</body>',script+'</body>');const h=new Headers(res.headers);h.delete('content-length');h.set('cache-control','no-store');h.append('set-cookie','bandovera_region=; Path=/; SameSite=Lax; Max-Age=0');return new Response(text,{status:res.status,statusText:res.statusText,headers:h});}

async function filteredMainCatalog(request,env){
 const origin=new URL(request.url).origin;
 const rawReq=new Request(origin+'/radar_bandi_catalogo.json?raw=1',{headers:{'accept':'application/json'}});
 const r=await env.ASSETS.fetch(rawReq);
 if(!r.ok)return r;
 let d;try{d=await r.json()}catch{return json({error:'Catalogo principale non valido'},500)}
 const region=regionFromRequest(request);
 const all=Array.isArray(d.bandi)?d.bandi:[];
 const bandi=all.filter(b=>territoryAllowed(b,region));
 return json({...d,selectedRegion:region||null,bandi});
}

async function mergedExtraCatalog(request,env){
 const origin=new URL(request.url).origin;
 const extraReq=new Request(origin+'/radar_bandi_catalogo_extra.json?raw=1',{headers:{'accept':'application/json'}});
 const autoReq=new Request(origin+'/radar_bandi_auto.json?raw=1',{headers:{'accept':'application/json'}});
 const [r1,r2]=await Promise.all([env.ASSETS.fetch(extraReq),env.ASSETS.fetch(autoReq)]);
 if(!r1.ok)return r1;
 let d1={bandi:[]},d2={bandi:[]};
 try{d1=await r1.json()}catch{return json({error:'Catalogo extra non valido'},500)}
 if(r2.ok){try{d2=await r2.json()}catch{d2={bandi:[]}}}
 const region=regionFromRequest(request);
 const isLombardia=normTerritory(region)==='lombardia';
 const staticExtra=Array.isArray(d1.bandi)?d1.bandi:[];
 const automatic=Array.isArray(d2.bandi)?d2.bandi:[];
 const sourceItems=isLombardia?staticExtra:[...staticExtra,...automatic];
 const map=new Map();
 for(const b of sourceItems){
  const key=String(b?.sourceUrl||b?.id||'').replace(/\/$/,'');
  if(key)map.set(key,b);
 }
 const bandi=[...map.values()].filter(b=>territoryAllowed(b,region));
 return json({...d1,updatedAt:isLombardia?(d1.updatedAt||null):(d2.updatedAt||d1.updatedAt||null),automatic:!isLombardia,automaticSources:isLombardia?[]:(d2.sourcesChecked||[]),automaticErrors:isLombardia?[]:(d2.errors||[]),selectedRegion:region||null,bandi});
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/license/')){
   const code=normalizeCode(decodeURIComponent(url.pathname.slice('/api/license/'.length)));
   if(!code)return json({error:'Codice licenza mancante'},400);
   const vts=versionTimestamp(env);
   if(!env.LICENSES)return json({configured:false,registered:false,active:true,versionTimestamp:vts});
   const rec=await env.LICENSES.get('license:'+code,{type:'json'});
   if(!rec)return json({configured:true,registered:false,active:true,license:code,versionTimestamp:vts});
   const expired=isExpired(rec.expiresAt);
   return json({configured:true,registered:true,license:code,active:rec.active!==false&&!expired,expired,expiresAt:rec.expiresAt||null,versionTimestamp:vts});
  } if(url.pathname==='/api/admin/licenses'&&request.method==='GET'){
   if(!env.LICENSES)return json({error:'Archivio KV LICENSES non configurato'},503);
   if(!authOk(request,env))return json({error:'Chiave amministratore non valida'},401);

   const records=[];
   let cursor;

   do{
     const page=await env.LICENSES.list(
         cursor
            ? {prefix:'license:',cursor,limit:1000}
            : {prefix:'license:',limit:1000}
      );

      for(const key of page.keys){
         const raw=await env.LICENSES.get(key.name);
let rec=null;
if(raw){
 try{rec=JSON.parse(raw)}
 catch(e){console.warn('Record KV non valido ignorato:',key.name)}
}
         if(rec){
            records.push({
               ...(rec.profile||{}),
               license:rec.license||key.name.replace('license:',''),
               name:rec.name||rec.profile?.name||'',
               active:rec.active!==false,
               expiresAt:rec.expiresAt||'',
               price:Number(rec.price)||0
            });
         }
      }

      cursor=page.list_complete?undefined:page.cursor;
   }while(cursor);

   records.sort((a,b)=>
   String(a.license||'').localeCompare(
      String(b.license||''),
      'it',
      {numeric:true}
   )
);
   return json({ok:true,clients:records});
  }
  if(url.pathname==='/api/admin/license'&&request.method==='POST'){
   if(!env.LICENSES)return json({error:'Archivio KV LICENSES non configurato'},503);
   if(!authOk(request,env))return json({error:'Chiave amministratore non valida'},401);
   let body;try{body=await request.json()}catch{return json({error:'JSON non valido'},400)}
   const code=normalizeCode(body.license);if(!code)return json({error:'Codice licenza mancante'},400);
   const previous=await env.LICENSES.get('license:'+code,{type:'json'});
   const base={license:code,name:String(body.name||previous?.name||''),active:body.active!==false,expiresAt:String(body.expiresAt||previous?.expiresAt||''),price:Number(body.price??previous?.price)||0,updatedAt:new Date().toISOString()};
   const suppliedProfile=body.profile&&typeof body.profile==='object'?body.profile:null;
   const profile=cleanProfile(suppliedProfile,code,base)||previous?.profile||null;
   const rec={...base,profile};
   await env.LICENSES.put('license:'+code,JSON.stringify(rec));
   return json({ok:true,license:code,active:rec.active,expiresAt:rec.expiresAt,shortUrl:new URL('/'+code,url.origin).toString(),profileStored:!!profile});
  }
  if(url.pathname==='/api/admin/sync-status'){
   return json({configured:!!env.LICENSES,adminSecret:!!env.ADMIN_API_KEY,versionTimestamp:versionTimestamp(env)});
  }
  const shortMatch=url.pathname.match(/^\/(?:r\/)?(RB-\d{4,})\/?$/i);
  if(shortMatch){
   const code=normalizeCode(shortMatch[1]);
   if(!env.LICENSES)return shortLinkError(code,'Archivio licenze non configurato.',503);
   const rec=await env.LICENSES.get('license:'+code,{type:'json'});
   if(!rec)return shortLinkError(code,'Licenza non registrata.');
   if(!rec.profile)return shortLinkError(code,'Il profilo cliente deve essere sincronizzato dalla Dashboard Admin prima di usare il link corto.',409);
   const profile=cleanProfile(rec.profile,code,rec);
   const target=new URL('/',url.origin);target.searchParams.set('p',encodeProfile(profile));
   return Response.redirect(target.toString(),302);
  }
  if(url.pathname==='/radar_bandi_catalogo.json'&&!url.searchParams.has('raw'))return filteredMainCatalog(request,env);
  if(url.pathname==='/radar_bandi_catalogo_extra.json'&&!url.searchParams.has('raw'))return mergedExtraCatalog(request,env);
  if(url.pathname.startsWith('/admin'))return serveHtmlWithInjection(request,env,adminSync);
  if(url.pathname==='/'||url.pathname==='/index.html')return serveHtmlWithInjection(request,env,clientGuard);
  return env.ASSETS.fetch(request);
 }
};
