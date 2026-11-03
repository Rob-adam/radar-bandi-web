// Only the site's own draft is removed. Browser autofill/password settings are untouched.
(()=>{
  if(!['https://bandovera.it','https://www.bandovera.it'].includes(location.origin))return;
  const form=document.getElementById('scheda');if(!form)return;
  const draftKey='bandovera.scheda2',checkoutKey='bandovera_checkout_live_v1',noticeKey='bandovera_draft_cleared';
  const message=document.createElement('p');message.className='nota';message.setAttribute('role','status');message.setAttribute('aria-live','polite');form.before(message);
  const clear=document.createElement('button');clear.type='button';clear.className='btn';clear.textContent='Svuota la scheda';
  clear.setAttribute('style','display:block;width:100%;max-width:360px;min-height:50px;margin:0 0 24px;padding:14px 20px;border:2px solid #34d5ed;border-radius:12px;background:#102438;color:#fff;font-size:17px;font-weight:800;line-height:1.35;cursor:pointer');
  form.prepend(clear);
  let edited=false,checking=false;
  form.addEventListener('input',()=>{edited=true;});form.addEventListener('change',()=>{edited=true;});
  try{const notice=sessionStorage.getItem(noticeKey);if(notice){message.textContent=notice==='paid'?'Pagamento confermato: la scheda salvata in questo browser è stata cancellata. Conserva l’email con la tua licenza.':'La scheda salvata in questo browser è stata cancellata.';sessionStorage.removeItem(noticeKey);}}catch{}
  function wipe(reason){
    try{
      localStorage.removeItem(draftKey);sessionStorage.removeItem(checkoutKey);
      if(localStorage.getItem(draftKey)!==null||sessionStorage.getItem(checkoutKey)!==null)throw Error();
      sessionStorage.setItem(noticeKey,reason);form.reset();
      // Reload also discards the old summary, copied sheet and pending callbacks.
      location.replace(location.origin+'/attiva.html');
    }catch{message.textContent='Il browser non ha consentito di svuotare la scheda. Non sono stati modificati pagamenti o licenze.';}
  }
  clear.addEventListener('click',()=>{
    if(confirm('Svuotare la scheda e la bozza salvata in questo browser? Non annulla eventuali pagamenti già avviati.'))wipe('manual');
  });
  async function checkDraft(attempt=0){
    if(edited||checking)return;
    checking=true;
    try{
      const raw=localStorage.getItem(draftKey),reference=sessionStorage.getItem(checkoutKey);
      if(!raw||!reference)return;
      const saved=JSON.parse(reference),sheet=JSON.parse(raw);
      if(!/^[a-f0-9]{32}$/.test(saved?.id)||!sheet||Array.isArray(sheet)||typeof sheet!=='object')return;
      const normalized=Object.create(null);for(const [k,v]of Object.entries(sheet)){if(typeof v!=='string')return;normalized[k]=v.trim();}
      normalized.cf=(normalized.cf||'').replace(/\s/g,'').toUpperCase();normalized.partita_iva=(normalized.partita_iva||'').replace(/\s/g,'');
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(normalized).sort()))));
      const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      const response=await fetch('https://radar-bandi-online.presidente-56d.workers.dev/api/checkout/live/draft-status',{
        method:'POST',credentials:'omit',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({id:saved.id,digest})
      });
      if(!response.ok)return;
      const result=await response.json();
      // Never erase a different/new draft or edits made while the check ran.
      if(edited||localStorage.getItem(draftKey)!==raw||sessionStorage.getItem(checkoutKey)!==reference)return;
      if(result.paid===true){wipe('paid');return;}
      if(new URLSearchParams(location.search).get('pagamento')==='verifica'&&attempt<5)setTimeout(()=>checkDraft(attempt+1),2000);
    }catch{/* Offline/pending/blocked storage: keep the draft and allow retry. */}
    finally{checking=false;}
  }
  window.addEventListener('pageshow',()=>checkDraft());
  return checkDraft();
})();
