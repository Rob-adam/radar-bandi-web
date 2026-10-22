// Fixed public listings only. No caller-provided URLs, credentials or write actions.
const SOURCES={
 basilicata:'https://portalebandi.regione.basilicata.it/',
 liguria:'https://www.regione.liguria.it/component/publiccompetitions/category/3-contributi.html',
 'gaslini-regolamento':'https://www.regione.liguria.it/components/com_publiccompetitions/includes/download.php?id=80856:dgr-399-2026.pdf'
};
export async function officialListing(request,options={}){
 const url=new URL(request.url);
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const source=url.searchParams.get('source');
 const page=Number(url.searchParams.get('page')||1);
 const detail=url.searchParams.get('detail');
 if(!Object.hasOwn(SOURCES,source)||!Number.isInteger(page)||page<1||page>100||(source!=='basilicata'&&page!==1))return new Response('Invalid public listing',{status:400});
 const detailAllowed=source==='basilicata'&&/^\/avvisi-e-bandi\/[a-z0-9-]+\/$/.test(detail)||source==='liguria'&&/^\/component\/publiccompetitions\/publiccompetition\/\d+:[a-z0-9-]+\.html$/.test(detail);
 if(detail&&(page!==1||!detailAllowed))return new Response('Invalid public grant detail',{status:400});
 const target=detail?new URL(detail,SOURCES[source]).href:SOURCES[source];
 const cache=options.cache||(typeof caches!=='undefined'?caches.default:null);
 const key=new Request(url.origin+'/api/official-listing?source='+source+'&page='+page+(detail?'&detail='+encodeURIComponent(detail):''));
 const cached=cache?await cache.match(key):null;
 if(cached)return cached;
 const headers={'User-Agent':'BANDOVERA/1.6 (monitoraggio fonti ufficiali pubbliche)'};
 let init={method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(25000)};
 if(page>1){
  // Public read-only scroll handler observed on the official Basilicata listing.
  const data=new URLSearchParams({action:'jet_engine_ajax',handler:'listing_load_more',
   'query[query_id]':'26','page_settings[post_id]':'77','page_settings[queried_id]':'77|WP_Post',
   'page_settings[page]':String(page),isEditMode:'false','widget_settings[lisitng_id]':'71',
   'widget_settings[posts_num]':'10','widget_settings[columns]':'1','widget_settings[custom_query]':'yes',
   'widget_settings[custom_query_id]':'26','widget_settings[_element_id]':'in-scadenza'});
  init={...init,method:'POST',body:data};
 }
 try{
  const upstream=await(options.fetch||fetch)(target,init);
  if(!upstream.ok)return new Response('Official source unavailable',{status:upstream.status>=300&&upstream.status<400?502:upstream.status,headers:{'Cache-Control':'no-store'}});
  const body=await upstream.arrayBuffer();
  if(body.byteLength>2000000)return new Response('Official listing too large',{status:502});
  const response=new Response(body,{headers:{'Content-Type':upstream.headers.get('Content-Type')||'text/html; charset=utf-8',
   'Cache-Control':'public, max-age=900','X-Content-Type-Options':'nosniff',
   'Content-Security-Policy':"default-src 'none'; sandbox",'X-Bandovera-Official-Source':target}});
  if(cache)await cache.put(key,response.clone());
  return response;
 }catch{return new Response('Official source unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
}
