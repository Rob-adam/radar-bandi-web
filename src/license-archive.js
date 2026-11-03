// Reversible removal: keep the complete record in place, disable access and
// exclude it from the normal list. No license code or credential is recycled.
export async function routeLicenseArchive(request,env,{authOk,json}) {
  const url=new URL(request.url);
  if(!['/api/admin/license/archive','/api/admin/license/restore'].includes(url.pathname))return null;
  if(!authOk(request,env))return json({error:'Chiave amministratore non valida'},401);
  if(request.method!=='POST')return json({error:'Metodo non consentito'},405);
  if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Richiesta non valida'},403);
  if(!env.LICENSES)return json({error:'Archivio licenze non disponibile'},503);
  let body;try{body=await request.json()}catch{return json({error:'JSON non valido'},400)}
  const code=body?.license;
  if(typeof code!=='string'||!/^RB-\d{4,}$/.test(code))return json({error:'Codice licenza non valido'},400);
  const key='license:'+code,record=await env.LICENSES.get(key,{type:'json'});
  if(!record)return json({error:'Licenza non trovata'},404);
  const restore=url.pathname.endsWith('/restore');
  if(restore?!record.archivedAt:!!record.archivedAt)return json({ok:true,license:code,archived:!restore});
  const next={...record,updatedAt:new Date().toISOString()};
  if(restore){next.active=record.activeBeforeArchive!==false;delete next.archivedAt;delete next.activeBeforeArchive;}
  else {next.archivedAt=next.updatedAt;next.activeBeforeArchive=record.active!==false;next.active=false;}
  await env.LICENSES.put(key,JSON.stringify(next));
  return json({ok:true,license:code,archived:!restore});
}
