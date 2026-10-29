/* Optional add-on to the CURRENT published form. No replacement of logo/video/payment files. */
(()=>{
 const config=window.BANDOVERA_REQUESTS;
 if(!config?.enabled||config.endpoint!=='https://radar-bandi-online.presidente-56d.workers.dev/api/requests'||!config.siteKey)return;
 const form=document.getElementById('scheda'),summary=document.getElementById('riepilogo');if(!form||!summary)return;
 const box=document.createElement('section');box.setAttribute('aria-label','Invio della scheda a Bandovera');
 const note=document.createElement('p');note.textContent='Invia la scheda completa a Bandovera per richiedere l’abbonamento di 19,90 € per 12 mesi. Riceverai le istruzioni di bonifico via email. Nessuna licenza si attiva prima della verifica dell’accredito da parte di Roberto. Restano disponibili i canali manuali.';
 const widget=document.createElement('div'),button=document.createElement('button'),status=document.createElement('p');
 button.type='button';button.className='btn';button.textContent='Invia la scheda a Bandovera';button.disabled=true;status.setAttribute('role','status');
 box.append(note,widget,button,status);summary.append(box);let widgetId=null,token='',busy=false;
 function mount(){if(widgetId!==null||summary.hidden||!window.turnstile)return;widgetId=window.turnstile.render(widget,{sitekey:config.siteKey,action:'bandovera_request',callback:t=>{token=t;button.disabled=false;},'expired-callback':()=>{token='';button.disabled=true;},'error-callback':()=>{status.textContent='Verifica antispam non disponibile. Puoi usare email o Messenger.';}});}
 new MutationObserver(mount).observe(summary,{attributes:true,attributeFilter:['hidden']});
 // Widget and third-party script load only on this explicitly enabled form integration.
 window.bandoveraRequestsReady=mount;const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=bandoveraRequestsReady&render=explicit';script.async=true;document.head.append(script);
 button.onclick=async()=>{
  if(busy||!token)return;busy=true;button.disabled=true;status.textContent='Invio in corso…';
  const sheet=Object.create(null);new FormData(form).forEach((v,k)=>{sheet[k]=String(v).trim();});
  try{
   const response=await fetch(config.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sheet,challenge:token}),signal:AbortSignal.timeout(45000)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Invio non riuscito');
   status.textContent=result.message;button.textContent='Richiesta acquisita';
  }catch(e){status.textContent='Invio non confermato: '+e.message+'. Verifica con info@bandovera.it o usa i canali manuali; un nuovo tentativo non crea una seconda richiesta per lo stesso ente.';busy=false;token='';if(widgetId!==null)window.turnstile.reset(widgetId);}
 };
})();
