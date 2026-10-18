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


// The guide needs byte-range responses so browsers can seek without replaying it.
export async function serveGuideVideo(request,env){
 const sourceHeaders=new Headers(request.headers);
 for(const name of ['range','if-range','if-none-match','if-modified-since'])sourceHeaders.delete(name);
 sourceHeaders.set('accept-encoding','identity');
 const asset=await env.ASSETS.fetch(new Request(request.url,{method:'GET',headers:sourceHeaders}));
 if(asset.status!==200)return asset;
 const bytes=await asset.arrayBuffer(),size=bytes.byteLength,headers=new Headers(asset.headers);
 headers.delete('content-encoding');headers.set('accept-ranges','bytes');headers.set('content-length',String(size));
 const full=()=>new Response(request.method==='HEAD'?null:bytes,{status:200,headers});
 const range=request.headers.get('range'),ifRange=request.headers.get('if-range');
 if(request.method==='HEAD'||!range||(ifRange&&ifRange!==headers.get('etag')&&ifRange!==headers.get('last-modified')))return full();
 const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
 const invalid=()=>{headers.set('content-range','bytes */'+size);headers.set('content-length','0');return new Response(null,{status:416,headers})};
 if(!match||(!match[1]&&!match[2])||!size)return invalid();
 let start,end;
 if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();start=Math.max(0,size-suffix);end=size-1}
 else{start=Number(match[1]);end=match[2]?Number(match[2]):size-1}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return invalid();
 end=Math.min(end,size-1);headers.set('content-range','bytes '+start+'-'+end+'/'+size);headers.set('content-length',String(end-start+1));
 return new Response(bytes.slice(start,end+1),{status:206,headers});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if((request.method==='GET'||request.method==='HEAD')&&url.pathname==='/media/bandovera-guida-sara-v6.mp4')return serveGuideVideo(request,env);
    const accept=request.headers.get("accept")||"";
    if(request.method==="GET"&&(url.pathname==="/"||accept.includes("text/html")))return dashboard(request,env,ctx);
    return app.fetch(request,env,ctx);
  }
};
