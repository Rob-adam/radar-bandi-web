/**
 * BANDOVERA — optional Stripe checkout add-on for the EXISTING full request form.
 * Sandbox only. Load after the live form's own scripts on an isolated test copy.
 * This script never sends private data to a third-party origin.
 *
 * Requirements: existing form#scheda with names matching the commercial PDF;
 * checkout endpoint at SAME origin using the Stripe test worker,
 * and full schema validation server-side. Leave existing manual channels intact.
 */
(()=>{
  const cfg=window.BANDOVERA_STRIPE_TEST;
  if(!cfg||cfg.enabled!==true||location.origin!==cfg.origin)return;
  const form=document.querySelector('form#scheda');
  if(!form||form.querySelector('[data-bv-stripe-test]'))return;
  const button=document.createElement('button');
  button.type='button';
  button.dataset.bvStripeTest='true';
  button.textContent='Paga ora · 19,90 € (solo prova)';
  const status=document.createElement('p');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.textContent='Pagamento esclusivamente di prova, senza addebito reale.';
  button.insertAdjacentElement ? form.append(button,status) : form.appendChild(button);
  // Multiple attempts reuse the same id for the same page session.
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  button.addEventListener('click',async()=>{
    if(!form.reportValidity())return;
    const sheet=Object.create(null);
    for(const [name,value] of new FormData(form).entries()){
      if(!/^[a-z][a-z0-9_]{0,63}$/.test(name))continue;
      if(typeof value!=='string')continue;
      // The original form field names and selections remain unchanged.
      sheet[name]=sheet[name] ? sheet[name]+'; '+value : value;
    }
    button.disabled=true;
    status.textContent='Preparazione del pagamento di prova...';
    try{
      const response=await fetch('/api/checkout/create',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({id,sheet})
      });
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Pagamento non disponibile');
      const url=new URL(result.checkoutUrl);
      if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error('Destinazione di pagamento non valida');
      location.assign(url.href);
    }catch(e){
      status.textContent=e.message||'Impossibile preparare il pagamento di prova';
      button.disabled=false;
    }
  });
})();
