// Load after the current site's scripts. Disabled unless explicitly configured.
(()=>{
  const cfg=window.BANDOVERA_STRIPE_LIVE;
  if(cfg?.enabled!==true||!['https://bandovera.it','https://www.bandovera.it'].includes(location.origin))return;
  const form=document.querySelector('form#scheda'),summary=document.getElementById('riepilogo');
  if(!form||!summary||document.querySelector('[data-bv-stripe-live]'))return;
  const endpoint='https://radar-bandi-online.presidente-56d.workers.dev/api/checkout/live/create';
  const section=document.createElement('section');section.dataset.bvStripeLive='true';
  const button=document.createElement('button');button.type='button';button.textContent='Paga con Stripe · 19,90 €';
  const message=document.createElement('p');message.setAttribute('role','status');
  message.textContent='Licenza per 12 mesi. Pagamento unico, senza rinnovo automatico. Dopo la conferma riceverai il tuo accesso via email.';
  const captcha=document.createElement('div');section.append(message,captcha,button);summary.append(section);
  let token='',widget;
  const storageKey='bandovera_checkout_live_v1';
  button.addEventListener('click',async()=>{
    if(!form.reportValidity())return;
    const sheet=Object.create(null);
    new FormData(form).forEach((value,name)=>{
      if(typeof value==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(name)&&!Object.hasOwn(sheet,name))sheet[name]=value.trim();
    });
    // Persist only a hash and reference, never the customer's sheet or credentials.
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(sheet).sort()))));
    const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey));}catch{}
    const id=saved?.digest===digest&&/^[a-f0-9]{32}$/.test(saved.id)?saved.id:crypto.randomUUID().replace(/-/g,'');
    sessionStorage.setItem(storageKey,JSON.stringify({digest,id}));
    if(!token){
      if(!window.turnstile){message.textContent='Verifica di sicurezza in caricamento. Riprova tra un momento.';return;}
      if(widget===undefined)widget=window.turnstile.render(captcha,{sitekey:cfg.sitekey,action:'bandovera_checkout',
        callback:value=>{token=value;message.textContent='Verifica completata. Premi Paga con Stripe per continuare.';},
        'expired-callback':()=>{token='';},'error-callback':()=>{token='';message.textContent='Ripeti la verifica di sicurezza.';}});
      else window.turnstile.reset(widget);
      return;
    }
    button.disabled=true;message.textContent='Preparazione del pagamento…';
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({id,sheet,turnstileToken:token})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Pagamento non disponibile');
      const url=new URL(result.checkoutUrl);if(url.origin!=='https://checkout.stripe.com')throw Error('Destinazione non valida');
      location.assign(url.href);
    }catch(e){message.textContent=(e.message||'Pagamento non disponibile')+' Riferimento: '+id;token='';if(widget!==undefined)window.turnstile.reset(widget);button.disabled=false;}
  });
})();
