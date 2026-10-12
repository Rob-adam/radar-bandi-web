import app from "./territory-wrapper.js";

function decodeProfile(request){
  try{
    const raw=new URL(request.url).searchParams.get("p");
    if(!raw)return null;
    const b64=(raw+"=".repeat((4-raw.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");
    const bin=atob(b64);
    const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch{return null}
}

function esc(v){
  return String(v||"").replace(/[&<>\"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}

async function dashboard(request,env,ctx){
  const response=await app.fetch(request,env,ctx);
  if(!response.ok)return response;
  const type=response.headers.get("content-type")||"";
  if(!type.includes("text/html"))return response;

  const p=decodeProfile(request);
  if(!p)return response;

  const typeLabel=p.type||"ETS";
  const region=p.region||"";
  const operating=p.operatingTerritory||p.territoryScope||"";
  let summary=typeLabel;
  if(region)summary+=` · Sede: ${region}`;
  if(operating)summary+=` · Operatività: ${operating}`;

  let html=await response.text();
  const marker='<div class="small" id="subtitle"></div>';
  const block=`<div class="small" id="subtitle">${esc(summary)}</div>`;
  if(html.includes(marker))html=html.replace(marker,block);
  else html=html.replace('</h1>',`</h1><div id="territorySummary" style="margin-top:6px;font-size:12px;color:#9ed8ff;font-weight:700">${esc(summary)}</div>`);

  const headers=new Headers(response.headers);
  headers.set("content-type","text/html; charset=utf-8");
  headers.set("cache-control","no-store, no-cache, must-revalidate");
  headers.set("pragma","no-cache");
  headers.delete("content-length");
  return new Response(html,{status:response.status,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const accept=request.headers.get("accept")||"";
    if(request.method==="GET"&&(url.pathname==="/"||accept.includes("text/html")))return dashboard(request,env,ctx);
    return app.fetch(request,env,ctx);
  }
};
