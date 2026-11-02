// Load after the current site's scripts. Disabled unless explicitly configured.
(()=>{
  const cfg=window.BANDOVERA_STRIPE_LIVE;
  if(cfg?.enabled!==true||!['https://bandovera.it','https://www.bandovera.it'].includes(location.origin))return;
  const form=document.querySelector('form#scheda'),summary=document.getElementById('riepilogo');
  if(!form||!summary||document.querySelector('[data-bv-stripe-live]'))return;
  const endpoint='https://radar-bandi-online.presidente-56d.workers.dev/api/checkout/live/create';
  const section=document.createElement('section');section.dataset.bvStripeLive='true';
  const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Paga con Stripe · 19,90 €';
  const message=document.createElement('p');message.setAttribute('role','status');
  message.setAttribute('aria-live','polite');
  message.setAttribute('style','padding:16px;border:2px solid #24d0e5;border-radius:12px;background:#102438;color:#fff;font-size:18px;font-weight:700;line-height:1.5');
  message.textContent='Premi Paga con Stripe: dopo la verifica di sicurezza si aprirà automaticamente la pagina per inserire la carta. 19,90 € per 12 mesi, senza rinnovo automatico.';
  const captcha=document.createElement('div');section.append(message,captcha,button);summary.append(section);
  let token='',widget,working=false,awaitingVerification=false;
  const storageKey='bandovera_checkout_live_v1';
  const idleText=button.textContent;
  function reset(messageText){
    token='';working=false;awaitingVerification=false;button.disabled=false;button.textContent=idleText;message.textContent=messageText;
  }
  async function startCheckout(){
    if(working||!form.reportValidity())return;
    working=true;button.disabled=true;
    let id;
    try{
    const sheet=Object.create(null);
    new FormData(form).forEach((value,name)=>{
      if(typeof value==='string'&&/^[a-z][a-z0-9_]{0,63}$/.test(name)&&!Object.hasOwn(sheet,name))sheet[name]=value.trim();
    });
    // Persist only a hash and reference, never the customer's sheet or credentials.
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.entries(sheet).sort()))));
    const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey));}catch{}
    id=saved?.digest===digest&&/^[a-f0-9]{32}$/.test(saved.id)?saved.id:crypto.randomUUID().replace(/-/g,'');
    try{sessionStorage.setItem(storageKey,JSON.stringify({digest,id}));}
    catch{reset('Per procedere al pagamento consenti la memoria del sito nel browser, poi riprova.');return;}
    if(!token){
      if(!window.turnstile){reset('Verifica di sicurezza in caricamento. Riprova tra un momento.');return;}
      awaitingVerification=true;button.textContent='Apertura del pagamento…';
      message.textContent='Apertura del pagamento… Tra poco potrai inserire i dati della carta nella pagina sicura Stripe.';
      if(widget===undefined)widget=window.turnstile.render(captcha,{sitekey:cfg.sitekey,action:'bandovera_checkout',appearance:'interaction-only',
        'before-interactive-callback':()=>{if(awaitingVerification)message.textContent='Per proseguire, completa la verifica di sicurezza qui sotto. Poi apriremo Stripe automaticamente.';},
        'after-interactive-callback':()=>{if(awaitingVerification)message.textContent='Apertura del pagamento…';},
        callback:value=>{
          if(!awaitingVerification)return;
          if(summary.hidden){reset('Hai riaperto la scheda. Controlla il riepilogo prima di proseguire.');return;}
          token=value;awaitingVerification=false;working=false;
          return startCheckout();
        },
        'expired-callback':()=>{if(awaitingVerification)reset('Verifica scaduta. Premi Paga con Stripe per riprovare.');},
        'error-callback':()=>{if(awaitingVerification)reset('Verifica non riuscita. Premi Paga con Stripe per riprovare.');}});
      else window.turnstile.reset(widget);
      return;
    }
    button.textContent='Apertura Stripe…';
    message.textContent='Apertura della pagina sicura Stripe per inserire la carta. Non è ancora stato effettuato alcun addebito.';
      const response=await fetch(endpoint,{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({id,sheet,turnstileToken:token})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Pagamento non disponibile');
      const url=new URL(result.checkoutUrl);if(url.origin!=='https://checkout.stripe.com')throw Error('Destinazione non valida');
      location.assign(url.href);
    }catch(e){reset((e.message||'Pagamento non disponibile')+(id?' Riferimento: '+id:''));if(widget!==undefined)window.turnstile.reset(widget);}
  }
  button.addEventListener('click',startCheckout);
})();
