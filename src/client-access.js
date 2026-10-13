export async function accessHash(value){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function accessToken(request,code){
 const url=new URL(request.url);
 const supplied=request.headers.get('x-bandovera-access')||url.searchParams.get('access');
 if(supplied)return supplied;
 const key='bandovera_access_'+String(code).replace(/[^A-Z0-9]/gi,'');
 const cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(key+'='));
 return cookie?decodeURIComponent(cookie.slice(key.length+1)):'';
}
export async function hasAccess(request,code,rec){
 // Existing non-migrated licenses keep their established delivery flow.
 // RB-0003 is fail-closed even before the access-key migration has finished.
 if(!rec?.accessTokenHash)return code!=='RB-0003';
 const token=accessToken(request,code);
 return !!token&&token.length>=32&&(await accessHash(token))===rec.accessTokenHash;
}
export function accessCookie(code,token){
 return 'bandovera_access_'+code.replace(/[^A-Z0-9]/gi,'')+'='+encodeURIComponent(token)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800';
}
