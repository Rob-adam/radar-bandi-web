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
  const summary=document.getElementById('riepilogo');
  if(!form||!summary||document.querySelector('[data-bv-stripe-test]'))return;
  const button=document.createElement('button');
  button.type='button';
  button.dataset.bvStripeTest='true';
  button.textContent='Paga ora · 19,90 € (solo prova)';
  const status=document.createElement('p');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.textContent='Pagamento esclusivamente di prova, senza addebito reale.';
  const box=document.createElement('section');
  box.setAttribute('aria-label','Pagamento Stripe di prova');
  box.append(button,status);
  summary.append(box);
  // Multiple attempts reuse the same id for the same page session.
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  button.addEventListener('click',async()=>{
    if(!form.reportValidity())return;
    const sheet=Object.create(null);
    // Match the commercial onboarding add-on: only successful form controls.
    // Repeated values are not combined into fabricated single-choice values.
    new FormData(form).forEach((value,name)=>{
      if(!/^[a-z][a-z0-9_]{0,63}$/.test(name)||typeof value!=='string')return;
      if(Object.hasOwn(sheet,name))return;
      sheet[name]=value.trim();
    });
    const required=['nome_associazione','cf','tipo_ente','runts','regione','settore_principale','finalita_statutarie','capacita_progetti','referente','email_referente','ack_completezza','luogo_data','compilatore','privacy'];
    if(required.some(name=>!sheet[name])||sheet.privacy!=='Sì'||sheet.ack_completezza!=='Sì'){
      status.textContent='Completa la scheda e conferma privacy e completezza prima di procedere.';
      return;
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
